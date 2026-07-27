---
name: recon-project
description: Gera e consome o relatório determinístico RECON.md (árvore, linguagens/LOC, manifests, hotspots de git, entry points/configs/CI, modo escrita) de um diretório de projeto antes de varrer arquivos manualmente. Use no início de recon delegado, no 002 de task que exige leitura ampla do conteúdo do projeto, e na Etapa 1 da import-project.
---

# recon-project

Antes de abrir arquivo por arquivo para entender um diretório desconhecido, gere um inventário determinístico com `pop/scripts/pop_recon.py` e leia-o primeiro. Ele responde "o que tem aqui" (árvore, linguagens, manifests, hotspots, entry points) sem gastar leitura em varredura manual.

## Quando gerar

- **Início de recon delegado** (regra 18 do [[AGENTS|AGENTS]]): antes de disparar subagentes de leitura ampla, gere o RECON.md e passe-o como contexto — reduz o que cada subagente precisa varrer sozinho.
- **002_planning de task que exige leitura ampla** do conteúdo do projeto (não só do card): gere o relatório do diretório afetado antes de decidir o plano.
- **Epoch 1 da `import-project`** (Etapa 1 — Recon da base): gere o RECON.md do repositório/pasta importada antes de disparar os subagentes paralelos de estrutura, build, docs, histórico e pontos frágeis.

## Como gerar

```
python3 pop/scripts/pop_recon.py <dir>            # imprime o relatório em stdout
python3 pop/scripts/pop_recon.py <dir> --output RECON.md   # grava em arquivo (default de nome: RECON.md)
```

Zero LLM, só stdlib, determinístico (mesma árvore ⇒ mesmo texto). Sem `.git/` no alvo, a seção de hotspots degrada com nota explícita — as demais seções seguem intactas. Para bases majoritariamente markdown, o relatório entra em modo escrita: estrutura de capítulos/headings, wordcounts e inventário de frontmatter, em vez de linguagens/LOC de código.

## Como consumir

Leia o RECON.md **inteiro antes de abrir qualquer arquivo do projeto**. Use as seções para escolher o que vale a pena ler de fato:

- **Árvore** → onde está o quê, sem listar diretórios manualmente.
- **Linguagens/LOC** → tamanho e stack predominante.
- **Manifests** → dependências declaradas, sem abrir `package.json`/`go.mod`/`pyproject.toml`/`Cargo.toml` um a um.
- **Hotspots** → quais arquivos concentram mudança (churn git) — prioridade de leitura.
- **Entry points/configs/CI** → onde o projeto começa a rodar e como é validado.
- **Modo escrita** (bases markdown) → capítulos e frontmatter antes de abrir cada nota.

Só então decida quais arquivos específicos abrir para o que o relatório não respondeu.

## Regra dura

`RECON.md` é **artefato derivado**, regenerado on-demand a qualquer momento — **nunca é commitado** como fonte de verdade, e **nunca substitui** DOX, specs ou memory. Ele orienta a primeira leitura; o conhecimento durável continua vivendo em `pop/specs/`, nos contratos DOX e em `pop/memory/`, como sempre.
