-- ====================================================================
-- تحديث قاعدة بيانات Supabase - حوزة أم البنين
-- يشمل: نظام الحضور والغياب السحابي، إعدادات الهيكلية، وتحديثات الصلاحيات
-- آمن للتشغيل 100% (Idempotent: لن يحذف أو يكرر أي بيانات موجودة)
-- ====================================================================

-- 1. إضافة الأعمدة الناقصة لجدول الطالبات إن لم تكن موجودة
ALTER TABLE IF EXISTS public.students ADD COLUMN IF NOT EXISTS social_status TEXT;

-- 2. إنشاء جدول إعدادات الهيكلية الدراسية (structure_settings)
CREATE TABLE IF NOT EXISTS public.structure_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    stages JSONB DEFAULT '[]'::jsonb,
    subjects JSONB DEFAULT '[]'::jsonb,
    sections JSONB DEFAULT '{}'::jsonb,
    stage_subjects JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. إنشاء جدول إعدادات الحضور والغياب السحابي (attendance_settings)
CREATE TABLE IF NOT EXISTS public.attendance_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    active BOOLEAN DEFAULT true,
    mode TEXT DEFAULT 'all', -- 'all' أو 'custom'
    selected_days JSONB DEFAULT '[]'::jsonb,
    time_mode TEXT DEFAULT 'customtime', -- 'allday' أو 'customtime'
    start_time TEXT DEFAULT '20:00', -- 8:00 مساءً
    end_time TEXT DEFAULT '23:59',   -- 12:00 ليلاً
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- إدراج صف الإعدادات الافتراضي إذا كان الجدول فارغاً
INSERT INTO public.attendance_settings (id, active, mode, selected_days, time_mode, start_time, end_time)
VALUES ('global', true, 'all', '[]'::jsonb, 'customtime', '20:00', '23:59')
ON CONFLICT (id) DO NOTHING;

-- 4. إنشاء جدول سجلات الحضور والغياب اليومي (attendance_records)
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    student_phone TEXT NOT NULL,
    student_name TEXT NOT NULL,
    date TEXT NOT NULL, -- صيغة YYYY-MM-DD
    status TEXT DEFAULT 'present', -- 'present' (حاضر) أو 'excused' (مجاز)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- التأكد من عدم تكرار تسجيل حضور نفس الطالبة في نفس اليوم (قيد الأمان)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_student_daily_attendance'
    ) THEN
        ALTER TABLE public.attendance_records 
        ADD CONSTRAINT unique_student_daily_attendance UNIQUE(student_phone, date);
    END IF;
END $$;

-- 5. تفعيل أمان الصفوف (Row Level Security - RLS)
ALTER TABLE public.structure_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- 6. سياسات الوصول لجدول structure_settings
DROP POLICY IF EXISTS "Public read access for structure_settings" ON public.structure_settings;
CREATE POLICY "Public read access for structure_settings" 
ON public.structure_settings FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Teachers manage structure_settings" ON public.structure_settings;
CREATE POLICY "Teachers manage structure_settings" 
ON public.structure_settings FOR ALL TO authenticated USING (true);

-- 7. سياسات الوصول لجدول attendance_settings
DROP POLICY IF EXISTS "Public read access for attendance_settings" ON public.attendance_settings;
CREATE POLICY "Public read access for attendance_settings" 
ON public.attendance_settings FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Teachers manage attendance_settings" ON public.attendance_settings;
CREATE POLICY "Teachers manage attendance_settings" 
ON public.attendance_settings FOR ALL TO authenticated USING (true);

-- 8. سياسات الوصول لجدول attendance_records
DROP POLICY IF EXISTS "Students can register attendance" ON public.attendance_records;
CREATE POLICY "Students can register attendance" 
ON public.attendance_records FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Public read attendance_records" ON public.attendance_records;
CREATE POLICY "Public read attendance_records" 
ON public.attendance_records FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Teachers manage attendance_records" ON public.attendance_records;
CREATE POLICY "Teachers manage attendance_records" 
ON public.attendance_records FOR ALL TO authenticated USING (true);

-- 9. منح الصلاحيات للأدوار الافتراضية (anon, authenticated) لمنع أخطاء 401 Permission Denied
GRANT ALL ON TABLE public.structure_settings TO anon, authenticated;
GRANT ALL ON TABLE public.attendance_settings TO anon, authenticated;
GRANT ALL ON TABLE public.attendance_records TO anon, authenticated;
