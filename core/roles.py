# core/roles.py
from typing import Dict, Tuple, Callable

# Композиция сабтоталов, с которыми работает скоринг.
# Важно: 'bonus' — отдельный карман для фиксированных прибавок ролей.
Components = Dict[str, float]
StatDict = Dict[str, float | int | None]
RoleFn = Callable[[Components, StatDict], Tuple[Components, Dict]]

def _copy(c: Components) -> Components:
    return {k: float(v) for k, v in c.items()}

def role_MULTIFRAGGER(c: Components, s: StatDict):
    """Усиливает только мультикиллы."""
    c2 = _copy(c)
    before = c2["multi"]; c2["multi"] *= 1.25
    meta = {"target": "multi", "mult": 1.25, "before": before, "after": c2["multi"]}
    return c2, meta

def role_HS_MACHINE(c: Components, s: StatDict):
    """Масштабирует очки за KILL по HS%."""
    c2 = _copy(c)
    kills = float(s.get("kills", 0) or 0)
    hs = float(s.get("hs", 0) or 0)
    hs_pct = 100.0 * (hs / max(1.0, kills))
    mult = 1.20 if hs_pct >= 70.0 else (0.85 if hs_pct < 40.0 else 1.0)
    before = c2["kills"]; c2["kills"] *= mult
    meta = {"target": "kills", "mult": mult, "hs_pct": hs_pct, "before": before, "after": c2["kills"]}
    return c2, meta

def role_ENTRY_FRAGGER(c: Components, s: StatDict):
    """Усиливает открывающие киллы, смягчает наказание за opening deaths."""
    c2 = _copy(c)
    bpos, bneg = c2["opening_pos"], c2["opening_neg"]
    c2["opening_pos"] *= 1.50
    c2["opening_neg"] *= 0.80
    meta = {
        "effects": [
            {"target": "opening_pos", "mult": 1.50, "before": bpos, "after": c2["opening_pos"]},
            {"target": "opening_neg", "mult": 0.80, "before": bneg, "after": c2["opening_neg"]},
        ]
    }
    return c2, meta

def role_AWPER(c: Components, s: StatDict):
    """Снайпер: чутка бафает opening и даёт небольшой стаб-бонус за высокую результативность."""
    c2 = _copy(c)
    before = c2["opening_pos"]; c2["opening_pos"] *= 1.25
    # маленькая фиксированная прибавка, если rating2 >= 1.10
    bonus = 1.0 if (s.get("rating2") or 0) >= 1.10 else 0.0
    c2["bonus"] += bonus
    meta = {"effects": [
        {"target":"opening_pos","mult":1.25,"before": before,"after": c2["opening_pos"]},
        {"target":"bonus","add": bonus}
    ]}
    return c2, meta

def role_SUPPORT(c: Components, s: StatDict):
    """Саппорт: буст ассистов + бонус за флэш-ассисты."""
    c2 = _copy(c)
    before = c2["assists"]; c2["assists"] *= 1.30
    flashes = float(s.get("flash_assists", 0) or 0)
    bonus = min(flashes * 0.3, 2.0)  # до +2 очков за флеш-ассисты
    c2["bonus"] += bonus
    meta = {"effects":[
        {"target":"assists","mult":1.30,"before":before,"after":c2["assists"]},
        {"target":"bonus","add":bonus,"by":"flash_assists"}
    ]}
    return c2, meta

def role_CLUTCHER(c: Components, s: StatDict):
    """Клатчер: усиливает только вклад за клатчи."""
    c2 = _copy(c)
    before = c2["clutch"]; c2["clutch"] *= 1.30
    meta = {"target": "clutch", "mult": 1.30, "before": before, "after": c2["clutch"]}
    return c2, meta

def role_ANCHOR(c: Components, s: StatDict):
    """Якорь: делает смерти менее болезненными и добавляет бонус за utility damage."""
    c2 = _copy(c)
    before = c2["deaths"]; c2["deaths"] *= 0.85  # мягче штраф
    u = float(s.get("utility_dmg", 0) or 0)
    bonus = min(u * 0.01, 2.0)  # до +2 очков
    c2["bonus"] += bonus
    meta = {"effects":[
        {"target":"deaths","mult":0.85,"before":before,"after":c2["deaths"]},
        {"target":"bonus","add":bonus,"by":"utility_dmg"}
    ]}
    return c2, meta

