# Verificação e crítica — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 005_closing (ato 1) · **Responsável:** revisor independente

> **Artefato exclusivo de `yolo: true`.** Fora de yolo não existe revisor agêntico: o gate é o PR humano e este arquivo não nasce.
> Um único agente fresco verifica comportamento/qualidade, sempre **strong**, e decide `differential|full`: `full` em critical ou retorno por `premissa`; depois de `lacuna` ou falha de execução, o diferencial cobre o **delta**. Evidência inconclusiva é reexecutada.
> Este é o único gate de qualidade (003 só existe em `critical: true`). Responda **primeiro** se o pedido original — o "O quê / Por quê" do card — foi atendido; só depois valide specs e critérios do plano.
> **Três saídas, não duas:** aprovado; **bloqueante de execução** → 004, quando o executor não cumpriu os critérios que recebeu; **defeito de plano** → 002, quando os critérios não cobriam o pedido do card e o executor cumpriu o que lhe foi entregue. Aderência ao plano que não atende ao pedido nunca é falha do executor.
> **Você nomeia o delta, não conserta o defeito.** Despachar correção transformaria você em quem encomendou o trabalho que julga.

## Rodada 1 — AAAA-MM-DD

- **Estratégia:** differential | full — <motivo>.
- **Superfície:** <diff/riscos cobertos>.
- **Devoluções:** execução 0 | 1 | 2 de 2 · plano 0 | 1 | 2 de 2 — 3ª da mesma rota ativa circuit breaker.

### Conformidade com objetivo e specs

| # | Critério | Modo | Verificação executada | Resultado | Evidência |
|---|----------|------|------------------------|-----------|-----------|
| 1 | <critério do plano> | re-run \| evidência | `<run>` ou <artefato auditado> | passou \| falhou | <observado versus esperado> |

### Qualidade da implementação

> Revise o diff com a skill de revisão aplicável: correção, complexidade, acoplamento, nomes, erros, testes, segurança, contratos DOX, documentação e specs. Registre somente achados acionáveis, com fonte.

| Severidade | Achado | Evidência | Correção necessária |
|------------|--------|-----------|---------------------|
| bloqueante \| sugestão \| nit | <problema> | `<arquivo:linha>` ou run | <ação objetiva> |

### Escopo e integração

- [ ] Alterações respeitam `Owns` e `Must not edit` de cada frente.
- [ ] Dependências não foram implementadas oportunisticamente por consumidores.
- [ ] Gate agregado passou após a integração.
- [ ] Specs, documentação e contratos DOX afetados estão coerentes.

## Veredito

- **Decisão:** aprovada → entrega e encerramento | bloqueante de execução → 004_processing | defeito de plano → 002_planning | circuit breaker.
- **Bloqueantes:** nenhum | <lista curta>.
- **Defeito de plano:** nenhum | <critério que não cobria o pedido do card>.
- **Sugestões/nits:** <não bloqueiam; registrar somente se úteis>.
- **Resumo:** <comparação breve entre objetivo inicial e resultado implementado>.

## Delta da devolução

> **Obrigatório em todo veredito que não seja aprovação** — apague a seção só quando aprovar. Sem delta, o 002 não sabe se emenda ou replaneja e o 004 reexecuta trabalho já aprovado. O orquestrador transporta o tipo com `pop_move --return-kind <tipo>`.
> **`lacuna`** = os critérios não cobriam o pedido, mas o entregue está correto → 002 **acrescenta** critério/frente, sem renumerar nem reescrever. **`premissa`** = a estratégia estava errada e o entregue está no caminho errado → replanejamento de verdade. **`execucao`** = o executor não cumpriu o que recebeu → 004.

- **Tipo:** lacuna | premissa | execucao.
- **Critérios afetados:** <IDs do plano> — <o que falta ou falhou, uma linha>.
- **Frentes afetadas:** `<Fxx>` — reentram em 004 (ou: frente nova a criar em 002).
- **Frentes intactas:** `<Fxx>` — aprovadas, permanecem integradas; **não** reexecutar.
- **Ação esperada:** <uma linha: o que 002 emenda ou o que 004 corrige>.

> Aprovando, escreva a memory na mesma sessão — você acabou de ler o diff: o ledger `memory/<AAAA-MM-DD>/<id>.md` mais uma entrada `<id>.<nn>-<slug>.md` por coisa feita, com evidência linkada ([[_templates/MEMORY|MEMORY]] · [[_templates/MEMORY-ENTRY|MEMORY-ENTRY]]). Integração, PR e merge continuam do orquestrador e do humano.
