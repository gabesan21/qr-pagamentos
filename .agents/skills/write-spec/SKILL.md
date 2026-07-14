---
name: write-spec
description: Padroniza a criação de specs para qualquer tipo de projeto (software, escrita, negócio, pesquisa...), guiando o usuário com perguntas certas para o tipo. Use ao criar ou reescrever uma spec.
---

# write-spec

Cria uma spec em `pop/specs/` (meta-projeto da raiz do vault e projetos ainda não migrados: harness na raiz, sem `pop/`) a partir de `_templates/SPEC.md`, entrevistando o usuário com as perguntas certas para o tipo de projeto. Uma spec responde a **uma** pergunta; se começar a responder duas, são duas specs.

**Delegue a subagentes:** quase nada — é entrevista; leitura ampla de material existente para embasar a spec vai a subagente com pergunta específica e resposta ≤30 linhas.

## Procedimento

1. **Delimite o tema:** confirme com o usuário em uma frase o que a spec cobre — e o que fica de fora (seção "Fora de escopo").
2. **Entreviste conforme o tipo** (2–3 perguntas por vez; adapte para tipos não listados):
   - **Software:** comportamento esperado, dados envolvidos, casos de erro, integrações, o que é "pronto".
   - **Escrita:** público-alvo, tom, estrutura/seções, fontes, tamanho alvo, critério de qualidade.
   - **Negócio/processo:** etapas, responsáveis, entradas/saídas, métricas de sucesso, riscos.
   - **Pesquisa:** perguntas a responder, método, fontes aceitáveis, critério de suficiência (quando parar).
   - **Pessoal/hábito:** resultado desejado, gatilhos, frequência, como medir progresso.
3. **Escreva requisitos verificáveis:** cada requisito deve permitir responder "isso é verdade?" com sim/não. "Texto bom" não é requisito; "cada capítulo ≤3.000 palavras com abertura narrativa" é.
4. **Incertezas não travam:** o que o usuário não sabe vai para a seção "Aberto" — a spec nasce como `rascunho` e evolui.
5. **Linke:** phase do roadmap, tasks relacionadas, outras specs. Nome do arquivo em kebab-case.

## Ciclo de vida (ver skill `sync-specs`)

`rascunho` → `aprovada` (junto com o gate 003 da primeira task que a implementa, ou aprovação direta do usuário) → `implementada` (quando a realidade corresponde à spec) → `obsoleta` (com link para a substituta).

## Cuidados

- ≤150 linhas; se crescer, extraia specs auxiliares e linke.
- Fora de escopo explícito evita a spec inchar depois.
- Nunca deixe placeholder `<...>` sobrando.
