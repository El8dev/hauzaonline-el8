// src/domain/usecases/SubmitMembershipUseCase.js
window.SubmitMembershipUseCase = class SubmitMembershipUseCase {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute({ studentName, surname, birthdate, province, studentPhone, socialStatus, maritalStatus, academicStudy, academicDept, hawzaStudy, hawzaDesc, stage, qualification, telegramUser }) {
    if (!studentName || studentName.trim() === "") {
      throw new Error("الاسم الثلاثي مطلوب.");
    }
    if (!studentPhone || studentPhone.trim() === "") {
      throw new Error("رقم الواتساب مطلوب.");
    }

    const existing = await this.studentRepository.getStudentByPhone(studentPhone.trim());
    if (existing) {
      if (existing.status === "approved") {
        throw new Error(`هذا الرقم مسجل بالفعل وموافق عليه. الرقم الحوزوي الخاص بك هو: ${existing.hawzaNumber || existing.memberNumber}`);
      } else if (existing.status === "pending") {
        throw new Error("طلبك مسجل بالفعل وهو قيد المراجعة من قبل الإدارة.");
      } else {
        throw new Error("تم رفض طلبك مسبقاً من قبل الإدارة. يرجى مراجعة المشرف.");
      }
    }

    const isStudentStr = (academicStudy && academicStudy !== "لا يوجد") ? "نعم" : "لا";
    let formattedStudyType = academicStudy || "";
    if (academicDept) formattedStudyType += " - " + academicDept;

    let formattedHawzaStudy = hawzaStudy || "لا";
    if (hawzaStudy === "نعم" && hawzaDesc) {
      formattedHawzaStudy += " - " + hawzaDesc;
    }

    return await this.studentRepository.submitRequest({
      student_name: studentName.trim(),
      surname: surname ? surname.trim() : "",
      student_phone: studentPhone.trim(),
      birthdate: birthdate ? birthdate.toString() : "",
      province: province ? province.trim() : "",
      social_status: socialStatus ? socialStatus.trim() : "",
      marital_status: maritalStatus ? maritalStatus.trim() : "",
      is_student: isStudentStr,
      study_type: formattedStudyType,
      hawza_study: formattedHawzaStudy,
      stage: stage ? stage.trim() : "لم يتم التحديد بعد",
      qualification: qualification ? qualification.trim() : "لم يتم التحديد بعد",
      telegram_user: telegramUser ? telegramUser.trim() : ""
    });
  }
}
