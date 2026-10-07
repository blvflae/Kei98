// Vercel serverless function: counts contact-form messages sent this month (display only).
// Uses the same Redis database as notes.js. No extra environment variables needed.
const pick = (re) => { const k = Object.keys(process.env).find((n) => re.test(n)); return k && process.env[k]; };
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || pick(/REST_(API_)?URL$/);
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || pick(/REST_(API_)?TOKEN$/);
const LIMIT = 250; // Web3Forms free plan: 250 submissions per month

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const monthKey = () => "contact:count:" + new Date().toISOString().slice(0, 7);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!URL_ || !TOKEN) return res.status(500).json({ error: "database not connected" });
    const key = monthKey();
    if (req.method === "POST") {
      // Basic abuse guard: at most 10 count updates per hour per visitor.
      const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
      const ipKey = "contact:ip:" + ip;
      const hits = await redis(["INCR", ipKey]);
      if (hits === 1) await redis(["EXPIRE", ipKey, 3600]);
      if (hits <= 10) {
        const n = await redis(["INCR", key]);
        if (n === 1) await redis(["EXPIRE", key, 60 * 60 * 24 * 35]);
      }
    } else if (req.method !== "GET") {
      return res.status(405).end();
    }
    const used = Number(await redis(["GET", key])) || 0;
    return res.status(200).json({ used, limit: LIMIT, remaining: Math.max(0, LIMIT - used) });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
};
