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

  // كل الامتحانات تظهر لكل المشرفين (كانت تُفلتر بمنشئ الامتحان فتختفي امتحانات المشرفين الآخرين
  // أو كل الامتحانات عند فقدان معرّف الجلسة بعد إعادة تحميل الصفحة)
  async loadMyExams() {
    this.view.showLoading();
    try {
      const exams = await this.examRepository.listAllExams();
      this.view.renderExamsList(exams);
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async createNewExam({ title, description, start_time, end_time, created_by, questions, subject, target_stage, target_sections, shuffle_order, test_type }) {
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
        shuffle_order,
        test_type
      });
      this.view.onExamCreated(result.exam);
      return true;
    } catch (e) {
      this.view.showError(e.message);
      return false;
    }
  }

  async loadExamResults(examId) {
    this.view.showLoading();
    try {
      const exam = await this.examRepository.getExamById(examId);
      if (!exam) throw new Error("لم يتم العثور على هذا الامتحان.");
      const questions = (await this.examRepository.getAdminExamQuestions(examId)).map((q) => new window.Question(q));
      const submissions = await this.getSubmissionsUseCase.execute(examId);

      await this.view.renderExamResults({ exam, questions, submissions });
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async deleteExamResult(submissionId, examId) {
    if (!confirm("هل أنت متأكد من حذف هذه النتيجة نهائياً؟ ستتمكن الطالبة من إعادة الامتحان إذا كان وقته ما زال مفتوحاً.")) return;
    this.view.showLoading();
    try {
      await this.submissionRepository.deleteSubmission(submissionId);
      this.view.showToast("تم حذف النتيجة بنجاح.", "success");
      await this.loadExamResults(examId); // Reload results
    } catch (e) {
      this.view.showError(e.message);
    }
  }

  async deleteExam(exam) {
    this.view.showLoading();
    let resultsCount = 0;
    try {
      resultsCount = (await this.submissionRepository.getSubmissionsByExam(exam.id)).length;
    } catch (e) {
      console.warn("Could not count exam submissions:", e);
    }
    this.view.hideLoading();

    const warning = resultsCount > 0
      ? `\n\n⚠️ تحذير: يوجد ${resultsCount} نتيجة مسجلة لهذا الامتحان وسيتم حذفها نهائياً، وقد يؤثر ذلك على درجات الطالبات وشهاداتهن.`
      : "";
    if (!confirm(`هل أنت متأكد من حذف الامتحان "${exam.title}" فقط؟ سيتم حذف أسئلته ونتائجه نهائياً.${warning}`)) {
      return;
    }
    this.view.showLoading();
    try {
      await this.examRepository.deleteExam(exam.id);
      this.view.showToast(`تم حذف الامتحان "${exam.title}".`, "success");
      await this.loadMyExams();
    } catch (e) {
      this.view.showError(e.message);
    }
  }
}
