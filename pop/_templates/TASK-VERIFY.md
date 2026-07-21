# Verificação e crítica — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.

- **Etapa:** 005_verifying · **Responsável:** revisor independente

> Um único agente fresco verifica comportamento/qualidade. Em yolo ele é sempre **strong** e decide `differential|full`; `full` é obrigatório em critical ou após retorno. Evidência inconclusiva é reexecutada.

## Rodada 1 — AAAA-MM-DD

- **Estratégia:** differential | full — <motivo>.
- **Superfície:** <diff/riscos cobertos>.
- **Devolução yolo:** 0 | 1 | 2 de 2 — 3ª reprovação ativa circuit breaker.

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

- **Decisão:** aprovada → 006_done | reprovada → 004_processing | circuit breaker.
- **Bloqueantes:** nenhum | <lista curta>.
- **Sugestões/nits:** <não bloqueiam; registrar somente se úteis>.
- **Resumo:** <comparação breve entre objetivo inicial e resultado implementado>.

## Aprovação humana (somente `critical: true` fora do yolo)

> O revisor termina seu julgamento antes deste gate. O humano aprova, pede correção ou registra ressalvas; em yolo esta seção não é usada.

### Resposta do humano

_(escreva aqui)_

- [ ] Feito
