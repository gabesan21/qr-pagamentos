# F05 — Reset/MFA abuse and observability redaction

## Objetivo

Provar que reset de senha e MFA têm tokens únicos, expiração, rate limiting, e que logs não vazam credenciais/secrets.

## Escopo

- Revisar `src/auth/password-reset.ts`, `src/auth/totp.ts`, `src/app/reset-password/`, `src/app/profile/totp/`.
- Revisar `src/observability/server-request-log.ts` e seu inventário de rotas.
- Adicionar testes de reuso de token, expiração, brute-force, campos sensíveis em logs.

## Critérios

- Token de reset não é reutilizável e expira conforme policy.
- TOTP enrollment/confirm/disable/regenerate rejeitam cross-origin e callers inválidos.
- Request-log nunca contém body/header/cookie/identity/credential/customer snapshot/provider data.

## Critérios de aceite

- Token de reset é único, não reutilizável e expira conforme policy.
- TOTP routes rejeitam cross-origin e callers inválidos.
- Request-log nunca contém body/header/cookie/identity/credential/customer snapshot/provider data.

## Specs

- [[pop/specs/identity-security|Identity security]]

## Não editar

Services/routes existentes, salvo para corrigir falha severity-1.
