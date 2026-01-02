# demo_mapstats.py
# pip install demoparser2 pandas
#
# Usage:
#   python demo_mapstats.py /path/to/match.dem > out.json
#
# Output:
# - map_name
# - rounds
# - score (T / CT)
# - winner
# - players[] with full PlayerMapStats-compatible fields
#
# Added (team-based, if clan names available in demo):
# - team_score: {"Team A": 13, "Team B": 11}
# - winner_team: "Team A" | "DRAW" | None
# - half_score: {"first_half": {...}, "second_half": {...}, "overtime": {...}}
# - side_score_by_team: {"Team A": {"T": x, "CT": y}, ...}

from __future__ import annotations

import bisect
import json
import sys
from dataclasses import dataclass, asdict
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import pandas as pd
from demoparser2 import DemoParser


T_TEAM = 2
CT_TEAM = 3
UTILITY_WEAPONS = {"hegrenade", "molotov", "incgrenade", "inferno"}


@dataclass
class PlayerMapStatsOut:
    name: str
    steamid: str
    rounds_played: int = 0

    kills: int = 0
    deaths: int = 0
    assists: int = 0

    hs: int = 0
    flash_assists: int = 0

    opening_kills: int = 0
    opening_deaths: int = 0

    mk_3k: int = 0
    mk_4k: int = 0
    mk_5k: int = 0

    cl_1v2: int = 0
    cl_1v3: int = 0
    cl_1v4: int = 0
    cl_1v5: int = 0

    utility_dmg: float = 0.0
    adr: float = 0.0


