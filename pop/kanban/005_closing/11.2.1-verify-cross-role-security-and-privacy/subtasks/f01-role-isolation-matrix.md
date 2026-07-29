# F01 — Role-isolation matrix

## Objetivo

Garantir que `ADMIN` e `USER` não acessem rotas ou fatos um do outro, e que rotas públicas/sessionless não aceitem cookies de forma equivocada.

## Escopo

- Revisar/expandir testes de `src/app/admin*/`, `src/app/(merchant)/`, `src/app/admin-access/`, `src/app/login/`, `src/app/logout/`.
- Validar que toda rota cookie-autenticada retorna 401/403 vazio antes de parsing ou service work.
- Validar que `/admin-access` responde 204/401/403 conforme role/status.

## Critérios

- Testes de admin routes rejeitam merchant session com 403.
- Testes de merchant routes rejeitam admin session com 403.
- Testes de login/logout preservam redirecionamentos e cookies.

## Critérios de aceite

- Admin routes rejeitam merchant session com 403 vazio.
- Merchant routes rejeitam admin session com 403 vazio.
- `/admin-access` responde 204/401/403 conforme role/status.
- Login/logout preservam cookies e redirecionamentos.

## Specs

- [[pop/specs/administrative-foundation|Administrative foundation]]

## Não editar

Rotas/services existentes, salvo para corrigir falha severity-1.
