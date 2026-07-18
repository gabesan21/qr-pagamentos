CREATE UNIQUE INDEX provider_order_id_owner_id_key ON app.provider_order(id, owner_id);

CREATE TABLE app.webhook_delivery (
    delivery_uuid UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    provider_order_id UUID,
    provider_order_uuid UUID NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    provider_created_at TIMESTAMPTZ(3) NOT NULL,
    provider_attempt_number INTEGER,
    payload_digest CHAR(64) NOT NULL,
    decision VARCHAR(10) NOT NULL DEFAULT 'RETRYABLE',
    lease_expires_at TIMESTAMPTZ(3),
    processing_attempt_number INTEGER,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT webhook_delivery_owner_fkey FOREIGN KEY (owner_id) REFERENCES app."user"(id) ON DELETE CASCADE,
    CONSTRAINT webhook_delivery_order_owner_fkey FOREIGN KEY (provider_order_id, owner_id) REFERENCES app.provider_order(id, owner_id) ON DELETE CASCADE,
    CONSTRAINT webhook_delivery_event_closed CHECK (event_type IN ('order.created','order.paid','order.processing','order.completed','order.rejected','order.canceled','order.refunded','order.expired','order.failed')),
    CONSTRAINT webhook_delivery_decision_closed CHECK (decision IN ('PROCESSING','PROCESSED','IGNORED','REJECTED','RETRYABLE')),
    CONSTRAINT webhook_delivery_digest_lower_hex CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT webhook_delivery_provider_attempt_positive CHECK (provider_attempt_number IS NULL OR provider_attempt_number > 0),
    CONSTRAINT webhook_delivery_processing_attempt_positive CHECK (processing_attempt_number IS NULL OR processing_attempt_number > 0),
    CONSTRAINT webhook_delivery_lease_consistent CHECK ((decision = 'PROCESSING') = (lease_expires_at IS NOT NULL AND processing_attempt_number IS NOT NULL))
);

CREATE INDEX webhook_delivery_owner_provider_order_idx ON app.webhook_delivery(owner_id, provider_order_uuid);
CREATE INDEX webhook_delivery_decision_lease_idx ON app.webhook_delivery(decision, lease_expires_at);

CREATE TABLE app.webhook_delivery_attempt (
    id BIGSERIAL PRIMARY KEY,
    delivery_uuid UUID NOT NULL,
    attempt_number INTEGER NOT NULL,
    outcome VARCHAR(10) NOT NULL,
    provider_attempt_number INTEGER,
    payload_digest CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ(3),
    CONSTRAINT webhook_delivery_attempt_delivery_fkey FOREIGN KEY (delivery_uuid) REFERENCES app.webhook_delivery(delivery_uuid) ON DELETE CASCADE,
    CONSTRAINT webhook_delivery_attempt_number_positive CHECK (attempt_number > 0),
    CONSTRAINT webhook_delivery_attempt_provider_number_positive CHECK (provider_attempt_number IS NULL OR provider_attempt_number > 0),
    CONSTRAINT webhook_delivery_attempt_digest_lower_hex CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
    CONSTRAINT webhook_delivery_attempt_outcome_closed CHECK (outcome IN ('CLAIMED','BUSY','PROCESSED','IGNORED','REJECTED','RETRYABLE')),
    CONSTRAINT webhook_delivery_attempt_completion_consistent CHECK ((outcome = 'CLAIMED') = (completed_at IS NULL))
);

CREATE UNIQUE INDEX webhook_delivery_attempt_delivery_number_key ON app.webhook_delivery_attempt(delivery_uuid, attempt_number);
CREATE INDEX webhook_delivery_attempt_delivery_created_idx ON app.webhook_delivery_attempt(delivery_uuid, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.webhook_delivery, app.webhook_delivery_attempt TO qr_runtime;
GRANT USAGE ON SEQUENCE app.webhook_delivery_attempt_id_seq TO qr_runtime;
