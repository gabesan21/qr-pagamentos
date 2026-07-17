ALTER TABLE "app"."nautt_credential"
ADD COLUMN "credential_revision" UUID;

UPDATE "app"."nautt_credential"
SET "credential_revision" = gen_random_uuid()
WHERE "credential_revision" IS NULL;

ALTER TABLE "app"."nautt_credential"
ALTER COLUMN "credential_revision" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "credential_revision" SET NOT NULL;

ALTER TABLE "app"."nautt_credential"
ADD CONSTRAINT "nautt_credential_credential_revision_key" UNIQUE ("credential_revision");
