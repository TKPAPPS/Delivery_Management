-- Run this AFTER your first Google login to make yourself admin.
-- Replace the email below with your actual email.
-- Run in Supabase SQL Editor.

update profiles
set active = true, role = 'admin'
where email = 'YOUR_EMAIL_HERE';

-- If the above returns 0 rows, the trigger hasn't created your profile yet.
-- Sign in with Google first, then run this.
