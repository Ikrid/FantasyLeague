import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const BASE_URL = "http://localhost:8000/api";

/* ================== API ================== */
const getToken = () => localStorage.getItem("access");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

async function apiGet(path, needsAuth = true) {
  const r = await fetch(`${BASE_URL}${path}`, { headers: needsAuth ? authHeader() : {} });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail || d?.error || `GET ${path}: ${r.status}`);
  return d;
}
async function apiPost(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: authHeader(), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail || d?.error || JSON.stringify(d));
  return d;
}

/* ================== UI ================== */
function Button({ children, onClick, disabled, variant = "primary", className = "", type = "button" }) {
  const base =
    variant === "ghost"
      ? "bg-transparent text-white hover:bg-white/10"
      : "bg-white text-black hover:bg-zinc-200";
  const dis = disabled ? "opacity-50 cursor-not-allowed hover:none" : "";
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`px-3 py-1.5 rounded-xl transition ${base} ${dis} ${className}`}>
      {children}
    </button>
  );
}
function Pill({ children }) {
  return <span className="text-xs px-2 py-1 rounded-full bg-white/10">{children}</span>;
}
function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-zinc-950 border border-zinc-800 p-6 mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-6">{footer}</div>}
      </div>
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
    if (!getToken()) { navigate("/"); return; }
    load();
  }, [leagueId]);

  const started = state?.started;
  const roster = state?.roster || [];
  const budgetLeft = state?.fantasy_team?.budget_left ?? 0;
  const maxSlots = state?.limits?.slots ?? 5;
  const maxPerTeam = state?.limits?.max_per_team ?? 2;
  const teamCounts = state?.team_counts || {};
  const tournamentId = state?.tournament?.id || state?.league?.tournament || state?.tournament_id;

  const rosterCount = roster.length;
  const canBuyMore = !started && rosterCount < maxSlots;

  useEffect(() => {
    async function loadMatches() {
      if (!tournamentId) return;
      try {
        const ms = await apiGet(`/matches`, false);
        const onlyThis = (ms || []).filter((m) => Number(m.tournament) === Number(tournamentId));
        onlyThis.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        setMatches(onlyThis.slice(0, 10));
      } catch (e) {
        console.error(e);
      }
    }
    loadMatches();
  }, [tournamentId]);

  const market = useMemo(() => (state?.market || []).slice(), [state]);

  function canBuy(p) {
    if (started) return false;
    if (!canBuyMore) return false;
    if ((p?.price ?? 0) > budgetLeft) return false;
    const countTeam = teamCounts?.[String(p.team_id)] ?? 0;
    if (countTeam >= maxPerTeam) return false;
    if (roster.some((r) => r.player_id === p.player_id)) return false;
    return true;
  }

  async function doBuy(p) {
    try {
      await apiPost("/draft/buy", { league_id: Number(leagueId), player_id: p.player_id });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  async function doSell(p) {
    try {
      await apiPost("/draft/sell", { league_id: Number(leagueId), player_id: p.player_id });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  async function openPlayerModal(p) {
    setSelected(p);
    setStat(null);
    setStatErr("");
    setStatLoading(true);
    try {
      const all = await apiGet(`/player-map-stats`, false);
      const mine = (all || []).filter((row) => Number(row.player) === Number(p.player_id));
      if (!mine.length) {
        setStat({ games: 0, kd: null, adr: null, rating2: null });
      } else {
        const kills = mine.reduce((s, r) => s + (r.kills || 0), 0);
        const deaths = mine.reduce((s, r) => s + (r.deaths || 0), 0);
        const adrVals = mine.map((r) => Number(r.adr) || 0);
        const ratingVals = mine.map((r) => Number(r.rating2) || 0);
        const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
        setStat({
          games: mine.length,
          kd: deaths ? (kills / deaths).toFixed(2) : "∞",
          adr: avg(adrVals)?.toFixed(1) ?? null,
          rating2: avg(ratingVals)?.toFixed(2) ?? null,
        });
      }
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
          <Link to="/" className="text-sm text-zinc-300 hover:text-white">← Back</Link>
          <div className="flex items-center gap-3">
            <Pill>League #{leagueId}</Pill>
            {tournamentId && <Pill>Tournament #{tournamentId}</Pill>}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold">Draft</h1>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Pill>Budget left: {budgetLeft.toLocaleString()}</Pill>
          <Pill>Slots: {rosterCount}/{maxSlots}</Pill>
          <Pill>Max per team: {maxPerTeam}</Pill>
          {started && <Pill>Locked</Pill>}
        </div>

        <section className="mt-5">
          <h2 className="text-lg font-semibold mb-2">Upcoming matches</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {matches.map((m) => (
              <div key={m.id} className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                <div className="font-medium">{m.team1_name} vs {m.team2_name}</div>
                <div className="text-xs text-zinc-300">
                  {new Date(m.start_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · BO{m.bo}
                </div>
              </div>
            ))}
            {!matches.length && <div className="text-sm text-zinc-400">No matches scheduled yet.</div>}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Your roster</h2>
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: maxSlots }).map((_, i) => {
              const r = roster[i];
              return (
                <div key={i} className="rounded-2xl border border-white/10 p-4 bg-white/5 h-full">
                  {!r ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-400">
                      <span className="text-sm">Empty slot #{i + 1}</span>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-zinc-300">{r.team_name}</div>
                      <div className="text-lg font-semibold">{r.player_name}</div>
                      <div className="text-sm mt-1">Price: {Number(r.price).toLocaleString()}</div>
                      <div className="mt-3">
                        <Button variant="ghost" onClick={() => doSell(r)} disabled={started}>
                          Sell ({Number(r.price).toLocaleString()})
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Market — 5 карточек в ряд */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Market</h2>

          {loading && <p className="text-zinc-300 mt-4">Loading…</p>}
          {err && <p className="text-red-400 mt-4">{err}</p>}

          {!loading && !err && (
            <>
              <div className="mt-2 grid grid-cols-5 gap-4">
                {market.map((p) => {
                  const owned = roster.some((r) => r.player_id === p.player_id);
                  const disabled = !canBuy(p);
                  return (
                    <div
                      key={p.player_id}
                      className={`rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:bg-white/10 ${!disabled ? "cursor-pointer" : "opacity-90"}`}
                      onClick={() => openPlayerModal(p)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-zinc-400">{p.team_name}</div>
                          <div className="text-lg font-semibold">{p.player_name}</div>
                        </div>
                        {owned && <Pill>Owned</Pill>}
                      </div>

                      <div className="mt-3">
                        {owned ? (
                          <Button
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); doSell(p); }}
                            disabled={started}
                            className="w-full"
                          >
                            Sell ({Number(p.price).toLocaleString()})
                          </Button>
                        ) : (
                          <Button
                            onClick={(e) => { e.stopPropagation(); doBuy(p); }}
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

              {market.length === 0 && (
                <div className="p-6 text-center text-zinc-300">No players in market.</div>
              )}
            </>
          )}
        </section>
      </main>

      {/* Player modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.player_name} — ${selected.team_name}` : ""}
        footer={
          selected && (
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
              <Button
                onClick={() => { doBuy(selected); }}
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
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-zinc-400">Team</div>
                <div className="text-lg font-semibold">{selected.team_name}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-zinc-400">Price</div>
                <div className="text-lg font-semibold">{Number(selected.price).toLocaleString()}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-zinc-400">Budget left</div>
                <div className="text-lg font-semibold">{budgetLeft.toLocaleString()}</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h4 className="font-semibold mb-2">Player stats (aggregate)</h4>
              {statLoading && <p className="text-sm text-zinc-300">Loading…</p>}
              {statErr && <p className="text-sm text-red-400">{statErr}</p>}
              {!statLoading && stat && (
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg bg-black/40 border border-white/10 p-3">
                    <div className="text-xs text-zinc-400">Maps</div>
                    <div className="text-xl font-semibold">{stat.games}</div>
                  </div>
                  <div className="rounded-lg bg-black/40 border border-white/10 p-3">
                    <div className="text-xs text-zinc-400">K/D</div>
                    <div className="text-xl font-semibold">{stat.kd ?? "—"}</div>
                  </div>
                  <div className="rounded-lg bg-black/40 border border-white/10 p-3">
                    <div className="text-xs text-zinc-400">ADR</div>
                    <div className="text-xl font-semibold">{stat.adr ?? "—"}</div>
                  </div>
                  <div className="rounded-lg bg-black/40 border border-white/10 p-3">
                    <div className="text-xs text-zinc-400">Rating 2.0</div>
                    <div className="text-xl font-semibold">{stat.rating2 ?? "—"}</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
