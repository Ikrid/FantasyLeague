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

  const [tournament, setTournament] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Load tournament info (to show its name)
  useEffect(() => {
    apiGetPublic(`/tournaments/${tournamentId}`)
      .then(setTournament)
      .catch((e) => setErr(String(e.message || e)));
  }, [tournamentId]);

  // Load leagues for this tournament
  useEffect(() => {
    apiGetPublic(`/leagues?tournament=${tournamentId}`)
      .then(setLeagues)
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <Link to="/" className="text-sm text-zinc-300 hover:text-white">← Back</Link>

      <h1 className="text-3xl font-bold mt-3">
        {tournament ? tournament.name : "Tournament"}
      </h1>

      {loading && <p className="text-zinc-300 mt-3">Loading leagues…</p>}
      {err && <p className="text-red-400 mt-3">{err}</p>}

      {!loading && !err && (
        <div className="mt-4 flex flex-col gap-3">
          {leagues.length === 0 && (
            <p className="text-zinc-300">No leagues yet.</p>
          )}

          {leagues.map((lg) => (
            <div
              key={lg.id}
              className="rounded-xl border border-white/10 p-3 bg-white/5 cursor-pointer hover:bg-white/10 transition"
              onClick={() => navigate(`/draft/${lg.id}`)}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{lg.name}</h3>
                <span className="text-xs text-zinc-400">Budget: {lg.budget}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
