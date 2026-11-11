/*
 * Golden League — sincronización de progreso de juegos con Supabase
 *
 * Qué hace:
 *  - Vigila en localStorage las claves de juegos (Arcade+, Quiz, Wordle, Snake, Duelos, Carrera...).
 *  - Las sube a user_data.payload.ls  (junto a payload.fl que ya usan las ligas fantasy).
 *  - Al iniciar sesión baja lo que haya en la nube y lo aplica; si cambia algo, recarga una vez
 *    para que los juegos (que leen su estado al arrancar) lo vean.
 *
 * Instalación: en index.html, justo DESPUÉS de <script src="/supabase.js"></script>:
 *    <script src="/gl-cloud-sync.js"></script>
 *
 * No hace falta tocar ningún juego: intercepta localStorage.setItem/removeItem.
 * Resolución de conflictos: gana la escritura más reciente de cada clave.
 */
(function (global) {
  'use strict';

  /* ---- Qué claves se sincronizan (añade o quita aquí) ---- */
  const SYNC_KEY = /^(gl-(qz|daily|career|career-p|career-n|hol|dq|dh|bz|hgd|xp|shop|duel|fy|sim-v1)|glx3-(clk|ttt)|glx-(snk|sim|ms|rv|ss4|ss-x|wd:.*|simond:.*)|glg:.*)$/;
  const MAX_VALUE = 200000;      // no sube valores de más de ~200 KB
  const PUSH_DELAY = 4000;       // espera tras el último cambio (el clicker escribe cada segundo)
  const META = 'gl-cloudsync-meta'; // { clave: timestamp local } (no se sincroniza)

  const ls = global.localStorage;
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  const rawGet = Storage.prototype.getItem;

  let meta = {};
  try { meta = JSON.parse(rawGet.call(ls, META) || '{}') || {}; } catch (e) { meta = {}; }
  const saveMeta = () => { try { rawSet.call(ls, META, JSON.stringify(meta)); } catch (e) {} };

  let ready = false;          // true cuando ya hemos bajado la nube (antes no se sube nada)
  let applying = false;       // true mientras aplicamos datos de la nube (no cuentan como cambios locales)
  const dirty = new Set();
  let pushTimer = null;

  /* ---- Cola para que nadie pise payload.fl ni payload.ls ---- */
  let chain = Promise.resolve();
  function update(mutator) {
    const run = async () => {
      const cur = (await global.GLSupabase.loadMyData()) || {};
      const next = (await mutator(cur)) || cur;
      await global.GLSupabase.saveMyData(next);
      return next;
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  async function hasSession() {
    try { return !!(await global.GLSupabase.getSession()); } catch (e) { return false; }
  }

  /* ---- Interceptar escrituras locales ---- */
  function touch(key) {
    if (applying || !SYNC_KEY.test(key)) return;
    meta[key] = Date.now();
    saveMeta();
    dirty.add(key);
    schedulePush();
  }
  Storage.prototype.setItem = function (k, v) {
    if (this !== ls) return rawSet.call(this, k, v);
    const old = rawGet.call(this, k);
    rawSet.call(this, k, v);
    if (old !== String(v)) touch(String(k));
  };
  Storage.prototype.removeItem = function (k) {
    if (this !== ls) return rawRemove.call(this, k);
    const had = rawGet.call(this, k) != null;
    rawRemove.call(this, k);
    if (had) touch(String(k));
  };

  function schedulePush(delay) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, delay == null ? PUSH_DELAY : delay);
  }

  async function push() {
    if (!ready || !dirty.size || !(await hasSession())) return;
    const keys = [...dirty];
    dirty.clear();
    try {
      await update(cur => {
        cur.ls = cur.ls || {};
        keys.forEach(k => {
          const v = rawGet.call(ls, k);
          if (v == null) cur.ls[k] = { v: null, t: meta[k] || Date.now() };
          else if (v.length <= MAX_VALUE) cur.ls[k] = { v, t: meta[k] || Date.now() };
        });
        return cur;
      });
    } catch (e) {
      console.error('GLCloud push', e);
      keys.forEach(k => dirty.add(k));
      schedulePush(30000);
    }
  }

  /* ---- Bajar y fusionar ---- */
  async function pull() {
    if (!(await hasSession())) { ready = false; return; }
    let changed = 0;
    try {
      const cloud = (await global.GLSupabase.loadMyData()) || {};
      const remote = cloud.ls || {};
      applying = true;
      Object.keys(remote).forEach(k => {
        if (!SYNC_KEY.test(k)) return;
        const r = remote[k] || {};
        const lv = rawGet.call(ls, k);
        const lt = meta[k] || 0;
        if ((r.v == null ? null : r.v) === lv) { if (!lt) meta[k] = r.t || 0; return; }
        // Primera vez en este dispositivo y ya hay datos locales distintos: se queda lo local y se sube.
        if (!lt && lv != null) { dirty.add(k); meta[k] = Date.now(); return; }
        if ((r.t || 0) > lt) {
          if (r.v == null) rawRemove.call(ls, k); else rawSet.call(ls, k, r.v);
          meta[k] = r.t || Date.now();
          changed++;
        } else {
          dirty.add(k); // lo local es más nuevo
        }
      });
      applying = false;
      // Claves locales que la nube no tiene todavía
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (SYNC_KEY.test(k) && !(k in remote)) { if (!meta[k]) meta[k] = Date.now(); dirty.add(k); }
      }
      saveMeta();
    } catch (e) {
      applying = false;
      console.error('GLCloud pull', e);
      return;
    }
    ready = true;
    if (dirty.size) schedulePush(1500);
    // Los juegos leen su estado al arrancar: recarga una sola vez si la nube ha cambiado algo
    if (changed) {
      let last = 0;
      try { last = +sessionStorage.getItem('gl-cloudsync-reload') || 0; } catch (e) {}
      if (Date.now() - last > 600000) {
        try { sessionStorage.setItem('gl-cloudsync-reload', String(Date.now())); } catch (e) {}
        try { global.toast && global.toast('☁️ Progreso sincronizado'); } catch (e) {}
        setTimeout(() => location.reload(), 600);
      }
    }
  }

  function start() {
    if (!global.GLSupabase) return console.warn('GLCloud: falta supabase.js');
    try {
      global.GLSupabase.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') pull();
        if (event === 'SIGNED_OUT') ready = false;
      });
    } catch (e) { console.error('GLCloud auth', e); }
    pull();
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) push(); else pull(); });
  global.addEventListener('pagehide', () => { push(); });

  global.GLCloud = Object.freeze({ update, pull, push, isReady: () => ready });
  start();
})(window);
