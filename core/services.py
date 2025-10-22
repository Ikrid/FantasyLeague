from typing import Iterable
from datetime import timedelta, datetime

from django.db import transaction
from django.utils import timezone
from django.db.models import Q, Sum, Count, Avg, Min, FloatField, F
from django.db.models.functions import Cast, Coalesce
from django.core.exceptions import ValidationError

from .models import (
    Map, PlayerMapStats, FantasyTeam, FantasyRoster, FantasyPoints,
    Tournament, Team, Player, PlayerPrice, League
)
from .scoring import calc_points


# ====== Пересчёт очков ======

def recalc_map(map_id: int) -> int:
    game_map = Map.objects.select_related('match', 'winner_team').get(id=map_id)
    t_id = game_map.match.tournament_id

    stats: Iterable[PlayerMapStats] = (
        PlayerMapStats.objects
        .select_related('player', 'player__team')
        .filter(map_id=map_id)
    )

    rosters = (
        FantasyRoster.objects
        .select_related('fantasy_team', 'fantasy_team__league', 'player', 'player__team')
        .filter(fantasy_team__league__tournament_id=t_id)
    )

    roster_by_player: dict[int, list[tuple[int, str | None]]] = {}
    for r in rosters:
        roster_by_player.setdefault(r.player_id, []).append((r.fantasy_team_id, r.role_badge or None))

    upserts = 0
    with transaction.atomic():
        for s in stats:
            player_team_id = s.player.team_id
            stat_dict = {
                "kills": s.kills, "assists": s.assists, "deaths": s.deaths,
                "opening_kills": s.opening_kills, "opening_deaths": s.opening_deaths,
                "mk_3k": s.mk_3k, "mk_4k": s.mk_4k, "mk_5k": s.mk_5k,
                "cl_1v2": s.cl_1v2, "cl_1v3": s.cl_1v3, "cl_1v4": s.cl_1v4, "cl_1v5": s.cl_1v5,
                "hs": s.hs, "adr": float(s.adr) if s.adr is not None else None,
                "rating2": float(s.rating2) if s.rating2 is not None else None,
            }

            for ft_id, role_badge in roster_by_player.get(s.player_id, []):
                pts, br = calc_points(
                    stat=stat_dict,
                    played_rounds=game_map.played_rounds,
                    winner_team_id=game_map.winner_team_id,
                    player_team_id=player_team_id,
                    role_badge=role_badge
                )
                FantasyPoints.objects.update_or_create(
                    fantasy_team_id=ft_id, map_id=game_map.id, player_id=s.player_id,
                    defaults={"points": pts, "breakdown": br}
                )
                upserts += 1
    return upserts


def recalc_tournament(tournament_id: int) -> int:
    maps_qs = Map.objects.select_related('match').filter(match__tournament_id=tournament_id)
    total = 0
    for m_obj in maps_qs:
        total += recalc_map(m_obj.id)
    return total


# ====== Генерация цен для рынка ======

