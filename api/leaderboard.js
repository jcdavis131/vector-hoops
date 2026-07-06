// Vector Hoops leaderboard: public score board + submission proxy (same-
// origin function; SYNTH_API_KEY stays server-side). GET passes the query
// straight through to the backend board; POST validates shape before
// forwarding a score. Both are fire-and-forget-safe: never a 500, always
// JSON the client can render even on upstream failure.
const BASE = "https://api-production-3dea.up.railway.app";
const ALLOWED_GAMES = new Set(["chimera", "deadline", "fader", "arc", "pivot", "eratwin"]);
// chimera = FINAL points (0-2400, higher better — base mashup points x both donor multipliers); everyone else = 0-5, higher better.
const SCORE_RANGES = { chimera: [0, 2400], deadline: [0, 5], fader: [0, 5], arc: [0, 5], pivot: [0, 10], eratwin: [0, 10] };

module.exports = async (req, res) => {
  const key = process.env.SYNTH_API_KEY;
  if (!key) {
    return res.status(200).json({ entries: [], players: 0, you: null, error: true,
      note: "Leaderboard not configured." });
  }

  if (req.method === "GET") {
    const q = req.query || {};
    const game = String(q.game || "");
    if (!ALLOWED_GAMES.has(game)) {
      return res.status(400).json({ error: "unknown game" });
    }
    const params = new URLSearchParams();
    params.set("game", game);
    if (q.day) params.set("day", String(q.day).slice(0, 10));
    if (q.ref) params.set("ref", String(q.ref).slice(0, 64));
    try {
      const upstream = await fetch(`${BASE}/v1/games/leaderboard?${params.toString()}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const data = await upstream.json().catch(() => null);
      if (!upstream.ok || !data) {
        return res.status(200).json({ entries: [], players: 0, you: null, error: true,
          note: "Leaderboard temporarily unavailable — try again shortly." });
      }
      return res.status(200).json(data);
    } catch (e) {
      return res.status(200).json({ entries: [], players: 0, you: null, error: true,
        note: "Leaderboard temporarily unavailable — try again shortly." });
    }
  }

  if (req.method === "POST") {
    const { game, day, score, ref, name } = req.body || {};
    if (!ALLOWED_GAMES.has(game)) return res.status(400).json({ error: "unknown game" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) {
      return res.status(400).json({ error: "bad day" });
    }
    const range = SCORE_RANGES[game];
    const s = Math.round(Number(score));
    if (!Number.isFinite(s) || s < range[0] || s > range[1]) {
      return res.status(400).json({ error: "score out of range" });
    }
    const cleanRef = String(ref || "").slice(0, 64);
    if (!cleanRef) return res.status(400).json({ error: "missing ref" });
    const cleanName = String(name || "Player").slice(0, 40);
    try {
      await fetch(`${BASE}/v1/games/score`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ game, day, score: s, ref: cleanRef, name: cleanName }),
      });
    } catch (e) { /* fire-and-forget: never blocks the game */ }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "GET or POST only" });
};
