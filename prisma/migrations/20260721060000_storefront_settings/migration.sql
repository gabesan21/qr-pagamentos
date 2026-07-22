ALTER TABLE "app"."user"
    ADD COLUMN "storefront_slug" VARCHAR(63),
    ADD COLUMN "storefront_display_name_pt_br" VARCHAR(160),
    ADD COLUMN "storefront_display_name_en" VARCHAR(160),
    ADD COLUMN "storefront_accent_color" VARCHAR(7),
    ADD COLUMN "storefront_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "user_storefront_slug_format" CHECK (
        "storefront_slug" IS NULL OR "storefront_slug" ~ '^[a-z0-9](-?[a-z0-9])*$'
    ),
    ADD CONSTRAINT "user_storefront_display_name_pt_br_single_line" CHECK (
        "storefront_display_name_pt_br" IS NULL OR "storefront_display_name_pt_br" !~ E'[\r\n]'
    ),
    ADD CONSTRAINT "user_storefront_display_name_en_single_line" CHECK (
        "storefront_display_name_en" IS NULL OR "storefront_display_name_en" !~ E'[\r\n]'
    ),
    ADD CONSTRAINT "user_storefront_accent_color_format" CHECK (
        "storefront_accent_color" IS NULL OR "storefront_accent_color" ~ '^#[0-9A-F]{6}$'
    ),
    ADD CONSTRAINT "user_storefront_enabled_requires_slug" CHECK (
        NOT "storefront_enabled" OR "storefront_slug" IS NOT NULL
    );

CREATE UNIQUE INDEX "user_storefront_slug_key" ON "app"."user"("storefront_slug");

GRANT SELECT, UPDATE ("storefront_slug", "storefront_display_name_pt_br", "storefront_display_name_en", "storefront_accent_color", "storefront_enabled") ON TABLE "app"."user" TO qr_runtime;