def _team_factor(rank: int | None, max_rank: int = 50) -> float:
    if not rank or rank <= 0:
        return 0.5
    r = min(rank, max_rank)
    return 1.0 - (r / max_rank)


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
    now = timezone.now()
    since = now - timedelta(days=use_days_window)

    # Основной источник команд — участники матчей турнира
    team_ids = list(
        Team.objects
        .filter(
            Q(match_team1__tournament_id=tournament_id) |
            Q(match_team2__tournament_id=tournament_id)
        )
        .values_list("id", flat=True)
        .distinct()
    )

    # Fallback: если матчей нет, берём все команды, у которых есть игроки
    if not team_ids:
        team_ids = list(
            Player.objects
            .exclude(team_id__isnull=True)
            .values_list("team_id", flat=True)
            .distinct()
        )

    # Если даже так пусто — берём всех игроков
    if team_ids:
        players = Player.objects.filter(team_id__in=team_ids).select_related("team")
    else:
        players = Player.objects.all().select_related("team")

    player_ids = list(players.values_list("id", flat=True))
    if not player_ids:
        return 0

    stats_qs = (
        PlayerMapStats.objects
        .select_related("map", "map__match", "player", "player__team")
        .filter(player_id__in=player_ids, map__match__start_time__gte=since, map__match__start_time__lte=now)
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

    # Средние очки по игрокам (points — DecimalField → кастуем в float + задаём output_field)
    fpm_qs = (
        FantasyPoints.objects
        .filter(player_id__in=player_ids)
        .values("player_id")
        .annotate(
            avg=Coalesce(
                Cast(Avg("points"), FloatField()),
                0.0,
                output_field=FloatField()
            )
        )
    )
    fpm_map = {r["player_id"]: float(r["avg"]) for r in fpm_qs}

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
            rating_avg = None
            adr_avg = None
            kdr = None
        metrics[pid] = {"rating": rating_avg, "kdr": kdr, "adr": adr_avg, "fpm": fpm_map.get(pid)}

    def collect_clean(key):
        vals = []
        for _pid, mtr in metrics.items():
            v = mtr.get(key)
            if v is not None and v == v:
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
    for p in players:
        mtr = metrics.get(p.id, {})
        nr = norm_rating(mtr.get("rating"))
        nk = norm_kdr(mtr.get("kdr"))
        na = norm_adr(mtr.get("adr"))
        nf = norm_fpm(mtr.get("fpm"))
        tf = _team_factor(getattr(p.team, "world_rank", None), max_rank=max_rank)

        S = (weight_rating * nr +
             weight_kdr * nk +
             weight_adr * na +
             weight_fpm * nf +
             weight_team * tf)

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
                defaults={
                    "price": avg_price,
                    "source": source_label,
                    "calc_meta": {"reason": "flat_avg_no_variance", "avg_price": avg_price}
                }
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
                    "norm": {
                        "rating_min": rmin, "rating_max": rmax,
                        "kdr_min": kmin, "kdr_max": kmax,
                        "adr_min": amin, "adr_max": amax,
                        "fpm_min": fmin, "fpm_max": fmax,
                    },
                    "team_factor": team_factor_by_player[p.id],
                    "S": S,
                    "alpha": alpha, "beta": beta,
                    "targets": {"avg": avg_price, "min": pmin_target, "max": pmax_target},
                    "weights": {
                        "rating": weight_rating, "kdr": weight_kdr,
                        "adr": weight_adr, "fpm": weight_fpm, "team": weight_team
                    }
                }
            }
        )
        upserts += 1
    return upserts


# ====== Драфт: глобальный lock и ограничения ======

MAX_ROSTER_SIZE = 5
MAX_PER_REAL_TEAM = 2  # не больше 2 игроков из одной команды


def _get_or_create_fantasy_team(league_id: int, user_name: str) -> FantasyTeam:
    """
    Создаёт команду с бюджетом лиги.
    Если команда уже есть, но budget_left <= 0 и ростер пуст — синхронизируем с бюджетом лиги.
    """
    league = League.objects.get(id=league_id)
    ft, created = FantasyTeam.objects.get_or_create(
        league_id=league_id,
        user_name=user_name,
        defaults={"budget_left": league.budget}
    )
    if created:
        return ft

    # проверяем пустой ростер явным запросом
    roster_empty = not FantasyRoster.objects.filter(fantasy_team=ft).exists()
    if (ft.budget_left is None or ft.budget_left <= 0) and roster_empty:
        ft.budget_left = league.budget
        ft.save(update_fields=["budget_left"])
    return ft


def _tournament_started_for_league(league: League) -> bool:
    now = timezone.now()
    first_match = (
        Map.objects
        .filter(match__tournament_id=league.tournament_id)
        .aggregate(first=Min("match__start_time"))
    )["first"]

    if first_match:
        return now >= first_match

    t = league.tournament
    if t and t.start_date:
        start_dt = timezone.make_aware(datetime.combine(t.start_date, datetime.min.time()))
        return now >= start_dt
    return False


