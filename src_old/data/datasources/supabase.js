// src/data/datasources/supabase.js

const DEFAULT_SUPABASE_URL = "https://sfgoehzkmjelquqnezea.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmZ29laHprbWplbHF1cW5lemVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzU5ODYsImV4cCI6MjEwMDY1MTk4Nn0.t31h-HfT4rfaGD1YOE4Xdk9d7MYvxd3bR3rJEu7yFy4";

window.getSupabaseConfig = function getSupabaseConfig() {
  const envUrl = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ? import.meta.env.VITE_SUPABASE_URL : "";
  const envKey = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ? import.meta.env.VITE_SUPABASE_ANON_KEY : "";

  const url = envUrl || localStorage.getItem("MZMZ_SUPABASE_URL") || window.SUPABASE_DEFAULT_URL || DEFAULT_SUPABASE_URL;
  const key = envKey || localStorage.getItem("MZMZ_SUPABASE_KEY") || window.SUPABASE_DEFAULT_KEY || DEFAULT_SUPABASE_KEY;
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

// عميل واحد مشترك: إنشاء عميل جديد في كل استدعاء كان يشغّل مؤقتات تجديد جلسة متعددة
// تتسابق على نفس رمز التحديث فتنتهي جلسة المشرف فجأة.
let cachedClient = null;
let cachedClientKey = "";

window.getSupabaseClient = function getSupabaseClient() {
  const { url, key } = window.getSupabaseConfig();

  if (!url || !key) {
    return null;
  }

  const clientKey = `${url}|${key}`;
  if (cachedClient && cachedClientKey === clientKey) {
    return cachedClient;
  }

  if (typeof window !== "undefined" && window.supabase) {
    cachedClient = window.supabase.createClient(url, key);
    cachedClientKey = clientKey;
    return cachedClient;
  }

  console.error("Supabase library is not loaded on the window object.");
  return null;
}

// يكتشف عدم وجود دالة RPC في قاعدة البيانات (قبل تشغيل ملف التحديث SQL)
window.isMissingRpcError = function isMissingRpcError(error) {
  if (!error) return false;
  const msg = `${error.message || ""} ${error.details || ""}`;
  return error.code === "PGRST202" || error.code === "42883" || /Could not find the function|does not exist/i.test(msg);
}

// رسائل أخطاء دوال السيرفر بالعربية
window.translateRpcError = function translateRpcError(error, fallback) {
  const msg = (error && (error.message || String(error))) || "";
  const map = {
    STUDENT_NOT_FOUND: "تعذر التحقق من بيانات الطالبة. يرجى تسجيل الخروج والدخول مجدداً بالاسم والرقم الحوزوي.",
    EXAM_NOT_FOUND: "لم يتم العثور على هذا الامتحان. ربما تم حذفه من قبل الإدارة.",
    EXAM_NOT_STARTED: "لم يبدأ وقت هذا الامتحان بعد.",
    EXAM_ENDED: "انتهى وقت هذا الامتحان ولم يعد التسليم ممكناً.",
    ALREADY_SUBMITTED: "تم تسليم هذا الامتحان مسبقاً، ولا يُسمح بتكرار التسليم.",
    ATTENDANCE_DISABLED: "نظام الحضور معطّل حالياً من قبل الإدارة.",
    ATTENDANCE_DAY_OFF: "اليوم عطلة رسمية ولا يتطلب تسجيل الحضور.",
    ATTENDANCE_CLOSED: "باب تسجيل الحضور مغلق في هذا الوقت.",
  };
  for (const code of Object.keys(map)) {
    if (msg.includes(code)) return map[code];
  }
  if (/duplicate key|unique/i.test(msg) && /submissions/i.test(msg)) return map.ALREADY_SUBMITTED;
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مجدداً.";
  return fallback ? `${fallback}: ${msg}` : msg;
}
