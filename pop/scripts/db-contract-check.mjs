import { readFile, readdir } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const exactDependencies = {
  "@prisma/adapter-pg": "7.8.0",
  "@prisma/client": "7.8.0",
  pg: "8.22.0",
};
const exactDevDependencies = { "@types/pg": "8.20.0", prisma: "7.8.0" };
for (const [name, version] of Object.entries(exactDependencies)) {
  assert(packageJson.dependencies?.[name] === version, `${name} must be pinned at ${version}`);
}
for (const [name, version] of Object.entries(exactDevDependencies)) {
  assert(packageJson.devDependencies?.[name] === version, `${name} must be pinned at ${version}`);
}
assert(packageJson.scripts?.["db:generate"] === "prisma generate", "db:generate contract changed");
assert(packageJson.scripts?.["db:test"] === "node pop/scripts/db-test.mjs", "db:test contract changed");
assert(packageJson.scripts?.["db:migration-policy"] === "node pop/scripts/migration-policy.mjs verify && node pop/scripts/migration-policy-contract.mjs", "db:migration-policy contract changed");
assert(packageJson.scripts?.["db:contract-check"] === "pnpm db:migration-policy && node pop/scripts/db-contract-check.mjs", "db:contract-check must run migration policy first");

const envExample = await readFile(".env.example", "utf8");
assert(
  envExample === "MIGRATION_DATABASE_URL=<postgresql-migrator-url>\nDATABASE_URL=<postgresql-runtime-url>\nNAUTT_ENCRYPTION_KEY=<32-byte-base64url-key>\nNAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks\nNAUTT_API_BASE_URL=<optional-https-override-default-https://api.nauttfinance.com/api/v2>\n",
  ".env.example must contain only the documented non-usable placeholders",
);
const prismaConfig = await readFile("prisma.config.ts", "utf8");
const runtimeClient = await readFile("src/db/client.ts", "utf8");
assert(prismaConfig.includes("process.env.MIGRATION_DATABASE_URL") && !prismaConfig.includes("process.env.DATABASE_URL"), "Prisma config must consume only the migration URL");
assert(runtimeClient.includes("process.env.DATABASE_URL") && !runtimeClient.includes("MIGRATION_DATABASE_URL"), "Runtime client must consume only the runtime URL");

const gitignore = await readFile(".gitignore", "utf8");
assert(gitignore.split("\n").includes("src/generated/prisma/"), "Generated Prisma output is not ignored");
const schema = await readFile("prisma/schema.prisma", "utf8");
for (const model of ["DatabaseFoundationFixture", "User", "PasswordCredential", "NauttCredential", "DeploymentBootstrap", "Session", "GlobalPaymentSettings", "ProviderQuote", "ProviderOrder", "WebhookDelivery", "WebhookDeliveryAttempt", "WebhookRecoveryLease", "CatalogCurrencyPair", "CatalogPaymentMethod", "Product", "ProductCategory", "PaymentLink", "PaymentLinkOrder", "CheckoutAttempt", "PaymentLinkSingleUseSettlement", "MediaObject"]) {
  assert(schema.includes(`model ${model}`), `Schema is missing ${model}`);
}
assert(schema.includes('output   = "../src/generated/prisma"'), "Generated output changed");

