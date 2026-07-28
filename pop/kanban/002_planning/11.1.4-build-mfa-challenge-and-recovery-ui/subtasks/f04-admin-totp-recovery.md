# Frente F04 — Admin TOTP recovery affordance — [[11.1.4-build-mfa-challenge-and-recovery-ui]]

- **Entrega:** Ação de remoção de TOTP na página `/admin/accounts/[id]` para alvos não deletados.
- **Escopo:** Adicionar card "Security actions" com `<details>` nativo de confirmação destrutiva. O summary explica que a ação remove TOTP, revoga sessões e requer nova inscrição. O form POSTa para `/admin/users/[id]/totp-disable`. Mostrar mensagem de sucesso/erro através do query param `editor` já existente.
- **Responsável:** agent.
- **Owns:** `src/app/admin/accounts/[id]/page.tsx` e componentes locais.
- **May read:** `src/app/admin/users/[id]/totp-disable/route.ts`, `src/app/admin/accounts/[id]/`.
- **Must not edit:** `src/app/admin/users/[id]/totp-disable/route.ts`.
- **Depends on:** nenhuma.
- **Skills:** [[pop/skills/ui-change|ui-change]].
- **Critérios:** 5, 7.

## Contrato de execução

- Entregar somente o escopo e os critérios desta frente.
- Não criar ação para targets deletados.
- Não alterar rotas ou serviços de admin.

## Resultado

- **Status:** pendente.
- **Commit/artefato:** —
- **Arquivos alterados:** —
- **Desvios:** nenhum.
- **Evidência:** —
