# core/roles.py
from typing import Dict, Tuple, Callable

Components = Dict[str, float]
StatDict = Dict[str, float | int | None]
RoleFn = Callable[[Components, StatDict], Tuple[Components, Dict]]


def _copy(c: Components) -> Components:
    return {k: float(v) for k, v in c.items()}


def _i(s: StatDict, key: str) -> int:
    return int(s.get(key, 0) or 0)


def _f(s: StatDict, key: str) -> float:
    return float(s.get(key, 0) or 0.0)


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _role_delta(metric: float, target: float, k: float, lo: float, hi: float) -> float:
    # один принцип для всех ролей: плюс/минус по тому же показателю
    return clamp(k * (metric - target), lo, hi)


def _add_bonus(c2: Components, delta: float) -> None:
    c2["bonus"] = float(c2.get("bonus", 0.0)) + float(delta)


# --- Round normalization for role-metrics (MR12 short/long maps) ---
ROUND_BASE: float = 20.0
ROUND_MIN: float = 0.85
ROUND_MAX: float = 1.25


def _round_factor(s: StatDict) -> float:
    """
    Используем тот же подход, что и в scoring:
    round_factor = clamp(played_rounds / 20, 0.85, 1.25)

    ВАЖНО: чтобы это работало, в stat должен приходить played_rounds.
    Если played_rounds не передан — считаем factor=1.0.
    """
    pr = int(s.get("played_rounds", 0) or 0)
    if pr <= 0:
        return 1.0
    return clamp(pr / ROUND_BASE, ROUND_MIN, ROUND_MAX)


# -------------------------
# Roles (risk / reward)
# -------------------------

def role_CLUTCH_MINISTER(c: Components, s: StatDict):
    c2 = _copy(c)
    rf = _round_factor(s)

    clutch_wins = _i(s, "cl_1v2") + _i(s, "cl_1v3") + _i(s, "cl_1v4") + _i(s, "cl_1v5")
    clutch_adj = clutch_wins / rf  # короткая карта -> чуть больше, длинная -> чуть меньше

    # target=1: если 0 клатчей — штраф, 1 — нейтрально, 2+ — бонус
    delta = _role_delta(metric=clutch_adj, target=1.0, k=2.0, lo=-3.0, hi=6.0)

    before = c2["bonus"]
    _add_bonus(c2, delta)
    return c2, {"effects": [{
        "target": "bonus",
        "add": delta,
        "by": "clutch_wins_adj",
        "value": round(clutch_adj, 3),
        "detail": {"clutch_wins_raw": clutch_wins, "round_factor": round(rf, 3)},
        "target_value": 1,
        "before": before,
        "after": c2["bonus"],
    }]}


def role_MULTI_FRAGGER(c: Components, s: StatDict):
    c2 = _copy(c)
    rf = _round_factor(s)

    mk3 = _i(s, "mk_3k")
    mk4 = _i(s, "mk_4k")
    mk5 = _i(s, "mk_5k")

    # взвешиваем: 4k/5k ценнее
    weighted = mk3 + 2 * mk4 + 3 * mk5
    weighted_adj = weighted / rf

    delta = _role_delta(metric=weighted_adj, target=1.0, k=1.5, lo=-3.0, hi=6.0)

    before = c2["bonus"]
    _add_bonus(c2, delta)
    return c2, {"effects": [{
        "target": "bonus",
        "add": delta,
        "by": "weighted_multikills_adj",
        "value": round(weighted_adj, 3),
        "detail": {"mk_3k": mk3, "mk_4k": mk4, "mk_5k": mk5, "weighted_raw": weighted, "round_factor": round(rf, 3)},
        "target_value": 1,
        "before": before,
        "after": c2["bonus"],
    }]}


def role_SUPPORT(c: Components, s: StatDict):
    c2 = _copy(c)
    rf = _round_factor(s)

    flashes = _i(s, "flash_assists")
    flashes_adj = flashes / rf

    # target=2: <2 флэш-ассиста — минус, 2 — 0, 3+ — плюс
    delta = _role_delta(metric=flashes_adj, target=2.0, k=0.8, lo=-3.0, hi=3.0)

    before = c2["bonus"]
    _add_bonus(c2, delta)
    return c2, {"effects": [{
        "target": "bonus",
        "add": delta,
        "by": "flash_assists_adj",
        "value": round(flashes_adj, 3),
        "detail": {"flash_assists_raw": flashes, "round_factor": round(rf, 3)},
        "target_value": 2,
        "before": before,
        "after": c2["bonus"],
    }]}


# НЕ МЕНЯЛИ: HS% роль без round_factor (как просил)
def role_HS_MACHINE(c: Components, s: StatDict):
    c2 = _copy(c)
    kills = _i(s, "kills")
    hs = _i(s, "hs")
    hs_pct = 0.0 if kills <= 0 else (100.0 * hs / kills)

    # target=55%: ниже — минус, выше — плюс
    # k=0.2 => каждые +5% HS ≈ +1 очко (и наоборот)
    delta = _role_delta(metric=hs_pct, target=55.0, k=0.2, lo=-3.0, hi=3.0)
    before = c2["bonus"]
    _add_bonus(c2, delta)
    return c2, {"effects": [{
        "target": "bonus",
        "add": delta,
        "by": "hs_pct",
        "value": round(hs_pct, 2),
        "detail": {"hs": hs, "kills": kills},
        "target_value": 55,
        "before": before,
        "after": c2["bonus"],
    }]}


