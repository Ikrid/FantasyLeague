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

// === auth ===
function LoginModal({ open, onClose, onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

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
            <Link to="/register" onClick={onClose} className="text-sm text-zinc-300 hover:text-white">Create account</Link>
            <Button onClick={doLogin}>{loading ? "Logging in…" : "Login"}</Button>
          </div>
        </div>
      }
    >
      <form className="space-y-3" onSubmit={doLogin}>
        <Input label="Username" value={username} onChange={setUsername} autoComplete="username" />
        <Input label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>
    </Modal>
  );
}

function RegisterPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", first_name: "", last_name: "" });
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
          <Link to="/" className="text-sm text-zinc-300 hover:text-white">Back to tournaments</Link>
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
          {ok && <p className="text-sm text-green-400">Registration successful. Redirecting…</p>}
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
  const token = getToken();
  const navigate = useNavigate();

  useEffect(() => {
    apiGetPublic("/tournaments")
      .then(setTournaments)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, []);

  function openTournament(t) {
    if (!token) {
      alert("Login required – click Login top right");
      return;
    }
    navigate(`/tournament/${t.id}`);
  }

  return (
    <section className="max-w-6xl mx-auto px-4 py-10">
      <h2 className="text-4xl font-extrabold tracking-tight">TOURNAMENTS</h2>

      {loading && <p className="text-zinc-300 mt-6">Loading tournaments…</p>}
      {err && <p className="text-red-400 mt-6">{err}</p>}

      {!loading && !err && (
        <div className="mt-6 flex flex-col gap-3">
          {tournaments.map((t) => {
            const st = statusOf(t.start_date, t.end_date);
            const dateLabel =
              t.start_date || t.end_date
                ? `${fmtDate(t.start_date)}${t.end_date ? " – " + fmtDate(t.end_date) : ""}`
                : "";

            return (
              <div
                key={t.id}
                onClick={() => openTournament(t)}
                className="rounded-xl border border-white/10 p-3 bg-white/5 cursor-pointer hover:bg-white/10 transition"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t.name}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10">{st}</span>
                </div>

                <p className="text-xs text-zinc-400 mt-1">{dateLabel}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function FAQSection() {
  const items = [
    { q: "What is this?", a: "A CS2 fantasy manager: you pick 5 players before the tournament starts and earn points based on their real match performances." },
    { q: "How do I choose players?", a: "Open the tournament, press Enter — you’ll see 5 slots at the top and the player market below. No more than 2 players from the same team." },
    { q: "When can’t I change my lineup?", a: "Once the tournament starts, your lineup is locked. Balance and points are calculated automatically." },
  ];
  return (
    <section id="faq" className="border-t border-white/10 bg-black">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-4xl font-extrabold">FAQ</h2>
        <div className="mt-6 space-y-4">
          {items.map((it, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 p-5 bg-white/5">
              <h4 className="text-lg font-semibold">{it.q}</h4>
              <p className="text-sm text-zinc-300 mt-1">{it.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Landing() {
  const [loginOpen, setLoginOpen] = useState(false);
  const [token, setToken] = useState(getToken());
  const username = localStorage.getItem("username");

  function logout() {
    clearToken();
    localStorage.removeItem("username");
    setToken(null);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-wide">Fantasy CS2</Link>
          <nav className="flex items-center gap-3">
            {token && (
              <Link
                to="/admin-tools"
                className="text-sm text-zinc-300 hover:text-white px-3 py-1.5 border border-white/10 rounded-xl"
              >
                Admin Tools
              </Link>
            )}

            {token ? (
              <>
                <span className="text-sm text-zinc-300">{username || "Signed in"}</span>
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

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLoggedIn={() => setToken(getToken())} />
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
