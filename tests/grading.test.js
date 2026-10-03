import { describe, it, expect } from "vitest";
import {
  computeStageResults,
  isSecondSessionEligible,
  examTargetsStudent,
  nextStageOf,
  sectionForNextStage,
  splitEvenly,
  gradeAnswer,
  scaleToComponent,
  normalizeArabic,
  normalizePhone,
} from "../src/grading.js";

const H = 3600 * 1000;
const NOW = Date.UTC(2026, 9, 3, 12);
const at = (hoursFromNow) => new Date(NOW + hoursFromNow * H).toISOString();

const exam = (id, subject, test_type, { stage = "المرحلة الأولى", sections = ["أ"], start = -48, end = -47 } = {}) => ({
  id,
  subject,
  test_type,
  target_stage: stage,
  target_sections: sections,
  start_time: at(start),
  end_time: at(end),
});

const base = { stage: "المرحلة الأولى", section: "أ", now: NOW };

describe("computeStageResults", () => {
  const exams = [
    exam("h-fiqh", "الفقه", "half", { start: -100, end: -99 }),
    exam("f-fiqh", "الفقه", "final", { start: -50, end: -49 }),
    exam("h-aqaid", "العقائد", "half", { start: -100, end: -99 }),
    exam("f-aqaid", "العقائد", "final", { start: -50, end: -49 }),
    exam("q-fiqh", "الفقه", "quiz", { start: -120, end: -119 }),
  ];

  it("passes when half + final >= 50 in every subject", () => {
    const r = computeStageResults({
      ...base,
      exams,
      submissions: [
        { exam_id: "h-fiqh", score: 30 },
        { exam_id: "f-fiqh", score: 25 },
        { exam_id: "h-aqaid", score: 20 },
        { exam_id: "f-aqaid", score: 30 },
        { exam_id: "q-fiqh", score: 1 },
      ],
    });
    expect(r.requiredCount).toBe(2);
    expect(r.subjects.map((s) => [s.subject, s.status, s.total])).toEqual([
      ["الفقه", "pass", 55],
      ["العقائد", "pass", 50],
    ]);
    expect(r.allPassed).toBe(true);
    expect(r.overall).toBe("pass");
    expect(r.average).toBe(52.5);
  });

  it("marks a failed subject as retake and an absent final as 0", () => {
    const r = computeStageResults({
      ...base,
      exams,
      submissions: [
        { exam_id: "h-fiqh", score: 30 },
        { exam_id: "f-fiqh", score: 10 },
        { exam_id: "h-aqaid", score: 40 },
        // absent from the aqaid final
      ],
    });
    expect(r.subjects[0]).toMatchObject({ status: "retake", total: 40 });
    expect(r.subjects[1]).toMatchObject({ status: "retake", total: 40 });
    expect(r.subjects[1].final.state).toBe("absent");
    expect(r.overall).toBe("retake");
    expect(r.allPassed).toBe(false);
  });

  it("is pending while half or final has not happened yet", () => {
    const upcoming = [exam("h", "الفقه", "half", { start: -10, end: -9 }), exam("f", "الفقه", "final", { start: 5, end: 6 })];
    const r = computeStageResults({ ...base, exams: upcoming, submissions: [{ exam_id: "h", score: 45 }] });
    expect(r.subjects[0].status).toBe("pending");
    expect(r.overall).toBe("pending");
  });

  it("second session replaces the final when higher and can pass the subject", () => {
    const withSecond = [...exams, exam("s-fiqh", "الفقه", "second_session", { start: -10, end: 10 })];
    const subs = [
      { exam_id: "h-fiqh", score: 20 },
      { exam_id: "f-fiqh", score: 10 },
      { exam_id: "h-aqaid", score: 30 },
      { exam_id: "f-aqaid", score: 30 },
    ];
    const ctx = { ...base, exams: withSecond, submissions: subs };
    expect(isSecondSessionEligible(withSecond[5], ctx)).toBe(true);

    const after = computeStageResults({ ...ctx, submissions: [...subs, { exam_id: "s-fiqh", score: 35 }] });
    expect(after.subjects[0]).toMatchObject({ status: "pass", total: 55, viaSecond: true });
    expect(after.allPassed).toBe(true);
    expect(isSecondSessionEligible(withSecond[5], { ...ctx, submissions: [...subs, { exam_id: "s-fiqh", score: 35 }] })).toBe(false);
  });

  it("fails the subject when the second session is also below 50 or missed", () => {
    const withSecond = [...exams, exam("s-fiqh", "الفقه", "second_session", { start: -10, end: -9 })];
    const subs = [
      { exam_id: "h-fiqh", score: 5 },
      { exam_id: "f-fiqh", score: 10 },
      { exam_id: "h-aqaid", score: 30 },
      { exam_id: "f-aqaid", score: 30 },
    ];
    const missed = computeStageResults({ ...base, exams: withSecond, submissions: subs });
    expect(missed.subjects[0].status).toBe("fail");
    const low = computeStageResults({ ...base, exams: withSecond, submissions: [...subs, { exam_id: "s-fiqh", score: 20 }] });
    expect(low.subjects[0]).toMatchObject({ status: "fail", total: 25 });
    expect(low.overall).toBe("fail");
  });

  it("does not offer the second session to students who passed or before the final", () => {
    const second = exam("s-fiqh", "الفقه", "second_session", { start: -1, end: 10 });
    const passed = { ...base, exams: [...exams, second], submissions: [{ exam_id: "h-fiqh", score: 30 }, { exam_id: "f-fiqh", score: 30 }] };
    expect(isSecondSessionEligible(second, passed)).toBe(false);

    const finalNotYet = [exam("h", "الفقه", "half", { start: -10, end: -9 }), exam("f", "الفقه", "final", { start: 5, end: 6 }), second];
    expect(isSecondSessionEligible(second, { ...base, exams: finalNotYet, submissions: [] })).toBe(false);
  });

  it("only counts exams of the requested stage (after promotion the old stage is separate)", () => {
    const stage2 = [exam("h2", "الفقه", "half", { stage: "المرحلة الثانية" }), exam("f2", "الفقه", "final", { stage: "المرحلة الثانية" })];
    const subs = [
      { exam_id: "h-fiqh", score: 30 },
      { exam_id: "f-fiqh", score: 30 },
      { exam_id: "h-aqaid", score: 30 },
      { exam_id: "f-aqaid", score: 30 },
    ];
    const s2 = computeStageResults({ ...base, stage: "المرحلة الثانية", exams: [...exams, ...stage2], submissions: subs });
    expect(s2.subjects).toHaveLength(1);
    expect(s2.subjects[0]).toMatchObject({ subject: "الفقه", status: "retake", total: 0 });
    const s1 = computeStageResults({ ...base, exams: [...exams, ...stage2], submissions: subs });
    expect(s1.allPassed).toBe(true);
  });

  it("uses configured stage subjects when present (missing exams keep the stage pending)", () => {
    const r = computeStageResults({
      ...base,
      exams,
      requiredSubjects: ["الفقه", "العقائد", "النحو"],
      submissions: [
        { exam_id: "h-fiqh", score: 30 },
        { exam_id: "f-fiqh", score: 30 },
        { exam_id: "h-aqaid", score: 30 },
        { exam_id: "f-aqaid", score: 30 },
      ],
    });
    expect(r.subjects.map((s) => s.status)).toEqual(["pass", "pass", "pending"]);
    expect(r.allPassed).toBe(false);
  });

  it("uses the latest exam of each type (repeated year)", () => {
    const old = [exam("h-old", "الفقه", "half", { start: -9000, end: -8999 }), exam("f-old", "الفقه", "final", { start: -8000, end: -7999 })];
    const fresh = [exam("h-new", "الفقه", "half", { start: -100, end: -99 }), exam("f-new", "الفقه", "final", { start: -50, end: -49 })];
    const r = computeStageResults({
      ...base,
      exams: [...old, ...fresh],
      submissions: [
        { exam_id: "h-old", score: 5 },
        { exam_id: "f-old", score: 5 },
        { exam_id: "h-new", score: 30 },
        { exam_id: "f-new", score: 25 },
      ],
    });
    expect(r.subjects[0]).toMatchObject({ status: "pass", total: 55 });
  });

  it("scales exams whose total is not 50", () => {
    const r = computeStageResults({
      ...base,
      exams,
      maxScores: { "h-fiqh": 100, "f-fiqh": 100, "h-aqaid": 50, "f-aqaid": 50 },
      submissions: [
        { exam_id: "h-fiqh", score: 60 },
        { exam_id: "f-fiqh", score: 50 },
        { exam_id: "h-aqaid", score: 25 },
        { exam_id: "f-aqaid", score: 25 },
      ],
    });
    expect(r.subjects[0].total).toBe(55);
    expect(scaleToComponent(120, 100)).toBe(50);
  });
});

