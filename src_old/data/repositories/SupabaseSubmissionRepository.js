// src/data/repositories/SupabaseSubmissionRepository.js

window.SupabaseSubmissionRepository = class SupabaseSubmissionRepository extends window.ISubmissionRepository {
  constructor() {
    super();
  }

  get client() {
    return window.getSupabaseClient();
  }

  requireClient() {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }
    return supabase;
  }

  // التسليم يُصحَّح في السيرفر. الدالة الجديدة تتحقق من الطالبة بالاسم + الرقم الحوزوي،
  // والقديمة تُستخدم فقط إذا لم يُشغَّل ملف التحديث SQL بعد.
  async submitExam(submissionData) {
    const supabase = this.requireClient();

    let { data, error } = await supabase.rpc("rpc_submit_exam_v2", {
      p_exam_id: submissionData.exam_id,
      p_name: submissionData.student_login_name || submissionData.student_name,
      p_number: Number(submissionData.student_number),
      p_answers: submissionData.answers,
    });

    if (error && window.isMissingRpcError(error)) {
      ({ data, error } = await supabase.rpc("rpc_submit_exam", {
        p_exam_id: submissionData.exam_id,
        p_student_phone: submissionData.student_phone || "",
        p_student_name: submissionData.student_name,
        p_answers: submissionData.answers,
      }));
    }

    if (error) throw new Error(window.translateRpcError(error, "فشل تسليم الإجابات"));
    return data;
  }

  async getSubmissionsByExam(examId) {
    const supabase = this.requireClient();

    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("exam_id", examId)
      .order("submitted_at", { ascending: false });

    if (error) throw new Error("فشل جلب قائمة النتائج: " + error.message);
    return data || [];
  }

  // للمشرف: كل التسليمات بطلب واحد بدلاً من طلب لكل امتحان
  async listAllSubmissions() {
    const supabase = this.requireClient();
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("submitted_at", { ascending: false });
    if (error) throw new Error("فشل جلب النتائج: " + error.message);
    return data || [];
  }

  // للطالبة: نتائجها فقط (exam_id, score, max_score, submitted_at)
  async getMySubmissions({ name, number, phone }) {
    const supabase = this.requireClient();
    const { data, error } = await supabase.rpc("rpc_get_my_submissions", {
      p_name: name,
      p_number: Number(number),
    });
    if (!error) return data || [];
    if (!window.isMissingRpcError(error)) {
      throw new Error(window.translateRpcError(error, "فشل جلب نتائج الطالبة"));
    }
    return this.getSubmissionsByStudent(phone, "");
  }

  async getSubmissionsByStudent(phone, name) {
    const supabase = this.requireClient();

    let query = supabase.from("submissions").select("*");

    if (phone && phone.trim() !== "") {
      query = query.eq("student_phone", phone.trim());
    } else if (name && name.trim() !== "") {
      query = query.eq("student_name", name.trim());
    } else {
      return [];
    }

    const { data, error } = await query.order("submitted_at", { ascending: false });
    if (error) throw new Error("فشل جلب قائمة نتائج الطالب: " + error.message);
    return data || [];
  }

  async deleteSubmission(id) {
    const supabase = this.requireClient();

    const { error } = await supabase
      .from("submissions")
      .delete()
      .eq("id", id);

    if (error) throw new Error("فشل حذف النتيجة: " + error.message);
    return true;
  }
}
