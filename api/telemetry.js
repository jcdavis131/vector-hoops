// Vector Hoops telemetry: consented, event-name-only pings into the
// Blue Hen exhaust pipeline (same-origin function; key server-side).
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.SYNTH_API_KEY;
  if (!key) return res.status(200).json({ ok: false, note: "telemetry not configured" });
  const { event, userRef, detail } = req.body || {};
  const ALLOWED = new Set(["vh-start", "vh-guess", "vh-win", "vh-loss",
    "vh-deadline-round", "vh-deadline-done", "vh-share"]);
  if (!ALLOWED.has(event)) return res.status(400).json({ error: "unknown event" });
  try {
    await fetch("https://api-production-3dea.up.railway.app/v1/exhaust", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "vector-hoops", kind: "interaction", consent: true,
        payload: { event, userRef: String(userRef || "").slice(0, 16),
                   detail: String(detail || "").slice(0, 40) },
      }),
    });
  } catch (e) { /* telemetry never breaks the game */ }
  return res.status(200).json({ ok: true });
};
