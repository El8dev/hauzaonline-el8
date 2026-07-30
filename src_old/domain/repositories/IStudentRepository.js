// src/domain/repositories/IStudentRepository.js
window.IStudentRepository = class IStudentRepository {
  async submitRequest({ student_name, student_phone }) {
    throw new Error("submitRequest not implemented");
  }

  async getStudentById(id) {
    throw new Error("getStudentById not implemented");
  }

  async getStudentByPhone(phone) {
    throw new Error("getStudentByPhone not implemented");
  }

  async getStudentByMemberNumber(memberNumber) {
    throw new Error("getStudentByMemberNumber not implemented");
  }

  async listAllStudents() {
    throw new Error("listAllStudents not implemented");
  }

  async approveStudent(id) {
    throw new Error("approveStudent not implemented");
  }

  async rejectStudent(id) {
    throw new Error("rejectStudent not implemented");
  }

  async deleteStudent(id) {
    throw new Error("deleteStudent not implemented");
  }
}
