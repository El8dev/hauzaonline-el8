// قواعد التقييم الأكاديمي الموحدة (تُستخدم في السجل، الملف، كشف النشر، الشهادة، الترقية، وبوابة الطالبة)
//
// لكل مادة في المرحلة:
//   نصف السنة (half) من 50 + النهائي (final) من 50 = 100، والنجاح من 50.
//   إذا كان المجموع أقل من 50 تصبح الطالبة مؤهلة لامتحان الدور الثاني (second_session) لتلك المادة،
//   ودرجة الدور الثاني (من 50) تحل محل درجة النهائي إذا كانت أعلى.
//   الكويزات (quiz) لا تدخل في النجاح.
// الامتحان المعتمد لكل نوع ومادة هو الأحدث (حسب وقت البدء) من الامتحانات الموجهة لمرحلة الطالبة وشعبتها.

export const EXAM_TYPES = Object.freeze({
  QUIZ: "quiz",
  HALF: "half",
  FINAL: "final",
  SECOND: "second_session",
});
export const GRADED_TYPES = [EXAM_TYPES.HALF, EXAM_TYPES.FINAL, EXAM_TYPES.SECOND];
export const COMPONENT_MAX = 50;
export const PASS_MARK = 50;
export const ALL_TARGET = "الكل";

