from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, filters
from django.db.models import Sum
from django.core.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated


from .models import (
    Team, Player, Tournament, League,
    FantasyTeam, FantasyRoster,
    Match, Map, PlayerMapStats, FantasyPoints, PlayerPrice
)
from .serializers import (
    TeamSerializer, PlayerSerializer, TournamentSerializer, LeagueSerializer,
    FantasyTeamSerializer, FantasyRosterSerializer,
    MatchSerializer, MapSerializer, PlayerMapStatsSerializer,
    PlayerPriceSerializer, RegisterSerializer
)
from .services import (
    recalc_map, recalc_tournament, generate_market_prices_for_tournament,
    draft_state, buy_player, sell_player
)

# ---- CRUD ViewSets ----
class TeamViewSet(ModelViewSet):
    queryset = Team.objects.all()
    serializer_class = TeamSerializer

class PlayerViewSet(ModelViewSet):
    queryset = Player.objects.all()
    serializer_class = PlayerSerializer

class TournamentViewSet(ModelViewSet):
    queryset = Tournament.objects.all().order_by('start_date', 'name')
    serializer_class = TournamentSerializer

class LeagueViewSet(ModelViewSet):
    queryset = League.objects.select_related('tournament').all().order_by('id')
    serializer_class = LeagueSerializer

class FantasyTeamViewSet(ModelViewSet):
    queryset = FantasyTeam.objects.select_related('league').all()
    serializer_class = FantasyTeamSerializer

class FantasyRosterViewSet(ModelViewSet):
    queryset = FantasyRoster.objects.select_related('fantasy_team', 'player').all()
    serializer_class = FantasyRosterSerializer

class MatchViewSet(ModelViewSet):
    queryset = Match.objects.select_related('tournament', 'team1', 'team2').all().order_by('start_time')
    serializer_class = MatchSerializer

class MapViewSet(ModelViewSet):
    queryset = Map.objects.select_related('match').all()
    serializer_class = MapSerializer

class PlayerMapStatsViewSet(ModelViewSet):
    queryset = PlayerMapStats.objects.select_related('map', 'player').all()
    serializer_class = PlayerMapStatsSerializer


# ---- Auth: register ----
class RegisterView(APIView):
    authentication_classes = []   # allow any
    permission_classes = []

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        if not s.is_valid():
            return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)
        s.save()
        return Response({"status": "ok"}, status=status.HTTP_201_CREATED)


# ---- Admin actions / Standings ----
class AdminRecalcView(APIView):
    def post(self, request):
        scope = request.data.get("scope")
        _id = request.data.get("id")
        if scope not in ("map", "tournament") or not isinstance(_id, int):
            return Response({"error": "use scope=map|tournament and integer id"}, status=status.HTTP_400_BAD_REQUEST)
        if scope == "map":
            n = recalc_map(_id)
        else:
            n = recalc_tournament(_id)
        return Response({"status": "ok", "upserts": n})

class LeagueStandingsView(APIView):
    def get(self, request, league_id: int):
        teams = (
            FantasyTeam.objects.filter(league_id=league_id)
            .values("id", "user_name")
            .annotate(total=Sum("points_items__points"))
            .order_by("-total")
        )
        try:
            league = League.objects.get(id=league_id)
        except League.DoesNotExist:
            return Response({"error": "league not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"league": {"id": league.id, "name": league.name}, "standings": list(teams)})


# ---- Market (цены игроков) ----
class MarketGenerateView(APIView):
    def post(self, request):
        tournament_id = request.data.get("tournament")
        if not isinstance(tournament_id, int):
            return Response({"error": "tournament (int) is required"}, status=status.HTTP_400_BAD_REQUEST)

        budget = int(request.data.get("budget", 1_000_000))
        slots = int(request.data.get("slots", 5))

        try:
            updated = generate_market_prices_for_tournament(
                tournament_id=tournament_id,
                budget=budget,
                slots=slots,
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"status": "ok", "updated": updated})


class MarketViewSet(ReadOnlyModelViewSet):
    queryset = PlayerPrice.objects.select_related("player", "player__team", "tournament").all().order_by("-price")
    serializer_class = PlayerPriceSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ["player__nickname", "player__team__name"]

    def get_queryset(self):
        qs = super().get_queryset()
        tid = self.request.query_params.get("tournament")
        if tid:
            qs = qs.filter(tournament_id=tid)
        return qs


# ---- Draft API ----
def _effective_username(request, fallback_param: str = None):
    """
    Если пользователь аутентифицирован — вернуть его username.
    Иначе попробовать взять из query/body параметр 'user', затем fallback.
    """
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return user.username
    # GET → request.GET, POST → request.data
    supplied = request.GET.get("user") if request.method == "GET" else request.data.get("user")
    return supplied or fallback_param or "Guest"

class DraftStateView(APIView):
    """GET /api/draft/<league_id>/state [jwt or ?user=Adam]"""
    def get(self, request, league_id: int):
        user_name = _effective_username(request)
        data = draft_state(league_id, user_name)
        return Response(data)

class DraftBuyView(APIView):
    """POST /api/draft/buy  {league_id, player_id}  (user из JWT, иначе 'user' в теле)"""
    def post(self, request):
        try:
            league_id = int(request.data.get("league_id"))
            player_id = int(request.data.get("player_id"))
        except Exception:
            return Response({"error": "league_id(int), player_id(int) required"}, status=400)

        user_name = _effective_username(request)
        try:
            result = buy_player(league_id, user_name, player_id)
        except ValidationError as e:
            return Response({"error": str(e)}, status=400)
        return Response({"status": "ok", **result})

class DraftSellView(APIView):
    """POST /api/draft/sell  {league_id, player_id}  (user из JWT, иначе 'user' в теле)"""
    def post(self, request):
        try:
            league_id = int(request.data.get("league_id"))
            player_id = int(request.data.get("player_id"))
        except Exception:
            return Response({"error": "league_id(int), player_id(int) required"}, status=400)

        user_name = _effective_username(request)
        try:
            result = sell_player(league_id, user_name, player_id)
        except ValidationError as e:
            return Response({"error": str(e)}, status=400)
        return Response({"status": "ok", **result})

class MeView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        u = request.user
        return Response({"username": u.username, "is_staff": u.is_staff})