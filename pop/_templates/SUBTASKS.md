# Frente <F01> — <nome> — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**. Este arquivo é opcional: crie-o somente quando a frente tiver ownership próprio, responsável distinto ou dependência que mereça acompanhamento separado. Não descreva código nem microedições.

- **Entrega:** <resultado desta frente>.
- **Escopo:** <limite funcional>.
- **Responsável:** agent | user.
- **Owns:** `<arquivos ou padrões que pode alterar>`.
- **May read:** `<specs, contratos e áreas disponíveis para consulta>`.
- **Must not edit:** `<arquivos, áreas e frentes reservadas>`.
- **Depends on:** `<Fxx>` | nenhuma.
- **Entrada esperada:** <contrato/artefato da dependência> | nenhuma.
- **Skills:** [[pop/skills/<skill>|<skill>]] — *use para <gatilho>*.
- **Critérios:** <IDs definidos no [[<id>-<slug>.plan|plano]]>.

## Contrato de execução

- Entregar somente o escopo e os critérios desta frente.
- Dependência ou entrada ausente/incompatível → responder `BLOCKED` ao orquestrador com evidência.
- Não implementar, simular ou corrigir dependências por conta própria.
- Não alterar caminhos fora de `Owns`; necessidade nova volta ao orquestrador.

## Resultado

> Preencha ao concluir. Registre resultado e desvios relevantes, não uma narrativa da execução.

- **Status:** concluída | BLOCKED.
- **Commit/artefato:** <referência>.
- **Arquivos alterados:** <lista curta, conferida contra `Owns`>.
- **Desvios:** nenhum | <desvio e autorização do orquestrador>.
- **Evidência:** <gate ou observação relevante>.
