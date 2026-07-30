-- ====================================================================
-- ترقية الأمان (Security Upgrade) لمنصة حوزة أم البنين
-- هذا الملف يلغي الصلاحيات المفتوحة للعامة ويستبدلها بدوال آمنة (RPCs)
-- ====================================================================

-- 1. إلغاء سياسات القراءة العامة للأسئلة والإجابات والطلاب
DROP POLICY IF EXISTS "Public read access for questions" ON public.questions;
DROP POLICY IF EXISTS "Public read access for submissions" ON public.submissions;
DROP POLICY IF EXISTS "Public read access for students" ON public.students;

-- 2. إرجاع سياسة تمنع القراءة لغير المشرفين (المسجلين)
CREATE POLICY "Authenticated read access for questions" 
ON public.questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read access for submissions" 
ON public.submissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read access for students" 
ON public.students FOR SELECT TO authenticated USING (true);

-- ====================================================================
-- 3. دوال الأمان Backend Functions (RPCs)
-- ====================================================================

-- دالة تسجيل الدخول الآمن للطلاب
CREATE OR REPLACE FUNCTION public.rpc_login_student(p_name text, p_number int)
RETURNS SETOF public.students
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY 
  SELECT * FROM public.students
  WHERE trim(student_name) = trim(p_name)
  AND (member_number = p_number OR hawza_number = p_number)
  LIMIT 1;
END;
$$;

-- دالة جلب أسئلة الامتحان للطلاب (تخفي الإجابة الصحيحة correct_option_index)
CREATE OR REPLACE FUNCTION public.rpc_get_exam_questions(p_exam_id uuid)
RETURNS TABLE (
  id uuid,
  exam_id uuid,
  question_text text,
  options jsonb,
  points int,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id, exam_id, question_text, options, points, created_at
  FROM public.questions
  WHERE exam_id = p_exam_id
  ORDER BY created_at ASC;
$$;

-- دالة تصحيح وتسليم الامتحان (تحسب النتيجة في السيرفر وتمنع الغش)
CREATE OR REPLACE FUNCTION public.rpc_submit_exam(
    p_exam_id uuid, 
    p_student_phone text, 
    p_student_name text, 
    p_answers jsonb
)
RETURNS public.submissions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score int := 0;
  v_q record;
  v_exam record;
  v_sub public.submissions;
BEGIN
  -- جلب معلومات الامتحان
  SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
  
  -- حساب النتيجة بمقارنة الإجابات المرفقة بالإجابات الصحيحة في قاعدة البيانات
  FOR v_q IN SELECT * FROM public.questions WHERE exam_id = p_exam_id LOOP
    -- فحص ما إذا كان الطالب اختار الإجابة الصحيحة
    IF p_answers ? (v_q.id::text) THEN
      IF (p_answers->>(v_q.id::text))::int = v_q.correct_option_index THEN
        v_score := v_score + v_q.points;
      END IF;
    END IF;
  END LOOP;

  -- إنشاء سجل التسليم
  INSERT INTO public.submissions (
    exam_id, 
    student_phone, 
    student_name, 
    answers, 
    score, 
    "examTitle", 
    subject
  )
  VALUES (
    p_exam_id,
    p_student_phone,
    p_student_name,
    p_answers,
    v_score,
    v_exam.title,
    v_exam.subject
  )
  RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;

-- التأكد من إعطاء صلاحية التشغيل للمستخدمين (بما فيهم anon)
GRANT EXECUTE ON FUNCTION public.rpc_login_student(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_exam_questions(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_exam(uuid, text, text, jsonb) TO anon, authenticated;
