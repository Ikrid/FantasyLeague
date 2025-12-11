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

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const s = await apiGet(`/draft/${leagueId}/state`);
      setState(s);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
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
  const finished = state?.locked === true; // when tournament ended

  const roster = state?.roster || [];
  const budgetLeft = state?.fantasy_team?.budget_left ?? 0;
  const maxSlots = state?.limits?.slots ?? 5;
  const maxPerTeam = state?.limits?.max_per_team ?? 2;
  const teamCounts = state?.team_counts || {};
  const tournamentId =
    state?.tournament?.id || state?.league?.tournament || state?.tournament_id;

  const rosterCount = roster.length;
  const canBuyMore = !started && !finished && rosterCount < maxSlots;

  const totalFantasyPoints = roster.reduce(
    (sum, r) => sum + (r?.fantasy_pts || 0),
    0
  );

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

  // === Группировка игроков маркета по командам ===
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
    try {
      await apiPost("/draft/buy", {
        league_id: Number(leagueId),
        player_id: p.player_id,
      });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  /* ===== SELL logic (hidden if finished) ===== */
  async function doSell(p) {
    if (finished) return; // disabled
    try {
      await apiPost("/draft/sell", {
        league_id: Number(leagueId),
        player_id: p.player_id,
      });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  /* ===== MODAL STATS ===== */
  async function openPlayerModal(p) {
    if (finished) return; // modal disabled
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

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-sm text-zinc-300 hover:text-white">
            ← Back
          </Link>
          <div className="flex items-center gap-3">
            <Pill>League #{leagueId}</Pill>
            {tournamentId && <Pill>Tournament #{tournamentId}</Pill>}
            {finished && <Pill>Finished</Pill>}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold">Draft</h1>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Pill>Budget left: {budgetLeft.toLocaleString()}</Pill>
          <Pill>
            Slots: {rosterCount}/{maxSlots}
          </Pill>
          <Pill>Max per team: {maxPerTeam}</Pill>
          <Pill>Total fantasy: {totalFantasyPoints.toLocaleString()}</Pill>
          {started && !finished && <Pill>Locked</Pill>}
        </div>

        {/* === Upcoming Matches (only active tournament) === */}
        {!finished && (
          <section className="mt-5">
            <h2 className="text-lg font-semibold mb-2">Upcoming matches</h2>
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

        {/* === ROSTER ALWAYS VISIBLE === */}
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Your roster</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: maxSlots }).map((_, i) => {
              const r = roster[i];
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-white/10 p-4 bg:white/5 bg-white/5 h-full"
                >
                  {!r ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                      <span className="text-sm">Empty slot #{i + 1}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-zinc-300">{r.team_name}</div>
                      <div className="text-lg font-semibold">
                        {r.player_name}
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

                      {/* SELL hidden if finished */}
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
        </section>

        {/* === MARKET HIDDEN WHEN FINISHED === */}
        {!finished && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Market</h2>

            {!loading && !err && (
              <div className="space-y-6 mt-2">
                {marketByTeam.map((group) => (
                  <div key={group.key}>
                    {/* Заголовок команды + её место в рейтинге */}
                    <div className="flex items-baseline justify-between mb-2">
                      <div className="text-sm font-semibold">
                        {group.teamName}
                        {group.worldRank != null && (
                          <span className="ml-2 text-xs text-zinc-400">
                            World rank #{group.worldRank}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Игроки этой команды */}
                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {group.players.map((p) => {
                        const owned = roster.some(
                          (r) => r.player_id === p.player_id
                        );
                        const disabled = !canBuy(p);
                        return (
                          <div
                            key={p.player_id}
                            className={`rounded-2xl border border:white/10 border-white/10 bg:white/5 bg-white/5 p-4 transition hover:bg:white/10 hover:bg-white/10 ${
                              !disabled ? "cursor-pointer" : "opacity-90"
                            }`}
                            onClick={() => openPlayerModal(p)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                {/* Убрали отображение названия команды на карточке */}
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

      {/* === MODAL (hidden when finished) === */}
      {!finished && (
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={
            selected ? `${selected.player_name} — ${selected.team_name}` : ""
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
                <InfoTile label="Team" value={selected.team_name} />
                <InfoTile
                  label="Price"
                  value={Number(selected.price).toLocaleString()}
                />
                <InfoTile
                  label="Budget left"
                  value={budgetLeft.toLocaleString()}
                />
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">Player stats (aggregated)</h4>
                  {statLoading && (
                    <span className="text-xs text-zinc-400">Loading…</span>
                  )}
                </div>
                {statErr && (
                  <p className="text-sm text-red-400">{statErr}</p>
                )}
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
                          stat.adr != null
                            ? Number(stat.adr).toFixed(1)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Opening kills / round"
                        value={
                          stat.opening_kills_per_round != null
                            ? Number(
                                stat.opening_kills_per_round
                              ).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Opening deaths / round"
                        value={
                          stat.opening_deaths_per_round != null
                            ? Number(
                                stat.opening_deaths_per_round
                              ).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Win% after opening kill"
                        value={
                          stat.win_after_opening != null
                            ? `${Number(
                                stat.win_after_opening
                              ).toFixed(1)}%`
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Multi-kill rounds"
                        value={
                          stat.multikill_rounds_pct != null
                            ? `${Number(
                                stat.multikill_rounds_pct
                              ).toFixed(1)}%`
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Clutch points / round"
                        value={
                          stat.clutch_points_per_round != null
                            ? Number(
                                stat.clutch_points_per_round
                              ).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Sniper kills / round"
                        value={
                          stat.sniper_kills_per_round != null
                            ? Number(
                                stat.sniper_kills_per_round
                              ).toFixed(3)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Utility dmg / round"
                        value={
                          stat.utility_damage_per_round != null
                            ? Number(
                                stat.utility_damage_per_round
                              ).toFixed(1)
                            : "—"
                        }
                      />
                      <InfoTile
                        label="Flash assists / round"
                        value={
                          stat.flash_assists_per_round != null
                            ? Number(
                                stat.flash_assists_per_round
                              ).toFixed(3)
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
    </div>
  );
}
