from django.contrib import admin
from .models import Team, Player, Tournament, League, FantasyTeam, FantasyRoster, Match, Map, PlayerMapStats, FantasyPoints, PlayerPrice

@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "world_rank")
    list_filter = ("world_rank",)
    search_fields = ("name",)

admin.site.register(Player)
admin.site.register(Tournament)
admin.site.register(League)
admin.site.register(FantasyTeam)
admin.site.register(FantasyRoster)

@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ('id', 'tournament', 'team1', 'team2', 'start_time', 'bo')
    list_filter = ('tournament', 'start_time')
    search_fields = ('team1__name', 'team2__name', 'tournament__name')

@admin.register(Map)
class MapAdmin(admin.ModelAdmin):
    list_display = ('id', 'match', 'map_name', 'map_index')
    list_filter = ('map_name',)

@admin.register(PlayerMapStats)
class PlayerMapStatsAdmin(admin.ModelAdmin):
    list_display = ('id', 'map', 'player', 'kills', 'deaths', 'assists', 'hs', 'adr', 'rating2')
    list_filter = ('map__map_name', 'player__team')
    search_fields = ('player__nickname',)

@admin.register(FantasyPoints)
class FantasyPointsAdmin(admin.ModelAdmin):
    list_display = ('id', 'fantasy_team', 'player', 'map', 'points')
    list_filter = ('fantasy_team__league', 'map__map_name')

# NEW: цены рынка
@admin.register(PlayerPrice)
class PlayerPriceAdmin(admin.ModelAdmin):
    list_display = ("tournament", "player", "price", "source", "updated_at")
    list_filter = ("tournament", "source")
    search_fields = ("player__nickname", "player__team__name")
