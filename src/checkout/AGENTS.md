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
