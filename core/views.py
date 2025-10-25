from rest_framework import viewsets, generics
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Sum
from .models import (
    Team, Player, Tournament, League, FantasyTeam, FantasyRoster,
    Match, Map, PlayerMapStats, FantasyPoints, PlayerPrice, TournamentTeam
)
from .serializers import (
    TeamSerializer, PlayerSerializer, TournamentSerializer, LeagueSerializer,
    FantasyTeamSerializer, FantasyRosterSerializer, MatchSerializer,
    MapSerializer, PlayerMapStatsSerializer, FantasyPointsSerializer,
    PlayerPriceSerializer, RegisterSerializer, TournamentTeamSerializer
)
from .services import (
    get_draft_state, handle_draft_buy, handle_draft_sell,
    recalc_fantasy_points, generate_market_prices_for_tournament,
    get_player_summary
)


# ==== BASIC CRUD VIEWSETS ====

class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.all().order_by("id")
    serializer_class = TeamSerializer
    permission_classes = [AllowAny]


class PlayerViewSet(viewsets.ModelViewSet):
    queryset = Player.objects.select_related("team").all().order_by("id")
    serializer_class = PlayerSerializer
    permission_classes = [AllowAny]


class TournamentViewSet(viewsets.ModelViewSet):
    queryset = Tournament.objects.all().order_by("id")
    serializer_class = TournamentSerializer
    permission_classes = [AllowAny]


class TournamentTeamViewSet(viewsets.ModelViewSet):
    queryset = TournamentTeam.objects.select_related("tournament", "team").all().order_by("id")
    serializer_class = TournamentTeamSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        t = self.request.query_params.get("tournament")
        if t:
            try:
                qs = qs.filter(tournament_id=int(t))
            except (TypeError, ValueError):
                pass
        return qs


class LeagueViewSet(viewsets.ModelViewSet):
    queryset = League.objects.select_related("tournament").all().order_by("id")
    serializer_class = LeagueSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = super().get_queryset()
        t = self.request.query_params.get("tournament")
        if t:
            try:
                qs = qs.filter(tournament_id=int(t))
            except (TypeError, ValueError):
                pass
        return qs


class FantasyTeamViewSet(viewsets.ModelViewSet):
    queryset = FantasyTeam.objects.select_related("league").all().order_by("id")
    serializer_class = FantasyTeamSerializer
    permission_classes = [AllowAny]


class FantasyRosterViewSet(viewsets.ModelViewSet):
    queryset = FantasyRoster.objects.select_related("player", "fantasy_team").all().order_by("id")
    serializer_class = FantasyRosterSerializer
    permission_classes = [AllowAny]


class MatchViewSet(viewsets.ModelViewSet):
    queryset = Match.objects.select_related("tournament", "team1", "team2").all().order_by("id")
    serializer_class = MatchSerializer
    permission_classes = [AllowAny]


class MapViewSet(viewsets.ModelViewSet):
    queryset = Map.objects.select_related("match").all().order_by("id")
    serializer_class = MapSerializer
    permission_classes = [AllowAny]


class PlayerMapStatsViewSet(viewsets.ModelViewSet):
    queryset = PlayerMapStats.objects.select_related("map", "player").all().order_by("id")
    serializer_class = PlayerMapStatsSerializer
    permission_classes = [AllowAny]


class MarketViewSet(viewsets.ModelViewSet):
    queryset = PlayerPrice.objects.select_related("player", "tournament", "player__team").all().order_by("-updated_at")
    serializer_class = PlayerPriceSerializer
    permission_classes = [AllowAny]


# ==== ADMIN ====

class AdminRecalcView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        scope = request.data.get("scope")
        obj_id = request.data.get("id")
        if not scope or not obj_id:
            return Response({"error": "scope and id required"}, status=400)
        recalc_fantasy_points(scope, obj_id)
        return Response({"status": "ok"})


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


# ==== DRAFT ====

class DraftStateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, league_id):
        user = request.user
        state = get_draft_state(user, league_id)
        return Response(state)


class DraftBuyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        league_id = request.data.get("league_id")
        player_id = request.data.get("player_id")
        result = handle_draft_buy(user, league_id, player_id)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


class DraftSellView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        league_id = request.data.get("league_id")
        player_id = request.data.get("player_id")
        result = handle_draft_sell(user, league_id, player_id)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


# ==== LEAGUE STANDINGS ====

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


# ==== AUTH ====

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


# ==== PLAYER SUMMARY ====

class PlayerSummaryView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, player_id):
        tournament_id = request.query_params.get("tournament")
        data = get_player_summary(player_id, tournament_id)
        return Response(data)

