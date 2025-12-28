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
  return String(raw).trim().toLowerCase(); // 👈 lowercase под твои файлы
}

function FlagImg({ code, className = "" }) {
  const norm = normalizeFlagCode(code);
  const [failed, setFailed] = useState(false);

  if (!norm || failed) return null;

  return (
    <img
      src={`/flags/${norm}.svg`} // 👈 ru.svg, eu.svg и т.д.
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

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-zinc-950 border border-zinc-800 p-6 mx-4">
        <div className="flex items-center justify-between mb-4">
          {/* title теперь может быть ReactNode, не только string */}
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="space-y-4">{children}</div>
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

/* ================== DRAFT PAGE ================== */
export default function DraftPage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [matches, setMatches] = useState([]);

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
        setMatches(only.slice(0, 10));
      } catch {}
    }
    loadMatches();
  }, [tournamentId, finished]);

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
          // NEW: team region code if your API returns it
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

  // NEW: флаги для модалки (best-effort, ничего не ломает)
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
              {matches.map((m) => (
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
              {!matches.length && (
                <div className="text-sm text-zinc-400">No matches yet.</div>
              )}
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

              // NEW: best-effort extraction (supports several possible API keys)
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

                        // NEW: best-effort player flag code from market item
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
          open={!!selected}
          onClose={() => setSelected(null)}
          title={" "
          }
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
                  Buy for{" "}
                  {selected ? Number(selected.price).toLocaleString() : ""}
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
                    <h4 className="font-semibold">
                      HLTV stats (last 3 months)
                    </h4>
                    {statLoading && (
                      <span className="text-xs text-zinc-400">Loading…</span>
                    )}
                  </div>

                  {statErr && (
                    <p className="text-sm text-red-400">{statErr}</p>
                  )}

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
