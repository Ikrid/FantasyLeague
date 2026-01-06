import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Link, useNavigate } from "react-router-dom";

const BASE_URL = "http://localhost:8000/api";

/* ================== API ================== */
const getToken = () => localStorage.getItem("access");
const clearToken = () => localStorage.removeItem("access");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" });

const COUNTRIES = [
  { code: "", name: "—" },
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BD", name: "Bangladesh" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BR", name: "Brazil" },
  { code: "BG", name: "Bulgaria" },
  { code: "CA", name: "Canada" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "HR", name: "Croatia" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EG", name: "Egypt" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "MD", name: "Moldova" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "PK", name: "Pakistan" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RS", name: "Serbia" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ZA", name: "South Africa" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TH", name: "Thailand" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
];

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

async function apiPostForm(path, formData) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
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

/* ====== ADMIN RECALC (FIXED URL) ====== */
async function adminRecalculate(scope, id) {
  return apiPost(`/admin/recalculate`, { scope, id });
}

/* ================== scroll preserve (fix jump) ================== */
function usePreserveScroll() {
  const yRef = useRef(null);

  const capture = () => {
    yRef.current = window.scrollY || 0;
  };

  const restore = () => {
    const y = yRef.current;
    if (y == null) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
      yRef.current = null;
    });
  };

  return { capture, restore };
}

function preserveSetter(setter, capture, restore) {
  return (v) => {
    capture();
    setter(v);
    restore();
  };
}

