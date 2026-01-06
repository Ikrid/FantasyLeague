from math import ceil

from django.db import transaction
from django.db.models.functions import Coalesce
from rest_framework import viewsets, generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, Count, Avg
from django.utils import timezone
import re
from django.db.models import Sum, Count, Case, When, Value, FloatField

from .hltv_tournament_scraper import import_tournament_full
from .models import (
    Team, Player, Tournament, League,
    FantasyTeam, FantasyRoster, Match,
    Map, PlayerMapStats, FantasyPoints,
    PlayerPrice, TournamentTeam, PlayerHLTVStats
)
from .serializers import *
from .services import (
    recalc_fantasy_points,
    generate_market_prices_for_tournament,
    get_draft_state,
    handle_draft_buy,
    handle_draft_sell,
    get_player_summary,
    handle_draft_lock,    # ✅ added
    handle_draft_unlock,  # ✅ added
)
from .roles import ROLES  # ✅ for role validation


def _tournament_started(tournament) -> bool:
    """
    Турнир считаем начавшимся, если есть хотя бы 1 матч со start_time <= now.
    Это нужно, чтобы запретить Unlock/изменения ростера после старта.
    """
    if not tournament:
        return False
    return Match.objects.filter(
        tournament=tournament,
        start_time__lte=timezone.now()
    ).exists()


# TEAM
class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.all().order_by("id")
    serializer_class = TeamSerializer
    permission_classes = [AllowAny]


# PLAYER
class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.select_related("team").all().order_by("id")
    serializer_class = PlayerSerializer
    permission_classes = [AllowAny]


# TOURNAMENT
class TournamentViewSet(viewsets.ModelViewSet):
    queryset = Tournament.objects.all().order_by("id")
    serializer_class = TournamentSerializer
    permission_classes = [AllowAny]


# TOURNAMENT PARTICIPANTS
class TournamentTeamViewSet(viewsets.ModelViewSet):
    queryset = TournamentTeam.objects.select_related("tournament", "team").all().order_by("id")
    serializer_class = TournamentTeamSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        t = self.request.query_params.get("tournament")
        team = self.request.query_params.get("team")
        if t:
            try:
                qs = qs.filter(tournament_id=int(t))
            except:
                pass
        if team:
            try:
                qs = qs.filter(team_id=int(team))
            except:
                pass
        return qs


# LEAGUE
class LeagueViewSet(viewsets.ModelViewSet):
    queryset = League.objects.select_related("tournament").all().order_by("id")
    serializer_class = LeagueSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = self.queryset.annotate(
            participants_count=Count("fantasyteam")
        )
        t = self.request.query_params.get("tournament")
        if t:
            try:
                qs = qs.filter(tournament_id=int(t))
            except (TypeError, ValueError):
                pass
        return qs


# FANTASY TEAM
class FantasyTeamViewSet(viewsets.ModelViewSet):
    queryset = FantasyTeam.objects.select_related("league").all().order_by("id")
    serializer_class = FantasyTeamSerializer
    permission_classes = [AllowAny]


# FANTASY ROSTER
class FantasyRosterViewSet(viewsets.ModelViewSet):
    queryset = FantasyRoster.objects.select_related("player", "fantasy_team").all().order_by("id")
    serializer_class = FantasyRosterSerializer
    permission_classes = [AllowAny]


# MATCH
class MatchViewSet(viewsets.ModelViewSet):
    queryset = Match.objects.select_related("tournament", "team1", "team2").all().order_by("id")
    serializer_class = MatchSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        t = self.request.query_params.get("tournament")
        if t:
            try:
                qs = qs.filter(tournament_id=int(t))
            except:
                pass
        return qs


# MAP
class MapViewSet(viewsets.ModelViewSet):
    queryset = Map.objects.select_related("match").all().order_by("id")
    serializer_class = MapSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        m = self.request.query_params.get("match")
        if m:
            try:
                qs = qs.filter(match_id=int(m))
            except:
                pass
        return qs