def role_IGL(c: Components, s: StatDict):
    """Кэп: немного нивелирует плохой рейтинг/статистику и смерти."""
    c2 = _copy(c)
    # Смягчаем штраф за смерти
    before_deaths = c2["deaths"]; c2["deaths"] *= 0.90
    # Если rating2 низкий — слегка компенсируем adr/rating-блок
    rt = float(s.get("rating2") or 0)
    comp = 1.0 if rt < 0.95 else (0.5 if rt < 1.05 else 0.0)
    c2["adr_rt"] += comp
    meta = {"effects":[
        {"target":"deaths","mult":0.90,"before":before_deaths,"after":c2["deaths"]},
        {"target":"adr_rt","add":comp,"by":"low_rating_protection"}
    ]}
    return c2, meta

def role_CONSISTENT(c: Components, s: StatDict):
    """Надёжный: небольшой бонус за низкие смерти и положительный перфоманс."""
    c2 = _copy(c)
    deaths = float(s.get("deaths", 0) or 0)
    rt = float(s.get("rating2") or 0)
    bonus = 2.0 if (deaths <= 10 and rt >= 1.00) else 0.0
    c2["bonus"] += bonus
    meta = {"effects":[{"target":"bonus","add":bonus,"cond":"deaths<=10 & rating2>=1.0"}]}
    return c2, meta

def role_FINISHER(c: Components, s: StatDict):
    """Финишер: усиливает мультикиллы и клатчи слегка одновременно."""
    c2 = _copy(c)
    b_multi, b_clutch = c2["multi"], c2["clutch"]
    c2["multi"] *= 1.15
    c2["clutch"] *= 1.10
    meta = {"effects":[
        {"target":"multi","mult":1.15,"before":b_multi,"after":c2["multi"]},
        {"target":"clutch","mult":1.10,"before":b_clutch,"after":c2["clutch"]}
    ]}
    return c2, meta

def role_RIFLER(c: Components, s: StatDict):
    """Райфлер: общий упор на киллы и опенинги, без эксцессов."""
    c2 = _copy(c)
    b_k, b_op = c2["kills"], c2["opening_pos"]
    c2["kills"] *= 1.10
    c2["opening_pos"] *= 1.10
    meta = {"effects":[
        {"target":"kills","mult":1.10,"before":b_k,"after":c2["kills"]},
        {"target":"opening_pos","mult":1.10,"before":b_op,"after":c2["opening_pos"]}
    ]}
    return c2, meta

# Реестр ролей
ROLES: Dict[str, RoleFn] = {
    "MULTIFRAGGER": role_MULTIFRAGGER,
    "HS_MACHINE": role_HS_MACHINE,
    "ENTRY_FRAGGER": role_ENTRY_FRAGGER,
    "AWPER": role_AWPER,
    "SUPPORT": role_SUPPORT,
    "CLUTCHER": role_CLUTCHER,
    "ANCHOR": role_ANCHOR,
    "IGL": role_IGL,
    "CONSISTENT": role_CONSISTENT,
    "FINISHER": role_FINISHER,
    "RIFLER": role_RIFLER,  # 11-я на будущее, можно не показывать в UI
}

def apply_role(role_code: str | None, comp: Components, stat: StatDict) -> Tuple[Components, Dict]:
    """Применить роль к сабтоталам. Если роль не найдена — вернуть как есть."""
    meta = {"role": role_code, "effects": []}
    if not role_code:
        return comp, meta
    fn = ROLES.get(role_code)
    if not fn:
        meta["warning"] = "unknown_role"
        return comp, meta
    c2, eff = fn(comp, stat)
    if "effects" in eff:
        meta["effects"] = eff["effects"]
    else:
        meta["effects"].append(eff)
    return c2, meta
