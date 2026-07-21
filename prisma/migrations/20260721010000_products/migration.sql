CREATE TABLE "app"."product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "internal_name" VARCHAR(128) NOT NULL,
    "title_pt_br" VARCHAR(160) NOT NULL,
    "title_en" VARCHAR(160) NOT NULL,
    "description_pt_br" VARCHAR(2000) NOT NULL,
    "description_en" VARCHAR(2000) NOT NULL,
    "price" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_internal_name_bounds" CHECK (
        char_length("internal_name") BETWEEN 1 AND 128
        AND "internal_name" = btrim("internal_name", concat(E' \t\n\r\f\v', chr(160), chr(5760), chr(8192), chr(8193), chr(8194), chr(8195), chr(8196), chr(8197), chr(8198), chr(8199), chr(8200), chr(8201), chr(8202), chr(8232), chr(8233), chr(8239), chr(8287), chr(12288), chr(65279)))
    ),
    CONSTRAINT "product_internal_name_single_line" CHECK ("internal_name" !~ E'[\\r\\n]'),
    CONSTRAINT "product_title_pt_br_bounds" CHECK (
        char_length("title_pt_br") BETWEEN 1 AND 160
        AND "title_pt_br" = btrim("title_pt_br", concat(E' \t\n\r\f\v', chr(160), chr(5760), chr(8192), chr(8193), chr(8194), chr(8195), chr(8196), chr(8197), chr(8198), chr(8199), chr(8200), chr(8201), chr(8202), chr(8232), chr(8233), chr(8239), chr(8287), chr(12288), chr(65279)))
    ),
    CONSTRAINT "product_title_pt_br_single_line" CHECK ("title_pt_br" !~ E'[\\r\\n]'),
    CONSTRAINT "product_title_en_bounds" CHECK (
        char_length("title_en") BETWEEN 1 AND 160
        AND "title_en" = btrim("title_en", concat(E' \t\n\r\f\v', chr(160), chr(5760), chr(8192), chr(8193), chr(8194), chr(8195), chr(8196), chr(8197), chr(8198), chr(8199), chr(8200), chr(8201), chr(8202), chr(8232), chr(8233), chr(8239), chr(8287), chr(12288), chr(65279)))
    ),
    CONSTRAINT "product_title_en_single_line" CHECK ("title_en" !~ E'[\\r\\n]'),
    CONSTRAINT "product_description_pt_br_bounds" CHECK (
        char_length("description_pt_br") BETWEEN 1 AND 2000
        AND "description_pt_br" = btrim("description_pt_br", concat(E' \t\n\r\f\v', chr(160), chr(5760), chr(8192), chr(8193), chr(8194), chr(8195), chr(8196), chr(8197), chr(8198), chr(8199), chr(8200), chr(8201), chr(8202), chr(8232), chr(8233), chr(8239), chr(8287), chr(12288), chr(65279)))
    ),
    CONSTRAINT "product_description_en_bounds" CHECK (
        char_length("description_en") BETWEEN 1 AND 2000
        AND "description_en" = btrim("description_en", concat(E' \t\n\r\f\v', chr(160), chr(5760), chr(8192), chr(8193), chr(8194), chr(8195), chr(8196), chr(8197), chr(8198), chr(8199), chr(8200), chr(8201), chr(8202), chr(8232), chr(8233), chr(8239), chr(8287), chr(12288), chr(65279)))
    ),
    CONSTRAINT "product_price_canonical" CHECK (
        "price" ~ '^(0[.][0-9]{0,5}[1-9]|[1-9][0-9]{0,11}([.][0-9]{0,5}[1-9])?)$'
    ),
    CONSTRAINT "product_version_nonnegative" CHECK ("version" >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "app"."product" TO qr_runtime;
