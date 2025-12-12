from typing import Dict, Any, Optional, Iterable
from datetime import timedelta

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from django.db.models import Q, Sum, Count, Avg, FloatField
from django.db.models.functions import Coalesce, Cast

from .scoring import calc_points
from .models import (
    Team, Player, Tournament, League, FantasyTeam, FantasyRoster,
    Match, Map, PlayerMapStats, FantasyPoints, PlayerPrice, TournamentTeam
)

# =================== helpers ===================

def _team_ids_for_tournament(tournament_id: int) -> set[int]:
    """
    Возвращает множество id команд, связанных с турниром.
    1) Сначала явные связи из TournamentTeam.
    2) Если связей нет — фолбэк по матчам.
    """
    tts = list(
        TournamentTeam.objects.filter(tournament_id=tournament_id)
        .values_list("team_id", flat=True)
    )
    if tts:
        return set(tts)

    ids = set(
        Match.objects.filter(tournament_id=tournament_id)
        .values_list("team1_id", flat=True)
    )
    ids |= set(
        Match.objects.filter(tournament_id=tournament_id)
        .values_list("team2_id", flat=True)
    )
    return ids


def _team_factor(rank: Optional[int], max_rank: int = 50) -> float:
    """Фактор силы команды (1.0 — топ, 0.0 — слабая)."""
    if rank is None or rank <= 0:
        return 0.5
    r = min(rank, max_rank)
    return 1.0 - (r - 1) / max_rank


# =================== advanced market generation ===================

