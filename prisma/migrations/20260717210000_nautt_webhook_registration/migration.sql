ALTER TABLE "app"."nautt_credential"
    ADD COLUMN "webhook_registration_state" VARCHAR(13) NOT NULL DEFAULT 'UNREGISTERED',
    ADD COLUMN "provider_webhook_id" UUID,
    ADD COLUMN "encrypted_webhook_secret" TEXT,
    ADD COLUMN "webhook_registered_at" TIMESTAMPTZ(3),
    ADD CONSTRAINT "nautt_credential_webhook_registration_state_closed"
        CHECK ("webhook_registration_state" IN ('UNREGISTERED', 'REGISTERING', 'ACTIVE', 'INDETERMINATE')),
    ADD CONSTRAINT "nautt_credential_webhook_active_tuple_complete"
        CHECK (
            (
                "webhook_registration_state" = 'ACTIVE'
                AND "provider_webhook_id" IS NOT NULL
                AND "encrypted_webhook_secret" IS NOT NULL
                AND "webhook_registered_at" IS NOT NULL
            ) OR (
                "webhook_registration_state" <> 'ACTIVE'
                AND "provider_webhook_id" IS NULL
                AND "encrypted_webhook_secret" IS NULL
                AND "webhook_registered_at" IS NULL
            )
        );