describe("targeting", () => {
  it("normalizes Arabic letter variants and supports الكل", () => {
    expect(examTargetsStudent({ target_stage: "المرحلة الاولى", target_sections: ["أ"] }, "المرحلة الأولى", "ا")).toBe(true);
    expect(examTargetsStudent({ target_stage: "الكل", target_sections: ["الكل"] }, "أي مرحلة", "ب")).toBe(true);
    expect(examTargetsStudent({ target_stage: "المرحلة الأولى", target_sections: ["أ"] }, "المرحلة الثانية", "أ")).toBe(false);
    expect(examTargetsStudent({ target_stage: "المرحلة الأولى", target_sections: '["ب"]' }, "المرحلة الأولى", "أ")).toBe(false);
    expect(normalizeArabic("  فاطِمَة   أحمد ")).toBe("فاطمه احمد");
  });
});

describe("promotion helpers", () => {
  const stages = ["المرحلة الأولى", "المرحلة الثانية", "المرحلة الثالثة"];
  it("finds the next stage and keeps the section when possible", () => {
    expect(nextStageOf(stages, "المرحلة الاولى")).toBe("المرحلة الثانية");
    expect(nextStageOf(stages, "المرحلة الثالثة")).toBe(null);
    expect(nextStageOf(stages, "غير معروفة")).toBe(null);
    expect(sectionForNextStage(["أ", "ب"], "ب")).toBe("ب");
    expect(sectionForNextStage(["أ"], "ب")).toBe("أ");
    expect(sectionForNextStage([], "ب")).toBe("ب");
  });
});

