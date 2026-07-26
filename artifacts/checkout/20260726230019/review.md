# Public checkout visual review

- Run: `20260726230019`
- Manifest SHA-256: `b286a0e25d61b80ab9bdfba8ace59508ad8debc39282d0d6523060c7bd9f8d39`
- Grid: six persisted merchant themes × two locales × 375/768/1440 branded checkout captures, plus sixteen localized state captures covering both compositions, all five policy variants, 320-pixel reflow, inline validation, submit-pending, the opaque checkout error, QR/copy feedback, waiting-for-payment-data, status-error with manual retry, both terminal badges, the expired-capability opaque unavailable, and the unknown/consumed-single-use opaque unavailable views.
- Branding resolves from the owner's persisted settings with the storefront disabled: the real settings workspace saves the display names, accent, and logo, and the checkout renders them through the scoped theme mechanism.
- QR, polling, and terminal states run against checkout_attempt_v2/order_v2/provider_order rows seeded directly in the disposable database with the capability HMAC computed from the harness's own disposable NAUTT_ENCRYPTION_KEY; no provider call occurs in the run.
- The loading skeleton and the render error state are structural states without an honest runtime capture; they ship as route-level loading.tsx/error.tsx and are exercised only by unit-level rendering.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- Visual findings requiring correction: none.
