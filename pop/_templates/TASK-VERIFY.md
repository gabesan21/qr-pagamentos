# Julgamento — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 005_closing (ato 1) · **Responsável:** Judge Dredd (juiz único)

> **Artefato exclusivo de `yolo: true`.** Fora de yolo não existe revisor agêntico: o gate é o PR humano e este arquivo não nasce.
> **Teto: 80 linhas** (validado por `pop_validate`). Rodada nova acrescenta seção `## Rodada <n>` neste mesmo arquivo e **nunca** apaga a anterior; a de maior número decide.
> O Judge Dredd ([[.agents/skills/judge-dredd/SKILL|judge-dredd]]) nasce em sessão limpa, tier pela matriz do [[WORKFLOW|WORKFLOW]] (medium em `S`/`M`, strong em `L`/`critical`), e decide `differential|full`: `full` em critical ou retorno por `premissa`; depois de `lacuna` ou falha de execução, o diferencial cobre o **delta**.
> **Julgue por leitura, não por re-run:** diff integrado e evidência registrada. Não execute testes — critério `verify: phase` pertence à task `verificacao-da-phase` e aqui só se confere seu registro na checklist; a exceção é a própria task de verificação da phase, cujo plano declara re-run. Todo achado passa pelo teste de materialidade da skill antes de entrar na tabela.
> Este é o único gate de qualidade (003 só existe em `critical: true`). Responda **primeiro** se o pedido original — o "O quê / Por quê" do card — foi atendido; só depois valide specs e critérios do plano.
> **Três saídas, não duas:** aprovado; **bloqueante de execução** → 004, quando o executor não cumpriu os critérios que recebeu; **defeito de plano** → 002, quando os critérios não cobriam o pedido do card e o executor cumpriu o que lhe foi entregue. Aderência ao plano que não atende ao pedido nunca é falha do executor.
> **Você nomeia o delta, não conserta o defeito.** Despachar correção transformaria você em quem encomendou o trabalho que julga.
> **Falha de ambiente nunca devolve.** Critério bloqueado por sandbox/infra ou evidência flaky recebe `qualified pass (ambiente)` com a evidência alternativa disponível e entra na checklist humana do veredito; devolução exige defeito reproduzível no produto. Critério `verify: user` não é julgado aqui — vai direto para a checklist.

## Rodada 1 — AAAA-MM-DD

- **Estratégia:** differential | full — <motivo>.
- **Superfície:** <diff/riscos cobertos>.
- **Devoluções:** execução 0 | 1 | 2 de 2 · plano 0 | 1 | 2 de 2 — 3ª da mesma rota ativa circuit breaker.

### Conformidade com objetivo e specs

| # | Critério | Modo | Verificação | Resultado | Evidência |
|---|----------|------|-------------|-----------|-----------|
| 1 | <critério do plano> | evidência \| phase \| humano | <artefato auditado> ou registro na checklist da phase | passou \| falhou \| registrado (phase) \| qualified pass (ambiente) | <observado versus esperado> |

### Qualidade da implementação

> Revise o diff com a skill de revisão aplicável: correção, complexidade, acoplamento, nomes, erros, segurança, contratos DOX, documentação e specs. Registre somente achados acionáveis que passaram no teste de materialidade, com fonte.

| Severidade | Achado | Evidência | Correção necessária |
|------------|--------|-----------|---------------------|
| bloqueante \| sugestão \| nit | <problema> | `<arquivo:linha>` ou run | <ação objetiva> |

### Escopo e integração

- [ ] Alterações respeitam `Owns` e `Must not edit` de cada frente.
- [ ] Dependências não foram implementadas oportunisticamente por consumidores.
- [ ] Critérios `verify: phase` registrados na checklist da phase.
- [ ] Specs, documentação e contratos DOX afetados estão coerentes.

## Veredito

- **Decisão:** aprovada → entrega e encerramento | **reparo dirigido** (delta pontual — não é rota nem consome contador; o orquestrador despacha o patch e você o confere em adendo ≤10 linhas nesta rodada; máx. 2 por rodada) | bloqueante de execução → 004_processing | defeito de plano → 002_planning | circuit breaker.
- **Bloqueantes:** nenhum | <lista curta>.
- **Defeito de plano:** nenhum | <critério que não cobria o pedido do card>.
- **Sugestões/nits:** <não bloqueiam; registrar somente se úteis>.
- **Checklist humana:** nenhum | <critérios `verify: user` e qualified passes (ambiente), com passo manual e pass esperado — o orquestrador os leva ao PR/aprovação final>.
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
