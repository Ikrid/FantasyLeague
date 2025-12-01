import datetime
import re

import undetected_chromedriver as uc
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from bs4 import BeautifulSoup

from django.db import connection  # для debug

from .models import Player, PlayerHLTVStats


class HLTVPlayerScraper:
    """
    Скрейпит индивидуальные статы игрока с HLTV за последние 3 месяца
    через настоящий браузер (Selenium + undetected_chromedriver).
    Берём просто HTML страницы и ищем в нём текст метрик.
    """

    FIELD_MAP = {
        # MAIN PERFORMANCE (сейчас на HLTV это "Rating 3.0")
        "Rating 3.0": "rating2",              # кладём в rating2
        "Kills per round": "kills_per_round",
        "Damage per round": "adr",

        # ENTRY / OPENING
        "Opening kills per round": "opening_kills_per_round",
        "Opening deaths per round": "opening_deaths_per_round",
        "Win% after opening kill": "win_after_opening",

        # SKILL
        "Rounds with a multi-kill": "multikill_rounds_pct",
        "Clutch points per round": "clutch_points_per_round",

        # SNIPER
        "Sniper kills per round": "sniper_kills_per_round",

        # UTILITY
        "Utility damage per round": "utility_damage_per_round",
        "Flash assists per round": "flash_assists_per_round",
    }

    def __init__(self, headless: bool = False):
        chrome_options = Options()
        chrome_options.add_argument("--disable-blink-features=AutomationControlled")
        chrome_options.add_argument("--disable-popup-blocking")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")

        if headless:
            chrome_options.add_argument("--headless=new")
            chrome_options.add_argument("--window-size=1920,1080")

        self.driver = uc.Chrome(options=chrome_options)

    # --------------------------------------------------------------

    def make_3_month_url(self, base_url: str) -> str:
        today = datetime.date.today()
        three_months_ago = today - datetime.timedelta(days=90)
        return (
            f"{base_url}"
            f"?startDate={three_months_ago:%Y-%m-%d}"
            f"&endDate={today:%Y-%m-%d}"
        )

    # --------------------------------------------------------------
    # cookie-баннер

    def accept_cookies(self):
        """
        Закрывает cookie-popup на HLTV, если он есть.
        """
        xpaths = [
            "//button[contains(@class,'CybotCookiebotDialogBodyButton')]",
            "//button[contains(text(),'Accept')]",
            "//button[contains(text(),'Allow')]",
        ]
        for xp in xpaths:
            try:
                btn = WebDriverWait(self.driver, 3).until(
                    EC.element_to_be_clickable((By.XPATH, xp))
                )
                btn.click()
                print("[COOKIE] Clicked:", xp)
                return
            except Exception:
                pass
        # если ничего не нашли — просто игнорируем

    # --------------------------------------------------------------
    # утилита: вытащить первое число после подписи в текстовом HTML

    @staticmethod
    def _extract_number_after_label(text: str, label: str) -> float:
        # ищем "Label   0.75" или "Label  54.6%"
        pattern = re.escape(label) + r"\s*([0-9]+(?:\.[0-9]+)?)"
        m = re.search(pattern, text)
        if not m:
            return 0.0
        try:
            return float(m.group(1))
        except ValueError:
            return 0.0

    # --------------------------------------------------------------
    # парс ника

    @staticmethod
    def _extract_nickname(soup: BeautifulSoup) -> str | None:
        """
        Надёжно достаём ник игрока:
        1) пробуем .playerNickname (есть на некоторых страницах)
        2) если нет — парсим <title> вида:
           "Tom 'KSCERATO' Cerato Counter-Strike Statistics | HLTV.org"
        """
        nickname = None

        # 1) старый вариант — вдруг всё же есть
        el = soup.select_one(".playerNickname")
        if el:
            nickname = el.get_text(strip=True) or None

        # 2) основной вариант — тайтл
        if (not nickname) and soup.title and soup.title.string:
            title = soup.title.string.strip()

            # сначала пробуем вытащить то, что в одинарных кавычках
            m = re.search(r"'([^']+)'", title)
            if m:
                nickname = m.group(1).strip()
            else:
                # например "s1mple Counter-Strike Statistics | HLTV.org"
                m2 = re.match(r"(.+?) Counter-Strike Statistics", title)
                if m2:
                    name_part = m2.group(1).strip()
                    # если вдруг там ещё раз есть '...', достанем
                    m3 = re.search(r"'([^']+)'", name_part)
                    if m3:
                        nickname = m3.group(1).strip()
                    else:
                        # в самом плохом случае берём последнее слово
                        nickname = name_part.split()[-1].strip()

        return nickname

    # --------------------------------------------------------------

    def scrape(self, url: str) -> PlayerHLTVStats:
        full_url = self.make_3_month_url(url)

        print(f"[HLTV-PLAYER] Scraping: {full_url}")
        self.driver.get(full_url)

        # пытаемся закрыть баннер
        try:
            self.accept_cookies()
        except Exception:
            pass

        # просто ждём, пока страница хотя бы загрузит тело
        WebDriverWait(self.driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "body"))
        )

        html = self.driver.page_source
        soup = BeautifulSoup(html, "html.parser")

        # --- ник ---
        nickname = self._extract_nickname(soup)
        if not nickname:
            raise ValueError("Не удалось определить ник игрока с HLTV")

        print(f"[HLTV-PLAYER] Nickname resolved: {nickname}")

        player, _ = Player.objects.get_or_create(nickname=nickname)
        stats_obj, _ = PlayerHLTVStats.objects.get_or_create(player=player)

        # --- DEBUG: проверяем, в какую БД пишем и сколько записей до сохранения ---
        print(
            f"[DB] alias={connection.alias}, "
            f"before count={PlayerHLTVStats.objects.count()}"
        )

        # --- весь текст страницы одной строкой ---
        text = soup.get_text("\n", strip=True)

        for hltv_label, field_name in self.FIELD_MAP.items():
            value = self._extract_number_after_label(text, hltv_label)
            setattr(stats_obj, field_name, value)

        stats_obj.save()

        # --- DEBUG: смотрим, что стало после save() ---
        print(
            f"[DB] after save id={stats_obj.id}, "
            f"count={PlayerHLTVStats.objects.count()}"
        )

        return stats_obj

    # --------------------------------------------------------------

    def close(self):
        try:
            self.driver.quit()
        except Exception:
            pass
