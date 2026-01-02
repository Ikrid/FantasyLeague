import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const BASE_URL = "http://localhost:8000/api";

/* ================== API ================== */
const getToken = () => localStorage.getItem("access");
const authHeader = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

async function apiGet(path, needsAuth = true) {
  const r = await fetch(`${BASE_URL}${path}`, {
    headers: needsAuth ? authHeader() : {},
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(d?.detail || d?.error || `GET ${path}: ${r.status}`);
  return d;
}

async function apiPost(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail || d?.error || JSON.stringify(d));
  return d;
}

/* ================== FLAGS (local /public/flags/*.svg) ================== */
function normalizeFlagCode(raw) {
  if (!raw) return "";
  return String(raw).trim().toLowerCase(); // lowercase for /public/flags
}

function FlagImg({ code, className = "" }) {
  const norm = normalizeFlagCode(code);
  const [failed, setFailed] = useState(false);

  if (!norm || failed) return null;

  return (
    <img
      src={`/flags/${norm}.svg`}
      alt={norm}
      className={`inline-block ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* ================== UI ================== */
function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
  type = "button",
}) {
  const base =
    variant === "ghost"
      ? "bg-transparent text-white hover:bg-white/10"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-500"
      : "bg-white text-black hover:bg-zinc-200";

  const dis = disabled ? "opacity-50 cursor-not-allowed hover:none" : "";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-xl transition ${base} ${dis} ${className}`}
    >
      {children}
    </button>
  );
}

function Pill({ children }) {
  return (
    <span className="text-xs px-2 py-1 rounded-full bg-white/10">
      {children}
    </span>
  );
}

/*
  Modal updated:
  - optional containerClassName to control width/height without breaking existing calls
  - optional bodyClassName to allow scroll areas
*/
function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  containerClassName = "",
  bodyClassName = "",
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={`relative w-full max-w-2xl rounded-2xl bg-zinc-950 border border-zinc-800 p-6 mx-4 ${containerClassName}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className={`space-y-4 ${bodyClassName}`}>{children}</div>
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  );
}

function InfoTile({ label, value, sub }) {
  return (
    <div className="rounded-lg bg-black/40 border border-white/10 p-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  );
}

/* ================== ROLES ================== */
const ROLE_OPTIONS = [
  { code: "", label: "No role" },
  { code: "STAR_PLAYER", label: "Star Player" },
  { code: "ENTRY_FRAGGER", label: "Entry Fragger" },
  { code: "SUPPORT", label: "Support" },
  { code: "GRENADER", label: "Grenader" },
  { code: "CLUTCH_MINISTER", label: "Clutch Minister" },
  { code: "MULTI_FRAGGER", label: "Multi Fragger" },
  { code: "HS_MACHINE", label: "HS Machine" },
  { code: "BAITER", label: "Baiter" },
];

const ROLE_DETAILS = {
  "": {
    title: "No role",
    desc: "No risk/reward modifier. Player scores with base scoring only.",
    how: ["No extra bonus / penalty from role system."],
  },
  STAR_PLAYER: {
    title: "Star Player",
    desc: "Rewards high rating. Punishes low rating.",
    how: [
      "Based on rating2 (target ≈ 1.15).",
      "Higher rating = bonus; lower rating = penalty.",
      "Strongest single-metric role.",
    ],
  },
  ENTRY_FRAGGER: {
    title: "Entry Fragger",
    desc: "Rewards opening kills. Adjusts entry-death penalty depending on entry success.",
    how: [
      "Bonus/penalty from opening kills (normalized by map length).",
      "If openings succeed (opening_kills ≥ 1 and ≥ opening_deaths): reduces opening-death penalty.",
      "If openings fail: increases opening-death penalty.",
    ],
  },
  SUPPORT: {
    title: "Support",
    desc: "Rewards flash assists. Low flashes = penalty.",
    how: [
      "Based on flash_assists (normalized by map length).",
      "Target ≈ 2 flash assists per normal-length map.",
    ],
  },
  GRENADER: {
    title: "Grenader",
    desc: "Rewards utility damage. Low utility impact = penalty.",
    how: [
      "Based on utility damage (normalized by map length).",
      "Target ≈ 35 utility damage per normal-length map.",
    ],
  },
  CLUTCH_MINISTER: {
    title: "Clutch Minister",
    desc: "Rewards winning clutches. No clutches = penalty.",
    how: [
      "Based on total clutch wins (1v2..1v5), normalized by map length.",
      "Target ≈ 1 clutch win per normal-length map.",
      "2+ clutches = big bonus.",
    ],
  },
  MULTI_FRAGGER: {
    title: "Multi Fragger",
    desc: "Rewards multi-kill rounds (3K/4K/5K).",
    how: [
      "Weighted multikills: 3K=1, 4K=2, 5K=3 (normalized by map length).",
      "Target ≈ 1 weighted multikill per normal-length map.",
    ],
  },
  HS_MACHINE: {
    title: "HS Machine",
    desc: "Rewards high headshot percentage. Low HS% = penalty.",
    how: ["Based on HS% = (hs / kills) * 100.", "Target ≈ 55% HS."],
  },
  BAITER: {
    title: "Baiter",
    desc: "Rewards low deaths relative to map length; too many deaths = penalty.",
    how: [
      "Compares deaths to a dynamic target (≈ 10 * round_factor).",
      "Fewer deaths than target = bonus; more deaths = penalty.",
    ],
  },
};

function roleLabel(code) {
  const found = ROLE_OPTIONS.find((r) => r.code === (code || ""));
  return found ? found.label : String(code || "");
}

/* ================== FINISHED MATCHES HELPERS ================== */
function pickFirst(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function normalizeBreakdown(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x, idx) => {
        if (!x) return null;
        if (typeof x === "string") return { key: String(idx), label: x };
        if (typeof x === "number")
          return { key: String(idx), label: `#${idx + 1}`, points: x };
        if (typeof x === "object") {
          const label =
            x.label || x.name || x.key || x.metric || x.stat || `#${idx + 1}`;
          const value = pickFirst(x, ["value", "count", "raw", "stat_value"]);
          const points = pickFirst(x, ["points", "pts", "score", "fantasy_pts"]);
          return {
            key: String(x.key || x.metric || x.stat || idx),
            label: String(label),
            value:
              value !== undefined && value !== null && value !== ""
                ? value
                : undefined,
            points:
              typeof points === "number"
                ? points
                : points != null && !Number.isNaN(Number(points))
                ? Number(points)
                : undefined,
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  if (typeof raw === "object") {
    return Object.entries(raw).map(([k, v]) => {
      if (v && typeof v === "object") {
        const value = pickFirst(v, ["value", "count", "raw", "stat_value"]);
        const points = pickFirst(v, ["points", "pts", "score", "fantasy_pts"]);
        return {
          key: k,
          label: k,
          value:
            value !== undefined && value !== null && value !== ""
              ? value
              : undefined,
          points:
            typeof points === "number"
              ? points
              : points != null && !Number.isNaN(Number(points))
              ? Number(points)
              : undefined,
        };
      }
      if (typeof v === "number") return { key: k, label: k, points: v };
      return { key: k, label: k, value: v };
    });
  }

  return [];
}

function normalizeFinishedRosterMatches(raw, rosterIdsSet) {
  const list = Array.isArray(raw) ? raw : raw?.results || raw?.data || [];
  if (!Array.isArray(list)) return [];

  // Case A: array of matches with embedded players
  if (list.length && (list[0]?.players || list[0]?.roster_players)) {
    const out = [];
    for (const m of list) {
      const playersRaw = m.players || m.roster_players || [];
      const players = (playersRaw || [])
        .filter((p) => rosterIdsSet?.has(Number(p.player_id || p.playerId)))
        .map((p) => ({
          playerId: Number(p.player_id || p.playerId),
          playerName: p.player_name || p.playerName || "Unknown",
          playerFlagCode:
            p.player_nationality_code ||
            p.nationality_code ||
            p.player_flag_code ||
            p.country_code ||
            "",
          points: pickFirst(p, [
            "points",
            "fantasy_points",
            "fantasy_pts",
            "total_points",
          ]),
          breakdown:
            p.breakdown || p.points_breakdown || p.explain || p.point_breakdown,
          stats: p.stats || p.player_stats || p.performance || null,
          raw: p,
        }));

      out.push({
        key: String(m.match_id || m.id || m.matchId || m.match?.id),
        matchId: Number(m.match_id || m.id || m.matchId || m.match?.id),
        team1Name:
          m.team1_name ||
          m.team1 ||
          m.team_1_name ||
          m.match?.team1_name ||
          "Team 1",
        team2Name:
          m.team2_name ||
          m.team2 ||
          m.team_2_name ||
          m.match?.team2_name ||
          "Team 2",
        startTime: m.start_time || m.startTime || m.match?.start_time || null,
        bo: m.bo || m.best_of || m.match?.bo || null,
        players,
        raw: m,
      });
    }
    out.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
    return out;
  }

  // Case B: flat array of player-match rows -> group by match
  const groups = new Map();
  for (const row of list) {
    const pid = Number(row.player_id || row.playerId);
    if (rosterIdsSet && !rosterIdsSet.has(pid)) continue;

    const mid = Number(row.match_id || row.matchId || row.match?.id || row.id);
    if (!mid) continue;

    const key = String(mid);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        matchId: mid,
        team1Name:
          row.team1_name ||
          row.match?.team1_name ||
          row.team1 ||
          row.match_team1_name ||
          "Team 1",
        team2Name:
          row.team2_name ||
          row.match?.team2_name ||
          row.team2 ||
          row.match_team2_name ||
          "Team 2",
        startTime: row.start_time || row.match?.start_time || null,
        bo: row.bo || row.match?.bo || null,
        players: [],
        raw: row,
      });
    }

    groups.get(key).players.push({
      playerId: pid,
      playerName: row.player_name || row.playerName || "Unknown",
      playerFlagCode:
        row.player_nationality_code ||
        row.nationality_code ||
        row.player_flag_code ||
        row.country_code ||
        "",
      points: pickFirst(row, [
        "points",
        "fantasy_points",
        "fantasy_pts",
        "total_points",
      ]),
      breakdown:
        row.breakdown ||
        row.points_breakdown ||
        row.explain ||
        row.point_breakdown,
      stats: row.stats || row.player_stats || row.performance || null,
      raw: row,
    });
  }

  const out = Array.from(groups.values());
  out.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
  return out;
}

