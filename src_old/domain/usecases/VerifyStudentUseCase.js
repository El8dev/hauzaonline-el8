// src/domain/usecases/VerifyStudentUseCase.js
window.VerifyStudentUseCase = class VerifyStudentUseCase {
  constructor(studentRepository) {
    this.studentRepository = studentRepository;
  }

  async execute(identifier) {
    if (!identifier || identifier.toString().trim() === "") {
      throw new Error("يرجى إدخال رقم الهاتف أو رقم العضوية المعتمد.");
    }

    const cleanInput = identifier.toString().trim();
    let studentData = null;

    if (!isNaN(cleanInput) && Number(cleanInput) >= 300) {
      studentData = await this.studentRepository.getStudentByMemberNumber(Number(cleanInput));
    } else {
      studentData = await this.studentRepository.getStudentByPhone(cleanInput);
    }

    if (!studentData) {
      throw new Error("لم يتم العثور على أي حساب مسجل بهذه البيانات. يرجى تقديم طلب التحاق أولاً.");
    }

    const student = new window.Student(studentData);

    if (student.isPending()) {
      throw new Error("طلب التحاقك قيد المراجعة حالياً من قبل الإدارة. يرجى الانتظار.");
    }

    if (student.isRejected()) {
      throw new Error("عذراً، تم رفض طلب التحاقك بهذا الامتحان.");
    }

    return student;
  }
}
