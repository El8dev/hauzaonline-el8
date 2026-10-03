-- ====================================================================
-- تحديث الإنتاج والأمان الشامل - حوزة أم البنين (2026-10)
-- Production hardening & grading fix
--
-- آمن لإعادة التشغيل (Idempotent) ولا يحذف أي بيانات طلاب أو امتحانات أو نتائج.
-- التعليمات:
--   1) من لوحة Supabase: Authentication > Providers > Email > أوقف "Allow new users to sign up".
--   2) انسخ هذا الملف كاملاً في SQL Editor واضغط Run.
--   3) راجع قائمة المشرفين التي تظهر في آخر النتيجة واحذف أي حساب غير معروف:
--        DELETE FROM public.admins WHERE email = 'unknown@example.com';
--   لإضافة مشرف جديد لاحقاً (بعد إنشائه من Authentication > Users):
--        INSERT INTO public.admins (user_id, email) SELECT id, email FROM auth.users WHERE email = 'new@hawza.local';
--
-- ما الذي يصلحه:
--   * كان بإمكان أي شخص إنشاء حساب عبر الـ API والحصول على صلاحيات المشرف الكاملة (حذف/تعديل كل شيء).
--     الآن الصلاحيات الإدارية محصورة بجدول admins.
--   * كانت بيانات الطالبات الشخصية والنتائج وسجلات الحضور مقروءة للعامة بمفتاح التطبيق.
--   * كانت الإجابات الصحيحة تُرسل لجهاز الطالبة مع الأسئلة (isCorrect).
--   * كان بإمكان أي شخص إدخال نتيجة مزورة مباشرة في جدول submissions.
--   * التصحيح في السيرفر لم يكن يدعم الأسئلة متعددة الإجابات، والدرجات العشرية كانت تُرفض.
--   * منع تكرار تسليم نفس الامتحان، ومنع التسليم خارج وقت الامتحان.
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. جدول المشرفين المعتمدين (Admin allowlist)
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admins FROM anon;

-- أول تشغيل فقط: اعتماد الحسابات الموجودة حالياً كمشرفين (راجع القائمة في آخر النتيجة!)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.admins) THEN
        INSERT INTO public.admins (user_id, email)
        SELECT id, email FROM auth.users
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;

-- --------------------------------------------------------------------
-- 2. أعمدة الدرجات تقبل الكسور (مثل 16.67 عند توزيع 50 درجة على 3 أسئلة)
-- --------------------------------------------------------------------
ALTER TABLE public.questions ALTER COLUMN points TYPE NUMERIC USING points::numeric;
ALTER TABLE public.questions ALTER COLUMN points SET DEFAULT 1;
ALTER TABLE public.questions ALTER COLUMN correct_option_index DROP NOT NULL;
ALTER TABLE public.submissions ALTER COLUMN score TYPE NUMERIC USING score::numeric;
ALTER TABLE public.submissions ALTER COLUMN score SET DEFAULT 0;

-- --------------------------------------------------------------------
-- 3. دوال مساعدة داخلية
-- --------------------------------------------------------------------

