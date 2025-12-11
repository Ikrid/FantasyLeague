from math import ceil

from django.db.models.functions import Coalesce
from rest_framework import viewsets, generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Sum, Count
import re

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
)


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
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tid = request.data.get("tournament")
        budget = request.data.get("budget", 1000000)
        slots = request.data.get("slots", 5)
        if not tid:
            return Response({"error": "tournament required"}, status=400)
        generate_market_prices_for_tournament(int(tid), budget=budget, slots=slots)
        return Response({"status": "market generated"})


# DRAFT — STATE
class DraftStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, league_id):
        user = request.user
        state = get_draft_state(user, league_id)

        # ЛОГИКА АВТО-БЛОКИРОВКИ
        league = League.objects.select_related("tournament").get(id=league_id)
        t = league.tournament
        t_finished = t.is_finished()

        state["locked"] = t_finished
        state["started"] = t_finished

        return Response(state)


# DRAFT — BUY
class DraftBuyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        league_id = request.data.get("league_id")

        league = League.objects.select_related("tournament").get(id=league_id)
        if league.tournament.is_finished():
            return Response({"error": "Tournament is finished. Draft is locked."}, status=403)

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
        if league.tournament.is_finished():
            return Response({"error": "Tournament is finished. Draft is locked."}, status=403)

        player_id = request.data.get("player_id")
        result = handle_draft_sell(user, league_id, player_id)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


# STANDINGS
class LeagueStandingsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, league_id):
        standings = (
            FantasyPoints.objects.filter(fantasy_team__league_id=league_id)
            .values("fantasy_team__user_name")
            .annotate(total_points=Sum("points"))
            .order_by("-total_points")
        )
        return Response(list(standings))


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

        # 1. Базовые данные, как и раньше
        data = get_player_summary(player_id, tournament_id) or {}

        # 2. Подмешиваем HLTV-статы, если есть
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
        """
        Принимаем ИЛИ URL, ИЛИ id турнира:
        - frontend может прислать hltvId, hltv_id, hltv или url
        - если это URL, просто прокидываем его дальше как есть
        - если это число — тоже передаём строкой (как раньше)

        Дополнительно:
        - можно прислать budget и slots (опционально), чтобы сразу
          сгенерировать рынок для только что импортированного турнира.
        """

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
        event_arg = value  # не трогаем, скрапер ждёт строку

        # Параметры для генерации рынка (как в MarketGenerateView)
        try:
            budget = int(request.data.get("budget", 1000000))
            slots = int(request.data.get("slots", 5))
        except (TypeError, ValueError):
            return Response(
                {"detail": "budget и slots должны быть числами"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # 1. Импорт турнира с HLTV
            result = import_tournament_full(event_arg)

            # 2. Достаём ID турнира, чтобы сгенерировать рынок
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

            # 3. Генерация цен/рынка для турнира
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
    """
    Ладдер лиги с пагинацией.
    GET /api/leagues/<league_id>/ladder/?page=1

    По умолчанию:
    - page_size = 20
    - сортировка по total_points DESC, затем id ASC
    """

    permission_classes = [AllowAny]

    def get(self, request, league_id):
        # 1. Лига
        try:
            league = League.objects.select_related("tournament").get(pk=league_id)
        except League.DoesNotExist:
            return Response({"detail": "League not found"}, status=404)

        # 2. Параметры пагинации
        page_size = 20
        raw_page = request.query_params.get("page", "1")
        try:
            page = int(raw_page)
        except ValueError:
            page = 1
        if page < 1:
            page = 1

        # 3. Базовый queryset по FantasyTeam
        base_qs = (
            FantasyTeam.objects
            .filter(league=league)
            .select_related("user", "league")
            .annotate(
                total_points=Coalesce(Sum("fantasypoints__points"), 0.0),
                roster_size=Count("fantasyroster", distinct=True),
            )
            .order_by("-total_points", "id")
        )

        total_teams = base_qs.count()
        total_pages = ceil(total_teams / page_size) if total_teams else 1

        if page > total_pages:
            page = total_pages

        start = (page - 1) * page_size
        end = start + page_size

        teams_page = base_qs[start:end]

        ladder = []
        for idx, ft in enumerate(teams_page, start=0):
            rank = start + idx + 1  # глобальный ранг
            pts = float(ft.total_points or 0)

            ladder.append(
                {
                    "rank": rank,
                    "fantasy_team_id": ft.id,
                    "team_name": ft.user_name,  # название команды в лиге
                    "user_name": ft.user.username if ft.user_id else None,
                    "total_points": pts,
                    "roster_size": ft.roster_size,
                    "budget_left": ft.budget_left,
                }
            )

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