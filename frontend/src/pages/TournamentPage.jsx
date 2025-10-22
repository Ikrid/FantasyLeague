import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const BASE_URL = "http://localhost:8000/api";

async function apiGetPublic(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || data?.error || `GET ${path}: ${res.status}`);
  return data;
}

export default function TournamentPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGetPublic(`/leagues?tournament=${tournamentId}`)
      .then(setLeagues)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <Link to="/" className="text-sm text-zinc-300 hover:text-white">← Back</Link>
      <h1 className="text-2xl font-bold mt-3">Leagues for tournament #{tournamentId}</h1>
      {loading && <p className="text-zinc-300 mt-3">Loading leagues…</p>}
      {err && <p className="text-red-400 mt-3">{err}</p>}
      {!loading && !err && (
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {leagues.length === 0 && <p className="text-zinc-300">No leagues yet.</p>}
          {leagues.map((lg) => (
            <div key={lg.id} className="rounded-2xl border border-white/10 p-5 bg-white/5">
              <h3 className="text-lg font-semibold">{lg.name}</h3>
              <p className="text-sm text-zinc-300 mt-1">Budget: {lg.budget}</p>
              <div className="mt-4">
                <button
                  className="px-4 py-2 rounded-2xl bg-white text-black hover:bg-zinc-200"
                  onClick={() => navigate(`/draft/${lg.id}`)}
                >
                  Enter league
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