/* ================== UI ================== */
function Button({ children, onClick, type = "button", variant = "primary", disabled, className = "" }) {
  const base =
    variant === "ghost" ? "bg-transparent text-white hover:bg-white/10" : "bg-white text-black hover:bg-zinc-200";
  const dis = disabled ? "opacity-50 cursor-not-allowed" : "";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-6 py-3 text-lg rounded-2xl transition shadow-sm ${base} ${dis} ${className}`}
    >
      {children}
    </button>
  );
}
function Input({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block space-y-2">
      {label && <div className="text-lg text-zinc-300">{label}</div>}
      <input
        className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-5 py-4 text-lg text-white outline-none focus:ring-2 focus:ring-white/30"
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
    <label className="block space-y-2">
      {label && <div className="text-lg text-zinc-300">{label}</div>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-5 py-4 text-lg text-white outline-none focus:ring-2 focus:ring-white/30"
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

/* ✅ small toast (success/error/info) */
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => onClose?.(), 2200);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const isErr = toast.type === "error";
  const isOk = toast.type === "success";

  const cls = isErr
    ? "border-red-500/30 bg-red-500/10 text-red-200"
    : isOk
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : "border-white/10 bg-white/10 text-zinc-200";

  return (
    <div className="fixed z-[200] bottom-6 right-6 max-w-[420px]">
      <div className={`rounded-2xl border px-5 py-4 shadow-2xl backdrop-blur ${cls}`}>
        <div className="flex items-start gap-3">
          <div className="flex-1 text-lg">{toast.message}</div>
          <button className="text-xl leading-none opacity-70 hover:opacity-100" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

/* ✅ searchable + paginated dropdown for all "choose ..." */
function ComboSelect({
  label,
  value,
  onChange,
  options,
  pageSize = 12,
  searchPlaceholder = "Search...",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [q, open]);

  const normalized = useMemo(() => {
    const list = Array.isArray(options) ? options : [];
    return list;
  }, [options]);

  const selectedLabel = useMemo(() => {
    const found = normalized.find((o) => String(o.value) === String(value));
    return found?.label ?? "";
  }, [normalized, value]);

  const filtered = useMemo(() => {
    const query = (q || "").trim().toLowerCase();
    if (!query) return normalized;
    return normalized.filter((o) => (o.label || "").toLowerCase().includes(query));
  }, [normalized, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const paginated = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe, pageSize]);

  return (
    <label className="block space-y-2" ref={wrapRef}>
      {label && <div className="text-lg text-zinc-300">{label}</div>}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left rounded-xl bg-zinc-900/60 border border-zinc-700 px-5 py-4 text-lg text-white outline-none focus:ring-2 focus:ring-white/30"
      >
        {selectedLabel || "— choose —"}
      </button>

      {open && (
        <div className="relative">
          <div className="absolute z-[80] mt-2 w-full rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-4 py-3 text-lg text-white outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {paginated.map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => {
                    onChange(String(o.value));
                    setOpen(false);
                  }}
                  className={`w-full text-left px-5 py-3 text-lg border-b border-white/5 hover:bg-white/10 ${
                    String(o.value) === String(value) ? "bg-white text-black" : "text-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
              {!paginated.length && <div className="px-5 py-4 text-lg text-zinc-400">No results</div>}
            </div>

            <div className="p-4 flex items-center justify-between border-t border-white/10 text-lg text-zinc-300">
              <span>
                Page {pageSafe} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={pageSafe === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  disabled={pageSafe === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </label>
  );
}

function Card({ title, action, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
      {(title || action) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {title && <div className="text-2xl font-semibold">{title}</div>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
const Note = ({ children, className = "" }) => <p className={`text-lg text-zinc-300 mt-3 ${className}`}>{children}</p>;

function InlineText({ value, onChange }) {
  return (
    <input
      className="w-full bg-transparent border border-white/10 rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-white/20"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function StatNumber({ value, onChange, className = "" }) {
  return (
    <input
      className={`w-28 bg-transparent border border-white/10 rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-white/20 ${className}`}
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
  useEffect(() => {
    setName(t.name || "");
    setStart(t.start_date || "");
    setEnd(t.end_date || "");
  }, [t]);
  return (
    <tr className="border-t border-white/10">
      <td className="py-4 pr-3 text-lg">{t.id}</td>
      <td className="py-4 pr-3">
        <InlineText value={name} onChange={setName} />
      </td>
      <td className="py-4 pr-3">
        <InlineText value={start} onChange={setStart} />
      </td>
      <td className="py-4 pr-3">
        <InlineText value={end} onChange={setEnd} />
      </td>
      <td className="py-4 pr-3">
        <div className="flex gap-2">
          <Button onClick={() => onSave(t.id, { name, start_date: start || null, end_date: end || null })}>Save</Button>
          <Button variant="ghost" onClick={() => onDelete(t.id, `Delete tournament "${t.name}"?`)}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
function TeamRow({ t, onSave, onDelete }) {
  const [name, setName] = useState(t.name || "");
  const [rank, setRank] = useState(t.world_rank ?? "");
  const [regionCode, setRegionCode] = useState(t.region_code || "");
  const [regionName, setRegionName] = useState(t.region_name || "");
  useEffect(() => {
    setName(t.name || "");
    setRank(t.world_rank ?? "");
    setRegionCode(t.region_code || "");
    setRegionName(t.region_name || "");
  }, [t]);
  return (
    <tr className="border-t border-white/10">
      <td className="py-4 pr-3 text-lg">{t.id}</td>
      <td className="py-4 pr-3">
        <InlineText value={name} onChange={setName} />
      </td>
      <td className="py-4 pr-3">
        <InlineText value={rank} onChange={setRank} />
      </td>
      <td className="py-4 pr-3">
        <select
          className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
          value={regionCode}
          onChange={(e) => {
            const v = e.target.value;
            setRegionCode(v);
            const found = COUNTRIES.find((c) => c.code === v);
            setRegionName(found ? found.name : "");
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code || "__empty"} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-4 pr-3">
        <div className="flex gap-2">
          <Button
            onClick={() =>
              onSave(t.id, {
                name,
                world_rank: rank || null,
                region_code: regionCode || null,
                region_name: regionName || null,
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={() => onDelete(t.id, `Delete team "${t.name}"?`)}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
function PlayerRow({ p, teams, onSave, onDelete }) {
  const [nick, setNick] = useState(p.nickname || "");
  const [teamId, setTeamId] = useState(String(p.team || ""));
  const [countryCode, setCountryCode] = useState(p.country_code || p.nationality_code || "");
  const [countryName, setCountryName] = useState(p.country_name || p.nationality_name || "");

  useEffect(() => {
    setNick(p.nickname || "");
    setTeamId(String(p.team || ""));
    setCountryCode(p.country_code || p.nationality_code || "");
    setCountryName(p.country_name || p.nationality_name || "");
  }, [p]);

  return (
    <tr className="border-t border-white/10">
      <td className="py-4 pr-3 text-lg">{p.id}</td>
      <td className="py-4 pr-3">
        <InlineText value={nick} onChange={setNick} />
      </td>
      <td className="py-4 pr-3">
        <select
          className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-white/20"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="">— none —</option>
          {teams.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>
      </td>

      <td className="py-4 pr-3">
        <select
          className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
          value={countryCode}
          onChange={(e) => {
            const v = e.target.value;
            setCountryCode(v);
            const found = COUNTRIES.find((c) => c.code === v);
            setCountryName(found ? found.name : "");
          }}
        >
          {COUNTRIES.map((c) => (
            <option key={c.code || "__empty"} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </td>

      <td className="py-4 pr-3">
        <div className="flex gap-2">
          <Button
            onClick={() =>
              onSave(p.id, {
                nickname: nick,
                team: teamId ? Number(teamId) : null,
                country_code: countryCode || null,
                country_name: countryName || null,
                nationality_code: countryCode || null,
                nationality_name: countryName || null,
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={() => onDelete(p.id, `Delete player "${p.nickname}"?`)}>
            Delete
          </Button>
        </div>
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
  useEffect(() => {
    setName(l.name || "");
    setTId(String(l.tournament || ""));
    setBud(String(l.budget || ""));
    setBad(String(l.max_badges || 0));
    setLock(l.lock_policy || "soft");
  }, [l]);
  return (
    <tr className="border-t border-white/10">
      <td className="py-4 pr-3 text-lg">{l.id}</td>
      <td className="py-4 pr-3">
        <InlineText value={name} onChange={setName} />
      </td>
      <td className="py-4 pr-3">
        <select
          className="bg-transparent border border-white/10 rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-white/20"
          value={tId}
          onChange={(e) => setTId(e.target.value)}
        >
          <option value="">— none —</option>
          {tournaments.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td className="py-4 pr-3">
        <InlineText value={bud} onChange={setBud} />
      </td>
      <td className="py-4 pr-3">
        <InlineText value={bad} onChange={setBad} />
      </td>
      <td className="py-4 pr-3">
        <InlineText value={lock} onChange={setLock} />
      </td>
      <td className="py-4 pr-3">
        <div className="flex gap-2">
          <Button
            onClick={() =>
              onSave(l.id, {
                name,
                tournament: tId ? Number(tId) : null,
                budget: Number(bud || 0),
                max_badges: Number(bad || 0),
                lock_policy: lock,
              })
            }
          >
            Save
          </Button>
          <Button variant="ghost" onClick={() => onDelete(l.id, `Delete league "${l.name}"?`)}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* ================== MODALS ================== */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[96vw] max-w-[1700px] max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="text-2xl font-semibold">{title}</div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-3xl">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateMatchModal({
  onClose,
  tOpts,
  matchTeamOpts,
  mTid,
  setMTid,
  mTeam1,
  setMTeam1,
  mTeam2,
  setMTeam2,
  mBo,
  setMBo,
  mStart,
  setMStart,
  createMatch,
  afterCreate,
}) {
  const [localMsg, setLocalMsg] = useState("");

  return (
    <Modal title="Create Match" onClose={onClose}>
      <div className="grid gap-5">
        <div className="grid lg:grid-cols-2 gap-5">
          <ComboSelect
            label="Tournament"
            value={mTid}
            onChange={setMTid}
            options={tOpts}
            pageSize={12}
            searchPlaceholder="Search tournament..."
          />
          <Input label="Start time (YYYY-MM-DDTHH:mm)" value={mStart} onChange={setMStart} />
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <ComboSelect
            label="Team 1"
            value={mTeam1}
            onChange={setMTeam1}
            options={matchTeamOpts}
            pageSize={12}
            searchPlaceholder="Search team..."
          />
          <ComboSelect
            label="Team 2"
            value={mTeam2}
            onChange={setMTeam2}
            options={matchTeamOpts}
            pageSize={12}
            searchPlaceholder="Search team..."
          />
        </div>

        <label className="block space-y-2">
          <div className="text-lg text-zinc-300">BO</div>
          <select
            value={mBo}
            onChange={(e) => setMBo(e.target.value)}
            className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-5 py-4 text-lg text-white outline-none focus:ring-2 focus:ring-white/30"
          >
            <option value="1">BO1</option>
            <option value="3">BO3</option>
            <option value="5">BO5</option>
          </select>
        </label>

        <div className="flex gap-2">
          <Button
            onClick={async () => {
              setLocalMsg("");
              try {
                await createMatch();
                if (afterCreate) await afterCreate();
                onClose();
              } catch (e) {
                setLocalMsg(String(e.message || e));
              }
            }}
          >
            Create
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>

        {localMsg && <Note className="text-red-400">{localMsg}</Note>}
      </div>
    </Modal>
  );
}

const EDITABLE_FIELDS = [
  "kills",
  "deaths",
  "assists",
  "hs",
  "adr",
  "rating2",
  "opening_kills",
  "opening_deaths",
  "flash_assists",
  "cl_1v2",
  "cl_1v3",
  "cl_1v4",
  "cl_1v5",
  "mk_3k",
  "mk_4k",
  "mk_5k",
  "utility_dmg",
];

function getId(x) {
  if (x == null) return null;
  if (typeof x === "number" || typeof x === "string") return Number(x);
  if (x?.id != null) return Number(x.id);
  if (x?.team_id != null) return Number(x.team_id);
  return null;
}
function getMapId(obj) {
  if (!obj) return null;
  return obj.id ?? obj.map_id ?? obj.pk ?? null;
}
function getMapLabel(obj) {
  return obj?.map_name || obj?.name || `#${getMapId(obj)}`;
}

function MatchDetailsModal({ matchId, onClose }) {
  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState(null);

  const [maps, setMaps] = useState([]);
  const [mapId, setMapId] = useState("");

  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);

  const [stats, setStats] = useState([]);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [newMapName, setNewMapName] = useState("");
  const [newMapIndex, setNewMapIndex] = useState("1");
  const [newT1, setNewT1] = useState("");
  const [newT2, setNewT2] = useState("");

  const [demoFile, setDemoFile] = useState(null);
  const [importingDemo, setImportingDemo] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    setDemoFile(null);
    setImportResult(null);
  }, [matchId]);

  async function loadAll(mid) {
    setLoading(true);
    setMsg("");
    try {
      const m = await apiGet(`/matches/${mid}/`);
      setMatch(m);

      const t1Id = getId(m.team1_id ?? m.team1);
      const t2Id = getId(m.team2_id ?? m.team2);

      const ms = await apiGet(`/maps?match=${mid}`);
      (ms || []).sort((a, b) => (a?.map_index ?? 0) - (b?.map_index ?? 0));
      setMaps(ms || []);
      setNewMapIndex(String((ms?.length || 0) + 1));

      const allPlayers = await apiGet(`/players`);

      const p1 = allPlayers.filter((p) => p.team === t1Id);
      const p2 = allPlayers.filter((p) => p.team === t2Id);

      setTeam1Players(p1 || []);
      setTeam2Players(p2 || []);

      const first = String(getMapId(ms?.[0]) || "");
      setMapId(first);
      setStats([]);
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(matchId);
  }, [matchId]);

  async function reloadMatchAndMaps(preferredMapId = null) {
    const m = await apiGet(`/matches/${matchId}/`);
    setMatch(m);

    const ms = await apiGet(`/maps?match=${matchId}`);
    (ms || []).sort((a, b) => (a?.map_index ?? 0) - (b?.map_index ?? 0));
    setMaps(ms || []);
    setNewMapIndex(String((ms?.length || 0) + 1));

    const ids = new Set((ms || []).map((x) => String(getMapId(x))));
    const pref = preferredMapId != null ? String(preferredMapId) : "";
    const cur = mapId ? String(mapId) : "";
    const next =
      pref && ids.has(pref) ? pref : cur && ids.has(cur) ? cur : String(getMapId(ms?.[0]) || "");

    if (next) setMapId(next);
    else setMapId(""); // ✅ ensure cleared when last map deleted
  }

  async function createMap() {
    setMsg("");
    if (!newMapName || !newMapIndex) return setMsg("Map: name & index required");
    try {
      await apiPost(`/maps/`, {
        match: Number(matchId),
        map_name: newMapName,
        map_index: Number(newMapIndex),
        team1_score: newT1 === "" ? null : Number(newT1),
        team2_score: newT2 === "" ? null : Number(newT2),
      });
      setNewMapName("");
      setNewT1("");
      setNewT2("");
      await reloadMatchAndMaps();
      setMsg("Map created");
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function patchMap(mapObj, body) {
    setMsg("");
    try {
      await apiPatch(`/maps/${getMapId(mapObj)}/`, body);
      await reloadMatchAndMaps();
      setMsg("Map saved");
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function deleteMap(mapObj) {
    setMsg("");
    const delId = String(getMapId(mapObj) || "");
    try {
      // ✅ optimistic UI update (no hard refresh needed)
      setMaps((prev) => (prev || []).filter((x) => String(getMapId(x)) !== delId));
      if (String(mapId) === delId) {
        setStats([]);
        setMapId("");
      }

      await apiDelete(`/maps/${getMapId(mapObj)}/`);

      // ✅ pick next map immediately
      const remaining = (maps || []).filter((x) => String(getMapId(x)) !== delId);
      const next = String(getMapId(remaining?.[0]) || "");
      await reloadMatchAndMaps(next || null);

      setMsg("Map deleted");
    } catch (e) {
      // if optimistic update got out of sync, hard reload state for correctness
      try {
        await reloadMatchAndMaps();
      } catch {}
      setMsg(String(e.message || e));
    }
  }

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
      const base =
        existing || {
          id: null,
          map: mapId ? Number(mapId) : null,
          player: p.id,
          player_name: p.nickname,
          team_name: teamName,
        };
      for (const k of EDITABLE_FIELDS) if (!(k in base)) base[k] = base[k] ?? null;
      return { ...base, _player: p, _teamName: teamName, _teamId: teamId };
    }

    const srcT1 = team1Players || [];
    const srcT2 = team2Players || [];

    const t1Rows = srcT1
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
      .map((p) => makeRowFromPlayer(p, t1n, t1id))
      .sort((a, b) => (a._player?.nickname || "").localeCompare(b._player?.nickname || ""));

    const t2Rows = srcT2
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
      .map((p) => makeRowFromPlayer(p, t2n, t2id))
      .sort((a, b) => (a._player?.nickname || "").localeCompare(b._player?.nickname || ""));

    return { team1Name: t1n, team2Name: t2n, team1: t1Rows, team2: t2Rows };
  }, [stats, team1Players, team2Players, mapId, match]);

  function updateCell(_which, idx, key, value, isTeam2 = false) {
    const cloned = {
      team1: [...rows.team1],
      team2: [...rows.team2],
      team1Name: rows.team1Name,
      team2Name: rows.team2Name,
    };
    const arr = isTeam2 ? cloned.team2 : cloned.team1;
    const v = value === "" ? null : isNaN(Number(value)) ? value : Number(value);
    arr[idx] = { ...arr[idx], [key]: v };
    const merged = [...cloned.team1, ...cloned.team2].map((r) => {
      const obj = {};
      for (const k of Object.keys(r)) obj[k] = r[k];
      return obj;
    });
    setStats(merged);
  }

  async function saveRow(s) {
    try {
      const body = {};
      for (const k of EDITABLE_FIELDS) if (k in s) body[k] = s[k];
      body.map = Number(mapId);
      body.player = getId(s.player ?? s._player?.id ?? s.player_id);

      if (s.id) {
        await apiPatch(`/player-map-stats/${s.id}/`, body);
      } else {
        const created = await apiPost(`/player-map-stats/`, body);
        setStats((prev) => prev.map((x) => (x === s ? created : x)));
      }

      await adminRecalculate("map", Number(mapId));

      const st = await apiGet(`/player-map-stats?map=${mapId}`);
      setStats(Array.isArray(st) ? st : []);
      setMsg("Saved");
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function saveAll() {
    setSaving(true);
    setMsg("");
    try {
      for (const s of [...rows.team1, ...rows.team2]) {
        const body = {};
        for (const k of EDITABLE_FIELDS) if (k in s) body[k] = s[k];
        body.map = Number(mapId);
        body.player = getId(s.player ?? s._player?.id ?? s.player_id);

        if (s.id) await apiPatch(`/player-map-stats/${s.id}/`, body);
        else await apiPost(`/player-map-stats/`, body);
      }

      await adminRecalculate("map", Number(mapId));

      const st = await apiGet(`/player-map-stats?map=${mapId}`);
      setStats(st);
      setMsg("All rows saved");
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function importDemo(createMapIfMissing = false) {
    setMsg("");
    setImportResult(null);

    if (!demoFile) return setMsg("Choose .dem file");
    if (!mapId && !createMapIfMissing) return setMsg("Select a map (or use Import + create map)");

    setImportingDemo(true);
    try {
      const fd = new FormData();
      fd.append("match_id", String(matchId));

      if (!createMapIfMissing && mapId) {
        fd.append("map_id", String(mapId));
      }

      fd.append("create_map_if_missing", createMapIfMissing ? "1" : "0");
      fd.append("demo", demoFile);

      const res = await apiPostForm(`/admin/import-demo`, fd);
      setImportResult(res);

      const newMapId = String(res?.map_id || mapId || "");
      await reloadMatchAndMaps(newMapId);

      if (newMapId) {
        const st = await apiGet(`/player-map-stats?map=${newMapId}`);
        setStats(Array.isArray(st) ? st : []);
        await adminRecalculate("map", Number(newMapId));
        const st2 = await apiGet(`/player-map-stats?map=${newMapId}`);
        setStats(Array.isArray(st2) ? st2 : []);
      }

      setMsg("Imported from demo");
    } catch (e) {
      setMsg(String(e.message || e));
    } finally {
      setImportingDemo(false);
    }
  }

  return (
    <Modal
      title={match ? `Match #${match.id} — ${match.team1_name} vs ${match.team2_name}` : `Match #${matchId}`}
      onClose={onClose}
    >
      {loading ? (
        <Note>Loading…</Note>
      ) : (
        <div className="grid gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="font-semibold text-xl">
                Match winner: <span className="text-zinc-300">{match?.winner_name || match?.winner || "—"}</span>
              </div>
              <div className="text-lg text-zinc-300">
                {match?.team1_name} vs {match?.team2_name} • BO{match?.bo}
              </div>
            </div>

            <div className="mt-5 grid md:grid-cols-5 gap-5">
              <Input label="Map name" value={newMapName} onChange={setNewMapName} placeholder="mirage" />
              <Input label="Index" value={newMapIndex} onChange={setNewMapIndex} />
              <Input label={`${match?.team1_name || "Team1"} score`} value={newT1} onChange={setNewT1} />
              <Input label={`${match?.team2_name || "Team2"} score`} value={newT2} onChange={setNewT2} />
              <div className="flex items-end">
                <Button onClick={createMap} className="w-full">
                  Add map
                </Button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-lg">
                <thead className="text-left text-zinc-300">
                  <tr>
                    <th className="py-4 pr-3">#</th>
                    <th className="py-4 pr-3">Map</th>
                    <th className="py-4 pr-3">T1</th>
                    <th className="py-4 pr-3">T2</th>
                    <th className="py-4 pr-3">Winner</th>
                    <th className="py-4 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(maps || []).map((mp) => {
                    const mpId = getMapId(mp);
                    const winnerLabel =
                      mp?.winner_name ||
                      (mp?.winner === (match?.team1_id || match?.team1)
                        ? match?.team1_name
                        : mp?.winner === (match?.team2_id || match?.team2)
                        ? match?.team2_name
                        : mp?.winner || "—");

                    return (
                      <tr key={String(mpId)} className="border-t border-white/10">
                        <td className="py-4 pr-3 w-28">
                          <StatNumber
                            value={mp.map_index}
                            onChange={(v) => patchMap(mp, { map_index: v === "" ? null : Number(v) })}
                          />
                        </td>
                        <td className="py-4 pr-3">
                          <InlineText value={mp.map_name || ""} onChange={(v) => patchMap(mp, { map_name: v })} />
                        </td>
                        <td className="py-4 pr-3 w-32">
                          <StatNumber
                            value={mp.team1_score}
                            onChange={(v) => patchMap(mp, { team1_score: v === "" ? null : Number(v) })}
                          />
                        </td>
                        <td className="py-4 pr-3 w-32">
                          <StatNumber
                            value={mp.team2_score}
                            onChange={(v) => patchMap(mp, { team2_score: v === "" ? null : Number(v) })}
                          />
                        </td>
                        <td className="py-4 pr-3">{winnerLabel}</td>
                        <td className="py-4 pr-3">
                          <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setMapId(String(mpId))}>
                              Open stats
                            </Button>
                            <Button variant="ghost" onClick={() => deleteMap(mp)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!maps?.length && (
                    <tr>
                      <td className="py-5 text-zinc-400" colSpan={7}>
                        No maps yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid md:grid-cols-3 gap-5 items-end">
              <label className="block space-y-2">
                <div className="text-lg text-zinc-300">DEMO file (.dem)</div>
                <input
                  type="file"
                  accept=".dem"
                  onChange={(e) => setDemoFile(e.target.files?.[0] || null)}
                  className="w-full text-lg"
                />
              </label>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => importDemo(false)} disabled={importingDemo || !demoFile || !mapId}>
                  {importingDemo ? "Importing…" : "Import → selected map"}
                </Button>

                <Button variant="ghost" onClick={() => importDemo(true)} disabled={importingDemo || !demoFile}>
                  {importingDemo ? "Importing…" : "Import + create map"}
                </Button>
              </div>

              <div className="text-lg text-zinc-300">Selected map: {mapId ? `#${mapId}` : "—"}</div>

              {importResult?.parsed?.team_score && (
                <div className="md:col-span-3 rounded-2xl border border-white/10 bg-white/5 p-5 text-lg">
                  <div className="font-semibold mb-2">Parsed score</div>
                  <div className="text-zinc-300">
                    {Object.entries(importResult.parsed.team_score)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" • ")}
                  </div>
                  <div className="text-zinc-400 mt-2">Winner: {importResult.parsed.winner_team || "—"}</div>
                  {!!importResult?.warnings?.length && (
                    <div className="text-yellow-300 mt-3">{importResult.warnings.join(" | ")}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg text-zinc-300">Maps:</span>
            {maps.map((mp) => {
              const id = String(getMapId(mp));
              return (
                <button
                  key={id}
                  onClick={() => setMapId(id)}
                  className={`px-5 py-3 rounded-xl border text-lg transition ${
                    id === String(mapId) ? "bg-white text-black border-white" : "border-white/20 hover:bg-white/10"
                  }`}
                  title={getMapLabel(mp)}
                >
                  {getMapLabel(mp)}
                </button>
              );
            })}
            {!maps.length && <Note>No maps.</Note>}
            <div className="ml-auto">
              <Button onClick={saveAll} disabled={saving || !(rows.team1.length + rows.team2.length)}>
                {saving ? "Saving…" : "Save all"}
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-6 py-4 font-semibold text-xl bg-white/5">{rows.team1Name}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-lg">
                <thead className="text-left text-zinc-300">
                  <tr>
                    <th className="py-4 pr-3">Player</th>
                    {EDITABLE_FIELDS.map((k) => (
                      <th key={k} className="py-4 pr-3">
                        {k.toUpperCase()}
                      </th>
                    ))}
                    <th className="py-4 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.team1.map((s, i) => (
                    <tr key={`${s._player?.id ?? s.player}-${i}`} className="border-t border-white/10">
                      <td className="py-4 pr-3">{s._player?.nickname ?? s.player_name ?? s.player}</td>
                      {EDITABLE_FIELDS.map((k) => (
                        <td key={k} className="py-4 pr-3">
                          <StatNumber value={s[k]} onChange={(v) => updateCell("team1", i, k, v, false)} />
                        </td>
                      ))}
                      <td className="py-4 pr-3">
                        <Button onClick={() => saveRow(s)}>Save</Button>
                      </td>
                    </tr>
                  ))}
                  {!rows.team1.length && (
                    <tr>
                      <td className="py-5 text-zinc-400" colSpan={EDITABLE_FIELDS.length + 2}>
                        No players
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-6 py-4 font-semibold text-xl bg-white/5">{rows.team2Name}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-lg">
                <thead className="text-left text-zinc-300">
                  <tr>
                    <th className="py-4 pr-3">Player</th>
                    {EDITABLE_FIELDS.map((k) => (
                      <th key={k} className="py-4 pr-3">
                        {k.toUpperCase()}
                      </th>
                    ))}
                    <th className="py-4 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.team2.map((s, i) => (
                    <tr key={`${s._player?.id ?? s.player}-${i}`} className="border-t border-white/10">
                      <td className="py-4 pr-3">{s._player?.nickname ?? s.player_name ?? s.player}</td>
                      {EDITABLE_FIELDS.map((k) => (
                        <td key={k} className="py-4 pr-3">
                          <StatNumber value={s[k]} onChange={(v) => updateCell("team2", i, k, v, true)} />
                        </td>
                      ))}
                      <td className="py-4 pr-3">
                        <Button onClick={() => saveRow(s)}>Save</Button>
                      </td>
                    </tr>
                  ))}
                  {!rows.team2.length && (
                    <tr>
                      <td className="py-5 text-zinc-400" colSpan={EDITABLE_FIELDS.length + 2}>
                        No players
                      </td>
                    </tr>
                  )}
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

  const PAGE_SIZE = 10;
  const ML_PAGE_SIZE = 10;

  const [tournaments, setTournaments] = useState([]);

  // ✅ toast state (used by matches delete + analytics errors)
  const [toast, setToast] = useState(null);

  // Tournament analytics (admin)
  const [analyticsTournamentId, setAnalyticsTournamentId] = useState("");
  const [topPlayers, setTopPlayers] = useState([]);
  const [topRoles, setTopRoles] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [mapPointsMapId, setMapPointsMapId] = useState("");
  const [mapPointsRows, setMapPointsRows] = useState([]);
  const [mapPointsLoading, setMapPointsLoading] = useState(false);

  const [leagues, setLeagues] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [tournamentTeams, setTournamentTeams] = useState([]);

  const [tid, setTid] = useState("");
  const [budget, setBudget] = useState("1000000");
  const [slots, setSlots] = useState("5");
  const [marketMsg, setMarketMsg] = useState("");

  // manual market price editor
  const [marketTournamentId, setMarketTournamentId] = useState("");
  const [marketRows, setMarketRows] = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [marketEdits, setMarketEdits] = useState({});

  const [marketQuery, setMarketQuery] = useState("");
  const [marketTeamId, setMarketTeamId] = useState("");

  const [tName, setTName] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  const [ttTeam, setTtTeam] = useState("");
  const [ttTournament, setTtTournament] = useState("");

  const [teamName, setTeamName] = useState("");
  const [teamRank, setTeamRank] = useState("");
  const [teamRegionCode, setTeamRegionCode] = useState("");
  const [teamRegionName, setTeamRegionName] = useState("");
  const [ltTeam, setLtTeam] = useState("");
  const [ltTournament, setLtTournament] = useState("");

  const [playerNickname, setPlayerNickname] = useState("");
  const [playerTeam, setPlayerTeam] = useState("");
  const [playerCountryCode, setPlayerCountryCode] = useState("");
  const [playerCountryName, setPlayerCountryName] = useState("");
  const [lpPlayer, setLpPlayer] = useState("");
  const [lpTeam, setLpTeam] = useState("");

  const [leagueName, setLeagueName] = useState("");
  const [leagueTid, setLeagueTid] = useState("");
  const [leagueBudget, setLeagueBudget] = useState("1000000");
  const [leagueBadges, setLeagueBadges] = useState("0");
  const [leagueLock, setLeagueLock] = useState("soft");
  const [llLeague, setLlLeague] = useState("");
  const [llTournament, setLlTournament] = useState("");

  const [mTid, setMTid] = useState("");
  const [mTeam1, setMTeam1] = useState("");
  const [mTeam2, setMTeam2] = useState("");
  const [mStart, setMStart] = useState("");
  const [mBo, setMBo] = useState("3");

  const [mlTournament, setMlTournament] = useState("");
  const [mlQuery, setMlQuery] = useState("");
  const [mlMatches, setMlMatches] = useState([]);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlErr, setMlErr] = useState("");
  const [openMatchId, setOpenMatchId] = useState(null);

  const [mlPage, setMlPage] = useState(1);

  const [showCreateMatch, setShowCreateMatch] = useState(false);

  const [hltvInput, setHltvInput] = useState("");
  const [hltvMsg, setHltvMsg] = useState("");
  const [hltvLoading, setHltvLoading] = useState(false);

  const [qT, setQT] = useState("");
  const [qTm, setQTm] = useState("");
  const [qP, setQP] = useState("");
  const [qL, setQL] = useState("");

  const [pageT, setPageT] = useState(1);
  const [pageTm, setPageTm] = useState(1);
  const [pageP, setPageP] = useState(1);
  const [pageL, setPageL] = useState(1);

  const { capture, restore } = usePreserveScroll();
  const setLpPlayerNoJump = useMemo(() => preserveSetter(setLpPlayer, capture, restore), [capture, restore]);
  const setLpTeamNoJump = useMemo(() => preserveSetter(setLpTeam, capture, restore), [capture, restore]);

  useEffect(() => {
    if (!getToken()) {
      nav("/");
      return;
    }
    apiGet("/auth/me")
      .then((u) => {
        if (!u?.is_staff) {
          clearToken();
          nav("/");
          return;
        }
        setMe(u);
        refreshAll();
      })
      .catch(() => {
        clearToken();
        nav("/");
      });
  }, []);

  async function refreshAll() {
    const [ts, tm, ps, ls, tts] = await Promise.all([
      apiGet("/tournaments", false),
      apiGet("/teams", false),
      apiGet("/players", false),
      apiGet("/leagues", false),
      apiGet("/tournament-teams", false),
    ]);
    setTournaments(ts);
    setTeams(tm);
    setPlayers(ps);
    setLeagues(ls);
    setTournamentTeams(tts);
  }

  const tOpts = useMemo(
    () => [{ value: "", label: "— choose tournament —" }, ...tournaments.map((t) => ({ value: String(t.id), label: t.name }))],
    [tournaments]
  );
  const teamOpts = useMemo(
    () => [{ value: "", label: "— choose team —" }, ...teams.map((t) => ({ value: String(t.id), label: t.name }))],
    [teams]
  );
  const countryOpts = useMemo(
    () => [{ value: "", label: "— choose country —" }, ...COUNTRIES.filter((c) => c.code !== "").map((c) => ({ value: c.code, label: c.name }))],
    []
  );

  const playerOpts = useMemo(
    () => [{ value: "", label: "— choose player —" }, ...players.map((p) => ({ value: String(p.id), label: p.nickname }))],
    [players]
  );

  const playersById = useMemo(() => {
    const m = {};
    for (const p of players) m[String(p.id)] = p;
    return m;
  }, [players]);

  const teamsById = useMemo(() => {
    const m = {};
    for (const t of teams) m[String(t.id)] = t;
    return m;
  }, [teams]);

  const marketTeamOpts = useMemo(() => {
    if (!marketTournamentId) return teamOpts;

    const ids = new Set(
      (tournamentTeams || [])
        .filter((tt) => String(tt.tournament ?? tt.tournament_id) === String(marketTournamentId))
        .map((tt) => String(tt.team ?? tt.team_id))
        .filter(Boolean)
    );

    const out = [{ value: "", label: "— all teams —" }];
    for (const id of ids) {
      const team = teamsById[id];
      out.push({ value: id, label: team?.name || `Team ${id}` });
    }
    return out;
  }, [marketTournamentId, tournamentTeams, teamOpts, teamsById]);

  const filteredMarketRows = useMemo(() => {
    const q = marketQuery.trim().toLowerCase();

    return (marketRows || []).filter((row) => {
      const pid = row.player_id ?? row.player ?? row.player?.id;
      const player = pid != null ? playersById[String(pid)] : null;

      const tid =
        (player ? (player.team_id ?? player.team ?? player.team?.id) : null) ??
        (row.team_id ?? row.team ?? row.team?.id);

      if (marketTeamId && String(tid || "") !== String(marketTeamId)) return false;

      if (!q) return true;

      const pName = (row.player_nickname || row.nickname || row.player_name || player?.nickname || player?.name || player?.full_name || "")
        .toLowerCase();

      const tName = (row.team_name || (tid != null ? (teamsById[String(tid)]?.name || "") : "")).toLowerCase();

      return pName.includes(q) || tName.includes(q);
    });
  }, [marketRows, marketQuery, marketTeamId, playersById, teamsById]);

  const leagueOpts = useMemo(
    () => [{ value: "", label: "— choose league —" }, ...leagues.map((l) => ({ value: String(l.id), label: l.name }))],
    [leagues]
  );

  const leaguesByT = useMemo(() => {
    const by = {};
    for (const l of leagues) (by[String(l.tournament)] ||= []).push(l);
    return by;
  }, [leagues]);

  const tournamentTeamsByTournament = useMemo(() => {
    const by = {};
    for (const tt of tournamentTeams || []) {
      const tid = String(tt.tournament);
      if (!by[tid]) by[tid] = [];
      by[tid].push(Number(tt.team));
    }
    return by;
  }, [tournamentTeams]);

  const matchTeamOpts = useMemo(() => {
    if (!mTid) return teamOpts;
    const teamIds = tournamentTeamsByTournament[String(mTid)] || [];
    const idSet = new Set(teamIds.map(Number));
    const list = teams.filter((t) => idSet.has(Number(t.id))).map((t) => ({ value: String(t.id), label: t.name }));
    return [{ value: "", label: "— choose team —" }, ...list];
  }, [mTid, tournamentTeamsByTournament, teams, teamOpts]);

  useEffect(() => {
    setMTeam1("");
    setMTeam2("");
  }, [mTid]);

  const filteredTournaments = useMemo(
    () => tournaments.filter((t) => (t.name || "").toLowerCase().includes(qT.toLowerCase())),
    [tournaments, qT]
  );
  const filteredTeams = useMemo(() => teams.filter((t) => (t.name || "").toLowerCase().includes(qTm.toLowerCase())), [teams, qTm]);
  const filteredPlayers = useMemo(
    () => players.filter((p) => (p.nickname || "").toLowerCase().includes(qP.toLowerCase())),
    [players, qP]
  );
  const filteredLeagues = useMemo(
    () => leagues.filter((l) => (l.name || "").toLowerCase().includes(qL.toLowerCase())),
    [leagues, qL]
  );

  const totalTPages = Math.max(1, Math.ceil(filteredTournaments.length / PAGE_SIZE));
  const totalTeamPages = Math.max(1, Math.ceil(filteredTeams.length / PAGE_SIZE));
  const totalPlayerPages = Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE));
  const totalLeaguePages = Math.max(1, Math.ceil(filteredLeagues.length / PAGE_SIZE));

  useEffect(() => {
    setPageT(1);
  }, [qT]);
  useEffect(() => {
    setPageTm(1);
  }, [qTm]);
  useEffect(() => {
    setPageP(1);
  }, [qP]);
  useEffect(() => {
    setPageL(1);
  }, [qL]);

  const paginatedTournaments = useMemo(() => {
    const start = (pageT - 1) * PAGE_SIZE;
    return filteredTournaments.slice(start, start + PAGE_SIZE);
  }, [filteredTournaments, pageT]);

  const paginatedTeams = useMemo(() => {
    const start = (pageTm - 1) * PAGE_SIZE;
    return filteredTeams.slice(start, start + PAGE_SIZE);
  }, [filteredTeams, pageTm]);

  const paginatedPlayers = useMemo(() => {
    const start = (pageP - 1) * PAGE_SIZE;
    return filteredPlayers.slice(start, start + PAGE_SIZE);
  }, [filteredPlayers, pageP]);

  const paginatedLeagues = useMemo(() => {
    const start = (pageL - 1) * PAGE_SIZE;
    return filteredLeagues.slice(start, start + PAGE_SIZE);
  }, [filteredLeagues, pageL]);

  async function generateMarket() {
    setMarketMsg("");
    if (!tid) return setMarketMsg("Choose tournament");
    try {
      await apiPost("/market/generate", { tournament: Number(tid), budget: Number(budget), slots: Number(slots) });
      setMarketMsg("Market generated");
    } catch (e) {
      setMarketMsg(String(e.message || e));
    }
  }

  async function loadMarketPrices(tournamentId) {
    if (!tournamentId) {
      setMarketRows([]);
      setMarketEdits({});
      return;
    }
    setMarketLoading(true);
    setMarketError("");
    try {
      const rows = await apiGet(`/market/?tournament=${Number(tournamentId)}`);
      setMarketRows(Array.isArray(rows) ? rows : []);

      const nextEdits = {};
      (Array.isArray(rows) ? rows : []).forEach((r) => {
        const id = r?.id;
        const v = r?.price ?? r?.value ?? r?.amount ?? r?.player_price;
        if (id != null) nextEdits[id] = v != null ? String(v) : "";
      });
      setMarketEdits(nextEdits);
    } catch (e) {
      setMarketError(String(e.message || e));
      setMarketRows([]);
      setMarketEdits({});
    } finally {
      setMarketLoading(false);
    }
  }

  useEffect(() => {
    loadMarketPrices(marketTournamentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketTournamentId]);

  async function saveMarketPrice(priceId) {
    setMarketMsg("");
    const raw = marketEdits[priceId];
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      setMarketMsg("Invalid price");
      return;
    }
    try {
      const updated = await apiPatch(`/market/${priceId}/`, { price: num });
      setMarketRows((prev) => prev.map((r) => (r.id === priceId ? { ...r, ...updated } : r)));
      setMarketMsg("Saved");
    } catch (e) {
      setMarketMsg(String(e.message || e));
    }
  }

  const [msg, setMsg] = useState("");

  async function createTournament() {
    setMsg("");
    if (!tName) return setMsg("Tournament: name required");
    try {
      await apiPost("/tournaments/", { name: tName, start_date: tStart || null, end_date: tEnd || null });
      setMsg("Tournament created");
      setTName("");
      setTStart("");
      setTEnd("");
      await refreshAll();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }
  async function linkTeamToTournament_tt() {
    setMsg("");
    if (!ttTeam || !ttTournament) return setMsg("Choose team & tournament");
    try {
      await apiPost("/tournament-teams/", { team: Number(ttTeam), tournament: Number(ttTournament) });
      setMsg("Team linked to tournament");
      setTtTeam("");
      setTtTournament("");
      await refreshAll(); // ✅ keep UI in sync
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }
  async function createMatch() {
    setMsg("");
    if (!mTid || !mTeam1 || !mTeam2) throw new Error("Match: tournament, team1, team2 required");
    const res = await apiPost("/matches/", {
      tournament: Number(mTid),
      team1: Number(mTeam1),
      team2: Number(mTeam2),
      start_time: mStart || null,
      bo: Number(mBo || 3),
    });
    setMsg("Match created");
    setMTid("");
    setMTeam1("");
    setMTeam2("");
    setMStart("");
    setMBo("3");
    return res;
  }

  async function loadTournamentAnalytics() {
    const tid = String(analyticsTournamentId || "").trim();
    if (!tid) return;

    setAnalyticsLoading(true);
    try {
      const [playersRes, rolesRes] = await Promise.all([
        apiGet(`/tournaments/${tid}/top-players/`),
        apiGet(`/tournaments/${tid}/top-roles/`),
      ]);

      setTopPlayers(playersRes?.top_players || []);
      setTopRoles(rolesRes?.top_roles || []);
    } catch (e) {
      console.error(e);
      setTopPlayers([]);
      setTopRoles([]);
      setToast({ type: "error", message: "Failed to load tournament analytics" });
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function loadFantasyPointsByMap() {
    const mid = String(mapPointsMapId || "").trim();
    if (!mid) return;

    setMapPointsLoading(true);
    try {
      const rows = await apiGet(`/fantasy-points-by-map/?map=${encodeURIComponent(mid)}`);
      setMapPointsRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error(e);
      setMapPointsRows([]);
      setToast({ type: "error", message: "Failed to load fantasy points by map" });
    } finally {
      setMapPointsLoading(false);
    }
  }

  async function createTeam() {
    setMsg("");
    if (!teamName) return setMsg("Team: name required");
    try {
      await apiPost("/teams/", {
        name: teamName,
        world_rank: teamRank ? Number(teamRank) : null,
        region_code: teamRegionCode || null,
        region_name: teamRegionName || null,
      });
      setMsg("Team created");
      setTeamName("");
      setTeamRank("");
      setTeamRegionCode("");
      setTeamRegionName("");
      await refreshAll();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }
  async function linkTeamToTournament() {
    setMsg("");
    if (!ltTeam || !ltTournament) return setMsg("Choose team & tournament");
    try {
      await apiPost("/tournament-teams/", { team: Number(ltTeam), tournament: Number(ltTournament) });
      setMsg("Team linked to tournament");
      setLtTeam("");
      setLtTournament("");
      await refreshAll(); // ✅ keep UI in sync
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }
  async function createPlayer() {
    setMsg("");
    if (!playerNickname || !playerTeam) return setMsg("Player: nickname & team required");
    try {
      await apiPost("/players/", {
        nickname: playerNickname,
        team: Number(playerTeam),
        country_code: playerCountryCode || null,
        country_name: playerCountryName || null,
        nationality_code: playerCountryCode || null,
        nationality_name: playerCountryName || null,
      });
      setMsg("Player created");
      setPlayerNickname("");
      setPlayerTeam("");
      setPlayerCountryCode("");
      setPlayerCountryName("");
      await refreshAll();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }
  async function linkPlayerToTeam() {
    setMsg("");
    if (!lpPlayer || !lpTeam) return setMsg("Choose player & team");
    try {
      await apiPatch(`/players/${lpPlayer}/`, { team: Number(lpTeam) });
      setMsg("Player linked to team");
      setLpPlayer("");
      setLpTeam("");
      await refreshAll();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }
  async function createLeague() {
    setMsg("");
    if (!leagueName || !leagueTid) return setMsg("League: name & tournament required");
    try {
      await apiPost("/leagues/", {
        name: leagueName,
        tournament: Number(leagueTid),
        budget: Number(leagueBudget),
        max_badges: Number(leagueBadges),
        lock_policy: leagueLock || "soft",
      });
      setMsg("League created");
      setLeagueName("");
      setLeagueTid("");
      setLeagueBudget("1000000");
      setLeagueBadges("0");
      setLeagueLock("soft");
      await refreshAll();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }
  async function linkLeagueToTournament() {
    setMsg("");
    if (!llLeague || !llTournament) return setMsg("Choose league & tournament");
    try {
      await apiPatch(`/leagues/${llLeague}/`, { tournament: Number(llTournament) });
      setMsg("League linked to tournament");
      setLlLeague("");
      setLlTournament("");
      await refreshAll();
    } catch (e) {
      setMsg(String(e.message || e));
    }
  }

  async function importHLTV() {
    setHltvMsg("");
    if (!hltvInput) {
      setHltvMsg("Enter HLTV URL or ID");
      return;
    }
    const match = String(hltvInput).match(/(\d{3,})/);
    if (!match) {
      setHltvMsg("Could not parse HLTV tournament ID");
      return;
    }
    const hltvId = Number(match[1]);
    if (!hltvId || Number.isNaN(hltvId)) {
      setHltvMsg("Invalid HLTV ID");
      return;
    }
    try {
      setHltvLoading(true);
      const res = await apiPost("/hltv/import-tournament", { hltv_id: hltvId });
      const tName = res?.tournament?.name || res?.tournament_name || "";
      setHltvMsg(tName ? `Imported tournament: ${tName}` : "Import successful");
      setHltvInput("");
      await refreshAll();
    } catch (e) {
      setHltvMsg(String(e.message || e));
    } finally {
      setHltvLoading(false);
    }
  }

  async function saveRow(type, id, body) {
    await apiPatch(`/${type}/${id}/`, body);
    await refreshAll();
  }

  // ✅ immediate local removal (fixes "needs refresh") + then refreshAll for truth
  async function removeRow(type, id, text) {
    if (!window.confirm(text || "Delete?")) return;

    // optimistic UI remove
    if (type === "tournaments") setTournaments((prev) => (prev || []).filter((x) => String(x.id) !== String(id)));
    if (type === "teams") setTeams((prev) => (prev || []).filter((x) => String(x.id) !== String(id)));
    if (type === "players") setPlayers((prev) => (prev || []).filter((x) => String(x.id) !== String(id)));
    if (type === "leagues") setLeagues((prev) => (prev || []).filter((x) => String(x.id) !== String(id)));

    try {
      await apiDelete(`/${type}/${id}/`);
      await refreshAll();
    } catch (e) {
      // if something failed, reload everything back
      await refreshAll().catch(() => {});
      throw e;
    }
  }

  function extractTournamentId(m) {
    if (m.tournament_id != null) return m.tournament_id;
    if (typeof m.tournament === "number") return m.tournament;
    if (m.tournament && typeof m.tournament === "object" && m.tournament.id != null) return m.tournament.id;
    if (m.tournamentId != null) return m.tournamentId;
    return null;
  }

  async function loadMatchesForTournament() {
    setMlErr("");
    setMlLoading(true);
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
    } finally {
      setMlLoading(false);
    }
  }

  async function deleteMatch(matchId) {
    if (!matchId) return;
    const ok = window.confirm("Delete match? This will also remove its maps/stats if they are linked.");
    if (!ok) return;

    // optimistic UI remove
    setMlMatches((prev) => (prev || []).filter((m) => String(m.id) !== String(matchId)));

    try {
      await apiDelete(`/matches/${matchId}/`);
      await loadMatchesForTournament();
      if (String(openMatchId) === String(matchId)) setOpenMatchId(null);
      setToast({ type: "success", message: "Match deleted" });
    } catch (e) {
      await loadMatchesForTournament().catch(() => {});
      setToast({ type: "error", message: e?.message || "Delete failed" });
    }
  }

  useEffect(() => {
    if (!mlTournament) {
      setMlMatches([]);
      return;
    }
    loadMatchesForTournament();
  }, [mlTournament]);

  useEffect(() => {
    if (mlTournament) setMTid(String(mlTournament));
  }, [mlTournament]);

  const mlFiltered = useMemo(() => {
    if (!mlQuery) return mlMatches;
    const q = mlQuery.toLowerCase();
    return mlMatches.filter(
      (m) => (m.team1_name || "").toLowerCase().includes(q) || (m.team2_name || "").toLowerCase().includes(q)
    );
  }, [mlMatches, mlQuery]);

  useEffect(() => {
    setMlPage(1);
  }, [mlTournament, mlQuery]);

  const mlTotalPages = Math.max(1, Math.ceil(mlFiltered.length / ML_PAGE_SIZE));
  const mlPaginated = useMemo(() => {
    const start = (mlPage - 1) * ML_PAGE_SIZE;
    return mlFiltered.slice(start, start + ML_PAGE_SIZE);
  }, [mlFiltered, mlPage]);

  if (!me) return <div className="min-h-screen bg-black text-white p-10 text-lg">Loading…</div>;

  const tabBtn = (name) => (
    <button
      key={name}
      onClick={() => setTab(name)}
      className={`px-5 py-3 rounded-2xl border text-lg transition ${
        tab === name ? "bg-white text-black border-white" : "bg-transparent text-white border-white/20 hover:bg-white/10"
      }`}
    >
      {name.toUpperCase()}
    </button>
  );

  return (
    <div className="min-h-screen bg-black text-white p-10 text-lg">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur -m-10 mb-10">
        <div className="p-10 flex items-center justify-between">
          <Link to="/" className="text-2xl font-semibold tracking-wide">
            Fantasy CS2
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-lg text-zinc-300">{me.username} (admin)</span>
            <Link to="/" className="text-lg text-zinc-300 hover:text-white">
              Back
            </Link>
          </div>
        </div>
      </header>

      <main>
        <h1 className="text-5xl font-bold">Admin Tools</h1>

        <div className="mt-6 flex gap-2 flex-wrap">
          {["market", "lists", "tournament", "team", "player", "league", "matches", "hltv"].map(tabBtn)}
        </div>

        {/* MARKET */}
        {tab === "market" && (
          <div className="mt-10 grid md:grid-cols-2 gap-7">
            <Card title="Generate Market">
              <div className="grid gap-5">
                <ComboSelect
                  label="Tournament"
                  value={tid}
                  onChange={setTid}
                  options={tOpts}
                  pageSize={12}
                  searchPlaceholder="Search tournament..."
                />
                <div className="grid grid-cols-2 gap-5">
                  <Input label="Budget" value={budget} onChange={setBudget} />
                  <Input label="Slots" value={slots} onChange={setSlots} />
                </div>
                <Button onClick={generateMarket}>Generate</Button>
                {marketMsg && <Note>{marketMsg}</Note>}
              </div>
            </Card>
            <Card title="Leagues (by tournament)">
              {tid ? (
                <div className="space-y-3">
                  {(leaguesByT[String(tid)] || []).map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between rounded-2xl bg-white/5 px-5 py-4 border border-white/10"
                    >
                      <span className="text-lg">{l.name}</span>
                      <span className="text-lg text-zinc-300">budget: {l.budget}</span>
                    </div>
                  ))}
                  {(leaguesByT[String(tid)] || []).length === 0 && <p className="text-zinc-300 text-lg">No leagues.</p>}
                </div>
              ) : (
                <p className="text-zinc-300 text-lg">Choose tournament.</p>
              )}
            </Card>

            {/* manual price editor */}
            <div className="md:col-span-2">
              <Card title="Edit player prices">
                <div className="grid gap-5">
                  <ComboSelect
                    label="Tournament"
                    value={marketTournamentId}
                    onChange={setMarketTournamentId}
                    options={tOpts}
                    pageSize={12}
                    searchPlaceholder="Search tournament..."
                  />

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-400">Search</label>
                    <input
                      value={marketQuery}
                      onChange={(e) => setMarketQuery(e.target.value)}
                      placeholder="player or team..."
                      className="px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-700 text-slate-100 outline-none"
                    />
                  </div>

                  <ComboSelect
                    label="Team"
                    value={marketTeamId}
                    onChange={setMarketTeamId}
                    options={marketTeamOpts}
                    searchPlaceholder="Search team..."
                  />

                  {marketError && <Note>{marketError}</Note>}

                  {!marketTournamentId ? (
                    <p className="text-zinc-300 text-lg">Choose tournament.</p>
                  ) : marketLoading ? (
                    <p className="text-zinc-300 text-lg">Loading...</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-white/60">
                          <tr>
                            <th className="py-2 pr-3">Player</th>
                            <th className="py-2 pr-3">Team</th>
                            <th className="py-2 pr-3">Current price</th>
                            <th className="py-2 pr-3">New price</th>
                            <th className="py-2 pr-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMarketRows.map((row) => {
                            const pid = row.player_id ?? row.player ?? row.player?.id;
                            const player = pid != null ? playersById[String(pid)] : null;

                            const teamId =
                              (player ? (player.team_id ?? player.team ?? player.team?.id) : null) ??
                              (row.team_id ?? row.team ?? row.team?.id);

                            const team = teamId != null ? teamsById[String(teamId)] : null;

                            const name =
                              row.player_nickname ||
                              row.nickname ||
                              row.player_name ||
                              player?.nickname ||
                              player?.name ||
                              player?.full_name ||
                              (pid != null ? `Player ${pid}` : "#");

                            const teamName = row.team_name || team?.name || (teamId != null ? `Team ${teamId}` : "");
                            const current = row.price ?? row.value ?? row.amount ?? "";
                            const editVal = marketEdits[row.id] ?? String(current ?? "");

                            return (
                              <tr key={row.id} className="border-t border-white/10">
                                <td className="py-3 pr-3">{name}</td>
                                <td className="py-3 pr-3 text-white/70">{teamName}</td>
                                <td className="py-3 pr-3">{String(current)}</td>
                                <td className="py-3 pr-3">
                                  <input
                                    className="w-36 rounded-xl bg-white/5 border border-white/10 px-3 py-2"
                                    value={editVal}
                                    onChange={(e) => setMarketEdits((p) => ({ ...p, [row.id]: e.target.value }))}
                                  />
                                </td>
                                <td className="py-3 pr-3">
                                  <Button
                                    onClick={() => saveMarketPrice(row.id)}
                                    disabled={!String(editVal).trim() || Number.isNaN(Number(editVal))}
                                  >
                                    Save
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}

                          {marketRows.length === 0 && (
                            <tr>
                              <td className="py-4 text-zinc-300" colSpan={5}>
                                No market rows for this tournament.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* TOURNAMENT */}
        {tab === "tournament" && (
          <div className="mt-10 grid lg:grid-cols-2 gap-7">
            <Card title="Create Tournament">
              <div className="grid gap-5">
                <Input label="Name" value={tName} onChange={setTName} />
                <Input label="Start date (YYYY-MM-DD)" value={tStart} onChange={setTStart} />
                <Input label="End date (YYYY-MM-DD)" value={tEnd} onChange={setTEnd} />
                <Button onClick={createTournament}>Create Tournament</Button>
              </div>
            </Card>
            <Card title="Link Team → Tournament">
              <div className="grid gap-5">
                <ComboSelect
                  label="Team"
                  value={ttTeam}
                  onChange={setTtTeam}
                  options={teamOpts}
                  pageSize={12}
                  searchPlaceholder="Search team..."
                />
                <ComboSelect
                  label="Tournament"
                  value={ttTournament}
                  onChange={setTtTournament}
                  options={tOpts}
                  pageSize={12}
                  searchPlaceholder="Search tournament..."
                />
                <Button onClick={linkTeamToTournament_tt}>Link</Button>
              </div>
            </Card>
          </div>
        )}

        {/* TEAM */}
        {tab === "team" && (
          <div className="mt-10 grid lg:grid-cols-2 gap-7">
            <Card title="Create Team">
              <div className="grid gap-5">
                <Input label="Name" value={teamName} onChange={setTeamName} />
                <Input label="World rank (optional)" value={teamRank} onChange={setTeamRank} />
                <ComboSelect
                  label="Country"
                  value={teamRegionCode}
                  onChange={(v) => {
                    setTeamRegionCode(v);
                    const found = COUNTRIES.find((c) => c.code === v);
                    setTeamRegionName(found ? found.name : "");
                  }}
                  options={countryOpts}
                  pageSize={12}
                  searchPlaceholder="Search country..."
                />
                <Button onClick={createTeam}>Create Team</Button>
              </div>
            </Card>
            <Card title="Link Team → Tournament">
              <div className="grid gap-5">
                <ComboSelect
                  label="Team"
                  value={ltTeam}
                  onChange={setLtTeam}
                  options={teamOpts}
                  pageSize={12}
                  searchPlaceholder="Search team..."
                />
                <ComboSelect
                  label="Tournament"
                  value={ltTournament}
                  onChange={setLtTournament}
                  options={tOpts}
                  pageSize={12}
                  searchPlaceholder="Search tournament..."
                />
                <Button onClick={linkTeamToTournament}>Link</Button>
              </div>
            </Card>
          </div>
        )}

        {/* PLAYER */}
        {tab === "player" && (
          <div className="mt-10 grid lg:grid-cols-2 gap-7">
            <Card title="Create Player">
              <div className="grid gap-5">
                <Input label="Nickname" value={playerNickname} onChange={setPlayerNickname} />
                <ComboSelect
                  label="Team"
                  value={playerTeam}
                  onChange={setPlayerTeam}
                  options={teamOpts}
                  pageSize={12}
                  searchPlaceholder="Search team..."
                />
                <ComboSelect
                  label="Country (optional)"
                  value={playerCountryCode}
                  onChange={(v) => {
                    setPlayerCountryCode(v);
                    const found = COUNTRIES.find((c) => c.code === v);
                    setPlayerCountryName(found ? found.name : "");
                  }}
                  options={countryOpts}
                  pageSize={12}
                  searchPlaceholder="Search country..."
                />
                <Button onClick={createPlayer}>Create Player</Button>
              </div>
            </Card>
            <Card title="Link Player → Team (no jump)">
              <div className="grid gap-5">
                <ComboSelect
                  label="Player"
                  value={lpPlayer}
                  onChange={setLpPlayerNoJump}
                  options={playerOpts}
                  pageSize={12}
                  searchPlaceholder="Search player..."
                />
                <ComboSelect
                  label="Team"
                  value={lpTeam}
                  onChange={setLpTeamNoJump}
                  options={teamOpts}
                  pageSize={12}
                  searchPlaceholder="Search team..."
                />
                <Button onClick={linkPlayerToTeam}>Link</Button>
              </div>
            </Card>
          </div>
        )}

        {/* MATCHES */}
        {tab === "matches" && (
          <div className="mt-10 grid gap-7">
            <Card
              title="Matches by Tournament"
              action={
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" onClick={loadMatchesForTournament}>
                    Refresh
                  </Button>
                  <Button onClick={() => setShowCreateMatch(true)}>Create match</Button>
                </div>
              }
            >
              <div className="grid md:grid-cols-2 gap-5">
                <ComboSelect
                  label="Tournament"
                  value={mlTournament}
                  onChange={setMlTournament}
                  options={tOpts}
                  pageSize={12}
                  searchPlaceholder="Search tournament..."
                />
                <Input label="Search (team names)" value={mlQuery} onChange={setMlQuery} placeholder="NaVi, Vitality, etc." />
              </div>

              <div className="mt-6">
                {mlErr && <Note className="text-red-400">{mlErr}</Note>}
                {!mlErr && mlTournament && mlLoading && <Note>Loading matches…</Note>}
                {!mlErr && mlTournament && !mlLoading && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-lg">
                      <thead className="text-left text-zinc-300">
                        <tr>
                          <th className="py-4 pr-3">ID</th>
                          <th className="py-4 pr-3">Team 1</th>
                          <th className="py-4 pr-3">Team 2</th>
                          <th className="py-4 pr-3">Start</th>
                          <th className="py-4 pr-3">BO</th>
                          <th className="py-4 pr-3">Open</th>
                          <th className="py-4 pr-3">Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mlPaginated.map((m) => (
                          <tr key={m.id} className="border-t border-white/10">
                            <td className="py-4 pr-3">{m.id}</td>
                            <td className="py-4 pr-3">{m.team1_name}</td>
                            <td className="py-4 pr-3">{m.team2_name}</td>
                            <td className="py-4 pr-3">{m.start_time ? new Date(m.start_time).toLocaleString() : "—"}</td>
                            <td className="py-4 pr-3">BO{m.bo}</td>
                            <td className="py-4 pr-3">
                              <Button onClick={() => setOpenMatchId(m.id)}>Open</Button>
                            </td>
                            <td className="py-4 pr-3">
                              <Button onClick={() => deleteMatch(m.id)}>Delete</Button>
                            </td>
                          </tr>
                        ))}
                        {!mlPaginated.length && (
                          <tr>
                            <td className="py-5 text-zinc-400" colSpan={7}>
                              No matches found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {mlTotalPages > 1 && (
                      <div className="mt-4 flex items-center justify-between text-lg text-zinc-300">
                        <span>
                          Page {mlPage} of {mlTotalPages}
                        </span>
                        <div className="flex gap-2">
                          <Button variant="ghost" disabled={mlPage === 1} onClick={() => setMlPage((p) => Math.max(1, p - 1))}>
                            Prev
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={mlPage === mlTotalPages}
                            onClick={() => setMlPage((p) => Math.min(mlTotalPages, p + 1))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!mlTournament && <Note>Choose tournament to see matches.</Note>}
              </div>
            </Card>
          </div>
        )}

        {/* LISTS */}
        {tab === "lists" && (
          <div className="mt-10 space-y-10">
            <Card title="Tournaments">
              <div className="mb-5">
                <Input label="Search" value={qT} onChange={setQT} placeholder="name..." />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-lg">
                  <thead className="text-left text-zinc-300">
                    <tr>
                      <th className="py-4 pr-3">ID</th>
                      <th className="py-4 pr-3">Name</th>
                      <th className="py-4 pr-3">Start</th>
                      <th className="py-4 pr-3">End</th>
                      <th className="py-4 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTournaments.map((t) => (
                      <TournamentRow
                        key={t.id}
                        t={t}
                        onSave={(id, body) => saveRow("tournaments", id, body)}
                        onDelete={(id, text) => removeRow("tournaments", id, text)}
                      />
                    ))}
                    {filteredTournaments.length === 0 && (
                      <tr>
                        <td className="py-6 text-zinc-400" colSpan={5}>
                          No tournaments
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalTPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-lg text-zinc-300">
                  <span>
                    Page {pageT} of {totalTPages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={pageT === 1} onClick={() => setPageT((p) => Math.max(1, p - 1))}>
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pageT === totalTPages}
                      onClick={() => setPageT((p) => Math.min(totalTPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Teams">
              <div className="mb-5">
                <Input label="Search" value={qTm} onChange={setQTm} placeholder="name..." />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-lg">
                  <thead className="text-left text-zinc-300">
                    <tr>
                      <th className="py-4 pr-3">ID</th>
                      <th className="py-4 pr-3">Name</th>
                      <th className="py-4 pr-3">Rank</th>
                      <th className="py-4 pr-3">Country</th>
                      <th className="py-4 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedTeams.map((t) => (
                      <TeamRow
                        key={t.id}
                        t={t}
                        onSave={(id, body) => saveRow("teams", id, body)}
                        onDelete={(id, text) => removeRow("teams", id, text)}
                      />
                    ))}
                    {filteredTeams.length === 0 && (
                      <tr>
                        <td className="py-6 text-zinc-400" colSpan={5}>
                          No teams
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalTeamPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-lg text-zinc-300">
                  <span>
                    Page {pageTm} of {totalTeamPages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={pageTm === 1} onClick={() => setPageTm((p) => Math.max(1, p - 1))}>
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pageTm === totalTeamPages}
                      onClick={() => setPageTm((p) => Math.min(totalTeamPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Players">
              <div className="mb-5">
                <Input label="Search" value={qP} onChange={setQP} placeholder="nickname..." />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-lg">
                  <thead className="text-left text-zinc-300">
                    <tr>
                      <th className="py-4 pr-3">ID</th>
                      <th className="py-4 pr-3">Nickname</th>
                      <th className="py-4 pr-3">Team</th>
                      <th className="py-4 pr-3">Country</th>
                      <th className="py-4 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPlayers.map((p) => (
                      <PlayerRow
                        key={p.id}
                        p={p}
                        teams={teams}
                        onSave={(id, body) => saveRow("players", id, body)}
                        onDelete={(id, text) => removeRow("players", id, text)}
                      />
                    ))}
                    {filteredPlayers.length === 0 && (
                      <tr>
                        <td className="py-6 text-zinc-400" colSpan={5}>
                          No players
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalPlayerPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-lg text-zinc-300">
                  <span>
                    Page {pageP} of {totalPlayerPages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={pageP === 1} onClick={() => setPageP((p) => Math.max(1, p - 1))}>
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pageP === totalPlayerPages}
                      onClick={() => setPageP((p) => Math.min(totalPlayerPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <Card title="Leagues">
              <div className="mb-5">
                <Input label="Search" value={qL} onChange={setQL} placeholder="name..." />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-lg">
                  <thead className="text-left text-zinc-300">
                    <tr>
                      <th className="py-4 pr-3">ID</th>
                      <th className="py-4 pr-3">Name</th>
                      <th className="py-4 pr-3">Tournament</th>
                      <th className="py-4 pr-3">Budget</th>
                      <th className="py-4 pr-3">Lock</th>
                      <th className="py-4 pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLeagues.map((l) => (
                      <LeagueRow
                        key={l.id}
                        l={l}
                        tournaments={tournaments}
                        onSave={(id, body) => saveRow("leagues", id, body)}
                        onDelete={(id, text) => removeRow("leagues", id, text)}
                      />
                    ))}
                    {filteredLeagues.length === 0 && (
                      <tr>
                        <td className="py-6 text-zinc-400" colSpan={7}>
                          No leagues
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalLeaguePages > 1 && (
                <div className="mt-4 flex items-center justify-between text-lg text-zinc-300">
                  <span>
                    Page {pageL} of {totalLeaguePages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={pageL === 1} onClick={() => setPageL((p) => Math.max(1, p - 1))}>
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={pageL === totalLeaguePages}
                      onClick={() => setPageL((p) => Math.min(totalLeaguePages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* HLTV IMPORT */}
        {tab === "hltv" && (
          <div className="mt-10 grid lg:grid-cols-2 gap-7">
            <Card title="Import Tournament from HLTV">
              <div className="grid gap-5">
                <Input
                  label="HLTV URL or Tournament ID"
                  value={hltvInput}
                  onChange={setHltvInput}
                  placeholder="https://www.hltv.org/events/6990/... or 6990"
                />
                <Button onClick={importHLTV} disabled={hltvLoading}>
                  {hltvLoading ? "Importing…" : "Import tournament"}
                </Button>
                {hltvMsg && <Note>{hltvMsg}</Note>}
              </div>
            </Card>
            <Card title="What this does">
              <Note>Uses your HLTV scrapers on backend to import tournament, teams and players.</Note>
              <Note>Links teams to the tournament and creates a league: "Main league of &lt;Tournament&gt;".</Note>
            </Card>
          </div>
        )}

        {msg && tab !== "hltv" && <Note>{msg}</Note>}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />

      {openMatchId != null && <MatchDetailsModal matchId={openMatchId} onClose={() => setOpenMatchId(null)} />}

      {showCreateMatch && (
        <CreateMatchModal
          onClose={() => setShowCreateMatch(false)}
          tOpts={tOpts}
          matchTeamOpts={matchTeamOpts}
          mTid={mTid}
          setMTid={setMTid}
          mTeam1={mTeam1}
          setMTeam1={setMTeam1}
          mTeam2={mTeam2}
          setMTeam2={setMTeam2}
          mBo={mBo}
          setMBo={setMBo}
          mStart={mStart}
          setMStart={setMStart}
          createMatch={createMatch}
          afterCreate={loadMatchesForTournament}
        />
      )}
    </div>
  );
}
