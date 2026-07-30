// src/presentation/controllers/ExamTakerController.js

window.ExamTakerController = class ExamTakerController {
  constructor(view) {
    this.view = view;
    this.examRepository = new window.SupabaseExamRepository();
    this.submissionRepository = new window.SupabaseSubmissionRepository();

    // Wire Use Cases
    this.getExamUseCase = new window.GetExamUseCase(this.examRepository);
    this.submitExamUseCase = new window.SubmitExamUseCase(this.examRepository, this.submissionRepository);
  }

  async loadExam(examId) {
    this.view.showLoading();
    try {
      const { exam, questions } = await this.getExamUseCase.execute(examId);

      if (exam.isEnded()) {
        this.view.onExamEnded(exam);
        return;
      }
      if (!exam.isStarted()) {
        this.view.onExamNotStarted(exam);
        return;
      }

      // Check if current student has already submitted this exam
      if (this.view.currentStudent && (this.view.currentStudent.studentPhone || this.view.currentStudent.studentName)) {
        try {
          const studentSubs = await this.submissionRepository.getSubmissionsByStudent(
            this.view.currentStudent.studentPhone,
            this.view.currentStudent.studentName
          );
          const existingSub = studentSubs.find(s => s.exam_id === examId);
          if (existingSub) {
            this.view.onExamAlreadyTaken(exam, existingSub);
            return;
          }
        } catch (subErr) {
          console.warn("Could not verify existing submission:", subErr);
        }
      }

      this.view.renderExamTaker({ exam, questions });
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async submitAnswers({ examId, studentName, studentPhone, answers }) {
    this.view.showLoading();
    try {
      await this.submitExamUseCase.execute({
        examId,
        studentName,
        studentPhone,
        answers
      });
      this.view.onExamSubmitted();
    } catch (e) {
      this.view.showError(e.message);
    }
  }
}