-- توحيد كتابة الأسماء العربية للمقارنة (الهمزات، الياء، التاء المربوطة، التشكيل، المسافات)
CREATE OR REPLACE FUNCTION public._norm_name(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lower(btrim(regexp_replace(
        translate(
            regexp_replace(coalesce(t, ''), '[ً-ْـ]', '', 'g'),
            'أإآىة', 'ااايه'
        ),
        '\s+', ' ', 'g'
    )));
$$;

-- تحويل نص التاريخ المخزن إلى وقت (ويعيد NULL للقيم غير الصالحة بدلاً من الخطأ)
CREATE OR REPLACE FUNCTION public._ts(t text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
    RETURN t::timestamptz;
EXCEPTION WHEN others THEN
    RETURN NULL;
END;
$$;

-- التحقق من هوية الطالبة بالاسم + الرقم الحوزوي (نفس قواعد تسجيل الدخول)
CREATE OR REPLACE FUNCTION public._resolve_student(p_name text, p_number bigint)
RETURNS public.students
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v public.students;
    n text := public._norm_name(p_name);
    w text[];
    dn text;
    df text;
    dw text[];
BEGIN
    IF n = '' OR p_number IS NULL THEN
        RETURN NULL;
    END IF;
    w := string_to_array(n, ' ');

    FOR v IN
        SELECT * FROM public.students s
        WHERE (s.member_number = p_number OR s.hawza_number = p_number)
          AND coalesce(s.status, 'approved') = 'approved'
        ORDER BY s.created_at
    LOOP
        dn := public._norm_name(v.student_name);
        df := public._norm_name(coalesce(v.student_name, '') || ' ' || coalesce(v.surname, ''));
        dw := string_to_array(dn, ' ');
        IF dn <> '' AND (dn = n OR df = n) THEN
            RETURN v;
        END IF;
        -- الاسم واسم الأب يكفيان (مثلاً: "فاطمة علي" لحساب "فاطمة علي حسن")
        IF coalesce(array_length(w, 1), 0) >= 2 AND coalesce(array_length(dw, 1), 0) >= 2
           AND w[1] = dw[1] AND w[2] = dw[2] THEN
            RETURN v;
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

-- تصحيح إجابة سؤال واحد
-- * يدعم الخيارات بصيغة كائنات {text,isCorrect} أو نصوص مع correct_option_index (الصيغة القديمة)
-- * يدعم الإجابة كرقم أو مصفوفة أرقام
-- * أسئلة الإجابات المتعددة: درجة جزئية للإجابات الصحيحة المختارة، وصفر إذا اختيرت أي إجابة خاطئة
CREATE OR REPLACE FUNCTION public._grade_answer(p_options jsonb, p_correct_index int, p_points numeric, p_answer jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_correct int[] := '{}';
    v_selected int[] := '{}';
    v_elem jsonb;
    v_idx int := 0;
    v_hits int := 0;
    v_n int;
BEGIN
    IF p_answer IS NULL OR p_options IS NULL OR jsonb_typeof(p_options) <> 'array' THEN
        RETURN 0;
    END IF;

    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_options) LOOP
        IF jsonb_typeof(v_elem) = 'object' THEN
            IF lower(coalesce(v_elem->>'isCorrect', 'false')) = 'true' THEN
                v_correct := v_correct || v_idx;
            END IF;
        ELSIF v_idx = p_correct_index THEN
            v_correct := v_correct || v_idx;
        END IF;
        v_idx := v_idx + 1;
    END LOOP;

    IF coalesce(array_length(v_correct, 1), 0) = 0 THEN
        RETURN 0;
    END IF;

    IF jsonb_typeof(p_answer) = 'array' THEN
        FOR v_elem IN SELECT value FROM jsonb_array_elements(p_answer) LOOP
            IF jsonb_typeof(v_elem) IN ('number', 'string') AND (v_elem #>> '{}') ~ '^\d+$' THEN
                v_n := (v_elem #>> '{}')::int;
                IF NOT (v_n = ANY (v_selected)) THEN
                    v_selected := v_selected || v_n;
                END IF;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_answer) IN ('number', 'string') AND (p_answer #>> '{}') ~ '^\d+$' THEN
        v_selected := ARRAY[(p_answer #>> '{}')::int];
    END IF;

    IF coalesce(array_length(v_selected, 1), 0) = 0 THEN
        RETURN 0;
    END IF;

    FOREACH v_n IN ARRAY v_selected LOOP
        IF v_n = ANY (v_correct) THEN
            v_hits := v_hits + 1;
        ELSE
            RETURN 0; -- اختيار إجابة خاطئة يلغي درجة السؤال
        END IF;
    END LOOP;

    RETURN coalesce(p_points, 1) * v_hits / array_length(v_correct, 1);
END;
$$;

-- منطق التسليم المشترك: التحقق من الوقت، منع التكرار، التصحيح في السيرفر، الحفظ
CREATE OR REPLACE FUNCTION public._submit_core(p_student public.students, p_exam_id uuid, p_answers jsonb)
RETURNS public.submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam public.exams;
    v_start timestamptz;
    v_end timestamptz;
    v_score numeric := 0;
    v_q record;
    v_sub public.submissions;
    v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
BEGIN
    IF p_student.id IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND';
    END IF;

    SELECT * INTO v_exam FROM public.exams WHERE id = p_exam_id;
    IF v_exam.id IS NULL THEN
        RAISE EXCEPTION 'EXAM_NOT_FOUND';
    END IF;

    v_start := public._ts(v_exam.start_time);
    v_end := public._ts(v_exam.end_time);
    IF v_start IS NOT NULL AND now() < v_start - interval '2 minutes' THEN
        RAISE EXCEPTION 'EXAM_NOT_STARTED';
    END IF;
    -- مهلة 10 دقائق بعد نهاية الوقت لضعف الشبكة والتسليم التلقائي
    IF v_end IS NOT NULL AND now() > v_end + interval '10 minutes' THEN
        RAISE EXCEPTION 'EXAM_ENDED';
    END IF;

    IF jsonb_typeof(v_answers) <> 'object' THEN
        v_answers := '{}'::jsonb;
    END IF;

    -- قفل لمنع التسليم المزدوج المتزامن لنفس الطالبة ونفس الامتحان
    PERFORM pg_advisory_xact_lock(hashtext(p_exam_id::text || ':' || coalesce(p_student.student_phone, p_student.id::text)));

    IF EXISTS (
        SELECT 1 FROM public.submissions
        WHERE exam_id = p_exam_id AND student_phone = p_student.student_phone
    ) THEN
        RAISE EXCEPTION 'ALREADY_SUBMITTED';
    END IF;

    FOR v_q IN SELECT id, options, correct_option_index, points FROM public.questions WHERE exam_id = p_exam_id LOOP
        v_score := v_score + public._grade_answer(v_q.options, v_q.correct_option_index, v_q.points, v_answers -> (v_q.id::text));
    END LOOP;

    INSERT INTO public.submissions (exam_id, student_phone, student_name, answers, score, "examTitle", subject)
    VALUES (p_exam_id, p_student.student_phone, p_student.student_name, v_answers, round(v_score, 2), v_exam.title, v_exam.subject)
    RETURNING * INTO v_sub;

    RETURN v_sub;
END;
$$;

-- يُستخدم في سياسة الإدخال المباشر لسجل الحضور (للنسخ القديمة من التطبيق)
CREATE OR REPLACE FUNCTION public._attendance_insert_ok(p_student_id uuid, p_phone text, p_date text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_student_id IS NOT NULL
       AND p_date = to_char(now() AT TIME ZONE 'Asia/Baghdad', 'YYYY-MM-DD')
       AND EXISTS (
           SELECT 1 FROM public.students s
           WHERE s.id = p_student_id
             AND s.student_phone = p_phone
             AND coalesce(s.status, 'approved') = 'approved'
       );
$$;

-- --------------------------------------------------------------------
-- 4. دوال الطالبات العامة (RPCs)
-- --------------------------------------------------------------------

-- تسجيل الدخول (نفس التوقيع القديم للتوافق مع النسخ المثبتة)
CREATE OR REPLACE FUNCTION public.rpc_login_student(p_name text, p_number int)
RETURNS SETOF public.students
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v public.students := public._resolve_student(p_name, p_number);
BEGIN
    IF v.id IS NOT NULL THEN
        RETURN NEXT v;
    END IF;
    RETURN;
END;
$$;

-- أسئلة الامتحان للطالبة: بدون الإجابات الصحيحة، ولا تُعرض قبل وقت البدء
DROP FUNCTION IF EXISTS public.rpc_get_exam_questions(uuid);
CREATE FUNCTION public.rpc_get_exam_questions(p_exam_id uuid)
RETURNS TABLE (
    id uuid,
    exam_id uuid,
    question_text text,
    options jsonb,
    points numeric,
    created_at timestamptz,
    multi boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exam public.exams;
BEGIN
    SELECT * INTO v_exam FROM public.exams e WHERE e.id = p_exam_id;
    IF v_exam.id IS NULL THEN
        RETURN;
    END IF;
    IF public._ts(v_exam.start_time) IS NOT NULL AND now() < public._ts(v_exam.start_time) - interval '2 minutes' THEN
        RETURN;
    END IF;
    IF public._ts(v_exam.end_time) IS NOT NULL AND now() > public._ts(v_exam.end_time) + interval '10 minutes' THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT q.id,
           q.exam_id,
           q.question_text,
           coalesce((
               SELECT jsonb_agg(
                          CASE WHEN jsonb_typeof(o.value) = 'object'
                               THEN jsonb_build_object('id', o.value->'id', 'text', o.value->'text')
                               ELSE jsonb_build_object('text', o.value)
                          END
                          ORDER BY o.ord)
               FROM jsonb_array_elements(q.options) WITH ORDINALITY AS o(value, ord)
           ), '[]'::jsonb) AS options,
           q.points,
           q.created_at,
           (
               SELECT count(*) > 1
               FROM jsonb_array_elements(q.options) AS o2(value)
               WHERE jsonb_typeof(o2.value) = 'object'
                 AND lower(coalesce(o2.value->>'isCorrect', 'false')) = 'true'
           ) AS multi
    FROM public.questions q
    WHERE q.exam_id = p_exam_id
    ORDER BY q.created_at ASC, q.id ASC;
END;
$$;

-- التسليم الجديد: يتحقق من هوية الطالبة بالاسم + الرقم الحوزوي
CREATE OR REPLACE FUNCTION public.rpc_submit_exam_v2(p_exam_id uuid, p_name text, p_number int, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub public.submissions;
BEGIN
    v_sub := public._submit_core(public._resolve_student(p_name, p_number), p_exam_id, p_answers);
    RETURN jsonb_build_object('id', v_sub.id, 'exam_id', v_sub.exam_id, 'submitted_at', v_sub.submitted_at);
END;
$$;

-- التسليم القديم (للنسخ المثبتة سابقاً): نفس التوقيع، لكن يتحقق من الطالبة ويصحح بشكل صحيح
CREATE OR REPLACE FUNCTION public.rpc_submit_exam(
    p_exam_id uuid,
    p_student_phone text,
    p_student_name text,
    p_answers jsonb
)
RETURNS public.submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students;
BEGIN
    SELECT * INTO v_student
    FROM public.students s
    WHERE s.student_phone = btrim(coalesce(p_student_phone, ''))
      AND btrim(coalesce(p_student_phone, '')) <> ''
      AND coalesce(s.status, 'approved') = 'approved'
      AND public._norm_name(s.student_name) = public._norm_name(p_student_name)
    LIMIT 1;

    RETURN public._submit_core(v_student, p_exam_id, p_answers);
END;
$$;

-- نتائج الطالبة نفسها فقط (لإخفاء الامتحانات المنجزة وحساب أهلية الدور الثاني)
CREATE OR REPLACE FUNCTION public.rpc_get_my_submissions(p_name text, p_number int)
RETURNS TABLE (
    id uuid,
    exam_id uuid,
    score numeric,
    max_score numeric,
    submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v public.students := public._resolve_student(p_name, p_number);
BEGIN
    IF v.id IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND';
    END IF;
    RETURN QUERY
    SELECT s.id,
           s.exam_id,
           s.score,
           (SELECT coalesce(sum(q.points), 0) FROM public.questions q WHERE q.exam_id = s.exam_id) AS max_score,
           s.submitted_at
    FROM public.submissions s
    WHERE s.student_phone = v.student_phone
    ORDER BY s.submitted_at DESC;
END;
$$;

-- حالة طلب الالتحاق لرقم هاتف (بدون كشف أي بيانات شخصية)
CREATE OR REPLACE FUNCTION public.rpc_registration_status(p_phone text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT coalesce((
        SELECT coalesce(s.status, 'approved')
        FROM public.students s
        WHERE s.student_phone = btrim(coalesce(p_phone, ''))
        ORDER BY CASE coalesce(s.status, 'approved') WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END
        LIMIT 1
    ), 'none');
$$;

-- حالة حضور الطالبة لليوم (بتوقيت بغداد)
CREATE OR REPLACE FUNCTION public.rpc_attendance_today(p_name text, p_number int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v public.students := public._resolve_student(p_name, p_number);
    v_local timestamp := now() AT TIME ZONE 'Asia/Baghdad';
    v_date text := to_char(v_local, 'YYYY-MM-DD');
    v_rec public.attendance_records;
BEGIN
    IF v.id IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND';
    END IF;
    SELECT * INTO v_rec FROM public.attendance_records r
    WHERE r.date = v_date AND (r.student_phone = v.student_phone OR r.student_id = v.id)
    LIMIT 1;
    RETURN jsonb_build_object(
        'date', v_date,
        'time', to_char(v_local, 'HH24:MI'),
        'dow', extract(dow FROM v_local)::int,
        'signed', v_rec.id IS NOT NULL,
        'signed_at', v_rec.created_at
    );
END;
$$;

-- تسجيل حضور الطالبة: يتحقق السيرفر من التفعيل واليوم والوقت (بتوقيت بغداد)
CREATE OR REPLACE FUNCTION public.rpc_mark_attendance(p_name text, p_number int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v public.students := public._resolve_student(p_name, p_number);
    v_set public.attendance_settings;
    v_local timestamp := now() AT TIME ZONE 'Asia/Baghdad';
    v_date text := to_char(v_local, 'YYYY-MM-DD');
    v_time text := to_char(v_local, 'HH24:MI');
    v_rec public.attendance_records;
BEGIN
    IF v.id IS NULL THEN
        RAISE EXCEPTION 'STUDENT_NOT_FOUND';
    END IF;

    SELECT * INTO v_set FROM public.attendance_settings WHERE id = 'global';
    IF v_set.id IS NOT NULL THEN
        IF v_set.active IS FALSE THEN
            RAISE EXCEPTION 'ATTENDANCE_DISABLED';
        END IF;
        IF coalesce(v_set.mode, 'all') = 'custom'
           AND NOT (coalesce(v_set.selected_days, '[]'::jsonb) @> to_jsonb(extract(dow FROM v_local)::int)) THEN
            RAISE EXCEPTION 'ATTENDANCE_DAY_OFF';
        END IF;
        IF coalesce(v_set.time_mode, 'customtime') <> 'allday'
           AND NOT (v_time >= coalesce(v_set.start_time, '20:00') AND v_time <= coalesce(v_set.end_time, '23:59')) THEN
            RAISE EXCEPTION 'ATTENDANCE_CLOSED';
        END IF;
    END IF;

    INSERT INTO public.attendance_records (student_id, student_phone, student_name, date, status)
    VALUES (v.id, v.student_phone, v.student_name, v_date, 'present')
    ON CONFLICT (student_phone, date) DO NOTHING;

    SELECT * INTO v_rec FROM public.attendance_records r
    WHERE r.student_phone = v.student_phone AND r.date = v_date;

    RETURN jsonb_build_object('date', v_date, 'signed', true, 'signed_at', v_rec.created_at);
END;
$$;

-- --------------------------------------------------------------------
-- 5. قيود منع التكرار (تُنشأ فقط إذا لم تكن هناك بيانات مكررة حالياً)
-- --------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'submissions_exam_student_unique')
       AND NOT EXISTS (
           SELECT 1 FROM public.submissions
           GROUP BY exam_id, student_phone HAVING count(*) > 1
       ) THEN
        CREATE UNIQUE INDEX submissions_exam_student_unique ON public.submissions (exam_id, student_phone);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'students_phone_unique')
       AND NOT EXISTS (
           SELECT 1 FROM public.students
           GROUP BY student_phone HAVING count(*) > 1
       ) THEN
        CREATE UNIQUE INDEX students_phone_unique ON public.students (student_phone);
    END IF;
END $$;

-- --------------------------------------------------------------------
-- 6. إعادة بناء سياسات الأمان (RLS) من الصفر
-- --------------------------------------------------------------------
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structure_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- حذف كل السياسات القديمة (مهما كانت أسماؤها) لأن بعضها كان يفتح البيانات للعامة
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('students', 'exams', 'questions', 'submissions',
                            'structure_settings', 'attendance_settings', 'attendance_records', 'admins')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- المشرفون
CREATE POLICY "admins_read_self" ON public.admins
    FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

-- الطالبات: التسجيل فقط كطلب معلق بدون رقم حوزوي، وباقي الصلاحيات للمشرف
CREATE POLICY "students_register_pending" ON public.students
    FOR INSERT TO anon, authenticated
    WITH CHECK (coalesce(status, 'pending') = 'pending' AND member_number IS NULL AND hawza_number IS NULL);
CREATE POLICY "students_admin_all" ON public.students
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- الامتحانات: القائمة عامة (العنوان والوقت والاستهداف)، والتعديل للمشرف
CREATE POLICY "exams_public_read" ON public.exams
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "exams_admin_all" ON public.exams
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- الأسئلة والنتائج: للمشرف فقط (الطالبات عبر الدوال أعلاه)
CREATE POLICY "questions_admin_all" ON public.questions
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "submissions_admin_all" ON public.submissions
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- الإعدادات: قراءة عامة، تعديل للمشرف
CREATE POLICY "structure_public_read" ON public.structure_settings
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "structure_admin_all" ON public.structure_settings
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "attendance_settings_public_read" ON public.attendance_settings
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "attendance_settings_admin_all" ON public.attendance_settings
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- سجل الحضور: للمشرف، مع إدخال محدود لليوم الحالي للنسخ القديمة من التطبيق
CREATE POLICY "attendance_records_admin_all" ON public.attendance_records
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "attendance_records_student_insert_today" ON public.attendance_records
    FOR INSERT TO anon, authenticated
    WITH CHECK (public._attendance_insert_ok(student_id, student_phone, date));

-- --------------------------------------------------------------------
-- 7. صلاحيات تنفيذ الدوال
-- --------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._resolve_student(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._submit_core(public.students, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._grade_answer(jsonb, int, numeric, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._attendance_insert_ok(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_login_student(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_exam_questions(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_exam_v2(uuid, text, int, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_exam(uuid, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_my_submissions(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_registration_status(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_attendance_today(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_mark_attendance(text, int) TO anon, authenticated;

COMMIT;

-- تحديث ذاكرة PostgREST حتى تظهر الدوال الجديدة فوراً
NOTIFY pgrst, 'reload schema';

-- راجع هذه القائمة: هؤلاء فقط يملكون صلاحيات المشرف الآن
SELECT a.email, a.user_id, u.created_at AS account_created
FROM public.admins a
LEFT JOIN auth.users u ON u.id = a.user_id
ORDER BY u.created_at;
