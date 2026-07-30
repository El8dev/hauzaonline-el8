// src/data/repositories/SupabaseSubmissionRepository.js

window.SupabaseSubmissionRepository = class SupabaseSubmissionRepository extends window.ISubmissionRepository {
  constructor() {
    super();
  }

  get client() {
    return window.getSupabaseClient();
  }

  async submitExam(submissionData) {
    const supabase = this.client;
    
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .rpc("rpc_submit_exam", {
        p_exam_id: submissionData.exam_id,
        p_student_phone: submissionData.student_phone || "",
        p_student_name: submissionData.student_name,
        p_answers: submissionData.answers
      });

    if (error) throw new Error("فشل تسليم الإجابات: " + error.message);
    return data;
  }

  async getSubmissionsByExam(examId) {
    const supabase = this.client;
    
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("exam_id", examId)
      .order("submitted_at", { ascending: false });

    if (error) throw new Error("فشل جلب قائمة النتائج: " + error.message);
    return data || [];
  }

  async getSubmissionsByStudent(phone, name) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

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
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { error } = await supabase
      .from("submissions")
      .delete()
      .eq("id", id);

    if (error) throw new Error("فشل حذف النتيجة: " + error.message);
    return true;
  }
}
