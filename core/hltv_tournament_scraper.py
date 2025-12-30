import re
import datetime
from urllib.parse import urljoin

import undetected_chromedriver as uc
from bs4 import BeautifulSoup
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from django.db import transaction  # можно оставить, даже если не используем

from .models import Player, Team, Tournament, PlayerHLTVStats, TournamentTeam, League
from .hltv_player_scraper import HLTVPlayerScraper


HLTV_BASE = "https://www.hltv.org"


def _extract_id_from_href(href: str, kind: str):
    """
    kind: 'player' или 'team' или 'events'
    Примеры:
      /player/15631/kscerato   -> 15631
      /team/7441/eclot         -> 7441
      /events/8847/tipsport.   -> 8847
    """
    pattern = rf"/{kind}/(\d+)"
    m = re.search(pattern, href)
    if m:
        return int(m.group(1))
    return None


class HLTVTournamentScraper:
    """
    Цепочка:
      tournament_url -> команды из блока 'Teams attending'
                      -> по 5 игроков из .lineup-box
                      -> HLTV статы игроков.

    ВАЖНО:
      Флаг команды (Team.region_code / region_name) БЕРЁМ ТОЛЬКО со страницы команды:
        https://www.hltv.org/team/<id>/<name>
      Потому что на event-странице внутри team-box смешаны элементы, и легко словить флаги игроков.
    """

    def __init__(self, headless: bool = True):
        chrome_options = Options()
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("--disable-popup-blocking")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")

        if headless:
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--window-size=1920,1080")

        self.driver = uc.Chrome(options=chrome_options)
        self.player_scraper = HLTVPlayerScraper(headless=headless)

        self._last_teams_data = []

        # кеш, чтобы не дергать страницу команды повторно
        self._team_flag_cache: dict[str, tuple[str | None, str | None]] = {}

    # ----------------------------------------------------------

    def close(self):
        try:
            self.driver.quit()
        except Exception:
            pass
        try:
            self.player_scraper.close()
        except Exception:
            pass

    # ----------------------------------------------------------

    def _accept_cookies_if_needed(self):
        """HLTV кидает Cookiebot. Пытаемся нажать кнопку, если есть."""
        try:
            btn = WebDriverWait(self.driver, 5).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//button[contains(@class,'CybotCookiebotDialogBodyButton')]")
                )
            )
            btn.click()
            print("[COOKIE] Cookie dialog closed")
        except Exception:
            pass

    # ----------------------------------------------------------
    # TEAM PAGE FLAG (ОБЯЗАТЕЛЬНО)
    # ----------------------------------------------------------

    def _parse_flag_from_img(self, img) -> tuple[str | None, str | None]:
        if not img:
            return None, None

        name = (img.get("title") or img.get("alt") or "").strip() or None
        src = (img.get("src") or "").strip()

        # Пример HLTV:
        # /img/static/flags/30x20/WORLD.gif
        # /img/static/flags/30x20/EU.gif
        # /img/static/flags/30x20/ASEAN.gif
        m_flag = re.search(r"/([A-Za-z0-9]{2,12})\.(?:gif|png|svg)\b", src)
        code = m_flag.group(1).upper() if m_flag else None
        return code, name

    def _fetch_team_flag_from_team_page(self, team_url: str) -> tuple[str | None, str | None]:
        """
        Всегда ходим на страницу команды и берём флаг оттуда.

        Пример:
          view-source:https://www.hltv.org/team/5973/liquid
          <img alt="Other" src="/img/static/flags/30x20/WORLD.gif" class="flag flag" title="Other">
        """
        if not team_url:
            return None, None

        if team_url in self._team_flag_cache:
            return self._team_flag_cache[team_url]

        code, name = None, None

        try:
            self.driver.get(team_url)
            self._accept_cookies_if_needed()

            # ждём загрузку профиля команды
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.teamProfile"))
            )

            html = self.driver.page_source
            soup = BeautifulSoup(html, "html.parser")

            # 1) самый точный вариант: флаг рядом со страной/регионом команды
            img = (
                soup.select_one("div.teamProfile div.team-country img.flag")
                or soup.select_one("div.teamProfile .team-country img.flag")
            )

            # 2) фолбэк: первый img.flag в teamProfile (на team page флаг почти всегда один и относится к команде)
            if not img:
                img = soup.select_one("div.teamProfile img.flag")

            # 3) последний фолбэк: просто первый img.flag на странице
            if not img:
                img = soup.select_one("img.flag")

            code, name = self._parse_flag_from_img(img)

        except Exception:
            code, name = None, None

        self._team_flag_cache[team_url] = (code, name)
        return code, name

    # ----------------------------------------------------------
    # EVENT LINEUPS (без флага команды)
    # ----------------------------------------------------------

    def _parse_event_lineups(self, html: str):
        """
        Возвращаем список:
        [
          {
            "name": "Liquid",
            "url": "https://www.hltv.org/team/5973/liquid",
            "players": [...],
            "world_rank": 12,
          },
        ]

        Флаг команды здесь НЕ трогаем — берём только с team page.
        """
        soup = BeautifulSoup(html, "html.parser")

        container = soup.select_one("div.teams-attending.grid")
        if not container:
            print("[TOURNAMENT] Не найден блок .teams-attending.grid")
            return []

        teams_data = []

        team_boxes = container.select("div.team-box")
        print(f"[DEBUG] Найдено team-box: {len(team_boxes)}")

        for box in team_boxes:
            team_link = box.select_one(".team-name a[href*='/team/']")
            if not team_link:
                continue

            href = team_link.get("href") or ""
            team_url = href if href.startswith("http") else urljoin(HLTV_BASE, href)

            name_el = team_link.select_one(".text") or team_link
            raw_name = name_el.get_text(strip=True)
            team_name = raw_name.split("#", 1)[0].strip()

            # world rank
            world_rank = None
            rank_div = box.select_one("div.event-world-rank")
            if rank_div:
                rank_text = rank_div.get_text(strip=True)
                m = re.search(r"\d+", rank_text)
                if m:
                    try:
                        world_rank = int(m.group(0))
                    except ValueError:
                        world_rank = None

            # игроки
            lineup_box = box.select_one(".lineup-box")
            if not lineup_box:
                print(f"[DEBUG] У команды {team_name} нет .lineup-box")
                continue

            players = []
            for a in lineup_box.select("a[href*='/player/']"):
                p_href = a.get("href") or ""
                nickname = a.get_text(strip=True)
                if not nickname:
                    continue

                stats_path = p_href.replace("/player/", "/stats/players/")
                stats_url = urljoin(HLTV_BASE, stats_path)

                players.append({"nickname": nickname, "stats_url": stats_url})

            if not players:
                print(f"[DEBUG] У команды {team_name} не найдено игроков в lineup-box")
                continue

            teams_data.append(
                {
                    "name": team_name,
                    "url": team_url,
                    "players": players,
                    "world_rank": world_rank,
                }
            )

        return teams_data

    # ----------------------------------------------------------
    # ПАРСИНГ ДАТ ТУРНИРА
    # ----------------------------------------------------------

    def _parse_event_dates(self, html: str):
        soup = BeautifulSoup(html, "html.parser")

        cell = soup.find("td", class_="eventdate")
        if cell:
            spans = [s for s in cell.find_all("span") if s.has_attr("data-unix")]
            if len(spans) >= 2:
                try:
                    start_ts = int(spans[0]["data-unix"]) / 1000.0
                    end_ts = int(spans[-1]["data-unix"]) / 1000.0

                    start = datetime.datetime.utcfromtimestamp(start_ts).date()
                    end = datetime.datetime.utcfromtimestamp(end_ts).date()
                    return start, end
                except Exception:
                    pass

        el = soup.find(class_=lambda v: v and "eventdate" in v.lower())
        if not el:
            return None, None

        text = el.get_text(" ", strip=True)

        m = re.search(
            r"(\d{1,2})/(\d{1,2})/(\d{4}).*?(\d{1,2})/(\d{1,2})/(\d{4})",
            text,
        )
        if m:
            d1, m1, y1, d2, m2, y2 = map(int, m.groups())
            try:
                start = datetime.date(y1, m1, d1)
                end = datetime.date(y2, m2, d2)
                return start, end
            except ValueError:
                return None, None

        m = re.search(
            r"(\d{1,2})/(\d{1,2}).*?(\d{1,2})/(\d{1,2})/(\d{4})",
            text,
        )
        if m:
            d1, m1, d2, m2, y2 = map(int, m.groups())
            try:
                start = datetime.date(y2, m1, d1)
                end = datetime.date(y2, m2, d2)
                return start, end
            except ValueError:
                return None, None

        return None, None

    # ----------------------------------------------------------
    # ПУБЛИЧНЫЙ МЕТОД: СКРАП ТУРНИРА
    # ----------------------------------------------------------

    def scrape_tournament(self, event_url: str) -> Tournament:
        print(f"[TOURNAMENT] {event_url}")
        self.driver.get(event_url)
        self._accept_cookies_if_needed()

        WebDriverWait(self.driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div.teams-attending.grid"))
        )

        html = self.driver.page_source
        soup = BeautifulSoup(html, "html.parser")

        start_date, end_date = self._parse_event_dates(html)

        h1 = soup.find("h1")
        if h1:
            t_name = h1.get_text(strip=True)
        else:
            t_name = event_url.rstrip("/").split("/")[-1]

        tournament_obj, created = Tournament.objects.get_or_create(name=t_name)

        updated = False
        if start_date and getattr(tournament_obj, "start_date", None) != start_date:
            tournament_obj.start_date = start_date
            updated = True
        if end_date and getattr(tournament_obj, "end_date", None) != end_date:
            tournament_obj.end_date = end_date
            updated = True
        if updated:
            tournament_obj.save()

        teams_data = self._parse_event_lineups(html)
        print(f"[TOURNAMENT] Найдено команд в 'Teams attending': {len(teams_data)}")

        self._last_teams_data = teams_data

        for tdata in teams_data:
            team_name = tdata["name"]
            team_url = tdata["url"]
            print(f"[TEAM] {team_name} -> {team_url}")

            team_obj, _ = Team.objects.get_or_create(name=team_name)

            # world rank
            world_rank = tdata.get("world_rank")
            if world_rank is not None and getattr(team_obj, "world_rank", None) != world_rank:
                team_obj.world_rank = world_rank
                team_obj.save(update_fields=["world_rank"])

            # ФЛАГ КОМАНДЫ: ВСЕГДА с team page
            region_code, region_name = self._fetch_team_flag_from_team_page(team_url)

            update_fields = []
            if region_code is not None and getattr(team_obj, "region_code", None) != region_code:
                team_obj.region_code = region_code
                update_fields.append("region_code")
            if region_name is not None and getattr(team_obj, "region_name", None) != region_name:
                team_obj.region_name = region_name
                update_fields.append("region_name")
            if update_fields:
                team_obj.save(update_fields=update_fields)

            # ✅ ДОБАВЛЕНО: актуальный состав (для удаления старых игроков из team)
            current_player_ids = set()

            # игроки + статы
            for pdata in tdata["players"]:
                nickname = pdata["nickname"]
                stats_url = pdata["stats_url"]

                print(f"  [PLAYER] {nickname}")
                player_obj, _ = Player.objects.get_or_create(nickname=nickname)

                if hasattr(player_obj, "team") and player_obj.team_id != team_obj.id:
                    player_obj.team = team_obj
                    player_obj.save(update_fields=["team"])

                # ✅ ДОБАВЛЕНО: отмечаем игрока как актуального для этой команды
                current_player_ids.add(player_obj.id)

                stats_obj: PlayerHLTVStats = self.player_scraper.scrape(stats_url)

                print(
                    "    [STATS] "
                    f"r={stats_obj.rating2}, "
                    f"adr={stats_obj.adr}, "
                    f"kpr={stats_obj.kills_per_round}, "
                    f"okpr={stats_obj.opening_kills_per_round}, "
                    f"odpr={stats_obj.opening_deaths_per_round}, "
                    f"win_open={stats_obj.win_after_opening}, "
                    f"multi%={stats_obj.multikill_rounds_pct}, "
                    f"clutch={stats_obj.clutch_points_per_round}, "
                    f"sniper={stats_obj.sniper_kills_per_round}, "
                    f"util_adr={stats_obj.utility_damage_per_round}, "
                    f"flash={stats_obj.flash_assists_per_round}"
                )

            # ✅ ДОБАВЛЕНО: снять старых игроков с team (они остаются в базе, просто team=None)
            Player.objects.filter(team=team_obj).exclude(id__in=current_player_ids).update(team=None)

        print("[DONE] Турнир полностью проскрапен.")
        return tournament_obj


