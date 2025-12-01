import datetime
import re

import undetected_chromedriver as uc
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from bs4 import BeautifulSoup

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
    # cookie-баннер (мы его уже один раз успешно кликали, оставляю рабочий вариант)

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

    def scrape(self, url: str) -> PlayerHLTVStats:
        full_url = self.make_3_month_url(url)

        self.driver.get(full_url)

        # пытаемся закрыть баннер
        try:
            self.accept_cookies()
        except Exception:
            pass

        # просто ждём, пока страница хотя бы загрузит тело и ник
        WebDriverWait(self.driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "body"))
        )
        WebDriverWait(self.driver, 20).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".playerNickname, h1"))
        )

        html = self.driver.page_source
        soup = BeautifulSoup(html, "html.parser")

        # --- ник ---
        nickname_el = soup.select_one(".playerNickname") or soup.find("h1")
        nickname = nickname_el.get_text(strip=True) if nickname_el else None

        # иногда ник можно достать из <title> вида:
        # "Kaike 'KSCERATO' Cerato Counter-Strike Statistics | HLTV.org"
        if not nickname and soup.title and soup.title.string:
            title = soup.title.string.strip()
            m = re.search(r"'([^']+)'", title)
            if m:
                nickname = m.group(1)

        if not nickname:
            raise ValueError("Не удалось определить ник игрока с HLTV")

        player, _ = Player.objects.get_or_create(nickname=nickname)
        stats_obj, _ = PlayerHLTVStats.objects.get_or_create(player=player)

        # --- весь текст страницы одной строкой ---
        text = soup.get_text("\n", strip=True)

        for hltv_label, field_name in self.FIELD_MAP.items():
            value = self._extract_number_after_label(text, hltv_label)
            setattr(stats_obj, field_name, value)

        stats_obj.save()
        return stats_obj

    # --------------------------------------------------------------

    def close(self):
        try:
            self.driver.quit()
        except Exception:
            pass
