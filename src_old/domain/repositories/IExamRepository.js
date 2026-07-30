// src/domain/repositories/IExamRepository.js
window.IExamRepository = class IExamRepository {
  async createExam(examData, questionsData) {
    throw new Error("createExam method not implemented");
  }

  async getExamById(id) {
    throw new Error("getExamById method not implemented");
  }

  async getExamQuestions(examId) {
    throw new Error("getExamQuestions method not implemented");
  }

  async listExamsByCreator(creatorId) {
    throw new Error("listExamsByCreator method not implemented");
  }

  async deleteExam(id) {
    throw new Error("deleteExam method not implemented");
  }
}