def import_tournament_full(hltv_id_or_url):
    raw = str(hltv_id_or_url).strip()
    if not raw:
        raise ValueError("hltvId is empty")

    if raw.startswith("http://") or raw.startswith("https://"):
        event_url = raw
    else:
        event_url = f"{HLTV_BASE}/events/{raw}/_/"

    print(f"[IMPORT] Importing tournament from: {event_url}")

    scraper = HLTVTournamentScraper(headless=False)
    try:
        tournament_obj = scraper.scrape_tournament(event_url)
        teams_data = getattr(scraper, "_last_teams_data", [])
    finally:
        scraper.close()

    created_tteams = 0
    for tdata in teams_data:
        team_name = tdata["name"]
        team_obj, _ = Team.objects.get_or_create(name=team_name)
        _, created = TournamentTeam.objects.get_or_create(
            tournament=tournament_obj,
            team=team_obj,
        )
        if created:
            created_tteams += 1

    league, _ = League.objects.get_or_create(
        name=f"Main league of {tournament_obj.name}",
        defaults={
            "tournament": tournament_obj,
            "budget": 1_000_000,
            "max_badges": 0,
            "lock_policy": "soft",
        },
    )

    return {
        "status": "ok",
        "tournament_id": tournament_obj.id,
        "tournament_name": tournament_obj.name,
        "league_id": league.id,
        "tournament_teams_created": created_tteams,
    }
