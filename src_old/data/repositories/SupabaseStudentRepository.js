// src/data/repositories/SupabaseStudentRepository.js

window.SupabaseStudentRepository = class SupabaseStudentRepository extends window.IStudentRepository {
  constructor() {
    super();
  }

  get client() {
    return window.getSupabaseClient();
  }

  async submitRequest({ student_name, surname, student_phone, city, province, social_status, marital_status, is_student, study_type, hawza_study, qualification, birthdate, stage, telegram_user }) {
    const supabase = this.client;

    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    let attemptData = { 
      student_name, 
      surname: surname || "",
      student_phone, 
      status: "pending", 
      city: city || "", 
      province: province || "",
      social_status: social_status || "",
      marital_status: marital_status || "",
      is_student: is_student || "",
      study_type: study_type || "",
      hawza_study: hawza_study || "",
      qualification: qualification || "",
      birthdate: birthdate || "",
      birthdate: birthdate || "",
      stage: stage || "",
      telegram_user: telegram_user || ""
    };

    // حلقة إعادة محاولة ذكية للتعامل مع أي أعمدة غير موجودة في قاعدة بيانات Supabase
    for (let attempt = 0; attempt < 15; attempt++) {
      let { data, error } = await supabase
        .from("students")
        .insert(attemptData)
        .select()
        .single();

      if (!error) {
        return data;
      }

      const errorMsg = error.message || error.details || "";
      console.warn(`فشل المحاولة (${attempt + 1}) لإرسال طلب العضوية لـ Supabase:`, errorMsg);

      // استخراج اسم العمود المفقود تلقائياً من رسالة خطأ Supabase
      const match = errorMsg.match(/Could not find the '([^']+)' column/i);
      if (match && match[1] && attemptData.hasOwnProperty(match[1])) {
        const missingCol = match[1];
        console.warn(`العمود '${missingCol}' غير موجود في جدول الطلاب بـ Supabase. جارٍ حذفه وإعادة المحاولة...`);
        delete attemptData[missingCol];
        continue;
      }

      // تصفية الأعمدة غير الأساسية تدريجياً في حال كان الخطأ صياغياً مختلفاً
      if (attemptData.social_status !== undefined) { delete attemptData.social_status; continue; }
      if (attemptData.marital_status !== undefined) { delete attemptData.marital_status; continue; }
      if (attemptData.is_student !== undefined) { delete attemptData.is_student; continue; }
      if (attemptData.study_type !== undefined) { delete attemptData.study_type; continue; }
      if (attemptData.hawza_study !== undefined) { delete attemptData.hawza_study; continue; }
      if (attemptData.birthdate !== undefined) { delete attemptData.birthdate; continue; }
      if (attemptData.stage !== undefined) { delete attemptData.stage; continue; }
      if (attemptData.qualification !== undefined) { delete attemptData.qualification; continue; }
      if (attemptData.city !== undefined) { delete attemptData.city; continue; }
      if (attemptData.province !== undefined) { delete attemptData.province; continue; }
      if (attemptData.surname !== undefined) { delete attemptData.surname; continue; }
      if (attemptData.telegram_user !== undefined) { delete attemptData.telegram_user; continue; }

      throw new Error("فشل تقديم طلب العضوية: " + error.message);
    }
  }

  async verifyStudentFull(name, stage, section, studentId) {
    const student = await this.getStudentByMemberNumber(studentId);
    if (!student) return null; // الطالب غير موجود أصلاً بهذا الرقم

    if (student.status !== "approved") return null; // الطالب غير معتمد بعد

    // التحقق الصارم من صحة الاسم
    if (student.student_name.trim() !== name.trim()) return null;

    // التحقق الصارم من المرحلة
    if (!student.stage || student.stage.trim() !== stage.trim()) return null;

    // التحقق الصارم من الشعبة (مخزنة في حقل qualification)
    if (!student.qualification || student.qualification.trim() !== section.trim()) return null;

    return student; // كل البيانات متطابقة
  }

  async loginStudent(name, id) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const numId = Number(id);
    if (isNaN(numId)) return null;

    const cleanInputName = (name || "").trim().toLowerCase().replace(/\s+/g, ' ');
    if (!cleanInputName) return null;

    // 1. محاولة استخدام الدالة السريعة RPC أولاً
    try {
      const { data, error } = await supabase
        .rpc("rpc_login_student", {
          p_name: name.trim(),
          p_number: numId
        });

      if (!error && data && data.length > 0) {
        const rpcStudent = data[0];
        if (rpcStudent && (rpcStudent.status === "approved" || !rpcStudent.status)) {
          return rpcStudent;
        }
      }
    } catch (e) {
      console.warn("RPC rpc_login_student لم تعمل، جاري استخدام الاستعلام المباشر المرن...", e);
    }

    // 2. الاستعلام المباشر من جدول الطلاب (Direct Table Query Fallback)
    let { data, error } = await supabase
      .from("students")
      .select("*")
      .or(`member_number.eq.${numId},hawza_number.eq.${numId}`);

    if (error || !data || data.length === 0) return null;

    // تصفية الطلاب المعتمدين فقط
    const approvedStudents = data.filter(s => s.status === "approved" || !s.status);
    if (approvedStudents.length === 0) return null;

    // مطابقة اسم الطالب بمرونة (Flexible Name Match)
    const matchedStudent = approvedStudents.find(student => {
      const dbName = (student.student_name || "").trim().toLowerCase().replace(/\s+/g, ' ');
      const dbSurname = (student.surname || "").trim().toLowerCase().replace(/\s+/g, ' ');
      const dbFullName = (dbName + " " + dbSurname).trim();

      if (!dbName) return false;

      // أ) التطابق التام مع الاسم المخزن أو مع الاسم واللقب معاً
      if (dbName === cleanInputName || dbFullName === cleanInputName) return true;

      // ب) فحص ما إذا كان أحدهما يحتوي الآخر (الاسم المدخل يحتوي الاسم الثلاثي المخزن أو العكس)
      if (cleanInputName.includes(dbName) || dbName.includes(cleanInputName)) return true;
      if (dbFullName && (cleanInputName.includes(dbFullName) || dbFullName.includes(cleanInputName))) return true;

      // ج) مطابقة أول كلمتين (مثلاً: الاسم واسم الأب)
      const dbWords = dbName.split(' ');
      const inputWords = cleanInputName.split(' ');
      if (dbWords.length >= 2 && inputWords.length >= 2) {
        if (dbWords[0] === inputWords[0] && dbWords[1] === inputWords[1]) return true;
      }

      return false;
    });

    return matchedStudent || null;
  }

  async getStudentById(id) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data;
  }

  async getStudentByPhone(phone) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("student_phone", phone);

    if (error || !data || data.length === 0) return null;
    return data[0];
  }

  async getStudentByMemberNumber(memberNumber) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("member_number", Number(memberNumber))
      .single();

    if (error) return null;
    return data;
  }

  async listAllStudents() {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error("فشل جلب قائمة الطلاب: " + error.message);
    return data || [];
  }

  async approveStudent(id, stage, section, hawzaNumber) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    let finalHawzaNumber = hawzaNumber ? Number(hawzaNumber) : null;
    if (!finalHawzaNumber || isNaN(finalHawzaNumber)) {
      finalHawzaNumber = Math.floor(10000 + Math.random() * 90000);
    }

    const updateData = { 
      status: "approved",
      member_number: finalHawzaNumber,
      hawza_number: finalHawzaNumber
    };
    if (stage) updateData.stage = stage;
    if (section) updateData.qualification = section;

    const { data, error } = await supabase
      .from("students")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error("فشل قبول الطالب: " + error.message);
    return data;
  }

  async rejectStudent(id) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("students")
      .update({ status: "rejected" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error("فشل رفض الطالب: " + error.message);
    return data;
  }

  async deleteStudent(id) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", id);

    if (error) throw new Error("فشل حذف الطالب: " + error.message);
    return true;
  }

  async updateStudentMemberNumber(id, newNumber) {
    const supabase = this.client;
    const num = Number(newNumber);
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("students")
      .update({ member_number: num, hawza_number: num })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error("فشل تحديث الرقم الحوزوي: " + error.message);
    return new window.Student(data);
  }

  async updateStudentStageAndSection(id, stage, section) {
    const supabase = this.client;
    if (!supabase) {
      throw new Error("لم يتم الاتصال بـ Supabase. يرجى التأكد من ضبط إعدادات Supabase (URL و API Key).");
    }

    const { data, error } = await supabase
      .from("students")
      .update({ stage: stage, qualification: section })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error("فشل تحديث المرحلة والشعبة: " + error.message);
    return new window.Student(data);
  }
}
