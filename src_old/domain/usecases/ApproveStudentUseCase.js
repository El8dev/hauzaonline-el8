// src/domain/usecases/ApproveStudentUseCase.js
window.ApproveStudentUseCase = class ApproveStudentUseCase {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute(studentId, stage, section) {
    if (!studentId) throw new Error("معرّف الطالب مطلوب.");
    return await this.studentRepository.approveStudent(studentId, stage, section);
  }
}
