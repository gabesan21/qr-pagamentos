# Public checkout visual review

- Run: `20260729023217`
- Manifest SHA-256: `b1fd0fcd69b00534f3cc8c8d63f4426ac4b482bbb43ce5cb9fc013b5080a2abe`
- Grid: six persisted merchant themes × two locales × 375/768/1440 branded checkout captures, mirrored by the 9.3.2 paid terminal grid (both composition kinds: the consumed product-lines link and the consumed fixed-amount link) under the same themes, locales, and widths, plus nineteen localized state captures covering both compositions, all five policy variants, 320-pixel reflow, inline validation, submit-pending, the opaque checkout error, QR/copy feedback, waiting-for-payment-data, status-error with manual retry, both terminal badges, the expired-capability opaque unavailable, the unknown/inactive/expired opaque unavailable views, and the unbranded paid view with the non-color paid marker.
- The paid terminal views are claim-keyed: every consumed order is flipped to REFUNDED before any paid capture, and one consumed link carries a past expiry — the paid view persists unchanged in both cases, proving the persisted settlement claim (never live order state, active flag, or expiry) is the only consumption signal.
- Branding resolves from the owner's persisted settings with the storefront disabled: the real settings workspace saves the display names, accent, and logo, and the checkout renders them through the scoped theme mechanism.
- QR, polling, and terminal states run against checkout_attempt_v2/order_v2/provider_order rows seeded directly in the disposable database with the capability HMAC computed from the harness's own disposable NAUTT_ENCRYPTION_KEY; no provider call occurs in the run.
- The loading skeleton and the render error state are structural states without an honest runtime capture; they ship as route-level loading.tsx/error.tsx and are exercised only by unit-level rendering.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- Visual findings requiring correction: none.
