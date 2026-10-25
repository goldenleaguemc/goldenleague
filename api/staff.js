// Función de Vercel: correos completos para el admin + tickets de soporte (contactar con el staff) + avisos push.
// Usa las mismas variables que el resto: KV_REST_API_URL / KV_REST_API_TOKEN (Upstash), ADMIN_PASSWORD (vía /api/data)
// y, para las notificaciones, las mismas VAPID_PUBLIC / VAPID_PRIVATE / VAPID_SUBJECT de api/push.js.
//
// Claves en Redis (todas privadas, nunca viajan en los datos públicos de la liga):
//   gl:mail            id de cuenta -> correo completo (solo lo lee el admin)
//   gl:tk              id de ticket -> JSON del ticket
//   gl:pushadm         endpoint -> suscripción push de los dispositivos del admin
//   gl:pushacc:<id>    endpoint -> suscripción push de los dispositivos de esa cuenta
const crypto = require('crypto');
let wp = null; try { wp = require('web-push'); } catch (e) {}
const U = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const K = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'goldenleague';
const GCSYNC = 'FLCARTAS';

const kv = async (...a) => {
  const r = await fetch(U, { method: 'POST', headers: { Authorization: 'Bearer ' + K, 'content-type': 'application/json' }, body: JSON.stringify(a) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
};
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
// mismo id que calcula el navegador (accIdOf en index.html)
const idOf = (e) => 'g' + BigInt('0x' + sha('borru-acc:' + e).slice(0, 12)).toString();
const okMail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length < 120;
const clean = (s, n) => String(s || '').replace(/[<>\u0000-\u0008\u000b-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, n);
const decode = (picks) => { try { return JSON.parse((picks || []).slice(1).join('')); } catch (e) { return null; } };

// La clave de admin se valida con tu propio /api/data (la misma comprobación que el login).
const isAdmin = async (req) => {
  const k = req.headers['x-admin'];
  if (!k) return false;
  try {
    const r = await fetch(`https://${req.headers.host}/api/data`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin': k }, body: JSON.stringify({ check: 1 }) });
    return r.ok;
  } catch (e) { return false; }
};

// Comprueba que quien llama es el dueño de la cuenta (misma prueba que usa api/quiniela.js: sha256(proof) == huella pública h)
const authAcc = async (acc, proof) => {
  if (typeof acc !== 'string' || !/^g\d{1,20}$/.test(acc) || typeof proof !== 'string' || !proof) return null;
  const r = await fetch(`${U}/get/${KEY}`, { headers: { Authorization: 'Bearer ' + K } });
  const j = await r.json();
  if (!j.result) return null;
  const data = JSON.parse(j.result);
  if ((data.cuentasDel || []).some((x) => x.id === acc)) return null;
  const rec = decode((((data.quiniela || {})[GCSYNC]) || {})['_' + acc]);
  if (!rec || !rec.h || sha(proof) !== rec.h) return null;
  const c = (data.cuentas || []).find((x) => x.id === acc) || {};
  return { id: acc, name: clean(rec.n || c.nombre || acc, 40) };
};

// Avisos push a una lista de suscripciones guardada en un hash de Redis
const VAPID = () => ({ pub: process.env.VAPID_PUBLIC, priv: process.env.VAPID_PRIVATE, sub: process.env.VAPID_SUBJECT });
const notify = async (hkey, title, body) => {
  const v = VAPID();
  if (!wp || !v.pub || !v.priv) return { sent: 0, skipped: true };
  wp.setVapidDetails(v.sub || 'mailto:admin@example.com', v.pub, v.priv);
  const payload = JSON.stringify({ title: clean(title, 80), body: clean(body, 200), url: '/' });
  let flat = [];
  try { flat = (await kv('HGETALL', hkey)) || []; } catch (e) { return { sent: 0 }; }
  let sent = 0;
  for (let i = 0; i < flat.length; i += 2) {
    let s; try { s = JSON.parse(flat[i + 1]); } catch (e) { continue; }
    try { await wp.sendNotification(s, payload); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { try { await kv('HDEL', hkey, flat[i]); } catch (_) {} } }
  }
  return { sent };
};

const getTk = async (id) => { try { return JSON.parse(await kv('HGET', 'gl:tk', id) || 'null'); } catch (e) { return null; } };
const putTk = (t) => kv('HSET', 'gl:tk', t.id, JSON.stringify(t));
const allTk = async () => {
  const flat = (await kv('HGETALL', 'gl:tk')) || [], out = [];
  for (let i = 0; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i + 1])); } catch (e) {} }
  return out;
};
// vista del ticket para su dueño (sin campos internos)
const pub = (t) => ({
  id: t.id, asunto: t.asunto, estado: t.estado, t: t.t, u: t.u,
  nuevo: !!(t.msgs || []).length && (t.msgs[t.msgs.length - 1].de === 'staff') && (t.u > (t.uv || 0)),
  msgs: (t.msgs || []).map((m) => ({ de: m.de, x: m.x, t: m.t }))
});
const subOk = (s) => s && typeof s.endpoint === 'string' && s.endpoint.length < 1200 && s.keys && typeof s.keys === 'object';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!U || !K) return res.status(501).json({ error: 'Falta conectar la base de datos (Upstash)' });
  let q;
  try { q = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch (e) { return res.status(400).json({ error: 'JSON no válido' }); }
  q = q || {};

  try {
    // ---------- público: guardar el correo completo de una cuenta (para que el admin pueda verlo) ----------
    // El id sale del propio correo (hash), así que nadie puede guardar un correo que no corresponda a ese id.
    if (q.act === 'regmail') {
      const email = String(q.email || '').trim().toLowerCase();
      if (!okMail(email)) return res.status(400).json({ error: 'correo no válido' });
      await kv('HSET', 'gl:mail', idOf(email), email);
      return res.json({ ok: 1 });
    }

    // ---------- usuario con sesión: sus tickets ----------
    if (['tk_new', 'tk_mine', 'tk_reply', 'subacc'].includes(q.act)) {
      const me = await authAcc(q.acc, q.proof);
      if (!me) return res.status(403).json({ error: 'Sesión no válida: vuelve a entrar en tu cuenta' });

      if (q.act === 'subacc') {
        if (!subOk(q.sub)) return res.status(400).json({ error: 'Suscripción no válida' });
        await kv('HSET', 'gl:pushacc:' + me.id, q.sub.endpoint, JSON.stringify(q.sub));
        return res.json({ ok: 1 });
      }

      if (q.act === 'tk_mine') {
        const mine = (await allTk()).filter((t) => t.acc === me.id).sort((a, b) => b.u - a.u);
        const out = mine.map(pub); // se calcula antes de marcar como vistos, para poder resaltar lo nuevo
        if (q.seen) { // marcar como vistos los tickets con respuesta nueva
          for (const t of mine) { if (t.u > (t.uv || 0)) { t.uv = Date.now(); await putTk(t); } }
        }
        return res.json({ tickets: out });
      }

      if (q.act === 'tk_new') {
        const asunto = clean(q.asunto, 80), x = clean(q.text, 1000);
        if (!asunto || !x) return res.status(400).json({ error: 'Escribe un asunto y un mensaje' });
        const fresh = await kv('SET', 'gl:tkrl:' + me.id, '1', 'NX', 'EX', '30');
        if (!fresh) return res.status(429).json({ error: 'Espera unos segundos antes de enviar otro ticket' });
        const open = (await allTk()).filter((t) => t.acc === me.id && t.estado !== 'cerrado').length;
        if (open >= 5) return res.status(429).json({ error: 'Ya tienes 5 tickets abiertos: espera a que el staff los cierre' });
        const now = Date.now();
        const t = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), acc: me.id, nombre: me.name, asunto, estado: 'abierto', t: now, u: now, uv: now, msgs: [{ de: 'user', x, t: now }] };
        await putTk(t);
        await notify('gl:pushadm', '🎫 Ticket nuevo · ' + me.name, asunto);
        return res.json({ ok: 1, id: t.id });
      }

      if (q.act === 'tk_reply') {
        const t = await getTk(String(q.id || ''));
        if (!t || t.acc !== me.id) return res.status(404).json({ error: 'Ticket no encontrado' });
        const x = clean(q.text, 1000);
        if (!x) return res.status(400).json({ error: 'Escribe un mensaje' });
        if ((t.msgs || []).length >= 100) return res.status(429).json({ error: 'Este ticket ya tiene demasiados mensajes: abre uno nuevo' });
        const now = Date.now();
        t.msgs.push({ de: 'user', x, t: now });
        t.estado = 'abierto'; t.u = now; t.uv = now;
        await putTk(t);
        await notify('gl:pushadm', '🎫 Respuesta · ' + t.nombre, t.asunto);
        return res.json({ ok: 1 });
      }
    }

    // ---------- solo admin ----------
    if (['mails', 'tk_list', 'tk_count', 'tk_admreply', 'tk_status', 'tk_del', 'subadm'].includes(q.act)) {
      if (!(await isAdmin(req))) return res.status(403).json({ error: 'Clave de administrador no válida: entra en Admin y vuelve a intentarlo' });

      if (q.act === 'mails') {
        const flat = (await kv('HGETALL', 'gl:mail')) || [], m = {};
        for (let i = 0; i < flat.length; i += 2) m[flat[i]] = flat[i + 1];
        return res.json({ mails: m });
      }
      if (q.act === 'subadm') {
        if (!subOk(q.sub)) return res.status(400).json({ error: 'Suscripción no válida' });
        await kv('HSET', 'gl:pushadm', q.sub.endpoint, JSON.stringify(q.sub));
        return res.json({ ok: 1 });
      }
      if (q.act === 'tk_count') {
        const L = await allTk();
        return res.json({ abiertos: L.filter((t) => t.estado === 'abierto').length, total: L.length });
      }
      if (q.act === 'tk_list') {
        const L = (await allTk()).sort((a, b) => b.u - a.u);
        return res.json({ tickets: L });
      }
      const t = await getTk(String(q.id || ''));
      if (!t) return res.status(404).json({ error: 'Ticket no encontrado' });
      if (q.act === 'tk_del') { await kv('HDEL', 'gl:tk', t.id); return res.json({ ok: 1 }); }
      if (q.act === 'tk_status') {
        if (!['abierto', 'respondido', 'cerrado'].includes(q.estado)) return res.status(400).json({ error: 'Estado no válido' });
        t.estado = q.estado; t.u = Date.now(); await putTk(t);
        return res.json({ ok: 1 });
      }
      if (q.act === 'tk_admreply') {
        const x = clean(q.text, 1000);
        if (!x) return res.status(400).json({ error: 'Escribe un mensaje' });
        const now = Date.now();
        t.msgs.push({ de: 'staff', x, t: now });
        t.estado = 'respondido'; t.u = now;
        await putTk(t);
        await notify('gl:pushacc:' + t.acc, '🎫 El staff te ha respondido', t.asunto);
        return res.json({ ok: 1 });
      }
    }

    return res.status(400).json({ error: 'Acción desconocida' });
  } catch (e) {
    console.error('staff', String(e && e.message || e).slice(0, 200));
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
