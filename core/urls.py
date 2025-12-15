from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    TeamViewSet, PlayerViewSet, TournamentViewSet, LeagueViewSet,
    FantasyTeamViewSet, FantasyRosterViewSet,
    MatchViewSet, MapViewSet, PlayerMapStatsViewSet,
    AdminRecalcView, LeagueStandingsView, TournamentTopPlayersView,
    MarketViewSet, MarketGenerateView,
    DraftStateView, DraftBuyView, DraftSellView, DraftLockView, DraftUnlockView,
    DraftSetRoleView,  # ✅ added
    RegisterView, MeView,
    PlayerSummaryView, TournamentTeamViewSet,
    MatchPlayersView, HLTVImportView,
)

router = DefaultRouter()
router.register(r"teams", TeamViewSet)
router.register(r"players", PlayerViewSet)
router.register(r"tournaments", TournamentViewSet)
router.register(r"tournament-teams", TournamentTeamViewSet)
router.register(r"leagues", LeagueViewSet)
router.register(r"fantasy-teams", FantasyTeamViewSet)
router.register(r"fantasy-rosters", FantasyRosterViewSet)
router.register(r"matches", MatchViewSet)
router.register(r"maps", MapViewSet)
router.register(r"player-map-stats", PlayerMapStatsViewSet)
router.register(r"market", MarketViewSet, basename="market")

urlpatterns = [
    path("", include(router.urls)),

    # админ-утилиты
    path("admin/recalculate", AdminRecalcView.as_view()),
    path("market/generate", MarketGenerateView.as_view()),
    path("market/generate/", MarketGenerateView.as_view()),

    # standings / ladder + турнирная статистика
    path("leagues/<int:league_id>/standings", LeagueStandingsView.as_view()),
    path("leagues/<int:league_id>/ladder/", LeagueStandingsView.as_view()),
    path(
        "tournaments/<int:tournament_id>/top-players/",
        TournamentTopPlayersView.as_view(),
    ),

    # драфт
    path("draft/<int:league_id>/state", DraftStateView.as_view()),
    path("draft/buy", DraftBuyView.as_view()),
    path("draft/sell", DraftSellView.as_view()),
    path("draft/lock", DraftLockView.as_view()),
    path("draft/lock/", DraftLockView.as_view()),
    path("draft/unlock", DraftUnlockView.as_view()),
    path("draft/unlock/", DraftUnlockView.as_view()),


    path("draft/set-role", DraftSetRoleView.as_view()),
    path("draft/set-role/", DraftSetRoleView.as_view()),

    # player summary
    path("player-summary/<int:player_id>/", PlayerSummaryView.as_view()),

    # матч-участники (игроки, реально игравшие)
    path("match-players", MatchPlayersView.as_view()),

    # аутентификация
    path("auth/login", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/register", RegisterView.as_view(), name="auth-register"),
    path("auth/me", MeView.as_view(), name="auth-me"),

    # HLTV импорт турнира
    path("hltv/import-tournament", HLTVImportView.as_view()),
]
