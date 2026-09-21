-- ====================================================================
-- إعداد قاعدة البيانات وتفعيل الأمان على المستويات (Row-Level Security)
-- لمنصة حوزة أم البنين النسوية الإلكترونية (Supabase SQL Setup)
-- ====================================================================
-- التعليمات: انسخ هذا الملف بالكامل والصقه في خريطة SQL Editor في حسابك في Supabase واضغط على Run.

-- 1. إنشـاء جـدول الطـلاب والأعـوان (students)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name TEXT NOT NULL,
    surname TEXT,
    student_phone TEXT,
    status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    member_number INT UNIQUE,
    hawza_number INT,
    city TEXT,
    province TEXT,
    social_status TEXT,
    is_student TEXT,
    study_type TEXT,
    hawza_study TEXT,
    qualification TEXT, -- يستخدم لتخزين الشعبة الدراسية (أ، ب، ج، د)
    birthdate TEXT,
    stage TEXT, -- يحدد المرحلة الدراسية (مرحلة اولى، ثانية، الخ)
    telegram_user TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS social_status TEXT;

-- 2. إنشـاء جـدول الامتحانات (exams)
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id TEXT,
    created_by TEXT,
    title TEXT NOT NULL,
    description TEXT,
    subject TEXT,
    test_type TEXT DEFAULT 'quiz', -- 'quiz' | 'half' | 'final'
    start_time TEXT,
    end_time TEXT,
    date TEXT,
    target_stage TEXT,
    target_sections JSONB,
    shuffle_order BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. إنشـاء جـدول الأسئلـة (questions)
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_option_index INT, -- Made nullable to support multiple correct options stored directly in 'options' JSON
    points INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. إنشـاء جـدول النتائـج والإجـابـات (submissions)
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    student_phone TEXT,
    student_name TEXT,
    answers JSONB,
    score INT DEFAULT 0,
    "examTitle" TEXT,
    subject TEXT,
    submitted_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. إنشـاء جـدول إعدادات الهيكلية (structure_settings)
CREATE TABLE IF NOT EXISTS public.structure_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    stages JSONB DEFAULT '[]'::jsonb,
    subjects JSONB DEFAULT '[]'::jsonb,
    sections JSONB DEFAULT '{}'::jsonb,
    stage_subjects JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. إنشـاء جـدول إعدادات الحضور والغياب (attendance_settings)
CREATE TABLE IF NOT EXISTS public.attendance_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    active BOOLEAN DEFAULT true,
    mode TEXT DEFAULT 'all', -- 'all' | 'custom'
    selected_days JSONB DEFAULT '[]'::jsonb,
    time_mode TEXT DEFAULT 'customtime', -- 'allday' | 'customtime'
    start_time TEXT DEFAULT '20:00', -- 8:00 PM
    end_time TEXT DEFAULT '23:59',   -- 12:00 PM (Midnight)
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. إنشـاء جـدول سجلات الحضور والغياب (attendance_records)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    student_phone TEXT NOT NULL,
    student_name TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    status TEXT DEFAULT 'present', -- 'present' | 'excused'
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_student_daily_attendance UNIQUE(student_phone, date)
);

-- ====================================================================
-- تفعيل الأمان على مستوى الصف (Row-Level Security - RLS)
-- ====================================================================

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structure_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- سياسات جدول الطلاب (students policies)
-- --------------------------------------------------------------------
-- السماح لجميع الزوار (الطالبات) بتقديم طلب انتساب جديد
CREATE POLICY "Allow public inserts for registration" 
ON public.students 
FOR INSERT TO public 
WITH CHECK (true);

-- السماح بالتحقق من الأعضاء المعتمدين لتأكيد الدخول للامتحانات
CREATE POLICY "Allow reading approved students for verification" 
ON public.students 
FOR SELECT TO public 
USING (true);

-- السماح للمعلم/المشرف المسجل (Authenticated Users) بكامل الصلاحيات للتعديل والقبول والحذف
CREATE POLICY "Teachers can manage all student accounts" 
ON public.students 
FOR ALL TO authenticated 
USING (true);