/* ================== ROLE PICKER MODAL ================== */
function RoleTile({ roleCode, active, disabled, taken, onClick }) {
  const info = ROLE_DETAILS[roleCode] || { title: roleCode, desc: "", how: [] };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-2xl border p-4 transition ${
        active
          ? "border-white/30 bg-white/10"
          : "border-white/10 bg-white/5 hover:bg-white/10"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{info.title}</div>
          {info.desc && (
            <div className="text-sm text-zinc-300 mt-1">{info.desc}</div>
          )}
          {taken && (
            <div className="text-xs text-red-400 mt-2">
              Already used by another player
            </div>
          )}
        </div>
        <div
          className={`mt-0.5 h-4 w-4 rounded-full border ${
            active ? "bg-white border-white" : "border-white/30"
          }`}
        />
      </div>

      {info.how?.length ? (
        <ul className="mt-3 list-disc pl-5 text-xs text-zinc-400 space-y-1">
          {info.how.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      ) : null}
    </button>
  );
}

function RolesModal({
  open,
  onClose,
  currentRole,
  onPickRole,
  disabled,
  playerName,
  teamName,
  usedRolesSet,
}) {
  const [selectedRole, setSelectedRole] = useState(currentRole || "");

  useEffect(() => {
    setSelectedRole(currentRole || "");
  }, [currentRole, open]);

  if (!open) return null;

  const taken = (code) =>
    code && usedRolesSet?.has(code) && code !== selectedRole;

  const canApply =
    !disabled && !(selectedRole && usedRolesSet?.has(selectedRole));

  const gridRoles = ROLE_OPTIONS.filter((r) => r.code !== "");
  const noRole = ROLE_OPTIONS.find((r) => r.code === "");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pick role${playerName ? ` — ${playerName}` : ""}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            {teamName ? `Team: ${teamName}` : ""}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onPickRole(selectedRole)} disabled={!canApply}>
              Apply
            </Button>
          </div>
        </div>
      }
    >
      <div className="text-sm text-zinc-300">
        Each role can be used only once in your roster. Base scoring stays the
        same; roles affect only the role-bonus system.
      </div>

      {noRole && (
        <RoleTile
          roleCode=""
          active={(selectedRole || "") === ""}
          disabled={disabled}
          taken={false}
          onClick={() => setSelectedRole("")}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {gridRoles.map((opt) => (
          <RoleTile
            key={opt.code}
            roleCode={opt.code}
            active={(selectedRole || "") === opt.code}
            disabled={disabled || taken(opt.code)}
            taken={taken(opt.code)}
            onClick={() => setSelectedRole(opt.code)}
          />
        ))}
      </div>
    </Modal>
  );
}

/* ================== MAP/POINTS VIEW HELPERS ================== */
function safeNum(x, d = 0) {
  if (x == null) return d;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : d;
}

