# core/api_admin_demo_import.py
from __future__ import annotations

import re
from difflib import SequenceMatcher
from tempfile import NamedTemporaryFile

from django.db import transaction
from django.db.models import Max
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


def _match_demo_teams_to_match(team_score: dict, team1_name: str, team2_name: str) -> tuple[str, str]:
    """
    team_score: {"Team Name": 13, "Other": 10}
    Возвращает (demo_team1, demo_team2) в порядке match.team1/team2
    """
    demo_names = list(team_score.keys())
    if len(demo_names) < 2:
        if demo_names:
            return demo_names[0], demo_names[0]
        return team1_name, team2_name

    best_for_t1 = max(demo_names, key=lambda dn: _sim(dn, team1_name))
    remaining = [dn for dn in demo_names if dn != best_for_t1]
    best_for_t2 = max(remaining, key=lambda dn: _sim(dn, team2_name)) if remaining else best_for_t1
    return best_for_t1, best_for_t2


@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
@transaction.atomic
def admin_import_demo(request):
    """
    POST multipart (поддерживает оба варианта ключей, чтобы не ломать фронт):
      - match_id (int)                           [обязательно]
      - map_id (optional int)
      - file (demo .dem)                         (или demo)
      - create_map=1 + map_name + map_index      (старый вариант)
      - create_map_if_missing=1                  (вариант фронта: создать новую карту автоматически)
    """
    match_id = request.data.get("match_id")
    map_id = request.data.get("map_id")

    # старый флаг
    create_map = request.data.get("create_map")
    # флаг из твоего AdminPage
    create_map_if_missing = request.data.get("create_map_if_missing")

    map_name = request.data.get("map_name")
    map_index = request.data.get("map_index")

    # поддержка обоих названий файла: "file" и "demo"
    demo_file = request.FILES.get("file") or request.FILES.get("demo")

    if not match_id:
        return Response({"detail": "match_id is required"}, status=400)
    if not demo_file:
        return Response({"detail": "file is required"}, status=400)

    match = get_object_or_404(Match, id=match_id)

    # 1) сохранить демо во временный файл и распарсить
    with NamedTemporaryFile(delete=True, suffix=".dem") as tmp:
        for chunk in demo_file.chunks():
            tmp.write(chunk)
        tmp.flush()
        parsed = extract_map_stats_from_demo(tmp.name)

    played_rounds = parsed.get("played_rounds") or 0
    team_score = parsed.get("team_score") or {}
    players_stats = parsed.get("players") or []
    parsed_map_name = parsed.get("map") or None

    # 2) выбрать/создать Map
    if map_id:
        mp = get_object_or_404(Map, id=map_id, match=match)
    else:
        # create_map_if_missing=1 (из фронта) или create_map=1 (старый)
        want_create = str(create_map_if_missing or create_map or "").strip() in {"1", "true", "True", "yes", "on"}

        if not want_create:
            return Response({"detail": "map_id or create_map/create_map_if_missing is required"}, status=400)

        # имя карты: либо пришло с фронта, либо из демо
        use_map_name = (map_name or parsed_map_name or "").strip()
        if not use_map_name:
            return Response({"detail": "map_name is required (or demo must contain map name)"}, status=400)

        # индекс:
        # - если фронт просит create_map_if_missing, берём следующий индекс
        # - иначе пробуем map_index из запроса, fallback = 1
        if str(create_map_if_missing or "").strip() in {"1", "true", "True", "yes", "on"}:
            mx = Map.objects.filter(match=match).aggregate(m=Max("map_index")).get("m") or 0
            mi = int(mx) + 1
        else:
            try:
                mi = int(map_index or 1)
            except Exception:
                mi = 1

        mp = Map.objects.create(match=match, map_name=use_map_name, map_index=mi)

    # 3) записать общие данные карты
    if played_rounds:
        mp.played_rounds = played_rounds
        mp.save(update_fields=["played_rounds"])

    # 4) сопоставить команды демо к match.team1/team2
    demo_team1, demo_team2 = _match_demo_teams_to_match(
        team_score, getattr(match.team1, "name", ""), getattr(match.team2, "name", "")
    )

    # 5) заполнить Map team scores и winner (если поля существуют)
    map_fields = {f.name for f in Map._meta.fields}
    if "team1_score" in map_fields and "team2_score" in map_fields and team_score:
        mp.team1_score = int(team_score.get(demo_team1, 0) or 0)
        mp.team2_score = int(team_score.get(demo_team2, 0) or 0)

        if "winner_team" in map_fields:
            if mp.team1_score > mp.team2_score:
                mp.winner_team = match.team1
            elif mp.team2_score > mp.team1_score:
                mp.winner_team = match.team2
            else:
                mp.winner_team = None

        mp.save()

    # 6) записать PlayerMapStats
    for ps in players_stats:
        name = ps.get("name")
        if not name:
            continue
        steam_id = ps.get("steam_id") or None

        # найти/создать Player
        p = None
        if steam_id:
            p = Player.objects.filter(steam_id=steam_id).first()
        if not p:
            p = Player.objects.filter(nickname__iexact=name).first()

        if not p:
            create_kwargs = {}
            if hasattr(Player, "nickname"):
                create_kwargs["nickname"] = name
            elif hasattr(Player, "name"):
                create_kwargs["name"] = name
            else:
                create_kwargs = {"nickname": name}

            if hasattr(Player, "steam_id"):
                create_kwargs["steam_id"] = steam_id or None

            p = Player.objects.create(**create_kwargs)

        allowed = {f.name for f in PlayerMapStats._meta.fields}
        defaults: dict = {}

        alias: dict[str, str] = {
            "utility_dmg": "utility_dmg",
        }

        # HS: не ломаем, подстраиваемся под реальное поле модели
        if "headshots" in allowed and "hs" not in allowed:
            alias["hs"] = "headshots"
        elif "hs" in allowed and "headshots" not in allowed:
            alias["headshots"] = "hs"

        for k, v in ps.items():
            kk = alias.get(k, k)
            if kk in allowed:
                defaults[kk] = v

        if hasattr(PlayerMapStats, "map") and hasattr(PlayerMapStats, "player"):
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
