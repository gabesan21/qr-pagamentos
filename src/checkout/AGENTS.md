# Public checkout orchestration contract

- Scope: sessionless server checkout reservation, replay fencing, and redacted payment-capability issuance/status validation.
- Read the repository-root [`AGENTS.md`](../../AGENTS.md) before editing this subtree.
- [`../../pop/specs/checkout-and-order-lifecycle.md`](../../pop/specs/checkout-and-order-lifecycle.md) — follow when changing trusted inputs, customer snapshots, retry/capability semantics, or local payment state.
- [`../integrations/nautt/AGENTS.md`](../integrations/nautt/AGENTS.md) — follow when changing quote/order dispatch or indeterminate handling.

## Boundary

- Never accept browser owner, amount, provider UUID, credential, local order ID, or capability status; derive each from a locked persisted link.
- Persist only keyed retry/request/capability verifiers; never log or store the retry key, bearer, customer snapshot serialization, or provider envelope.
- A duplicate exact request may reissue its existing unexpired, unrevoked capability only; it must never quote, attach, recover, or dispatch Nautt again.
- Never hold a database transaction across provider I/O, release a dispatched attempt, retry an onramp POST, or turn an ambiguous attempt into a new creation.
- Keep public outcomes redacted and no-store; browser UI/polling, owner views, and explicit recovery belong to separate approved tasks.
- `app.checkout_attempt_v2` (8.1.3) rebinds the same reservation, replay-verifier, and capability columns to V2 link and order identities; every fence above applies to it unchanged, and 9.3.1 owns its public checkout wiring.
- `standalone-checkout.ts` and `standalone-payment-status.ts` (9.2.1) own the sessionless standalone-payment pair behind `POST /api/store/[slug]/checkout` + `/status`: the browser supplies only the slug, an opaque retry key, the canonical-grammar amount string, and the customer snapshot; owner, policy, registry pair, the fixed bilingual description constant, and the 24-hour capability TTL derive from locked persisted state inside the reservation transaction (owner `FOR UPDATE`, registry pair `FOR SHARE`). Replay uniqueness is `(owner_id, retry_key_verifier)` on `app.standalone_checkout_attempt`; a replay reissues the capability only while unexpired, unrevoked, and both storefront toggles stay enabled, and every slug/toggle/currency failure is the one opaque 404 with never a BRL fallback. `createStandaloneOrderRow` in `src/orders/order-v2.ts` is the only place standalone rows are shaped.
- `storefront-cart-checkout.ts` (9.1.3) owns the sessionless cart issuance behind `POST /api/store/[slug]/cart/checkout`: the browser cart contributes only product identity and quantity (never price, currency, or title; a `custom-amount` member is the opaque invalid); owner, products, and registry pair revalidate under shared row locks, only an enabled storefront of an `ACTIVE` merchant `USER` resolves, every line's product code ?? store default must be one identical active-mapped code, and issuance reuses `src/auth/payment-link-v2.ts` server-side with a principal synthesized from the locked owner row (never authority beyond it). One command issues one active `SINGLE_USE` `PRODUCT_LINES` link with null expiry — no cart table, order, attempt, capability, or provider call at issuance (9.3.1 consumes the link); thrown issuance faults propagate, never a mapped body.
