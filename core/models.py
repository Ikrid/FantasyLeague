from django.db import models
from django.contrib.auth.models import User
from datetime import date
from django.utils import timezone

class Team(models.Model):
    name = models.CharField(max_length=100, unique=True)
    world_rank = models.IntegerField(null=True, blank=True)

    # HLTV flag on event pages (often region/continent)
    region_code = models.CharField(max_length=8, null=True, blank=True)
    region_name = models.CharField(max_length=64, null=True, blank=True)

    def __str__(self):
        return self.name


class Player(models.Model):
    nickname = models.CharField(max_length=100, unique=True)
    team = models.ForeignKey(Team, on_delete=models.SET_NULL, null=True, blank=True, related_name="players")

    # HLTV nationality flag (e.g. RU / Russia)
    nationality_code = models.CharField(max_length=8, null=True, blank=True)
    nationality_name = models.CharField(max_length=64, null=True, blank=True)

    def __str__(self):
        return self.nickname


class Tournament(models.Model):
    name = models.CharField(max_length=200, unique=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    def is_finished(self):
        return bool(self.end_date and self.end_date < date.today())

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
    league = models.ForeignKey("League", on_delete=models.CASCADE)
    user_name = models.CharField(max_length=64)
    budget_left = models.IntegerField(default=0)

    # ✅ NEW: блокировка ростера
    roster_locked = models.BooleanField(default=False)
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = (("user", "league"),)

    def lock_roster(self):
        """Удобный метод, можно вызывать из view."""
        if not self.roster_locked:
            self.roster_locked = True
            self.locked_at = timezone.now()
            self.save(update_fields=["roster_locked", "locked_at"])

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

    winner = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="match_wins",
    )

    def __str__(self):
        return f"{self.team1.name} vs {self.team2.name}"

    def maps_needed_to_win(self) -> int:
        bo = int(self.bo or 0)
        if bo <= 0:
            bo = 1
        # BO должен быть нечётным. Если кто-то поставит 2/4 — считаем как 3/5 по смыслу.
        if bo % 2 == 0:
            bo += 1
        return bo // 2 + 1

    def recompute_winner(self, *, save: bool = True) -> Team | None:
        """
        Выставляет winner матча по победителям карт.
        Считает только карты, где winner задан и равен team1/team2.
        """
        t1 = self.team1_id
        t2 = self.team2_id
        if not t1 or not t2:
            if self.winner_id is not None:
                self.winner = None
                if save:
                    self.save(update_fields=["winner"])
            return None

        wins1 = self.maps.filter(winner_id=t1).count()
        wins2 = self.maps.filter(winner_id=t2).count()
        need = self.maps_needed_to_win()

        new_winner_id = None
        if wins1 >= need and wins1 > wins2:
            new_winner_id = t1
        elif wins2 >= need and wins2 > wins1:
            new_winner_id = t2

        if self.winner_id != new_winner_id:
            self.winner_id = new_winner_id
            if save:
                self.save(update_fields=["winner"])

        return self.winner



class Map(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="maps")
    map_name = models.CharField(max_length=64)
    map_index = models.IntegerField(default=1)
    played_rounds = models.IntegerField(default=0)

    team1_score = models.IntegerField(null=True, blank=True)
    team2_score = models.IntegerField(null=True, blank=True)

    winner = models.ForeignKey(
        Team,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="map_wins",
    )

    def __str__(self):
        return f"{self.map_name} ({self.match})"

    def compute_winner_id(self) -> int | None:
        """
        Возвращает id победителя карты по счёту раундов.
        """
        s1 = self.team1_score
        s2 = self.team2_score

        if s1 is None or s2 is None:
            return None

        try:
            s1 = int(s1)
            s2 = int(s2)
        except (TypeError, ValueError):
            return None

        if s1 == s2:
            return None

        if not self.match_id:
            return None

        return self.match.team1_id if s1 > s2 else self.match.team2_id

    def save(self, *args, **kwargs):
        # 1) победитель карты по раундам
        self.winner_id = self.compute_winner_id()

        super().save(*args, **kwargs)

        # 2) победитель матча по картам (после сохранения карты)
        if self.match_id:
            self.match.recompute_winner(save=True)

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
    source = models.CharField(max_length=16, default="AUTO")
    calc_meta = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.player.nickname} @ {self.tournament.name}: {self.price}"

class PlayerHLTVStats(models.Model):
    player = models.OneToOneField(Player, on_delete=models.CASCADE, related_name="hltv_stats")

    # --- Main Performance ---
    rating2 = models.FloatField(default=0.0)                 # "Rating 2.0"
    kills_per_round = models.FloatField(default=0.0)         # "Kills per round"
    adr = models.FloatField(default=0.0)                     # "Damage per round"

    # --- Entry / Opening ---
    opening_kills_per_round = models.FloatField(default=0.0) # "Opening kills per round"
    opening_deaths_per_round = models.FloatField(default=0.0)# "Opening deaths per round"
    win_after_opening = models.FloatField(default=0.0)       # "Win% after opening kill"

    # --- Skill / Impact ---
    multikill_rounds_pct = models.FloatField(default=0.0)    # "Rounds with a multi-kill"
    clutch_points_per_round = models.FloatField(default=0.0) # "Clutch points per round"

    # --- Role Identification ---
    sniper_kills_per_round = models.FloatField(default=0.0)  # "Sniper kills per round"

    # --- Utility / Support ---
    utility_damage_per_round = models.FloatField(default=0.0) # "Utility damage per round"
    flash_assists_per_round = models.FloatField(default=0.0)  # "Flash assists per round"

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"HLTV Stats for {self.player.nickname}"