function mergeBreakdowns(breakdowns) {
  // Accepts array of breakdown objects/arrays, returns a single object with summed points.
  const acc = {};
  for (const b of breakdowns || []) {
    if (!b) continue;

    if (Array.isArray(b)) {
      // best effort: treat as list of items with possible key/label/points
      for (let i = 0; i < b.length; i++) {
        const it = b[i];
        if (it == null) continue;
        if (typeof it === "number") {
          const k = `#${i + 1}`;
          acc[k] = (acc[k] || 0) + it;
          continue;
        }
        if (typeof it === "string") {
          const k = it;
          acc[k] = acc[k] || 0;
          continue;
        }
        if (typeof it === "object") {
          const k = String(it.key || it.metric || it.stat || it.label || i);
          const pts = pickFirst(it, ["points", "pts", "score", "fantasy_pts"]);
          acc[k] = (acc[k] || 0) + safeNum(pts, 0);
        }
      }
      continue;
    }

    if (typeof b === "object") {
      for (const [k, v] of Object.entries(b)) {
        if (v && typeof v === "object") {
          const pts = pickFirst(v, ["points", "pts", "score", "fantasy_pts"]);
          acc[k] = (acc[k] || 0) + safeNum(pts, 0);
        } else if (typeof v === "number") {
          acc[k] = (acc[k] || 0) + v;
        } else {
          acc[k] = acc[k] || 0;
        }
      }
      continue;
    }
  }
  return acc;
}

function computeAllMapsView(fmData) {
  const maps = Array.isArray(fmData?.maps) ? fmData.maps : [];
  const out = {
    total_points: safeNum(fmData?.total_points, 0),
    kills: 0,
    deaths: 0,
    assists: 0,
    hs: 0,
    opening_kills: 0,
    opening_deaths: 0,
    flash_assists: 0,
    mk_3k: 0,
    mk_4k: 0,
    mk_5k: 0,
    cl_1v2: 0,
    cl_1v3: 0,
    cl_1v4: 0,
    cl_1v5: 0,
    utility_dmg: 0,
    adr_avg: null,
    rating2_avg: null,
    breakdown: null,
  };

  if (!maps.length) return out;

  let adrWeightedSum = 0;
  let ratingWeightedSum = 0;
  let weightSum = 0;

  const bList = [];

  for (const m of maps) {
    const st = m?.stats || {};
    out.kills += safeNum(st.kills, 0);
    out.deaths += safeNum(st.deaths, 0);
    out.assists += safeNum(st.assists, 0);
    out.hs += safeNum(st.hs, 0);
    out.opening_kills += safeNum(st.opening_kills, 0);
    out.opening_deaths += safeNum(st.opening_deaths, 0);
    out.flash_assists += safeNum(st.flash_assists, 0);
    out.mk_3k += safeNum(st.mk_3k, 0);
    out.mk_4k += safeNum(st.mk_4k, 0);
    out.mk_5k += safeNum(st.mk_5k, 0);
    out.cl_1v2 += safeNum(st.cl_1v2, 0);
    out.cl_1v3 += safeNum(st.cl_1v3, 0);
    out.cl_1v4 += safeNum(st.cl_1v4, 0);
    out.cl_1v5 += safeNum(st.cl_1v5, 0);
    out.utility_dmg += safeNum(st.utility_dmg, 0);

    // averages: weight by played_rounds when available, otherwise equal weight
    const w = safeNum(m?.played_rounds, 0) || 1;
    const adr = st.adr;
    const rating2 = st.rating2;

    if (adr != null) {
      adrWeightedSum += safeNum(adr, 0) * w;
    }
    if (rating2 != null) {
      ratingWeightedSum += safeNum(rating2, 0) * w;
    }
    weightSum += w;

    if (m?.breakdown) bList.push(m.breakdown);
  }

  if (weightSum > 0) {
    out.adr_avg = adrWeightedSum / weightSum;
    out.rating2_avg = ratingWeightedSum / weightSum;
  }

  out.breakdown = mergeBreakdowns(bList);
  return out;
}

function computeSingleMapView(mapRow) {
  const st = mapRow?.stats || {};
  return {
    total_points: safeNum(mapRow?.points, 0),
    kills: safeNum(st.kills, 0),
    deaths: safeNum(st.deaths, 0),
    assists: safeNum(st.assists, 0),
    hs: safeNum(st.hs, 0),
    opening_kills: safeNum(st.opening_kills, 0),
    opening_deaths: safeNum(st.opening_deaths, 0),
    flash_assists: safeNum(st.flash_assists, 0),
    mk_3k: safeNum(st.mk_3k, 0),
    mk_4k: safeNum(st.mk_4k, 0),
    mk_5k: safeNum(st.mk_5k, 0),
    cl_1v2: safeNum(st.cl_1v2, 0),
    cl_1v3: safeNum(st.cl_1v3, 0),
    cl_1v4: safeNum(st.cl_1v4, 0),
    cl_1v5: safeNum(st.cl_1v5, 0),
    utility_dmg: safeNum(st.utility_dmg, 0),
    adr_avg: st.adr != null ? safeNum(st.adr, 0) : null,
    rating2_avg: st.rating2 != null ? safeNum(st.rating2, 0) : null,
    breakdown: mapRow?.breakdown || null,
  };
}