# НЕ МЕНЯЛИ: rating2 роль без round_factor (как просил)
def role_STAR_PLAYER(c: Components, s: StatDict):
    c2 = _copy(c)
    rt = _f(s, "rating2")
    # target=1.15: ниже — минус, выше — плюс
    # k=10 => +0.10 rating2 ≈ +1 очко
    delta = _role_delta(metric=rt, target=1.15, k=10.0, lo=-4.0, hi=6.0)
    before = c2["bonus"]
    _add_bonus(c2, delta)
    return c2, {"effects": [{
        "target": "bonus",
        "add": delta,
        "by": "rating2",
        "value": rt,
        "target_value": 1.15,
        "before": before,
        "after": c2["bonus"],
    }]}


def role_BAITER(c: Components, s: StatDict):
    c2 = _copy(c)
    rf = _round_factor(s)

    deaths = _i(s, "deaths")

    # На короткой карте "норма" смертей ниже, на длинной — выше.
    # death_target = 10 * round_factor
    death_target = 10.0 * rf

    # metric = (death_target - deaths), target=0:
    # deaths меньше нормы -> плюс, больше -> минус
    metric = death_target - deaths

    delta = _role_delta(metric=metric, target=0.0, k=0.6, lo=-4.0, hi=4.0)

    before = c2["bonus"]
    _add_bonus(c2, delta)
    return c2, {"effects": [{
        "target": "bonus",
        "add": delta,
        "by": "death_target_minus_deaths",
        "value": round(metric, 3),
        "detail": {"deaths": deaths, "death_target": round(death_target, 3), "round_factor": round(rf, 3)},
        "target_value": 0,
        "before": before,
        "after": c2["bonus"],
    }]}


def role_ENTRY_FRAGGER(c: Components, s: StatDict):
    c2 = _copy(c)
    rf = _round_factor(s)

    ok = _i(s, "opening_kills")
    od = _i(s, "opening_deaths")

    # 1) Плюс/минус по opening kills, но с учётом длины карты
    ok_adj = ok / rf
    delta = _role_delta(metric=ok_adj, target=1.0, k=1.5, lo=-3.0, hi=6.0)

    before_bonus = c2["bonus"]
    _add_bonus(c2, delta)

    # 2) opening deaths penalty: как было (успех -> мягче, иначе -> жёстче)
    before_neg = c2["opening_neg"]
    success = (ok >= 1) and (ok >= od)
    if success:
        c2["opening_neg"] *= 0.80  # penalty меньше
        mult = 0.80
    else:
        c2["opening_neg"] *= 1.20  # penalty больше
        mult = 1.20

    return c2, {"effects": [
        {
            "target": "bonus",
            "add": delta,
            "by": "opening_kills_adj",
            "value": round(ok_adj, 3),
            "detail": {"opening_kills_raw": ok, "round_factor": round(rf, 3)},
            "target_value": 1,
            "before": before_bonus,
            "after": c2["bonus"],
        },
        {
            "target": "opening_neg",
            "mult": mult,
            "by": "opening_deaths",
            "value": od,
            "before": before_neg,
            "after": c2["opening_neg"],
            "cond": "success=opening_kills>=1 and opening_kills>=opening_deaths",
            "success": success,
        }
    ]}


def role_GRENADER(c: Components, s: StatDict):
    c2 = _copy(c)
    rf = _round_factor(s)

    ud = float(s.get("utility_dmg", 0) or 0.0)
    ud_adj = ud / rf

    # target=35 на "нормальной" длине, корректируем метрику по round_factor
    delta = _role_delta(metric=ud_adj, target=35.0, k=0.06, lo=-3.0, hi=3.0)

    before = c2["bonus"]
    _add_bonus(c2, delta)

    return c2, {"effects": [{
        "target": "bonus",
        "add": delta,
        "by": "utility_dmg_adj",
        "value": round(ud_adj, 3),
        "detail": {"utility_dmg_raw": ud, "round_factor": round(rf, 3)},
        "target_value": 35.0,
        "before": before,
        "after": c2["bonus"],
    }]}


ROLES: Dict[str, RoleFn] = {
    "CLUTCH_MINISTER": role_CLUTCH_MINISTER,
    "BAITER": role_BAITER,
    "SUPPORT": role_SUPPORT,
    "HS_MACHINE": role_HS_MACHINE,
    "MULTI_FRAGGER": role_MULTI_FRAGGER,
    "STAR_PLAYER": role_STAR_PLAYER,
    "ENTRY_FRAGGER": role_ENTRY_FRAGGER,
    "GRENADER": role_GRENADER,
}


def apply_role(role_code: str | None, comp: Components, stat: StatDict) -> Tuple[Components, Dict]:
    meta = {"role": role_code, "effects": []}
    if not role_code:
        return comp, meta
    fn = ROLES.get(role_code)
    if not fn:
        meta["warning"] = "unknown_role"
        return comp, meta
    c2, eff = fn(comp, stat)
    meta["effects"] = eff.get("effects", [eff])
    return c2, meta