# PLAYER MAP STATS
class PlayerMapStatsViewSet(viewsets.ModelViewSet):
    queryset = PlayerMapStats.objects.select_related("map", "player").all().order_by("id")
    serializer_class = PlayerMapStatsSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        map_id = self.request.query_params.get("map")
        player_id = self.request.query_params.get("player")
        match_id = self.request.query_params.get("match")
        if map_id:
            try:
                qs = qs.filter(map_id=int(map_id))
            except:
                pass
        if player_id:
            try:
                qs = qs.filter(player_id=int(player_id))
            except:
                pass
        if match_id:
            try:
                qs = qs.filter(map__match_id=int(match_id))
            except:
                pass
        return qs


# MARKET
class MarketViewSet(viewsets.ModelViewSet):
    queryset = PlayerPrice.objects.select_related("player", "tournament", "player__team").all().order_by("-updated_at")
    serializer_class = PlayerPriceSerializer
    permission_classes = [AllowAny]


# ADMIN — RECALCULATE
class AdminRecalcView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scope = request.data.get("scope")
        obj_id = request.data.get("id")
        if not scope or not obj_id:
            return Response({"error": "scope and id required"}, status=400)
        recalc_fantasy_points(scope, obj_id)
        return Response({"status": "ok"})


# MARKET GENERATION
class MarketGenerateView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, *args, **kwargs):
        tournament_id = request.data.get("tournament") or request.data.get("tournament_id")
        if not tournament_id:
            return Response({"detail": "tournament is required"}, status=status.HTTP_400_BAD_REQUEST)

        if not Tournament.objects.filter(id=tournament_id).exists():
            return Response({"detail": "Tournament not found"}, status=status.HTTP_404_NOT_FOUND)

        budget = int(request.data.get("budget") or 1_000_000)
        slots = int(request.data.get("slots") or 5)

        with transaction.atomic():
            upserts = generate_market_prices_for_tournament(
                int(tournament_id),
                budget=budget,
                slots=slots,
                source_label="ADMIN",
            )

        return Response({"ok": True, "upserts": upserts}, status=status.HTTP_200_OK)


# =========================
# DRAFT
# =========================

# DRAFT — STATE
class DraftStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, league_id):
        user = request.user
        state = get_draft_state(user, league_id)

        league = League.objects.select_related("tournament").get(id=league_id)
        t = league.tournament

        t_finished = t.is_finished()
        t_started = _tournament_started(t)

        ft = FantasyTeam.objects.filter(user=user, league=league).first()
        roster_locked = bool(getattr(ft, "roster_locked", False))

        draft_locked = t_finished or t_started or roster_locked

        state["locked"] = t_finished
        state["started"] = draft_locked

        state["roster_locked"] = roster_locked
        state["tournament_started"] = t_started

        state["can_unlock"] = roster_locked and (not t_started) and (not t_finished)

        slots = getattr(league, "max_badges", None) or getattr(league, "slots", None) or 5
        roster_count = 0
        if ft:
            roster_count = FantasyRoster.objects.filter(fantasy_team=ft).count()

        state["can_lock"] = (not t_finished) and (not t_started) and (not roster_locked) and (roster_count == slots)

        return Response(state)


# DRAFT — BUY
class DraftBuyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        league_id = request.data.get("league_id")

        league = League.objects.select_related("tournament").get(id=league_id)
        t = league.tournament

        if t.is_finished():
            return Response({"error": "Tournament is finished. Draft is locked."}, status=403)

        if _tournament_started(t):
            return Response({"error": "Tournament already started. Draft is locked."}, status=403)

        ft = FantasyTeam.objects.filter(user=user, league=league).first()
        if ft and getattr(ft, "roster_locked", False):
            return Response({"error": "Roster is locked. Unlock to edit."}, status=403)

        player_id = request.data.get("player_id")
        result = handle_draft_buy(user, league_id, player_id)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


