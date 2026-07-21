LOCK TABLE "app"."product", "app"."payment_link" IN SHARE ROW EXCLUSIVE MODE;

DO $owner_isolation$
BEGIN
    IF EXISTS (SELECT 1 FROM "app"."product") OR EXISTS (SELECT 1 FROM "app"."payment_link") THEN
        RAISE EXCEPTION 'owner isolation migration requires empty product and payment_link tables'
            USING ERRCODE = '23514';
    END IF;
END
$owner_isolation$;

ALTER TABLE "app"."user"
    ADD COLUMN "checkout_data_policy" VARCHAR(22) NOT NULL DEFAULT 'NONE',
    ADD CONSTRAINT "user_checkout_data_policy_closed"
        CHECK ("checkout_data_policy" IN ('NONE', 'NAME_EMAIL', 'EMAIL', 'NAME_EMAIL_CPF', 'NAME_EMAIL_CPF_ADDRESS'));

ALTER TABLE "app"."product"
    ADD COLUMN "owner_id" UUID NOT NULL,
    ADD CONSTRAINT "product_owner_fkey"
        FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "product_id_owner_id_key" UNIQUE ("id", "owner_id");

CREATE INDEX "product_owner_internal_name_id_idx" ON "app"."product"("owner_id", "internal_name", "id");

ALTER TABLE "app"."payment_link"
    ADD COLUMN "owner_id" UUID NOT NULL,
    DROP CONSTRAINT "payment_link_product_fkey",
    ADD CONSTRAINT "payment_link_owner_fkey"
        FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_link_product_owner_fkey"
        FOREIGN KEY ("product_id", "owner_id") REFERENCES "app"."product"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payment_link_owner_created_at_id_idx" ON "app"."payment_link"("owner_id", "created_at", "id");

GRANT SELECT, UPDATE ("checkout_data_policy") ON TABLE "app"."user" TO qr_runtime;
