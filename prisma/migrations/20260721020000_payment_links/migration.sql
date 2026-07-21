CREATE TABLE "app"."payment_link" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" VARCHAR(24) NOT NULL,
    "product_id" UUID NOT NULL,
    "currency_pair_id" UUID NOT NULL,
    "link_type" VARCHAR(10) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_link_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_link_identifier_key" UNIQUE ("identifier"),
    CONSTRAINT "payment_link_identifier_url_safe" CHECK ("identifier" ~ '^[A-Za-z0-9_-]{24}$'),
    CONSTRAINT "payment_link_type_closed" CHECK ("link_type" IN ('SINGLE_USE', 'REUSABLE')),
    CONSTRAINT "payment_link_product_fkey" FOREIGN KEY ("product_id") REFERENCES "app"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_link_currency_pair_fkey" FOREIGN KEY ("currency_pair_id") REFERENCES "app"."catalog_currency_pair"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payment_link_created_at_id_idx" ON "app"."payment_link"("created_at", "id");
CREATE INDEX "payment_link_product_id_idx" ON "app"."payment_link"("product_id");
CREATE INDEX "payment_link_currency_pair_id_idx" ON "app"."payment_link"("currency_pair_id");

CREATE FUNCTION "app"."payment_link_require_active_dependencies"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    product_is_active BOOLEAN;
    currency_pair_is_active BOOLEAN;
BEGIN
    SELECT "active" INTO product_is_active
    FROM "app"."product"
    WHERE "id" = NEW."product_id"
    FOR SHARE;

    IF NOT FOUND OR NOT product_is_active THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'payment_link_product_active',
            MESSAGE = 'Payment links require an active product';
    END IF;

    SELECT "active" INTO currency_pair_is_active
    FROM "app"."catalog_currency_pair"
    WHERE "id" = NEW."currency_pair_id"
    FOR SHARE;

    IF NOT FOUND OR NOT currency_pair_is_active THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'payment_link_currency_pair_active',
            MESSAGE = 'Payment links require an active currency pair';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "payment_link_require_active_dependencies"
BEFORE INSERT ON "app"."payment_link"
FOR EACH ROW
EXECUTE FUNCTION "app"."payment_link_require_active_dependencies"();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."payment_link" TO qr_runtime;
