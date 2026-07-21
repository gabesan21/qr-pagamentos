CREATE TABLE "app"."checkout_attempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "payment_link_id" UUID NOT NULL,
    "payment_link_order_id" UUID NOT NULL,
    "retry_key_verifier" CHAR(64) NOT NULL,
    "request_verifier" CHAR(64) NOT NULL,
    "capability_nonce" CHAR(43) NOT NULL,
    "capability_key_version" VARCHAR(16) NOT NULL,
    "capability_verifier" CHAR(64) NOT NULL,
    "capability_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "capability_revoked_at" TIMESTAMPTZ(3),
    "state" VARCHAR(13) NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "checkout_attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "checkout_attempt_payment_link_order_id_key" UNIQUE ("payment_link_order_id"),
    CONSTRAINT "checkout_attempt_order_owner_key" UNIQUE ("payment_link_order_id", "owner_id"),
    CONSTRAINT "checkout_attempt_link_retry_key_verifier_key" UNIQUE ("payment_link_id", "retry_key_verifier"),
    CONSTRAINT "checkout_attempt_retry_key_verifier_hex" CHECK ("retry_key_verifier" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "checkout_attempt_request_verifier_hex" CHECK ("request_verifier" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "checkout_attempt_capability_verifier_hex" CHECK ("capability_verifier" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "checkout_attempt_nonce_base64url" CHECK ("capability_nonce" ~ '^[A-Za-z0-9_-]{43}$'),
    CONSTRAINT "checkout_attempt_state_closed" CHECK ("state" IN ('RESERVED', 'CREATING', 'PENDING', 'INDETERMINATE')),
    CONSTRAINT "checkout_attempt_capability_expiry_after_creation" CHECK ("capability_expires_at" > "created_at"),
    CONSTRAINT "checkout_attempt_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "app"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "checkout_attempt_link_owner_fkey" FOREIGN KEY ("payment_link_id", "owner_id") REFERENCES "app"."payment_link"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "checkout_attempt_order_owner_fkey" FOREIGN KEY ("payment_link_order_id", "owner_id") REFERENCES "app"."payment_link_order"("id", "owner_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "checkout_attempt_owner_capability_expiry_idx" ON "app"."checkout_attempt"("owner_id", "capability_expires_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."checkout_attempt" TO qr_runtime;
