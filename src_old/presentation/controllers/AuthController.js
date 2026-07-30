// src/presentation/controllers/AuthController.js

window.AuthController = class AuthController {
  constructor(view) {
    this.view = view;
  }

  get client() {
    return window.getSupabaseClient();
  }

  async checkSession() {
    const supabase = this.client;
    if (!supabase) {
      this.view.onSupabaseNotConfigured();
      return null;
    }

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      
      if (data.session) {
        this.view.onAuthenticated(data.session.user);
        return data.session.user;
      } else {
        this.view.onUnauthenticated();
        return null;
      }
    } catch (e) {
      console.error("Session check error:", e.message);
      this.view.onUnauthenticated();
      return null;
    }
  }

  async signIn(email, password) {
    const supabase = this.client;
    if (!supabase) throw new Error("يرجى تهيئة إعدادات الاتصال بـ Supabase أولاً.");

    this.view.showLoading();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      this.view.onAuthenticated(data.user);
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async signUp(email, password) {
    const supabase = this.client;
    if (!supabase) throw new Error("يرجى تهيئة إعدادات الاتصال بـ Supabase أولاً.");

    this.view.showLoading();
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      
      if (data.user) {
        alert("تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول أو مراجعة بريدك الإلكتروني للتأكيد.");
        this.view.onUnauthenticated();
      }
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async signOut() {
    const supabase = this.client;
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
      this.view.onUnauthenticated();
    } catch (e) {
      console.error("SignOut error:", e.message);
    }
  }
}
