// src/data/repositories/SupabaseStudentRepository.js

window.SupabaseStudentRepository = class SupabaseStudentRepository extends window.IStudentRepository {
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

  async submitRequest({ student_name, surname, student_phone, city, province, social_status, is_student, study_type, hawza_study, qualification, birthdate, stage, telegram_user }) {
    const supabase = this.requireClient();

    const attemptData = {
      student_name,
      surname: surname || "",
      student_phone,
      status: "pending",
      city: city || "",
      province: province || "",
      social_status: social_status || "",
      is_student: is_student || "",
      study_type: study_type || "",
      hawza_study: hawza_study || "",
      qualification: qualification || "",
      birthdate: birthdate || "",
      stage: stage || "",
      telegram_user: telegram_user || ""
    };

    // بدون select(): الزائر لا يملك صلاحية قراءة جدول الطالبات (حماية البيانات الشخصية)
    for (let attempt = 0; attempt < 15; attempt++) {
      const { error } = await supabase.from("students").insert(attemptData);
      if (!error) {
        return { ...attemptData };
      }

      const errorMsg = error.message || error.details || "";
      // حذف أي عمود غير موجود في قاعدة البيانات وإعادة المحاولة
      const match = errorMsg.match(/Could not find the '([^']+)' column/i);
      if (
        match && match[1] &&
        Object.prototype.hasOwnProperty.call(attemptData, match[1]) &&
        !["student_name", "student_phone", "status"].includes(match[1])
      ) {
        console.warn(`العمود '${match[1]}' غير موجود في جدول الطلاب. جارٍ حذفه وإعادة المحاولة...`);
        delete attemptData[match[1]];
        continue;
      }
      if (error.code === "23505" || /duplicate key|unique/i.test(errorMsg)) {
        throw new Error("رقم الهاتف هذا مسجل مسبقاً. إذا كان لديكِ رقم حوزوي فسجّلي الدخول به، أو راجعي الإدارة.");
      }
      throw new Error("فشل تقديم طلب العضوية: " + errorMsg);
    }
    throw new Error("فشل تقديم طلب العضوية.");
  }

  // حالة رقم الهاتف: none | pending | approved | rejected (بدون كشف بيانات شخصية)
  async getRegistrationStatus(phone) {
    const supabase = this.requireClient();
    const { data, error } = await supabase.rpc("rpc_registration_status", { p_phone: phone });
    if (!error) return data || "none";
    if (!window.isMissingRpcError(error)) throw new Error("فشل التحقق من رقم الهاتف: " + error.message);
    const existing = await this.getStudentByPhone(phone);
    return existing ? (existing.status || "approved") : "none";
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
    const supabase = this.requireClient();
    const g = window.Grading;

    const digits = g.toLatinDigits(String(id ?? "")).replace(/\D/g, "");
    const numId = Number(digits);
    if (!digits || !Number.isSafeInteger(numId) || numId > 2147483647) return null;

    const cleanInputName = g.normalizeArabic(name);
    if (!cleanInputName) return null;

    // 1. الدالة الآمنة في السيرفر
    const { data, error } = await supabase.rpc("rpc_login_student", {
      p_name: String(name).trim(),
      p_number: numId
    });

    if (!error) {
      const rpcStudent = Array.isArray(data) ? data[0] : data;
      if (rpcStudent && rpcStudent.id && (rpcStudent.status === "approved" || !rpcStudent.status)) {
        return rpcStudent;
      }
    } else {
      console.warn("rpc_login_student error:", error.message);
    }

    // 2. احتياطي قبل تشغيل ملف التحديث SQL (يعيد نتيجة فارغة بعد إغلاق قراءة جدول الطالبات)
    const res = await supabase
      .from("students")
      .select("*")
      .or(`member_number.eq.${numId},hawza_number.eq.${numId}`);

    if (res.error || !res.data || res.data.length === 0) return null;

    const approvedStudents = res.data.filter(s => s.status === "approved" || !s.status);
    const inputWords = cleanInputName.split(" ");

    // نفس قواعد السيرفر: الاسم كاملاً، أو مع اللقب، أو الاسم واسم الأب
    const matchedStudent = approvedStudents.find(student => {
      const dbName = g.normalizeArabic(student.student_name);
      const dbFullName = g.normalizeArabic(`${student.student_name || ""} ${student.surname || ""}`);
      if (!dbName) return false;
      if (dbName === cleanInputName || dbFullName === cleanInputName) return true;
      const dbWords = dbName.split(" ");
      return dbWords.length >= 2 && inputWords.length >= 2 && dbWords[0] === inputWords[0] && dbWords[1] === inputWords[1];
    });

    return matchedStudent || null;
  }

  async getStudentById(id) {
    const supabase = this.requireClient();

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return null;
    return data;
  }

  async getStudentByPhone(phone) {
    const supabase = this.requireClient();

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("student_phone", phone);

    if (error || !data || data.length === 0) return null;
    return data[0];
  }

  async getStudentByMemberNumber(memberNumber) {
    const supabase = this.requireClient();

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .eq("member_number", Number(memberNumber))
      .single();

    if (error) return null;
    return data;
  }

  async listAllStudents() {
    const supabase = this.requireClient();

    const { data, error } = await supabase
      .from("students")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error("فشل جلب قائمة الطلاب: " + error.message);
    return data || [];
  }

  async approveStudent(id, stage, section, hawzaNumber) {
    const supabase = this.requireClient();

    const manual = hawzaNumber !== null && hawzaNumber !== undefined && String(hawzaNumber).trim() !== "";
    let manualNumber = null;
    if (manual) {
      manualNumber = Number(window.Grading.toLatinDigits(String(hawzaNumber).trim()));
      if (!Number.isInteger(manualNumber) || manualNumber <= 0 || manualNumber > 2147483647) {
        throw new Error("الرقم الحوزوي يجب أن يكون رقماً صحيحاً موجباً.");
      }
    }

    // رقم عشوائي من 5 خانات (يصعب تخمينه)، مع إعادة المحاولة عند التكرار
    for (let attempt = 0; attempt < 6; attempt++) {
      const finalHawzaNumber = manual ? manualNumber : Math.floor(10000 + Math.random() * 90000);
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

      if (!error) return data;
      const duplicate = error.code === "23505" || /duplicate key|unique/i.test(error.message || "");
      if (duplicate && manual) {
        throw new Error(`الرقم الحوزوي ${manualNumber} مستخدم لطالبة أخرى. اختر رقماً آخر أو اتركه فارغاً للتوليد التلقائي.`);
      }
      if (!duplicate) throw new Error("فشل قبول الطالب: " + error.message);
    }
    throw new Error("فشل قبول الطالب: تعذر توليد رقم حوزوي فريد، حاول مجدداً.");
  }

  async rejectStudent(id) {
    const supabase = this.requireClient();

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
    const supabase = this.requireClient();

    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", id);

    if (error) throw new Error("فشل حذف الطالب: " + error.message);
    return true;
  }

  async updateStudentMemberNumber(id, newNumber) {
    const supabase = this.requireClient();
    const num = Number(window.Grading.toLatinDigits(String(newNumber).trim()));
    if (!Number.isInteger(num) || num <= 0 || num > 2147483647) {
      throw new Error("الرقم الحوزوي يجب أن يكون رقماً صحيحاً موجباً.");
    }

    const { data, error } = await supabase
      .from("students")
      .update({ member_number: num, hawza_number: num })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505" || /duplicate key|unique/i.test(error.message || "")) {
        throw new Error(`الرقم الحوزوي ${num} مستخدم لطالبة أخرى.`);
      }
      throw new Error("فشل تحديث الرقم الحوزوي: " + error.message);
    }
    return new window.Student(data);
  }

  async updateStudentStageAndSection(id, stage, section) {
    const supabase = this.requireClient();

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