export function normalizeArabic(value) {
  return String(value ?? "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function toLatinDigits(value) {
  return String(value ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizePhone(value) {
  return toLatinDigits(value).replace(/\D/g, "");
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function formatScore(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return String(round2(n));
}

export function examType(exam) {
  return (exam && (exam.test_type || exam.testType)) || EXAM_TYPES.QUIZ;
}

export function examStageName(exam) {
  if (!exam) return "";
  if (exam.target_stage !== undefined && exam.target_stage !== null) return exam.target_stage;
  return exam.targetStage || "";
}

export function examSectionsList(exam) {
  let s = exam ? (exam.target_sections !== undefined ? exam.target_sections : exam.targetSections) : null;
  if (typeof s === "string") {
    try {
      s = JSON.parse(s);
    } catch {
      s = [s];
    }
  }
  if (!Array.isArray(s) || s.length === 0) return [ALL_TARGET];
  return s;
}

function toMs(value) {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function examStartMs(exam) {
  return toMs(exam && (exam.start_time || exam.startTime));
}

export function examEndMs(exam) {
  return toMs(exam && (exam.end_time || exam.endTime));
}

export function examHasEnded(exam, now = Date.now()) {
  const end = examEndMs(exam);
  return end !== null && now > end;
}

export function stageMatches(exam, stage) {
  const es = normalizeArabic(examStageName(exam));
  if (!es || es === normalizeArabic(ALL_TARGET)) return true;
  const st = normalizeArabic(stage);
  return st !== "" && es === st;
}

export function sectionMatches(exam, section) {
  const secs = examSectionsList(exam).map(normalizeArabic);
  if (secs.includes(normalizeArabic(ALL_TARGET))) return true;
  const ns = normalizeArabic(section);
  return ns !== "" && secs.includes(ns);
}

export function examTargetsStudent(exam, stage, section) {
  return stageMatches(exam, stage) && sectionMatches(exam, section);
}

export function sameSubject(a, b) {
  return normalizeArabic(a) === normalizeArabic(b);
}

// تحويل الدرجة الخام إلى مقياس 50 (إذا كان مجموع درجات الامتحان مختلفاً عن 50)
export function scaleToComponent(rawScore, maxScore) {
  const raw = Number(rawScore) || 0;
  const max = Number(maxScore);
  let scaled = raw;
  if (max > 0 && Math.abs(max - COMPONENT_MAX) > 0.01) {
    scaled = (raw / max) * COMPONENT_MAX;
  }
  return round2(Math.min(Math.max(scaled, 0), COMPONENT_MAX));
}

export function percentOf(rawScore, maxScore) {
  const max = Number(maxScore);
  if (!(max > 0)) return null;
  return round2(((Number(rawScore) || 0) / max) * 100);
}

function latestBy(list, getMs) {
  let best = null;
  let bestMs = -Infinity;
  for (const item of list) {
    const ms = getMs(item) ?? 0;
    if (best === null || ms >= bestMs) {
      best = item;
      bestMs = ms;
    }
  }
  return best;
}

/**
 * حساب نتائج طالبة لمرحلة معينة.
 * @param {object} p
 * @param {Array} p.exams جميع الامتحانات
 * @param {Array} p.submissions تسليمات هذه الطالبة فقط ({exam_id, score})
 * @param {string} p.stage المرحلة المطلوب حسابها
 * @param {string} p.section شعبة الطالبة
 * @param {Array<string>} [p.requiredSubjects] مواد المرحلة من إعدادات الهيكلية (إن وجدت)
 * @param {Object<string,number>} [p.maxScores] مجموع درجات كل امتحان (exam_id -> max)
 * @param {number} [p.now]
 */
export function computeStageResults({ exams = [], submissions = [], stage, section, requiredSubjects = [], maxScores = {}, now = Date.now() }) {
  const subByExam = new Map();
  for (const s of submissions) {
    if (!s || !s.exam_id) continue;
    const prev = subByExam.get(s.exam_id);
    if (!prev || (Number(s.score) || 0) > (Number(prev.score) || 0)) subByExam.set(s.exam_id, s);
  }

  const relevant = exams.filter(
    (e) => GRADED_TYPES.includes(examType(e)) && stageMatches(e, stage) && (sectionMatches(e, section) || subByExam.has(e.id)),
  );

  const subjectNames = [];
  const seen = new Set();
  const addSubject = (name) => {
    const key = normalizeArabic(name);
    if (!key || key === normalizeArabic("غير محدد") || seen.has(key)) return;
    seen.add(key);
    subjectNames.push(name);
  };
  if (Array.isArray(requiredSubjects) && requiredSubjects.length > 0) {
    requiredSubjects.forEach(addSubject);
  } else {
    relevant.filter((e) => examType(e) !== EXAM_TYPES.SECOND).forEach((e) => addSubject(e.subject));
  }

  const component = (exam) => {
    if (!exam) return { state: "none", score: null, exam: null };
    const sub = subByExam.get(exam.id);
    if (sub) {
      return { state: "done", score: scaleToComponent(sub.score, maxScores[exam.id]), exam, submission: sub };
    }
    if (examHasEnded(exam, now)) return { state: "absent", score: 0, exam };
    return { state: "upcoming", score: null, exam };
  };

  const subjects = subjectNames.map((subject) => {
    const ofType = (type) => relevant.filter((e) => examType(e) === type && sameSubject(e.subject, subject));
    const halfExam = latestBy(ofType(EXAM_TYPES.HALF), examStartMs);
    const finalExam = latestBy(ofType(EXAM_TYPES.FINAL), examStartMs);
    const finalStart = finalExam ? examStartMs(finalExam) : null;
    const secondExam = latestBy(
      ofType(EXAM_TYPES.SECOND).filter((e) => finalStart === null || (examStartMs(e) ?? 0) >= finalStart),
      examStartMs,
    );

    const half = component(halfExam);
    const final = component(finalExam);
    const second = component(secondExam);

    const result = { subject, half, final, second, firstTotal: null, total: null, status: "pending", viaSecond: false };

    const resolved = (c) => c.state === "done" || c.state === "absent";
    if (!resolved(half) || !resolved(final)) {
      result.total = half.score !== null || final.score !== null ? round2((half.score || 0) + (final.score || 0)) : null;
      return result;
    }

    result.firstTotal = round2(half.score + final.score);
    result.total = result.firstTotal;
    if (result.firstTotal >= PASS_MARK) {
      result.status = "pass";
      return result;
    }

    if (second.state === "done") {
      const best = Math.max(final.score, second.score);
      result.total = round2(half.score + best);
      result.viaSecond = second.score > final.score;
      result.status = result.total >= PASS_MARK ? "pass" : "fail";
    } else if (second.state === "absent") {
      result.status = "fail";
    } else {
      result.status = "retake";
    }
    return result;
  });

  const count = (st) => subjects.filter((s) => s.status === st).length;
  const scored = subjects.filter((s) => s.status !== "pending" && s.total !== null);
  const summary = {
    stage,
    subjects,
    requiredCount: subjects.length,
    passed: count("pass"),
    retake: count("retake"),
    failed: count("fail"),
    pending: count("pending"),
    average: scored.length ? round2(scored.reduce((a, s) => a + s.total, 0) / scored.length) : null,
  };
  summary.allPassed = summary.requiredCount > 0 && summary.passed === summary.requiredCount;
  if (summary.requiredCount === 0) summary.overall = "none";
  else if (summary.failed > 0) summary.overall = "fail";
  else if (summary.retake > 0) summary.overall = "retake";
  else if (summary.pending > 0) summary.overall = "pending";
  else summary.overall = "pass";
  return summary;
}

// هل تستطيع الطالبة رؤية/أداء امتحان الدور الثاني هذا؟
export function isSecondSessionEligible(exam, ctx) {
  const results = computeStageResults({ ...ctx, requiredSubjects: [exam.subject] });
  const r = results.subjects[0];
  // مؤهلة فقط إذا رسبت في (نصف السنة + النهائي) وكان هذا هو امتحان الدور الثاني المعتمد للمادة (بعد النهائي)
  return Boolean(r && r.status === "retake" && r.second.exam && r.second.exam.id === exam.id);
}

export const OVERALL_LABELS = Object.freeze({
  pass: "ناجحة",
  retake: "مكملة (دور ثانٍ)",
  fail: "راسبة",
  pending: "غير مكتملة",
  none: "لا توجد مواد مقيّمة",
});

export const SUBJECT_STATUS_LABELS = Object.freeze({
  pass: "ناجحة",
  retake: "دور ثانٍ",
  fail: "راسبة",
  pending: "بانتظار الامتحانات",
});

export function gradeWord(average) {
  if (average === null || average === undefined) return "";
  if (average >= 90) return "امتياز";
  if (average >= 80) return "جيد جداً";
  if (average >= 70) return "جيد";
  if (average >= 60) return "متوسط";
  if (average >= 50) return "مقبول";
  return "ضعيف";
}

export function findStageIndex(stages, stage) {
  const key = normalizeArabic(stage);
  return (stages || []).findIndex((s) => normalizeArabic(s) === key);
}

export function nextStageOf(stages, stage) {
  const idx = findStageIndex(stages, stage);
  if (idx === -1 || idx >= stages.length - 1) return null;
  return stages[idx + 1];
}

// الإبقاء على نفس الشعبة في المرحلة التالية إن وُجدت، وإلا أول شعبة
export function sectionForNextStage(nextSections, currentSection) {
  const list = Array.isArray(nextSections) ? nextSections : [];
  const match = list.find((s) => normalizeArabic(s) === normalizeArabic(currentSection));
  if (match) return match;
  if (list.length > 0) return list[0];
  return currentSection || "";
}

// توزيع الدرجة الكلية على الأسئلة بالتساوي بحيث يكون المجموع مطابقاً تماماً (بالسنتات)
export function splitEvenly(total, count) {
  if (!(count > 0)) return [];
  const cents = Math.round((Number(total) || 0) * 100);
  const base = Math.floor(cents / count);
  const rest = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < rest ? 1 : 0)) / 100);
}

// تصحيح محلي (للمشرف فقط عند عرض أوراق الإجابة) مطابق لتصحيح السيرفر
export function correctIndices(question) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const objectStyle = options.some((o) => o && typeof o === "object");
  if (objectStyle) {
    return options.map((o, i) => (o && (o.isCorrect === true || o.isCorrect === "true") ? i : -1)).filter((i) => i >= 0);
  }
  const idx = Number(question?.correct_option_index ?? question?.correctOptionIndex);
  return Number.isInteger(idx) && idx >= 0 && idx < options.length ? [idx] : [];
}

export function selectedIndices(answer) {
  const list = Array.isArray(answer) ? answer : answer === undefined || answer === null ? [] : [answer];
  const out = [];
  for (const v of list) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

export function gradeAnswer(question, answer) {
  const correct = correctIndices(question);
  const selected = selectedIndices(answer);
  const points = Number(question?.points) || 1;
  if (correct.length === 0 || selected.length === 0) return 0;
  if (selected.some((i) => !correct.includes(i))) return 0;
  return (points * selected.length) / correct.length;
}

export function optionText(option) {
  if (option && typeof option === "object") return option.text ?? "";
  return option ?? "";
}
