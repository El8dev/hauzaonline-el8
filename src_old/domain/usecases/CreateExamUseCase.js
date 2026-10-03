// src/domain/usecases/CreateExamUseCase.js
window.CreateExamUseCase = class CreateExamUseCase {
  constructor(examRepository) {
    this.examRepository = examRepository;
  }

  async execute({ title, description, start_time, end_time, created_by, questions, subject, target_stage, target_sections, shuffle_order, test_type }) {
    if (!title || title.trim() === "") {
      throw new Error("عنوان الامتحان مطلوب.");
    }
    if (!questions || questions.length === 0) {
      throw new Error("يجب إضافة سؤال واحد على الأقل.");
    }
    
    questions.forEach((q, idx) => {
      if (!q.questionText || q.questionText.trim() === "") {
        throw new Error(`نص السؤال رقم ${idx + 1} فارغ.`);
      }
      if (!q.options || q.options.length < 2) {
        throw new Error(`السؤال رقم ${idx + 1} يجب أن يحتوي على خيارين على الأقل.`);
      }
      if (q.options.some(opt => !opt.text || String(opt.text).trim() === "")) {
        throw new Error(`يوجد خيار فارغ في السؤال رقم ${idx + 1}.`);
      }
      if (!(Number(q.points) > 0)) {
        throw new Error(`درجة السؤال رقم ${idx + 1} يجب أن تكون أكبر من صفر.`);
      }
      const hasCorrect = q.options && q.options.some(opt => opt.isCorrect);
      if (!hasCorrect) {
        throw new Error(`يجب تحديد إجابة صحيحة واحدة على الأقل للسؤال رقم ${idx + 1}.`);
      }
    });

    if (start_time && end_time && new Date(end_time) <= new Date(start_time)) {
      throw new Error("وقت انتهاء الامتحان يجب أن يكون بعد وقت البدء.");
    }

    const examData = {
      title,
      description,
      start_time: start_time || new Date().toISOString(),
      end_time: end_time || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_by,
      subject: subject || "غير محدد",
      target_stage: target_stage || "",
      target_sections: target_sections || ["الكل"],
      shuffle_order: shuffle_order !== undefined ? shuffle_order : true,
      test_type: test_type || "quiz"
    };

    return await this.examRepository.createExam(examData, questions);
  }
}
