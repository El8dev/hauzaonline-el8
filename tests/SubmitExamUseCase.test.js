import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../src_old/domain/usecases/SubmitExamUseCase.js';

describe('SubmitExamUseCase', () => {
  let useCase;
  let mockExamRepo;
  let mockSubmissionRepo;

  beforeEach(() => {
    mockExamRepo = {
      getExamQuestions: vi.fn(),
    };
    mockSubmissionRepo = {
      submitExam: vi.fn(),
    };
    // The class is attached to window by the imported script
    useCase = new window.SubmitExamUseCase(mockExamRepo, mockSubmissionRepo);
  });

  it('should throw an error if studentName is missing', async () => {
    await expect(useCase.execute({ examId: '1', studentName: '', answers: {} }))
      .rejects
      .toThrow('يرجى إدخال اسمك الرباعي للمتابعة.');
  });

  it('should throw an error if examId is missing', async () => {
    await expect(useCase.execute({ examId: '', studentName: 'Ahmed', answers: {} }))
      .rejects
      .toThrow('معرّف الامتحان مطلوب.');
  });

  it('should send the student credentials to the server-side grader', async () => {
    mockSubmissionRepo.submitExam.mockResolvedValue({ id: 'sub1' });

    const result = await useCase.execute({
      examId: '1',
      studentName: 'Ahmed',
      studentPhone: '12345678',
      studentNumber: 12345,
      loginName: 'Ahmed Ali',
      answers: { q1: 0 }
    });

    expect(mockSubmissionRepo.submitExam).toHaveBeenCalledWith({
      exam_id: '1',
      student_name: 'Ahmed',
      student_phone: '12345678',
      student_number: 12345,
      student_login_name: 'Ahmed Ali',
      answers: { q1: 0 }
    });
    expect(mockExamRepo.getExamQuestions).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'sub1' });
  });
});
