# Verificação — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 005_verifying · **Responsável:** agent (+ user se `critical: true`)

> Copie a tabela "Critérios de aceite e verificação" do [[<id>-<slug>.plan|plano]] e siga o **modo 005** de cada critério, **na worktree da task**: `re-run` → execute o run e compare com o "Pass é"; `evidência` → audite a saída capturada pelo executor (notas em `subtasks/`), e trate como `re-run` se ausente ou inconclusiva. Critério falhou → task volta para `004_processing` — ver [[WORKFLOW|WORKFLOW]].

## Rodada 1 — AAAA-MM-DD

| # | Critério | Modo | Run executado / evidência auditada | Resultado | Evidência |
|---|----------|------|------------------------------------|-----------|-----------|
| 1 | <critério do plano> | re-run \| evidência | `<run do plano>` ou <nota auditada> | ✅ passou / ❌ falhou | O que foi observado vs. o "Pass é", em uma linha. |

**Veredito:** aprovada → 006_done | reprovada → 004_processing (<o que falta>)

## Aprovação humana (apenas se `critical: true`)

### Resposta do humano

_(escreva aqui)_

- [ ] Feito
