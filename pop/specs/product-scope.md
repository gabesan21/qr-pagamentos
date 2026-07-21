# Spec - Product scope

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[ROADMAP|Epochs 1-5]]
- **Status:** aprovada
- **Created:** 2026-07-13
- **Updated:** 2026-07-21 — task 4.1.1 delivered owner isolation and the account checkout-data policy; task 4.3.1 delivered owner order inspection and read-only administrator order inspection.

## What it covers

This spec defines the user-visible MVP boundaries for QR Pagamentos. Detailed provider protocols, data models, visual tokens, and operational procedures belong to focused specs and tasks.

## Requirements

- An administrator can configure the central webhook destination and database-backed Nautt currency/payment-method records; each enabled record carries the exact provider UUID required by pricing, and no provider UUID is sourced from environment variables.
- An administrator can create, read, update, and disable users and inspect their orders.
- A user can store a Nautt API key, automatically register the system's central webhook, and view the Nautt main-wallet balance on the same settings screen.
- A user can create, update, and remove products in currencies enabled by the administrator's active Nautt currency records.
- A user can create, activate, and deactivate owned payment links.
- Every product and payment link has exactly one user owner. A payment link may reference only a product with that same owner; no user can read or mutate another user's products, links, checkout policy, or orders.
- Administrators manage users and the global Nautt catalog, but that authority does not create an implicit cross-owner product or payment-link management path.
- A payment link contains products in exactly one currency; products with different currencies cannot coexist in one link.
- A single-use link remains available through unsuccessful or pending attempts, accepts at most one confirmed successful payment, and cannot start checkout after its expiry.
- A reusable link accepts payments from multiple customers until its owner disables it.
- A user can inspect orders generated through owned payment links.
- An unauthenticated customer can open an active payment link and complete its checkout.
- Each user controls an account-level customer-data policy for public checkout. Its default is no requested data; the supported choices are no data, name and email, email only, name/email/CPF, and name/email/CPF/address.
- Each order retains the customer data actually collected for its checkout under the policy in force when that checkout started.
- A user can optionally publish a product page where customers select products and continue to a generated checkout.
- Every authenticated and public interface supports `pt-BR` and English.
- The complete MVP runs through a documented self-hosted Docker deployment.

## Out of scope

- Nautt-hosted payment links are forbidden; QR Pagamentos owns the link and checkout experience.
- Providers other than Nautt Finance are not part of the MVP.
- Native mobile applications are not part of the MVP.

## Open

- Is the admin-configured webhook URL the public receiver registered with Nautt, or a downstream destination that receives forwarded events?
- Which names, display metadata, enablement rules, and uniqueness constraints accompany the administrator-entered Nautt currency/payment-method UUID records?
- Can a product price be edited after links already reference the product, or must links snapshot name and price?
- What happens to in-flight orders when a reusable link is disabled?

## Related specs

- [[specs/administrative-foundation|Administrative foundation]] - follow when implementing runtime, users, settings, or the initial admin UI.
- [[specs/nautt-finance-integration|Nautt Finance integration]] - follow when work touches API credentials, orders, polling, or webhooks.
- [[specs/checkout-and-order-lifecycle|Checkout and order lifecycle]] - follow when work touches public checkout, customer data, or order state.
