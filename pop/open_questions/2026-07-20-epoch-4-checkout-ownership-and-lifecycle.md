---
status: respondida
origem: projeto
created: 2026-07-20
---

# Define checkout ownership and the payment-link lifecycle before Epoch 4

The delivered PaymentLink model is administrator-managed and has no owner, while the product scope requires users to own products, links, and resulting orders. Public checkout must derive exactly one owner credential from persistent link data; it cannot accept an owner, price, provider UUID, or quote from the browser. The Nautt protocol also leaves customer/deposit fields and ambiguous provider-create recovery undocumented.

Please decide:

1. Should Epoch 4 migrate existing products and links to a required owner account, with administrators managing all owners' records, or should payment links remain centrally owned by the administrator credential?
2. For a `SINGLE_USE` link, should a provider-order attempt reserve the link immediately (failed/indeterminate attempts remain unavailable), or should only a confirmed successful payment consume it? The first is safer against duplicate charges; the second preserves retries but needs a durable concurrency/recovery design.
3. What buyer/deposit data must checkout collect before Nautt order creation? If none is required, Epoch 4 can use only the existing exact amount and configured currency pair; otherwise list the required fields.

## Response (user)

2026-07-21:

1. Products and payment links are owned by the user who creates them. Users cannot view each other's products or payment links. There is no released or existing data to migrate.
2. A single-use link is consumed when the final customer makes a confirmed payment, or it expires if an expiry applies. Failed and pending attempts do not consume it.
3. Customer data is configured in the owner's administrative area. The default policy requests no data. Available choices are no data; name and email; email only; name, email, and CPF; and name, email, CPF, and address.
