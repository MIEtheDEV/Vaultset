-- Username Login Migration
-- Run in Supabase SQL Editor before deploying username-based login.

-- Returns the email address for a given username (case-insensitive).
-- SECURITY DEFINER allows the function to read auth.users even when
-- called with the anon key, without exposing auth.users directly.
CREATE OR REPLACE FUNCTION public.get_email_for_username(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.email
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id
  WHERE lower(p.username) = lower(p_username)
  LIMIT 1;
$$;

-- Allow unauthenticated callers (the login page) to invoke the function.
-- The SECURITY DEFINER clause handles privileged access to auth.users internally.
GRANT EXECUTE ON FUNCTION public.get_email_for_username(text) TO anon, authenticated;
