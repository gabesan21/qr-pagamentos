CREATE TABLE "app"."nautt_credential" (
    "user_id" UUID NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nautt_credential_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "nautt_credential_user_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."nautt_credential" TO qr_runtime;
