CREATE TABLE "app"."provider_quote" (
    "quote_uuid" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "claimed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_quote_pkey" PRIMARY KEY ("quote_uuid"),
    CONSTRAINT "provider_quote_quote_uuid_owner_id_key" UNIQUE ("quote_uuid", "owner_id"),
    CONSTRAINT "provider_quote_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "provider_quote_owner_expires_at_idx" ON "app"."provider_quote"("owner_id", "expires_at");

CREATE TABLE "app"."provider_order" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "quote_uuid" UUID NOT NULL,
    "provider_order_uuid" UUID,
    "creation_state" VARCHAR(13) NOT NULL DEFAULT 'CREATING',
    "status" VARCHAR(10),
    "fiat_amount" TEXT,
    "crypto_amount" TEXT,
    "nautt_quote" TEXT,
    "provider_expires_at" TIMESTAMPTZ(3),
    "payment_method" TEXT,
    "pix_copy_paste" TEXT,
    "pix_qrcode_url" TEXT,
    "reconciliation_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provider_order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "provider_order_quote_uuid_key" UNIQUE ("quote_uuid"),
    CONSTRAINT "provider_order_quote_uuid_owner_id_key" UNIQUE ("quote_uuid", "owner_id"),
    CONSTRAINT "provider_order_provider_order_uuid_key" UNIQUE ("provider_order_uuid"),
    CONSTRAINT "provider_order_creation_state_closed" CHECK ("creation_state" IN ('CREATING', 'INDETERMINATE', 'CREATED')),
    CONSTRAINT "provider_order_status_closed" CHECK ("status" IS NULL OR "status" IN ('new', 'processing', 'paid', 'finished', 'rejected', 'canceled', 'refunded', 'expired')),
    CONSTRAINT "provider_order_version_nonnegative" CHECK ("reconciliation_version" >= 0),
    CONSTRAINT "provider_order_decimal_lexemes" CHECK (
        ("fiat_amount" IS NULL OR "fiat_amount" ~ '^[0-9]+(\.[0-9]+)?$') AND
        ("crypto_amount" IS NULL OR "crypto_amount" ~ '^[0-9]+(\.[0-9]+)?$') AND
        ("nautt_quote" IS NULL OR "nautt_quote" ~ '^[0-9]+(\.[0-9]+)?$')
    ),
    CONSTRAINT "provider_order_creation_tuple" CHECK (
        ("creation_state" = 'CREATING' AND "provider_order_uuid" IS NULL AND "status" IS NULL AND "fiat_amount" IS NULL AND "crypto_amount" IS NULL AND "nautt_quote" IS NULL AND "provider_expires_at" IS NULL AND "payment_method" IS NULL AND "pix_copy_paste" IS NULL AND "pix_qrcode_url" IS NULL) OR
        ("creation_state" = 'INDETERMINATE' AND "status" IS NULL AND "fiat_amount" IS NULL AND "crypto_amount" IS NULL AND "nautt_quote" IS NULL AND "provider_expires_at" IS NULL AND "payment_method" IS NULL AND "pix_copy_paste" IS NULL AND "pix_qrcode_url" IS NULL) OR
        ("creation_state" = 'CREATED' AND "provider_order_uuid" IS NOT NULL AND "status" IS NOT NULL AND "fiat_amount" IS NOT NULL AND "crypto_amount" IS NOT NULL AND "nautt_quote" IS NOT NULL AND "provider_expires_at" IS NOT NULL AND "payment_method" IS NOT NULL AND length(btrim("payment_method")) > 0)
    ),
    CONSTRAINT "provider_order_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "provider_order_quote_owner_fkey" FOREIGN KEY ("quote_uuid", "owner_id") REFERENCES "app"."provider_quote"("quote_uuid", "owner_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "provider_order_owner_status_idx" ON "app"."provider_order"("owner_id", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."provider_quote" TO qr_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."provider_order" TO qr_runtime;
