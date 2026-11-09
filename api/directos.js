/* /api/directos — devuelve SOLO los directos del canal de YouTube @goldenleaguemc.
 * Requiere la variable de entorno YT_API_KEY (YouTube Data API v3, gratuita).
 * Lee la lista de «subidas» del canal y se queda con los vídeos que tienen liveStreamingDetails
 * (es decir, los que fueron, son o serán directos). Cachea 10 min; cada ejecución cuesta ~2-80 unidades de cuota (de 10.000/día). */
const CHANNEL = 'UCme1DJL1AmQZZBWo7v8wQyA';
const UPLOADS = 'UU' + CHANNEL.slice(2);
const API = 'https://www.googleapis.com/youtube/v3';
let cache = { t: 0, data: null };

async function yt(path, params, key) {
  const r = await fetch(`${API}/${path}?${new URLSearchParams({ ...params, key })}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || `YouTube API ${r.status}`);
  return j;
}

async function fetchAll(key) {
  const ids = [];
  let page = '';
  for (let i = 0; i < 60; i++) {            // hasta 3.000 vídeos
    const j = await yt('playlistItems', { part: 'contentDetails', playlistId: UPLOADS, maxResults: 50, ...(page ? { pageToken: page } : {}) }, key);
    (j.items || []).forEach(x => x.contentDetails && ids.push(x.contentDetails.videoId));
    page = j.nextPageToken;
    if (!page) break;
  }
  const items = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt('videos', { part: 'snippet,contentDetails,liveStreamingDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 }, key);
    for (const v of j.items || []) {
      const l = v.liveStreamingDetails;
      if (!l) continue;                      // vídeo normal → fuera
      const lbc = v.snippet.liveBroadcastContent;
      items.push({
        id: v.id,
        title: v.snippet.title,
        start: l.actualStartTime || l.scheduledStartTime || v.snippet.publishedAt,
        dur: v.contentDetails.duration,
        state: lbc === 'live' ? 'live' : lbc === 'upcoming' ? 'upcoming' : 'done',
      });
    }
  }
  items.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  return { updated: new Date().toISOString(), items };
}

module.exports = async (req, res) => {
  const key = process.env.YT_API_KEY;
  if (!key) return res.status(503).json({ error: 'Falta la variable YT_API_KEY en el servidor' });
  try {
    if (!cache.data || Date.now() - cache.t > 10 * 60 * 1000) cache = { t: Date.now(), data: await fetchAll(key) };
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    return res.status(200).json(cache.data);
  } catch (e) {
    if (cache.data) return res.status(200).json(cache.data);   // si falla YouTube, sirve lo último guardado
    return res.status(502).json({ error: String(e.message || e) });
  }
};
