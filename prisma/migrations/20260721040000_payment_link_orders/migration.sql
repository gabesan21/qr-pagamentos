ALTER TABLE "app"."payment_link"
    ADD CONSTRAINT "payment_link_id_owner_id_key" UNIQUE ("id", "owner_id"),
    ADD CONSTRAINT "payment_link_id_owner_product_id_key" UNIQUE ("id", "owner_id", "product_id");

CREATE TABLE "app"."payment_link_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "payment_link_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_price" TEXT NOT NULL,
    "currency_uuid" UUID NOT NULL,
    "exchange_currency_uuid" UUID NOT NULL,
    "checkout_data_policy" VARCHAR(22) NOT NULL,
    "name" VARCHAR(160),
    "email" VARCHAR(254),
    "cpf" CHAR(11),
    "street" VARCHAR(160),
    "number" VARCHAR(32),
    "district" VARCHAR(120),
    "city" VARCHAR(120),
    "state_uf" CHAR(2),
    "postal_code" CHAR(8),
    "country" CHAR(2),
    "complement" VARCHAR(160),
    "state" VARCHAR(13) NOT NULL DEFAULT 'CREATED',
    "lifecycle_version" INTEGER NOT NULL DEFAULT 0,
    "settled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_link_order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_link_order_id_owner_id_key" UNIQUE ("id", "owner_id"),
    CONSTRAINT "payment_link_order_product_price_canonical" CHECK (
        "product_price" ~ '^(0[.][0-9]{0,5}[1-9]|[1-9][0-9]{0,11}([.][0-9]{0,5}[1-9])?)$'
    ),
    CONSTRAINT "payment_link_order_policy_closed" CHECK (
        "checkout_data_policy" IN ('NONE', 'NAME_EMAIL', 'EMAIL', 'NAME_EMAIL_CPF', 'NAME_EMAIL_CPF_ADDRESS')
    ),
    CONSTRAINT "payment_link_order_snapshot_tuple" CHECK (
        ("checkout_data_policy" = 'NONE' AND "name" IS NULL AND "email" IS NULL AND "cpf" IS NULL AND "street" IS NULL AND "number" IS NULL AND "district" IS NULL AND "city" IS NULL AND "state_uf" IS NULL AND "postal_code" IS NULL AND "country" IS NULL AND "complement" IS NULL) OR
        ("checkout_data_policy" = 'NAME_EMAIL' AND "name" IS NOT NULL AND "email" IS NOT NULL AND "cpf" IS NULL AND "street" IS NULL AND "number" IS NULL AND "district" IS NULL AND "city" IS NULL AND "state_uf" IS NULL AND "postal_code" IS NULL AND "country" IS NULL AND "complement" IS NULL) OR
        ("checkout_data_policy" = 'EMAIL' AND "name" IS NULL AND "email" IS NOT NULL AND "cpf" IS NULL AND "street" IS NULL AND "number" IS NULL AND "district" IS NULL AND "city" IS NULL AND "state_uf" IS NULL AND "postal_code" IS NULL AND "country" IS NULL AND "complement" IS NULL) OR
        ("checkout_data_policy" = 'NAME_EMAIL_CPF' AND "name" IS NOT NULL AND "email" IS NOT NULL AND "cpf" IS NOT NULL AND "street" IS NULL AND "number" IS NULL AND "district" IS NULL AND "city" IS NULL AND "state_uf" IS NULL AND "postal_code" IS NULL AND "country" IS NULL AND "complement" IS NULL) OR
        ("checkout_data_policy" = 'NAME_EMAIL_CPF_ADDRESS' AND "name" IS NOT NULL AND "email" IS NOT NULL AND "cpf" IS NOT NULL AND "street" IS NOT NULL AND "number" IS NOT NULL AND "district" IS NOT NULL AND "city" IS NOT NULL AND "state_uf" IS NOT NULL AND "postal_code" IS NOT NULL AND "country" = 'BR')
    ),
    CONSTRAINT "payment_link_order_name_bounds" CHECK ("name" IS NULL OR (char_length("name") BETWEEN 1 AND 160 AND "name" !~ '[[:cntrl:]]')),
    CONSTRAINT "payment_link_order_email_bounds" CHECK ("email" IS NULL OR (char_length("email") BETWEEN 3 AND 254 AND "email" !~ '[[:space:][:cntrl:]]' AND "email" ~ '^[^@]+@[^@]+$')),
    CONSTRAINT "payment_link_order_cpf_digits" CHECK ("cpf" IS NULL OR "cpf" ~ '^[0-9]{11}$'),
    CONSTRAINT "payment_link_order_street_bounds" CHECK ("street" IS NULL OR (char_length("street") BETWEEN 1 AND 160 AND "street" !~ '[[:cntrl:]]')),
    CONSTRAINT "payment_link_order_number_bounds" CHECK ("number" IS NULL OR (char_length("number") BETWEEN 1 AND 32 AND "number" !~ '[[:cntrl:]]')),
    CONSTRAINT "payment_link_order_district_bounds" CHECK ("district" IS NULL OR (char_length("district") BETWEEN 1 AND 120 AND "district" !~ '[[:cntrl:]]')),
    CONSTRAINT "payment_link_order_city_bounds" CHECK ("city" IS NULL OR (char_length("city") BETWEEN 1 AND 120 AND "city" !~ '[[:cntrl:]]')),
    CONSTRAINT "payment_link_order_complement_bounds" CHECK ("complement" IS NULL OR (char_length("complement") BETWEEN 1 AND 160 AND "complement" !~ '[[:cntrl:]]')),
    CONSTRAINT "payment_link_order_brazil_address" CHECK (
        ("state_uf" IS NULL OR "state_uf" IN ('AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO')) AND
        ("postal_code" IS NULL OR "postal_code" ~ '^[0-9]{8}$') AND
        ("country" IS NULL OR "country" = 'BR')
    ),
    CONSTRAINT "payment_link_order_state_closed" CHECK ("state" IN ('CREATED', 'PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'INDETERMINATE', 'REFUNDED')),
    CONSTRAINT "payment_link_order_version_nonnegative" CHECK ("lifecycle_version" >= 0),
    CONSTRAINT "payment_link_order_settlement_consistent" CHECK (("state" IN ('CONFIRMED', 'REFUNDED') AND "settled_at" IS NOT NULL) OR ("state" NOT IN ('CONFIRMED', 'REFUNDED') AND "settled_at" IS NULL)),
    CONSTRAINT "payment_link_order_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_link_order_link_owner_product_fkey" FOREIGN KEY ("payment_link_id", "owner_id", "product_id") REFERENCES "app"."payment_link"("id", "owner_id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_link_order_product_owner_fkey" FOREIGN KEY ("product_id", "owner_id") REFERENCES "app"."product"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payment_link_order_owner_created_at_id_idx" ON "app"."payment_link_order"("owner_id", "created_at", "id");

ALTER TABLE "app"."provider_order"
    ADD COLUMN "payment_link_order_id" UUID,
    ADD CONSTRAINT "provider_order_payment_link_order_id_key" UNIQUE ("payment_link_order_id"),
    ADD CONSTRAINT "provider_order_payment_link_order_owner_key" UNIQUE ("payment_link_order_id", "owner_id"),
    ADD CONSTRAINT "provider_order_payment_link_order_owner_fkey" FOREIGN KEY ("payment_link_order_id", "owner_id") REFERENCES "app"."payment_link_order"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "app"."payment_link_single_use_settlement" (
    "payment_link_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "payment_link_order_id" UUID NOT NULL,
    "claimed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_link_single_use_settlement_pkey" PRIMARY KEY ("payment_link_id"),
    CONSTRAINT "payment_link_single_use_settlement_order_key" UNIQUE ("payment_link_order_id"),
    CONSTRAINT "payment_link_single_use_settlement_link_owner_key" UNIQUE ("payment_link_id", "owner_id"),
    CONSTRAINT "payment_link_single_use_settlement_order_owner_key" UNIQUE ("payment_link_order_id", "owner_id"),
    CONSTRAINT "payment_link_single_use_settlement_link_owner_fkey" FOREIGN KEY ("payment_link_id", "owner_id") REFERENCES "app"."payment_link"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_link_single_use_settlement_order_owner_fkey" FOREIGN KEY ("payment_link_order_id", "owner_id") REFERENCES "app"."payment_link_order"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."payment_link_order" TO qr_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."payment_link_single_use_settlement" TO qr_runtime;
