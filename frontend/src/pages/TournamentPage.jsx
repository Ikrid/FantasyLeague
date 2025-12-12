import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const BASE_URL = "http://localhost:8000/api";
const LEAGUES_PER_PAGE = 10; // сколько лиг на странице

async function apiGetPublic(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `GET ${path}: ${res.status}`);
  }
  return data;
}

async function apiPostPublic(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `POST ${path}: ${res.status}`);
  }
  return data;
}

export default function TournamentPage() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [creating, setCreating] = useState(false);

  const [selectedLeague, setSelectedLeague] = useState(null);
  const [ladder, setLadder] = useState([]);
  const [ladderLoading, setLadderLoading] = useState(false);
  const [ladderErr, setLadderErr] = useState("");
  const [ladderPage, setLadderPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const [topPlayers, setTopPlayers] = useState([]);
  const [topPlayersLoading, setTopPlayersLoading] = useState(false);
  const [topPlayersErr, setTopPlayersErr] = useState("");

  const [leaguePage, setLeaguePage] = useState(1); // пагинация лиг

  // 1) турнир
  useEffect(() => {
    if (!tournamentId) return;
    setErr("");
    apiGetPublic(`/tournaments/${tournamentId}`)
      .then(setTournament)
      .catch((e) => setErr(String(e.message || e)));
  }, [tournamentId]);

  // 2) лиги турнира
  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    apiGetPublic(`/leagues?tournament=${tournamentId}`)
      .then((data) => {
        setLeagues(data);
        setLeaguePage(1); // при загрузке сбрасываем на первую страницу
      })
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  // 3) топ игроков турнира
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

  // Загрузка ladder для выбранной лиги
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

  // Создание новой лиги
  const handleCreateLeague = async () => {
    if (!tournamentId) return;

    const defaultName = tournament ? `League of ${tournament.name}` : "My league";
    const name = window.prompt("League name", defaultName);

    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    setErr("");
    setCreating(true);

    try {
      const body = {
        name: trimmed,
        tournament: Number(tournamentId),
      };

      const created = await apiPostPublic("/leagues/", body);

      const leagueWithMeta = {
        ...created,
        participants_count: created.participants_count ?? 0,
      };

      setLeagues((prev) => [...prev, leagueWithMeta]);
      setLeaguePage(1); // после создания возвращаемся на первую страницу
      loadLadder(leagueWithMeta, 1);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setCreating(false);
    }
  };

  // Копирование ссылки на лигу
  const handleCopyLeagueLink = (leagueId, e) => {
    if (e) e.stopPropagation();

    const url = `${window.location.origin}/draft/${leagueId}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          alert("League link copied to clipboard:\n" + url);
        })
        .catch(() => {
          window.prompt("League link:", url);
        });
    } else {
      window.prompt("League link:", url);
    }
  };

  // ====== сортировка и пагинация лиг ======
  const hasLeagues = leagues && leagues.length > 0;

  let sortedLeagues = [];
  let leaguesTotalPages = 1;
  let currentLeaguePage = leaguePage;
  let pagedLeagues = [];

  if (hasLeagues) {
    // сортировка по количеству игроков (по убыванию)
    sortedLeagues = [...leagues].sort((a, b) => {
      const ac = a.participants_count ?? 0;
      const bc = b.participants_count ?? 0;
      if (bc !== ac) return bc - ac; // больше игроков — выше
      // вторичная сортировка, чтобы был стабильный порядок
      return (a.id ?? 0) - (b.id ?? 0);
    });

    leaguesTotalPages = Math.max(1, Math.ceil(sortedLeagues.length / LEAGUES_PER_PAGE));
    if (currentLeaguePage > leaguesTotalPages) {
      currentLeaguePage = leaguesTotalPages;
    } else if (currentLeaguePage < 1) {
      currentLeaguePage = 1;
    }

    const start = (currentLeaguePage - 1) * LEAGUES_PER_PAGE;
    pagedLeagues = sortedLeagues.slice(start, start + LEAGUES_PER_PAGE);
  }

  return (
    <div className="min-h-screen bg-black text-white p-8 text-base">
      <Link to="/" className="text-base text-zinc-300 hover:text-white">
        ← Back
      </Link>

      <h1 className="text-4xl font-bold mt-4">
        {tournament ? tournament.name : "Tournament"}
      </h1>

      {loading && <p className="text-zinc-300 mt-4 text-base">Loading leagues…</p>}
      {err && <p className="text-red-400 mt-4 text-base">{err}</p>}

      {!loading && !err && (
        <>
          {/* ВЕРХ: слева лиги, справа ladder */}
          <div className="mt-6 grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
            {/* ЛЕВАЯ КОЛОНКА — лиги */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-zinc-200">
                  Leagues for this tournament
                </h2>
                <button
                  type="button"
                  onClick={handleCreateLeague}
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-semibold text-black"
                >
                  {creating ? "Creating…" : "Create league"}
                </button>
              </div>

              {!hasLeagues && (
                <p className="text-zinc-300 mt-2 text-base">No leagues yet.</p>
              )}

              {hasLeagues &&
                pagedLeagues.map((lg) => {
                  const isSelected = selectedLeague && selectedLeague.id === lg.id;
                  return (
                    <div
                      key={lg.id}
                      className={
                        "rounded-2xl border p-4 cursor-pointer transition " +
                        (isSelected
                          ? "border-emerald-400 bg-emerald-400/10"
                          : "border-white/10 bg-white/5 hover:bg-white/10")
                      }
                      onClick={() => loadLadder(lg, 1)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xl font-semibold truncate">{lg.name}</h3>

                        <div className="flex items-center gap-2">
                          <span className="text-sm text-zinc-300">
                            Players: {lg.participants_count ?? 0}
                          </span>

                          {/* COPY LINK */}
                          <button
                            type="button"
                            className="px-3 py-2 text-sm rounded-xl border border-emerald-500/70 text-emerald-300 hover:bg-emerald-500/10"
                            onClick={(e) => handleCopyLeagueLink(lg.id, e)}
                          >
                            Copy link
                          </button>

                          {/* JOIN */}
                          <button
                            type="button"
                            className="px-4 py-2 text-sm rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/draft/${lg.id}`);
                            }}
                          >
                            Join
                          </button>
                        </div>
                      </div>

                      <p className="mt-2 text-sm text-zinc-300">
                        Tournament: {tournament?.name || "-"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        Budget: {lg.budget?.toLocaleString?.() ?? lg.budget} • Max badges:{" "}
                        {lg.max_badges ?? 0}
                      </p>
                    </div>
                  );
                })}

              {/* Пагинация лиг */}
              {hasLeagues && leaguesTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-sm text-zinc-200">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl border border-white/20 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                    onClick={() => setLeaguePage((p) => (p > 1 ? p - 1 : 1))}
                    disabled={currentLeaguePage <= 1}
                  >
                    Prev
                  </button>
                  <span>
                    Page {currentLeaguePage} / {leaguesTotalPages}
                  </span>
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl border border-white/20 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                    onClick={() =>
                      setLeaguePage((p) => (p < leaguesTotalPages ? p + 1 : leaguesTotalPages))
                    }
                    disabled={currentLeaguePage >= leaguesTotalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {/* ПРАВАЯ КОЛОНКА — ladder */}
            <div className="border border-white/10 rounded-2xl p-5 bg-white/5 min-h-[240px]">
              {!selectedLeague && (
                <p className="text-zinc-300 text-base">
                  Choose a league on the left to see its ladder.
                </p>
              )}

              {selectedLeague && (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-xl font-semibold">Ladder: {selectedLeague.name}</h2>
                      <p className="text-sm text-zinc-300">Tournament: {tournament?.name || "-"}</p>
                      <button
                        type="button"
                        className="mt-2 text-sm text-emerald-300 underline-offset-4 hover:underline"
                        onClick={(e) => handleCopyLeagueLink(selectedLeague.id, e)}
                      >
                        Copy league link
                      </button>
                    </div>

                    {pagination && (
                      <div className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                          onClick={() => loadLadder(selectedLeague, ladderPage - 1)}
                          disabled={ladderLoading || !pagination.has_prev || ladderPage <= 1}
                        >
                          Prev
                        </button>
                        <span className="text-zinc-400">
                          Page {pagination.page} / {pagination.total_pages}
                        </span>
                        <button
                          type="button"
                          className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                          onClick={() => loadLadder(selectedLeague, ladderPage + 1)}
                          disabled={ladderLoading || !pagination.has_next}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>

                  {ladderLoading && <p className="text-zinc-300 text-base">Loading ladder…</p>}

                  {ladderErr && <p className="text-red-400 text-base">Error: {ladderErr}</p>}

                  {!ladderLoading && !ladderErr && ladder.length === 0 && (
                    <p className="text-zinc-400 text-base">No fantasy teams in this league yet.</p>
                  )}

                  {!ladderLoading && !ladderErr && ladder.length > 0 && (
                    <div className="space-y-3">
                      {ladder.map((row) => (
                        <div
                          key={row.fantasy_team_id}
                          className="flex items-center justify-between rounded-2xl bg-black/40 px-4 py-3 text-base"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-8 text-sm text-zinc-400">#{row.rank}</span>
                            <div>
                              <div className="font-semibold">{row.team_name}</div>
                              {row.user_name && (
                                <div className="text-sm text-zinc-500">{row.user_name}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-5 text-sm">
                            <div className="text-zinc-400">
                              Pts:{" "}
                              <span className="font-semibold">
                                {row.total_points?.toFixed
                                  ? row.total_points.toFixed(2)
                                  : row.total_points}
                              </span>
                            </div>
                            <div className="text-zinc-400">
                              Roster: <span className="font-semibold">{row.roster_size}</span>
                            </div>
                            <div className="text-zinc-400">
                              Budget left: <span className="font-semibold">{row.budget_left}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* НИЖНИЙ БЛОК — топ игроков турнира */}
 <div className="mt-6 border border-white/10 rounded-2xl p-6 bg-white/5">
  <h3 className="text-2xl font-bold text-center mb-6">
    Most Picked Players
  </h3>

  {topPlayersLoading && (
    <p className="text-base text-zinc-300 text-center">Loading…</p>
  )}

  {topPlayersErr && (
    <p className="text-base text-red-400 text-center">Error: {topPlayersErr}</p>
  )}

  {!topPlayersLoading && !topPlayersErr && (
    <>
      {topPlayers.length === 0 ? (
        <p className="text-base text-zinc-300 text-center">
          No players picked yet in this tournament.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {topPlayers.map((p, idx) => (
            <div
              key={p.player_id ?? idx}
              className="bg-black/40 rounded-2xl px-5 py-5 text-center"
            >
              <div className="text-xs text-zinc-500 mb-2">#{idx + 1}</div>

              <div className="text-2xl font-extrabold tracking-wide truncate">
                {p.player_name || `Player ${p.player_id}`}
              </div>

              <div className="mt-3 text-lg text-zinc-300">
                Count: <span className="font-semibold">{p.picks_count}</span>
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
