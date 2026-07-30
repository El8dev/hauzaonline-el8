// src/presentation/controllers/ExamCreatorController.js

window.ExamCreatorController = class ExamCreatorController {
  constructor(view) {
    this.view = view;
    this.examRepository = new window.SupabaseExamRepository();
    this.submissionRepository = new window.SupabaseSubmissionRepository();
    
    // Wire Use Cases
    this.createExamUseCase = new window.CreateExamUseCase(this.examRepository);
    this.getSubmissionsUseCase = new window.GetSubmissionsUseCase(this.submissionRepository);
  }

  async loadMyExams(userId) {
    this.view.showLoading();
    try {
      const exams = await this.examRepository.listExamsByCreator(userId);
      this.view.renderExamsList(exams);
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async createNewExam({ title, description, start_time, end_time, created_by, questions, subject, target_stage, target_sections, shuffle_order }) {
    this.view.showLoading();
    try {
      const result = await this.createExamUseCase.execute({
        title,
        description,
        start_time,
        end_time,
        created_by,
        questions,
        subject,
        target_stage,
        target_sections,
        shuffle_order
      });
      this.view.onExamCreated(result.exam);
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async loadExamResults(examId) {
    this.view.showLoading();
    try {
      const exam = await this.examRepository.getExamById(examId);
      const questions = await this.examRepository.getAdminExamQuestions(examId);
      const submissions = await this.getSubmissionsUseCase.execute(examId);
      
      this.view.renderExamResults({ exam, questions, submissions });
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async deleteExamResult(submissionId, examId) {
    if (!confirm("هل أنت متأكد من حذف هذه النتيجة نهائياً؟")) return;
    this.view.showLoading();
    try {
      await this.submissionRepository.deleteSubmission(submissionId);
      this.view.showToast("✅ تم حذف النتيجة بنجاح.");
      this.loadExamResults(examId); // Reload results
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async deleteExam(examId, userId) {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا الامتحان؟ سيتم حذف جميع الأسئلة والنتائج المرتبطة به نهائياً.")) {
      return;
    }
    this.view.showLoading();
    try {
      await this.examRepository.deleteExam(examId);
      await this.loadMyExams(userId);
    } catch (e) {
      this.view.showError(e.message);
    }
  }
}
