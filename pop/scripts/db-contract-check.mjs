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

const envExample = await readFile(".env.example", "utf8");
assert(
  envExample === "MIGRATION_DATABASE_URL=<postgresql-migrator-url>\nDATABASE_URL=<postgresql-runtime-url>\nNAUTT_ENCRYPTION_KEY=<32-byte-base64url-key>\nNAUTT_WEBHOOK_CALLBACK_URL=https://payments.example.com/api/nautt/webhooks\n",
  ".env.example must contain only the documented non-usable placeholders",
);
const prismaConfig = await readFile("prisma.config.ts", "utf8");
const runtimeClient = await readFile("src/db/client.ts", "utf8");
assert(prismaConfig.includes("process.env.MIGRATION_DATABASE_URL") && !prismaConfig.includes("process.env.DATABASE_URL"), "Prisma config must consume only the migration URL");
assert(runtimeClient.includes("process.env.DATABASE_URL") && !runtimeClient.includes("MIGRATION_DATABASE_URL"), "Runtime client must consume only the runtime URL");

const gitignore = await readFile(".gitignore", "utf8");
assert(gitignore.split("\n").includes("src/generated/prisma/"), "Generated Prisma output is not ignored");
const schema = await readFile("prisma/schema.prisma", "utf8");
for (const model of ["DatabaseFoundationFixture", "User", "PasswordCredential", "NauttCredential", "DeploymentBootstrap", "Session", "GlobalPaymentSettings", "ProviderQuote", "ProviderOrder", "WebhookDelivery", "WebhookDeliveryAttempt", "WebhookRecoveryLease"]) {
  assert(schema.includes(`model ${model}`), `Schema is missing ${model}`);
}
assert(schema.includes('output   = "../src/generated/prisma"'), "Generated output changed");

const migrationDirectories = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
assert(JSON.stringify(migrationDirectories) === JSON.stringify(["20260714000000_foundation_baseline", "20260714190000_local_identities", "20260716110000_database_sessions", "20260716160000_user_language_preference", "20260716180000_global_payment_settings", "20260716210000_restrict_global_payment_settings_runtime", "20260717190000_nautt_credentials", "20260717210000_nautt_webhook_registration", "20260717230000_nautt_credential_revision", "20260718010000_provider_orders", "20260718030000_nautt_webhook_deliveries", "20260718050000_nautt_webhook_recovery"]), "Migration history name/count changed");
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
assert(prismaDox.includes("Never use `db push`") && prismaDox.includes("immutable"), "Prisma DOX migration contract is incomplete");

console.log("PASS documentation-contract");
