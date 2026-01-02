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


def _to_py_number(v):
    """
    demoparser/pandas могут приносить numpy типы.
    Django обычно ок, но UI/serializer/DB поля иногда ожидают чистый int/float.
    """
    try:
        # bool is also int, keep it
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return v
        # numpy scalars have item()
        if hasattr(v, "item"):
            return v.item()
    except Exception:
        pass
    return v


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

    # ---- FIX: ключи из твоего demo_parser ----
    # новый парсер: rounds, map_name, players, team_score
    played_rounds = parsed.get("played_rounds")
    if played_rounds in (None, 0, "0", ""):
        played_rounds = parsed.get("rounds")  # <-- твой парсер
    played_rounds = int(played_rounds or 0)

    team_score = parsed.get("team_score") or {}
    players_stats = parsed.get("players") or []

    parsed_map_name = parsed.get("map") or None
    if not parsed_map_name:
        parsed_map_name = parsed.get("map_name") or None  # <-- твой парсер
    # -----------------------------------------

    # 2) выбрать/создать Map
    if map_id:
        mp = get_object_or_404(Map, id=map_id, match=match)
    else:
        # create_map_if_missing=1 (из фронта) или create_map=1 (старый)
        want_create = str(create_map_if_missing or create_map or "").strip() in {"1", "true", "True", "yes", "on"}

        if not want_create:
            return Response({"detail": "map_id or create_map/create_map_if_missing is required"}, status=400)

        # --- fallback - попытка вытащить карту из имени файла демо (если парсер не дал map_name) ---
        KNOWN_MAPS = {
            "ancient", "anubis", "inferno", "mirage", "nuke",
            "overpass", "vertigo", "dust2", "train", "cache",
            "cobblestone", "cbble",
        }

        def _infer_map_from_filename(fname: str) -> str | None:
            if not fname:
                return None
            low = fname.lower()
            for m in KNOWN_MAPS:
                if re.search(rf"(^|[^a-z0-9]){re.escape(m)}([^a-z0-9]|$)", low):
                    return f"de_{m}" if not m.startswith("de_") else m
            return None
        # -----------------------------------------------------------------------

        inferred = _infer_map_from_filename(getattr(demo_file, "name", ""))
        use_map_name = (map_name or parsed_map_name or inferred or "").strip()
        if not use_map_name:
            return Response({"detail": "map_name is required (or demo must contain map name)"}, status=400)

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

        # Player steam_id у тебя нет — матчим по nickname
        p = Player.objects.filter(nickname__iexact=name).first()
        if not p:
            p = Player.objects.create(nickname=name)

        allowed = {f.name for f in PlayerMapStats._meta.fields}
        defaults: dict = {}

        def _to_py(v):
            try:
                if hasattr(v, "item"):
                    v = v.item()
            except Exception:
                pass
            # clamp floats that are ints
            if isinstance(v, float) and v.is_integer():
                return int(v)
            return v

        # БАЗОВЫЕ алиасы
        alias: dict[str, str] = {
            "utility_dmg": "utility_dmg",
            "rounds_played": "rounds_played",
        }

        # HS алиас
        if "headshots" in allowed and "hs" not in allowed:
            alias["hs"] = "headshots"
        elif "hs" in allowed and "headshots" not in allowed:
            alias["headshots"] = "hs"

        # КЛАТЧИ: пробуем все реальные варианты имён полей (возьмётся тот, что есть в модели)
        clutch_map = {
            "cl_1v2": ["cl_1v2", "clutch_1v2", "clutches_1v2", "clutch1v2", "cl_1v2_wins"],
            "cl_1v3": ["cl_1v3", "clutch_1v3", "clutches_1v3", "clutch1v3", "cl_1v3_wins"],
            "cl_1v4": ["cl_1v4", "clutch_1v4", "clutches_1v4", "clutch1v4", "cl_1v4_wins"],
            "cl_1v5": ["cl_1v5", "clutch_1v5", "clutches_1v5", "clutch1v5", "cl_1v5_wins"],
        }
        for src, candidates in clutch_map.items():
            for cand in candidates:
                if cand in allowed:
                    alias[src] = cand
                    break

        # Остальные поля — как было, но с _to_py
        for k, v in ps.items():
            kk = alias.get(k, k)
            if kk in allowed:
                defaults[kk] = _to_py(v)

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
