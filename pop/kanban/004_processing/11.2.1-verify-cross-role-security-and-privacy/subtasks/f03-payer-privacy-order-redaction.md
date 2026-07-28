# F03 — Payer privacy and order redaction

## Objetivo

Garantir que snapshots de pagador e estados internos de order não vazem em projeções públicas, de admin ou de owner.

## Escopo

- Verificar `CustomerSnapshotV1` guard em `order-v2-view.ts` e `order-view.ts`.
- Auditar analytics, checkout attempts, webhook intake, public storefront.
- Garantir que UUIDs internos, verifiers, capability material e provider data não aparecem em DTOs públicos.

## Critérios

- Nenhuma projeção pública/admin/owner expõe snapshot completo do pagador.
- Nenhuma projeção expõe verifier, capability, retry key ou provider data.
- Testes cobrem as projeções afetadas.

## Critérios de aceite

- Nenhuma projeção pública/admin/owner expõe snapshot completo do pagador.
- Nenhuma projeção expõe verifier, capability, retry key ou provider data.
- Testes cobrem orders, checkout, integrations/nautt, pay e store.

## Specs

- [[pop/specs/product-scope|Product scope]]

## Não editar

Projeções existentes, salvo para corrigir falha severity-1.