# DRAFT — SELL
class DraftSellView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        league_id = request.data.get("league_id")

        league = League.objects.select_related("tournament").get(id=league_id)
        t = league.tournament

        if t.is_finished():
            return Response({"error": "Tournament is finished. Draft is locked."}, status=403)

        if _tournament_started(t):
            return Response({"error": "Tournament already started. Draft is locked."}, status=403)

        ft = FantasyTeam.objects.filter(user=user, league=league).first()
        if ft and getattr(ft, "roster_locked", False):
            return Response({"error": "Roster is locked. Unlock to edit."}, status=403)

        player_id = request.data.get("player_id")
        result = handle_draft_sell(user, league_id, player_id)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class DraftLockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        league_id = request.data.get("league_id")
        if not league_id:
            return Response({"detail": "league_id is required"}, status=400)

        league = League.objects.select_related("tournament").get(id=league_id)
        t = league.tournament

        if t.is_finished():
            return Response({"error": "Tournament is finished. Draft is locked."}, status=403)

        if _tournament_started(t):
            return Response({"error": "Tournament already started. Draft is locked."}, status=403)

        result = handle_draft_lock(request.user, int(league_id))
        if "error" in result:
            return Response(result, status=400)
        return Response(result, status=200)


class DraftUnlockView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        league_id = request.data.get("league_id")
        if not league_id:
            return Response({"detail": "league_id is required"}, status=400)

        league = League.objects.select_related("tournament").get(id=league_id)
        t = league.tournament

        if t.is_finished():
            return Response({"error": "Tournament is finished. Can't unlock."}, status=403)

        if _tournament_started(t):
            return Response({"error": "Tournament already started. Can't unlock."}, status=403)

        result = handle_draft_unlock(request.user, int(league_id))
        if "error" in result:
            return Response(result, status=400)
        return Response(result, status=200)


# ✅ DRAFT — SET ROLE (NEW)
class DraftSetRoleView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        league_id = request.data.get("league_id")
        player_id = request.data.get("player_id")
        role_badge = request.data.get("role_badge")  # may be None / "" to clear

        if not league_id or not player_id:
            return Response({"detail": "league_id and player_id are required"}, status=400)

        league = League.objects.select_related("tournament").get(id=int(league_id))
        t = league.tournament

        if t and t.is_finished():
            return Response({"error": "Tournament is finished. Can't change roles."}, status=403)

        if t and _tournament_started(t):
            return Response({"error": "Tournament already started. Can't change roles."}, status=403)

        ft = FantasyTeam.objects.filter(user=request.user, league=league).first()
        if not ft:
            return Response({"error": "Fantasy team not found"}, status=404)

        if getattr(ft, "roster_locked", False):
            return Response({"error": "Roster is locked. Unlock to edit."}, status=403)

        if role_badge is not None and str(role_badge).strip() == "":
            role_badge = None

        if role_badge is not None and str(role_badge) not in ROLES:
            return Response({"error": "Unknown role_badge"}, status=400)

        r = FantasyRoster.objects.filter(fantasy_team=ft, player_id=int(player_id)).first()
        if not r:
            return Response({"error": "Player not in roster"}, status=400)

        r.role_badge = role_badge
        r.save(update_fields=["role_badge"])

        return Response({"ok": True, "player_id": int(player_id), "role_badge": role_badge})


# AUTH
class RegisterView(generics.CreateAPIView):
    queryset = FantasyTeam.objects.none()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        u = request.user
        return Response({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "is_staff": u.is_staff,
        })


