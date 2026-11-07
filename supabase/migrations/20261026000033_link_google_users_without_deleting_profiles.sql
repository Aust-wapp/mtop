-- Link pre-approved Google users in place so profile history and role rows
-- keep their original database records.
DO $$
DECLARE
  foreign_key RECORD;
BEGIN
  FOR foreign_key IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = 'mtop.user_profiles'::regclass
  LOOP
    EXECUTE format(
      'ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED',
      foreign_key.table_name,
      foreign_key.conname
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION mtop.link_google_user_profile(p_auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, mtop, auth
AS $$
DECLARE
  auth_email TEXT;
  auth_email_confirmed_at TIMESTAMPTZ;
  auth_app_metadata JSONB;
  auth_user_metadata JSONB;
  profile_id UUID;
  matching_profile_count BIGINT;
  foreign_key RECORD;
  updated_profile_count INTEGER;
BEGIN
  SELECT
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data
  INTO
    auth_email,
    auth_email_confirmed_at,
    auth_app_metadata,
    auth_user_metadata
  FROM auth.users
  WHERE id = p_auth_user_id;

  IF NOT FOUND
    OR auth_email IS NULL
    OR auth_email_confirmed_at IS NULL
    OR NOT (
      COALESCE(auth_app_metadata, '{}'::JSONB)->'providers' ? 'google'
      OR COALESCE(auth_app_metadata->>'provider', '') = 'google'
    )
  THEN
    RETURN FALSE;
  END IF;

  -- A profile already keyed by the authenticated ID is an idempotent success.
  PERFORM 1
  FROM mtop.user_profiles
  WHERE id = p_auth_user_id;

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  -- Require exactly one pre-approved email match. Ambiguous profiles fail closed.
  SELECT COUNT(*)
  INTO matching_profile_count
  FROM mtop.user_profiles
  WHERE LOWER(email) = LOWER(auth_email);

  IF matching_profile_count <> 1 THEN
    RETURN FALSE;
  END IF;

  SELECT id
  INTO profile_id
  FROM mtop.user_profiles
  WHERE LOWER(email) = LOWER(auth_email)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Another callback may have completed this link while this one waited.
  IF profile_id = p_auth_user_id THEN
    RETURN TRUE;
  END IF;

  -- Do not take over a profile that is already linked to another Auth user.
  PERFORM 1
  FROM auth.users
  WHERE id = profile_id;

  IF FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE mtop.user_profiles
  SET
    id = p_auth_user_id,
    full_name = COALESCE(
      NULLIF(full_name, ''),
      NULLIF(auth_user_metadata->>'full_name', ''),
      NULLIF(auth_user_metadata->>'name', ''),
      auth_email
    ),
    avatar_url = COALESCE(
      avatar_url,
      NULLIF(auth_user_metadata->>'avatar_url', ''),
      NULLIF(auth_user_metadata->>'picture', '')
    )
  WHERE id = profile_id;

  GET DIAGNOSTICS updated_profile_count = ROW_COUNT;
  IF updated_profile_count <> 1 THEN
    RETURN FALSE;
  END IF;

  -- Keep every foreign-key relationship, including user_roles, attached to
  -- the same profile row after its ID changes. The migration deferred these
  -- constraints until commit so this update remains atomic.
  FOR foreign_key IN
    SELECT
      referencing_schema.nspname AS schema_name,
      referencing_table.relname AS table_name,
      referencing_column.attname AS column_name
    FROM pg_constraint constraint_row
    JOIN pg_class referencing_table
      ON referencing_table.oid = constraint_row.conrelid
    JOIN pg_namespace referencing_schema
      ON referencing_schema.oid = referencing_table.relnamespace
    JOIN pg_attribute referencing_column
      ON referencing_column.attrelid = constraint_row.conrelid
     AND referencing_column.attnum = constraint_row.conkey[1]
    JOIN pg_attribute referenced_column
      ON referenced_column.attrelid = constraint_row.confrelid
     AND referenced_column.attnum = constraint_row.confkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'mtop.user_profiles'::regclass
      AND array_length(constraint_row.conkey, 1) = 1
      AND array_length(constraint_row.confkey, 1) = 1
      AND referenced_column.attname = 'id'
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      foreign_key.schema_name,
      foreign_key.table_name,
      foreign_key.column_name,
      foreign_key.column_name
    )
    USING p_auth_user_id, profile_id;
  END LOOP;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION mtop.link_google_user_profile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mtop.link_google_user_profile(UUID) TO service_role;
