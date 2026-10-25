// Función de Vercel: «Mi zona» privada de borrushers y borrusquads (Upstash Redis, mismas variables que data.js).
// Borrusher: diario, objetivos, modo «abierto a ofertas» y bandeja de ofertas.
// Borrusquad (staff): tablón, entrenos con asistencia, ojeador + ofertas a borrushers y notas privadas del staff.
// Cada petición lleva la cuenta (acc) y su clave (proof); se comprueba contra la huella guardada en la liga.
const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'goldenleague', GC = 'FLCARTAS';
const H = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const sha = (x) => crypto.createHash('sha256').update(String(x)).digest('hex');
const decode = (p) => { try { return JSON.parse((p || []).slice(1).join('')); } catch (e) { return null; } };
const cmd = async (...a) => { const r = await fetch(URL_, { method: 'POST', headers: H, body: JSON.stringify(a) }); const j = await r.json(); if (j.error) throw new Error(j.error); return j.result; };
const jget = async (k) => { const r = await cmd('GET', k); return r ? JSON.parse(r) : null; };
const jset = (k, v) => cmd('SET', k, JSON.stringify(v));
const fail = (code, msg) => { const e = new Error(msg); e.code = code; return e; };
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);
const rid = () => crypto.randomBytes(5).toString('hex');
const arr = (x, n) => (Array.isArray(x) ? x.slice(0, n) : []);

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
    U[id] = { id, n: r.n || id, h: r.h, borr, eqs, team, teams: [...new Set([...eqs, team].filter(Boolean))], priv: !!(borr || eqs.length) };
  });
  CACHE = { t: Date.now(), v: U };
  return U;
}
const dname = (u) => u.borr || u.n;
const hall = async (k) => { const f = (await cmd('HGETALL', k)) || []; const o = []; for (let i = 1; i < f.length; i += 2) { try { o.push(JSON.parse(f[i])); } catch (e) {} } return o; };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'Falta conectar la base de datos (Upstash)' });
  let b; try { b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch (e) { return res.status(400).json({ error: 'JSON no válido' }); }
  b = b || {};
  try {
    // --- admin: ofertas aceptadas pendientes de fichar ---
    if (b.act === 'adminOffers' || b.act === 'adminOfferDone') {
      const pw = process.env.ADMIN_PASSWORD;
      if (!pw || req.headers['x-admin'] !== pw) throw fail(401, 'Clave incorrecta');
      if (b.act === 'adminOfferDone') {
        const raw = await cmd('HGET', 'glz:offers', String(b.oid || '')); if (!raw) throw fail(404, 'Oferta no encontrada');
        const o = JSON.parse(raw); o.estado = 'hecha'; await cmd('HSET', 'glz:offers', o.id, JSON.stringify(o));
        return res.status(200).json({ ok: true });
      }
      const all = (await hall('glz:offers')).filter((o) => ['pend', 'ok'].includes(o.estado)).sort((a, c) => c.t - a.t);
      return res.status(200).json({ offers: all });
    }

    const U = await users(), me = U[b.acc];
    if (!me || typeof b.proof !== 'string' || !b.proof || sha(b.proof) !== me.h) throw fail(401, 'Sesión no válida: vuelve a iniciar sesión');
    if (!me.priv) throw fail(403, 'Esta zona es solo para borrushers y borrusquads');
    const act = b.act, team = clean(b.team, 40);
    const staffOf = (t) => me.eqs.includes(t), memberOf = (t) => me.teams.includes(t);
    const TK = (t) => 'glz:t:' + t;
    const getT = async (t) => { const x = (await jget(TK(t))) || {}; return { board: x.board || [], events: x.events || [], tnotes: x.tnotes || [] }; };

    if (act === 'me') {
      const P = (await jget('glz:p:' + me.id)) || {};
      const open = me.borr ? !!(await cmd('SISMEMBER', 'glz:open', me.id)) : false;
      const all = await hall('glz:offers');
      return res.status(200).json({
        P: { notes: P.notes || [], goals: P.goals || [], short: P.short || [], open },
        offers: { in: all.filter((o) => o.toAcc === me.id).sort((a, c) => c.t - a.t), out: all.filter((o) => o.fromAcc === me.id || staffOf(o.team)).sort((a, c) => c.t - a.t) },
        team: me.team, teams: me.teams, staff: me.eqs,
      });
    }

    if (act === 'pset') {
      const P = {
        notes: arr(b.notes, 100).map((n) => ({ i: clean(n.i, 12) || rid(), t: +n.t || Date.now(), x: clean(n.x, 1000) })).filter((n) => n.x),
        goals: arr(b.goals, 30).map((g) => ({ i: clean(g.i, 12) || rid(), k: clean(g.k, 10), m: Math.max(0, Math.min(1e6, +g.m || 0)), T: +g.T || 1, x: clean(g.x, 120), d: !!g.d, t: +g.t || Date.now() })),
        short: arr(b.short, 50).map((s) => ({ b: clean(s.b, 60), x: clean(s.x, 300) })).filter((s) => s.b),
      };
      await jset('glz:p:' + me.id, P);
      if (typeof b.open === 'boolean' && me.borr) await cmd(b.open ? 'SADD' : 'SREM', 'glz:open', me.id);
      return res.status(200).json({ ok: true });
    }

    // --- equipo: tablón, entrenos, notas del staff ---
    if (['team', 'tpost', 'tdel', 'tevent', 'tevdel', 'trsvp', 'tnotes'].includes(act)) {
      if (!team || !memberOf(team)) throw fail(403, 'No perteneces a esa borrusquad');
      const staff = staffOf(team), T = await getT(team);
      if (act === 'team') return res.status(200).json({ board: T.board, events: T.events, tnotes: staff ? T.tnotes : undefined, staff });
      if (act === 'trsvp') {
        const ev = T.events.find((e) => e.i === b.eid); if (!ev) throw fail(404, 'Entreno no encontrado');
        (ev.rs = ev.rs || {})[me.id] = { v: b.v ? 1 : 0, n: dname(me) };
      } else {
        if (!staff) throw fail(403, 'Solo el staff de la borrusquad puede hacerlo');
        if (act === 'tpost') { const x = clean(b.text, 600); if (!x) throw fail(400, 'Escribe algo'); T.board.unshift({ i: rid(), t: Date.now(), a: me.id, n: dname(me), x, pin: !!b.pin }); T.board = T.board.slice(0, 50); }
        else if (act === 'tdel') T.board = T.board.filter((p) => p.i !== b.pid);
        else if (act === 'tevent') {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.f || ''))) throw fail(400, 'Fecha no válida');
          const h = /^\d{2}:\d{2}$/.test(String(b.h || '')) ? b.h : '';
          T.events.push({ i: rid(), f: b.f, h, x: clean(b.x, 200), by: dname(me), rs: {} });
          T.events.sort((a, c) => (a.f + a.h).localeCompare(c.f + c.h)); T.events = T.events.slice(-40);
        } else if (act === 'tevdel') T.events = T.events.filter((e) => e.i !== b.eid);
        else if (act === 'tnotes') T.tnotes = arr(b.notes, 60).map((n) => ({ i: clean(n.i, 12) || rid(), t: +n.t || Date.now(), n: clean(n.n, 40) || dname(me), x: clean(n.x, 1000) })).filter((n) => n.x);
      }
      await jset(TK(team), T);
      return res.status(200).json({ ok: true });
    }

    // --- ojeador y ofertas (solo staff) ---
    if (act === 'scout') {
      if (!me.eqs.length) throw fail(403, 'Solo las cuentas de borrusquad pueden ojear');
      const open = new Set((await cmd('SMEMBERS', 'glz:open')) || []);
      return res.status(200).json({ list: Object.values(U).filter((u) => u.borr).map((u) => ({ n: u.borr, team: u.team, open: open.has(u.id) })) });
    }
    if (act === 'offer') {
      if (!staffOf(team)) throw fail(403, 'Solo el staff de esa borrusquad puede enviar ofertas');
      const to = Object.values(U).find((u) => u.borr && u.borr === clean(b.to, 60));
      if (!to) throw fail(404, 'Ese borrusher aún no tiene cuenta, no puede recibir ofertas');
      if (to.team === team) throw fail(400, 'Ese borrusher ya es de tu borrusquad');
      const all = await hall('glz:offers');
      if (all.some((o) => o.team === team && o.toAcc === to.id && o.estado === 'pend')) throw fail(400, 'Ya tienes una oferta pendiente para ese borrusher');
      if (all.filter((o) => o.team === team && o.estado === 'pend').length >= 8) throw fail(400, 'Demasiadas ofertas pendientes: espera respuestas o cancela alguna');
      const o = { id: rid(), team, fromAcc: me.id, fromN: dname(me), to: to.borr, toAcc: to.id, msg: clean(b.msg, 400), t: Date.now(), estado: 'pend' };
      await cmd('HSET', 'glz:offers', o.id, JSON.stringify(o));
      return res.status(200).json({ ok: true });
    }
    if (act === 'oresp' || act === 'ocanc') {
      const raw = await cmd('HGET', 'glz:offers', String(b.oid || '')); if (!raw) throw fail(404, 'Oferta no encontrada');
      const o = JSON.parse(raw); if (o.estado !== 'pend') throw fail(400, 'Esa oferta ya no está pendiente');
      if (act === 'oresp') { if (o.toAcc !== me.id) throw fail(403, 'Esa oferta no es para ti'); o.estado = b.v === 'ok' ? 'ok' : 'no'; }
      else { if (!staffOf(o.team)) throw fail(403, 'No puedes cancelar esa oferta'); o.estado = 'canc'; }
      o.r = Date.now();
      await cmd('HSET', 'glz:offers', o.id, JSON.stringify(o));
      return res.status(200).json({ ok: true });
    }
    throw fail(400, 'Acción no válida');
  } catch (e) {
    return res.status(e.code || 500).json({ error: e.code ? e.message : 'Error del servidor' });
  }
};