/* ================== DRAFT PAGE ================== */
export default function DraftPage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [matches, setMatches] = useState([]);
  // Derived lists: keep "Upcoming" truly upcoming; treat past/finished as finished fallback.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const isFinishedByFlag = (m) => {
    const s = String(m?.status || m?.state || "").toLowerCase();
    return Boolean(
      m?.finished === true ||
        m?.is_finished === true ||
        m?.isFinished === true ||
        m?.completed === true ||
        m?.is_completed === true ||
        s === "finished" ||
        s === "completed" ||
        s === "ended"
    );
  };
  const upcomingMatches = (matches || []).filter((m) => {
    const t = new Date(m?.start_time || m?.startTime || 0).getTime();
    if (!Number.isFinite(t)) return false;
    return t > nowTs && !isFinishedByFlag(m);
  });
  const implicitFinishedMatches = (matches || []).filter((m) => {
    const t = new Date(m?.start_time || m?.startTime || 0).getTime();
    if (!Number.isFinite(t)) return false;
    return t <= nowTs || isFinishedByFlag(m);
  });

  const normTeam = (s) => String(s || "").trim().toLowerCase();

  const extractMatchPlayerIdSet = (m) => {
    const ids = new Set();
    const pushFromArray = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const x of arr) {
        if (x == null) continue;
        if (typeof x === "number") {
          if (Number.isFinite(x)) ids.add(Number(x));
          continue;
        }
        if (typeof x === "string") {
          const n = Number(x);
          if (Number.isFinite(n)) ids.add(n);
          continue;
        }
        if (typeof x === "object") {
          const n = Number(
            x.player_id || x.playerId || x.id || x.pk || x.player || x.user_id
          );
          if (Number.isFinite(n) && n) ids.add(n);
        }
      }
    };

    pushFromArray(m?.player_ids);
    pushFromArray(m?.playerIds);
    pushFromArray(m?.participants);
    pushFromArray(m?.players);
    pushFromArray(m?.team1_players);
    pushFromArray(m?.team2_players);
    pushFromArray(m?.team1Players);
    pushFromArray(m?.team2Players);
    pushFromArray(m?.lineup);
    pushFromArray(m?.lineups);
    pushFromArray(m?.team1?.players);
    pushFromArray(m?.team2?.players);

    return ids;
  };

  const rosterPlayersInMatchByTeams = (matchLike) => {
    const t1 = normTeam(matchLike?.team1Name || matchLike?.team1_name);
    const t2 = normTeam(matchLike?.team2Name || matchLike?.team2_name);
    if (!t1 && !t2) return [];

    const byTeam = (rosterPlayersForFinishedFallback || []).filter((p) => {
      const pt = normTeam(p?.teamName);
      if (!pt) return false;
      return (t1 && pt === t1) || (t2 && pt === t2);
    });

    const idSet = extractMatchPlayerIdSet(matchLike);
    if (idSet.size) {
      return byTeam.filter((p) => idSet.has(Number(p.playerId)));
    }
    return byTeam;
  };

  /* ===== FINISHED MATCHES OF ROSTER PLAYERS ===== */
  const [finishedRosterMatches, setFinishedRosterMatches] = useState([]);
  const [finishedRosterLoading, setFinishedRosterLoading] = useState(false);
  const [finishedRosterErr, setFinishedRosterErr] = useState("");

  const [finishedMatchPick, setFinishedMatchPick] = useState(null); // { matchId, team1Name, team2Name, startTime, bo, players }

  const [finishedPick, setFinishedPick] = useState(null); // { match, player }
  const [fmLoading, setFmLoading] = useState(false);
  const [fmErr, setFmErr] = useState("");
  const [fmData, setFmData] = useState(null);

  // NEW: selected map in finished player modal
  const [fmMapPick, setFmMapPick] = useState("ALL"); // "ALL" or map_id string/number

  const [selected, setSelected] = useState(null);
  const [statLoading, setStatLoading] = useState(false);
  const [statErr, setStatErr] = useState("");
  const [stat, setStat] = useState(null);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);

  function restoreScroll(y) {
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
    });
  }

  async function load(opts = {}) {
    const preserveScroll = opts?.preserveScroll === true;
    const y = preserveScroll ? window.scrollY : 0;

    setErr("");
    setLoading(true);
    try {
      const s = await apiGet(`/draft/${leagueId}/state`);
      setState(s);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
      if (preserveScroll) restoreScroll(y);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      navigate("/");
      return;
    }
    load();
  }, [leagueId]);

  /* ===== CONDITIONS ===== */
  const started = state?.started === true;
  const finished = state?.locked === true;

  const rosterLocked = state?.roster_locked === true;
  const canUnlock = state?.can_unlock === true;

  const roster = state?.roster || [];
  const rosterIdsKey = useMemo(
    () => (roster || []).map((r) => r?.player_id).filter(Boolean).join(","),
    [roster]
  );

  const rosterPlayersForFinishedFallback = useMemo(() => {
    return (roster || []).filter(Boolean).map((r) => ({
      playerId: Number(r.player_id),
      playerName: r.player_name || r.nickname || "Unknown",
      teamName: r.team_name || r.team || r.teamName || "",
      playerFlagCode:
        r.player_nationality_code ||
        r.nationality_code ||
        r.player_flag_code ||
        r.country_code ||
        "",
      raw: r,
    }));
  }, [roster]);

  const finishedMatchesDisplay = useMemo(() => {
    if (finishedRosterMatches?.length) return finishedRosterMatches;

    const mapped = (implicitFinishedMatches || [])
      .map((mm) => {
        const matchLike = {
          team1Name: mm.team1_name || mm.team1 || mm.team_1_name || "Team 1",
          team2Name: mm.team2_name || mm.team2 || mm.team_2_name || "Team 2",
          startTime: mm.start_time || mm.startTime || null,
        };
        const players = rosterPlayersInMatchByTeams(mm);
        return {
          key: `m_${mm.id}`,
          matchId: mm.id,
          team1Name: matchLike.team1Name,
          team2Name: matchLike.team2Name,
          startTime: matchLike.startTime,
          bo: mm.bo || mm.best_of || null,
          players,
          raw: mm,
        };
      })
      .filter((x) => x.players?.length);

    mapped.sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
    return mapped;
  }, [finishedRosterMatches, implicitFinishedMatches, rosterPlayersForFinishedFallback]);

  const budgetLeft = state?.fantasy_team?.budget_left ?? 0;
  const maxSlots = state?.limits?.slots ?? 5;
  const maxPerTeam = state?.limits?.max_per_team ?? 2;
  const teamCounts = state?.team_counts || {};
  const tournamentId =
    state?.tournament?.id || state?.league?.tournament || state?.tournament_id;

  const rosterCount = roster.length;
  const canBuyMore = !started && !finished && rosterCount < maxSlots;

  const canLockRoster = !finished && !rosterLocked && rosterCount === maxSlots;

  const totalFantasyPoints = roster.reduce(
    (sum, r) => sum + (r?.fantasy_pts || 0),
    0
  );

  /* ===== used roles (unique constraint) ===== */
  const usedRolesSetForModal = useMemo(() => {
    const s = new Set();
    for (const r of roster) {
      if (!r) continue;
      if (!roleTarget) {
        if (r.role_badge) s.add(r.role_badge);
      } else {
        if (r.player_id !== roleTarget.player_id && r.role_badge) {
          s.add(r.role_badge);
        }
      }
    }
    return s;
  }, [roster, roleTarget]);

  /* ===== LOAD MATCHES IF ACTIVE ===== */
  useEffect(() => {
    async function loadMatches() {
      if (!tournamentId || finished) return;
      try {
        const ms = await apiGet(`/matches`, false);
        const only = (ms || []).filter(
          (m) => Number(m.tournament) === Number(tournamentId)
        );
        only.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        setMatches(only.slice(0, 50));
      } catch {}
    }

    loadMatches();

    // Finished roster matches are derived from /matches (see finishedMatchesDisplay fallback).
    // Keep API-driven list empty to avoid 404 spam.
    setFinishedRosterMatches([]);
    setFinishedRosterLoading(false);
    setFinishedRosterErr("");

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, tournamentId, rosterIdsKey, finished]);

  const market = useMemo(() => (state?.market || []).slice(), [state]);

  const marketByTeam = useMemo(() => {
    const list = market || [];
    const groups = [];
    let currentKey = null;
    let currentGroup = null;

    for (const p of list) {
      const key = p.team_id ?? p.team_name ?? "unknown";
      if (key !== currentKey) {
        currentKey = key;
        currentGroup = {
          key,
          teamName: p.team_name || "Unknown team",
          worldRank:
            typeof p.team_world_rank === "number" ? p.team_world_rank : null,
          teamRegionCode:
            p.team_region_code ||
            p.region_code ||
            p.team_flag_code ||
            p.team_country_code ||
            "",
          players: [],
        };
        groups.push(currentGroup);
      }
      if (currentGroup) {
        currentGroup.players.push(p);
      }
    }

    return groups;
  }, [market]);

  /* ===== BUY LOGIC ===== */
  function canBuy(p) {
    if (started || finished) return false;
    if (!canBuyMore) return false;
    if ((p?.price ?? 0) > budgetLeft) return false;
    const countTeam = teamCounts?.[String(p.team_id)] ?? 0;
    if (countTeam >= maxPerTeam) return false;
    if (roster.some((r) => r.player_id === p.player_id)) return false;
    return true;
  }

  async function doBuy(p) {
    const y = window.scrollY;
    try {
      await apiPost("/draft/buy", {
        league_id: Number(leagueId),
        player_id: p.player_id,
      });
      await load({ preserveScroll: true });
      restoreScroll(y);
    } catch (e) {
      alert(String(e.message || e));
      restoreScroll(y);
    }
  }

  async function doSell(p) {
    if (finished || started) return;
    const y = window.scrollY;
    try {
      await apiPost("/draft/sell", {
        league_id: Number(leagueId),
        player_id: p.player_id,
      });
      await load({ preserveScroll: true });
      restoreScroll(y);
    } catch (e) {
      alert(String(e.message || e));
      restoreScroll(y);
    }
  }

  async function doSetRole(playerId, roleBadge) {
    if (finished || started) return;
    const y = window.scrollY;
    try {
      await apiPost("/draft/set-role", {
        league_id: Number(leagueId),
        player_id: Number(playerId),
        role_badge: roleBadge,
      });
      await load({ preserveScroll: true });
      restoreScroll(y);
    } catch (e) {
      alert(String(e.message || e));
      restoreScroll(y);
    }
  }

  function openRolePicker(rosterItem) {
    if (finished || started) return;
    setRoleTarget(rosterItem);
    setRoleModalOpen(true);
  }

  async function applyRoleFromModal(roleCode) {
    if (!roleTarget) return;

    if (roleCode && usedRolesSetForModal.has(roleCode)) {
      alert("This role is already used by another player.");
      return;
    }

    await doSetRole(roleTarget.player_id, roleCode);
    setRoleModalOpen(false);
    setRoleTarget(null);
  }

  /* ===== LOCK/UNLOCK ROSTER ===== */
  async function doLockRoster() {
    if (!canLockRoster) return;
    const ok = window.confirm(
      `Lock roster? You must have exactly ${maxSlots} players. After locking you can’t buy/sell anymore.`
    );
    if (!ok) return;

    const y = window.scrollY;
    try {
      await apiPost("/draft/lock", { league_id: Number(leagueId) });
      await load({ preserveScroll: true });
      restoreScroll(y);
    } catch (e) {
      alert(String(e.message || e));
      restoreScroll(y);
    }
  }

  async function doUnlockRoster() {
    if (!rosterLocked || !canUnlock) return;
    const ok = window.confirm(
      "Unlock roster? You will be able to buy/sell again (only if tournament hasn’t started)."
    );
    if (!ok) return;

    const y = window.scrollY;
    try {
      await apiPost("/draft/unlock", { league_id: Number(leagueId) });
      await load({ preserveScroll: true });
      restoreScroll(y);
    } catch (e) {
      alert(String(e.message || e));
      restoreScroll(y);
    }
  }

  const actionDisabled = finished
    ? true
    : rosterLocked
    ? !canUnlock
    : !canLockRoster;

  const actionLabel = rosterLocked ? "Unlock" : "Lock";
  const actionOnClick = rosterLocked ? doUnlockRoster : doLockRoster;

  /* ===== MODAL STATS ===== */
  async function openPlayerModal(p) {
    if (finished) return;
    setSelected(p);
    setStat(null);
    setStatErr("");
    setStatLoading(true);
    try {
      const qs = tournamentId ? `?tournament=${tournamentId}` : "";
      const data = await apiGet(`/player-summary/${p.player_id}${qs}`, false);
      setStat(data);
    } catch (e) {
      setStatErr(String(e.message || e));
    } finally {
      setStatLoading(false);
    }
  }

  /* ===== FINISHED MATCH PLAYER MODAL ===== */
  async function openFinishedMatchPlayer(matchItem, playerItem) {
    if (!matchItem || !playerItem) return;

    setFinishedPick({ match: matchItem, player: playerItem });
    setFmData(null);
    setFmErr("");
    setFmLoading(true);
    setFmMapPick("ALL");

    try {
      const matchId =
        matchItem.matchId || matchItem.match_id || matchItem.id || matchItem?.match?.id;
      const playerId = playerItem.playerId || playerItem.player_id;

      const qs = new URLSearchParams();
      qs.set("league_id", String(leagueId));
      if (tournamentId) qs.set("tournament", String(tournamentId));
      qs.set("match_id", String(matchId));
      qs.set("player_id", String(playerId));

      let data = null;

      try {
        data = await apiGet(`/draft/player-match-breakdown?${qs.toString()}`, true);
      } catch (e1) {
        data = await apiGet(`/draft/player-match-points?${qs.toString()}`, true);
      }

      setFmData(data);
    } catch (e) {
      setFmErr(String(e.message || e));
    } finally {
      setFmLoading(false);
    }
  }

  // NEW: flags for market modal
  const selectedTeamFlagCode =
    selected?.team_region_code ||
    selected?.team_flag_code ||
    selected?.region_code ||
    selected?.team_country_code ||
    "";
  const selectedPlayerFlagCode =
    selected?.player_nationality_code ||
    selected?.nationality_code ||
    selected?.player_flag_code ||
    selected?.country_code ||
    "";

  // NEW: finished match map options + computed view
  const fmMaps = useMemo(() => {
    const maps = Array.isArray(fmData?.maps) ? fmData.maps : [];
    return maps.map((m) => ({
      map_id: m?.map_id,
      map_name: m?.map_name || `Map ${m?.map_id}`,
      points: safeNum(m?.points, 0),
      played_rounds: m?.played_rounds,
      winner_id: m?.winner_id,
      breakdown: m?.breakdown || null,
      stats: m?.stats || null,
      raw: m,
    }));
  }, [fmData]);

  const fmComputed = useMemo(() => {
    // If breakdown endpoint not available, keep old aggregated (player-match-points) behavior.
    if (!fmData) return null;

    // If maps exist, compute by map or all maps.
    if (Array.isArray(fmData?.maps) && fmData.maps.length) {
      if (fmMapPick === "ALL") return computeAllMapsView(fmData);
      const mid = Number(fmMapPick);
      const row = fmMaps.find((x) => Number(x.map_id) === mid);
      if (!row) return computeAllMapsView(fmData);
      return computeSingleMapView(row);
    }

    // fallback: legacy endpoint already returns aggregated fields
    return {
      total_points: safeNum(
        pickFirst(fmData, [
          "total_points",
          "totalPoints",
          "fantasy_points",
          "fantasyPoints",
          "fantasy_pts",
          "points",
          "score",
        ]),
        0
      ),
      kills: safeNum(pickFirst(fmData, ["kills", "k"]), 0),
      deaths: safeNum(pickFirst(fmData, ["deaths", "d"]), 0),
      assists: safeNum(pickFirst(fmData, ["assists", "a"]), 0),
      hs: safeNum(pickFirst(fmData, ["hs", "headshots"]), 0),
      opening_kills: safeNum(
        pickFirst(fmData, ["opening_kills", "openingKills"]),
        0
      ),
      opening_deaths: safeNum(
        pickFirst(fmData, ["opening_deaths", "openingDeaths"]),
        0
      ),
      flash_assists: safeNum(
        pickFirst(fmData, ["flash_assists", "flashAssists"]),
        0
      ),
      utility_dmg: safeNum(
        pickFirst(fmData, [
          "utility_dmg_sum",
          "utilityDmgSum",
          "utility_dmg",
          "utilityDmg",
        ]),
        0
      ),
      mk_3k: safeNum(pickFirst(fmData, ["mk_3k", "mk3k"]), 0),
      mk_4k: safeNum(pickFirst(fmData, ["mk_4k", "mk4k"]), 0),
      mk_5k: safeNum(pickFirst(fmData, ["mk_5k", "mk5k"]), 0),
      cl_1v2: safeNum(pickFirst(fmData, ["cl_1v2", "cl1v2"]), 0),
      cl_1v3: safeNum(pickFirst(fmData, ["cl_1v3", "cl1v3"]), 0),
      cl_1v4: safeNum(pickFirst(fmData, ["cl_1v4", "cl1v4"]), 0),
      cl_1v5: safeNum(pickFirst(fmData, ["cl_1v5", "cl1v5"]), 0),
      adr_avg: (() => {
        const v = pickFirst(fmData, ["adr_avg", "adrAvg", "adr"]);
        return v == null ? null : safeNum(v, 0);
      })(),
      rating2_avg: (() => {
        const v = pickFirst(fmData, ["rating2_avg", "rating2Avg", "rating2"]);
        return v == null ? null : safeNum(v, 0);
      })(),
      breakdown:
        fmData.points_breakdown ||
        fmData.breakdown ||
        fmData.explain ||
        fmData.point_breakdown ||
        null,
    };
  }, [fmData, fmMapPick, fmMaps]);

  const fmBreakdownRows = useMemo(() => {
    if (!fmComputed) return [];
    const raw =
      fmComputed.breakdown ||
      fmData?.points_breakdown ||
      fmData?.breakdown ||
      fmData?.explain ||
      fmData?.point_breakdown ||
      finishedPick?.player?.breakdown ||
      null;
    return normalizeBreakdown(raw);
  }, [fmComputed, fmData, finishedPick]);

  return (
    <div className="min-h-screen bg-black text-white p-8 text-base">
      <header className="sticky top-0 z-40 -mx-8 px-8 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="py-3 flex items-center justify-between">
          <Link to="/" className="text-base text-zinc-300 hover:text-white">
            ← Back
          </Link>
          <div className="flex items-center gap-3">
            <Pill>League #{leagueId}</Pill>
            {tournamentId && <Pill>Tournament #{tournamentId}</Pill>}
            {finished && <Pill>Finished</Pill>}
          </div>
        </div>
      </header>

      <main className="py-6">
        <h1 className="text-4xl font-bold mt-4">Draft</h1>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Pill>Budget left: {budgetLeft.toLocaleString()}</Pill>
          <Pill>
            Slots: {rosterCount}/{maxSlots}
          </Pill>
          <Pill>Max per team: {maxPerTeam}</Pill>
          <Pill>Total fantasy: {totalFantasyPoints.toLocaleString()}</Pill>

          {started && !finished && <Pill>Locked</Pill>}
        </div>

        {!finished && (
          <section className="mt-5">
            <h2 className="text-base font-semibold text-zinc-200 mb-2">
              Upcoming matches
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {upcomingMatches.map((m) => (
                <div
                  key={m.id}
                  className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"
                >
                  <div className="font-medium">
                    {m.team1_name} vs {m.team2_name}
                  </div>
                  <div className="text-xs text-zinc-300">
                    {new Date(m.start_time).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · BO{m.bo}
                  </div>
                </div>
              ))}
              {!upcomingMatches.length && (
                <div className="text-sm text-zinc-400">No matches yet.</div>
              )}
            </div>
          </section>
        )}

        {!finished && (
          <section className="mt-5">
            <h2 className="text-base font-semibold text-zinc-200 mb-2">
              Finished matches of your players
            </h2>

            {finishedRosterLoading && (
              <div className="text-sm text-zinc-400">Loading…</div>
            )}

            {finishedRosterErr && (
              <div className="text-sm text-red-400">{finishedRosterErr}</div>
            )}

            {!finishedRosterLoading &&
              !finishedRosterErr &&
              !finishedMatchesDisplay.length && (
                <div className="text-sm text-zinc-400">
                  No finished matches for your roster yet.
                </div>
              )}

            <div className="flex gap-2 overflow-x-auto pb-2 mt-2">
              {finishedMatchesDisplay.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setFinishedMatchPick(m)}
                  className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-left hover:bg-white/10 transition"
                >
                  <div className="font-medium">
                    {m.team1Name} vs {m.team2Name}
                  </div>
                  <div className="text-xs text-zinc-300">
                    {m.startTime
                      ? new Date(m.startTime).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                    {m.bo ? ` · BO${m.bo}` : ""}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-base font-semibold text-zinc-200 mb-3">
            Your roster
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: maxSlots }).map((_, i) => {
              const r = roster[i];

              const teamFlagCode =
                r?.team_region_code ||
                r?.team_flag_code ||
                r?.region_code ||
                r?.team_country_code ||
                "";
              const playerFlagCode =
                r?.player_nationality_code ||
                r?.nationality_code ||
                r?.player_flag_code ||
                r?.country_code ||
                "";

              return (
                <div
                  key={i}
                  className="rounded-2xl border border-white/10 p-4 bg-white/5 h-full"
                >
                  {!r ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                      <span className="text-sm">Empty slot #{i + 1}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <FlagImg
                          code={teamFlagCode}
                          className="h-4 w-6 rounded-[3px] border border-white/10"
                        />
                        <span>{r.team_name}</span>
                      </div>

                      <div className="flex items-center gap-2 text-lg font-semibold">
                        <FlagImg
                          code={playerFlagCode}
                          className="h-4 w-6 rounded-[3px] border border-white/10"
                        />
                        <span>{r.player_name}</span>
                      </div>

                      <div className="mt-1 text-sm text-zinc-400">
                        {typeof r.price !== "undefined" && (
                          <div>Price: {Number(r.price).toLocaleString()}</div>
                        )}
                        <div>
                          Fantasy points:{" "}
                          {r.fantasy_pts != null
                            ? Number(r.fantasy_pts).toLocaleString()
                            : "—"}
                          {r.fppg != null && (
                            <span className="ml-2 text-zinc-500">
                              (FPPG {Number(r.fppg).toLocaleString()})
                            </span>
                          )}
                        </div>
                      </div>

                      {!finished && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs text-zinc-400">Role</div>
                            <Button
                              variant="ghost"
                              className="px-2 py-1 text-xs rounded-lg"
                              onClick={() => openRolePicker(r)}
                              disabled={started}
                            >
                              Change
                            </Button>
                          </div>
                          <div className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm">
                            {roleLabel(r.role_badge || "")}
                          </div>
                        </div>
                      )}

                      {!finished && (
                        <div className="mt-3">
                          <Button
                            variant="ghost"
                            onClick={() => doSell(r)}
                            disabled={started}
                          >
                            Sell{" "}
                            {typeof r.price !== "undefined"
                              ? `(${Number(r.price).toLocaleString()})`
                              : ""}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {!finished && (
            <div className="mt-6 flex justify-end">
              <Button
                onClick={actionOnClick}
                disabled={actionDisabled}
                variant={rosterLocked ? "danger" : "primary"}
                className="px-8 py-3 text-lg rounded-2xl shadow-md"
              >
                {actionLabel}
              </Button>
            </div>
          )}
        </section>

        {!finished && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-zinc-200 mb-3">
              Market
            </h2>

            {!loading && !err && (
              <div className="space-y-6 mt-2">
                {marketByTeam.map((group) => (
                  <div key={group.key}>
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <FlagImg
                          code={group.teamRegionCode}
                          className="h-4 w-6 rounded-[3px] border border-white/10"
                        />
                        <span>{group.teamName}</span>
                        {group.worldRank != null && (
                          <span className="ml-2 text-xs text-zinc-400">
                            World rank #{group.worldRank}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {group.players.map((p) => {
                        const owned = roster.some(
                          (r) => r.player_id === p.player_id
                        );
                        const disabled = !canBuy(p);

                        const playerFlagCode =
                          p?.player_nationality_code ||
                          p?.nationality_code ||
                          p?.player_flag_code ||
                          p?.country_code ||
                          "";

                        return (
                          <div
                            key={p.player_id}
                            className={`rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10 ${
                              !disabled ? "cursor-pointer" : "opacity-90"
                            }`}
                            onClick={() => openPlayerModal(p)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <FlagImg
                                  code={playerFlagCode}
                                  className="h-4 w-6 rounded-[3px] border border-white/10 mt-1"
                                />
                                <div className="text-lg font-semibold">
                                  {p.player_name}
                                </div>
                              </div>

                              {owned && <Pill>Owned</Pill>}
                            </div>

                            <div className="mt-3">
                              {owned ? (
                                <Button
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    doSell(p);
                                  }}
                                  disabled={started}
                                  className="w-full"
                                >
                                  Sell ({Number(p.price).toLocaleString()})
                                </Button>
                              ) : (
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    doBuy(p);
                                  }}
                                  disabled={disabled}
                                  className="w-full"
                                >
                                  Buy for {Number(p.price).toLocaleString()}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {!finished && (
        <Modal
          open={!!finishedMatchPick}
          onClose={() => setFinishedMatchPick(null)}
          title={
            finishedMatchPick
              ? `${finishedMatchPick.team1Name} vs ${finishedMatchPick.team2Name}`
              : " "
          }
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setFinishedMatchPick(null)}>
                Close
              </Button>
            </div>
          }
          containerClassName="max-w-4xl"
          bodyClassName="max-h-[75vh] overflow-y-auto pr-1"
        >
          {finishedMatchPick ? (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-zinc-400">
                  {finishedMatchPick.startTime
                    ? new Date(finishedMatchPick.startTime).toLocaleString()
                    : ""}
                  {finishedMatchPick.bo ? ` · BO${finishedMatchPick.bo}` : ""}
                </div>
                <div className="text-sm text-zinc-300 mt-2">
                  Your players in this match
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {(finishedMatchPick.players || []).map((pl) => (
                  <button
                    key={pl.playerId}
                    type="button"
                    onClick={() => {
                      const m = finishedMatchPick;
                      setFinishedMatchPick(null);
                      openFinishedMatchPlayer(m, pl);
                    }}
                    className="rounded-xl border border-white/10 bg-black/40 hover:bg-white/10 px-3 py-2 text-sm transition"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FlagImg
                        code={pl.playerFlagCode}
                        className="h-4 w-6 rounded-[3px] border border-white/10"
                      />
                      <span className="font-medium">{pl.playerName}</span>
                      {pl.points != null && (
                        <span className="text-zinc-300">
                          {Number(pl.points).toLocaleString()} pts
                        </span>
                      )}
                    </span>
                  </button>
                ))}
                {!finishedMatchPick.players?.length && (
                  <div className="text-sm text-zinc-400">
                    No roster players in this match.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </Modal>
      )}

      {!finished && (
        <Modal
          open={!!finishedPick}
          onClose={() => {
            setFinishedPick(null);
            setFmData(null);
            setFmErr("");
            setFmMapPick("ALL");
          }}
          title={
            finishedPick ? (
              <span className="inline-flex items-center gap-2">
                <FlagImg
                  code={finishedPick?.player?.playerFlagCode}
                  className="h-4 w-6 rounded-[3px] border border-white/10"
                />
                <span className="font-semibold">
                  {finishedPick?.player?.playerName}
                </span>
              </span>
            ) : (
              " "
            )
          }
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setFinishedPick(null);
                  setFmData(null);
                  setFmErr("");
                  setFmMapPick("ALL");
                }}
              >
                Close
              </Button>
            </div>
          }
          containerClassName="max-w-6xl"
          bodyClassName="max-h-[85vh] overflow-y-auto pr-1"
        >
          {!finishedPick ? null : (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-zinc-300">
                  {finishedPick?.match?.team1Name} vs {finishedPick?.match?.team2Name}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {finishedPick?.match?.startTime
                    ? new Date(finishedPick.match.startTime).toLocaleString()
                    : ""}
                  {finishedPick?.match?.bo ? ` · BO${finishedPick.match.bo}` : ""}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="font-semibold">Match stats & points</h4>
                  <div className="flex items-center gap-2">
                    {fmLoading && (
                      <span className="text-xs text-zinc-400">Loading…</span>
                    )}
                    {!!fmMaps.length && (
                      <select
                        className="text-sm bg-black/60 border border-white/10 rounded-xl px-3 py-2"
                        value={String(fmMapPick)}
                        onChange={(e) => setFmMapPick(e.target.value)}
                      >
                        <option value="ALL">All maps</option>
                        {fmMaps.map((m) => (
                          <option key={String(m.map_id)} value={String(m.map_id)}>
                            {m.map_name} ({safeNum(m.points, 0).toFixed(2)} pts)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {fmErr && <p className="text-sm text-red-400">{fmErr}</p>}

                {!fmLoading && !fmData && !fmErr && (
                  <p className="text-sm text-zinc-300">No data.</p>
                )}

                {!fmLoading && fmComputed && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-8 gap-3 text-sm">
                      <InfoTile
                        label="Total points"
                        value={safeNum(fmComputed.total_points, 0).toFixed(2)}
                      />
                      <InfoTile label="Kills" value={String(fmComputed.kills)} />
                      <InfoTile label="Deaths" value={String(fmComputed.deaths)} />
                      <InfoTile label="Assists" value={String(fmComputed.assists)} />
                      <InfoTile label="HS" value={String(fmComputed.hs)} />
                      <InfoTile
                        label="ADR"
                        value={
                          fmComputed.adr_avg != null
                            ? Number(fmComputed.adr_avg).toFixed(1)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Rating 2.0"
                        value={
                          fmComputed.rating2_avg != null
                            ? Number(fmComputed.rating2_avg).toFixed(2)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Opening K"
                        value={String(fmComputed.opening_kills)}
                      />
                      <InfoTile
                        label="Opening D"
                        value={String(fmComputed.opening_deaths)}
                      />
                      <InfoTile
                        label="Flash A"
                        value={String(fmComputed.flash_assists)}
                      />
                      <InfoTile
                        label="Util dmg"
                        value={String(Math.round(safeNum(fmComputed.utility_dmg, 0)))}
                      />
                      <InfoTile label="3K" value={String(fmComputed.mk_3k)} />
                      <InfoTile label="4K" value={String(fmComputed.mk_4k)} />
                      <InfoTile label="5K" value={String(fmComputed.mk_5k)} />
                      <InfoTile label="1v2" value={String(fmComputed.cl_1v2)} />
                      <InfoTile label="1v3" value={String(fmComputed.cl_1v3)} />
                      <InfoTile label="1v4" value={String(fmComputed.cl_1v4)} />
                      <InfoTile label="1v5" value={String(fmComputed.cl_1v5)} />
                    </div>

                  </>
                )}
              </div>
            </>
          )}
        </Modal>
      )}

      {!finished && (
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={" "}
          footer={
            selected && (
              <div className="flex items-center justify-end gap-3">
                <Button variant="ghost" onClick={() => setSelected(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    doBuy(selected);
                  }}
                  disabled={!selected || !canBuy(selected)}
                >
                  Buy for {selected ? Number(selected.price).toLocaleString() : ""}
                </Button>
              </div>
            )
          }
        >
          {!selected ? null : (
            <>
              <div className="grid sm:grid-cols-3 gap-4">
                <InfoTile
                  label="Team"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <FlagImg
                        code={selectedTeamFlagCode}
                        className="h-4 w-6 rounded-[3px] border border-white/10"
                      />
                      <span>{selected.team_name}</span>
                    </span>
                  }
                />
                <InfoTile
                  label="Player"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <FlagImg
                        code={selectedPlayerFlagCode}
                        className="h-4 w-6 rounded-[3px] border border-white/10"
                      />
                      <span>{selected.player_name}</span>
                    </span>
                  }
                />
                <InfoTile
                  label="Price"
                  value={Number(selected.price).toLocaleString()}
                  sub={`Budget left: ${budgetLeft.toLocaleString()}`}
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Player stats (aggregated)</h4>
                  {statLoading && (
                    <span className="text-xs text-zinc-400">Loading…</span>
                  )}
                </div>
                {statErr && <p className="text-sm text-red-400">{statErr}</p>}
                {!statLoading && !stat && (
                  <p className="text-sm text-zinc-300">No data.</p>
                )}

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">HLTV stats (last 3 months)</h4>
                    {statLoading && (
                      <span className="text-xs text-zinc-400">Loading…</span>
                    )}
                  </div>

                  {statErr && <p className="text-sm text-red-400">{statErr}</p>}

                  {!statLoading && !stat && !statErr && (
                    <p className="text-sm text-zinc-300">No data.</p>
                  )}

                  {!statLoading && stat && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <InfoTile
                        label="Rating 3.0"
                        value={
                          stat.rating2 != null
                            ? Number(stat.rating2).toFixed(2)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Kills / round"
                        value={
                          stat.kills_per_round != null
                            ? Number(stat.kills_per_round).toFixed(2)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="ADR"
                        value={
                          stat.adr != null ? Number(stat.adr).toFixed(1) : "—"
                        }
                      />
                      <InfoTile
                        label="Opening kills / round"
                        value={
                          stat.opening_kills_per_round != null
                            ? Number(stat.opening_kills_per_round).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Opening deaths / round"
                        value={
                          stat.opening_deaths_per_round != null
                            ? Number(stat.opening_deaths_per_round).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Win% after opening kill"
                        value={
                          stat.win_after_opening != null
                            ? `${Number(stat.win_after_opening).toFixed(1)}%`
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Multi-kill rounds"
                        value={
                          stat.multikill_rounds_pct != null
                            ? `${Number(stat.multikill_rounds_pct).toFixed(1)}%`
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Clutch points / round"
                        value={
                          stat.clutch_points_per_round != null
                            ? Number(stat.clutch_points_per_round).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Sniper kills / round"
                        value={
                          stat.sniper_kills_per_round != null
                            ? Number(stat.sniper_kills_per_round).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Utility dmg / round"
                        value={
                          stat.utility_damage_per_round != null
                            ? Number(stat.utility_damage_per_round).toFixed(1)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Flash assists / round"
                        value={
                          stat.flash_assists_per_round != null
                            ? Number(stat.flash_assists_per_round).toFixed(3)
                            : "—"
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

      <RolesModal
        open={roleModalOpen}
        onClose={() => {
          setRoleModalOpen(false);
          setRoleTarget(null);
        }}
        currentRole={roleTarget?.role_badge || ""}
        onPickRole={applyRoleFromModal}
        disabled={finished || started}
        playerName={roleTarget?.player_name}
        teamName={roleTarget?.team_name}
        usedRolesSet={usedRolesSetForModal}
      />
    </div>
  );
}