# PLAYER SUMMARY
class PlayerSummaryView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, player_id):
        tournament_id = request.query_params.get("tournament")

        data = get_player_summary(player_id, tournament_id) or {}

        hltv = PlayerHLTVStats.objects.filter(player_id=player_id).first()
        if hltv:
            data.update({
                "rating2": hltv.rating2,
                "kills_per_round": hltv.kills_per_round,
                "adr": hltv.adr,
                "opening_kills_per_round": hltv.opening_kills_per_round,
                "opening_deaths_per_round": hltv.opening_deaths_per_round,
                "win_after_opening": hltv.win_after_opening,
                "multikill_rounds_pct": hltv.multikill_rounds_pct,
                "clutch_points_per_round": hltv.clutch_points_per_round,
                "sniper_kills_per_round": hltv.sniper_kills_per_round,
                "utility_damage_per_round": hltv.utility_damage_per_round,
                "flash_assists_per_round": hltv.flash_assists_per_round,
            })

        return Response(data)


# MATCH → PLAYERS
class MatchPlayersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        match_id = request.query_params.get("match")
        if not match_id:
            return Response({"detail": "Param 'match' is required"}, status=400)

        try:
            m = Match.objects.get(pk=int(match_id))
        except:
            return Response({"detail": "Match not found"}, status=404)

        maps_qs = Map.objects.filter(match=m)
        players_qs = Player.objects.filter(playermapstats__map__in=maps_qs).distinct()
        data = PlayerSerializer(players_qs, many=True).data
        return Response(data)


