// Datos públicos y panel de administración de Golden League. Auth admin independiente de Supabase.
const U = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const K = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'goldenleague';
const headers = { Authorization: `Bearer ${K}`, 'content-type': 'application/json' };
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!U || !K) return res.status(500).json({ error: 'Falta conectar la base de datos (Upstash)' });
  try {
    if (req.method === 'GET') {
      const r = await fetch(`${U}/get/${KEY}`, { headers });
      const j = await r.json();
      if (!r.ok) return res.status(500).json({ error: 'No se pudo leer la base de datos' });
      if (!j.result) return res.status(200).json({ partidas: [], jugadores: [], quiniela: {}, cuentas: [], reclamaciones: [], cuentasDel: [] });
      return res.status(200).json(JSON.parse(j.result));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const password = process.env.ADMIN_PASSWORD;
    if (!password || req.headers['x-admin'] !== password) return res.status(401).json({ error: 'Clave incorrecta' });
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
    catch (_) { return res.status(400).json({ error: 'JSON no válido' }); }
    if (body.check) return res.status(200).json({ ok: true });
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Datos no válidos' });
    if (!Array.isArray(body.partidas) || !Array.isArray(body.jugadores)) return res.status(400).json({ error: 'Faltan partidas o jugadores' });
    if (JSON.stringify(body).length > 12_000_000) return res.status(413).json({ error: 'Datos demasiado grandes' });
    const r = await fetch(`${U}/set/${KEY}`, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return res.status(500).json({ error: 'No se pudo guardar la base de datos' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('api/data:', e && e.message);
    return res.status(500).json({ error: 'Error del servidor' });
  }
};