def generate_market_prices_for_tournament(
    tournament_id: int,
    *,
    budget: int = 1_000_000,
    slots: int = 5,
    use_days_window: int = 90,
    weight_rating: float = 0.5,
    weight_kdr: float = 0.2,  # kills_per_round
    weight_adr: float = 0.3,
    weight_fpm: float = 0.17,  # clutch_points_per_round (impact)
    weight_team: float = 0.15,
    max_rank: int = 50,
    avg_price_mult: float = 1.0,
    flank_min_mult: float = 0.83,
    flank_max_mult: float = 1.25,
    source_label: str = "AUTO",
) -> int:
    """
    Генерация цен игроков турнира.

    НОВАЯ ЛОГИКА:
    - опираемся на рейтинг команды (Team.world_rank)
      и агрегированные HLTV-метрики из PlayerHLTVStats;
    - если по игроку НЕТ PlayerHLTVStats, ему ставится дефолтная цена
      (по умолчанию это средняя цена, при стандартных параметрах
       budget=1_000_000 и slots=5 это будет 200_000);
    - сырые PlayerMapStats и FantasyPoints для цены больше не используются.

    Параметры weight_*:
    - rating  — основной фактор;
    - kdr     — kills_per_round;
    - adr     — damage per round, второй по важности после rating;
    - fpm     — clutch_points_per_round, вспомогательный импакт;
    - team    — сила команды по мировому рейтингу.

    ДОПОЛНИТЕЛЬНО:
    - поверх базовой модели вводится турнирный множитель по силе команды:
      внутри КОНКРЕТНОГО турнира лучшие команды слегка удорожают игроков,
      а команды-аутсайдеры заметно удешевляют.
    - финальная цена округляется до 1000.
    """
    # --- участники турнира
    team_ids = list(_team_ids_for_tournament(tournament_id))
    if not team_ids:
        return 0

    # Подтягиваем команды и HLTV-статы одним запросом
    players = (
        Player.objects
        .filter(team_id__in=team_ids)
        .select_related("team", "hltv_stats")
    )
    players = list(players)
    if not players:
        return 0

    # >>> NEW: турнирные множители по силе команды <<<
    def _build_tournament_team_multipliers(players_list):
        """
        Строим {team_id: mult} на основе распределения world_rank
        среди команд ЭТОГО турнира.

        Лучшая команда получает небольшой бонус,
        худшая — заметный штраф.
        """
        team_world_ranks: dict[int, int] = {}
        for pl in players_list:
            team = pl.team
            wr = getattr(team, "world_rank", None)
            if wr is None:
                continue
            tid = team.id
            if tid not in team_world_ranks or wr < team_world_ranks[tid]:
                team_world_ranks[tid] = wr

        if not team_world_ranks:
            return {}

        sorted_items = sorted(team_world_ranks.items(), key=lambda kv: kv[1])
        k = len(sorted_items)
        if k == 1:
            return {sorted_items[0][0]: 1.0}

        # топы чуть дороже, аутсайдеры сильно дешевле
        HIGH_MULT = 1.0  # максимальный бонус за топ-1 турнира
        LOW_MULT = 0.95   # максимальный штраф за последнюю команду
        CURVE_GAMMA = 2.0  # >1 => сильнее штрафует низ, мягче бустит верх

        res: dict[int, float] = {}
        for pos, (team_id, _wr) in enumerate(sorted_items):
            # strength: 1.0 — лучшая команда, 0.0 — худшая
            strength = 1.0 - (pos / (k - 1))
            # изгибаем кривую: для слабых команд penalty становится сильнее
            curved = strength ** CURVE_GAMMA
            mult = LOW_MULT + (HIGH_MULT - LOW_MULT) * curved
            res[team_id] = mult

        return res

    tournament_team_mult_by_team_id = _build_tournament_team_multipliers(players)
    # >>> END NEW <<<

    # Собираем метрики только для игроков, у которых есть HLTV-статистика
    metrics: dict[int, dict] = {}
    players_with_stats: set[int] = set()
    players_without_stats: set[int] = set()

    for p in players:
        st = getattr(p, "hltv_stats", None)
        if st is None:
            players_without_stats.add(p.id)
            continue

        metrics[p.id] = {
            "rating": float(st.rating2) if st.rating2 else None,
            "kdr": float(st.kills_per_round) if st.kills_per_round else None,
            "adr": float(st.adr) if st.adr else None,
            "fpm": float(st.clutch_points_per_round) if st.clutch_points_per_round else None,
        }
        players_with_stats.add(p.id)

    avg_price = int((budget / slots) * avg_price_mult)
    default_price = avg_price

    if not players_with_stats:
        upserts = 0
        for p in players:
            PlayerPrice.objects.update_or_create(
                tournament_id=tournament_id,
                player_id=p.id,
                defaults={
                    "price": default_price,
                    "source": source_label,
                    "calc_meta": {"default_price": True, "reason": "no_hltv_stats"},
                },
            )
            upserts += 1
        return upserts

    def collect_clean(key: str):
        vals = []
        for pid in players_with_stats:
            v = metrics[pid].get(key)
            if v is not None:
                vals.append(float(v))
        return vals

    def norm_func(vals):
        if not vals:
            return (lambda _x: 0.5), 0.0, 0.0
        vmin, vmax = min(vals), max(vals)
        if vmax - vmin < 1e-9:
            return (lambda _x: 0.5), vmin, vmax

        def _norm(x):
            if x is None:
                return 0.5
            return (float(x) - vmin) / (vmax - vmin)

        return _norm, vmin, vmax

    norm_rating, rmin, rmax = norm_func(collect_clean("rating"))
    norm_kdr, kmin, kmax = norm_func(collect_clean("kdr"))
    norm_adr, amin, amax = norm_func(collect_clean("adr"))
    norm_fpm, fmin, fmax = norm_func(collect_clean("fpm"))

    score_by_player: dict[int, float] = {}
    team_factor_by_player: dict[int, float] = {}
    tournament_team_factor_by_player: dict[int, float] = {}

    for p in players:
        if p.id not in players_with_stats:
            continue

        mtr = metrics.get(p.id, {})
        nr = norm_rating(mtr.get("rating"))
        nk = norm_kdr(mtr.get("kdr"))
        na = norm_adr(mtr.get("adr"))
        nf = norm_fpm(mtr.get("fpm"))
        tf = _team_factor(getattr(p.team, "world_rank", None), max_rank=max_rank)

        S = (
            weight_rating * nr
            + weight_kdr * nk
            + weight_adr * na
            + weight_fpm * nf
            + weight_team * tf
        )
        score_by_player[p.id] = S
        team_factor_by_player[p.id] = tf
        tournament_team_factor_by_player[p.id] = tournament_team_mult_by_team_id.get(
            p.team_id, 1.0
        )

    if not score_by_player:
        upserts = 0
        for p in players:
            PlayerPrice.objects.update_or_create(
                tournament_id=tournament_id,
                player_id=p.id,
                defaults={
                    "price": default_price,
                    "source": source_label,
                    "calc_meta": {"default_price": True, "reason": "empty_metrics"},
                },
            )
            upserts += 1
        return upserts

    S_values = list(score_by_player.values())
    Smin, Smax = min(S_values), max(S_values)

    pmin_target = int(avg_price * flank_min_mult)
    pmax_target = int(avg_price * flank_max_mult)

    upserts = 0

    if Smax - Smin < 1e-9:
        for p in players:
            if p.id in players_with_stats:
                PlayerPrice.objects.update_or_create(
                    tournament_id=tournament_id,
                    player_id=p.id,
                    defaults={
                        "price": avg_price,
                        "source": source_label,
                        "calc_meta": {
                            "flat": True,
                            "rating": metrics[p.id].get("rating"),
                            "kdr": metrics[p.id].get("kdr"),
                            "adr": metrics[p.id].get("adr"),
                            "fpm": metrics[p.id].get("fpm"),
                            "team_factor": team_factor_by_player.get(p.id),
                            "tournament_team_factor": tournament_team_factor_by_player.get(p.id),
                        },
                    },
                )
                upserts += 1
            else:
                PlayerPrice.objects.update_or_create(
                    tournament_id=tournament_id,
                    player_id=p.id,
                    defaults={
                        "price": default_price,
                        "source": source_label,
                        "calc_meta": {"default_price": True, "reason": "no_hltv_stats_flat"},
                    },
                )
                upserts += 1
        return upserts

    beta = (pmax_target - pmin_target) / (Smax - Smin)
    alpha = pmin_target - beta * Smin

    # Применяем ценовую модель:
    for p in players:
        if p.id in players_with_stats:
            S = score_by_player[p.id]
            base_price = alpha + beta * S

            extra_mult = tournament_team_factor_by_player.get(p.id, 1.0)
            raw_price = base_price * extra_mult

            # округляем до 1000
            price = int(round(raw_price / 1000.0) * 1000)

            PlayerPrice.objects.update_or_create(
                tournament_id=tournament_id,
                player_id=p.id,
                defaults={
                    "price": price,
                    "source": source_label,
                    "calc_meta": {
                        "rating": metrics[p.id].get("rating"),
                        "kdr": metrics[p.id].get("kdr"),
                        "adr": metrics[p.id].get("adr"),
                        "fpm": metrics[p.id].get("fpm"),
                        "team_factor": team_factor_by_player.get(p.id),
                        "tournament_team_factor": tournament_team_factor_by_player.get(p.id),
                        "S": S,
                        "alpha": alpha,
                        "beta": beta,
                        "targets": {"avg": avg_price, "min": pmin_target, "max": pmax_target},
                        "weights": {
                            "rating": weight_rating,
                            "kdr": weight_kdr,
                            "adr": weight_adr,
                            "fpm": weight_fpm,
                            "team": weight_team,
                        },
                        "norm": {
                            "rating_min": rmin,
                            "rating_max": rmax,
                            "kdr_min": kmin,
                            "kdr_max": kmax,
                            "adr_min": amin,
                            "adr_max": amax,
                            "fpm_min": fmin,
                            "fpm_max": fmax,
                        },
                    },
                },
            )
            upserts += 1
        else:
            PlayerPrice.objects.update_or_create(
                tournament_id=tournament_id,
                player_id=p.id,
                defaults={
                    "price": default_price,
                    "source": source_label,
                    "calc_meta": {"default_price": True, "reason": "no_hltv_stats"},
                },
            )
            upserts += 1

    return upserts

