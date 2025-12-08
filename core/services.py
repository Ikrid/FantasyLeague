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
    weight_rating: float = 0.45,
    weight_kdr: float = 0.20,
    weight_adr: float = 0.15,
    weight_fpm: float = 0.15,
    weight_team: float = 0.15,
    max_rank: int = 50,
    avg_price_mult: float = 1.0,
    flank_min_mult: float = 0.85,
    flank_max_mult: float = 1.25,
    source_label: str = "AUTO",
) -> int:
    """Генерация цен игроков турнира по статистике."""
    now = timezone.now()
    since = now - timedelta(days=use_days_window)

    # --- участники турнира
    team_ids = list(_team_ids_for_tournament(tournament_id))
    if not team_ids:
        return 0

    players = Player.objects.filter(team_id__in=team_ids).select_related("team")
    player_ids = list(players.values_list("id", flat=True))
    if not player_ids:
        return 0

    # агрегаты по статистике
    stats_qs = (
        PlayerMapStats.objects
        .select_related("map", "map__match", "player", "player__team")
        .filter(
            player_id__in=player_ids,
            map__match__start_time__gte=since,
            map__match__start_time__lte=now
        )
        .values("player_id")
        .annotate(
            kills=Coalesce(Sum("kills"), 0),
            deaths=Coalesce(Sum("deaths"), 0),
            adr_sum=Coalesce(Sum(Cast("adr", FloatField())), 0.0),
            adr_cnt=Coalesce(Count("id"), 0),
            rating_sum=Coalesce(Sum(Cast("rating2", FloatField())), 0.0),
            rating_cnt=Coalesce(Count("id"), 0),
        )
    )
    agg = {row["player_id"]: row for row in stats_qs}

    # средние fantasy-поинты
    fpm_qs = (
        FantasyPoints.objects
        .filter(player_id__in=player_ids)
        .values("player_id")
        .annotate(avg=Coalesce(Cast(Avg("points"), FloatField()), 0.0))
    )
    fpm_map = {r["player_id"]: float(r["avg"]) for r in fpm_qs}

    # подготовка метрик
    metrics: dict[int, dict] = {}
    for pid in player_ids:
        row = agg.get(pid)
        if row:
            k = float(row["kills"])
            d = float(row["deaths"])
            adr_avg = float(row["adr_sum"] / row["adr_cnt"]) if row["adr_cnt"] else None
            rating_avg = float(row["rating_sum"] / row["rating_cnt"]) if row["rating_cnt"] else None
            kdr = (k / d) if d > 0 else (k if k > 0 else 0.0)
        else:
            rating_avg = adr_avg = kdr = None
        metrics[pid] = {"rating": rating_avg, "kdr": kdr, "adr": adr_avg, "fpm": fpm_map.get(pid)}

    def collect_clean(key):
        return [float(v) for v in (m.get(key) for m in metrics.values()) if v is not None]

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

    # скоринг
    score_by_player: dict[int, float] = {}
    team_factor_by_player: dict[int, float] = {}
    for p in players:
        mtr = metrics.get(p.id, {})
        nr = norm_rating(mtr.get("rating"))
        nk = norm_kdr(mtr.get("kdr"))
        na = norm_adr(mtr.get("adr"))
        nf = norm_fpm(mtr.get("fpm"))
        tf = _team_factor(getattr(p.team, "world_rank", None), max_rank=max_rank)
        S = (weight_rating * nr + weight_kdr * nk + weight_adr * na + weight_fpm * nf + weight_team * tf)
        score_by_player[p.id] = S
        team_factor_by_player[p.id] = tf

    S_values = list(score_by_player.values())
    Smin, Smax = min(S_values), max(S_values)
    avg_price = int((budget / slots) * avg_price_mult)
    pmin_target = int(avg_price * flank_min_mult)
    pmax_target = int(avg_price * flank_max_mult)

    upserts = 0
    if Smax - Smin < 1e-9:
        for p in players:
            PlayerPrice.objects.update_or_create(
                tournament_id=tournament_id, player_id=p.id,
                defaults={"price": avg_price, "source": source_label, "calc_meta": {"flat": True}}
            )
            upserts += 1
        return upserts

    beta = (pmax_target - pmin_target) / (Smax - Smin)
    alpha = pmin_target - beta * Smin

    for p in players:
        S = score_by_player[p.id]
        price = int(round(alpha + beta * S))
        PlayerPrice.objects.update_or_create(
            tournament_id=tournament_id, player_id=p.id,
            defaults={
                "price": price,
                "source": source_label,
                "calc_meta": {
                    "rating": metrics[p.id].get("rating"),
                    "kdr": metrics[p.id].get("kdr"),
                    "adr": metrics[p.id].get("adr"),
                    "fpm": metrics[p.id].get("fpm"),
                    "team_factor": team_factor_by_player[p.id],
                    "S": S,
                    "alpha": alpha, "beta": beta,
                    "targets": {"avg": avg_price, "min": pmin_target, "max": pmax_target},
                    "weights": {"rating": weight_rating, "kdr": weight_kdr, "adr": weight_adr, "fpm": weight_fpm, "team": weight_team},
                    "norm": {
                        "rating_min": rmin, "rating_max": rmax,
                        "kdr_min": kmin, "kdr_max": kmax,
                        "adr_min": amin, "adr_max": amax,
                        "fpm_min": fmin, "fpm_max": fmax,
                    },
                },
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
        .order_by("-price")
    )
    market = [
        {
            "player_id": pp.player_id,
            "player_name": pp.player.nickname,
            "team_id": pp.player.team_id,
            "team_name": getattr(pp.player.team, "name", None),
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
