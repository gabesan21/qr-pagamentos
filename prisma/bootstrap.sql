-- Cluster administrators run this file before migrations. Operators assign login
-- secrets externally; this repository never supplies role passwords.

DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qr_migrator') THEN
    CREATE ROLE qr_migrator LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qr_runtime') THEN
    CREATE ROLE qr_runtime LOGIN;
  END IF;
END
$bootstrap$;

ALTER ROLE qr_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE qr_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

REVOKE CONNECT, TEMPORARY ON DATABASE qr_pagamentos FROM PUBLIC;
GRANT CONNECT ON DATABASE qr_pagamentos TO qr_migrator, qr_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM qr_runtime;
GRANT USAGE, CREATE ON SCHEMA public TO qr_migrator;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION qr_migrator;
ALTER SCHEMA app OWNER TO qr_migrator;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO qr_runtime;

REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC, qr_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC, qr_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO qr_runtime;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO qr_runtime;

DO $metadata$
BEGIN
  IF to_regclass('app._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app."_prisma_migrations" FROM qr_runtime;
  END IF;
END
$metadata$;

ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA app REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qr_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA app
  GRANT USAGE ON SEQUENCES TO qr_runtime;

DO $global_payment_settings_acl$
BEGIN
  IF to_regclass('app.global_payment_settings') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.global_payment_settings FROM qr_runtime;
    GRANT SELECT ON TABLE app.global_payment_settings TO qr_runtime;
    GRANT UPDATE (currencies, payment_methods, updated_at)
      ON TABLE app.global_payment_settings TO qr_runtime;
  END IF;
END
$global_payment_settings_acl$;
