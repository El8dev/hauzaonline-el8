-- Delete the admin user from Supabase Auth
DELETE FROM auth.users WHERE email = 'admin@hawza.local';
