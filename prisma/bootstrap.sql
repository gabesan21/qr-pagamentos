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

DO $product_category_acl$
BEGIN
  IF to_regclass('app.product_category') IS NOT NULL THEN
    REVOKE DELETE ON TABLE app.product_category FROM qr_runtime;
  END IF;
END
$product_category_acl$;

DO $catalog_currency_pair_acl$
BEGIN
  IF to_regclass('app.catalog_currency_pair') IS NOT NULL THEN
    REVOKE DELETE ON TABLE app.catalog_currency_pair FROM qr_runtime;
  END IF;
END
$catalog_currency_pair_acl$;

-- Commerce V2 least-privilege pinning: the blanket DML grant above re-grants
-- every privilege on every pass, so these relation-guarded blocks restore the
-- exact privilege set the owning migration pinned.
DO $order_v2_line_acl$
BEGIN
  IF to_regclass('app.order_v2_line') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.order_v2_line FROM qr_runtime;
    GRANT SELECT, INSERT ON TABLE app.order_v2_line TO qr_runtime;
  END IF;
END
$order_v2_line_acl$;

DO $order_comment_v2_acl$
BEGIN
  IF to_regclass('app.order_comment_v2') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.order_comment_v2 FROM qr_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE app.order_comment_v2 TO qr_runtime;
  END IF;
END
$order_comment_v2_acl$;

DO $order_local_outcome_v2_acl$
BEGIN
  IF to_regclass('app.order_local_outcome_v2') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.order_local_outcome_v2 FROM qr_runtime;
    GRANT SELECT, INSERT ON TABLE app.order_local_outcome_v2 TO qr_runtime;
  END IF;
END
$order_local_outcome_v2_acl$;

DO $payment_link_v2_single_use_settlement_acl$
BEGIN
  IF to_regclass('app.payment_link_v2_single_use_settlement') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.payment_link_v2_single_use_settlement FROM qr_runtime;
    GRANT SELECT, INSERT ON TABLE app.payment_link_v2_single_use_settlement TO qr_runtime;
  END IF;
END
$payment_link_v2_single_use_settlement_acl$;

DO $standalone_checkout_attempt_acl$
BEGIN
  IF to_regclass('app.standalone_checkout_attempt') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.standalone_checkout_attempt FROM qr_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE app.standalone_checkout_attempt TO qr_runtime;
  END IF;
END
$standalone_checkout_attempt_acl$;

DO $user_deletion_acl$
BEGIN
  IF to_regclass('app.user_deletion') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.user_deletion FROM qr_runtime;
    GRANT SELECT, INSERT ON TABLE app.user_deletion TO qr_runtime;
  END IF;
END
$user_deletion_acl$;

DO $system_settings_acl$
BEGIN
  IF to_regclass('app.system_settings') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE app.system_settings FROM qr_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE app.system_settings TO qr_runtime;
  END IF;
END
$system_settings_acl$;
