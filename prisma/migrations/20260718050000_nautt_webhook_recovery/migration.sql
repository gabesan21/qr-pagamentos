ALTER TABLE app.webhook_delivery
    ADD COLUMN evidence_source VARCHAR(8) NOT NULL DEFAULT 'INTAKE',
    ADD COLUMN provider_webhook_uuid UUID,
    ADD COLUMN provider_is_delivered BOOLEAN,
    ADD COLUMN provider_is_permanently_failed BOOLEAN,
    ALTER COLUMN payload_digest DROP NOT NULL,
    ADD CONSTRAINT webhook_delivery_evidence_source_closed CHECK (evidence_source IN ('INTAKE', 'RECOVERY')),
    ADD CONSTRAINT webhook_delivery_evidence_consistent CHECK (
      (evidence_source = 'INTAKE' AND payload_digest IS NOT NULL AND provider_webhook_uuid IS NULL AND provider_is_delivered IS NULL AND provider_is_permanently_failed IS NULL)
      OR
      (evidence_source = 'RECOVERY' AND payload_digest IS NULL AND provider_webhook_uuid IS NOT NULL AND provider_is_delivered IS NOT NULL AND provider_is_permanently_failed IS TRUE AND provider_attempt_number IS NOT NULL)
    );

ALTER TABLE app.webhook_delivery_attempt
    ADD COLUMN evidence_source VARCHAR(8) NOT NULL DEFAULT 'INTAKE',
    ADD COLUMN provider_webhook_uuid UUID,
    ADD COLUMN provider_is_delivered BOOLEAN,
    ADD COLUMN provider_is_permanently_failed BOOLEAN,
    ALTER COLUMN payload_digest DROP NOT NULL,
    ADD CONSTRAINT webhook_delivery_attempt_evidence_source_closed CHECK (evidence_source IN ('INTAKE', 'RECOVERY')),
    ADD CONSTRAINT webhook_delivery_attempt_evidence_consistent CHECK (
      (evidence_source = 'INTAKE' AND payload_digest IS NOT NULL AND provider_webhook_uuid IS NULL AND provider_is_delivered IS NULL AND provider_is_permanently_failed IS NULL)
      OR
      (evidence_source = 'RECOVERY' AND payload_digest IS NULL AND provider_webhook_uuid IS NOT NULL AND provider_is_delivered IS NOT NULL AND provider_is_permanently_failed IS TRUE AND provider_attempt_number IS NOT NULL)
    );

CREATE TABLE app.webhook_recovery_lease (
    provider_order_id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    fence_token UUID NOT NULL,
    lease_expires_at TIMESTAMPTZ(3) NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT webhook_recovery_lease_order_owner_fkey FOREIGN KEY (provider_order_id, owner_id) REFERENCES app.provider_order(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX webhook_recovery_lease_expiry_idx ON app.webhook_recovery_lease(lease_expires_at);
CREATE UNIQUE INDEX webhook_recovery_lease_order_owner_key ON app.webhook_recovery_lease(provider_order_id, owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.webhook_recovery_lease TO qr_runtime;
