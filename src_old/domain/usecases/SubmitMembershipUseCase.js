// src/domain/usecases/SubmitMembershipUseCase.js
window.SubmitMembershipUseCase = class SubmitMembershipUseCase {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute({ studentName, surname, birthdate, province, studentPhone, socialStatus, academicStudy, academicDept, hawzaStudy, hawzaDesc, stage, qualification, telegramUser }) {
    if (!studentName || studentName.trim() === "") {
      throw new Error("الاسم الثلاثي مطلوب.");
    }
    const phone = window.Grading.normalizePhone(studentPhone);
    if (!phone) {
      throw new Error("رقم الواتساب مطلوب.");
    }
    if (phone.length < 8 || phone.length > 15) {
      throw new Error("رقم الواتساب غير صحيح. اكتبيه كاملاً مثل 07xxxxxxxxx.");
    }

    const status = await this.studentRepository.getRegistrationStatus(phone);
    if (status === "approved") {
      // لا نكشف الرقم الحوزوي لمن يعرف رقم الهاتف فقط (كان يسمح بانتحال شخصية الطالبة)
      throw new Error("هذا الرقم مسجل ومعتمد مسبقاً. سجّلي الدخول باسمك ورقمك الحوزوي، وإذا نسيتِ الرقم راجعي الإدارة.");
    } else if (status === "pending") {
      throw new Error("طلبك مسجل بالفعل وهو قيد المراجعة من قبل الإدارة.");
    } else if (status === "rejected") {
      throw new Error("تم رفض طلبك مسبقاً من قبل الإدارة. يرجى مراجعة المشرف.");
    }

    const isStudentStr = (academicStudy && academicStudy !== "لا يوجد") ? "نعم" : "لا";
    let formattedStudyType = academicStudy || "";
    if (academicDept) formattedStudyType += " - " + academicDept;

    let formattedHawzaStudy = hawzaStudy || "لا";
    if (hawzaStudy === "نعم" && hawzaDesc) {
      formattedHawzaStudy += " - " + hawzaDesc;
    }

    return await this.studentRepository.submitRequest({
      student_name: studentName.trim().replace(/\s+/g, " "),
      surname: surname ? surname.trim() : "",
      student_phone: phone,
      birthdate: birthdate ? birthdate.toString() : "",
      province: province ? province.trim() : "",
      social_status: socialStatus ? socialStatus.trim() : "",
      is_student: isStudentStr,
      study_type: formattedStudyType,
      hawza_study: formattedHawzaStudy,
      stage: stage ? stage.trim() : "لم يتم التحديد بعد",
      qualification: qualification ? qualification.trim() : "لم يتم التحديد بعد",
      telegram_user: telegramUser ? telegramUser.trim() : ""
    });
  }
}
