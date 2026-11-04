// Función de Vercel: guarda lo que escriben los usuarios (pronósticos, cartas, ligas de fantasy y cuentas)
// dentro de los mismos datos de la liga que usa data.js (clave «goldenleague» en Upstash Redis, campo "quiniela").
// Usa las mismas variables que data.js: KV_REST_API_URL / KV_REST_API_TOKEN.
// Crear una cuenta ya no exige verificar el correo (api/verify.js queda sin uso).
const crypto = require('crypto');
const { requireAuth } = require('../lib/supabase-auth');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'goldenleague';
const GCSYNC = 'FLCARTAS'; // canal donde viajan las colecciones de cartas y las cuentas
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
const decode = (picks) => { try { return JSON.parse((picks || []).slice(1).join('')); } catch (e) { return null; } };
const encodeRecord = (rec) => { const raw = JSON.stringify(rec); const out = ['v1']; for (let i = 0; i < raw.length; i += 700) out.push(raw.slice(i, i + 700)); return out; };
// comandos Redis sueltos (para leer/borrar el marcador de verificación)
const rcmd = async (c) => (await (await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(c) })).json()).result;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Falta conectar la base de datos (Upstash)' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch (e) { return res.status(400).json({ error: 'JSON no válido' }); }
  const { id, nick, picks, proof } = body || {};

  // --- validación básica ---
  const bad = (k) => ['__proto__', 'constructor', 'prototype'].includes(k);
  if (typeof id !== 'string' || !id || id.length > 40 || bad(id)) return res.status(400).json({ error: 'id no válido' });
  if (typeof nick !== 'string' || !nick.trim() || nick.length > 60 || bad(nick)) return res.status(400).json({ error: 'nick no válido' });
  if (!Array.isArray(picks) || picks.length > 500 || JSON.stringify(picks).length > 150000) return res.status(413).json({ error: 'Datos demasiado grandes' });
  if (nick === '_adm') return res.status(403).json({ error: 'Reservado al administrador' }); // las órdenes del admin solo entran por data.js

  // --- leer los datos actuales ---
  const h = { Authorization: `Bearer ${TOKEN}` };
  let data;
  try {
    const r = await fetch(`${URL_}/get/${KEY}`, { headers: h });
    const j = await r.json();
    if (!j.result) return res.status(409).json({ error: 'La liga aún no está guardada en el servidor: entra en Admin y guarda una vez' });
    data = JSON.parse(j.result);
  } catch (e) { return res.status(500).json({ error: 'No se pudo leer la base de datos' }); }

  // --- cuentas: solo su dueño puede modificarlas ---
  if (id === GCSYNC && nick.startsWith('_g')) {
    if (!/^_g\d{1,20}$/.test(nick)) return res.status(400).json({ error: 'Cuenta no válida' });
    let auth;
    try { auth = await requireAuth(req, { allowMissingRecord: true }); }
    catch (e) { return res.status(e.status || 401).json({ error: e.message || 'Sesión no válida' }); }
    const accId = nick.slice(1);
    if (auth.id !== accId) return res.status(403).json({ error: 'No puedes modificar otra cuenta' });
    if ((data.cuentasDel || []).some((x) => x.id === accId)) return res.status(403).json({ error: 'Cuenta eliminada por un administrador' });
    const rec = decode(picks);
    if (!rec || rec.v !== 1 || typeof rec.n !== 'string' || rec.n.length > 40) return res.status(400).json({ error: 'Registro de cuenta no válido' });
    // La identidad y contraseña ya las gestiona Supabase. No volver a guardar hashes antiguos.
    delete rec.s; delete rec.h; delete rec.rv;
    rec.e = String(auth.email).replace(/^(.{1,2}).*(@.*)$/, '$1***$2');
    picks.splice(0, picks.length, ...encodeRecord(rec));
  }

  // --- guardar ---
  data.quiniela = data.quiniela || {};
  data.quiniela[id] = data.quiniela[id] || {};
  data.quiniela[id][nick] = picks;
  try {
    const r = await fetch(`${URL_}/set/${KEY}`, { method: 'POST', headers: h, body: JSON.stringify(data) });
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  } catch (e) { return res.status(500).json({ error: 'No se pudo guardar' }); }
};
