from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import PlayerMapStats
from .services import recalc_map

@receiver(post_save, sender=PlayerMapStats)
def _recalc_on_stats_save(sender, instance: PlayerMapStats, **kwargs):

    recalc_map(instance.map_id)
