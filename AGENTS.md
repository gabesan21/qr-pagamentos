# QR Pagamentos - agent instructions

> Project managed by the **ProjectOfProjects (PoP)** workflow. `CLAUDE.md` is a symlink to this file; always edit this file.

- **Type:** included - see [[TYPES|TYPES]].
- **Project language:** English - project-specific specs, notes, research, code comments, and kanban artifacts use English.
- **Vendored PoP language:** copied core workflow files and skills remain in upstream pt-BR; do not translate the shared source during project work.
- **Supported application languages (i18n):** Brazilian Portuguese (`pt-BR`) and English (`en`).
- **Project brief:** [[PROJECT|PROJECT]] - read when the task needs product purpose or harness decisions.
- **Roadmap:** [[ROADMAP|ROADMAP]] - read when selecting or sequencing work.
- **Modifications:** [[MODIFICATIONS|MODIFICATIONS]] (created on demand) - read for hotfixes, adjustments and small emergent features outside the plan.

## Repository

| Repo | URL | Clone path | PR branch |
|------|-----|------------|-----------|
| qr-pagamentos | https://github.com/gabesan21/qr-pagamentos.git | repository root | main |

In yolo scopes, the orchestrator mechanically integrates task branches into `develop`; there is no PR per task. When the last task of the marked scope (single task, phase/epoch or modification) closes, it automatically opens the final `develop` -> `main` PR; the human tests and merges it.

## Workflow

Every change to the application passes through `kanban/001_initial_task` -> `kanban/006_done`, with tasks coming from the roadmap (`<n>.<m>.<t>-<slug>`) or from modifications (`M-<n>.<t>-<slug>` — work arriving outside the plan):

