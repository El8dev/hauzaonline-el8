// src/data/datasources/supabase.js

window.getSupabaseConfig = function getSupabaseConfig() {
  const envUrl = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ? import.meta.env.VITE_SUPABASE_URL : "";
  const envKey = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ? import.meta.env.VITE_SUPABASE_ANON_KEY : "";
  
  const url = envUrl || localStorage.getItem("MZMZ_SUPABASE_URL") || window.SUPABASE_DEFAULT_URL || "";
  const key = envKey || localStorage.getItem("MZMZ_SUPABASE_KEY") || window.SUPABASE_DEFAULT_KEY || "";
  return { url, key };
}

window.saveSupabaseConfig = function saveSupabaseConfig(url, key) {
  localStorage.setItem("MZMZ_SUPABASE_URL", url);
  localStorage.setItem("MZMZ_SUPABASE_KEY", key);
}

window.clearSupabaseConfig = function clearSupabaseConfig() {
  localStorage.removeItem("MZMZ_SUPABASE_URL");
  localStorage.removeItem("MZMZ_SUPABASE_KEY");
}

window.getSupabaseClient = function getSupabaseClient() {
  const { url, key } = window.getSupabaseConfig();
  
  if (!url || !key) {
    return null;
  }

  if (typeof window !== "undefined" && window.supabase) {
    return window.supabase.createClient(url, key);
  }

  console.error("Supabase CDN library is not loaded on the window object.");
  return null;
}
