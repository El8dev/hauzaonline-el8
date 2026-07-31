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
    await expect(useCase.execute({ examId: '1', studentName: '', answers: [] }))
      .rejects
      .toThrow('يرجى إدخال اسمك الرباعي للمتابعة.');
  });

  it('should throw an error if no questions are found', async () => {
    mockExamRepo.getExamQuestions.mockResolvedValue([]);
    await expect(useCase.execute({ examId: '1', studentName: 'Ahmed', answers: [] }))
      .rejects
      .toThrow('لا توجد أسئلة متوفرة لهذا الامتحان.');
  });

  it('should call submissionRepository.submitExam on success', async () => {
    mockExamRepo.getExamQuestions.mockResolvedValue([{ id: 'q1' }]);
    mockSubmissionRepo.submitExam.mockResolvedValue({ id: 'sub1' });

    const result = await useCase.execute({ 
      examId: '1', 
      studentName: 'Ahmed', 
      studentPhone: '12345678',
      answers: [{ q: 'q1', a: 'a1' }] 
    });
    
    expect(mockSubmissionRepo.submitExam).toHaveBeenCalledWith({
      exam_id: '1',
      student_name: 'Ahmed',
      student_phone: '12345678',
      answers: [{ q: 'q1', a: 'a1' }]
    });
    expect(result).toEqual({ id: 'sub1' });
  });
});
