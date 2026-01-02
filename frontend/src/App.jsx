import React, { useState, useEffect, useMemo } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import TournamentPage from "./pages/TournamentPage";
import DraftPage from "./pages/DraftPage";
import AdminPage from "./pages/AdminPage";

const BASE_URL = "http://localhost:8000/api";

// === utils ===
async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || JSON.stringify(data));
  return data;
}

async function apiGetPublic(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || `GET ${path}: ${res.status}`);
  return data;
}

function saveToken(token) {
  localStorage.setItem("access", token);
}
function getToken() {
  return localStorage.getItem("access");
}
function clearToken() {
  localStorage.removeItem("access");
}

// === ui primitives ===
function Button({ children, onClick, type = "button", variant = "primary", className = "", disabled }) {
  const styles =
    variant === "primary"
      ? "bg-white text-black hover:bg-zinc-200"
      : variant === "ghost"
      ? "bg-transparent text-white hover:bg-white/10"
      : "bg-zinc-700 text-white hover:bg-zinc-600";
  const dis = disabled ? "opacity-50 cursor-not-allowed" : "";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-7 py-3.5 text-[18px] rounded-2xl shadow-sm transition ${styles} ${dis} ${className}`}
    >
      {children}
    </button>
  );
}

function Input({ label, type = "text", value, onChange, placeholder, autoComplete }) {
  return (
    <label className="block space-y-2">
      <span className="text-[18px] text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-6 py-4 text-[18px] text-white outline-none focus:ring-2 focus:ring-white/30"
      />
    </label>
  );
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800 p-7 mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-3xl font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl">
            ✕
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-6">{footer}</div>}
      </div>
    </div>
  );
}

// === auth modal ===
function LoginModal({ open, onClose, onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin(e) {
    e?.preventDefault?.();
    setErr("");
    setLoading(true);
    try {
      const data = await apiPost("/auth/login", { username, password });
      saveToken(data.access);
      localStorage.setItem("username", username);
      onLoggedIn?.(data.access);
      onClose();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Login"
      footer={
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div className="space-x-3">
            <Link to="/register" onClick={onClose} className="text-[17px] text-zinc-300 hover:text-white">
              Create account
            </Link>
            <Button onClick={doLogin}>{loading ? "Logging in…" : "Login"}</Button>
          </div>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={doLogin}>
        <Input label="Username" value={username} onChange={setUsername} />
        <Input label="Password" type="password" value={password} onChange={setPassword} />
        {err && <p className="text-[17px] text-red-400">{err}</p>}
      </form>
    </Modal>
  );
}

// === registration ===
function RegisterPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  function setField(k, v) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await apiPost("/auth/register", form);
      setOk(true);
      setTimeout(() => nav("/"), 1200);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-12 text-[18px]">
      <header className="sticky top-0 z-40 bg-black/70 backdrop-blur border-b border-white/10 -m-12 mb-12">
        <div className="p-12 flex items-center justify-between">
          <Link to="/" className="text-2xl font-semibold">
            Fantasy CS2
          </Link>
          <Link to="/" className="text-[17px] text-zinc-300 hover:text-white">
            Back
          </Link>
        </div>
      </header>

      <main className="max-w-xl">
        <h1 className="text-5xl font-bold mb-7">Create your account</h1>
        <form onSubmit={submit} className="space-y-5">
          <Input label="Username" value={form.username} onChange={(v) => setField("username", v)} />
          <Input label="Email" value={form.email} onChange={(v) => setField("email", v)} type="email" />
          <div className="grid grid-cols-2 gap-5">
            <Input label="First name" value={form.first_name} onChange={(v) => setField("first_name", v)} />
            <Input label="Last name" value={form.last_name} onChange={(v) => setField("last_name", v)} />
          </div>
          <Input label="Password" type="password" value={form.password} onChange={(v) => setField("password", v)} />
          {err && <p className="text-[17px] text-red-400">{err}</p>}
          {ok && <p className="text-[17px] text-green-400">Registration successful</p>}
          <div className="flex items-center justify-end gap-3">
            <Link to="/" className="text-[17px] text-zinc-300 hover:text-white">
              Cancel
            </Link>
            <Button type="submit">{loading ? "Creating…" : "Create account"}</Button>
          </div>
        </form>
      </main>
    </div>
  );
}

// === tournaments ===
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric" });
}

// Statuses needed: Finished, Upcoming, Ongoing
function statusOf(startISO, endISO) {
  const now = new Date();
  const start = startISO ? new Date(startISO) : null;
  const end = endISO ? new Date(endISO) : null;

  if (end && end < now) return "Finished";
  if (start && start > now) return "Upcoming";
  return "Ongoing";
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "Finished", label: "Finished" },
  { value: "Upcoming", label: "Upcoming" },
  { value: "Ongoing", label: "Ongoing" },
  { value: "Upcoming+Ongoing", label: "Upcoming+Ongoing" },
];

function TournamentsSection() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const token = getToken();

  // search/filter/pagination
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Upcoming+Ongoing"); // default Upcoming + Ongoing
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiGetPublic("/tournaments")
      .then(setTournaments)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, []);

  function openTournament(t) {
    if (!token) {
      alert("Login required");
      return;
    }
    navigate(`/tournament/${t.id}`);
  }

  // Sorting: keep your intent
  const statusOrder = { Finished: 0, Ongoing: 1, Upcoming: 2 };

  const sorted = useMemo(() => {
    const list = [...tournaments];
    list.sort((a, b) => {
      const sa = statusOf(a.start_date, a.end_date);
      const sb = statusOf(b.start_date, b.end_date);

      if (sa !== sb) return statusOrder[sa] - statusOrder[sb];

      const da = new Date(a.start_date || a.end_date || 0);
      const db = new Date(b.start_date || b.end_date || 0);

      if (sa === "Finished") {
        // Finished → from OLDEST to newest
        return da - db;
      }

      // Ongoing / Upcoming → new first
      return db - da;
    });
    return list;
  }, [tournaments]);

  const filtered = useMemo(() => {
    const query = (q || "").trim().toLowerCase();

    return sorted.filter((t) => {
      const st = statusOf(t.start_date, t.end_date);

      // status filter
      let okStatus = true;
      if (filter === "Finished") okStatus = st === "Finished";
      else if (filter === "Upcoming") okStatus = st === "Upcoming";
      else if (filter === "Ongoing") okStatus = st === "Ongoing";
      else if (filter === "Upcoming+Ongoing") okStatus = st === "Ongoing" || st === "Upcoming";

      if (!okStatus) return false;

      // search filter
      if (!query) return true;
      return (t.name || "").toLowerCase().includes(query);
    });
  }, [sorted, q, filter]);

  useEffect(() => {
    setPage(1);
  }, [q, filter, tournaments.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const paginated = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, pageSafe]);

  return (
    <section className="py-9">
      <h2 className="text-5xl font-extrabold">TOURNAMENTS</h2>

      {loading && <p className="text-zinc-400 mt-6 text-[17px]">Loading…</p>}
      {err && <p className="text-red-400 mt-6 text-[17px]">{err}</p>}

      {!loading && !err && (
        <>
          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <Input label="Search" value={q} onChange={setQ} placeholder="Search by tournament name..." />
            <label className="block space-y-2">
              <span className="text-[18px] text-zinc-300">Filter</span>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-6 py-4 text-[18px] text-white outline-none focus:ring-2 focus:ring-white/30"
              >
                {FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 text-[17px] text-zinc-400">
            Showing {filtered.length} tournament{filtered.length === 1 ? "" : "s"}
          </div>

          <div className="mt-7 flex flex-col gap-3">
            {paginated.map((t) => {
              const st = statusOf(t.start_date, t.end_date);
              const dateLabel =
                t.start_date || t.end_date
                  ? `${fmtDate(t.start_date)}${t.end_date ? " – " + fmtDate(t.end_date) : ""}`
                  : "";

              const isFinished = st === "Finished";
              const isUpcoming = st === "Upcoming";

              // badge text
              let badgeText = st;
              if (!isFinished) {
                if (isUpcoming && t.start_date) {
                  const now = new Date();
                  const start = new Date(t.start_date);
                  const diff = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
                  if (diff <= 0) badgeText = "Starts today";
                  else if (diff === 1) badgeText = "Starts in 1 day";
                  else badgeText = `Starts in ${diff} days`;
                } else if (st === "Ongoing") {
                  badgeText = "Ongoing";
                }
              }

              const rowClass = isFinished
                ? "flex items-center justify-between rounded-md bg-zinc-900 border border-white/5 px-3 py-2 text-xs opacity-70 cursor-pointer"
                : "flex items-center justify-between rounded-2xl bg-zinc-800 border border-white/10 px-5 py-4 text-sm md:text-base cursor-pointer hover:bg-zinc-700 transition shadow-sm";

              const titleClass = isFinished
                ? "text-[11px] md:text-xs font-medium text-zinc-200"
                : "text-[18px] font-semibold text-white";

              const dateClass = isFinished ? "text-[10px] text-zinc-500" : "text-[13px] text-zinc-300";

              return (
                <div key={t.id} className={rowClass} onClick={() => openTournament(t)}>
                  <div className="flex flex-col gap-1">
                    {dateLabel && <span className={dateClass}>{dateLabel}</span>}
                    <span className={titleClass}>{t.name}</span>
                  </div>

                  <span className="shrink-0 inline-block rounded-lg bg-amber-400 px-3.5 py-1.5 text-[12px] font-semibold text-black">
                    {badgeText}
                  </span>
                </div>
              );
            })}

            {!paginated.length && <div className="text-zinc-400 text-[17px]">No tournaments found.</div>}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-[17px] text-zinc-300">
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
          )}
        </>
      )}
    </section>
  );
}

// === FAQ ===
function FAQSection() {
  return (
    <section id="faq" className="border-t border-white/10 bg-black mt-9">
      <div className="py-11">
        <h2 className="text-5xl font-extrabold tracking-tight">FAQ</h2>

        <div className="mt-7 space-y-5">
          <div className="rounded-2xl border border-white/10 p-6 bg-white/5">
            <h4 className="text-2xl font-semibold">What is this?</h4>
            <p className="text-[17px] text-zinc-300 mt-2">
              This is a CS2 Fantasy League platform where you select players before tournaments and compete for points.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 p-6 bg-white/5">
            <h4 className="text-2xl font-semibold">How do I play?</h4>
            <p className="text-[17px] text-zinc-300 mt-2">
              Pick 5 players within the budget. Your score is based on HLTV match statistics.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 p-6 bg-white/5">
            <h4 className="text-2xl font-semibold">Do I need an account?</h4>
            <p className="text-[17px] text-zinc-300 mt-2">
              Yes. You must log in to join leagues and create fantasy teams.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 p-6 bg-white/5">
            <h4 className="text-2xl font-semibold">Are tournaments automatic?</h4>
            <p className="text-[17px] text-zinc-300 mt-2">
              Yes — tournaments are imported from HLTV along with teams, players and match stats.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Landing() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [token, setTokenState] = useState(getToken());
  const username = localStorage.getItem("username");

  function logout() {
    clearToken();
    localStorage.removeItem("username");
    setTokenState(null);
  }

  return (
    <div className="min-h-screen bg-black text-white p-12 text-[18px]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur -m-12 mb-12">
        <div className="p-12 flex items-center justify-between">
          <Link to="/" className="text-2xl font-semibold tracking-wide">
            Fantasy CS2
          </Link>

          <nav className="flex items-center gap-3">
            {token && (
              <Link
                to="/admin-tools"
                className="text-[17px] text-zinc-300 hover:text-white px-3.5 py-2 border border-white/10 rounded-xl"
              >
                Admin Tools
              </Link>
            )}

            {token ? (
              <>
                <span className="text-[17px] text-zinc-300">{username}</span>
                <Button variant="ghost" onClick={logout}>
                  Logout
                </Button>
              </>
            ) : (
              <Button onClick={() => setLoginOpen(true)}>Login</Button>
            )}
          </nav>
        </div>
      </header>

      <main>
        <TournamentsSection />
        <FAQSection />
      </main>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLoggedIn={() => setTokenState(getToken())} />
    </div>
  );
}

// === routes ===
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/tournament/:tournamentId" element={<TournamentPage />} />
        <Route path="/draft/:leagueId" element={<DraftPage />} />
        <Route path="/admin-tools" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
