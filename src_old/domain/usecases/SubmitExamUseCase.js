// src/domain/usecases/SubmitExamUseCase.js
window.SubmitExamUseCase = class SubmitExamUseCase {
  constructor(examRepository, submissionRepository) {
    this.examRepository = examRepository;
    this.submissionRepository = submissionRepository;
  }

  async execute({ examId, studentName, studentPhone, answers }) {
    if (!studentName || studentName.trim() === "") {
      throw new Error("يرجى إدخال اسمك الرباعي للمتابعة.");
    }

    const questionsData = await this.examRepository.getExamQuestions(examId);
    if (!questionsData || questionsData.length === 0) {
      throw new Error("لا توجد أسئلة متوفرة لهذا الامتحان.");
    }

    const submissionData = {
      exam_id: examId,
      student_name: studentName,
      student_phone: studentPhone || "",
      answers
    };

    return await this.submissionRepository.submitExam(submissionData);
  }
}
