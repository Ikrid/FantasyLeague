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
    ВСЁ берём только из страницы турнира, без перехода на team pages.
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
        # игроки скрапятся тем же режимом headless / не headless, что и турнир
        self.player_scraper = HLTVPlayerScraper(headless=headless)

        # сюда будем класть последние распарсенные команды,
        # чтобы import_tournament_full мог их использовать
        self._last_teams_data = []

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
            # нет диалога — ок
            pass

    # ----------------------------------------------------------
    # ПАРСИНГ БЛОКА TEAMS ATTENDING + LINEUPS
    # ----------------------------------------------------------

    def _parse_event_lineups(self, html: str):
        """
        Берём только блoк:

        <div class="teams-attending grid">
          <div class="col standard-box team-box supports-hover" has-lineup="">
            .
            <div class="lineup-box hidden">
              <a href="/player/.">.</a> x5
            </div>
          </div>
          .
        </div>

        Возвращаем список:

        [
          {
            "name": "SINNERS",
            "url": "https://www.hltv.org/team/10577/sinners",
            "players": [
              {"nickname": "beastik", "stats_url": "https://www.hltv.org/stats/players/11199/beastik"},
              .
            ]
          },
          .
        ]
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
            # --- команда ---
            team_link = box.select_one(".team-name a[href*='/team/']")
            if not team_link:
                continue

            href = team_link.get("href") or ""
            team_url = href if href.startswith("http") else urljoin(HLTV_BASE, href)

            # название команды — внутри .text или просто text линка
            name_el = team_link.select_one(".text") or team_link
            raw_name = name_el.get_text(strip=True)
            # отрезаем ранги типа "#48"
            team_name = raw_name.split("#", 1)[0].strip()

            # ---------- НОВОЕ: парсим world_rank из <div class="event-world-rank"> ----------
            world_rank = None  # <<< NEW
            rank_div = box.select_one("div.event-world-rank")  # <<< NEW
            if rank_div:  # <<< NEW
                rank_text = rank_div.get_text(strip=True)  # например "#34"  <<< NEW
                m = re.search(r"\d+", rank_text)  # <<< NEW
                if m:  # <<< NEW
                    try:  # <<< NEW
                        world_rank = int(m.group(0))  # 34  <<< NEW
                    except ValueError:  # <<< NEW
                        world_rank = None  # <<< NEW
            # ----------------------------------------------------------------------

            # --- игроки (ровно 5 из lineup-box) ---
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

                # /player/11199/beastik -> /stats/players/11199/beastik
                stats_path = p_href.replace("/player/", "/stats/players/")
                stats_url = urljoin(HLTV_BASE, stats_path)

                players.append(
                    {
                        "nickname": nickname,
                        "stats_url": stats_url,
                    }
                )

            if not players:
                print(f"[DEBUG] У команды {team_name} не найдено игроков в lineup-box")
                continue

            teams_data.append(
                {
                    "name": team_name,
                    "url": team_url,
                    "players": players,
                    "world_rank": world_rank,  # <<< NEW
                }
            )

        return teams_data

    # ----------------------------------------------------------
    # ПАРСИНГ ДАТ ТУРНИРА
    # ----------------------------------------------------------

    def _parse_event_dates(self, html: str):
        """
        Достаём диапазон дат турнира.

        1) Нормальный путь: берём <td class="eventdate"> и читаем data-unix
           у двух span'ов:
             <span data-unix="...start..."> ... </span>
             ...
             <span data-unix="...end...">   ... </span>

        2) Фоллбэк: пробуем вытащить даты из текста (форматы dd/mm/yy и т.п.).
        """
        soup = BeautifulSoup(html, "html.parser")

        # --- 1. Попытка через data-unix ---
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
                    # если что-то пошло не так — попробуем текстовым парсером ниже
                    pass

        # --- 2. Фоллбэк: парсим текст (для других форматов событий) ---
        el = soup.find(class_=lambda v: v and "eventdate" in v.lower())
        if not el:
            return None, None

        text = el.get_text(" ", strip=True)

        # dd/mm/yyyy - dd/mm/yyyy
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

        # dd/mm - dd/mm/yyyy (год только в конце)
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

    # ВАРИАНТ 1: БЕЗ transaction.atomic
    def scrape_tournament(self, event_url: str) -> Tournament:
        """
        Главный метод:
          - создаёт/находит Tournament по имени,
          - парсит даты турнира (start_date, end_date),
          - из .teams-attending.grid достаёт команды,
          - из их .lineup-box берёт по 5 игроков,
          - для каждого игрока вытягивает HLTV-стату за 3 месяца.

        ВОЗВРАЩАЕТ: объект Tournament.
        """
        print(f"[TOURNAMENT] {event_url}")
        self.driver.get(event_url)
        self._accept_cookies_if_needed()

        # ждём, пока появится блок с командами
        WebDriverWait(self.driver, 15).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "div.teams-attending.grid")
            )
        )

        html = self.driver.page_source
        soup = BeautifulSoup(html, "html.parser")

        # Даты турнира
        start_date, end_date = self._parse_event_dates(html)

        # Название турнира — <h1> Tipsport MČR 2025
        h1 = soup.find("h1")
        if h1:
            t_name = h1.get_text(strip=True)
        else:
            t_name = event_url.rstrip("/").split("/")[-1]

        tournament_obj, created = Tournament.objects.get_or_create(
            name=t_name,
        )

        # если удалось распарсить даты — записываем их в модель
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

        # сохраняем для import_tournament_full
        self._last_teams_data = teams_data

        for tdata in teams_data:
            team_name = tdata["name"]
            print(f"[TEAM] {team_name} -> {tdata['url']}")

            team_obj, _ = Team.objects.get_or_create(
                name=team_name,
            )

            # ---------- НОВОЕ: сохраняем world_rank в модель Team ----------
            # tdata["world_rank"] может быть None, если на странице нет ранга
            world_rank = tdata.get("world_rank")  # <<< NEW
            if world_rank is not None and getattr(team_obj, "world_rank", None) != world_rank:  # <<< NEW
                team_obj.world_rank = world_rank  # <<< NEW
                # update_fields чтобы не трогать другие поля  <<< NEW
                team_obj.save(update_fields=["world_rank"])  # <<< NEW
            # --------------------------------------------------------------

            for pdata in tdata["players"]:
                nickname = pdata["nickname"]
                stats_url = pdata["stats_url"]

                print(f"  [PLAYER] {nickname}")
                player_obj, _ = Player.objects.get_or_create(
                    nickname=nickname,
                )

                # Привязать игрока к команде, если в модели Player есть поле team
                if hasattr(player_obj, "team") and player_obj.team_id != team_obj.id:
                    player_obj.team = team_obj
                    player_obj.save()

                # Скрапим статы игрока
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

        print("[DONE] Турнир полностью проскрапен.")
        return tournament_obj


# =====================================================================
# Функция-обёртка для использования из Django view
# Принимает ИЛИ URL, ИЛИ числовой ID турнира
# =====================================================================

def import_tournament_full(hltv_id_or_url):
    """
    hltv_id_or_url:
      - либо строка с HLTV URL, например:
          'https://www.hltv.org/events/8847/tipsport-mcr-2025'
      - либо просто ID: '8847' или 8847
    """

    raw = str(hltv_id_or_url).strip()
    if not raw:
        raise ValueError("hltvId is empty")

    # Если пользователь вставил полный URL — используем как есть.
    if raw.startswith("http://") or raw.startswith("https://"):
        event_url = raw
    else:
        # Если это просто число — собираем URL в формате /events/<id>/_/
        event_url = f"{HLTV_BASE}/events/{raw}/_/"

    print(f"[IMPORT] Importing tournament from: {event_url}")

    # ВАЖНО: headless=False, как ты запускал вручную
    scraper = HLTVTournamentScraper(headless=False)
    try:
        tournament_obj = scraper.scrape_tournament(event_url)
        teams_data = getattr(scraper, "_last_teams_data", [])
    finally:
        scraper.close()

    # ====== ПРИВЯЗЫВАЕМ КОМАНДЫ К ТУРНИРУ ЧЕРЕЗ TournamentTeam ======
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

    # создаём / находим лигу под турнир
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
