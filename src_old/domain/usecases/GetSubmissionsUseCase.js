// src/domain/usecases/GetSubmissionsUseCase.js
window.GetSubmissionsUseCase = class GetSubmissionsUseCase {
  constructor(submissionRepository) {
    this.submissionRepository = submissionRepository;
  }

  async execute(examId) {
    if (!examId) throw new Error("معرّف الامتحان مطلوب لعرض النتائج.");
    
    const submissionsData = await this.submissionRepository.getSubmissionsByExam(examId);
    return submissionsData.map(sub => new window.Submission(sub));
  }
}