# =================== draft logic ===================

def get_draft_state(user: User, league_id: int) -> Dict[str, Any]:
    league = League.objects.select_related("tournament").get(id=league_id)

    # Обеспечиваем наличие fantasy-команды для пользователя
    ft, _ = FantasyTeam.objects.get_or_create(
        user=user,
        league=league,
        defaults={"user_name": user.username, "budget_left": league.budget},
    )

    participants_count = FantasyTeam.objects.filter(league=league).count()

    # Текущий ростер
    roster_qs = (
        FantasyRoster.objects
        .select_related("player", "player__team")
        .filter(fantasy_team=ft)
    )

    roster_player_ids = list(roster_qs.values_list("player_id", flat=True))

    # Map: цена игрока в текущем турнире
    price_by_player = {}
    if league.tournament_id and roster_player_ids:
        price_by_player = dict(
            PlayerPrice.objects
            .filter(tournament_id=league.tournament_id, player_id__in=roster_player_ids)
            .values_list("player_id", "price")
        )

    # Map: total/avg фэнтези-очков по этому турниру
    total_by_player: Dict[int, float] = {}
    avg_by_player: Dict[int, float] = {}
    if league.tournament_id and roster_player_ids:
        fpts_rows = (
            FantasyPoints.objects
            .filter(player_id__in=roster_player_ids, map__match__tournament_id=league.tournament_id)
            .values("player_id")
            .annotate(total=Coalesce(Cast(Sum("points"), FloatField()), 0.0),
                      avg=Coalesce(Cast(Avg("points"), FloatField()), 0.0))
        )
        for r in fpts_rows:
            pid = r["player_id"]
            total_by_player[pid] = float(r["total"] or 0.0)
            avg_by_player[pid] = float(r["avg"] or 0.0)

    roster = [
        {
            "player_id": r.player_id,
            "player_name": r.player.nickname,
            "team_id": r.player.team_id,
            "team_name": getattr(r.player.team, "name", None),
            # добавили:
            "price": price_by_player.get(r.player_id),
            "fantasy_pts": round(total_by_player.get(r.player_id, 0.0), 2)
                           if r.player_id in total_by_player else None,
            "fppg": round(avg_by_player.get(r.player_id, 0.0), 2)
                    if r.player_id in avg_by_player else None,
        }
        for r in roster_qs
    ]

    # Счётчик игроков по реальным командам — для ограничения "max per team"
    team_counts: Dict[str, int] = {}
    for r in roster_qs:
        tid = r.player.team_id
        if tid:
            k = str(tid)
            team_counts[k] = team_counts.get(k, 0) + 1

    # Маркет по ценам текущего турнира
    market_qs = (
        PlayerPrice.objects
        .select_related("player", "player__team")
        .filter(tournament=league.tournament)
        .order_by(
            "player__team__world_rank",   # сначала по месту команды в рейтинге (1,2,3,...)
            "player__team__name",         # потом по названию команды
            "-price",                     # внутри команды — по цене (дороже выше)
            "player__nickname",           # и по нику
        )
    )

    market = [
        {
            "player_id": pp.player_id,
            "player_name": pp.player.nickname,
            "team_id": pp.player.team_id,
            "team_name": getattr(pp.player.team, "name", None),
            "team_world_rank": getattr(pp.player.team, "world_rank", None),
            "price": pp.price,
        }
        for pp in market_qs
    ]

    # Флаги и лимиты, которые ждёт фронт
    state = {
        "league": {"id": league.id, "name": league.name, "tournament": league.tournament_id},
        "tournament": {"id": league.tournament_id, "name": league.tournament.name} if league.tournament_id else None,
        "tournament_id": league.tournament_id,

        "fantasy_team": {"id": ft.id, "budget_left": ft.budget_left},
        "participants": participants_count,
        "started": False,                         # можно заменить реальной логикой старта турнира
        "limits": {"slots": 5, "max_per_team": 2},
        "team_counts": team_counts,

        "roster": roster,
        "market": market,
    }
    return state


