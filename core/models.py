from django.db import models
from django.contrib.auth.models import User


class Team(models.Model):
    name = models.CharField(max_length=100, unique=True)
    world_rank = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return self.name


class Player(models.Model):
    nickname = models.CharField(max_length=100, unique=True)
    team = models.ForeignKey(Team, on_delete=models.SET_NULL, null=True, blank=True, related_name="players")

    def __str__(self):
        return self.nickname


class Tournament(models.Model):
    name = models.CharField(max_length=200, unique=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return self.name


class TournamentTeam(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='participants')
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='tournaments')

    class Meta:
        unique_together = (('tournament', 'team'),)
        verbose_name = "Tournament participant"
        verbose_name_plural = "Tournament participants"

    def __str__(self):
        return f"{self.team.name} @ {self.tournament.name}"


class League(models.Model):
    name = models.CharField(max_length=100)
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="leagues")
    budget = models.PositiveIntegerField(default=1000000)
    max_badges = models.PositiveIntegerField(default=0)
    lock_policy = models.CharField(max_length=16, default="soft")

    def __str__(self):
        return f"{self.name} ({self.tournament.name})"


class FantasyTeam(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    league = models.ForeignKey(League, on_delete=models.CASCADE)
    user_name = models.CharField(max_length=64)
    budget_left = models.IntegerField(default=0)

    class Meta:
        unique_together = (("user", "league"),)

    def __str__(self):
        return f"{self.user_name} @ {self.league.name}"


class FantasyRoster(models.Model):
    fantasy_team = models.ForeignKey(FantasyTeam, on_delete=models.CASCADE)
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    role_badge = models.CharField(max_length=32, blank=True, null=True)
    locked_until = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.player.nickname} in {self.fantasy_team.user_name}"


class Match(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name="matches")
    team1 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="match_team1")
    team2 = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="match_team2")
    start_time = models.DateTimeField(null=True, blank=True)
    bo = models.IntegerField(default=3)

    def __str__(self):
        return f"{self.team1.name} vs {self.team2.name}"


class Map(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="maps")
    map_name = models.CharField(max_length=64)
    map_index = models.IntegerField(default=1)
    played_rounds = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.map_name} ({self.match})"


class PlayerMapStats(models.Model):
    map = models.ForeignKey(Map, on_delete=models.CASCADE, related_name="player_stats")
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    kills = models.IntegerField(default=0)
    deaths = models.IntegerField(default=0)
    assists = models.IntegerField(default=0)
    hs = models.IntegerField(default=0)
    adr = models.FloatField(default=0)
    rating2 = models.FloatField(default=0)
    opening_kills = models.IntegerField(default=0)
    opening_deaths = models.IntegerField(default=0)
    flash_assists = models.IntegerField(default=0)
    cl_1v2 = models.IntegerField(default=0)
    cl_1v3 = models.IntegerField(default=0)
    cl_1v4 = models.IntegerField(default=0)
    cl_1v5 = models.IntegerField(default=0)
    mk_3k = models.IntegerField(default=0)
    mk_4k = models.IntegerField(default=0)
    mk_5k = models.IntegerField(default=0)
    utility_dmg = models.FloatField(default=0)


class FantasyPoints(models.Model):
    fantasy_team = models.ForeignKey(FantasyTeam, on_delete=models.CASCADE)
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    map = models.ForeignKey(Map, on_delete=models.CASCADE)
    points = models.FloatField(default=0)
    breakdown = models.JSONField(default=dict)


class PlayerPrice(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE)
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    price = models.IntegerField(default=0)
    source = models.CharField(max_length=64, default="calc")
    calc_meta = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
