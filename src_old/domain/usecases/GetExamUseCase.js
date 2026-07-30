// src/domain/usecases/GetExamUseCase.js
window.GetExamUseCase = class GetExamUseCase {
  constructor(examRepository) {
    this.examRepository = examRepository;
  }

  async execute(examId) {
    if (!examId) throw new Error("معرّف الامتحان مطلوب.");

    const examData = await this.examRepository.getExamById(examId);
    if (!examData) throw new Error("لم يتم العثور على هذا الامتحان.");

    const questionsData = await this.examRepository.getExamQuestions(examId);

    // Read from window object since we load script sequentially
    const exam = new window.Exam(examData);
    const questions = questionsData.map(q => new window.Question(q));

    return { exam, questions };
  }
}