def buy_player(league_id: int, user_name: str, player_id: int) -> dict:
    league = League.objects.select_related("tournament").get(id=league_id)

    if _tournament_started_for_league(league):
        raise ValidationError("Draft is locked: tournament already started.")

    ft = _get_or_create_fantasy_team(league_id, user_name)

    if FantasyRoster.objects.filter(fantasy_team=ft).count() >= MAX_ROSTER_SIZE:
        raise ValidationError("Roster is full (5/5).")

    if FantasyRoster.objects.filter(fantasy_team=ft, player_id=player_id).exists():
        raise ValidationError("Player already in roster.")

    player = Player.objects.select_related("team").get(id=player_id)
    if player.team_id:
        same_team_count = (
            FantasyRoster.objects
            .filter(fantasy_team=ft, player__team_id=player.team_id)
            .count()
        )
        if same_team_count >= MAX_PER_REAL_TEAM:
            raise ValidationError(f"Too many players from the same team (max {MAX_PER_REAL_TEAM}).")

    pp = PlayerPrice.objects.filter(tournament=league.tournament_id, player_id=player_id).first()
    if not pp:
        raise ValidationError("Price for this player is not set for league tournament.")

    if ft.budget_left < pp.price:
        raise ValidationError("Not enough budget.")

    with transaction.atomic():
        FantasyRoster.objects.create(fantasy_team=ft, player_id=player_id)
        ft.budget_left -= pp.price
        ft.save(update_fields=["budget_left"])

    return {"team_id": ft.id, "budget_left": ft.budget_left}


def sell_player(league_id: int, user_name: str, player_id: int) -> dict:
    league = League.objects.select_related("tournament").get(id=league_id)

    if _tournament_started_for_league(league):
        raise ValidationError("Draft is locked: tournament already started.")

    ft = _get_or_create_fantasy_team(league_id, user_name)

    r = FantasyRoster.objects.filter(fantasy_team=ft, player_id=player_id).first()
    if not r:
        raise ValidationError("Player not in roster.")

    pp = PlayerPrice.objects.filter(tournament=league.tournament_id, player_id=player_id).first()
    price = pp.price if pp else 0

    with transaction.atomic():
        r.delete()
        ft.budget_left += price
        ft.save(update_fields=["budget_left"])

    return {"team_id": ft.id, "budget_left": ft.budget_left}


def draft_state(league_id: int, user_name: str) -> dict:
    league = League.objects.select_related("tournament").get(id=league_id)
    ft = _get_or_create_fantasy_team(league_id, user_name)

    started = _tournament_started_for_league(league)

    # roster: player_name / team_name для фронта
    roster_qs = (
        FantasyRoster.objects
        .select_related("player", "player__team")
        .filter(fantasy_team=ft)
        .values("player_id")
        .annotate(
            player_name=F("player__nickname"),
            team_name=F("player__team__name"),
            player__team_id=F("player__team_id"),
        )
    )
    roster = []
    for r in roster_qs:
        roster.append({
            "player_id": r["player_id"],
            "player_name": r["player_name"],
            "team_name": r["team_name"],
            "player__team_id": r["player__team_id"],
        })

    # market: player_name / team_name
    market_qs = (
        PlayerPrice.objects
        .select_related("player", "player__team")
        .filter(tournament=league.tournament_id)
        .order_by("-price")
        .values("player_id", "price")
        .annotate(
            player_name=F("player__nickname"),
            team_name=F("player__team__name"),
            team_id=F("player__team_id"),
        )
    )
    market = list(market_qs)

    # ограничения по командам
    team_counts: dict[int, int] = {}
    for r in roster:
        tid = r.get("player__team_id")
        if tid:
            team_counts[tid] = team_counts.get(tid, 0) + 1

    # === КОНТРАКТ ДЛЯ ФРОНТА ===
    return {
        "tournament": {"id": league.tournament_id},
        "tournament_id": league.tournament_id,     # для обратной совместимости
        "league": {"id": league.id, "name": league.name, "tournament": league.tournament_id},

        "fantasy_team": {"id": ft.id, "user_name": ft.user_name, "budget_left": ft.budget_left},
        "budget_left": ft.budget_left,             # дубликат для бэкап-логики в UI

        "roster": roster,
        "market": market,

        "limits": {"slots": MAX_ROSTER_SIZE, "max_per_team": MAX_PER_REAL_TEAM},
        "started": started,
        "team_counts": team_counts,
    }
