// Función de Vercel: guarda lo que escriben los usuarios (pronósticos, cartas, ligas de fantasy y cuentas)
// dentro de los mismos datos de la liga que usa data.js (clave «goldenleague» en Upstash Redis, campo "quiniela").
// Usa las mismas variables que data.js: KV_REST_API_URL / KV_REST_API_TOKEN.
// Crear una cuenta ya no exige verificar el correo (api/verify.js queda sin uso).
const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'goldenleague';
const GCSYNC = 'FLCARTAS'; // canal donde viajan las colecciones de cartas y las cuentas
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
const decode = (picks) => { try { return JSON.parse((picks || []).slice(1).join('')); } catch (e) { return null; } };
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
  let consumeVerif = null; // marcador de verificación a borrar tras crear la cuenta
  if (id === GCSYNC && nick.startsWith('_g')) {
    if (!/^_g\d{1,20}$/.test(nick)) return res.status(400).json({ error: 'Cuenta no válida' });
    const accId = nick.slice(1);
    if ((data.cuentasDel || []).some((x) => x.id === accId)) return res.status(403).json({ error: 'Cuenta eliminada por un administrador' });
    const rec = decode(picks);
    if (!rec || rec.v !== 1 || typeof rec.s !== 'string' || typeof rec.h !== 'string' || rec.h.length !== 64) return res.status(400).json({ error: 'Registro de cuenta no válido' });
    const old = decode((((data.quiniela || {})[GCSYNC]) || {})[nick]);
    if (old && old.h) {
      const owner = typeof proof === 'string' && proof && sha(proof) === old.h;
      if (!owner) {
        // única excepción: el admin ha restablecido la contraseña y el usuario fija una nueva
        const c = (data.cuentas || []).find((x) => x.id === accId);
        const reset = c && c.reset > (old.rv || 0) && (rec.rv || 0) >= c.reset;
        if (!reset) return res.status(403).json({ error: 'No autorizado para modificar esta cuenta' });
      }
    }
    // CREAR cuenta nueva: ya no se exige verificar el correo por código
  }

  // --- guardar ---
  data.quiniela = data.quiniela || {};
  data.quiniela[id] = data.quiniela[id] || {};
  data.quiniela[id][nick] = picks;
  try {
    const r = await fetch(`${URL_}/set/${KEY}`, { method: 'POST', headers: h, body: JSON.stringify(data) });
    if (r.ok && consumeVerif) { try { await rcmd(['DEL', 'vr:ok:' + consumeVerif]); } catch (e) {} }
    return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
  } catch (e) { return res.status(500).json({ error: 'No se pudo guardar' }); }
};
