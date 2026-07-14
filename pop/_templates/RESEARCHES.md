# Pesquisas sugeridas — <Nome do projeto>

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

Ficha: [[pop/PROJECT|<Nome do projeto>]] · Roadmap: [[pop/ROADMAP|Roadmap]]

> Arquivo **opcional**, ao lado do ROADMAP.md. Prompts de **pesquisa profunda** propostos pelo agente para o **usuário** rodar na ferramenta que preferir (deep research) e depositar o resultado em `pop/researches/<assunto>/` (no meta-projeto da raiz do vault: sem o prefixo `pop/`). Pesquisa entregue enriquece o roadmap (recon das epochs), as specs e o projeto em si.

## <assunto-em-kebab-case>

- **Status:** pendente | entregue → [[pop/researches/<assunto>/<assunto>|síntese]]
- **Alimenta:** epoch <n> | spec [[pop/specs/<spec>|<spec>]] | RECON NEEDED <qual>
- **Prompt sugerido:**

> Prompt completo e autocontido: contexto do projeto em 2–3 frases, a pergunta central, o que a resposta precisa cobrir (comparações, fontes, critérios) e o formato esperado do resultado. Deve funcionar colado em qualquer ferramenta de pesquisa, sem este vault por perto.

## Como usar

1. O agente propõe pesquisas aqui (`new-project`, `plan-roadmap`, `import-project`) — uma seção por assunto.
2. O usuário roda o prompt onde quiser e entrega o resultado bruto em `pop/researches/<assunto>/raw/` (dica: o Obsidian Web Clipper converte artigos web em markdown).
3. Resultado entregue → o agente roda a skill `ingest-research`: síntese em `pop/researches/<assunto>/<assunto>.md`, status `entregue` com link para a síntese e proposta de updates de roadmap/spec (contradição com spec/nota fica sinalizada, nunca silenciosa).
