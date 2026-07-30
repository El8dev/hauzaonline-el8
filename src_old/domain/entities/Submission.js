// src/domain/entities/Submission.js
window.Submission = class Submission {
  constructor({ id, exam_id, student_name, student_phone, answers, score, submitted_at }) {
    this.id = id;
    this.examId = exam_id;
    this.studentName = student_name;
    this.studentPhone = student_phone || "";
    this.answers = answers || {};
    this.score = score || 0;
    this.submittedAt = submitted_at ? new Date(submitted_at) : null;
  }
}
