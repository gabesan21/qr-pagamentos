# Frente <F01> — <nome> — [[<id>-<slug>]]

> Blockquotes deste template são instruções de preenchimento — **apague-os ao preencher**.
> Este arquivo é a **unidade de leitura de um executor**: obrigatório para toda frente que vá para um contexto separado, dispensável só quando a task tem uma frente única. Junto com o "O quê / Por quê" do card e o objetivo/estratégia do plano, ele é *tudo* o que o executor recebe — nunca o plano inteiro, nunca as frentes alheias. Teto de 50 linhas (validado por `pop_validate`): se não couber, a frente está grande demais e se divide em duas.
> Não descreva código nem microedições.

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
- **Saber parar:** no máximo 2 tentativas de fazer um critério `agent` passar quando a falha é de ambiente (sandbox, permissão, flakiness); na segunda, registre `ambiente`, reporte a reclassificação para `verify: user` e siga. Nunca construa infraestrutura nova só para verificar.
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
