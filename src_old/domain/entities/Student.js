// src/domain/entities/Student.js
window.Student = class Student {
  constructor({ id, student_name, surname, student_phone, status, hawza_number, created_at, province, marital_status, is_student, study_type, hawza_study, birthdate, stage, qualification, telegram_user }) {
    this.id = id;
    this.studentName = student_name;
    this.surname = surname || "";
    this.studentPhone = student_phone;
    this.status = status || "pending";
    this.hawzaNumber = hawza_number ? Number(hawza_number) : null;
    this.createdAt = created_at ? new Date(created_at) : null;
    this.province = province || "";
    this.maritalStatus = marital_status || "";
    this.isStudent = is_student || "";
    this.studyType = study_type || "";
    this.hawzaStudy = hawza_study || "";
    this.birthdate = birthdate || "";
    this.stage = stage || "";
    this.qualification = qualification || "";
    this.telegramUser = telegram_user || "";
  }

  isApproved() {
    return this.status === "approved";
  }

  isPending() {
    return this.status === "pending";
  }

  isRejected() {
    return this.status === "rejected";
  }
}
