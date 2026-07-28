# Frente F03 — Profile TOTP security section — [[11.1.4-build-mfa-challenge-and-recovery-ui]]

- **Entrega:** Seção de segurança TOTP no perfil merchant com estados `none`/`pending`/`active`.
- **Escopo:** Estender `ProfileManagement` com card "TOTP security". Estado `none`: botão enroll que posta para `/profile/totp/enroll` e exibe QR + recovery codes (usando biblioteca `qrcode`). Estado `pending`: form de confirmação com senha atual e primeiro código. Estado `active`: indicador ativo, formulário de desativação (senha + código/recovery), e botão regenerar códigos. Todos os formulários nativos; client boundaries observam submit/formdata para busy state.
- **Responsável:** agent.
- **Owns:** `src/app/profile/profile-management.tsx`, `src/app/profile/totp-section.tsx`, componentes auxiliares em `src/app/profile/totp/`.
- **May read:** `src/app/profile/profile-form.tsx`, `src/app/(merchant)/profile/page.tsx`.
- **Must not edit:** rotas de backend 11.1.3.
- **Depends on:** F01.
- **Skills:** [[pop/skills/ui-change|ui-change]].
- **Critérios:** 1, 2, 5, 6, 7.

## Contrato de execução

- Entregar somente o escopo e os critérios desta frente.
- Não interceptar POSTs; usar native form events.
- Recovery codes nunca reaparecem após saída da tela; regeneração invalida os anteriores.

## Resultado

- **Status:** pendente.
- **Commit/artefato:** —
- **Arquivos alterados:** —
- **Desvios:** nenhum.
- **Evidência:** —
