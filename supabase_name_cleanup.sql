-- ====================================================================
-- تنظيف أسماء الطالبات من الزخرفة (2026-10)
--
-- آمن لإعادة التشغيل. انسخ الملف كاملاً في Supabase > SQL Editor واضغط Run.
--   1) يحدّث دوال مقارنة الأسماء حتى يقبل تسجيل الدخول الاسم مكتوباً بحروف عادية
--      حتى لو كان محفوظاً بزخرفة (ﺯﻳﻨﺐ، زيـــنب، 𝓩𝓪𝓲𝓷𝓪𝓫، ♡ ...).
--   2) يحفظ الأسماء الحالية بحروف عادية. لا يغيّر الاسم إذا أصبح فارغاً بعد التنظيف.
--      النتائج مرتبطة برقم الهاتف وليس بالاسم، فلا تتأثر.
-- ====================================================================

CREATE OR REPLACE FUNCTION public._clean_name(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT btrim(regexp_replace(
        regexp_replace(
            regexp_replace(
                normalize(coalesce(t, ''), NFKC),
                '[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]', '', 'g'
            ),
            '[^\u0621-\u063A\u0641-\u064A\u0671-\u06D3\u06D5A-Za-z[:space:]]', ' ', 'g'
        ),
        '\s+', ' ', 'g'
    ));
$$;
CREATE OR REPLACE FUNCTION public._norm_name(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT lower(translate(public._clean_name(t), 'أإآىیکھة', 'اااييكهه'));
$$;

-- الأسماء التي ستتغير (للمراجعة)
SELECT id, student_name AS old_name, public._clean_name(student_name) AS new_name,
       surname AS old_surname, public._clean_name(surname) AS new_surname
FROM public.students
WHERE (public._clean_name(student_name) <> '' AND public._clean_name(student_name) <> student_name)
   OR (public._clean_name(surname) <> '' AND public._clean_name(surname) <> surname);

UPDATE public.students
SET student_name = public._clean_name(student_name)
WHERE public._clean_name(student_name) <> ''
  AND public._clean_name(student_name) <> student_name;

UPDATE public.students
SET surname = public._clean_name(surname)
WHERE public._clean_name(surname) <> ''
  AND public._clean_name(surname) <> surname;
