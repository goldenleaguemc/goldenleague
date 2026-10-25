// api/verify.js — verificación de correo con código de 6 dígitos (Resend + Upstash/Vercel KV)
// Variables de entorno necesarias: RESEND_API_KEY, MAIL_FROM
// (KV_REST_API_URL y KV_REST_API_TOKEN ya las tienes por la base de datos)
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DAILY_MAX = 80; // tope global de correos al día (el plan gratis de Resend permite 100)

const cmd = async c => (await (await fetch(URL_, {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + TOK },
  body: JSON.stringify(c)
})).json()).result;

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
// mismo id que calcula el navegador (accIdOf en index.html)
const idOf = e => 'g' + BigInt('0x' + sha('borru-acc:' + e).slice(0, 12)).toString();
const okMail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length < 120;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!URL_ || !TOK) return res.status(500).json({ error: 'falta la base de datos' });

  let b = {};
  try { b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { return res.status(400).json({ error: 'petición no válida' }); }

  const email = String(b.email || '').trim().toLowerCase();
  if (!okMail(email)) return res.status(400).json({ error: 'correo no válido' });
  const id = idOf(email);

  // 1) Enviar código
  if (b.act === 'start') {
    if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM)
      return res.status(500).json({ error: 'falta configurar el correo (RESEND_API_KEY / MAIL_FROM)' });

    // una petición por minuto y por correo
    const fresh = await cmd(['SET', 'vr:rl:' + id, '1', 'NX', 'EX', '60']);
    if (!fresh) return res.status(429).json({ error: 'espera un minuto antes de pedir otro código' });

    // tope global diario
    const day = new Date().toISOString().slice(0, 10);
    const n = await cmd(['INCR', 'vr:day:' + day]);
    if (n === 1) await cmd(['EXPIRE', 'vr:day:' + day, '90000']);
    if (n > DAILY_MAX) return res.status(429).json({ error: 'hoy se ha alcanzado el límite de registros, prueba mañana' });

    const code = String(crypto.randomInt(100000, 1000000));
    await cmd(['SET', 'vr:c:' + id, sha(code + id), 'EX', '600']); // caduca en 10 min
    await cmd(['DEL', 'vr:a:' + id]);

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [email],
        subject: 'Tu código de Golden League: ' + code,
        html: '<p>Tu código de verificación es:</p>' +
              '<h1 style="letter-spacing:6px">' + code + '</h1>' +
              '<p>Caduca en 10 minutos. Si no lo has pedido tú, ignora este correo.</p>'
      })
    });
    if (!r.ok) {
      let t = ''; try { t = (await r.text()).slice(0, 160); } catch (_) {}
      console.error('Resend', r.status, t);
      return res.status(502).json({ error: 'no se pudo enviar el correo' });
    }
    return res.json({ ok: true });
  }

  // 2) Comprobar código
  if (b.act === 'check') {
    const n = await cmd(['INCR', 'vr:a:' + id]);
    await cmd(['EXPIRE', 'vr:a:' + id, '600']);
    if (n > 5) return res.status(429).json({ error: 'demasiados intentos, pide otro código' });

    const h = await cmd(['GET', 'vr:c:' + id]);
    if (!h || h !== sha(String(b.code || '').trim() + id))
      return res.status(400).json({ error: 'código incorrecto o caducado' });

    await cmd(['DEL', 'vr:c:' + id]);
    await cmd(['SET', 'vr:ok:' + id, '1', 'EX', '3600']); // 1 hora para completar el registro
    return res.json({ ok: true });
  }

  res.status(400).json({ error: 'acción desconocida' });
};