@transaction.atomic
def handle_draft_buy(user: User, league_id: int, player_id: int) -> Dict[str, Any]:
    league = League.objects.select_related("tournament").get(id=league_id)
    ft = FantasyTeam.objects.select_for_update().get(user=user, league=league)
    price = PlayerPrice.objects.filter(tournament=league.tournament_id, player_id=player_id).values_list("price", flat=True).first() or 0
    if FantasyRoster.objects.filter(fantasy_team=ft).count() >= 5:
        return {"error": "Roster full"}
    if ft.budget_left < price:
        return {"error": "Not enough budget"}
    FantasyRoster.objects.create(fantasy_team=ft, player_id=player_id)
    ft.budget_left -= price
    ft.save(update_fields=["budget_left"])
    return {"ok": True, "budget_left": ft.budget_left}


@transaction.atomic
def handle_draft_sell(user: User, league_id: int, player_id: int) -> Dict[str, Any]:
    league = League.objects.select_related("tournament").get(id=league_id)
    ft = FantasyTeam.objects.select_for_update().get(user=user, league=league)
    price = PlayerPrice.objects.filter(tournament=league.tournament_id, player_id=player_id).values_list("price", flat=True).first() or 0
    row = FantasyRoster.objects.filter(fantasy_team=ft, player_id=player_id).first()
    if not row:
        return {"error": "Player not in roster"}
    row.delete()
    ft.budget_left += price
    ft.save(update_fields=["budget_left"])
    return {"ok": True, "budget_left": ft.budget_left}