def extract_map_stats_from_demo(demo_path: str) -> dict:
    p = DemoParser(demo_path)
    hdr = p.parse_header()
    map_name = hdr.get("map_name")

    freeze_end = p.parse_event("round_freeze_end")
    round_end = p.parse_event("round_end")

    if freeze_end is None or round_end is None or len(freeze_end) == 0 or len(round_end) == 0:
        raise RuntimeError("Missing round_freeze_end or round_end in demo")

    freeze_ticks = sorted(set(freeze_end["tick"].astype(int).tolist()))

    re_df = round_end.copy()
    re_df["tick"] = re_df["tick"].astype(int)
    re_df = re_df.sort_values("tick")
    re_ticks = re_df["tick"].tolist()

    rounds: List[Tuple[int, int]] = []
    winners: List[Optional[int]] = []

    def _normalize_winner(w) -> Optional[int]:
        """
        demoparser2 round_end.winner can be:
          - "T" / "CT"
          - 2 / 3 (team_num)
          - sometimes 0 / 1 in some builds/parsers
        Return T_TEAM / CT_TEAM or None.
        """
        if w is None or (isinstance(w, float) and pd.isna(w)):
            return None

        # string cases
        if isinstance(w, str):
            s = w.strip().upper()
            if s == "T":
                return T_TEAM
            if s == "CT":
                return CT_TEAM
            # sometimes "2"/"3" as strings
            if s.isdigit():
                n = int(s)
                if n in (T_TEAM, CT_TEAM):
                    return n
                if n == 0:
                    return T_TEAM
                if n == 1:
                    return CT_TEAM
            return None

        # numeric cases
        try:
            n = int(w)
        except Exception:
            return None

        if n in (T_TEAM, CT_TEAM):
            return n
        # fallback mapping (rare)
        if n == 0:
            return T_TEAM
        if n == 1:
            return CT_TEAM
        return None

    for s in freeze_ticks:
        j = bisect.bisect_right(re_ticks, s)
        if j >= len(re_ticks):
            continue
        e = int(re_ticks[j])
        rounds.append((int(s), e))

        row = re_df[re_df["tick"] == e].tail(1)
        w_raw = row["winner"].iloc[0] if len(row) else None
        winners.append(_normalize_winner(w_raw))

    n_rounds = len(rounds)

    t_rounds = sum(1 for w in winners if w == T_TEAM)
    ct_rounds = sum(1 for w in winners if w == CT_TEAM)

    if t_rounds > ct_rounds:
        winner = "T"
    elif ct_rounds > t_rounds:
        winner = "CT"
    else:
        winner = "DRAW"

    round_starts = [s for s, _ in rounds]
    round_ends = [e for _, e in rounds]

    # Try to include clan team name. If not available in the demo/game build, fall back safely.
    try:
        team_rows = p.parse_ticks(
            ["tick", "player_name", "steamid", "team_num", "CCSTeam.m_szClanTeamname"],
            ticks=round_starts,
        )
    except Exception:
        team_rows = p.parse_ticks(
            ["tick", "player_name", "steamid", "team_num"],
            ticks=round_starts,
        )

    team_rows = team_rows[team_rows["team_num"].isin([T_TEAM, CT_TEAM])].copy()

    tick_to_ridx = {t: i for i, t in enumerate(round_starts)}
    round_team: List[Dict[str, Tuple[str, int]]] = [dict() for _ in range(n_rounds)]
    steamid_to_name: Dict[str, str] = {}

    # ---------- NEW: map side -> clan team name per round (for team-based scoring) ----------
    round_side_team: List[Dict[int, Optional[str]]] = [{T_TEAM: None, CT_TEAM: None} for _ in range(n_rounds)]

    def _majority_nonempty(series: pd.Series) -> Optional[str]:
        vals: List[str] = []
        for x in series.tolist():
            if pd.isna(x):
                continue
            s = str(x).strip()
            if s:
                vals.append(s)
        if not vals:
            return None
        return pd.Series(vals).value_counts().idxmax()

    if "CCSTeam.m_szClanTeamname" in team_rows.columns:
        # team_rows contains one row per player on each sampled tick; take majority clan name per side.
        for (tick, side), g in team_rows.groupby(["tick", "team_num"]):
            ridx = tick_to_ridx.get(int(tick))
            if ridx is None:
                continue
            nm = _majority_nonempty(g["CCSTeam.m_szClanTeamname"])
            if nm:
                round_side_team[ridx][int(side)] = nm
    # ---------------------------------------------------------------------------

    for _, row in team_rows.iterrows():
        ridx = tick_to_ridx.get(int(row["tick"]))
        if ridx is None:
            continue
        sid = str(row["steamid"])
        name = str(row["player_name"])
        team = int(row["team_num"])
        round_team[ridx][sid] = (name, team)
        steamid_to_name[sid] = name

    def tick_to_round(tick: int) -> Optional[int]:
        i = bisect.bisect_right(round_starts, tick) - 1
        if i < 0:
            return None
        return i if tick <= round_ends[i] else None

    stats: Dict[str, PlayerMapStatsOut] = {}
    total_dmg: Dict[str, float] = defaultdict(float)

    def get_player(sid: str, name_hint: Optional[str] = None) -> PlayerMapStatsOut:
        if sid not in stats:
            stats[sid] = PlayerMapStatsOut(
                name=(name_hint or steamid_to_name.get(sid, "")),
                steamid=sid,
            )
        return stats[sid]

    for ridx in range(n_rounds):
        for sid, (nm, _) in round_team[ridx].items():
            get_player(sid, nm).rounds_played += 1

    deaths = p.parse_event("player_death")
    hurts = p.parse_event("player_hurt")

    deaths_by_round: List[list] = [[] for _ in range(n_rounds)]

    if deaths is not None and len(deaths):
        for _, r in deaths.iterrows():
            tick = int(r["tick"])
            ridx = tick_to_round(tick)
            if ridx is None:
                continue

            deaths_by_round[ridx].append(r)

            v_sid = str(r.get("user_steamid") or "")
            a_sid = str(r.get("attacker_steamid") or "")
            asid = str(r.get("assister_steamid") or "")

            if v_sid:
                get_player(v_sid).deaths += 1
            if a_sid and str(r.get("attacker_name", "")).lower() not in ("world", "null"):
                ps = get_player(a_sid)
                ps.kills += 1
                if bool(r.get("headshot", False)):
                    ps.hs += 1
            if asid and str(r.get("assister_name", "")).lower() not in ("world", "null"):
                ps = get_player(asid)
                ps.assists += 1
                if bool(r.get("assistedflash", False)):
                    ps.flash_assists += 1

    if hurts is not None and len(hurts):
        for _, r in hurts.iterrows():
            tick = int(r["tick"])
            ridx = tick_to_round(tick)
            if ridx is None:
                continue

            attacker_sid = str(r.get("attacker_steamid") or "")
            victim_sid = str(r.get("user_steamid") or "")
            if not attacker_sid or not victim_sid:
                continue

            a = round_team[ridx].get(attacker_sid)
            v = round_team[ridx].get(victim_sid)
            if not a or not v or a[1] == v[1]:
                continue

            dmg = float(r.get("dmg_health", 0) or 0)
            if dmg <= 0:
                continue

            total_dmg[attacker_sid] += dmg
            if str(r.get("weapon") or "") in UTILITY_WEAPONS:
                get_player(attacker_sid).utility_dmg += dmg

    for ridx in range(n_rounds):
        dr = sorted(deaths_by_round[ridx], key=lambda x: int(x["tick"]))

        if dr:
            first = dr[0]
            if first.get("user_steamid"):
                get_player(str(first["user_steamid"])).opening_deaths += 1
            if first.get("attacker_steamid"):
                get_player(str(first["attacker_steamid"])).opening_kills += 1

        kills_per_player = defaultdict(int)
        for ev in dr:
            a_sid = str(ev.get("attacker_steamid") or "")
            if a_sid:
                kills_per_player[a_sid] += 1

        for sid, k in kills_per_player.items():
            ps = get_player(sid)
            if k == 3:
                ps.mk_3k += 1
            elif k == 4:
                ps.mk_4k += 1
            elif k >= 5:
                ps.mk_5k += 1

        tm = round_team[ridx]
        alive_t = {sid for sid, (_, t) in tm.items() if t == T_TEAM}
        alive_ct = {sid for sid, (_, t) in tm.items() if t == CT_TEAM}
        candidate = {T_TEAM: None, CT_TEAM: None}

        for ev in dr:
            v_sid = str(ev.get("user_steamid") or "")
            if not v_sid or v_sid not in tm:
                continue

            if tm[v_sid][1] == T_TEAM:
                alive_t.discard(v_sid)
            else:
                alive_ct.discard(v_sid)

            if candidate[T_TEAM] is None and len(alive_t) == 1:
                last = next(iter(alive_t))
                x = len(alive_ct)
                if 2 <= x <= 5:
                    candidate[T_TEAM] = (last, x)

            if candidate[CT_TEAM] is None and len(alive_ct) == 1:
                last = next(iter(alive_ct))
                x = len(alive_t)
                if 2 <= x <= 5:
                    candidate[CT_TEAM] = (last, x)

        wteam = winners[ridx]
        if wteam in (T_TEAM, CT_TEAM) and candidate[wteam]:
            sid_last, x = candidate[wteam]
            alive_set = alive_t if wteam == T_TEAM else alive_ct
            if sid_last in alive_set:
                ps = get_player(sid_last)
                if x == 2:
                    ps.cl_1v2 += 1
                elif x == 3:
                    ps.cl_1v3 += 1
                elif x == 4:
                    ps.cl_1v4 += 1
                elif x == 5:
                    ps.cl_1v5 += 1

    for sid, ps in stats.items():
        rp = ps.rounds_played if ps.rounds_played else n_rounds
        ps.adr = total_dmg.get(sid, 0.0) / rp

    # ---------- NEW: team-based score + winner (based on clan names per round winner side) ----------
    team_score: Dict[str, int] = defaultdict(int)
    team_side_score: Dict[str, Dict[str, int]] = defaultdict(lambda: {"T": 0, "CT": 0})

    half_score: Dict[str, Dict[str, int]] = {
        "first_half": defaultdict(int),
        "second_half": defaultdict(int),
        "overtime": defaultdict(int),
    }

    # Detect halftime by side-swap (works for MR12/MR15 when names exist)
    base_t: Optional[str] = None
    base_ct: Optional[str] = None
    base_idx: Optional[int] = None
    for i in range(n_rounds):
        bt = round_side_team[i].get(T_TEAM)
        bc = round_side_team[i].get(CT_TEAM)
        if bt and bc:
            base_t, base_ct, base_idx = bt, bc, i
            break

    half_split = 12 if n_rounds > 12 else n_rounds  # fallback if we can't detect
    if base_t and base_ct and base_idx is not None:
        for i in range(base_idx + 1, n_rounds):
            tnm = round_side_team[i].get(T_TEAM)
            ctnm = round_side_team[i].get(CT_TEAM)
            if tnm and ctnm and tnm == base_ct and ctnm == base_t:
                half_split = i
                break

    # Detect start of OT as return to original side assignment (after regulation second half)
    ot_start = n_rounds
    if base_t and base_ct:
        for i in range(half_split + 1, n_rounds):
            tnm = round_side_team[i].get(T_TEAM)
            ctnm = round_side_team[i].get(CT_TEAM)
            if tnm and ctnm and tnm == base_t and ctnm == base_ct:
                ot_start = i
                break

    for i, wside in enumerate(winners):
        if wside not in (T_TEAM, CT_TEAM):
            continue
        nm = round_side_team[i].get(wside)
        if not nm:
            continue

        team_score[nm] += 1
        team_side_score[nm]["T" if wside == T_TEAM else "CT"] += 1

        if i < half_split:
            half_score["first_half"][nm] += 1
        elif i < ot_start:
            half_score["second_half"][nm] += 1
        else:
            half_score["overtime"][nm] += 1

    winner_team: Optional[str] = None
    if team_score:
        mx = max(team_score.values())
        tops = [k for k, v in team_score.items() if v == mx]
        winner_team = tops[0] if len(tops) == 1 else "DRAW"

    team_score_out = dict(team_score)
    team_side_score_out = {k: dict(v) for k, v in team_side_score.items()}
    half_score_out = {k: dict(v) for k, v in half_score.items()}

    # If overtime dict is empty, keep it but empty (stable schema)
    # ---------------------------------------------------------------------------

    return {
        "map_name": map_name,
        "rounds": n_rounds,
        "score": {"T": t_rounds, "CT": ct_rounds},
        "winner": winner,
        "team_score": team_score_out,
        "winner_team": winner_team,
        "half_score": half_score_out,
        "side_score_by_team": team_side_score_out,
        "players": [asdict(ps) for ps in stats.values()],
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python demo_mapstats.py /path/to/demo.dem", file=sys.stderr)
        return 2
    out = extract_map_stats_from_demo(argv[1])
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
