// Función de Vercel: chats de borrushers y borrusquads (Upstash Redis, mismas variables que data.js).
// Canales:  all = general · eq:<borrusquad> = chat de equipo · dm:<idA>:<idB> = privado entre dos · grp:<id> = grupo privado
// Solo pueden entrar cuentas con borrusher o borrusquad aceptados por el admin (y moderadores/admins en el general).
// Cada petición lleva la cuenta (acc) y su clave (proof); se comprueba contra la huella guardada en la liga.
const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'goldenleague', GC = 'FLCARTAS', GRP = 'glc:groups', KEEP = 200, SHOW = 80;
const H = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
const decode = (p) => { try { return JSON.parse((p || []).slice(1).join('')); } catch (e) { return null; } };
const cmd = async (...a) => { const r = await fetch(URL_, { method: 'POST', headers: H, body: JSON.stringify(a) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j.result; };
const pipe = async (c) => { if (!c.length) return []; const r = await fetch(URL_ + '/pipeline', { method: 'POST', headers: H, body: JSON.stringify(c) }); const j = await r.json(); return j.map((x) => { if (x.error) throw new Error(x.error); return x.result; }); };
const fail = (code, msg) => { const e = new Error(msg); e.code = code; return e; };

// Cuentas, borrushers y borrusquads (se refresca cada 15 s para no leer los datos enteros en cada petición)
let CACHE = { t: 0, v: null };
async function users() {
  if (CACHE.v && Date.now() - CACHE.t < 15000) return CACHE.v;
  const raw = await cmd('GET', KEY);
  const data = raw ? JSON.parse(raw) : {};
  const recs = ((data.quiniela || {})[GC]) || {}, cu = data.cuentas || [], del = new Set((data.cuentasDel || []).map((x) => x.id));
  const tm = {};
  (data.fichajes || []).forEach((f) => { const o = tm[f.jugador]; if (!o || f.temporada >= o.t) tm[f.jugador] = { t: f.temporada, e: f.equipo }; });
  const U = {};
  Object.keys(recs).forEach((k) => {
    if (!/^_g\d+$/.test(k)) return;
    const id = k.slice(1); if (del.has(id)) return;
    const r = decode(recs[k]); if (!r || !r.h) return;
    const c = cu.find((x) => x.id === id) || {}, borr = c.borrusher || '', eqs = c.equipos || [], team = borr && tm[borr] ? (tm[borr].e || '') : '';
    const rol = c.rol || 'usuario';
    U[id] = { id, n: r.n || id, h: r.h, borr, eqs, team, rol, teams: [...new Set([...eqs, team].filter(Boolean))], priv: !!(borr || eqs.length), mod: ['admin', 'moderador'].includes(rol) };
  });
  CACHE = { t: Date.now(), v: U };
  return U;
}
const dname = (u) => u.borr || u.n;
const labelOf = (u, as) => {
  if (as === 'borr' && u.borr) return '🎮 ' + u.borr;
  if (typeof as === 'string' && as.startsWith('eq:') && u.eqs.includes(as.slice(3))) return '🛡️ ' + as.slice(3) + ' · ' + u.n;
  return u.borr ? '🎮 ' + u.borr : u.n;
};
const groupOf = async (gid) => { const r = await cmd('HGET', GRP, gid); return r ? JSON.parse(r) : null; };
async function canAccess(me, U, chan) {
  if (typeof chan !== 'string' || chan.length > 80) return false;
  if (chan === 'all') return true;
  if (chan.startsWith('eq:')) return me.teams.includes(chan.slice(3));
  let m = /^dm:(g\d+):(g\d+)$/.exec(chan);
  if (m) { if (!(m[1] < m[2]) || (m[1] !== me.id && m[2] !== me.id) || !me.priv) return false; const o = U[m[1] === me.id ? m[2] : m[1]]; return !!(o && o.priv); }
  m = /^grp:([a-f0-9]{10})$/.exec(chan);
  if (m) { const g = await groupOf(m[1]); return !!(g && g.members.includes(me.id)); }
  return false;
}
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Falta conectar la base de datos (Upstash)' });
  let b; try { b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch (e) { return res.status(400).json({ error: 'JSON no válido' }); }
  b = b || {};
  try {
    const U = await users(), me = U[b.acc];
    if (!me || typeof b.proof !== 'string' || !b.proof || sha(b.proof) !== me.h) throw fail(401, 'Sesión no válida: vuelve a iniciar sesión');
    if (!me.priv && !me.mod) throw fail(403, 'El chat es solo para borrushers y borrusquads');
    const act = b.act;

    if (act === 'list') {
      const chans = [{ id: 'all', type: 'all', name: '🌐 General' }];
      me.teams.forEach((t) => chans.push({ id: 'eq:' + t, type: 'eq', name: '🛡️ ' + t }));
      const mem = (await cmd('SMEMBERS', 'glc:u:' + me.id)) || [];
      const gids = mem.filter((x) => /^grp:[a-f0-9]{10}$/.test(x)), dms = mem.filter((x) => x.startsWith('dm:'));
      const gs = await pipe(gids.map((g) => ['HGET', GRP, g.slice(4)]));
      gids.forEach((g, i) => { const o = gs[i] ? JSON.parse(gs[i]) : null; if (o && o.members.includes(me.id)) chans.push({ id: g, type: 'grp', name: '👥 ' + o.name, owner: o.owner, members: o.members.map((x) => ({ id: x, n: U[x] ? dname(U[x]) : x })) }); });
      dms.forEach((d) => { const m = /^dm:(g\d+):(g\d+)$/.exec(d); if (!m) return; const o = U[m[1] === me.id ? m[2] : m[1]]; if (o) chans.push({ id: d, type: 'dm', name: '✉️ ' + dname(o) }); });
      const last = await pipe(chans.map((c) => ['LRANGE', 'glc:m:' + c.id, 0, 0]));
      chans.forEach((c, i) => { const r = last[i] && last[i][0]; if (r) { try { const m = JSON.parse(r); c.last = { t: m.t, a: m.a, n: m.n, x: String(m.x).slice(0, 60) }; } catch (e) {} } });
      chans.sort((a, c) => ((c.last && c.last.t) || 0) - ((a.last && a.last.t) || 0));
      return res.status(200).json({ me: { id: me.id, n: dname(me), borr: me.borr, eqs: me.eqs, mod: me.mod }, chans });
    }

    if (act === 'dir') {
      const list = Object.values(U).filter((u) => u.priv && u.id !== me.id).map((u) => ({ id: u.id, n: dname(u), borr: u.borr, team: u.team, eqs: u.eqs })).sort((a, c) => a.n.localeCompare(c.n, 'es')).slice(0, 300);
      return res.status(200).json({ users: list });
    }

    if (act === 'msgs') {
      if (!(await canAccess(me, U, b.chan))) throw fail(403, 'No tienes acceso a este chat');
      const raw = (await cmd('LRANGE', 'glc:m:' + b.chan, 0, SHOW - 1)) || [];
      const msgs = raw.map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean).reverse();
      return res.status(200).json({ msgs });
    }

    if (act === 'send') {
      if (!(await canAccess(me, U, b.chan))) throw fail(403, 'No tienes acceso a este chat');
      const x = clean(b.text, 500); if (!x) throw fail(400, 'Mensaje vacío');
      const ok = await cmd('SET', 'glc:rl:' + me.id, '1', 'EX', '1', 'NX');
      if (!ok) throw fail(429, 'Vas demasiado rápido');
      const msg = { i: crypto.randomBytes(6).toString('hex'), t: Date.now(), a: me.id, n: labelOf(me, b.as), x };
      const c = [['LPUSH', 'glc:m:' + b.chan, JSON.stringify(msg)], ['LTRIM', 'glc:m:' + b.chan, 0, KEEP - 1]];
      const m = /^dm:(g\d+):(g\d+)$/.exec(b.chan);
      if (m) { c.push(['SADD', 'glc:u:' + m[1], b.chan], ['SADD', 'glc:u:' + m[2], b.chan]); }
      await pipe(c);
      return res.status(200).json({ ok: true, msg });
    }

    if (act === 'del') {
      if (!(await canAccess(me, U, b.chan))) throw fail(403, 'No tienes acceso a este chat');
      const raw = (await cmd('LRANGE', 'glc:m:' + b.chan, 0, KEEP - 1)) || [];
      const hit = raw.find((x) => { try { return JSON.parse(x).i === b.mid; } catch (e) { return false; } });
      if (!hit) throw fail(404, 'Mensaje no encontrado');
      if (JSON.parse(hit).a !== me.id && !me.mod) throw fail(403, 'Solo puedes borrar tus mensajes');
      await cmd('LREM', 'glc:m:' + b.chan, 1, hit);
      return res.status(200).json({ ok: true });
    }

    // --- grupos privados: solo los crean cuentas de borrusquad ---
    if (act === 'newgrp') {
      if (!me.eqs.length) throw fail(403, 'Solo las cuentas de borrusquad pueden crear grupos');
      const name = clean(b.name, 40); if (!name) throw fail(400, 'Ponle nombre al grupo');
      const ids = [...new Set((Array.isArray(b.members) ? b.members : []).filter((x) => U[x] && U[x].priv && x !== me.id))].slice(0, 29);
      const gid = crypto.randomBytes(5).toString('hex'), members = [me.id, ...ids];
      await pipe([['HSET', GRP, gid, JSON.stringify({ id: gid, name, owner: me.id, members, t: Date.now() })], ...members.map((m) => ['SADD', 'glc:u:' + m, 'grp:' + gid])]);
      return res.status(200).json({ ok: true, id: 'grp:' + gid });
    }
    if (act === 'grpmem' || act === 'grpleave' || act === 'grpdel') {
      const gid = String(b.gid || ''); if (!/^[a-f0-9]{10}$/.test(gid)) throw fail(400, 'Grupo no válido');
      const g = await groupOf(gid); if (!g) throw fail(404, 'El grupo no existe');
      if (act === 'grpleave') {
        if (g.owner === me.id) throw fail(400, 'Eres el creador: borra el grupo o déjalo a otro');
        if (!g.members.includes(me.id)) throw fail(403, 'No estás en este grupo');
        g.members = g.members.filter((x) => x !== me.id);
        await pipe([['HSET', GRP, gid, JSON.stringify(g)], ['SREM', 'glc:u:' + me.id, 'grp:' + gid]]);
        return res.status(200).json({ ok: true });
      }
      if (g.owner !== me.id && !(act === 'grpdel' && me.mod)) throw fail(403, 'Solo el creador del grupo puede hacerlo');
      if (act === 'grpdel') {
        await pipe([['HDEL', GRP, gid], ['DEL', 'glc:m:grp:' + gid], ...g.members.map((m) => ['SREM', 'glc:u:' + m, 'grp:' + gid])]);
        return res.status(200).json({ ok: true });
      }
      const add = (Array.isArray(b.add) ? b.add : []).filter((x) => U[x] && U[x].priv && !g.members.includes(x));
      const rem = (Array.isArray(b.rem) ? b.rem : []).filter((x) => x !== g.owner && g.members.includes(x));
      g.members = [...g.members.filter((x) => !rem.includes(x)), ...add].slice(0, 30);
      await pipe([['HSET', GRP, gid, JSON.stringify(g)], ...add.map((m) => ['SADD', 'glc:u:' + m, 'grp:' + gid]), ...rem.map((m) => ['SREM', 'glc:u:' + m, 'grp:' + gid])]);
      return res.status(200).json({ ok: true });
    }
    throw fail(400, 'Acción no válida');
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.code ? e.message : 'Error del servidor' });
  }
};
