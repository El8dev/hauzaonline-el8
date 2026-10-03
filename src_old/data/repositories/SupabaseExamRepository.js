// src/data/repositories/SupabaseExamRepository.js

window.SupabaseExamRepository = class SupabaseExamRepository extends window.IExamRepository {
  constructor() {
    super();
  }

  get client() {
    return window.getSupabaseClient();
  }

  async createExam(examData, questionsData) {
    const supabase = this.client;
    
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    // لا نعيد المحاولة بحقول ناقصة: كان ذلك يحوّل امتحان النصف/النهائي إلى كويز بصمت عند أي خطأ
    const { data: exam, error: examError } = await supabase
      .from("exams")
      .insert({ ...examData })
      .select()
      .single();

    if (examError) {
      throw new Error("فشل إنشاء الامتحان: " + examError.message);
    }

    const preparedQuestions = questionsData.map(q => ({
      exam_id: exam.id,
      question_text: q.questionText,
      options: q.options,
      correct_option_index: q.correctOptionIndex,
      points: q.points || 1
    }));

    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .insert(preparedQuestions)
      .select();

    if (questionsError) {
      await supabase.from("exams").delete().eq("id", exam.id);
      if (/integer/i.test(questionsError.message || "")) {
        throw new Error("فشل إضافة الأسئلة: قاعدة البيانات لا تقبل الدرجات العشرية بعد. يرجى تشغيل ملف التحديث supabase_production_fix.sql في Supabase، أو استخدام درجات صحيحة.");
      }
      throw new Error("فشل إضافة الأسئلة: " + questionsError.message);
    }

    return { exam, questions };
  }

  async getExamById(id) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data;
  }

  async getExamByCode(code) {
    if (!code) return null;
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("exam_code", code)
      .single();

    if (error) return null;
    return data;
  }

  async getExamQuestions(examId) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    let { data, error } = await supabase
      .rpc("rpc_get_exam_questions", {
        p_exam_id: examId
      });

    // Fallback to direct table query if the SQL RPC is not installed
    if (error && window.isMissingRpcError(error)) {
      const res = await supabase
        .from("questions")
        .select("id, exam_id, question_text, options, correct_option_index, points, created_at")
        .eq("exam_id", examId)
        .order("created_at", { ascending: true });

      data = res.data;
      error = res.error;
    }

    if (error) throw new Error("فشل جلب الأسئلة: " + error.message);

    // لا نحتفظ بأي معلومة عن الإجابة الصحيحة في جهاز الطالبة (النسخة القديمة من الدالة كانت ترسلها)
    return (data || []).map((q) => {
      const options = Array.isArray(q.options) ? q.options : [];
      const correctCount = options.filter((o) => o && typeof o === "object" && (o.isCorrect === true || o.isCorrect === "true")).length;
      return {
        id: q.id,
        exam_id: q.exam_id,
        question_text: q.question_text,
        points: q.points,
        created_at: q.created_at,
        multi: typeof q.multi === "boolean" ? q.multi : correctCount > 1,
        options: options.map((o) => (o && typeof o === "object" ? { id: o.id, text: o.text } : { text: o })),
      };
    });
  }

  async getAdminExamQuestions(examId) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    // Direct table query because admin is authenticated and needs correct_option_index
    const { data, error } = await supabase
      .from("questions")
      .select("id, exam_id, question_text, options, correct_option_index, points, created_at")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });

    if (error) throw new Error("فشل جلب الأسئلة: " + error.message);
    return data || [];
  }

  // مجموع درجات كل امتحان (للمشرف) لاحتساب النسب وتحويل الدرجات إلى مقياس 50
  async getMaxScoresByExam() {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }
    const { data, error } = await supabase.from("questions").select("exam_id, points");
    if (error) throw new Error("فشل جلب درجات الأسئلة: " + error.message);
    const max = {};
    (data || []).forEach((q) => {
      max[q.exam_id] = (max[q.exam_id] || 0) + (Number(q.points) || 0);
    });
    return max;
  }

  async listExamsByCreator(creatorId) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("created_by", creatorId)
      .order("created_at", { ascending: false });

    if (error) throw new Error("فشل جلب قائمة الامتحانات: " + error.message);
    let rawExams = data || [];
    return rawExams.map(e => new window.Exam(e));
  }

  async listAllExams() {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }
    
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error("فشل جلب قائمة الامتحانات: " + error.message);
    let rawExams = data || [];
    
    // خريطة تحويل إلى كائن Exam حتى تعمل دوال مثل isActive()
    return rawExams.map(e => new window.Exam(e));
  }

  async deleteExam(id) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    if (!id) throw new Error("فشل حذف الامتحان: معرّف الامتحان مفقود.");

    const { data, error } = await supabase
      .from("exams")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) throw new Error("فشل حذف الامتحان: " + error.message);
    if (!data || data.length === 0) {
      throw new Error("لم يتم حذف الامتحان: ليست لديك صلاحية الحذف أو أن الجلسة انتهت. سجّل الدخول مجدداً.");
    }
    return true;
  }
}
