-- Better Auth's four tables: user, session, account, verification.
--
-- These were created ad-hoc by the Better Auth CLI directly against staging and
-- have never existed in version control, so a fresh volume came up with no
-- console at all: /console 500'd and scripts/seed-operator.mjs had nothing to
-- write into. This file is the exact live schema (pg_dump --schema-only of
-- those four tables on 2026-07-25, database version 17.10), made re-runnable so
-- it is a no-op on the box it was dumped from.
--
-- It is transcribed, not authored: the column names are Better Auth's camelCase
-- and must stay quoted. If a Better Auth upgrade changes the schema, add a new
-- migration rather than editing this one.

CREATE TABLE IF NOT EXISTS public."user" (
  id              text NOT NULL,
  name            text NOT NULL,
  email           text NOT NULL,
  "emailVerified" boolean NOT NULL,
  image           text,
  "createdAt"     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.session (
  id          text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  token       text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.account (
  id                      text NOT NULL,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope                   text,
  password                text,
  "createdAt"             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.verification (
  id           text NOT NULL,
  identifier   text NOT NULL,
  value        text NOT NULL,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, and the exception names differ
-- per constraint kind (a second PRIMARY KEY raises invalid_table_definition,
-- not duplicate_object), so guard on the catalog instead of catching.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('user',         'user_pkey',            'PRIMARY KEY (id)'),
      ('user',         'user_email_key',       'UNIQUE (email)'),
      ('session',      'session_pkey',         'PRIMARY KEY (id)'),
      ('session',      'session_token_key',    'UNIQUE (token)'),
      ('session',      'session_userId_fkey',  'FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE'),
      ('account',      'account_pkey',         'PRIMARY KEY (id)'),
      ('account',      'account_userId_fkey',  'FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE'),
      ('verification', 'verification_pkey',    'PRIMARY KEY (id)')
    ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = c.name
         AND conrelid = format('public.%I', c.tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON public.session ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON public.account ("userId");
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON public.verification (identifier);
