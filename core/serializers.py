from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    Team, Player, Tournament, League, FantasyTeam, FantasyRoster,
    Match, Map, PlayerMapStats, FantasyPoints, PlayerPrice, TournamentTeam
)


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = "__all__"


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = "__all__"


class TournamentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tournament
        fields = "__all__"


class TournamentTeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = TournamentTeam
        fields = ["id", "tournament", "team"]


class LeagueSerializer(serializers.ModelSerializer):
    tournament_name = serializers.CharField(source='tournament.name', read_only=True)
    participants_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = League
        fields = [
            "id",
            "name",
            "tournament",
            "tournament_name",
            "budget",
            "max_badges",
            "lock_policy",
            "participants_count",
        ]


class FantasyTeamSerializer(serializers.ModelSerializer):
    league_name = serializers.CharField(source='league.name', read_only=True)

    class Meta:
        model = FantasyTeam
        fields = ["id", "user_name", "league", "league_name", "budget_left"]


class FantasyRosterSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source='player.nickname', read_only=True)
    team_id = serializers.IntegerField(source='player.team.id', read_only=True)
    team_name = serializers.CharField(source='player.team.name', read_only=True)

    # NEW: flags
    player_nationality_code = serializers.CharField(source='player.nationality_code', read_only=True)
    player_nationality_name = serializers.CharField(source='player.nationality_name', read_only=True)
    team_region_code = serializers.CharField(source='player.team.region_code', read_only=True)
    team_region_name = serializers.CharField(source='player.team.region_name', read_only=True)

    class Meta:
        model = FantasyRoster
        fields = [
            "id",
            "fantasy_team",
            "player",
            "player_name",
            "team_id",
            "team_name",
            "player_nationality_code",
            "player_nationality_name",
            "team_region_code",
            "team_region_name",
            "role_badge",
            "locked_until",
        ]


class MatchSerializer(serializers.ModelSerializer):
    team1_name = serializers.CharField(source='team1.name', read_only=True)
    team2_name = serializers.CharField(source='team2.name', read_only=True)
    tournament_name = serializers.CharField(source='tournament.name', read_only=True)

    class Meta:
        model = Match
        fields = [
            "id", "tournament", "tournament_name",
            "team1", "team1_name", "team2", "team2_name",
            "start_time", "bo",
            "winner",
        ]


class MapSerializer(serializers.ModelSerializer):
    match_str = serializers.CharField(source='match.__str__', read_only=True)

    class Meta:
        model = Map
        fields = [
            "id", "match", "match_str",
            "map_name", "map_index",
            "played_rounds",
            "team1_score", "team2_score",
            "winner",
        ]


class PlayerMapStatsSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source='player.nickname', read_only=True)
    map_info = MapSerializer(source='map', read_only=True)

    class Meta:
        model = PlayerMapStats
        fields = [
            "id", "map", "map_info", "player", "player_name",
            "kills", "deaths", "assists", "hs", "adr", "rating2",
            "opening_kills", "opening_deaths", "flash_assists",
            "cl_1v2", "cl_1v3", "cl_1v4", "cl_1v5",
            "mk_3k", "mk_4k", "mk_5k", "utility_dmg"
        ]


class FantasyPointsSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source='player.nickname', read_only=True)
    team_name = serializers.CharField(source='fantasy_team.user_name', read_only=True)

    class Meta:
        model = FantasyPoints
        fields = ["id", "fantasy_team", "team_name", "player", "player_name", "map", "points", "breakdown"]


class PlayerPriceSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source="player.nickname", read_only=True)
    team_name = serializers.CharField(source="player.team.name", read_only=True)

    class Meta:
        model = PlayerPrice
        fields = ["id", "tournament", "player", "player_name", "team_name", "price", "source", "calc_meta", "updated_at"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ("username", "password", "email", "first_name", "last_name")

    def create(self, validated_data):
        pwd = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(pwd)
        user.save()
        return user
