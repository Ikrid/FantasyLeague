# core/api_admin_demo_import.py
from __future__ import annotations

import re
from difflib import SequenceMatcher
from tempfile import NamedTemporaryFile

from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from core.models import Match, Map, Player, PlayerMapStats  # поправь импорт под свой проект
from core.demo_parser import extract_map_stats_from_demo     # твой файл с парсером


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _sim(a: str, b: str) -> float:
    a2, b2 = _norm(a), _norm(b)
    if not a2 or not b2:
        return 0.0
    return SequenceMatcher(None, a2, b2).ratio()


def _match_demo_teams_to_match(team_score: dict, team1_name: str, team2_name: str) -> dict:
    """
    team_score приходит из парсера (например {"Natus Vincere": 13, "Vitality": 10})
    Матчим 2 демо-команды к team1/team2 матча по максимальной схожести.
    Возвращает: {"team1_score": int, "team2_score": int}
    """
    keys = list(team_score.keys())
    if len(keys) != 2:
        keys = keys[:2]

    k1 = keys[0] if len(keys) > 0 else ""
    k2 = keys[1] if len(keys) > 1 else ""

    s11 = _sim(k1, team1_name)
    s12 = _sim(k1, team2_name)
    s21 = _sim(k2, team1_name)
    s22 = _sim(k2, team2_name)

    if (s11 + s22) >= (s12 + s21):
        return {"team1_score": team_score.get(k1, 0), "team2_score": team_score.get(k2, 0)}
    return {"team1_score": team_score.get(k2, 0), "team2_score": team_score.get(k1, 0)}


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
def admin_import_demo(request):
    """
    POST form-data:
    - match_id: int
    - map_id: int (optional if create_map_if_missing=1)
    - file OR demo: .dem
    - create_map_if_missing: 1/true (optional)
    """
    match_id = request.data.get("match_id")
    map_id = request.data.get("map_id")

    # поддерживаем оба ключа, чтобы фронт не ломался
    file_obj = request.FILES.get("demo") or request.FILES.get("file")

    create_map_if_missing = str(request.data.get("create_map_if_missing") or "").lower() in ("1", "true", "yes", "y")

    # map_id обязателен только если НЕ просим создать новую карту
    if not match_id or not file_obj or (not map_id and not create_map_if_missing):
        return Response({"detail": "match_id, map_id (or create_map_if_missing=1) and demo/file are required"}, status=400)

    match = get_object_or_404(Match, id=match_id)

    # сохраняем демку во временный файл + парсим
    with NamedTemporaryFile(suffix=".dem", delete=True) as tmp:
        for chunk in file_obj.chunks():
            tmp.write(chunk)
        tmp.flush()
        parsed = extract_map_stats_from_demo(tmp.name)

    team_score = parsed.get("team_score") or {}
    players_stats = parsed.get("players") or []

    # если map_id пришёл — обновляем существующую карту; иначе создаём новую
    if map_id:
        mp = get_object_or_404(Map, id=map_id, match=match)
    else:
        last_idx = (
            Map.objects.filter(match=match)
            .order_by("-map_index")
            .values_list("map_index", flat=True)
            .first()
            or 0
        )
        next_idx = int(last_idx) + 1
        mp = Map.objects.create(
            match=match,
            map_name=str(parsed.get("map_name") or f"map{next_idx}"),
            map_index=next_idx,
            played_rounds=int(parsed.get("played_rounds") or 0),
        )

    # обновим сыгранные раунды и имя карты (если надо)
    if parsed.get("played_rounds") is not None:
        mp.played_rounds = int(parsed["played_rounds"])
    if parsed.get("map_name"):
        mp.map_name = str(parsed["map_name"])
    mp.save()

    # если в Map есть поля team1_score/team2_score — можно обновить
    map_fields = {f.name for f in mp._meta.fields}
    if "team1_score" in map_fields and "team2_score" in map_fields and team_score:
        scores = _match_demo_teams_to_match(team_score, match.team1.name, match.team2.name)
        mp.team1_score = int(scores["team1_score"])
        mp.team2_score = int(scores["team2_score"])
        mp.save()

    player_fields = {f.name for f in Player._meta.fields}

    with transaction.atomic():
        for ps in players_stats:
            p = None
            steam_id = ps.get("steam_id")
            nick = (ps.get("name") or "").strip()

            # 1) по steam_id (только если поле существует в Player)
            if steam_id and "steam_id" in player_fields:
                p = Player.objects.filter(steam_id=steam_id).first()

            # 2) по nickname (точно)
            if p is None and nick:
                p = Player.objects.filter(nickname__iexact=nick).first()

            # 3) fuzzy match по nickname
            if p is None and nick:
                candidates = Player.objects.all()[:5000]
                best = None
                best_s = 0.0
                for c in candidates:
                    s = _sim(getattr(c, "nickname", "") or "", nick)
                    if s > best_s:
                        best_s = s
                        best = c
                if best and best_s >= 0.78:
                    p = best

            # create minimal player
            if p is None:
                create_kwargs = {"nickname": (nick or steam_id or "Unknown")}
                if "steam_id" in player_fields:
                    create_kwargs["steam_id"] = steam_id or None
                p = Player.objects.create(**create_kwargs)

            # какие поля есть в PlayerMapStats
            allowed = {f.name for f in PlayerMapStats._meta.fields}
            defaults = {}

            alias = {
                "hs": "headshots",  # если в модели поле называется headshots
                "utility_dmg": "utility_dmg",  # оставлено как есть (на случай, если поле так и называется)
                # если у тебя в модели utility_damage, раскомментируй:
                # "utility_dmg": "utility_damage",
            }

            for k, v in ps.items():
                kk = alias.get(k, k)
                if kk in allowed:
                    defaults[kk] = v

            # HS% (парсер обычно не отдаёт, считаем сами)
            if "hs_percent" in allowed and "hs_percent" not in defaults:
                kills = float(ps.get("kills") or 0)
                hs = float(ps.get("hs") or ps.get("headshots") or 0)
                defaults["hs_percent"] = (hs / kills * 100.0) if kills > 0 else 0.0

            # на случай другого имени поля
            if "hs_pct" in allowed and "hs_pct" not in defaults:
                kills = float(ps.get("kills") or 0)
                hs = float(ps.get("hs") or ps.get("headshots") or 0)
                defaults["hs_pct"] = (hs / kills * 100.0) if kills > 0 else 0.0

            # rating2 NOT NULL -> всегда число
            if "rating2" in allowed:
                defaults["rating2"] = float(ps.get("rating2") or 0.0)

            PlayerMapStats.objects.update_or_create(
                map=mp,
                player=p,
                defaults=defaults,
            )

    return Response(
        {
            "detail": "demo imported",
            "map_id": mp.id,
            "match_id": match.id,
            "players_processed": len(players_stats),
        }
    )
