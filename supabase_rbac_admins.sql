-- ====================================================================
-- supabase_rbac_admins.sql
-- تطبيق نظام الصلاحيات (RBAC):
-- 1. إنشاء جدول public.admins إذا لم يكن موجوداً مع عمود الرتبة role
-- 2. ترقية المشرف العام (الشيخ أحمد) إلى super_admin
-- 3. دوال أمنية لحصر إدارة المشرفين بالمشرف العام فقط
-- 4. إنشاء الحسابين الجديدين (mana1 و mana2) بكلمة مرور 123aaa
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. التأكد من إنشاء جدول المشرفين أولاً إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admins FROM anon;

-- إذا كان الجدول موجوداً مسبقاً من نسخة قديمة بدون عمود role، يتم إضافته
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'admins' 
          AND column_name = 'role'
    ) THEN
        ALTER TABLE public.admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';
    END IF;
END $$;

-- إذا كان جدول المشرفين فارغاً، اعتماد الحسابات الحالية من auth.users وترقية أحمد
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.admins) THEN
        INSERT INTO public.admins (user_id, email, role)
        SELECT 
            id, 
            email, 
            CASE 
                WHEN email ILIKE '%ahmed%' THEN 'super_admin' 
                ELSE 'admin' 
            END
        FROM auth.users
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;

-- 2. ترقية المشرف العام (حساب أحمد أو أول حساب مسجل) إلى super_admin
UPDATE public.admins 
SET role = 'super_admin'
WHERE email ILIKE '%ahmed%' 
   OR user_id IN (
       SELECT user_id FROM public.admins ORDER BY created_at ASC LIMIT 1
   );

-- 3. دالة التحقق الأساسية هل الحساب مشرف (للتوافق وتأمين الواجهة)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.admins WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 4. دالة جلب رتبة المشرف الحالي
CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.admins WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_role() TO anon, authenticated;

-- 5. دالة التحقق هل المشرف الحالي super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admins
        WHERE user_id = auth.uid() AND role = 'super_admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon, authenticated;

-- 6. سياسات الأمان RLS لجدول المشرفين
DROP POLICY IF EXISTS admins_select_policy ON public.admins;
CREATE POLICY admins_select_policy ON public.admins
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS admins_all_super_policy ON public.admins;
CREATE POLICY admins_all_super_policy ON public.admins
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 7. دالة استعراض قائمة المشرفين (خاصة بالمشرف العام فقط)
CREATE OR REPLACE FUNCTION public.list_admins()
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    role TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'غير مصرح: استعراض المشرفين مقتصر على المشرف العام فقط.';
    END IF;

    RETURN QUERY
    SELECT a.user_id, a.email, a.role, a.created_at
    FROM public.admins a
    ORDER BY (CASE WHEN a.role = 'super_admin' THEN 0 ELSE 1 END), a.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_admins() TO authenticated;

-- 8. دالة إنشاء مشرف جديد (خاصة بالمشرف العام فقط)
CREATE OR REPLACE FUNCTION public.create_admin(
    p_username TEXT,
    p_password TEXT,
    p_role TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_clean_user TEXT;
    v_email TEXT;
    v_user_id UUID;
    v_target_role TEXT;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'غير مصرح: إضافة المشرفين مقتصرة على المشرف العام فقط.';
    END IF;

    v_clean_user := lower(trim(p_username));
    IF v_clean_user = '' THEN
        RAISE EXCEPTION 'اسم المشرف لا يمكن أن يكون فارغاً.';
    END IF;

    IF length(p_password) < 6 THEN
        RAISE EXCEPTION 'كلمة المرور يجب أن تكون 6 خانات على الأقل.';
    END IF;

    IF v_clean_user LIKE '%@%' THEN
        v_email := v_clean_user;
    ELSE
        v_email := v_clean_user || '@hawza.local';
    END IF;

    v_target_role := CASE WHEN p_role = 'super_admin' THEN 'super_admin' ELSE 'admin' END;

    -- هل الحساب موجود مسبقاً في auth.users؟
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        UPDATE auth.users
        SET encrypted_password = crypt(p_password, gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = v_user_id;

        INSERT INTO public.admins (user_id, email, role)
        VALUES (v_user_id, v_email, v_target_role)
        ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email;
    ELSE
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_email,
            crypt(p_password, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now(),
            '',
            ''
        );

        INSERT INTO public.admins (user_id, email, role)
        VALUES (v_user_id, v_email, v_target_role);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user_id,
        'email', v_email,
        'role', v_target_role
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_admin(text, text, text) TO authenticated;

-- 9. دالة حذف مشرف (خاصة بالمشرف العام فقط مع حماية الحسابات الأساسية)
CREATE OR REPLACE FUNCTION public.delete_admin(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_admin_role TEXT;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'غير مصرح: حذف المشرفين مقتصر على المشرف العام فقط.';
    END IF;

    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'لا يمكنك حذف حسابك الشخصي.';
    END IF;

    SELECT role INTO v_admin_role FROM public.admins WHERE user_id = p_user_id;

    IF v_admin_role IS NULL THEN
        RAISE EXCEPTION 'المشرف المطلوب حذفه غير موجود.';
    END IF;

    IF v_admin_role = 'super_admin' THEN
        RAISE EXCEPTION 'لا يمكن حذف حساب مدير عام (سوبر أدمن).';
    END IF;

    DELETE FROM public.admins WHERE user_id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object('success', true, 'deleted_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_admin(uuid) TO authenticated;

-- 10. إنشاء الحسابين mana1 و mana2 تلقائياً بكلمة مرور 123aaa ورتبة admin
DO $$
DECLARE
    v_id1 UUID;
    v_id2 UUID;
BEGIN
    -- حساب mana1
    SELECT id INTO v_id1 FROM auth.users WHERE lower(email) = 'mana1@hawza.local' LIMIT 1;
    IF v_id1 IS NULL THEN
        v_id1 := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_id1, 'authenticated', 'authenticated',
            'mana1@hawza.local', crypt('123aaa', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now()
        );
    ELSE
        UPDATE auth.users 
        SET encrypted_password = crypt('123aaa', gen_salt('bf')), 
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now() 
        WHERE id = v_id1;
    END IF;
    INSERT INTO public.admins (user_id, email, role)
    VALUES (v_id1, 'mana1@hawza.local', 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin', email = 'mana1@hawza.local';

    -- حساب mana2
    SELECT id INTO v_id2 FROM auth.users WHERE lower(email) = 'mana2@hawza.local' LIMIT 1;
    IF v_id2 IS NULL THEN
        v_id2 := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_id2, 'authenticated', 'authenticated',
            'mana2@hawza.local', crypt('123aaa', gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now()
        );
    ELSE
        UPDATE auth.users 
        SET encrypted_password = crypt('123aaa', gen_salt('bf')), 
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now() 
        WHERE id = v_id2;
    END IF;
    INSERT INTO public.admins (user_id, email, role)
    VALUES (v_id2, 'mana2@hawza.local', 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin', email = 'mana2@hawza.local';
END $$;

-- 11. الاستعلام النهائي للتأكيد
SELECT user_id, email, role, created_at FROM public.admins ORDER BY role DESC, created_at ASC;
