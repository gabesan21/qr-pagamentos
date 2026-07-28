# F06 — Consolidation, fixes and gates

## Objetivo

Aplicar correções mínimas de findings severity-1, atualizar specs se necessário, e fazer todos os gates passarem.

## Escopo

- Corrigir findings severity-1 encontrados em F01–F05.
- Atualizar `pop/specs/identity-security.md` e `pop/specs/administrative-foundation.md` se findings afetarem contratos duráveis.
- Re-rodar `pnpm check`, `pnpm db:test`, `pnpm container:contract-check`, `install/test.sh`.

## Critérios

- Nenhum finding severity-1 sem correção ou risco aceito documentado.
- Todos os gates agregados passam.
- `.verify.md` lista findings e decisões.

## Não editar

Funcionalidades fora do escopo dos findings.
