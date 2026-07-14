# Administrative foundation research

- **Created:** 2026-07-13
- **Feeds:** [[categories/applications/qr-pagamentos/roadmap/1-administrative-foundation|Epoch 1]] and [[categories/applications/qr-pagamentos/specs/administrative-foundation|Administrative foundation spec]].

## Conclusions

- Current Next.js requires Node.js 20.9 or newer; Node.js 24 is the current Active LTS baseline.
- Production self-hosting should use `output: standalone`, a multi-stage image, a non-root runtime user, and a reverse proxy at the public edge.
- Lint must run separately from the production build in current Next.js.
- Docker Compose can gate the application on PostgreSQL health and a successful one-shot migration service.
- Prisma must own versioned migrations; development, CI, and production must use the same PostgreSQL major version.
- Runtime and migration database roles must be separate, with database constraints enforcing identity invariants.
- First-party authentication requires opaque database sessions, secure cookies, server-side revocation, and authorization at every read and mutation.
- The locale segment and server-side dictionaries should exist from the initial route structure; `pt-BR` and `en` must maintain key parity.
- The initial admin shell must meet WCAG 2.2 AA keyboard, reflow, focus, and contrast criteria.

## Sources

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) - version requirements, TypeScript, lint, and build behavior.
- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) - production topology and reverse-proxy guidance.
- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) - deployable traced output and static-asset handling.
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication) - sessions, DAL authorization, and DTO boundaries.
- [Next.js internationalization](https://nextjs.org/docs/app/guides/internationalization) - locale routing and server-side dictionaries.
- [Docker build practices](https://docs.docker.com/build/building/best-practices/) - multi-stage, minimal, reproducible images.
- [Docker startup order](https://docs.docker.com/compose/how-tos/startup-order/) - health and completion dependencies.
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) - database-enforced invariants.
- [PostgreSQL roles](https://www.postgresql.org/docs/current/sql-createrole.html) - least-privilege runtime and migration roles.
- [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) - cookie and session lifecycle controls.
- [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) - deny-by-default and object-level checks.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) - accessibility acceptance baseline.

## Unresolved checks

- Confirm deployment-host support before pinning Node.js and PostgreSQL major versions.
- Define session TTL, password recovery, MFA policy, and initial global settings during the relevant phase plans.
