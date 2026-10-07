// Vercel serverless function: public read, password-protected write.
// Env vars: NOTES_USER, NOTES_PASS, plus the Redis REST URL/token from your Upstash database.
const crypto = require("crypto");
const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = "portfolio:notes";

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN },
    body: JSON.stringify(cmd),
  });
  return (await r.json()).result;
}
const h = (s) => crypto.createHash("sha256").update(String(s)).digest();
function authorized(req) {
  const raw = Buffer.from((req.headers.authorization || "").replace("Basic ", ""), "base64").toString();
  const i = raw.indexOf(":");
  const u = raw.slice(0, i), p = raw.slice(i + 1);
  if (!process.env.NOTES_USER || !process.env.NOTES_PASS || i < 0) return false;
  return crypto.timingSafeEqual(h(u), h(process.env.NOTES_USER)) &&
         crypto.timingSafeEqual(h(p), h(process.env.NOTES_PASS));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      return res.status(200).json({ notes: (await redis(["GET", KEY])) || "" });
    }
    if (req.method !== "POST") return res.status(405).end();
    if (!authorized(req)) {
      await new Promise((r) => setTimeout(r, 800));
      return res.status(401).json({ error: "unauthorized" });
    }
    const notes = req.body && req.body.notes;
    if (typeof notes === "string") {
      if (notes.length > 20000) return res.status(413).json({ error: "too long" });
      await redis(["SET", KEY, notes]);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "server error" });
  }
};
