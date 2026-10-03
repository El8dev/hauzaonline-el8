// src/presentation/controllers/AuthController.js

window.AuthController = class AuthController {
  constructor(view) {
    this.view = view;
  }

  get client() {
    return window.getSupabaseClient();
  }

  // بعد ملف التحديث SQL: فقط الحسابات المسجلة في جدول admins تملك صلاحيات الإدارة
  async isAdmin() {
    const supabase = this.client;
    if (!supabase) return false;
    const { data, error } = await supabase.rpc("is_admin");
    if (error) {
      // قبل تشغيل ملف التحديث لا توجد الدالة، فيُعامل أي حساب مسجل كمشرف (السلوك القديم)
      return window.isMissingRpcError(error);
    }
    return data === true;
  }

  async finishLogin(user) {
    if (await this.isAdmin()) {
      this.view.onAuthenticated(user);
      return user;
    }
    await this.client.auth.signOut();
    this.view.onUnauthenticated();
    this.view.showError("هذا الحساب غير مخوّل بالدخول إلى لوحة الإدارة.");
    return null;
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
        return await this.finishLogin(data.session.user);
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
      await this.finishLogin(data.user);
    } catch (e) {
      const msg = /Invalid login credentials/i.test(e.message || "")
        ? "بيانات الدخول غير صحيحة."
        : e.message;
      this.view.showError(msg);
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
