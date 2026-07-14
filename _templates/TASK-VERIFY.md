# Verificação — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 005_verifying · **Responsável:** agent (+ user se `critical: true`)

> Copie a tabela "Critérios de aceite e verificação" do [[<id>-<slug>.plan|plano]] e execute **cada run na worktree da task**, comparando o observado com o "Pass é" definido lá. Critério falhou → task volta para `004_processing` — ver [[WORKFLOW|WORKFLOW]].

## Rodada 1 — AAAA-MM-DD

| # | Critério | Run executado | Resultado | Evidência |
|---|----------|---------------|-----------|-----------|
| 1 | <critério do plano> | `<run do plano>` | ✅ passou / ❌ falhou | O que foi observado vs. o "Pass é", em uma linha. |

**Veredito:** aprovada → 006_done | reprovada → 004_processing (<o que falta>)

## Aprovação humana (apenas se `critical: true`)

### Resposta do humano

_(escreva aqui)_

- [ ] Feito
