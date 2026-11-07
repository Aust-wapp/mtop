-- Run against the migrated local database. The nested exception block rolls
-- back every fixture write after the assertions pass.
DO $$
DECLARE
  linked_user_id UUID := gen_random_uuid();
  linked_placeholder_id UUID := gen_random_uuid();
  unknown_user_id UUID := gen_random_uuid();
  non_google_user_id UUID := gen_random_uuid();
  non_google_placeholder_id UUID := gen_random_uuid();
  unverified_user_id UUID := gen_random_uuid();
  unverified_placeholder_id UUID := gen_random_uuid();
  admin_role_id UUID;
  linked_email TEXT := 'google-link-' || gen_random_uuid()::TEXT || '@example.invalid';
  unknown_email TEXT := 'google-unknown-' || gen_random_uuid()::TEXT || '@example.invalid';
  non_google_email TEXT := 'non-google-' || gen_random_uuid()::TEXT || '@example.invalid';
  unverified_email TEXT := 'unverified-google-' || gen_random_uuid()::TEXT || '@example.invalid';
BEGIN
  BEGIN
  SELECT id
  INTO admin_role_id
  FROM mtop.roles
  WHERE code = 'admin';

  IF admin_role_id IS NULL THEN
    RAISE EXCEPTION 'admin role fixture is missing';
  END IF;

  INSERT INTO auth.users (
    id,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data
  ) VALUES (
    linked_user_id,
    linked_email,
    now(),
    '{"provider":"google","providers":["google"]}'::JSONB,
    '{"full_name":"Google Link Test"}'::JSONB
  );

  INSERT INTO mtop.user_profiles (id, full_name, email)
  VALUES (linked_placeholder_id, 'Pre-approved Test Admin', linked_email);

  INSERT INTO mtop.user_roles (user_id, role_id)
  VALUES (linked_placeholder_id, admin_role_id);

  IF mtop.link_google_user_profile(linked_user_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'pre-approved Google profile was not linked';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mtop.user_profiles
    WHERE id = linked_user_id
      AND email = linked_email
      AND full_name = 'Pre-approved Test Admin'
  ) THEN
    RAISE EXCEPTION 'linked profile data was not preserved';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mtop.user_profiles
    WHERE id = linked_placeholder_id
  ) THEN
    RAISE EXCEPTION 'placeholder profile row was not updated in place';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mtop.user_roles
    WHERE user_id = linked_user_id
      AND role_id = admin_role_id
  ) THEN
    RAISE EXCEPTION 'admin role assignment was not preserved';
  END IF;

  IF mtop.link_google_user_profile(linked_user_id) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'repeated profile linking was not idempotent';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM mtop.user_roles
    WHERE user_id = linked_user_id
      AND role_id = admin_role_id
  ) <> 1 THEN
    RAISE EXCEPTION 'repeated linking duplicated role assignments';
  END IF;

  INSERT INTO auth.users (
    id,
    email,
    email_confirmed_at,
    raw_app_meta_data
  ) VALUES (
    unknown_user_id,
    unknown_email,
    now(),
    '{"provider":"google","providers":["google"]}'::JSONB
  );

  IF mtop.link_google_user_profile(unknown_user_id) IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'unapproved Google user was allowed to link';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM mtop.user_roles
    WHERE user_id = unknown_user_id
  ) THEN
    RAISE EXCEPTION 'unapproved Google user received a role';
  END IF;

  INSERT INTO auth.users (
    id,
    email,
    email_confirmed_at,
    raw_app_meta_data
  ) VALUES (
    non_google_user_id,
    non_google_email,
    now(),
    '{"provider":"email","providers":["email"]}'::JSONB
  );

  INSERT INTO mtop.user_profiles (id, full_name, email)
  VALUES (non_google_placeholder_id, 'Non-Google Test', non_google_email);

  INSERT INTO mtop.user_roles (user_id, role_id)
  VALUES (non_google_placeholder_id, admin_role_id);

  IF mtop.link_google_user_profile(non_google_user_id) IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'non-Google user was allowed to link';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mtop.user_profiles
    WHERE id = non_google_placeholder_id
      AND email = non_google_email
  ) OR NOT EXISTS (
    SELECT 1
    FROM mtop.user_roles
    WHERE user_id = non_google_placeholder_id
      AND role_id = admin_role_id
  ) THEN
    RAISE EXCEPTION 'rejected non-Google profile or role was changed';
  END IF;

  INSERT INTO auth.users (
    id,
    email,
    raw_app_meta_data
  ) VALUES (
    unverified_user_id,
    unverified_email,
    '{"provider":"google","providers":["google"]}'::JSONB
  );

  INSERT INTO mtop.user_profiles (id, full_name, email)
  VALUES (unverified_placeholder_id, 'Unverified Google Test', unverified_email);

  INSERT INTO mtop.user_roles (user_id, role_id)
  VALUES (unverified_placeholder_id, admin_role_id);

  IF mtop.link_google_user_profile(unverified_user_id) IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'unverified Google user was allowed to link';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM mtop.user_profiles
    WHERE id = unverified_placeholder_id
      AND email = unverified_email
  ) OR NOT EXISTS (
    SELECT 1
    FROM mtop.user_roles
    WHERE user_id = unverified_placeholder_id
      AND role_id = admin_role_id
  ) THEN
    RAISE EXCEPTION 'rejected unverified profile or role was changed';
  END IF;
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'rollback auth fixtures';
  EXCEPTION
    WHEN SQLSTATE 'ZX001' THEN
      NULL;
  END;
END;
$$;
