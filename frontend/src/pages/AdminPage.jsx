import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const BASE_URL = "http://localhost:8000/api";

/* ================== API ================== */
const getToken = () => localStorage.getItem("access");
const clearToken = () => localStorage.removeItem("access");
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
async function apiPatch(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, { method: "PATCH", headers: authHeader(), body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.detail || d?.error || JSON.stringify(d));
  return d;
}
async function apiDelete(path) {
  const r = await fetch(`${BASE_URL}${path}`, { method: "DELETE", headers: authHeader() });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d?.detail || d?.error || `DELETE ${path}: ${r.status}`);
  }
  return true;
}

/* ================== UI ================== */
function Button({ children, onClick, type = "button", variant = "primary", disabled, className = "" }) {
  const base = variant === "ghost" ? "bg-transparent text-white hover:bg-white/10" : "bg-white text-black hover:bg-zinc-200";
  const dis = disabled ? "opacity-50 cursor-not-allowed" : "";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`px-3 py-1.5 rounded-xl transition ${base} ${dis} ${className}`}>
      {children}
    </button>
  );
}
function Input({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block">
      {label && <div className="text-sm text-zinc-300 mb-1">{label}</div>}
      <input
        className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-3 py-2 text-white focus:ring-2 focus:ring-white/30"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      {label && <div className="text-sm text-zinc-300 mb-1">{label}</div>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-3 py-2 text-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Card({ title, action, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <div className="text-lg font-semibold">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
const Note = ({ children, className = "" }) => <p className={`text-sm text-zinc-300 mt-2 ${className}`}>{children}</p>;

/* ====== small inputs ====== */
function InlineText({ value, onChange }) {
  return (
    <input
      className="w-full bg-transparent border border-white/10 rounded-lg px-2 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function StatNumber({ value, onChange, className = "" }) {
  return (
    <input
      className={`w-24 bg-transparent border border-white/10 rounded-lg px-2 py-1 text-sm ${className}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ====== list rows ====== */
function TournamentRow({ t, onSave, onDelete }) {
  const [name, setName] = useState(t.name || "");
  const [start, setStart] = useState(t.start_date || "");
  const [end, setEnd] = useState(t.end_date || "");
  useEffect(() => { setName(t.name || ""); setStart(t.start_date || ""); setEnd(t.end_date || ""); }, [t]);
  return (
    <tr className="border-t border-white/10">
      <td className="py-2 pr-2">{t.id}</td>
      <td className="py-2 pr-2"><InlineText value={name} onChange={setName} /></td>
      <td className="py-2 pr-2"><InlineText value={start} onChange={setStart} /></td>
      <td className="py-2 pr-2"><InlineText value={end} onChange={setEnd} /></td>
      <td className="py-2 pr-2 flex gap-2">
        <Button onClick={() => onSave(t.id, { name, start_date: start || null, end_date: end || null })}>Save</Button>
        <Button variant="ghost" onClick={() => onDelete(t.id, `Delete tournament "${t.name}"?`)}>Delete</Button>
      </td>
    </tr>
  );
}
function TeamRow({ t, onSave, onDelete }) {
  const [name, setName] = useState(t.name || "");
  const [rank, setRank] = useState(t.world_rank ?? "");
  useEffect(() => { setName(t.name || ""); setRank(t.world_rank ?? ""); }, [t]);
  return (
    <tr className="border-t border-white/10">
      <td className="py-2 pr-2">{t.id}</td>
      <td className="py-2 pr-2"><InlineText value={name} onChange={setName} /></td>
      <td className="py-2 pr-2"><InlineText value={rank} onChange={setRank} /></td>
      <td className="py-2 pr-2 flex gap-2">
        <Button onClick={() => onSave(t.id, { name, world_rank: rank || null })}>Save</Button>
        <Button variant="ghost" onClick={() => onDelete(t.id, `Delete team "${t.name}"?`)}>Delete</Button>
      </td>
    </tr>
  );
}
function PlayerRow({ p, teams, onSave, onDelete }) {
  const [nick, setNick] = useState(p.nickname || "");
  const [teamId, setTeamId] = useState(String(p.team || ""));
  useEffect(() => { setNick(p.nickname || ""); setTeamId(String(p.team || "")); }, [p]);
  return (
    <tr className="border-t border-white/10">
      <td className="py-2 pr-2">{p.id}</td>
      <td className="py-2 pr-2"><InlineText value={nick} onChange={setNick} /></td>
      <td className="py-2 pr-2">
        <select
          className="bg-transparent border border-white/10 rounded-lg px-2 py-1 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="">— none —</option>
          {teams.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
      </td>
      <td className="py-2 pr-2 flex gap-2">
        <Button onClick={() => onSave(p.id, { nickname: nick, team: teamId ? Number(teamId) : null })}>Save</Button>
        <Button variant="ghost" onClick={() => onDelete(p.id, `Delete player "${p.nickname}"?`)}>Delete</Button>
      </td>
    </tr>
  );
}
function LeagueRow({ l, tournaments, onSave, onDelete }) {
  const [name, setName] = useState(l.name || "");
  const [tId, setTId] = useState(String(l.tournament || ""));
  const [bud, setBud] = useState(String(l.budget || ""));
  const [bad, setBad] = useState(String(l.max_badges || 0));
  const [lock, setLock] = useState(l.lock_policy || "soft");
  useEffect(() => { setName(l.name || ""); setTId(String(l.tournament || "")); setBud(String(l.budget || "")); setBad(String(l.max_badges || 0)); setLock(l.lock_policy || "soft"); }, [l]);
  return (
    <tr className="border-t border-white/10">
      <td className="py-2 pr-2">{l.id}</td>
      <td className="py-2 pr-2"><InlineText value={name} onChange={setName} /></td>
      <td className="py-2 pr-2">
        <select className="bg-transparent border border-white/10 rounded-lg px-2 py-1 text-sm" value={tId} onChange={(e) => setTId(e.target.value)}>
          <option value="">— none —</option>
          {tournaments.map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
      </td>
      <td className="py-2 pr-2"><InlineText value={bud} onChange={setBud} /></td>
      <td className="py-2 pr-2"><InlineText value={bad} onChange={setBad} /></td>
      <td className="py-2 pr-2"><InlineText value={lock} onChange={setLock} /></td>
      <td className="py-2 pr-2 flex gap-2">
        <Button onClick={() => onSave(l.id, { name, tournament: tId ? Number(tId) : null, budget: Number(bud || 0), max_badges: Number(bad || 0), lock_policy: lock })}>Save</Button>
        <Button variant="ghost" onClick={() => onDelete(l.id, `Delete league "${l.name}"?`)}>Delete</Button>
      </td>
    </tr>
  );
}

/* ============ Match Details (maps + only the two teams' players, editable PlayerMapStats) ============ */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* расширенная модалка */}
      <div className="relative w-[96vw] max-w-[1600px] max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold">{title}</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// редактируемые поля
const EDITABLE_FIELDS = [
  "kills","deaths","assists","hs","adr","rating2",
  "opening_kills","opening_deaths","flash_assists",
  "cl_1v2","cl_1v3","cl_1v4","cl_1v5",
  "mk_3k","mk_4k","mk_5k","utility_dmg"
];

function getId(x) {
  if (x == null) return null;
  if (typeof x === "number" || typeof x === "string") return Number(x);
  if (x?.id != null) return Number(x.id);
  if (x?.team_id != null) return Number(x.team_id);
  return null;
}
function getMapId(obj) { if (!obj) return null; return obj.id ?? obj.map_id ?? obj.pk ?? null; }
function getMapLabel(obj) { return obj?.map_name || obj?.name || `#${getMapId(obj)}`; }

function MatchDetailsModal({ matchId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState(null);

  const [maps, setMaps] = useState([]);
  const [mapId, setMapId] = useState("");

  // Полные ростеры команд
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);

  // текущие stats для выбранной карты
  const [stats, setStats] = useState([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // ===== загрузка матча, карт (сортируем), полных ростеров
  async function loadAll(mid) {
    setLoading(true); setMsg("");
    try {
      const m = await apiGet(`/matches/${mid}/`);
      setMatch(m);

      const t1Id = getId(m.team1_id ?? m.team1);
      const t2Id = getId(m.team2_id ?? m.team2);

      // Карты: сортируем по map_index (возрастание)
      const ms = await apiGet(`/maps?match=${mid}`);
      (ms || []).sort((a, b) => (a?.map_index ?? 0) - (b?.map_index ?? 0));
      setMaps(ms || []);

      // Полные составы команд
      const [p1, p2] = await Promise.all([
        t1Id ? apiGet(`/players?team=${t1Id}`) : Promise.resolve([]),
        t2Id ? apiGet(`/players?team=${t2Id}`) : Promise.resolve([]),
      ]);
      setTeam1Players(p1 || []);
      setTeam2Players(p2 || []);

      // выберем первую карту
      const first = String(getMapId(ms?.[0]) || "");
      setMapId(first);
      setStats([]);
    } catch (e) {
      setMsg(String(e.message || e));
    } finally { setLoading(false); }
  }

  useEffect(() => { loadAll(matchId); }, [matchId]);

  // загружать статы при смене карты
  useEffect(() => {
    if (!mapId) return;
    setStats([]);
    (async () => {
      setMsg("");
      try {
        const st = await apiGet(`/player-map-stats?map=${mapId}`);
        setStats(Array.isArray(st) ? st : []);
      } catch (e) {
        setStats([]);
        setMsg(String(e.message || e));
      }
    })();
  }, [mapId]);

  // собрать строки для UI: всегда из ПОЛНЫХ ростеров, поверх накладываем статы
  const rows = useMemo(() => {
    const t1n = match?.team1_name ?? "Team 1";
    const t2n = match?.team2_name ?? "Team 2";
    const t1id = getId(match?.team1_id ?? match?.team1);
    const t2id = getId(match?.team2_id ?? match?.team2);

    const byPid = new Map();
    for (const s of stats || []) {
      const pid = getId(s.player ?? s.player_id);
      if (pid != null) byPid.set(pid, s);
    }

    function makeRowFromPlayer(p, teamName, teamId) {
      const existing = byPid.get(p.id) || null;
      const base = existing || {
        id: null,
        map: mapId ? Number(mapId) : null,
        player: p.id,
        team: teamId ?? p.team ?? null,
        player_name: p.nickname,
        team_name: teamName,
      };
      for (const k of EDITABLE_FIELDS) if (!(k in base)) base[k] = base[k] ?? null;
      return { ...base, _player: p, _teamName: teamName, _teamId: teamId };
    }

    const srcT1 = team1Players || [];
    const srcT2 = team2Players || [];

    const t1Rows = srcT1
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
      .map(p => makeRowFromPlayer(p, t1n, t1id))
      .sort((a,b) => (a._player?.nickname || "").localeCompare(b._player?.nickname || ""));

    const t2Rows = srcT2
      .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i)
      .map(p => makeRowFromPlayer(p, t2n, t2id))
      .sort((a,b) => (a._player?.nickname || "").localeCompare(b._player?.nickname || ""));

    return { team1Name: t1n, team2Name: t2n, team1: t1Rows, team2: t2Rows };
  }, [stats, team1Players, team2Players, mapId, match]);

  function updateCell(_which, idx, key, value, isTeam2 = false) {
    const cloned = { team1: [...rows.team1], team2: [...rows.team2], team1Name: rows.team1Name, team2Name: rows.team2Name };
    const arr = isTeam2 ? cloned.team2 : cloned.team1;
    const v = value === "" ? null : (isNaN(Number(value)) ? value : Number(value));
    arr[idx] = { ...arr[idx], [key]: v };
    const merged = [...cloned.team1, ...cloned.team2].map((r) => {
      const obj = {}; for (const k of Object.keys(r)) obj[k] = r[k]; return obj;
    });
    setStats(merged);
  }

  async function saveRow(s) {
    try {
      const body = {};
      for (const k of EDITABLE_FIELDS) if (k in s) body[k] = s[k];
      body.map = Number(mapId);
      body.player = getId(s.player ?? s._player?.id ?? s.player_id);

      const t1id = getId(match?.team1_id ?? match?.team1);
      const inTeam1 = team1Players.some(p => p.id === body.player);
      body.team = getId(s._teamId ?? (inTeam1 ? t1id : getId(match?.team2_id ?? match?.team2)));

      if (s.id) {
        await apiPatch(`/player-map-stats/${s.id}/`, body);
      } else {
        const created = await apiPost(`/player-map-stats/`, body);
        setStats((prev) => prev.map((x) => (x === s ? created : x)));
      }
      const st = await apiGet(`/player-map-stats?map=${mapId}`);
      setStats(Array.isArray(st) ? st : []);
      setMsg("Saved");
    } catch (e) { setMsg(String(e.message || e)); }
  }

  async function saveAll() {
    setSaving(true); setMsg("");
    try {
      const t1id = getId(match?.team1_id ?? match?.team1);
      const t2id = getId(match?.team2_id ?? match?.team2);

      for (const s of [...rows.team1, ...rows.team2]) {
        const body = {};
        for (const k of EDITABLE_FIELDS) if (k in s) body[k] = s[k];
        body.map = Number(mapId);
        body.player = getId(s.player ?? s._player?.id ?? s.player_id);
        const inTeam1 = team1Players.some(p => p.id === body.player);
        body.team = getId(s._teamId ?? (inTeam1 ? t1id : t2id));

        if (s.id) await apiPatch(`/player-map-stats/${s.id}/`, body);
        else await apiPost(`/player-map-stats/`, body);
      }
      const st = await apiGet(`/player-map-stats?map=${mapId}`);
      setStats(st);
      setMsg("All rows saved");
    } catch (e) {
      setMsg(String(e.message || e));
    } finally { setSaving(false); }
  }

  return (
    <Modal title={match ? `Match #${match.id} — ${match.team1_name} vs ${match.team2_name}` : `Match #${matchId}`} onClose={onClose}>
      {loading ? (
        <Note>Loading…</Note>
      ) : (
        <div className="grid gap-4">
          {/* Maps header (отсортированы по map_index) */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-300">Maps:</span>
            {maps.map((mp) => {
              const id = String(getMapId(mp));
              return (
                <button
                  key={id}
                  onClick={() => setMapId(id)}
                  className={`px-3 py-1 rounded-lg border ${id === String(mapId) ? "bg-white text-black border-white" : "border-white/20 hover:bg-white/10"}`}
                  title={getMapLabel(mp)}
                >
                  {getMapLabel(mp)}
                </button>
              );
            })}
            {!maps.length && <Note>No maps.</Note>}
            <div className="ml-auto"><Button onClick={saveAll} disabled={saving || !(rows.team1.length + rows.team2.length)}>{saving ? "Saving…" : "Save all"}</Button></div>
          </div>

          {/* TEAM 1 */}
          <div className="rounded-xl border border-white/10">
            <div className="px-3 py-2 font-semibold bg-white/5">{rows.team1Name}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-zinc-300">
                  <tr>
                    <th className="py-2 pr-2">Player</th>
                    {EDITABLE_FIELDS.map((k) => <th key={k} className="py-2 pr-2">{k.toUpperCase()}</th>)}
                    <th className="py-2 pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.team1.map((s, i) => (
                    <tr key={`${s._player?.id ?? s.player}-${i}`} className="border-t border-white/10">
                      <td className="py-2 pr-2">{s._player?.nickname ?? s.player_name ?? s.player}</td>
                      {EDITABLE_FIELDS.map((k) => (
                        <td key={k} className="py-2 pr-2">
                          <StatNumber value={s[k]} onChange={(v) => updateCell("team1", i, k, v, false)} />
                        </td>
                      ))}
                      <td className="py-2 pr-2"><Button onClick={() => saveRow(s)}>Save</Button></td>
                    </tr>
                  ))}
                  {!rows.team1.length && <tr><td className="py-3 text-zinc-400" colSpan={EDITABLE_FIELDS.length + 2}>No players</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* TEAM 2 */}
          <div className="rounded-xl border border-white/10">
            <div className="px-3 py-2 font-semibold bg-white/5">{rows.team2Name}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-zinc-300">
                  <tr>
                    <th className="py-2 pr-2">Player</th>
                    {EDITABLE_FIELDS.map((k) => <th key={k} className="py-2 pr-2">{k.toUpperCase()}</th>)}
                    <th className="py-2 pr-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.team2.map((s, i) => (
                    <tr key={`${s._player?.id ?? s.player}-${i}`} className="border-t border-white/10">
                      <td className="py-2 pr-2">{s._player?.nickname ?? s.player_name ?? s.player}</td>
                      {EDITABLE_FIELDS.map((k) => (
                        <td key={k} className="py-2 pr-2">
                          <StatNumber value={s[k]} onChange={(v) => updateCell("team2", i, k, v, true)} />
                        </td>
                      ))}
                      <td className="py-2 pr-2"><Button onClick={() => saveRow(s)}>Save</Button></td>
                    </tr>
                  ))}
                  {!rows.team2.length && <tr><td className="py-3 text-zinc-400" colSpan={EDITABLE_FIELDS.length + 2}>No players</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {msg && <Note>{msg}</Note>}
        </div>
      )}
    </Modal>
  );
}

/* ================== MAIN PAGE ================== */
export default function AdminPage() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("market");

  // datasets
  const [tournaments, setTournaments] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);

  // MARKET
  const [tid, setTid] = useState("");
  const [budget, setBudget] = useState("1000000");
  const [slots, setSlots] = useState("5");
  const [marketMsg, setMarketMsg] = useState("");

  // TOURNAMENT (tab forms)
  const [tName, setTName] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  const [ttTeam, setTtTeam] = useState("");
  const [ttTournament, setTtTournament] = useState("");

  // TEAM (tab forms)
  const [teamName, setTeamName] = useState("");
  const [teamRank, setTeamRank] = useState("");
  const [ltTeam, setLtTeam] = useState("");
  const [ltTournament, setLtTournament] = useState("");

  // PLAYER (tab forms)
  const [playerNickname, setPlayerNickname] = useState("");
  const [playerTeam, setPlayerTeam] = useState("");
  const [lpPlayer, setLpPlayer] = useState("");
  const [lpTeam, setLpTeam] = useState("");

  // LEAGUE (tab forms)
  const [leagueName, setLeagueName] = useState("");
  const [leagueTid, setLeagueTid] = useState("");
  const [leagueBudget, setLeagueBudget] = useState("1000000");
  const [leagueBadges, setLeagueBadges] = useState("0");
  const [leagueLock, setLeagueLock] = useState("soft");
  const [llLeague, setLlLeague] = useState("");
  const [llTournament, setLlTournament] = useState("");

  // MATCH creation
  const [mTid, setMTid] = useState("");
  const [mTeam1, setMTeam1] = useState("");
  const [mTeam2, setMTeam2] = useState("");
  const [mStart, setMStart] = useState("");
  const [mBo, setMBo] = useState("3");

  // MATCHES LIST TAB
  const [mlTournament, setMlTournament] = useState("");
  const [mlQuery, setMlQuery] = useState("");
  const [mlMatches, setMlMatches] = useState([]);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlErr, setMlErr] = useState("");
  const [openMatchId, setOpenMatchId] = useState(null);

  // LISTS filters
  const [qT, setQT] = useState("");
  const [qTm, setQTm] = useState("");
  const [qP, setQP] = useState("");
  const [qL, setQL] = useState("");

  const [msg, setMsg] = useState("");

  // unused "add" modals
  const [showAddTournament, setShowAddTournament] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showAddLeague, setShowAddLeague] = useState(false);

  const [mTName, setMTName] = useState("");
  const [mTStart, setMTStart] = useState("");
  const [mTEnd, setMTEnd] = useState("");
  const [mTeamName, setMTeamName] = useState("");
  const [mTeamRank, setMTeamRank] = useState("");
  const [mPlayerNick, setMPlayerNick] = useState("");
  const [mPlayerTeam, setMPlayerTeam] = useState("");
  const [mLeagueName, setMLeagueName] = useState("");
  const [mLeagueTid, setMLeagueTid] = useState("");
  const [mLeagueBudget, setMLeagueBudget] = useState("1000000");
  const [mLeagueBadges, setMLeagueBadges] = useState("0");
  const [mLeagueLock, setMLeagueLock] = useState("soft");

  /* ===== auth + initial fetch ===== */
  useEffect(() => {
    if (!getToken()) { nav("/"); return; }
    apiGet("/auth/me")
      .then((u) => {
        if (!u?.is_staff) { clearToken(); nav("/"); return; }
        setMe(u);
        refreshAll();
      })
      .catch(() => { clearToken(); nav("/"); });
  }, []);

  async function refreshAll() {
    const [ts, tm, ps, ls] = await Promise.all([
      apiGet("/tournaments", false),
      apiGet("/teams", false),
      apiGet("/players", false),
      apiGet("/leagues", false),
    ]);
    setTournaments(ts); setTeams(tm); setPlayers(ps); setLeagues(ls);
  }

  // Options
  const tOpts = useMemo(() => [{ value: "", label: "— choose tournament —" }, ...tournaments.map(t => ({ value: String(t.id), label: t.name }))], [tournaments]);
  const teamOpts = useMemo(() => [{ value: "", label: "— choose team —" }, ...teams.map(t => ({ value: String(t.id), label: t.name }))], [teams]);

  const leaguesByT = useMemo(() => {
    const by = {};
    for (const l of leagues) (by[String(l.tournament)] ||= []).push(l);
    return by;
  }, [leagues]);

  // Filtered lists
  const filteredTournaments = useMemo(() => tournaments.filter(t => (t.name || "").toLowerCase().includes(qT.toLowerCase())), [tournaments, qT]);
  const filteredTeams = useMemo(() => teams.filter(t => (t.name || "").toLowerCase().includes(qTm.toLowerCase())), [teams, qTm]);
  const filteredPlayers = useMemo(() => players.filter(p => (p.nickname || "").toLowerCase().includes(qP.toLowerCase())), [players, qP]);
  const filteredLeagues = useMemo(() => leagues.filter(l => (l.name || "").toLowerCase().includes(qL.toLowerCase())), [leagues, qL]);

  /* ===== Market ===== */
  async function generateMarket() {
    setMarketMsg("");
    if (!tid) return setMarketMsg("Choose tournament");
    try {
      await apiPost("/market/generate", { tournament: Number(tid), budget: Number(budget), slots: Number(slots) });
      setMarketMsg("Market generated");
    } catch (e) { setMarketMsg(String(e.message || e)); }
  }

  /* ===== CRUD ===== */
  async function createTournament() {
    setMsg(""); if (!tName) return setMsg("Tournament: name required");
    try { await apiPost("/tournaments/", { name: tName, start_date: tStart || null, end_date: tEnd || null }); setMsg("Tournament created"); setTName(""); setTStart(""); setTEnd(""); await refreshAll(); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function linkTeamToTournament_tt() {
    setMsg(""); if (!ttTeam || !ttTournament) return setMsg("Choose team & tournament");
    try { await apiPost("/tournament-teams/", { team: Number(ttTeam), tournament: Number(ttTournament) }); setMsg("Team linked to tournament"); setTtTeam(""); setTtTournament(""); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function createMatch() {
    setMsg(""); if (!mTid || !mTeam1 || !mTeam2) return setMsg("Match: tournament, team1, team2 required");
    try { await apiPost("/matches/", { tournament: Number(mTid), team1: Number(mTeam1), team2: Number(mTeam2), start_time: mStart || null, bo: Number(mBo || 3) }); setMsg("Match created"); setMTid(""); setMTeam1(""); setMTeam2(""); setMStart(""); setMBo("3"); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function createTeam() {
    setMsg(""); if (!teamName) return setMsg("Team: name required");
    try { await apiPost("/teams/", { name: teamName, world_rank: teamRank ? Number(teamRank) : null }); setMsg("Team created"); setTeamName(""); setTeamRank(""); await refreshAll(); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function linkTeamToTournament() {
    setMsg(""); if (!ltTeam || !ltTournament) return setMsg("Choose team & tournament");
    try { await apiPost("/tournament-teams/", { team: Number(ltTeam), tournament: Number(ltTournament) }); setMsg("Team linked to tournament"); setLtTeam(""); setLtTournament(""); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function createPlayer() {
    setMsg(""); if (!playerNickname || !playerTeam) return setMsg("Player: nickname & team required");
    try { await apiPost("/players/", { nickname: playerNickname, team: Number(playerTeam) }); setMsg("Player created"); setPlayerNickname(""); setPlayerTeam(""); await refreshAll(); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function linkPlayerToTeam() {
    setMsg(""); if (!lpPlayer || !lpTeam) return setMsg("Choose player & team");
    try { await apiPatch(`/players/${lpPlayer}/`, { team: Number(lpTeam) }); setMsg("Player linked to team"); setLpPlayer(""); setLpTeam(""); await refreshAll(); }
    catch (e) { setMsg(String(e.message || e)); }
  }
  async function createLeague() {
    setMsg(""); if (!leagueName || !leagueTid) return setMsg("League: name & tournament required");
    try {
      await apiPost("/leagues/", { name: leagueName, tournament: Number(leagueTid), budget: Number(leagueBudget), max_badges: Number(leagueBadges), lock_policy: leagueLock || "soft" });
      setMsg("League created"); setLeagueName(""); setLeagueTid(""); setLeagueBudget("1000000"); setLeagueBadges("0"); setLeagueLock("soft"); await refreshAll();
    } catch (e) { setMsg(String(e.message || e)); }
  }
  async function linkLeagueToTournament() {
    setMsg(""); if (!llLeague || !llTournament) return setMsg("Choose league & tournament");
    try { await apiPatch(`/leagues/${llLeague}/`, { tournament: Number(llTournament) }); setMsg("League linked to tournament"); setLlLeague(""); setLlTournament(""); await refreshAll(); }
    catch (e) { setMsg(String(e.message || e)); }
  }

  /* ===== LISTS save/delete ===== */
  async function saveRow(type, id, body) { await apiPatch(`/${type}/${id}/`, body); await refreshAll(); }
  async function removeRow(type, id, text) { if (!window.confirm(text || "Delete?")) return; await apiDelete(`/${type}/${id}/`); await refreshAll(); }

  // ===== Matches loader =====
  function extractTournamentId(m) {
    if (m.tournament_id != null) return m.tournament_id;
    if (typeof m.tournament === "number") return m.tournament;
    if (m.tournament && typeof m.tournament === "object" && m.tournament.id != null) return m.tournament.id;
    if (m.tournamentId != null) return m.tournamentId;
    return null;
  }

  async function loadMatchesForTournament() {
    setMlErr(""); setMlLoading(true);
    try {
      const endpoint = mlTournament ? `/matches?tournament=${mlTournament}` : `/matches`;
      const list = await apiGet(endpoint, false);
      const filtered = mlTournament
        ? (list || []).filter((m) => String(extractTournamentId(m)) === String(mlTournament))
        : (list || []);
      filtered.sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
      setMlMatches(filtered);
    } catch (e) {
      setMlErr(String(e.message || e));
    } finally { setMlLoading(false); }
  }

  useEffect(() => {
    if (!mlTournament) { setMlMatches([]); return; }
    loadMatchesForTournament();
  }, [mlTournament]);

  const mlFiltered = useMemo(() => {
    if (!mlQuery) return mlMatches;
    const q = mlQuery.toLowerCase();
    return mlMatches.filter(m =>
      (m.team1_name || "").toLowerCase().includes(q) ||
      (m.team2_name || "").toLowerCase().includes(q)
    );
  }, [mlMatches, mlQuery]);

  if (!me) return <div className="min-h-screen bg-black text-white p-6">Loading…</div>;

  const tabBtn = (name) => (
    <button key={name} onClick={() => setTab(name)} className={`px-3 py-1.5 rounded-xl border transition ${tab === name ? "bg-white text-black border-white" : "bg-transparent text-white border-white/20 hover:bg-white/10"}`}>
      {name.toUpperCase()}
    </button>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">Fantasy CS2</Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-300">{me.username} (admin)</span>
            <Link to="/" className="text-sm text-zinc-300 hover:text-white">Back</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold">Admin Tools</h1>

        <div className="mt-4 flex gap-2 flex-wrap">
          {["market", "lists", "tournament", "team", "player", "league", "matches"].map(tabBtn)}
        </div>

        {/* MARKET */}
        {tab === "market" && (
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <Card title="Generate Market">
              <div className="grid gap-3">
                <Select label="Tournament" value={tid} onChange={setTid} options={tOpts} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Budget" value={budget} onChange={setBudget} />
                  <Input label="Slots" value={slots} onChange={setSlots} />
                </div>
                <Button onClick={generateMarket}>Generate</Button>
                {marketMsg && <Note>{marketMsg}</Note>}
              </div>
            </Card>
            <Card title="Leagues (by tournament)">
              {tid ? (
                <div className="space-y-2">
                  {(leaguesByT[String(tid)] || []).map((l) => (
                    <div key={l.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 border border-white/10">
                      <span>{l.name}</span>
                      <span className="text-xs text-zinc-300">budget: {l.budget}</span>
                    </div>
                  ))}
                  {(leaguesByT[String(tid)] || []).length === 0 && <p className="text-zinc-300">No leagues.</p>}
                </div>
              ) : (
                <p className="text-zinc-300">Choose tournament.</p>
              )}
            </Card>
          </div>
        )}

        {/* LISTS */}
        {tab === "lists" && (
          <div className="mt-6 space-y-8">
            <Card title="Tournaments">
              <div className="mb-3"><Input label="Search" value={qT} onChange={setQT} placeholder="name..." /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-zinc-300">
                    <tr><th className="py-2 pr-2">ID</th><th className="py-2 pr-2">Name</th><th className="py-2 pr-2">Start</th><th className="py-2 pr-2">End</th><th className="py-2 pr-2">Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredTournaments.map((t) => (
                      <TournamentRow key={t.id} t={t} onSave={(id, body) => saveRow("tournaments", id, body)} onDelete={(id, text) => removeRow("tournaments", id, text)} />
                    ))}
                    {filteredTournaments.length === 0 && <tr><td className="py-4 text-zinc-400" colSpan={5}>No tournaments</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Teams">
              <div className="mb-3"><Input label="Search" value={qTm} onChange={setQTm} placeholder="name..." /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-zinc-300">
                    <tr><th className="py-2 pr-2">ID</th><th className="py-2 pr-2">Name</th><th className="py-2 pr-2">Rank</th><th className="py-2 pr-2">Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredTeams.map((t) => (
                      <TeamRow key={t.id} t={t} onSave={(id, body) => saveRow("teams", id, body)} onDelete={(id, text) => removeRow("teams", id, text)} />
                    ))}
                    {filteredTeams.length === 0 && <tr><td className="py-4 text-zinc-400" colSpan={4}>No teams</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Players">
              <div className="mb-3"><Input label="Search" value={qP} onChange={setQP} placeholder="nickname..." /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-zinc-300">
                    <tr><th className="py-2 pr-2">ID</th><th className="py-2 pr-2">Nickname</th><th className="py-2 pr-2">Team</th><th className="py-2 pr-2">Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredPlayers.map((p) => (
                      <PlayerRow key={p.id} p={p} teams={teams} onSave={(id, body) => saveRow("players", id, body)} onDelete={(id, text) => removeRow("players", id, text)} />
                    ))}
                    {filteredPlayers.length === 0 && <tr><td className="py-4 text-zinc-400" colSpan={4}>No players</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Leagues">
              <div className="mb-3"><Input label="Search" value={qL} onChange={setQL} placeholder="name..." /></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-zinc-300">
                    <tr><th className="py-2 pr-2">ID</th><th className="py-2 pr-2">Name</th><th className="py-2 pr-2">Tournament</th><th className="py-2 pr-2">Budget</th><th className="py-2 pr-2">Badges</th><th className="py-2 pr-2">Lock</th><th className="py-2 pr-2">Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredLeagues.map((l) => (
                      <LeagueRow key={l.id} l={l} tournaments={tournaments} onSave={(id, body) => saveRow("leagues", id, body)} onDelete={(id, text) => removeRow("leagues", id, text)} />
                    ))}
                    {filteredLeagues.length === 0 && <tr><td className="py-4 text-zinc-400" colSpan={7}>No leagues</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* TOURNAMENT */}
        {tab === "tournament" && (
          <div className="mt-6 grid lg:grid-cols-2 gap-6">
            <Card title="Create Tournament">
              <div className="grid gap-3">
                <Input label="Name" value={tName} onChange={setTName} />
                <Input label="Start date (YYYY-MM-DD)" value={tStart} onChange={setTStart} />
                <Input label="End date (YYYY-MM-DD)" value={tEnd} onChange={setTEnd} />
                <Button onClick={createTournament}>Create Tournament</Button>
              </div>
            </Card>
            <Card title="Link Team → Tournament">
              <div className="grid gap-3">
                <Select label="Team" value={ttTeam} onChange={setTtTeam} options={teamOpts} />
                <Select label="Tournament" value={ttTournament} onChange={setTtTournament} options={tOpts} />
                <Button onClick={linkTeamToTournament_tt}>Link</Button>
              </div>
            </Card>
            <Card title="Create Match">
              <div className="grid gap-3">
                <Select label="Tournament" value={mTid} onChange={setMTid} options={tOpts} />
                <Select label="Team 1" value={mTeam1} onChange={setMTeam1} options={teamOpts} />
                <Select label="Team 2" value={mTeam2} onChange={setMTeam2} options={teamOpts} />
                <Input label="Start time (YYYY-MM-DDTHH:mm)" value={mStart} onChange={setMStart} />
                <Input label="BO" value={mBo} onChange={setMBo} />
                <Button onClick={createMatch}>Create Match</Button>
              </div>
              <Note>Время: <code>2025-08-01T19:00</code>. BO: 1/3/5.</Note>
            </Card>
          </div>
        )}

        {/* TEAM */}
        {tab === "team" && (
          <div className="mt-6 grid lg:grid-cols-2 gap-6">
            <Card title="Create Team">
              <div className="grid gap-3">
                <Input label="Name" value={teamName} onChange={setTeamName} />
                <Input label="World rank (optional)" value={teamRank} onChange={setTeamRank} />
                <Button onClick={createTeam}>Create Team</Button>
              </div>
            </Card>
            <Card title="Link Team → Tournament">
              <div className="grid gap-3">
                <Select label="Team" value={ltTeam} onChange={setLtTeam} options={teamOpts} />
                <Select label="Tournament" value={ltTournament} onChange={setLtTournament} options={tOpts} />
                <Button onClick={linkTeamToTournament}>Link</Button>
              </div>
            </Card>
          </div>
        )}

        {/* PLAYER */}
        {tab === "player" && (
          <div className="mt-6 grid lg:grid-cols-2 gap-6">
            <Card title="Create Player">
              <div className="grid gap-3">
                <Input label="Nickname" value={playerNickname} onChange={setPlayerNickname} />
                <Select label="Team" value={playerTeam} onChange={setPlayerTeam} options={teamOpts} />
                <Button onClick={createPlayer}>Create Player</Button>
              </div>
            </Card>
            <Card title="Link Player → Team">
              <div className="grid gap-3">
                <Select label="Player" value={lpPlayer} onChange={setLpPlayer} options={players.map(p=>({value:String(p.id),label:p.nickname}))} />
                <Select label="Team" value={lpTeam} onChange={setLpTeam} options={teamOpts} />
                <Button onClick={linkPlayerToTeam}>Link</Button>
              </div>
            </Card>
          </div>
        )}

        {/* LEAGUE */}
        {tab === "league" && (
          <div className="mt-6 grid lg:grid-cols-2 gap-6">
            <Card title="Create League">
              <div className="grid gap-3">
                <Input label="Name" value={leagueName} onChange={setLeagueName} />
                <Select label="Tournament" value={leagueTid} onChange={setLeagueTid} options={tOpts} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Budget" value={leagueBudget} onChange={setLeagueBudget} />
                  <Input label="Max badges" value={leagueBadges} onChange={setLeagueBadges} />
                </div>
                <Input label="Lock policy" value={leagueLock} onChange={setLeagueLock} placeholder="soft / hard" />
                <Button onClick={createLeague}>Create League</Button>
              </div>
            </Card>
            <Card title="Link League → Tournament">
              <div className="grid gap-3">
                <Select label="League" value={llLeague} onChange={setLlLeague} options={leagues.map(l=>({value:String(l.id),label:l.name}))} />
                <Select label="Tournament" value={llTournament} onChange={setLlTournament} options={tOpts} />
                <Button onClick={linkLeagueToTournament}>Link</Button>
              </div>
            </Card>
          </div>
        )}

        {/* MATCHES */}
        {tab === "matches" && (
          <div className="mt-6 grid gap-6">
            <Card title="Matches by Tournament" action={<Button onClick={loadMatchesForTournament}>Refresh</Button>}>
              <div className="grid md:grid-cols-2 gap-3">
                <Select label="Tournament" value={mlTournament} onChange={setMlTournament} options={tOpts} />
                <Input label="Search (team names)" value={mlQuery} onChange={setMlQuery} placeholder="NaVi, Vitality, etc." />
              </div>
              <div className="mt-4">
                {mlErr && <Note className="text-red-400">{mlErr}</Note>}
                {!mlErr && mlTournament && mlLoading && <Note>Loading matches…</Note>}
                {!mlErr && mlTournament && !mlLoading && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-zinc-300">
                        <tr>
                          <th className="py-2 pr-2">ID</th>
                          <th className="py-2 pr-2">Team 1</th>
                          <th className="py-2 pr-2">Team 2</th>
                          <th className="py-2 pr-2">Start</th>
                          <th className="py-2 pr-2">BO</th>
                          <th className="py-2 pr-2">Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mlFiltered.map((m) => (
                          <tr key={m.id} className="border-t border-white/10">
                            <td className="py-2 pr-2">{m.id}</td>
                            <td className="py-2 pr-2">{m.team1_name}</td>
                            <td className="py-2 pr-2">{m.team2_name}</td>
                            <td className="py-2 pr-2">{m.start_time ? new Date(m.start_time).toLocaleString() : "—"}</td>
                            <td className="py-2 pr-2">BO{m.bo}</td>
                            <td className="py-2 pr-2"><Button onClick={() => setOpenMatchId(m.id)}>Open</Button></td>
                          </tr>
                        ))}
                        {!mlFiltered.length && <tr><td className="py-3 text-zinc-400" colSpan={6}>No matches found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
                {!mlTournament && <Note>Choose tournament to see matches.</Note>}
              </div>
            </Card>
          </div>
        )}
      </main>

      {openMatchId != null && <MatchDetailsModal matchId={openMatchId} onClose={() => setOpenMatchId(null)} />}
    </div>
  );
}
