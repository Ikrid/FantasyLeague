# core/scoring.py
from dataclasses import dataclass
from typing import Dict, Tuple

from .roles import apply_role  # роли применяются к компонентам

@dataclass(frozen=True)
class ScoringParams:
    # базовые веса
    KILL: float = 1.0
    DEATH: float = -0.5
    ASSIST: float = 0.5
    OPEN_KILL: float = 1.5
    OPEN_DEATH: float = -1.0
    MK_3K: float = 2.0
    MK_4K: float = 5.0
    MK_5K: float = 10.0
    CL_1V2: float = 3.0
    CL_1V3: float = 5.0
    CL_1V4: float = 8.0
    CL_1V5: float = 15.0

    # пороги ADR / Rating2
    ADR_BONUS_85: float = 3.0
    ADR_BONUS_70: float = 1.0
    ADR_PENALTY_50: float = -1.0
    RATING_BONUS_120: float = 4.0
    RATING_BONUS_100: float = 2.0
    RATING_PENALTY_090: float = -2.0

    # контекст и бонусы
    ROUND_BASE: float = 20.0      # CS2 MR12 → базовая длина
    ROUND_MIN: float = 0.85
    ROUND_MAX: float = 1.25
    TEAM_WIN_BONUS: float = 2.0
    PTS_MIN: float = -20.0
    PTS_MAX: float = 60.0


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def adr_bonus(adr: float | None, p: ScoringParams) -> float:
    if adr is None:
        return 0.0
    if adr >= 85:
        return p.ADR_BONUS_85
    if adr >= 70:
        return p.ADR_BONUS_70
    if adr < 50:
        return p.ADR_PENALTY_50
    return 0.0


def rating_bonus(rating2: float | None, p: ScoringParams) -> float:
    if rating2 is None:
        return 0.0
    if rating2 >= 1.20:
        return p.RATING_BONUS_120
    if rating2 >= 1.00:
        return p.RATING_BONUS_100
    if rating2 < 0.90:
        return p.RATING_PENALTY_090
    return 0.0


def calc_points(
    stat: Dict,
    played_rounds: int,
    winner_team_id: int | None,
    player_team_id: int | None,
    role_badge: str | None,
    params: ScoringParams = ScoringParams()
) -> Tuple[float, Dict]:
    """
    Подсчёт очков за карту с карточками-ролями (модифицируют компоненты, а не весь итог).
    stat: dict из PlayerMapStats (kills, deaths, assists, hs, opening_kills, opening_deaths,
                                 mk_3k, mk_4k, mk_5k, cl_1v2..cl_1v5, adr, rating2)
    """

    p = params

    # 1) Сабтоталы ДО ролей (каждая часть считается отдельно)
    comp_before = {
        "kills":  float(stat.get("kills", 0)) * p.KILL,
        "assists": float(stat.get("assists", 0)) * p.ASSIST,
        "deaths":  float(stat.get("deaths", 0)) * p.DEATH,  # уже отрицательный вес
        "opening_pos": float(stat.get("opening_kills", 0)) * p.OPEN_KILL,
        "opening_neg": float(stat.get("opening_deaths", 0)) * p.OPEN_DEATH,  # отрицательный вес
        "multi":  float(stat.get("mk_3k", 0)) * p.MK_3K \
                + float(stat.get("mk_4k", 0)) * p.MK_4K \
                + float(stat.get("mk_5k", 0)) * p.MK_5K,
        "clutch": float(stat.get("cl_1v2", 0)) * p.CL_1V2 \
                + float(stat.get("cl_1v3", 0)) * p.CL_1V3 \
                + float(stat.get("cl_1v4", 0)) * p.CL_1V4 \
                + float(stat.get("cl_1v5", 0)) * p.CL_1V5,
        "adr_rt": adr_bonus(stat.get("adr"), p) + rating_bonus(stat.get("rating2"), p),
        "bonus":  0.0,  # карман для фиксированных прибавок ролей
    }

    # 2) Применяем РОЛЬ (меняет только целевые части)
    comp_after, role_meta = apply_role(role_badge, comp_before, stat)

    # 3) База после роли
    base_after_roles = sum(comp_after.values())

    # 4) Нормализация по длине карты (MR12)
    rf_raw = (played_rounds or p.ROUND_BASE) / p.ROUND_BASE
    round_factor = clamp(rf_raw, p.ROUND_MIN, p.ROUND_MAX)

    # 5) Командный бонус
    team_bonus = p.TEAM_WIN_BONUS if (winner_team_id and winner_team_id == player_team_id) else 0.0

    raw = base_after_roles * round_factor + team_bonus
    final = clamp(raw, p.PTS_MIN, p.PTS_MAX)

    breakdown = {
        "components_before": {k: round(v, 3) for k, v in comp_before.items()},
        "components_after_role": {k: round(v, 3) for k, v in comp_after.items()},
        "role": role_meta,
        "round_factor": round(round_factor, 3),
        "team_win_bonus": team_bonus,
        "final": round(final, 3),
    }
    return float(round(final, 2)), breakdown
