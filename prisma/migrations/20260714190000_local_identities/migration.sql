CREATE TABLE "app"."user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(32) NOT NULL,
    "email" VARCHAR(254),
    "role" VARCHAR(5) NOT NULL,
    "status" VARCHAR(8) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_username_key" UNIQUE ("username"),
    CONSTRAINT "user_username_canonical" CHECK (
        octet_length("username") BETWEEN 3 AND 32
        AND "username" = lower("username")
        AND "username" ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
    CONSTRAINT "user_email_key" UNIQUE ("email"),
    CONSTRAINT "user_email_canonical" CHECK (
        "email" IS NULL OR (
        octet_length("email") BETWEEN 6 AND 254
        AND "email" = lower("email")
        AND split_part("email", '@', 1) !~ '(^\.|\.\.|\.$)'
        AND octet_length(split_part("email", '@', 2)) BETWEEN 4 AND 253
        AND split_part("email", '@', 2) !~ '(^|\.)-'
        AND split_part("email", '@', 2) !~ '-($|\.)'
        AND "email" ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*\.[a-z]{2,63}$')
    ),
    CONSTRAINT "user_role_closed" CHECK ("role" IN ('ADMIN', 'USER')),
    CONSTRAINT "user_status_closed" CHECK ("status" IN ('ACTIVE', 'DISABLED'))
);

CREATE TABLE "app"."password_credential" (
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_credential_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "password_credential_hash_format" CHECK (
        "password_hash" ~ '^scrypt\$v=1\$N=131072,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$'
    ),
    CONSTRAINT "password_credential_user_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "app"."deployment_bootstrap" (
    "id" SMALLINT NOT NULL,
    "initial_admin_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_bootstrap_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deployment_bootstrap_singleton" CHECK ("id" = 1)
);

CREATE FUNCTION "app"."reject_deployment_bootstrap_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'deployment bootstrap is immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "deployment_bootstrap_immutable"
BEFORE UPDATE OR DELETE ON "app"."deployment_bootstrap"
FOR EACH ROW EXECUTE FUNCTION "app"."reject_deployment_bootstrap_mutation"();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    "app"."user",
    "app"."password_credential",
    "app"."deployment_bootstrap"
TO qr_runtime;

DO $migration$
BEGIN
    IF to_regclass('app._prisma_migrations') IS NOT NULL THEN
        REVOKE ALL PRIVILEGES ON TABLE app."_prisma_migrations" FROM qr_runtime;
    END IF;
END
$migration$;