-- --------------------------------------------------------------------
-- سياسات جدول الامتحانات والأسئلة (exams & questions policies)
-- --------------------------------------------------------------------
-- السماح للطلاب (العموم) بمشاهدة وجلب بيانات الاختبارات المنشورة وأسئلتها للحل
CREATE POLICY "Public read access for exams" 
ON public.exams 
FOR SELECT TO public 
USING (true);

CREATE POLICY "Public read access for questions" 
ON public.questions 
FOR SELECT TO public 
USING (true);

-- السماح للمشرفين (Authenticated Teachers) بالتحكم الكامل (إنشاء، تعديل، حذف) بالامتحانات وأسئلتها
CREATE POLICY "Teachers manage exams completely" 
ON public.exams 
FOR ALL TO authenticated 
USING (true);

CREATE POLICY "Teachers manage questions completely" 
ON public.questions 
FOR ALL TO authenticated 
USING (true);

-- --------------------------------------------------------------------
-- سياسات جدول تسليم الإجابات (submissions policies)
-- --------------------------------------------------------------------
-- السماح للطلاب بتسليم وحفظ الإجابات الخاصة بهم
CREATE POLICY "Students can submit exam answers" 
ON public.submissions 
FOR INSERT TO public 
WITH CHECK (true);

-- السماح للطالب بقراءة نتائج الاختبارات الحالية
CREATE POLICY "Students and teachers can view exam results" 
ON public.submissions 
FOR SELECT TO public 
USING (true);

-- السماح للمشرفين المسجلين (Teachers) بالتعديل أو حذف أو مراجعة السجل الكامل للدرجات
CREATE POLICY "Teachers manage all submissions" 
ON public.submissions 
FOR ALL TO authenticated 
USING (true);

-- --------------------------------------------------------------------
-- سياسات جدول إعدادات الهيكلية (structure_settings policies)
-- --------------------------------------------------------------------
-- السماح للجميع بقراءة الإعدادات الهيكلية
CREATE POLICY "Public read access for structure_settings" 
ON public.structure_settings 
FOR SELECT TO public 
USING (true);

-- السماح للمشرفين بتعديل وحفظ الإعدادات الهيكلية
CREATE POLICY "Teachers manage structure_settings" 
ON public.structure_settings 
FOR ALL TO authenticated 
USING (true);

-- --------------------------------------------------------------------
-- سياسات جدول إعدادات الحضور والغياب (attendance_settings policies)
-- --------------------------------------------------------------------
CREATE POLICY "Public read access for attendance_settings" 
ON public.attendance_settings 
FOR SELECT TO public 
USING (true);

CREATE POLICY "Teachers manage attendance_settings" 
ON public.attendance_settings 
FOR ALL TO authenticated 
USING (true);

-- --------------------------------------------------------------------
-- سياسات جدول سجلات الحضور (attendance_records policies)
-- --------------------------------------------------------------------
CREATE POLICY "Students can register attendance" 
ON public.attendance_records 
FOR INSERT TO public 
WITH CHECK (true);

CREATE POLICY "Public read attendance_records" 
ON public.attendance_records 
FOR SELECT TO public 
USING (true);

CREATE POLICY "Teachers manage attendance_records" 
ON public.attendance_records 
FOR ALL TO authenticated 
USING (true);

-- ====================================================================
-- منح الصلاحيات (Grants) للأدوار الافتراضية (anon, authenticated)
-- هذا الجزء يحل مشكلة 401 Permission Denied
-- ====================================================================
GRANT ALL ON TABLE public.students TO anon, authenticated;
GRANT ALL ON TABLE public.exams TO anon, authenticated;
GRANT ALL ON TABLE public.questions TO anon, authenticated;
GRANT ALL ON TABLE public.submissions TO anon, authenticated;
GRANT ALL ON TABLE public.structure_settings TO anon, authenticated;
GRANT ALL ON TABLE public.attendance_settings TO anon, authenticated;
GRANT ALL ON TABLE public.attendance_records TO anon, authenticated;

