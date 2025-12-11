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

  const [selectedLeague, setSelectedLeague] = useState(null);
  const [ladder, setLadder] = useState([]);
  const [ladderLoading, setLadderLoading] = useState(false);
  const [ladderErr, setLadderErr] = useState("");
  const [ladderPage, setLadderPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  // топ игроков турнира
  const [topPlayers, setTopPlayers] = useState([]);
  const [topPlayersLoading, setTopPlayersLoading] = useState(false);
  const [topPlayersErr, setTopPlayersErr] = useState("");

  // 1) данные турнира
  useEffect(() => {
    apiGetPublic(`/tournaments/${tournamentId}`)
      .then(setTournament)
      .catch((e) => setErr(String(e.message || e)));
  }, [tournamentId]);

  // 2) лиги турнира
  useEffect(() => {
    setLoading(true);
    apiGetPublic(`/leagues?tournament=${tournamentId}`)
      .then((data) => setLeagues(data))
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  // 3) топ игроков турнира (до 8 штук)
  useEffect(() => {
    if (!tournamentId) return;
    setTopPlayers([]);
    setTopPlayersErr("");
    setTopPlayersLoading(true);

    apiGetPublic(`/tournaments/${tournamentId}/top-players/`)
      .then((data) => setTopPlayers(data.top_players || []))
      .catch((e) => setTopPlayersErr(String(e.message || e)))
      .finally(() => setTopPlayersLoading(false));
  }, [tournamentId]);

  // загрузка ладдера для выбранной лиги
  const loadLadder = (league, page = 1) => {
    if (!league) return;

    setSelectedLeague(league);
    setLadder([]);
    setLadderErr("");
    setLadderLoading(true);
    setLadderPage(page);

    apiGetPublic(`/leagues/${league.id}/ladder/?page=${page}`)
      .then((data) => {
        setLadder(data.ladder || []);
        setPagination(data.pagination || null);
      })
      .catch((e) => setLadderErr(String(e.message || e)))
      .finally(() => setLadderLoading(false));
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <Link to="/" className="text-sm text-zinc-300 hover:text-white">
        ← Back
      </Link>

      <h1 className="text-3xl font-bold mt-3">
        {tournament ? tournament.name : "Tournament"}
      </h1>

      {loading && <p className="text-zinc-300 mt-3">Loading leagues…</p>}
      {err && <p className="text-red-400 mt-3">{err}</p>}

      {!loading && !err && (
        <>
          {/* ВЕРХНИЙ РЯД: слева лиги, справа ladder */}
          <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
            {/* ЛЕВАЯ КОЛОНКА — лиги */}
            <div className="flex flex-col gap-3">
              {leagues.length === 0 && (
                <p className="text-zinc-300">No leagues yet.</p>
              )}

              {leagues.map((lg) => {
                const isSelected = selectedLeague && selectedLeague.id === lg.id;
                return (
                  <div
                    key={lg.id}
                    className={
                      "rounded-xl border p-3 cursor-pointer transition " +
                      (isSelected
                        ? "border-emerald-400 bg-emerald-400/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10")
                    }
                    onClick={() => loadLadder(lg, 1)} // новая лига → с 1-й страницы
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">{lg.name}</h3>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400">
                          Players: {lg.participants_count ?? 0}
                        </span>
                        <button
                          className="px-3 py-1 text-xs rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/draft/${lg.id}`);
                          }}
                        >
                          Join
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ПРАВАЯ КОЛОНКА — Ladder выбранной лиги */}
            <div className="border border-white/10 rounded-xl p-4 bg-white/5 min-h-[200px]">
              {!selectedLeague && (
                <p className="text-sm text-zinc-400">
                  Choose a league on the left to see its ladder.
                </p>
              )}

              {selectedLeague && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold">
                        Ladder: {selectedLeague.name}
                      </h2>
                      <p className="text-xs text-zinc-400">
                        Tournament: {tournament?.name || "-"}
                      </p>
                    </div>
                  </div>

                  {ladderLoading && (
                    <p className="text-sm text-zinc-300">Loading ladder…</p>
                  )}

                  {ladderErr && (
                    <p className="text-sm text-red-400">Error: {ladderErr}</p>
                  )}

                  {!ladderLoading && !ladderErr && (
                    <>
                      {ladder.length === 0 ? (
                        <p className="text-sm text-zinc-400">
                          No fantasy teams in this league yet.
                        </p>
                      ) : (
                        <>
                          <div className="overflow-x-auto border border-slate-800 rounded-lg mt-2">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-900/60">
                                <tr>
                                  <th className="px-3 py-2 text-left">#</th>
                                  <th className="px-3 py-2 text-left">Team</th>
                                  <th className="px-3 py-2 text-left">
                                    Manager
                                  </th>
                                  <th className="px-3 py-2 text-right">
                                    Points
                                  </th>
                                  <th className="px-3 py-2 text-right">
                                    Players
                                  </th>
                                  <th className="px-3 py-2 text-right">
                                    Budget left
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {ladder.map((row, idx) => (
                                  <tr
                                    key={row.fantasy_team_id ?? idx}
                                    className="border-t border-slate-800"
                                  >
                                    <td className="px-3 py-2">
                                      {row.rank ?? idx + 1}
                                    </td>
                                    <td className="px-3 py-2">
                                      {row.team_name || row.user_name}
                                    </td>
                                    <td className="px-3 py-2">
                                      {row.user_name || "-"}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold">
                                      {row.total_points ?? 0}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {row.roster_size ?? "-"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {row.budget_left != null
                                        ? row.budget_left
                                        : "-"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Пагинация ladder */}
                          {pagination && (
                            <div className="flex items-center justify-between mt-3 text-xs text-zinc-300">
                              <button
                                disabled={!pagination.has_prev}
                                onClick={() =>
                                  loadLadder(selectedLeague, ladderPage - 1)
                                }
                                className={
                                  "px-3 py-1 rounded border " +
                                  (pagination.has_prev
                                    ? "border-white/40 hover:bg-white/10"
                                    : "border-white/10 opacity-40 cursor-default")
                                }
                              >
                                Prev
                              </button>

                              <span>
                                Page {pagination.page} /{" "}
                                {pagination.total_pages}
                              </span>

                              <button
                                disabled={!pagination.has_next}
                                onClick={() =>
                                  loadLadder(selectedLeague, ladderPage + 1)
                                }
                                className={
                                  "px-3 py-1 rounded border " +
                                  (pagination.has_next
                                    ? "border-white/40 hover:bg-white/10"
                                    : "border-white/10 opacity-40 cursor-default")
                                }
                              >
                                Next
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* НИЖНИЙ БЛОК НА ВСЮ ШИРИНУ — топ игроков турнира (в красном прямоугольнике) */}
          <div className="mt-4 border border-white/10 rounded-xl p-4 bg-white/5">
            <h3 className="text-sm font-semibold mb-3">
              Most picked players in this tournament
            </h3>

            {topPlayersLoading && (
              <p className="text-xs text-zinc-300">Loading…</p>
            )}

            {topPlayersErr && (
              <p className="text-xs text-red-400">Error: {topPlayersErr}</p>
            )}

            {!topPlayersLoading && !topPlayersErr && (
              <>
                {topPlayers.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    No players picked yet in this tournament.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {topPlayers.map((p, idx) => (
                      <div
                        key={p.player_id ?? idx}
                        className="flex flex-col justify-between bg-black/40 rounded-lg px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-zinc-500">
                            #{idx + 1}
                          </span>
                          <span className="font-medium truncate">
                            {p.player_name || `Player ${p.player_id}`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">
                            times picked
                          </span>
                          <span className="font-semibold">
                            {p.picks_count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
