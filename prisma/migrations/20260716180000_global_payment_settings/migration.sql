CREATE TABLE "app"."global_payment_settings" (
    "id" SMALLINT NOT NULL,
    "currencies" TEXT[] NOT NULL,
    "payment_methods" TEXT[] NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "global_payment_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "global_payment_settings_singleton" CHECK ("id" = 1),
    CONSTRAINT "global_payment_settings_currencies_closed" CHECK ("currencies" <@ ARRAY['BRL']::TEXT[]),
    CONSTRAINT "global_payment_settings_payment_methods_closed" CHECK ("payment_methods" <@ ARRAY['PIX']::TEXT[])
);

INSERT INTO "app"."global_payment_settings" ("id", "currencies", "payment_methods")
VALUES (1, ARRAY['BRL']::TEXT[], ARRAY['PIX']::TEXT[]);

GRANT SELECT, UPDATE ("currencies", "payment_methods", "updated_at") ON TABLE "app"."global_payment_settings" TO qr_runtime;
