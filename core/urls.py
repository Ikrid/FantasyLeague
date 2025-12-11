from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    TeamViewSet, PlayerViewSet, TournamentViewSet, LeagueViewSet,
    FantasyTeamViewSet, FantasyRosterViewSet,
    MatchViewSet, MapViewSet, PlayerMapStatsViewSet,
    AdminRecalcView, LeagueStandingsView,
    MarketViewSet, MarketGenerateView,
    DraftStateView, DraftBuyView, DraftSellView,
    RegisterView, MeView,
    PlayerSummaryView, TournamentTeamViewSet,
    MatchPlayersView, HLTVImportView,  # ← добавили
)

router = DefaultRouter()
router.register(r'teams', TeamViewSet)
router.register(r'players', PlayerViewSet)
router.register(r'tournaments', TournamentViewSet)
router.register(r'tournament-teams', TournamentTeamViewSet)  # новый CRUD
router.register(r'leagues', LeagueViewSet)
router.register(r'fantasy-teams', FantasyTeamViewSet)
router.register(r'fantasy-rosters', FantasyRosterViewSet)
router.register(r'matches', MatchViewSet)
router.register(r'maps', MapViewSet)
router.register(r'player-map-stats', PlayerMapStatsViewSet)
router.register(r'market', MarketViewSet, basename="market")

urlpatterns = [
    path('', include(router.urls)),

    # админ-утилиты
    path('admin/recalculate', AdminRecalcView.as_view()),
    path('market/generate', MarketGenerateView.as_view()),

    # standings
    path('leagues/<int:league_id>/standings', LeagueStandingsView.as_view()),

    # драфт
    path('draft/<int:league_id>/state', DraftStateView.as_view()),
    path('draft/buy', DraftBuyView.as_view()),
    path('draft/sell', DraftSellView.as_view()),

    # player summary
    path('player-summary/<int:player_id>/', PlayerSummaryView.as_view()),

    # матч-участники (игроки, реально игравшие)
    path('match-players', MatchPlayersView.as_view()),  # ← добавили

    # аутентификация
    path('auth/login', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/register', RegisterView.as_view(), name='auth-register'),
    path('auth/me', MeView.as_view(), name='auth-me'),
    path('hltv/import-tournament', HLTVImportView.as_view()),

# standings / ladder
    path('leagues/<int:league_id>/standings', LeagueStandingsView.as_view()),
    path('leagues/<int:league_id>/ladder/', LeagueStandingsView.as_view()),
]
