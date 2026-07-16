CREATE TABLE "app"."session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_digest" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "session_token_digest_key" UNIQUE ("token_digest"),
    CONSTRAINT "session_user_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "session_user_created_at_id_idx" ON "app"."session"("user_id", "created_at", "id");
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."session" TO qr_runtime;