describe("question grading (mirror of the SQL grader)", () => {
  const single = { points: 10, options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: false }] };
  const multi = { points: 10, options: [{ text: "a", isCorrect: true }, { text: "b", isCorrect: true }, { text: "c" }] };
  it("grades single, multi, partial and select-all answers", () => {
    expect(gradeAnswer(single, 0)).toBe(10);
    expect(gradeAnswer(single, [1])).toBe(0);
    expect(gradeAnswer(multi, [0])).toBe(5);
    expect(gradeAnswer(multi, [0, 1])).toBe(10);
    expect(gradeAnswer(multi, [0, 1, 2])).toBe(0);
    expect(gradeAnswer({ points: 5, options: ["x", "y"], correct_option_index: 1 }, 1)).toBe(5);
    expect(gradeAnswer(single, undefined)).toBe(0);
  });
});

describe("misc", () => {
  it("splits totals so they sum exactly", () => {
    const parts = splitEvenly(50, 3);
    expect(parts).toEqual([16.67, 16.67, 16.66]);
    expect(Math.round(parts.reduce((a, b) => a + b, 0) * 100)).toBe(5000);
  });
  it("normalizes Arabic-Indic digits in phones", () => {
    expect(normalizePhone("٠٧٧٠ ١٢٣-٤٥٦٧")).toBe("07701234567");
  });
});
