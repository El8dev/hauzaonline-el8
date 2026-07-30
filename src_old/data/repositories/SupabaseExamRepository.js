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

    let attemptData = { ...examData };
    let { data: exam, error: examError } = await supabase
      .from("exams")
      .insert(attemptData)
      .select()
      .single();

    if (examError) {
      console.warn("فشل حفظ حقل المادة أو الرمز السري أو نوع الاختبار في Supabase، سنعيد المحاولة بالحقول الأساسية فقط: ", examError.message);
      delete attemptData.subject;
      delete attemptData.test_type;
      const secondTry = await supabase
        .from("exams")
        .insert(attemptData)
        .select()
        .single();
      
      if (secondTry.error) {
        throw new Error("فشل إنشاء الامتحان: " + secondTry.error.message);
      }
      exam = secondTry.data;
      exam.test_type = examData.test_type;
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
    if (error && error.message && error.message.includes("Could not find the function")) {
      const res = await supabase
        .from("questions")
        .select("id, exam_id, question_text, options, correct_option_index, created_at")
        .eq("exam_id", examId)
        .order("created_at", { ascending: true });
      
      data = res.data;
      error = res.error;
    }

    if (error) throw new Error("فشل جلب الأسئلة: " + error.message);
    return data || [];
  }

  async getAdminExamQuestions(examId) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    // Direct table query because admin is authenticated and needs correct_option_index
    const { data, error } = await supabase
      .from("questions")
      .select("id, exam_id, question_text, options, correct_option_index, created_at")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });
      
    if (error) throw new Error("فشل جلب الأسئلة: " + error.message);
    return data || [];
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

    const { error } = await supabase
      .from("exams")
      .delete()
      .eq("id", id);

    if (error) throw new Error("فشل حذف الامتحان: " + error.message);
    return true;
  }
}