def get_player_summary(player_id: int, tournament_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Краткая сводка по игроку (используется в модалке).
    Оставлено минимально необходимое; дополнительные поля можно добавить при необходимости.
    """
    qs = PlayerMapStats.objects.filter(player_id=player_id)
    if tournament_id:
        qs = qs.filter(map__match__tournament_id=tournament_id)

    maps_cnt = qs.count()
    kills = qs.aggregate(total=Sum("kills")).get("total") or 0
    deaths = qs.aggregate(total=Sum("deaths")).get("total") or 0
    kd = round(kills / deaths, 2) if deaths else None

    # Фэнтези-очки из FantasyPoints
    fpts_qs = FantasyPoints.objects.filter(player_id=player_id)
    if tournament_id:
        fpts_qs = fpts_qs.filter(map__match__tournament_id=tournament_id)

    total_fp = float(fpts_qs.aggregate(total=Sum("points")).get("total") or 0.0)
    maps_with_fp = int(fpts_qs.values("map_id").distinct().count())
    fppg = round(total_fp / maps_with_fp, 2) if maps_with_fp else None

    return {
        "maps": maps_cnt,
        "kills": kills,
        "deaths": deaths,
        "kd": kd,
        "fantasy_pts": round(total_fp, 2) if maps_with_fp else None,
        "fppg": fppg,
    }


# ====== Пересчёт очков ======

def recalc_map(map_id: int) -> int:
    """
    Пересчитать FantasyPoints для одной карты.
    Возвращает количество апсертов в FantasyPoints.
    """
    game_map = (
        Map.objects
        .select_related("match")
        .get(id=map_id)
    )
    tournament_id = game_map.match.tournament_id

    # Все статы на карте
    stats: Iterable[PlayerMapStats] = (
        PlayerMapStats.objects
        .select_related("player", "player__team")
        .filter(map_id=map_id)
    )

    # Все ростеры лиг этого турнира
    rosters = (
        FantasyRoster.objects
        .select_related("fantasy_team", "fantasy_team__league", "player", "player__team")
        .filter(fantasy_team__league__tournament_id=tournament_id)
    )

    # Индексация: игрок -> [(fantasy_team_id, role_badge)]
    roster_by_player: dict[int, list[tuple[int, str | None]]] = {}
    for r in rosters:
        roster_by_player.setdefault(r.player_id, []).append((r.fantasy_team_id, r.role_badge or None))

    upserts = 0
    with transaction.atomic():
        for s in stats:
            stat_dict = {
                "kills": s.kills, "assists": s.assists, "deaths": s.deaths,
                "opening_kills": s.opening_kills, "opening_deaths": s.opening_deaths,
                "mk_3k": s.mk_3k, "mk_4k": s.mk_4k, "mk_5k": s.mk_5k,
                "cl_1v2": s.cl_1v2, "cl_1v3": s.cl_1v3, "cl_1v4": s.cl_1v4, "cl_1v5": s.cl_1v5,
                "hs": s.hs,
                "adr": float(s.adr) if s.adr is not None else None,
                "rating2": float(s.rating2) if s.rating2 is not None else None,
            }

            # Победителя карты в модели нет — передаём None
            for ft_id, role_badge in roster_by_player.get(s.player_id, []):
                pts, br = calc_points(
                    stat=stat_dict,
                    played_rounds=game_map.played_rounds,
                    winner_team_id=None,
                    player_team_id=s.player.team_id,
                    role_badge=role_badge,
                )
                FantasyPoints.objects.update_or_create(
                    fantasy_team_id=ft_id,
                    map_id=game_map.id,
                    player_id=s.player_id,
                    defaults={"points": pts, "breakdown": br},
                )
                upserts += 1

    return upserts


def recalc_tournament(tournament_id: int) -> int:
    total = 0
    for m in Map.objects.select_related("match").filter(match__tournament_id=tournament_id):
        total += recalc_map(m.id)
    return total


def recalc_fantasy_points(scope: str, obj_id: int) -> int:
    if scope == "map":
        return recalc_map(int(obj_id))
    if scope == "tournament":
        return recalc_tournament(int(obj_id))
    raise ValueError("scope must be 'map' or 'tournament'")
