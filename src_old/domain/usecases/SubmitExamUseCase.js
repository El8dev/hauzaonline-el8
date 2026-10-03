// src/domain/usecases/SubmitExamUseCase.js
window.SubmitExamUseCase = class SubmitExamUseCase {
  constructor(examRepository, submissionRepository) {
    this.examRepository = examRepository;
    this.submissionRepository = submissionRepository;
  }

  // التصحيح والتحقق من الوقت ومنع التكرار تتم كلها في السيرفر
  async execute({ examId, studentName, studentPhone, studentNumber, loginName, answers }) {
    if (!studentName || studentName.trim() === "") {
      throw new Error("يرجى إدخال اسمك الرباعي للمتابعة.");
    }
    if (!examId) {
      throw new Error("معرّف الامتحان مطلوب.");
    }

    const submissionData = {
      exam_id: examId,
      student_name: studentName,
      student_phone: studentPhone || "",
      student_number: studentNumber,
      student_login_name: loginName || studentName,
      answers: answers || {}
    };

    return await this.submissionRepository.submitExam(submissionData);
  }
}
