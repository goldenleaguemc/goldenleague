/*
 * Golden League / BORRUSH — Supabase client helper
 *
 * This file provides Supabase Auth + per-user cloud data helpers.
 * It does NOT, by itself, replace the old account UI in index.html.
 *
 * Setup:
 * 1) Load supabase-js v2 before this file:
 *    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * 2) Replace the two placeholders below with your Supabase Project URL
 *    and publishable key (or legacy anon key). Never put service_role/secret here.
 * 3) Run the SQL supplied in the ChatGPT instructions in Supabase SQL Editor.
 * 4) Load this file before the app code that will call window.GLSupabase.
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://nanwjwnaugevdowehxfg.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pO2aSBZxZ0oa2Em7KkHS3Q_JBzsnYSR';

  let client = null;

  function getClient() {
    if (client) return client;

    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      throw new Error(
        'No se ha cargado Supabase JS. Añade el script de supabase-js v2 antes de supabase.js.'
      );
    }

    if (
      SUPABASE_URL.includes('PASTE_') ||
      SUPABASE_PUBLISHABLE_KEY.includes('PASTE_')
    ) {
      throw new Error('Configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY en supabase.js.');
    }

    client = global.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: global.localStorage
        }
      }
    );

    return client;
  }

  function cleanError(error) {
    const message = error && error.message ? error.message : 'Error desconocido de Supabase';
    return new Error(message);
  }

  async function signUp({ email, password, displayName }) {
    const db = getClient();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const name = String(displayName || '').trim().slice(0, 40);

    if (!name) throw new Error('Escribe el nombre que quieres mostrar.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      throw new Error('Escribe un correo válido.');
    }
    if (String(password || '').length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres.');
    }

    const { data, error } = await db.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { display_name: name }
      }
    });

    if (error) throw cleanError(error);

    // With email confirmation enabled, session can be null until the user
    // confirms the message sent by Supabase.
    return {
      user: data.user,
      session: data.session,
      needsEmailConfirmation: !data.session
    };
  }

  async function signIn({ email, password }) {
    const db = getClient();
    const { data, error } = await db.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: String(password || '')
    });
    if (error) throw cleanError(error);
    return { user: data.user, session: data.session, profile: await getProfile() };
  }

  async function signOut() {
    const { error } = await getClient().auth.signOut();
    if (error) throw cleanError(error);
    return true;
  }

  async function getSession() {
    const { data, error } = await getClient().auth.getSession();
    if (error) throw cleanError(error);
    return data.session || null;
  }

  async function getUser() {
    const { data, error } = await getClient().auth.getUser();
    if (error) throw cleanError(error);
    return data.user || null;
  }

  async function getProfile() {
    const user = await getUser();
    if (!user) return null;

    const { data, error } = await getClient()
      .from('profiles')
      .select('id, display_name, role, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw cleanError(error);
    return data;
  }

  async function updateProfile({ displayName }) {
    const user = await getUser();
    if (!user) throw new Error('Inicia sesión primero.');

    const name = String(displayName || '').trim().slice(0, 40);
    if (!name) throw new Error('El nombre no puede estar vacío.');

    const { data, error } = await getClient()
      .from('profiles')
      .update({ display_name: name })
      .eq('id', user.id)
      .select('id, display_name, role, created_at, updated_at')
      .single();

    if (error) throw cleanError(error);
    return data;
  }

  // Stores the signed-in user's private JSON payload in the cloud.
  // Public league data (matches, standings, competitions) should remain in
  // the existing /api/data + Upstash system unless separately migrated.
  async function loadMyData() {
    const user = await getUser();
    if (!user) throw new Error('Inicia sesión para cargar tus datos.');

    const { data, error } = await getClient()
      .from('user_data')
      .select('payload, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw cleanError(error);
    return data ? data.payload : null;
  }

  async function saveMyData(payload) {
    const user = await getUser();
    if (!user) throw new Error('Inicia sesión para guardar tus datos.');
    if (payload === undefined) throw new Error('No se han indicado datos para guardar.');

    const { data, error } = await getClient()
      .from('user_data')
      .upsert(
        {
          user_id: user.id,
          payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )
      .select('user_id, updated_at')
      .single();

    if (error) throw cleanError(error);
    return data;
  }

  function onAuthStateChange(callback) {
    const { data } = getClient().auth.onAuthStateChange((event, session) => {
      try {
        callback(event, session || null);
      } catch (error) {
        console.error('GLSupabase auth callback:', error);
      }
    });
    return data.subscription;
  }

  async function requireUser() {
    const user = await getUser();
    if (!user) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión.');
    return user;
  }

  global.GLSupabase = Object.freeze({
    init: getClient,
    signUp,
    signIn,
    signOut,
    getSession,
    getUser,
    getProfile,
    updateProfile,
    loadMyData,
    saveMyData,
    onAuthStateChange,
    requireUser
  });
})(window);
