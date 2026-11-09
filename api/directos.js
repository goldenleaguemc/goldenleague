/* /api/directos — SIN clave de YouTube.
 * GET : últimos ~15 vídeos del canal (RSS; directos y vídeos normales, con estado si YouTube deja leerlo) + lo guardado en Supabase.
 * POST: solo admin (cabecera x-admin = ADMIN_PASSWORD):
 *   {act:'save',   id, title, start, dur}   → guarda un directo para siempre
 *   {act:'add',    url, title?, start?}     → añade uno a mano (autorrellena desde YouTube si puede)
 *   {act:'remove', id}                      → lo quita de los guardados
 * Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD */
const CHANNEL = 'UCme1DJL1AmQZZBWo7v8wQyA';
const RSS = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;
const TABLE = 'directos_guardados';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Cookie': 'CONSENT=YES+1; SOCS=CAI',
};
const TTL = 10 * 60 * 1000;
let rssCache = { t: 0, items: null };
const settled = new Map();   // id -> item ya terminado (o null si es vídeo normal)

/* ---------- Supabase (REST) ---------- */
const sbUrl = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const sbKey = () => process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const sbOk = () => !!(sbUrl() && sbKey());
async function sb(path, opt = {}) {
  const r = await fetch(`${sbUrl()}/rest/v1/${path}`, {
    ...opt,
    headers: { apikey: sbKey(), Authorization: 'Bearer ' + sbKey(), 'Content-Type': 'application/json', ...(opt.headers || {}) },
  });
  if (!r.ok) { let m = ''; try { m = (await r.json()).message; } catch (e) {} throw new Error(m || 'Supabase ' + r.status); }
  return r.status === 204 ? null : r.json().catch(() => null);
}
const readSaved = () => sb(`${TABLE}?select=id,title,start,dur&order=start.desc&limit=5000`);
const upsertSaved = it => sb(`${TABLE}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ id: it.id, title: it.title, start: it.start, dur: it.dur || null }]) });
const deleteSaved = id => sb(`${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });

/* ---------- YouTube sin clave ---------- */
const isoDur = sec => {
  sec = Number(sec) || 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return 'PT' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + (s || (!h && !m) ? s + 'S' : '');
};
const unesc = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function readRss() {
  const r = await fetch(RSS, { headers: HEADERS });
  if (!r.ok) throw new Error('RSS ' + r.status);
  const xml = await r.text(), out = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = (e.match(/<yt:videoId>([^<]+)</) || [])[1];
    if (id) out.push({ id, title: unesc((e.match(/<title>([^<]*)</) || [])[1]), published: (e.match(/<published>([^<]+)</) || [])[1] });
  }
  return out;
}

/* force=true: acepta también vídeos normales (para añadir a mano) */
async function inspect(v, force) {
  const r = await fetch('https://www.youtube.com/watch?v=' + v.id, { headers: HEADERS });
  if (!r.ok) throw new Error('YouTube respondió ' + r.status);
  const html = await r.text();
  const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:var\s|<\/script>)/);
  if (!m) throw new Error('no se han podido leer los datos del vídeo');
  const p = JSON.parse(m[1]), vd = p.videoDetails || {};
  if (!vd.videoId) {   // YouTube no ha dado los datos (bloqueo / "confirma que no eres un robot"): no es "vídeo normal"
    const ps = p.playabilityStatus || {};
    throw new Error('YouTube no da los datos del vídeo desde este servidor (' + (ps.status || 'sin estado') + (ps.reason ? ': ' + ps.reason : '') + ')');
  }
  const mf = (p.microformat && p.microformat.playerMicroformatRenderer) || {};
  const lb = mf.liveBroadcastDetails || null;
  const isLive = !!(lb || vd.isLive || vd.isUpcoming || vd.isLiveContent);
  if (!isLive && !force) return null;                       // vídeo normal
  const live = !!(vd.isLive || (lb && lb.isLiveNow));
  return {
    id: v.id,
    title: vd.title || v.title || '',
    start: (lb && lb.startTimestamp) || mf.publishDate || v.published || '',
    dur: isoDur(vd.lengthSeconds),
    state: live ? 'live' : (!live && vd.isUpcoming) ? 'upcoming' : 'done',
  };
}

