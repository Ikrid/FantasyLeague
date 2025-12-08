import React, { useState, useEffect } from "react";
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

function saveToken(token) { localStorage.setItem("access", token); }
function getToken() { return localStorage.getItem("access"); }
function clearToken() { localStorage.removeItem("access"); }

// === ui primitives ===
function Button({ children, onClick, type = "button", variant = "primary", className = "" }) {
  const styles =
    variant === "primary"
      ? "bg-white text-black hover:bg-zinc-200"
      : variant === "ghost"
      ? "bg-transparent text-white hover:bg-white/10"
      : "bg-zinc-700 text-white hover:bg-zinc-600";
  return (
    <button
      type={type}
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl shadow-sm transition ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

function Input({ label, type = "text", value, onChange, placeholder, autoComplete }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-white/30"
      />
    </label>
  );
}

function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 p-6 mx-4">
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
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="space-x-2">
            <Link
              to="/register"
              onClick={onClose}
              className="text-sm text-zinc-300 hover:text-white"
            >
              Create account
            </Link>
            <Button onClick={doLogin}>{loading ? "Logging in…" : "Login"}</Button>
          </div>
        </div>
      }
    >
      <form className="space-y-3" onSubmit={doLogin}>
        <Input label="Username" value={username} onChange={setUsername} />
        <Input label="Password" type="password" value={password} onChange={setPassword} />
        {err && <p className="text-sm text-red-400">{err}</p>}
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

  function setField(k, v) { setForm((s) => ({ ...s, [k]: v })); }

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
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 bg-black/70 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">Fantasy CS2</Link>
          <Link to="/" className="text-sm text-zinc-300 hover:text-white">Back</Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold mb-6">Create your account</h1>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Username" value={form.username} onChange={(v) => setField("username", v)} />
          <Input label="Email" value={form.email} onChange={(v) => setField("email", v)} type="email" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="First name" value={form.first_name} onChange={(v) => setField("first_name", v)} />
            <Input label="Last name" value={form.last_name} onChange={(v) => setField("last_name", v)} />
          </div>
          <Input label="Password" type="password" value={form.password} onChange={(v) => setField("password", v)} />
          {err && <p className="text-sm text-red-400">{err}</p>}
          {ok && <p className="text-sm text-green-400">Registration successful</p>}
          <div className="flex items-center justify-end gap-3">
            <Link to="/" className="text-sm text-zinc-300 hover:text-white">Cancel</Link>
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

function statusOf(startISO, endISO) {
  const now = new Date();
  const start = startISO ? new Date(startISO) : null;
  const end = endISO ? new Date(endISO) : null;

  if (end && end < now) return "Finished";
  if (start && start > now) return "Upcoming";
  return "Open";
}

function TournamentsSection() {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const token = getToken();

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

  const statusOrder = { Finished: 0, Open: 1, Upcoming: 2 };

  // === KEY PART: SORTING FIX ===
  const visible = [...tournaments].sort((a, b) => {
    const sa = statusOf(a.start_date, a.end_date);
    const sb = statusOf(b.start_date, b.end_date);

    if (sa !== sb) return statusOrder[sa] - statusOrder[sb];

    const da = new Date(a.start_date || a.end_date || 0);
    const db = new Date(b.start_date || b.end_date || 0);

    if (sa === "Finished") {
      // Finished → from OLDEST to newest
      return da - db;
    }

    // Open / Upcoming → new first
    return db - da;
  });

  return (
    <section className="max-w-6xl mx-auto px-4 py-10">
      <h2 className="text-4xl font-extrabold">TOURNAMENTS</h2>

      {loading && <p className="text-zinc-400 mt-6">Loading…</p>}
      {err && <p className="text-red-400 mt-6">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 flex flex-col gap-3">
          {visible.map((t) => {
            const st = statusOf(t.start_date, t.end_date);
            const dateLabel =
              t.start_date || t.end_date
                ? `${fmtDate(t.start_date)}${t.end_date ? " – " + fmtDate(t.end_date) : ""}`
                : "";

            const isFinished = st === "Finished";
            const isUpcoming = st === "Upcoming";

            // compute badge text
            let badgeText = st;

            if (!isFinished) {
              if (isUpcoming && t.start_date) {
                const now = new Date();
                const start = new Date(t.start_date);
                const diff = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
                if (diff <= 0) badgeText = "Starts today";
                else if (diff === 1) badgeText = "Starts in 1 day";
                else badgeText = `Starts in ${diff} days`;
              } else if (st === "Open") {
                badgeText = "Ongoing";
              }
            }

            const rowClass = isFinished
              ? "flex items-center justify-between rounded-md bg-zinc-900 border border-white/5 px-3 py-2 text-xs opacity-70 cursor-pointer"
              : "flex items-center justify-between rounded-xl bg-zinc-800 border border-white/10 px-4 py-3 text-sm md:text-base cursor-pointer hover:bg-zinc-700 transition shadow-sm";

            const titleClass = isFinished
              ? "text-[11px] md:text-xs font-medium text-zinc-200"
              : "text-sm md:text-base font-semibold text-white";

            const dateClass = isFinished
              ? "text-[10px] text-zinc-500"
              : "text-[11px] text-zinc-300";

            return (
              <div
                key={t.id}
                className={rowClass}
                onClick={() => openTournament(t)} // Finished now clickable
              >
                <div className="flex flex-col gap-0.5">
                  {dateLabel && <span className={dateClass}>{dateLabel}</span>}
                  <span className={titleClass}>{t.name}</span>
                </div>

                <span className="shrink-0 inline-block rounded-md bg-amber-400 px-3 py-1 text-[10px] md:text-xs font-semibold text-black">
                  {badgeText}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// === FAQ ===
function FAQSection() {
  return (
    <section id="faq" className="border-t border-white/10 bg-black">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-4xl font-extrabold tracking-tight">FAQ</h2>

        <div className="mt-6 space-y-4">

          <div className="rounded-xl border border-white/10 p-5 bg-white/5">
            <h4 className="text-lg font-semibold">What is this?</h4>
            <p className="text-sm text-zinc-300 mt-1">
              This is a CS2 Fantasy League platform where you select players before tournaments and compete for points.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 p-5 bg-white/5">
            <h4 className="text-lg font-semibold">How do I play?</h4>
            <p className="text-sm text-zinc-300 mt-1">
              Pick 5 players within the budget. Your score is based on HLTV match statistics.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 p-5 bg-white/5">
            <h4 className="text-lg font-semibold">Do I need an account?</h4>
            <p className="text-sm text-zinc-300 mt-1">
              Yes. You must log in to join leagues and create fantasy teams.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 p-5 bg-white/5">
            <h4 className="text-lg font-semibold">Are tournaments automatic?</h4>
            <p className="text-sm text-zinc-300 mt-1">
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
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-wide">Fantasy CS2</Link>

          <nav className="flex items-center gap-3">
            {token && (
              <Link to="/admin-tools" className="text-sm text-zinc-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-xl">
                Admin Tools
              </Link>
            )}

            {token ? (
              <>
                <span className="text-sm text-zinc-300">{username}</span>
                <Button variant="ghost" onClick={logout}>Logout</Button>
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
