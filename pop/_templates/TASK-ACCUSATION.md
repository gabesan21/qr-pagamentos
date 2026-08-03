# Acusação — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 005_closing (ato 1) · **Responsável:** advogado do diabo

> **Artefato do gate adversarial.** Nasce só quando a task é `yolo: true` **e** (`size: L` **ou** `critical: true`); nessa configuração não existe `.verify.md`. Contexto fresco, tier **strong**, distinto de planejador, executor e juiz.
> **Um arquivo por rodada:** salve como `<id>.r<n>.accusation.md`, começando em `r1`. Rodada nova nunca sobrescreve a anterior; rodadas nunca são apagadas, e a de maior `n` é a que decide.
> **Teto: 50 linhas por rodada** (validado por `pop_validate`). Registre só achado acionável, com fonte.
> **Você acusa; quem decide é o juiz.** Não escolha rota, não aprove, não reprove e não escreva a memory da task — acusação não é veredito. Também não conserte o que apontou.
> Percorra os **dois eixos** e mantenha-os separados: **execução** (critérios do plano re-rodados e qualidade do diff) e **decisão** (ataque às escolhas declaradas na [[<id>-<slug>.defense|defesa]]).
> Todo item leva severidade, evidência e remédio. Item sem os três é artefato inválido e é reemitido antes de o juiz julgar.
> **Falha de ambiente não é objeção.** Critério bloqueado por sandbox/infra ou evidência flaky registra `qualified pass (ambiente)` na tabela de critérios e segue para a checklist humana — não vira item de acusação. Critério `verify: user` não se re-roda: registre-o como fora da superfície do agente.

## Eixo de execução — critérios re-rodados

| # | Critério do plano | Verificação executada | Resultado | Evidência |
|---|-------------------|------------------------|-----------|-----------|
| 1 | <critério> | `<run>` ou <artefato auditado> | passou \| falhou | <observado versus esperado> |

### Objeções de execução

| Severidade | Objeção | Evidência | Remédio |
|------------|---------|-----------|---------|
| bloqueante \| sugestão \| nit | <o que está errado no diff ou no resultado> | `<arquivo:linha>` ou run | <a ação objetiva que a resolveria> |

## Eixo de decisão — ataque à defesa

| Severidade | Decisão atacada | Objeção | Evidência | Remédio |
|------------|-----------------|---------|-----------|---------|
| bloqueante \| sugestão \| nit | <nº da decisão na defesa> | <por que a escolha não se sustenta> | <falsificador observado, `arquivo:linha` ou run> | <a ação objetiva que a resolveria> |

## Resultado

> **"Nenhuma objeção material" é veredito válido e bem-sucedido desta função** — advogado que precisa sempre acusar é ruído, não gate. Declare-o aqui, com a mesma seriedade de uma acusação, quando o eixo passar; o juiz julga esse registro como julgaria qualquer outro.

- **Eixo de execução:** nenhuma objeção material | <n> objeções (<n> bloqueantes).
- **Eixo de decisão:** nenhuma objeção material | <n> objeções (<n> bloqueantes).
- **Superfície coberta:** <diff, critérios e riscos efetivamente examinados>.
- **Não examinado:** nada | <o que ficou fora e por quê>.
