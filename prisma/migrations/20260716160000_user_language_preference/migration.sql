ALTER TABLE "app"."user"
  ADD COLUMN "preferred_locale" VARCHAR(5),
  ADD CONSTRAINT "user_preferred_locale_check"
    CHECK ("preferred_locale" IS NULL OR "preferred_locale" IN ('pt-BR', 'en'));

GRANT SELECT, UPDATE ("preferred_locale") ON TABLE "app"."user" TO qr_runtime;