class HLTVImportView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, *args, **kwargs):
        raw = (
            request.data.get("hltvId")
            or request.data.get("hltv_id")
            or request.data.get("hltv")
            or request.data.get("url")
        )

        if not raw:
            return Response(
                {"detail": "hltvId (или url) is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        value = str(raw).strip()
        event_arg = value

        try:
            budget = int(request.data.get("budget", 1000000))
            slots = int(request.data.get("slots", 5))
        except (TypeError, ValueError):
            return Response(
                {"detail": "budget и slots должны быть числами"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = import_tournament_full(event_arg)

            tournament_id = (
                result.get("tournament_id")
                or result.get("id")
                or (result.get("tournament") or {}).get("id")
            )

            if not tournament_id:
                return Response(
                    {"detail": "Tournament ID not found in import result"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            generate_market_prices_for_tournament(
                int(tournament_id),
                budget=budget,
                slots=slots,
            )

            result["market_status"] = "generated"

        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                {"detail": f"Import or market generation failed: {e.__class__.__name__}: {e}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(result, status=status.HTTP_200_OK)


# STANDINGS / LADDER
class LeagueStandingsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, league_id):
        try:
            league = League.objects.select_related("tournament").get(pk=league_id)
        except League.DoesNotExist:
            return Response({"detail": "League not found"}, status=404)

        page_size = 20
        raw_page = request.query_params.get("page", "1")
        try:
            page = int(raw_page)
        except ValueError:
            page = 1
        if page < 1:
            page = 1

        base_qs = (
            FantasyTeam.objects
            .filter(league=league)
            .select_related("user", "league")
            .annotate(roster_size=Count("fantasyroster", distinct=True))
            .order_by("id")
        )

        total_teams = base_qs.count()
        total_pages = ceil(total_teams / page_size) if total_teams else 1
        if page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size

        teams_page = list(base_qs[start:end])
        team_ids = [ft.id for ft in teams_page]

        roster_rows = (
            FantasyRoster.objects
            .filter(fantasy_team_id__in=team_ids)
            .values("fantasy_team_id", "player_id")
        )
        roster_players = {}
        for rr in roster_rows:
            roster_players.setdefault(rr["fantasy_team_id"], set()).add(rr["player_id"])

        points_rows = (
            FantasyPoints.objects
            .filter(fantasy_team_id__in=team_ids)
            .values("fantasy_team_id", "player_id")
            .annotate(pts=Coalesce(Sum("points"), 0.0))
        )

        points_by_team = {}
        for pr in points_rows:
            points_by_team.setdefault(pr["fantasy_team_id"], {})[pr["player_id"]] = float(pr["pts"] or 0.0)

        computed = []
        for ft in teams_page:
            pid_set = roster_players.get(ft.id, set())
            pmap = points_by_team.get(ft.id, {})
            total_pts = sum(pmap.get(pid, 0.0) for pid in pid_set)
            computed.append((ft, total_pts))

        computed.sort(key=lambda x: (-x[1], x[0].id))

        ladder = []
        for idx, (ft, pts) in enumerate(computed, start=0):
            rank = start + idx + 1
            ladder.append({
                "rank": rank,
                "fantasy_team_id": ft.id,
                "team_name": ft.user_name,
                "user_name": ft.user.username if ft.user_id else None,
                "total_points": float(pts),
                "roster_size": ft.roster_size,
                "budget_left": ft.budget_left,
            })

        league_data = {
            "id": league.id,
            "name": league.name,
            "tournament_id": league.tournament_id,
            "budget": league.budget,
            "max_badges": league.max_badges,
            "lock_policy": league.lock_policy,
        }

        return Response(
            {
                "league": league_data,
                "ladder": ladder,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total_teams": total_teams,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1,
                },
            }
        )


class TournamentTopPlayersView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, tournament_id):
        try:
            tournament = Tournament.objects.get(pk=tournament_id)
        except Tournament.DoesNotExist:
            return Response({"detail": "Tournament not found"}, status=404)

        qs = (
            FantasyRoster.objects
            .filter(fantasy_team__league__tournament=tournament)
            .values("player_id")
            .annotate(picks_count=Count("id"))
            .order_by("-picks_count", "player_id")[:8]
        )

        player_ids = [row["player_id"] for row in qs]
        players_by_id = {
            p.id: p
            for p in Player.objects.select_related("team").filter(id__in=player_ids)
        }

        top_players = []
        for row in qs:
            pid = row["player_id"]
            player = players_by_id.get(pid)

            if player is not None:
                name = (
                    getattr(player, "nickname", None)
                    or getattr(player, "name", None)
                    or getattr(player, "full_name", None)
                    or str(player)
                )
                nationality = (
                    getattr(player, "nationality_code", None)
                    or getattr(player, "country_code", None)
                    or ""
                )
            else:
                name = f"Player {pid}"
                nationality = ""

            top_players.append({
                "player_id": pid,
                "player_name": name,
                "picks_count": row["picks_count"],
                "player_nationality_code": nationality,
            })

        return Response({
            "tournament": {"id": tournament.id, "name": tournament.name},
            "top_players": top_players,
        })


class TournamentTopRolesView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, tournament_id):
        try:
            tournament = Tournament.objects.get(pk=tournament_id)
        except Tournament.DoesNotExist:
            return Response({"detail": "Tournament not found"}, status=404)

        qs = (
            FantasyRoster.objects
            .filter(fantasy_team__league__tournament=tournament)
            .exclude(role_badge__isnull=True)
            .exclude(role_badge="")
            .values("role_badge")
            .annotate(picks_count=Count("id"))
            .order_by("-picks_count", "role_badge")[:8]
        )

        top_roles = [{"role_badge": r["role_badge"], "picks_count": r["picks_count"]} for r in qs]

        return Response({
            "tournament": {"id": tournament.id},
            "top_roles": top_roles,
        })


class FantasyPointsByMapView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        map_id = request.query_params.get("map")
        try:
            map_id = int(map_id)
        except Exception:
            return Response({"error": "map must be int"}, status=400)

        qs = (
            FantasyPoints.objects
            .filter(map_id=map_id, fantasy_team__roster_locked=True)
            .values("player_id", "player__nickname")
            .annotate(points=Sum("points"))
            .order_by("-points", "player__nickname")
        )
        return Response(list(qs))


class DraftPlayerMatchPointsView(APIView):
    """
    GET /api/draft/player-match-points?league_id=...&match_id=...&player_id=...&tournament=...
    Суммарные fantasy points игрока за матч (все карты матча) для текущего пользователя в этой лиге.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        league_id = request.query_params.get("league_id")
        match_id = request.query_params.get("match_id")
        player_id = request.query_params.get("player_id")
        tournament_id = request.query_params.get("tournament")

        if not league_id or not match_id or not player_id:
            return Response(
                {"detail": "league_id, match_id and player_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            league = League.objects.select_related("tournament").get(pk=int(league_id))
        except Exception:
            return Response({"detail": "League not found"}, status=status.HTTP_404_NOT_FOUND)

        if tournament_id:
            try:
                if int(tournament_id) != int(league.tournament_id):
                    return Response({"detail": "Tournament mismatch"}, status=400)
            except Exception:
                pass

        ft = FantasyTeam.objects.filter(user=request.user, league=league).first()
        if not ft:
            return Response({"detail": "Fantasy team not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            match = Match.objects.get(pk=int(match_id))
        except Exception:
            return Response({"detail": "Match not found"}, status=status.HTTP_404_NOT_FOUND)

        if league.tournament_id and getattr(match, "tournament_id", None) and match.tournament_id != league.tournament_id:
            return Response({"detail": "Match not in this tournament"}, status=400)

        map_ids = list(Map.objects.filter(match=match).values_list("id", flat=True))
        if not map_ids:
            return Response(
                {"detail": "No maps for match", "total_points": 0.0, "stats": {}},
                status=200,
            )

        pid = int(player_id)

        total_points = (
            FantasyPoints.objects
            .filter(fantasy_team=ft, player_id=pid, map_id__in=map_ids)
            .aggregate(total=Coalesce(Sum("points"), 0.0))
            .get("total", 0.0)
        )

        agg = (
            PlayerMapStats.objects
            .filter(player_id=pid, map_id__in=map_ids)
            .aggregate(
                kills=Coalesce(Sum("kills"), 0),
                deaths=Coalesce(Sum("deaths"), 0),
                assists=Coalesce(Sum("assists"), 0),
                hs=Coalesce(Sum("hs"), 0),
                opening_kills=Coalesce(Sum("opening_kills"), 0),
                opening_deaths=Coalesce(Sum("opening_deaths"), 0),
                flash_assists=Coalesce(Sum("flash_assists"), 0),
                mk_3k=Coalesce(Sum("mk_3k"), 0),
                mk_4k=Coalesce(Sum("mk_4k"), 0),
                mk_5k=Coalesce(Sum("mk_5k"), 0),
                utility_dmg_sum=Coalesce(Sum("utility_dmg"), 0.0),
                utility_dmg_avg=Avg("utility_dmg"),
                cl_1v2=Coalesce(Sum("cl_1v2"), 0),
                cl_1v3=Coalesce(Sum("cl_1v3"), 0),
                cl_1v4=Coalesce(Sum("cl_1v4"), 0),
                cl_1v5=Coalesce(Sum("cl_1v5"), 0),
                adr_avg=Avg("adr"),
                rating2_avg=Avg("rating2"),
            )
        )

        played_rounds = (
            Map.objects
            .filter(id__in=map_ids)
            .aggregate(r=Coalesce(Sum("played_rounds"), 0))
            .get("r", 0)
        )

        role_badge = (
            FantasyRoster.objects
            .filter(fantasy_team=ft, player_id=pid)
            .values_list("role_badge", flat=True)
            .first()
        )

        resp = {
            "league_id": int(league_id),
            "tournament_id": int(league.tournament_id) if league.tournament_id else None,
            "match_id": int(match_id),
            "player_id": pid,
            "role_badge": role_badge,
            "played_rounds": int(played_rounds or 0),
            "total_points": float(total_points or 0.0),
            "kills": int(agg["kills"] or 0),
            "deaths": int(agg["deaths"] or 0),
            "assists": int(agg["assists"] or 0),
            "hs": int(agg["hs"] or 0),
            "opening_kills": int(agg["opening_kills"] or 0),
            "opening_deaths": int(agg["opening_deaths"] or 0),
            "flash_assists": int(agg.get("flash_assists") or 0),
            "mk_3k": int(agg["mk_3k"] or 0),
            "mk_4k": int(agg["mk_4k"] or 0),
            "mk_5k": int(agg["mk_5k"] or 0),
            "utility_dmg_sum": float(agg.get("utility_dmg_sum") or 0.0),
            "utility_dmg_avg": float(agg.get("utility_dmg_avg")) if agg.get("utility_dmg_avg") is not None else None,
            "cl_1v2": int(agg["cl_1v2"] or 0),
            "cl_1v3": int(agg["cl_1v3"] or 0),
            "cl_1v4": int(agg["cl_1v4"] or 0),
            "cl_1v5": int(agg["cl_1v5"] or 0),
            "adr_avg": float(agg["adr_avg"]) if agg["adr_avg"] is not None else None,
            "rating2_avg": float(agg["rating2_avg"]) if agg["rating2_avg"] is not None else None,
        }
        return Response(resp, status=200)

class AdminSetPlayerPriceView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, *args, **kwargs):
        tournament_id = request.data.get("tournament_id") or request.data.get("tournament")
        player_id = request.data.get("player_id")
        price = request.data.get("price")

        if tournament_id is None or player_id is None or price is None:
            return Response(
                {"detail": "tournament_id, player_id and price are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            tournament_id = int(tournament_id)
            player_id = int(player_id)
            price = int(price)
        except (TypeError, ValueError):
            return Response(
                {"detail": "tournament_id, player_id and price must be integers"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if price < 0:
            return Response(
                {"detail": "price must be >= 0"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not Tournament.objects.filter(id=tournament_id).exists():
            return Response({"detail": "Tournament not found"}, status=status.HTTP_404_NOT_FOUND)

        if not Player.objects.filter(id=player_id).exists():
            return Response({"detail": "Player not found"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            obj, created = PlayerPrice.objects.update_or_create(
                tournament_id=tournament_id,
                player_id=player_id,
                defaults={
                    "price": price,
                    "source": "ADMIN",
                },
            )

        data = PlayerPriceSerializer(obj).data
        return Response(
            {"ok": True, "created": bool(created), "player_price": data},
            status=status.HTTP_200_OK,
        )
class DraftPlayerMatchBreakdownView(APIView):
    """
    GET /api/draft/player-match-breakdown?league_id=...&match_id=...&player_id=...&tournament=...
    По-карточно: points + breakdown из FantasyPoints.breakdown.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        league_id = request.query_params.get("league_id")
        match_id = request.query_params.get("match_id")
        player_id = request.query_params.get("player_id")
        tournament_id = request.query_params.get("tournament")

        if not league_id or not match_id or not player_id:
            return Response(
                {"detail": "league_id, match_id and player_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            league = League.objects.select_related("tournament").get(pk=int(league_id))
        except Exception:
            return Response({"detail": "League not found"}, status=status.HTTP_404_NOT_FOUND)

        if tournament_id:
            try:
                if int(tournament_id) != int(league.tournament_id):
                    return Response({"detail": "Tournament mismatch"}, status=400)
            except Exception:
                pass

        ft = FantasyTeam.objects.filter(user=request.user, league=league).first()
        if not ft:
            return Response({"detail": "Fantasy team not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            match = Match.objects.get(pk=int(match_id))
        except Exception:
            return Response({"detail": "Match not found"}, status=status.HTTP_404_NOT_FOUND)

        if league.tournament_id and getattr(match, "tournament_id", None) and match.tournament_id != league.tournament_id:
            return Response({"detail": "Match not in this tournament"}, status=400)

        pid = int(player_id)

        maps_qs = Map.objects.filter(match=match).order_by("id")
        map_ids = list(maps_qs.values_list("id", flat=True))
        if not map_ids:
            return Response(
                {"detail": "No maps for match", "total_points": 0.0, "maps": []},
                status=200,
            )

        fp_rows = (
            FantasyPoints.objects
            .filter(fantasy_team=ft, player_id=pid, map_id__in=map_ids)
            .select_related("map")
        )
        fp_by_map = {fp.map_id: fp for fp in fp_rows}

        # ✅ NEW: stаты игрока по каждой карте (для выбора карт на фронте)
        stats_rows = (
            PlayerMapStats.objects
            .filter(player_id=pid, map_id__in=map_ids)
            .values(
                "map_id",
                "kills", "deaths", "assists", "hs",
                "adr", "rating2",
                "opening_kills", "opening_deaths",
                "flash_assists",
                "cl_1v2", "cl_1v3", "cl_1v4", "cl_1v5",
                "mk_3k", "mk_4k", "mk_5k",
                "utility_dmg",
            )
        )
        stats_by_map = {int(r["map_id"]): r for r in stats_rows}

        out_maps = []
        total = 0.0
        for gm in maps_qs:
            fp = fp_by_map.get(gm.id)
            pts = float(getattr(fp, "points", 0.0) or 0.0)
            total += pts

            st = stats_by_map.get(int(gm.id)) or {}

            out_maps.append({
                "map_id": gm.id,
                "map_name": getattr(gm, "name", None) or getattr(gm, "map_name", None),
                "played_rounds": getattr(gm, "played_rounds", None),
                "winner_id": getattr(gm, "winner_id", None),
                "points": pts,
                "breakdown": getattr(fp, "breakdown", None) if fp else None,

                # ✅ NEW: статы по этой карте
                "stats": {
                    "kills": int(st.get("kills", 0) or 0),
                    "deaths": int(st.get("deaths", 0) or 0),
                    "assists": int(st.get("assists", 0) or 0),
                    "hs": int(st.get("hs", 0) or 0),
                    "adr": float(st.get("adr", 0.0) or 0.0),
                    "rating2": float(st.get("rating2", 0.0) or 0.0),
                    "opening_kills": int(st.get("opening_kills", 0) or 0),
                    "opening_deaths": int(st.get("opening_deaths", 0) or 0),
                    "flash_assists": int(st.get("flash_assists", 0) or 0),
                    "cl_1v2": int(st.get("cl_1v2", 0) or 0),
                    "cl_1v3": int(st.get("cl_1v3", 0) or 0),
                    "cl_1v4": int(st.get("cl_1v4", 0) or 0),
                    "cl_1v5": int(st.get("cl_1v5", 0) or 0),
                    "mk_3k": int(st.get("mk_3k", 0) or 0),
                    "mk_4k": int(st.get("mk_4k", 0) or 0),
                    "mk_5k": int(st.get("mk_5k", 0) or 0),
                    "utility_dmg": float(st.get("utility_dmg", 0.0) or 0.0),
                },
            })

        role_badge = (
            FantasyRoster.objects
            .filter(fantasy_team=ft, player_id=pid)
            .values_list("role_badge", flat=True)
            .first()
        )

        return Response({
            "league_id": int(league_id),
            "tournament_id": int(league.tournament_id) if league.tournament_id else None,
            "match_id": int(match_id),
            "player_id": pid,
            "role_badge": role_badge,
            "total_points": float(round(total, 2)),
            "maps": out_maps,
        }, status=200)

# MARKET
class MarketViewSet(viewsets.ModelViewSet):
    queryset = PlayerPrice.objects.select_related("player", "tournament", "player__team").all().order_by("-updated_at")
    serializer_class = PlayerPriceSerializer
    permission_classes = [IsAdminUser]  # было AllowAny

    def get_queryset(self):
        qs = super().get_queryset()
        t = self.request.query_params.get("tournament")
        if t:
            try:
                qs = qs.filter(tournament_id=int(t))
            except (TypeError, ValueError):
                pass
        return qs
