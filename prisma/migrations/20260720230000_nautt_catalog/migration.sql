CREATE TABLE "app"."catalog_currency_pair" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(128) NOT NULL,
    "currency_uuid" UUID NOT NULL,
    "exchange_currency_uuid" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_currency_pair_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_currency_pair_uuids_key" UNIQUE ("currency_uuid", "exchange_currency_uuid")
);

CREATE TABLE "app"."catalog_payment_method" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(128) NOT NULL,
    "payment_method_uuid" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_payment_method_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "catalog_payment_method_uuid_key" UNIQUE ("payment_method_uuid")
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."catalog_currency_pair" TO qr_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."catalog_payment_method" TO qr_runtime;
