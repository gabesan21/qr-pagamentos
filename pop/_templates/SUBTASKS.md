# Frente <F01> — <nome> — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.
> Este arquivo é a **origem substantiva de uma frente**. O `pop-executor` recebe no envelope somente paths e autorização, então adquire daqui sua fatia e das demais origens autorizadas o "O quê/Por quê", objetivo/estratégia e skills. Nunca recebe replay, plano inteiro ou frentes alheias. Teto de 50 linhas.
> Não descreva código nem microedições.

- **Entrega:** <resultado desta frente>.
- **Escopo:** <limite funcional>.
- **Responsável:** agent | user.
- **Papel:** `pop-executor` | `pop-execution-orchestrator`.
- **Paths de entrada:** `<card, seções do plano, esta fatia, specs/skills>`.
- **Owns:** `<arquivos ou padrões que pode alterar>`.
- **May read:** `<paths autorizados somente para leitura>`.
- **Must not edit:** `<arquivos, áreas e frentes reservadas>`.
- **Depends on:** `<Fxx>` | nenhuma.
- **Entrada esperada:** <contrato/artefato da dependência> | nenhuma.
- **Skills:** [[pop/skills/<skill>|<skill>]] — *use para <gatilho>*.
- **Web:** deny | allow read-only oficial (somente exceção cumulativa elegível).
- **Gate/delta:** <gate aplicável ou paths/frentes da reentrada> | nenhum.
- **Saída:** <artefato/formato>, teto <N>, evidência <tipo>, status `concluída | BLOCKED`.
- **Critérios:** <IDs definidos no [[<id>-<slug>.plan|plano]]>.

## Contrato de execução

- Entregar somente o escopo e os critérios desta frente.
- **Saber parar:** no máximo 2 tentativas de fazer um critério `agent` passar quando a falha é de ambiente (sandbox, permissão, flakiness); na segunda, registre `ambiente`, reporte a reclassificação para `verify: user` e siga. Nunca construa infraestrutura nova só para verificar.
- Dependência ou entrada ausente/incompatível → responder `BLOCKED` ao agente principal com evidência.
- Não implementar, simular ou corrigir dependências por conta própria.
- Não alterar caminhos fora de `Owns`; necessidade nova volta ao agente principal.

## Resultado

> Preencha ao concluir. Registre resultado e desvios relevantes, não uma narrativa da execução.

- **Status:** concluída | BLOCKED.
- **Commit/artefato:** <referência>.
- **Arquivos alterados:** <lista curta, conferida contra `Owns`>.
- **Desvios:** nenhum | <desvio e autorização do agente principal>.
- **Evidência:** <gate ou observação relevante>.
