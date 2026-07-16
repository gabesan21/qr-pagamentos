REVOKE ALL PRIVILEGES ON TABLE "app"."global_payment_settings" FROM qr_runtime;

GRANT SELECT ON TABLE "app"."global_payment_settings" TO qr_runtime;
GRANT UPDATE ("currencies", "payment_methods", "updated_at")
ON TABLE "app"."global_payment_settings" TO qr_runtime;
