// src/domain/entities/Question.js
window.Question = class Question {
  constructor({ id, exam_id, question_text, options, correct_option_index, points, created_at }) {
    this.id = id;
    this.examId = exam_id;
    this.questionText = question_text;
    this.options = options || [];
    this.correctOptionIndex = Number(correct_option_index);
    this.points = points || 1;
    this.createdAt = created_at ? new Date(created_at) : null;
  }

  isCorrect(selectedOptionIndex) {
    return Number(selectedOptionIndex) === this.correctOptionIndex;
  }
}
