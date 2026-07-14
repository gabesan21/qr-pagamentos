---
draft: import-project
status: rascunho
created: AAAA-MM-DD
---

# Rascunho de importação — <nome provisório>

> Para projeto **que já existe** (repositório ou pasta com conteúdo). Copie para `drafts/import/<nome-kebab>.md` e preencha o que souber — são as perguntas da entrevista da skill `import-project`. O **recon da base é do agente** (read-only, antes de criar qualquer coisa): concentre-se no que o código não mostra. **"Não sei" é resposta válida.** Quando terminar, mude `status: rascunho` → `pronto`. O agente confirma o rascunho contra o recon (divergência vira RECON NEEDED), lança o que bloquear decisão em `open_questions/` e **apaga este arquivo** ao materializar. Blockquotes são instruções — apague-as ao preencher.

## Localização

- **URL do repositório** e/ou **caminho local:**

## Encaixe no vault

> Types explicados em [[TYPES|TYPES]]: specs de IA podem ser commitadas no repo → `included`; repo deve ficar limpo de harness → `default` (clone na raiz da pasta do projeto); um de vários repos do mesmo projeto → `multi-repo`; vários repos que devem funcionar standalone, cada um com harness commitado → `full-multi-repo`.

- **Categoria** (em `categories/`: `agents` | `applications` | `writing` | `work` — ou nova):
- **Type:**
- **Branch de PR** das tasks:
- **Nome em kebab-case** (pode diferir do nome do repo):
- **Idioma padrão do projeto** (o recon confirma contra código e docs):
- **Idiomas suportados (i18n)**, se for aplicação:

## Flow do projeto

> O que torna as specs fiéis — o que o código não mostra.

- **O que o projeto faz hoje**, na sua visão:
- **Fluxos principais, ponta a ponta** (entrada → processamento → saída, ou equivalente):
- **O que funciona bem** vs. **o que está quebrado/inacabado:**
- **Decisões históricas** que explicam o desenho atual (viram `pop/notes/decisions/`):
- **Como se entrega/publica hoje:**

## Futuro (opcional)

> A Epoch 1 é sempre "Organização" (specs, skills, pesquisas, notas fiéis ao que existe). Aqui, o que vem depois.

- **Destino** — onde o projeto precisa chegar:
- **Epochs candidatas pós-organização** (uma linha cada):

## Perguntas abertas

> O que você ainda não decidiu e quer discutir com o agente.

-
