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
      const examData = await this.examRepository.getExamById(examId);
      if (!examData) {
        this.view.onExamNotFound();
        return;
      }
      const exam = new window.Exam(examData);

      if (exam.isEnded()) {
        this.view.onExamEnded(exam);
        return;
      }
      if (!exam.isStarted()) {
        this.view.onExamNotStarted(exam);
        return;
      }

      const student = this.view.currentStudent;
      if (!student) {
        this.view.hideLoading();
        this.view.showStudentCard("student-verify-card");
        return;
      }

      // التسليمات السابقة للطالبة (للتحقق من التكرار وأهلية الدور الثاني)
      let mySubs = [];
      try {
        mySubs = await this.submissionRepository.getMySubmissions({
          name: student.loginName || student.studentName,
          number: student.memberNumber,
          phone: student.studentPhone,
        });
      } catch (subErr) {
        console.warn("Could not verify existing submission:", subErr);
      }

      const existingSub = mySubs.find((s) => s.exam_id === exam.id);
      if (existingSub) {
        this.view.onExamAlreadyTaken(exam, existingSub);
        return;
      }

      const access = await this.view.checkExamAccess(exam, mySubs);
      if (!access.allowed) {
        this.view.onExamNotAllowed(exam, access.reason);
        return;
      }

      const questionsData = await this.examRepository.getExamQuestions(examId);
      const questions = questionsData.map((q) => new window.Question(q));
      if (questions.length === 0) {
        throw new Error("لا توجد أسئلة متوفرة لهذا الامتحان حالياً.");
      }

      this.view.renderExamTaker({ exam, questions });
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async submitAnswers({ examId, studentName, studentPhone, studentNumber, loginName, answers }) {
    this.view.showLoading();
    try {
      await this.submitExamUseCase.execute({
        examId,
        studentName,
        studentPhone,
        studentNumber,
        loginName,
        answers
      });
      this.view.onExamSubmitted(examId);
      return true;
    } catch (e) {
      this.view.showError(e.message);
      return false;
    }
  }
}
