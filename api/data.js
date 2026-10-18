// Función de Vercel: guarda y lee los datos de la liga en Upstash Redis.
// Variables necesarias (las crea Vercel al conectar Upstash): KV_REST_API_URL / KV_REST_API_TOKEN
// y la que creas tú: ADMIN_PASSWORD.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'goldenleague';
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Falta conectar la base de datos (Upstash)' });
  const h = { Authorization: `Bearer ${TOKEN}` };
  if (req.method === 'GET') {
    const r = await fetch(`${URL_}/get/${KEY}`, { headers: h });
    const j = await r.json();
    return res.status(200).json(j.result ? JSON.parse(j.result) : null);
  }
  if (req.method === 'POST') {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) return res.status(500).json({ error: 'Falta la variable ADMIN_PASSWORD' });
    if (req.headers['x-admin'] !== pw) return res.status(401).json({ error: 'Clave incorrecta' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (body && body.check) return res.status(200).json({ ok: true });
    if (!body || !Array.isArray(body.partidas) || !Array.isArray(body.jugadores)) return res.status(400).json({ error: 'Datos no válidos' });
    const r = await fetch(`${URL_}/set/${KEY}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  }
  res.status(405).end();
};