async function recent(diag) {
  if (!diag && rssCache.items && Date.now() - rssCache.t < TTL) return rssCache.items;
  const feed = await readRss(), items = [];
  let fails = 0;
  for (const v of feed) {
    if (!diag && settled.has(v.id)) { items.push(settled.get(v.id)); continue; }
    let it;
    try {
      it = await inspect(v, true);                // lee estado, título, fecha y duración reales
      if (diag) diag.push({ id: v.id, title: v.title, resultado: 'ok (' + it.state + ')' });
      if (it.state === 'done') settled.set(v.id, it);
    } catch (e) {
      fails++;                                    // YouTube no responde: se muestra igualmente con los datos del RSS
      it = { id: v.id, title: v.title, start: v.published, dur: '', state: 'done' };
      if (diag) diag.push({ id: v.id, title: v.title, resultado: 'solo RSS (sin estado ni duración): ' + (e.message || e) });
    }
    items.push(it);
  }
  if (!fails) rssCache = { t: Date.now(), items };   // si hubo fallos no se cachea, para reintentar
  return items;
}

/* ---------- Handler ---------- */
const videoId = s => { const m = String(s || '').trim().match(/(?:v=|youtu\.be\/|\/live\/|\/shorts\/|\/embed\/)([\w-]{11})|^([\w-]{11})$/); return m ? (m[1] || m[2]) : ''; };
const readBody = req => { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } return b || {}; };

module.exports = async (req, res) => {
  /* ----- POST: acciones de admin ----- */
  if (req.method === 'POST') {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw || req.headers['x-admin'] !== pw) return res.status(401).json({ error: 'Clave de admin incorrecta' });
    if (!sbOk()) return res.status(503).json({ error: 'Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el servidor' });
    const b = readBody(req);
    try {
      if (b.act === 'check') return res.status(200).json({ ok: true });
      if (b.act === 'remove') {
        if (!videoId(b.id)) return res.status(400).json({ error: 'Id no válido' });
        await deleteSaved(videoId(b.id));
        return res.status(200).json({ ok: true });
      }
      if (b.act === 'save' || b.act === 'add') {
        const id = videoId(b.act === 'add' ? b.url : b.id);
        if (!id) return res.status(400).json({ error: 'No reconozco ese enlace de YouTube' });
        let it = { id, title: String(b.title || '').trim(), start: b.start || '', dur: b.dur || '' };
        if (b.act === 'add' || !it.title || !it.start) {
          try {
            const y = await inspect({ id, title: it.title, published: it.start }, true);
            it = { id, title: it.title || y.title, start: it.start || y.start, dur: it.dur || y.dur };
          } catch (e) { /* si YouTube no responde, hace falta título y fecha a mano */ }
        }
        if (!it.title || isNaN(Date.parse(it.start))) return res.status(422).json({ error: 'No he podido leer el vídeo en YouTube: escribe tú el título y la fecha' });
        it.start = new Date(it.start).toISOString();
        await upsertSaved(it);
        return res.status(200).json({ ok: true, item: it });
      }
      return res.status(400).json({ error: 'Acción desconocida' });
    } catch (e) { return res.status(502).json({ error: String(e.message || e) }); }
  }

  /* ----- GET ?debug=1: diagnóstico de lo que ve el servidor ----- */
  if (req.query && req.query.debug) {
    const diag = []; let rssN = 0, e1 = '';
    try { rssN = (await readRss()).length; await recent(diag); } catch (e) { e1 = String(e.message || e); }
    let savedN = null, e2 = '';
    if (sbOk()) { try { savedN = ((await readSaved()) || []).length; } catch (e) { e2 = String(e.message || e); } } else e2 = 'faltan SUPABASE_URL / SUPABASE_SERVICE_KEY';
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ rss_videos: rssN, error_rss: e1 || undefined, guardados_en_supabase: savedN, error_supabase: e2 || undefined, videos: diag });
  }

  /* ----- GET: últimos del canal + guardados ----- */
  let rec = [], saved = [], err = '';
  try { rec = await recent(); } catch (e) { err = String(e.message || e); if (rssCache.items) rec = rssCache.items; }
  if (sbOk()) { try { saved = (await readSaved()) || []; } catch (e) { err = err || String(e.message || e); } }
  if (!rec.length && !saved.length && err) return res.status(502).json({ error: err });

  const map = new Map();
  for (const s of saved) map.set(s.id, { id: s.id, title: s.title, start: s.start, dur: s.dur || '', state: 'done', saved: true });
  for (const r of rec) {
    const s = map.get(r.id);
    map.set(r.id, s ? { ...s, state: r.state, dur: s.dur || r.dur } : { ...r, saved: false });
  }
  const items = [...map.values()].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ updated: new Date().toISOString(), items });
};
