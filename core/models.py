from django.db import models
from django.utils import timezone

class Team(models.Model):
    name = models.CharField(max_length=120)
    # NEW: мировой рейтинг HLTV (чем меньше — тем сильнее; 1 = топ-1)
    world_rank = models.IntegerField(null=True, blank=True)

    def __str__(self): return self.name

class Player(models.Model):
    nickname = models.CharField(max_length=64)
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL)
    country = models.CharField(max_length=2, blank=True)
    def __str__(self): return self.nickname

class Tournament(models.Model):
    name = models.CharField(max_length=160)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_custom = models.BooleanField(default=False)
    def __str__(self): return self.name

class League(models.Model):
    name = models.CharField(max_length=120)
    tournament = models.ForeignKey(Tournament, null=True, blank=True, on_delete=models.SET_NULL)
    budget = models.IntegerField(default=100000)       # стартовый бюджет (можешь не трогать)
    max_badges = models.IntegerField(default=2)        # сколько ролей можно активировать
    lock_policy = models.CharField(max_length=32, default='per_map')  # per_map|per_match
    def __str__(self): return f"{self.name} ({self.tournament or 'custom'})"

class FantasyTeam(models.Model):
    league = models.ForeignKey(League, on_delete=models.CASCADE)
    user_name = models.CharField(max_length=80)   # для простоты без auth.User
    budget_left = models.IntegerField(default=100000)
    def __str__(self): return f"{self.user_name} in {self.league.name}"

class FantasyRoster(models.Model):
    fantasy_team = models.ForeignKey(FantasyTeam, on_delete=models.CASCADE, related_name="roster_items")
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    role_badge = models.CharField(max_length=40, blank=True)  # HS_MACHINE, ENTRY и т.д. (можешь не использовать)
    locked_until = models.DateTimeField(null=True, blank=True)
    def __str__(self): return f"{self.player.nickname} for {self.fantasy_team.user_name}"

class Match(models.Model):
    STAGE_CHOICES = [
        ('group', 'Group stage'),
        ('playoff', 'Playoff'),
        ('swiss', 'Swiss'),
        ('qual', 'Qualifier'),
    ]
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE)
    stage = models.CharField(max_length=16, choices=STAGE_CHOICES, default='group')
    group_name = models.CharField(max_length=16, blank=True)      # 'A','B' (для групп)
    round_name = models.CharField(max_length=32, blank=True)      # 'Quarterfinal','Semifinal'
    series_code = models.CharField(max_length=32, blank=True)     # произвольная метка серии
    team1 = models.ForeignKey(Team, related_name='match_team1', on_delete=models.CASCADE)
    team2 = models.ForeignKey(Team, related_name='match_team2', on_delete=models.CASCADE)
    start_time = models.DateTimeField(default=timezone.now)
    bo = models.IntegerField(default=3)  # best-of
    class Meta:
        indexes = [
            models.Index(fields=['tournament', 'stage']),
            models.Index(fields=['team1', 'team2', 'tournament']),
        ]
    def __str__(self):
        base = f"{self.tournament.name}: {self.team1.name} vs {self.team2.name} (BO{self.bo})"
        extra = self.round_name or self.group_name or self.stage
        return f"{base} — {extra}"

class Map(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE)
    map_name = models.CharField(max_length=32)          # Mirage, Inferno, ...
    map_index = models.IntegerField()                   # 1..bo
    # ↓↓↓ поля под CS2 (MR12)
    played_rounds = models.IntegerField(default=24)     # 24 при 13:11; 15 при 13:2; 30 при OT 16:14 и т.п.
    winner_team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL)
    class Meta:
        unique_together = ('match', 'map_index')
        ordering = ['match_id', 'map_index']
    def __str__(self):
        return f"{self.map_name} #{self.map_index} — {self.match}"

class PlayerMapStats(models.Model):
    map = models.ForeignKey(Map, on_delete=models.CASCADE)
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    kills = models.IntegerField(default=0)
    deaths = models.IntegerField(default=0)
    assists = models.IntegerField(default=0)
    hs = models.IntegerField(default=0)
    adr = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    rating2 = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
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
    utility_dmg = models.IntegerField(default=0)
    class Meta:
        unique_together = ('map', 'player')
        indexes = [models.Index(fields=['map']), models.Index(fields=['player'])]
    def __str__(self): return f"Stats: {self.player.nickname} — {self.map}"

class FantasyPoints(models.Model):
    """Очки за КАРТУ для конкретного игрока в составе фэнтези-команды."""
    fantasy_team = models.ForeignKey(FantasyTeam, on_delete=models.CASCADE, related_name="points_items")
    map = models.ForeignKey(Map, on_delete=models.CASCADE)
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    points = models.DecimalField(max_digits=8, decimal_places=2)
    breakdown = models.JSONField(default=dict)
    class Meta:
        unique_together = ('fantasy_team', 'map', 'player')
        indexes = [
            models.Index(fields=['fantasy_team', 'map']),
            models.Index(fields=['map']),
        ]

# NEW: цена игрока внутри турнира (автогенерация/ручная правка)
class PlayerPrice(models.Model):
    SOURCE_CHOICES = [
        ("AUTO", "Auto-calculated"),
        ("MANUAL", "Manual"),
    ]
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE)
    player = models.ForeignKey(Player, on_delete=models.CASCADE)
    price = models.IntegerField()  # целые, напр. 235_000
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default="AUTO")
    calc_meta = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("tournament", "player")
        indexes = [
            models.Index(fields=["tournament"]),
            models.Index(fields=["player"]),
        ]

    def __str__(self):
        return f"{self.tournament.name}: {self.player.nickname} — {self.price}"
