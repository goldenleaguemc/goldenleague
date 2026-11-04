// Autenticación compartida: valida el JWT de Supabase y conserva el ID histórico g... derivado del correo.
const crypto = require('crypto');
const U = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const K = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DBKEY = 'goldenleague';
const GC = 'FLCARTAS';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const idFromEmail = (email) => 'g' + BigInt('0x' + sha('borru-acc:' + String(email || '').trim().toLowerCase()).slice(0, 12)).toString();
const decode = (p) => { try { return JSON.parse((p || []).slice(1).join('')); } catch (_) { return null; } };
async function readLeague() {
  if (!U || !K) throw new Error('Falta conectar Upstash');
  const r = await fetch(`${U}/get/${DBKEY}`, { headers: { Authorization: `Bearer ${K}` } });
  const j = await r.json();
  if (!r.ok || !j.result) throw new Error('No se pudo leer la base de datos de la liga');
  return JSON.parse(j.result);
}
async function requireAuth(req, opts = {}) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = /^Bearer\s+(.+)$/i.exec(header);
  if (!token) { const e = new Error('Inicia sesión para continuar'); e.status = 401; throw e; }
  const supaUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!supaUrl || !apiKey) { const e = new Error('Faltan SUPABASE_URL y SUPABASE_ANON_KEY en Vercel'); e.status = 500; throw e; }
  const r = await fetch(`${supaUrl}/auth/v1/user`, { headers: { apikey: apiKey, Authorization: `Bearer ${token[1]}` } });
  if (!r.ok) { const e = new Error('Sesión de Supabase no válida o caducada'); e.status = 401; throw e; }
  const user = await r.json();
  const email = String(user.email || '').trim().toLowerCase();
  if (!email) { const e = new Error('La cuenta de Supabase no tiene un correo'); e.status = 403; throw e; }
  const id = idFromEmail(email);
  const data = await readLeague();
  if ((data.cuentasDel || []).some((x) => x.id === id)) { const e = new Error('Esta cuenta ha sido eliminada por un administrador'); e.status = 403; throw e; }
  const record = decode((((data.quiniela || {})[GC]) || {})['_' + id]);
  if (!record || record.v !== 1) {
    if (!opts.allowMissingRecord) { const e = new Error('No se ha encontrado el perfil de esta cuenta en la liga'); e.status = 403; throw e; }
  }
  const account = (data.cuentas || []).find((x) => x.id === id) || {};
  return { id, email, user, data, record, account, name: String((record && record.n) || account.nombre || user.user_metadata?.display_name || email).slice(0, 40), token: token[1] };
}
module.exports = { requireAuth, idFromEmail, readLeague, decode, sha, DBKEY, GC, U, K };
