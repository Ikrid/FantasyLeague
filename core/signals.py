from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver

from .models import PlayerMapStats, Map
from .services import recalc_map


# Простая очередь для "склеивания" множественных вызовов в одной транзакции
def _queue_recalc(map_id: int | None) -> None:
    if not map_id:
        return
    pending = getattr(_queue_recalc, "_pending", None)
    if pending is None:
        pending = set()
        _queue_recalc._pending = pending
        # Выполнить один раз после коммита всей транзакции
        transaction.on_commit(_flush_recalc_queue)
    pending.add(int(map_id))


def _flush_recalc_queue():
    pending = getattr(_queue_recalc, "_pending", None)
    if not pending:
        return
    maps_to_recalc = list(pending)
    # ❗️удаляем атрибут полностью
    if hasattr(_queue_recalc, "_pending"):
        delattr(_queue_recalc, "_pending")
    for mid in maps_to_recalc:
        try:
            recalc_map(mid)
        except Exception:
            pass



@receiver(post_save, sender=PlayerMapStats, weak=False)
def _pms_saved(sender, instance: PlayerMapStats, created: bool, **kwargs):
    """
    Любое сохранение строк статы игрока на карте → пересчёт FantasyPoints по этой карте.
    Складываем в очередь и выполняем после коммита.
    """
    _queue_recalc(instance.map_id)


@receiver(post_delete, sender=PlayerMapStats, weak=False)
def _pms_deleted(sender, instance: PlayerMapStats, **kwargs):
    """
    Удалили строчку статы → тоже пересчитать карту.
    """
    _queue_recalc(instance.map_id)


@receiver(pre_save, sender=Map, weak=False)
def _map_pre_save(sender, instance: Map, **kwargs):
    """
    Если у карты меняются ключевые поля (кол-во раундов, победитель),
    пересчитываем очки по этой карте после коммита.
    """
    if not instance.pk:
        return
    try:
        old = Map.objects.only("played_rounds", "winner_team_id").get(pk=instance.pk)
    except Map.DoesNotExist:
        return

    played_changed = (old.played_rounds != instance.played_rounds)
    # winner_team_id может отсутствовать в модели — поэтому через getattr с None
    winner_changed = (getattr(old, "winner_team_id", None) != getattr(instance, "winner_team_id", None))

    if played_changed or winner_changed:
        # Привяжем к on_commit, чтобы считать на уже зафиксированных данных
        transaction.on_commit(lambda mid=instance.pk: recalc_map(mid))