const migrationDirectories = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
assert(migrationDirectories.length >= 19, "Migration history lost its pinned baseline");
const migration = await readFile("prisma/migrations/20260714000000_foundation_baseline/migration.sql", "utf8");
for (const constraint of ["database_foundation_fixture_key_key", "database_foundation_fixture_key_nonblank", "database_foundation_fixture_quantity_nonnegative"]) {
  assert(migration.includes(constraint), `Migration lost ${constraint}`);
}
const identityMigration = await readFile("prisma/migrations/20260714190000_local_identities/migration.sql", "utf8");
for (const contract of ["user_username_key", "user_username_canonical", "user_email_key", "user_email_canonical", "user_role_closed", "user_status_closed", "password_credential_hash_format", "deployment_bootstrap_singleton", "reject_deployment_bootstrap_mutation", "initial_admin_user_id"]) {
  assert(identityMigration.includes(contract), `Identity migration lost ${contract}`);
}
assert(/username\s+String/.test(schema) && /email\s+String\?/.test(schema), "Prisma identity fields must be required username and nullable email");
assert(!/FOREIGN KEY \("initial_admin_user_id"\)/.test(identityMigration), "Deployment locator must not have a foreign key");
const sessionMigration = await readFile("prisma/migrations/20260716110000_database_sessions/migration.sql", "utf8");
for (const contract of ["session_token_digest_key", "session_user_fkey", "session_user_created_at_id_idx", "absolute_expires_at", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(sessionMigration.includes(contract), `Session migration lost ${contract}`);
}
assert(!/raw_token|plaintext|token_value/i.test(sessionMigration), "Session migration may store a bearer token");
const localeMigration = await readFile("prisma/migrations/20260716160000_user_language_preference/migration.sql", "utf8");
assert(schema.includes('preferredLocale String?') && schema.includes('@map("preferred_locale")'), "Schema is missing the nullable preferred locale field");
for (const contract of ["preferred_locale", "user_preferred_locale_check", "'pt-BR'", "'en'", 'GRANT SELECT, UPDATE ("preferred_locale")']) {
  assert(localeMigration.includes(contract), `Language preference migration lost ${contract}`);
}
const settingsMigration = await readFile("prisma/migrations/20260716180000_global_payment_settings/migration.sql", "utf8");
assert(schema.includes("model GlobalPaymentSettings") && schema.includes("paymentMethods String[]"), "Schema is missing global payment settings");
for (const contract of ["global_payment_settings_singleton", "global_payment_settings_currencies_closed", "global_payment_settings_payment_methods_closed", "'BRL'", "'PIX'", 'GRANT SELECT, UPDATE ("currencies", "payment_methods", "updated_at")']) {
  assert(settingsMigration.includes(contract), `Payment settings migration lost ${contract}`);
}
const settingsAclMigration = await readFile("prisma/migrations/20260716210000_restrict_global_payment_settings_runtime/migration.sql", "utf8");
for (const contract of ["REVOKE ALL PRIVILEGES", "GRANT SELECT", 'GRANT UPDATE ("currencies", "payment_methods", "updated_at")']) {
  assert(settingsAclMigration.includes(contract), `Payment settings ACL migration lost ${contract}`);
}
assert(!/GRANT\s+(?:INSERT|DELETE)|GRANT\s+UPDATE\s+ON/i.test(settingsAclMigration), "Payment settings ACL migration grants excess table writes");

const nauttCredentialMigration = await readFile("prisma/migrations/20260717190000_nautt_credentials/migration.sql", "utf8");
assert(schema.includes("model NauttCredential") && schema.includes("nauttCredential  NauttCredential?"), "Schema is missing the user/nautt credential relation");
for (const contract of ["nautt_credential_pkey", "nautt_credential_user_fkey", "encrypted_api_key", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(nauttCredentialMigration.includes(contract), `Nautt credential migration lost ${contract}`);
}
const nauttWebhookMigration = await readFile("prisma/migrations/20260717210000_nautt_webhook_registration/migration.sql", "utf8");
for (const contract of ["webhook_registration_state", "provider_webhook_id", "encrypted_webhook_secret", "webhook_registered_at", "nautt_credential_webhook_registration_state_closed", "nautt_credential_webhook_active_tuple_complete"]) {
  assert(nauttWebhookMigration.includes(contract), `Nautt webhook migration lost ${contract}`);
}
for (const field of ["webhookRegistrationState", "providerWebhookId", "encryptedWebhookSecret", "webhookRegisteredAt"]) {
  assert(schema.includes(field), `Schema is missing Nautt webhook field ${field}`);
}
assert(!/GRANT|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(nauttWebhookMigration), "Nautt webhook migration must not change grants or ownership");
const nauttRevisionMigration = await readFile("prisma/migrations/20260717230000_nautt_credential_revision/migration.sql", "utf8");
for (const contract of ["credential_revision", "gen_random_uuid()", "SET NOT NULL", "nautt_credential_credential_revision_key"]) {
  assert(nauttRevisionMigration.includes(contract), `Nautt revision migration lost ${contract}`);
}
assert(schema.includes("credentialRevision") && schema.includes('@db.Uuid'), "Schema is missing the UUID credential revision");
assert(!/GRANT|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(nauttRevisionMigration), "Nautt revision migration must not change grants or ownership");

const providerOrderMigration = await readFile("prisma/migrations/20260718010000_provider_orders/migration.sql", "utf8");
for (const contract of ["provider_quote_pkey", "provider_quote_quote_uuid_owner_id_key", "provider_order_quote_uuid_key", "provider_order_provider_order_uuid_key", "provider_order_quote_owner_fkey", "provider_order_creation_state_closed", "provider_order_status_closed", "provider_order_decimal_lexemes", "provider_order_creation_tuple", "provider_order_version_nonnegative", "provider_order_owner_status_idx", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(providerOrderMigration.includes(contract), `Provider order migration lost ${contract}`);
}
assert(schema.includes("model ProviderQuote") && schema.includes("model ProviderOrder") && schema.includes("reconciliationVersion"), "Schema is missing durable provider orders");
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(providerOrderMigration), "Provider order migration grants excess privileges or changes ownership");

const webhookDeliveryMigration = await readFile("prisma/migrations/20260718030000_nautt_webhook_deliveries/migration.sql", "utf8");
for (const contract of ["webhook_delivery_owner_fkey", "webhook_delivery_order_owner_fkey", "webhook_delivery_event_closed", "webhook_delivery_decision_closed", "webhook_delivery_digest_lower_hex", "webhook_delivery_provider_attempt_positive", "webhook_delivery_processing_attempt_positive", "webhook_delivery_lease_consistent", "webhook_delivery_attempt_number_positive", "webhook_delivery_attempt_provider_number_positive", "webhook_delivery_attempt_digest_lower_hex", "webhook_delivery_attempt_outcome_closed", "webhook_delivery_attempt_completion_consistent", "webhook_delivery_attempt_delivery_number_key", "GRANT SELECT, INSERT, UPDATE, DELETE", "GRANT USAGE ON SEQUENCE"]) {
  assert(webhookDeliveryMigration.includes(contract), `Webhook delivery migration lost ${contract}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(webhookDeliveryMigration), "Webhook delivery migration grants excess privileges or changes ownership");

const webhookRecoveryMigration = await readFile("prisma/migrations/20260718050000_nautt_webhook_recovery/migration.sql", "utf8");
for (const contract of ["webhook_delivery_evidence_source_closed", "webhook_delivery_evidence_consistent", "webhook_delivery_attempt_evidence_source_closed", "webhook_delivery_attempt_evidence_consistent", "webhook_recovery_lease_order_owner_fkey", "webhook_recovery_lease_order_owner_key", "webhook_recovery_lease_expiry_idx", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(webhookRecoveryMigration.includes(contract), `Webhook recovery migration lost ${contract}`);
}
for (const field of ["evidenceSource", "providerWebhookUuid", "providerIsDelivered", "providerIsPermanentlyFailed", "WebhookRecoveryLease"]) {
  assert(schema.includes(field), `Schema is missing webhook recovery field ${field}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(webhookRecoveryMigration), "Webhook recovery migration grants excess privileges or changes ownership");

const nauttCatalogMigration = await readFile("prisma/migrations/20260720230000_nautt_catalog/migration.sql", "utf8");
assert(schema.includes("model CatalogCurrencyPair") && schema.includes("model CatalogPaymentMethod"), "Schema is missing catalog models");
for (const contract of ["catalog_currency_pair_pkey", "catalog_currency_pair_uuids_key", "catalog_payment_method_pkey", "catalog_payment_method_uuid_key", 'GRANT SELECT, INSERT, UPDATE, DELETE']) {
  assert(nauttCatalogMigration.includes(contract), `Nautt catalog migration lost ${contract}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(nauttCatalogMigration), "Nautt catalog migration grants excess privileges or changes ownership");

const productMigration = await readFile("prisma/migrations/20260721010000_products/migration.sql", "utf8");
for (const contract of ["product_pkey", "product_internal_name_bounds", "product_internal_name_single_line", "product_title_pt_br_bounds", "product_title_pt_br_single_line", "product_title_en_bounds", "product_title_en_single_line", "product_description_pt_br_bounds", "product_description_en_bounds", "product_price_canonical", "product_version_nonnegative", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(productMigration.includes(contract), `Product migration lost ${contract}`);
}
for (const field of ["internalName", "titlePtBr", "titleEn", "descriptionPtBr", "descriptionEn", "price", "active", "version"]) {
  assert(schema.includes(field), `Schema is missing product field ${field}`);
}
assert(productMigration.includes("[1-9][0-9]{0,11}") && productMigration.includes("[0-9]{0,5}[1-9]"), "Product price grammar lost its 18/6 canonical bounds");
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(productMigration), "Product migration grants excess privileges or changes ownership");

const paymentLinkMigration = await readFile("prisma/migrations/20260721020000_payment_links/migration.sql", "utf8");
for (const contract of ["payment_link_pkey", "payment_link_identifier_key", "payment_link_identifier_url_safe", "payment_link_type_closed", "payment_link_product_fkey", "payment_link_currency_pair_fkey", "payment_link_created_at_id_idx", "payment_link_product_id_idx", "payment_link_currency_pair_id_idx", "payment_link_require_active_dependencies", "FOR SHARE", "payment_link_product_active", "payment_link_currency_pair_active", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(paymentLinkMigration.includes(contract), `Payment-link migration lost ${contract}`);
}
for (const field of ["identifier", "productId", "currencyPairId", "linkType", "expiresAt", "paymentLinks"]) {
  assert(schema.includes(field), `Schema is missing payment-link field ${field}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(paymentLinkMigration), "Payment-link migration grants excess privileges or changes ownership");

const ownerIsolationMigration = await readFile("prisma/migrations/20260721030000_owner_isolation_checkout_policy/migration.sql", "utf8");
for (const contract of ["owner isolation migration requires empty product and payment_link tables", "checkout_data_policy", "user_checkout_data_policy_closed", "product_owner_fkey", "product_id_owner_id_key", "product_owner_internal_name_id_idx", "payment_link_owner_fkey", "payment_link_product_owner_fkey", "payment_link_owner_created_at_id_idx", "GRANT SELECT, UPDATE (\"checkout_data_policy\")"]) {
  assert(ownerIsolationMigration.includes(contract), `Owner-isolation migration lost ${contract}`);
}
for (const field of ["checkoutDataPolicy", "ownerId", "owner           User", "productId, ownerId"]) {
  assert(schema.includes(field), `Schema is missing owner-isolation field ${field}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(ownerIsolationMigration), "Owner-isolation migration grants excess privileges or changes ownership");

const paymentLinkOrderMigration = await readFile("prisma/migrations/20260721040000_payment_link_orders/migration.sql", "utf8");
for (const contract of ["payment_link_id_owner_id_key", "payment_link_id_owner_product_id_key", "payment_link_order_pkey", "payment_link_order_id_owner_id_key", "payment_link_order_product_price_canonical", "payment_link_order_policy_closed", "payment_link_order_snapshot_tuple", "payment_link_order_brazil_address", "payment_link_order_state_closed", "payment_link_order_settlement_consistent", "payment_link_order_link_owner_product_fkey", "payment_link_order_product_owner_fkey", "provider_order_payment_link_order_id_key", "provider_order_payment_link_order_owner_key", "provider_order_payment_link_order_owner_fkey", "payment_link_single_use_settlement_pkey", "payment_link_single_use_settlement_order_key", "payment_link_single_use_settlement_order_owner_key", "payment_link_single_use_settlement_link_owner_fkey", "payment_link_single_use_settlement_order_owner_fkey", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(paymentLinkOrderMigration.includes(contract), `Payment-link order migration lost ${contract}`);
}
for (const field of ["PaymentLinkOrder", "PaymentLinkSingleUseSettlement", "paymentLinkOrderId", "lifecycleVersion", "checkoutDataPolicy", "paymentLinkId, ownerId, productId"]) {
  assert(schema.includes(field), `Schema is missing payment-link order field ${field}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(paymentLinkOrderMigration), "Payment-link order migration grants excess privileges or changes ownership");

const checkoutAttemptMigration = await readFile("prisma/migrations/20260721050000_public_checkout_attempts/migration.sql", "utf8");
for (const contract of ["checkout_attempt_pkey", "checkout_attempt_link_retry_key_verifier_key", "checkout_attempt_payment_link_order_id_key", "checkout_attempt_retry_key_verifier_hex", "checkout_attempt_request_verifier_hex", "checkout_attempt_capability_verifier_hex", "checkout_attempt_state_closed", "checkout_attempt_link_owner_fkey", "checkout_attempt_order_owner_fkey", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(checkoutAttemptMigration.includes(contract), `Checkout attempt migration lost ${contract}`);
}
assert(schema.includes("model CheckoutAttempt") && schema.includes("capabilityVerifier"), "Schema is missing durable checkout attempts");
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(checkoutAttemptMigration), "Checkout attempt migration grants excess privileges or changes ownership");

const storefrontMigration = await readFile("prisma/migrations/20260721060000_storefront_settings/migration.sql", "utf8");
for (const contract of ["storefront_slug", "storefront_display_name_pt_br", "storefront_display_name_en", "storefront_accent_color", "storefront_enabled", "user_storefront_slug_key", "user_storefront_slug_format", "user_storefront_display_name_pt_br_single_line", "user_storefront_display_name_en_single_line", "user_storefront_accent_color_format", "user_storefront_enabled_requires_slug", "GRANT SELECT, UPDATE (\"storefront_slug\", \"storefront_display_name_pt_br\", \"storefront_display_name_en\", \"storefront_accent_color\", \"storefront_enabled\")"]) {
  assert(storefrontMigration.includes(contract), `Storefront settings migration lost ${contract}`);
}
for (const field of ["storefrontSlug", "storefrontDisplayNamePtBr", "storefrontDisplayNameEn", "storefrontAccentColor", "storefrontEnabled"]) {
  assert(schema.includes(field), `Schema is missing storefront field ${field}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER|INSERT|DELETE)|ALTER\s+(?:TABLE|SCHEMA).*OWNER/i.test(storefrontMigration), "Storefront settings migration grants excess privileges or changes ownership");

const mediaMigration = await readFile("prisma/migrations/20260723233000_media_objects/migration.sql", "utf8");
for (const contract of ["media_object_pkey", "media_object_identifier_key", "media_object_storage_key_key", "media_object_owner_fkey", "media_object_purpose_closed", "media_object_state_closed", "media_object_revision_nonnegative", "media_object_canonical_limits", "media_object_purge_consistent", "media_object_owner_purpose_state_idx", "media_object_state_purge_after_idx", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(mediaMigration.includes(contract), `Media migration lost ${contract}`);
}
for (const field of ["identifier", "storageKey", "ownerId", "purpose", "state", "lifecycleRevision", "mimeType", "byteSize", "sha256", "purgeAfter"]) {
  assert(schema.includes(field), `Schema is missing media field ${field}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*\sOWNER\s+TO/i.test(mediaMigration), "Media migration grants excess privileges or changes ownership");

const categoryMigration = await readFile("prisma/migrations/20260724010000_owner_product_categories/migration.sql", "utf8");
for (const contract of ["product_category_pkey", "product_category_id_owner_id_key", "product_category_owner_name_pt_br_key", "product_category_owner_name_en_key", "product_category_owner_fkey", "product_category_version_nonnegative", "product_category_owner_active_name_idx", "category_id", "product_category_owner_fkey", "product_owner_category_id_idx", "GRANT SELECT, INSERT, UPDATE, DELETE"]) {
  assert(categoryMigration.includes(contract), `Product-category migration lost ${contract}`);
}
for (const field of ["model ProductCategory", "categoryId", "namePtBr", "nameEn", "productCategories"]) {
  assert(schema.includes(field), `Schema is missing product-category field ${field}`);
}
assert(!/GRANT\s+(?:TRUNCATE|REFERENCES|TRIGGER)|ALTER\s+(?:TABLE|SCHEMA).*\sOWNER\s+TO/i.test(categoryMigration), "Product-category migration grants excess privileges or changes ownership");

const bootstrap = await readFile("prisma/bootstrap.sql", "utf8");
assert(bootstrap.includes("GRANT CONNECT ON DATABASE qr_pagamentos TO qr_migrator, qr_runtime"), "Both roles require explicit CONNECT");
assert(bootstrap.includes("ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA app"), "Migrator-scoped defaults are missing");
assert(bootstrap.includes("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO qr_runtime"), "Ordinary-table runtime DML changed");
for (const contract of ["to_regclass('app.global_payment_settings') IS NOT NULL", "REVOKE ALL PRIVILEGES ON TABLE app.global_payment_settings", "GRANT SELECT ON TABLE app.global_payment_settings", "GRANT UPDATE (currencies, payment_methods, updated_at)"]) {
  assert(bootstrap.includes(contract), `Bootstrap payment settings ACL lost ${contract}`);
}
assert(!/\bPASSWORD\s+['"]|postgres(?:ql)?:\/\//i.test(bootstrap), "Bootstrap must not contain credentials or URLs");

const readme = await readFile("README.md", "utf8");
for (const contract of ["pnpm db:generate", "pnpm db:test", "pnpm db:contract-check", "MIGRATION_DATABASE_URL", "DATABASE_URL", "startup gating", "application-only liveness"]) {
  assert(readme.includes(contract), `README is missing ${contract}`);
}
const rootDox = await readFile("AGENTS.md", "utf8");
const prismaDox = await readFile("prisma/AGENTS.md", "utf8");
assert(rootDox.includes("prisma/AGENTS.md") && rootDox.includes("src/generated/prisma/"), "Root DOX routing is incomplete");
for (const contract of ["Never use `db push`", "immutable baseline", "migration.safe.json", "pnpm db:migration-policy", "Never represent raw SQL"]) {
  assert(prismaDox.includes(contract), `Prisma DOX migration contract is missing ${contract}`);
}

console.log("PASS documentation-contract");