1. **001** - create the task with `new-task` and explicit `depends_on` prerequisites.
2. **002** - a planner separate from execution writes a concise brief with objective, strategy, fronts, dependencies, contracts, risks, and acceptance criteria.
3. **003** - obtain human approval. In yolo this gate **only exists for `critical: true`** (strong independent critic; two returns allowed before the third failure trips the circuit breaker); non-critical yolo tasks transit 002 -> 004 directly.
4. **004** - send a cohesive front directly to one executor; use an execution orchestrator only for a DAG, multiple skills, or multiple write sets.
5. **005** - one fresh independent critic reviews the delivery. In yolo this is the **single quality gate** (always strong): it first verifies that the original request (the card's objective) was met — the brief is strategy, not an approved contract — choosing differential or full verification; full is mandatory for critical tasks or after a return, and the third rejection trips the circuit breaker.
6. **006** - mechanically integrate yolo tasks into `develop`, write memory and telemetry summary, clean the task, and automatically open the final scope PR to `main`.

Up to three independent yolo tasks may advance as a wave. Parallel execution requires logical and write independence plus repository/worktree isolation; any collision serializes. A missing dependency is `BLOCKED` and is never implemented opportunistically.

One execution continues until the next real gate. The complete state machine is in [[WORKFLOW|WORKFLOW]].

## Context protocol

1. Start from the card and plan; read only what they link.
2. If context is missing, delegate a specific question instead of reading a directory broadly.
3. Stop searching when the affected behavior and paths are known.
4. Record unresolved uncertainty as `RECON NEEDED` or `blocked`; never guess.
5. Consult specs and memory before archaeology in Git history or code.

## Skills

- **PoP workflow:** `.agents/skills/` contains task/roadmap/spec skills, `weekly-review`, `optimize-memory`, and `yolo-critic` (the strong independent yolo critic).
- **Project operations:** `skills/` will contain reusable build, test, run, migration, and deployment procedures as they become real.

## DOX index

- [`src/components/ui/AGENTS.md`](src/components/ui/AGENTS.md) — follow when
  changing owned Radix/nova shadcn source, its inventory, or its state contract.
- [`src/integrations/nautt/AGENTS.md`](src/integrations/nautt/AGENTS.md) — follow when changing Nautt HTTP adapters or owner-bound provider orchestration.
- [`src/checkout/AGENTS.md`](src/checkout/AGENTS.md) — follow when changing sessionless public checkout reservation, replay, or capability issuance.

### Clean code

- `clean-code-change` (`.agents/skills/`) — follow when **planning (002) and executing (004)** any task that creates or changes code.
- `clean-code-review` (`.agents/skills/`) — follow when **verifying (005)** a code task and as a reading criterion in plan or PR gates.
- **Mandatory:** in 002, every task that creates/changes code enters `clean-code-change` on the **004** row and `clean-code-review` on the **005** row of the card's **Skills por etapa** table.

### UI and frontend

- `ui-change` (`.agents/skills/`) — follow when **planning (002) and executing (004)** any task that designs or implements UI (screens, components, styles).
- `ui-review` (`.agents/skills/`) — follow when **verifying (005)** a UI task and as a reading criterion in frontend plan or PR gates.
- **Mandatory:** in 002, every UI task enters `ui-change` on the **004** row and `ui-review` on the **005** row of the card's **Skills por etapa** table.
- **Vendored support batch** (`.agents/skills/`, consulted by the two skills above per each one's trigger): `frontend-design`, `web-artifacts-builder`, `taste-skill`, `impeccable`, `react-best-practices`, `web-design-guidelines`, `skill-a11y-audit`, `color-expert`, `design-tokens`, `shadcn`, `ux-audit-rethink`, `nielsen-heuristics-audit`, `wcag-accessibility-audit`, `cognitive-walkthrough`, `ui-design-review`, `don-norman-principles-audit`.

#### Project verification

| Check | Command |
|-------|---------|
| Formatter | — (no `format`/`prettier` script in `package.json`) |
| Linter | `pnpm lint` (plus `pnpm typecheck`) |
| Tests | `pnpm test` |

Aggregate gate: `pnpm check` (lint + typecheck + test + build) — see Application contract below.

## Application contract

Username and password are the only login credentials; email is optional and never used for login.

- `src/app/` owns App Router pages and endpoints; localized UI routes are unprefixed and resolve only the persisted `pt-BR` or `en` preference, while `/api/health` and `/api/nautt/webhooks` stay unlocalized. The Nautt callback is sessionless and returns only empty, no-store protocol statuses; never reintroduce `/{locale}` UI or mutation routes.
- `src/orders/order-view.ts` owns the only server-only read projection through which order data (including the policy-exact `CustomerSnapshotV1`) leaves persistence; it exposes no verifiers, nonce, key material, provider data, or lifecycle fencing fields, and cross-owner, malformed, and missing order identities share one opaque "unavailable" outcome.
- `src/app/orders/` owns the read-only owner order list/detail views; every read re-resolves the cookie principal, scopes to the principal's own orders, and renders only opaque empty/unavailable states.
- `src/app/admin/orders/` owns the read-only administrator global order list/detail views over the same projection; they follow the `src/app/admin/` authorization contract and hold no mutation surface.
- `src/app/admin/` owns the administrator shell plus account and global-payment-settings mutations; every read and POST must re-authorize the cookie principal, return only the documented empty `401`/`403` protected outcomes, and never disclose a target account or settings value to unauthorized callers.
- `src/app/nautt-credentials/reset/` owns the owner-initiated local-only webhook-registration reset (`REGISTERING`/`INDETERMINATE` → `UNREGISTERED`, provider fields nulled, zero provider calls and zero decryption); it re-authorizes the cookie principal and returns only an empty `401` or opaque relative redirects (`?nautt=reset`/`changed`/`unavailable`), never distinguishing "no credential" from "wrong state".
- `next.config.ts` `headers()` serves the static security-header set (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`) on `/:path*`; CSP is deferred (App Router inline hydration scripts need per-request nonces, and nonces require the forbidden middleware) — never add `unsafe-inline` CSP or a middleware instead.
- `src/app/origin-guard.ts` owns the fail-closed same-origin check that every cookie-authenticated POST route runs first, before any auth or service work: `Origin` is required and its host (hostname+port) must match `Host`, falling back to the first `X-Forwarded-Host` value behind the TLS proxy; missing, malformed, or mismatched origins get the same empty `403`. Never wire it into `/api/nautt/webhooks`, the sessionless `/api/payment-links/*` routes, `/api/health`, or the `[lang]/*` stubs.
- `src/security/public-rate-limit.ts` owns the bounded single-process limiter for only `GET /api/payment-links/[identifier]`, `POST /api/payment-links/[identifier]/checkout`, and `POST /api/payment-links/[identifier]/checkout/status`. Each handler must decide before parsing, locale negotiation, or service work; a denial is only empty `429` with `Cache-Control: no-store`. Its key may contain only its closed surface and a SHA-256 hash of one canonical `X-Forwarded-For` IP literal supplied by a TLS proxy that overwrites that header; chains, malformed values, or absent forwarding share one anonymous bucket. Never store/log the raw address, expose limiter metadata, add a page/middleware/proxy integration, or claim cross-process protection.
- `src/observability/server-request-log.ts` owns the server-only completion record for the closed API and supported POST-mutation inventory. It accepts only the whole header-safe `X-Request-Id` grammar and literal route templates; records never contain a request path/query/body/header/cookie, identity, credential, customer snapshot, provider data, retry key, capability, verifier, nonce, or error detail. It may add only the normalized `X-Request-Id` response header and must never replace a response or thrown handler failure; `/api/health` remains entirely unwrapped.
- `src/app/storefront/` owns the owner storefront-settings save: it re-authorizes the cookie principal, validates through `src/auth/storefront-settings.ts` (unique nullable slug, nullable bilingual display names, `#RRGGBB` accent color, enable-requires-slug), and returns only empty `401`/`403` or opaque `?storefront=changed|failed|conflict` redirects. The separate sessionless `/store/[slug]` route may read only `src/storefront/public-storefront.ts`'s redacted projection; never expose owner identity, checkout policy, or credential data here.
- `src/i18n/` owns the closed locale set and server dictionary loader; never add a locale without matching dictionary keys and contract tests.
- Use the exact Node and pnpm pins in `.node-version` and `package.json`; install with `pnpm install --frozen-lockfile`.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` independently, or `pnpm check` for the aggregate gate.
- Run `pnpm db:test` separately for the disposable PostgreSQL contract; it is never part of the database-free `pnpm check` gate.
- `Dockerfile` and `compose.yaml` own production image and startup ordering; release db-ops/app images must carry the exact target SHA in `org.opencontainers.image.revision`; never add a floating base, secret-bearing build input/environment field, public database port, or retrying one-shot job.
- `container/` owns redacted non-shell bootstrap, migration, identity seed/recovery, runtime preflight, and liveness wrappers; preserve direct child spawning, required file-backed username, nullable file-backed email, immutable UUID recovery targeting, and `SELECT 1` before application bind.
- Run `pnpm container:contract-check` for static/digest contracts and `pnpm container:test --clean-clone --scenario <name>` only with disposable secrets/resources.
- `install/` owns operator install/update/uninstall and initial-admin recovery for any Linux host with Docker Engine + Compose v2 already installed and the invoking user already in the `docker` group (documented prerequisites, not installed or granted by the script — never reintroduce `sudo`/root escalation or ownership rewrites here); passwords live only in ignored source/staged files and recovery uses the existing Compose helper.
- Bare `install/update.sh` requires a clean attached branch, fast-forwards only to its protected tracked upstream, and binds its single re-exec, offline policy gate, images, migration evidence, and app promotion to one exact SHA; never add backup/release prerequisites, a moving-ref handoff, network/secret/database access to the policy verifier, or a second re-entry.
- Update must prove compatible Compose ownership, the exact existing PostgreSQL volume, a healthy old app, and Nautt-key continuity without rewriting secrets; keep that app running through candidate build and fresh migration proof, and never recreate the target app before successful migration metadata verification and identity seed. Default uninstall/update never removes PostgreSQL data.
- The 19 migration directories through `20260721060000_storefront_settings` are an immutable hash-pinned baseline; every later migration must be canonical byte-exact SQL generated from the closed non-destructive `migration.safe.json` language governed by the Prisma subtree contract. Never admit raw SQL, destructive DDL/DML, data rewrites, rename/type change, or edits to existing history.
- Run `install/test.sh` after changing installer commands, secret validation, Compose deployment, health waiting, or uninstall flags.
- `MIGRATION_DATABASE_URL` is migration-only and `DATABASE_URL` is runtime-only; never share credentials or commit usable URLs.
- `NAUTT_WEBHOOK_CALLBACK_URL` is required non-secret server configuration; accept only canonical absolute HTTPS and never derive it from browser fields or request headers.
- `NAUTT_API_BASE_URL` is optional non-secret server configuration; accept only canonical absolute HTTPS without credentials or a fragment and default to `https://api.nauttfinance.com/api/v2` when unset.
- Generated Prisma code lives in ignored `src/generated/prisma/`; never edit or commit it.
- Never edit generated `next-env.d.ts`, `.next/`, `node_modules/`, coverage output, or TypeScript build-info files by hand.
- [`prisma/AGENTS.md`](prisma/AGENTS.md) — follow before changing the schema, bootstrap SQL, or immutable migration history.
- Do not add another child `AGENTS.md` unless its subtree meets an objective DOX trigger below.

## Processo DOX — contexto hierárquico de agentes no código

### O que é

Uma árvore de arquivos `AGENTS.md` dentro do código: o da raiz do código é o **trilho DOX** — regras do projeto inteiro + índice de alto nível; cada diretório relevante tem o seu, com regras locais e índice do próprio subtree. Cada `AGENTS.md` é um **contrato de trabalho vinculante para o seu subtree**: nenhuma edição às cegas, nenhuma documentação defasada.

### Regras

1. **Antes de editar:** leia o AGENTS.md raiz do código, identifique **todos** os caminhos afetados e **caminhe a árvore** até cada local de edição, lendo todo AGENTS.md aplicável no caminho. A caminhada pode ser delegada a um subagente que devolve **só as regras aplicáveis** aos caminhos da task — o executor recebe o extrato, não a árvore.
2. **Entendimento local:** qualquer ponto do código deve ser compreensível lendo apenas o AGENTS.md mais próximo + todos os pais acima dele. Se não for, falta contrato — crie/complete o local antes de editar.
3. **Conflitos:** o documento mais próximo manda nos detalhes locais; um filho **nunca enfraquece** diretiva do pai.
4. **Concisão operacional:** regras amplas nos níveis altos, detalhe concreto nos filhos. Só o que muda decisões de edição — nada de prosa. **Polaridade:** prefira constraints negativas ("nunca X neste subtree") e condicionais ("se Y, então Z"); evite diretriz positiva genérica ("siga o estilo") — guardrails rendem +13,8pp de acerto, guidance genérica −6,4pp. Teto: **~60 linhas** por contrato de subtree; estourou, o detalhe desce para um filho. Exceção: diretório de árvore grande (muitas subpastas) pode exceder para comportar o índice do subtree — a exceção cobre o índice, não prosa.
5. **Revisão obrigatória:** toda mudança relevante exige revisar os AGENTS.md afetados — atualize quando mudarem propósito, escopo, responsabilidade, estrutura, fluxos, entradas, saídas ou padrões de qualidade.
6. **Fechamento (closeout):** ao concluir o trabalho, re-cheque os caminhos alterados, atualize o documento dono e os pais afetados, refresque os índices, remova conteúdo obsoleto e rode as verificações pertinentes.
7. **Contratos relacionados:** seção opcional em cada contrato com links relativos markdown (`../services/payments/AGENTS.md`) para contratos de outros subtrees dos quais decisões locais dependem — cada link com **gatilho** de 1 linha (*quando segui-lo*). Máx. **~3 laterais (ideal 0-2)** e **<7 referências totais** por contrato (laterais + skills + índice de filhos); só dependência que muda decisão de edição (não todo import); link sem gatilho não vale. Precisou de mais? Sinal de acoplamento ou de roteamento que pertence ao índice do pai. A caminhada vira: vertical até o local de edição + laterais cujo gatilho casa com a task. O closeout (regra 6) atualiza também os laterais dos contratos tocados. **Elo contrato→spec:** quando o harness do PoP mora no mesmo repositório (`included` ou repo de `full-multi-repo`), o contrato pode linkar a **spec do tema** por caminho relativo markdown (`specs/<spec>.md`), com gatilho e contando no teto de referências; no type `default` a ponte contrato↔spec é o card/plano da task — o vault não resolve de dentro do repo (a direção spec→contrato existe sempre, no template de spec).
8. **Skills do subtree:** o contrato pode linkar skills do projeto (`skills/`) **específicas daquela pasta** — procedimento que muda como se edita o subtree (ex.: `migrations/` linka a skill de migration com gatilho "siga antes de criar/alterar qualquer migration"). Sempre link com gatilho, nunca cópia do conteúdo (cópia = drift). Skill de **workflow** (advance-task etc.) nunca entra em contrato — dona dela é a tabela "Skills por etapa" do card: o card responde "como trabalho esta task"; o contrato responde "o que vale ao editar esta pasta, seja qual for a task". Os links de skill contam no teto de referências da regra 7.
9. **Citações verificáveis:** contrato que cita arquivo ou trecho concreto do código pode fixar a citação com a anotação `<!-- pop-hash: <caminho-relativo> sha256=<hash do arquivo citado> -->` (comentário HTML, invisível; caminho relativo à pasta do contrato; hash via `sha256sum <arquivo>`). O `pop_validate` recomputa **fail-closed** — arquivo citado sumiu ou mudou → violação — onde o vault alcança o arquivo (repos embutidos de `full-multi-repo` e clones presentes na raiz da pasta do projeto). Ao revisar a citação, atualize o hash: a mensagem de violação imprime o novo.

### Inicialização

Código sem árvore DOX → varredura recursiva e construção da árvore: AGENTS.md raiz com o índice geral e contratos-filhos **só onde há gatilho objetivo** — não crie AGENTS.md vazio "por via das dúvidas". Em projeto importado (`import-project`), a inicialização é task da Epoch 1 (Organização).

- **Gatilhos de contrato-filho:** ≥2 convenções não óbvias; erro prévio de edição às cegas; stack diferente do resto do repo; ownership diferente (outro time/dono); regras de segurança/permissão distintas; código legado.
- **Árvore nasce enxuta:** contratos iniciais de **20–30 linhas**, crescendo até o teto de ~60 conforme necessidade real; raiz passou de ~150 linhas → desça detalhe para um filho. Escala de referência: **5–15 contratos** bastam para a maioria dos repos.
- **Curadoria humana obrigatória:** a árvore inicial passa pelo gate 003 da task que a cria — contrato LLM-gerado sem curadoria **piora** o resultado (−3% de sucesso, +23% de custo).

### No fluxo do PoP

- **002 (brief):** o recon inclui os AGENTS.md aplicáveis aos caminhos que a task toca; o brief lista os contratos que precisarão de atualização, sem microedições ou trechos de implementação.
- **004:** edite só depois de caminhar a árvore; os AGENTS.md alterados entram na mesma worktree/PR da task.
- **005:** a verificação confere que os contratos afetados foram atualizados — critério de aceite implícito de toda task de aplicação.
- **Type `default` com repo externo que deve ficar limpo de arquivos de IA:** decida com o usuário na entrevista — commitar a árvore DOX no repo (padrão do PoP) ou manter apenas o contrato raiz no AGENTS.md do projeto, dentro do PoP.

## Essential rules

- Use English for project content and ISO dates (`YYYY-MM-DD`). Use wikilinks for internal references and keep notes near 150 lines.
- Never implement or modify application behavior outside a task in `004_processing` with an approved plan.
- Never use Nautt Finance hosted payment links; this application owns its products, links, and checkout pages.
- Never expose Nautt API keys, session secrets, or webhook secrets to clients or committed files.
- Never execute an item owned by `(user)`.
- Every completed task writes `memory/<id>.md` with dates and the final commit.
