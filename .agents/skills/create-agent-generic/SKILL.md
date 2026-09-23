---
name: create-agent-generic
description: Criar, revisar ou atualizar definições semânticas agent-agnostic dos seis especialistas do PoP e orientar seu consumo por builders futuros. Use quando uma task pedir uma nova fonte genérica de especialista, alterar identidade, gatilhos, aquisição, permissões, I/O, término, ownership, dependências, gates ou denies, ou traduzir essas fontes sem mudar sua semântica.
---

# Criar agentes genéricos

Manter uma única fonte autoral por papel em `.agents/agents/`. Tratar esses Markdown como contratos semânticos; artefatos gerados são projeções descartáveis e nunca viram origem.

## Fluxo

1. Identificar os papéis pedidos e ler integralmente cada corpo correspondente em `.agents/agents/`.
2. Ler as origens apontadas no corpo somente quando o gatilho da referência for satisfeito.
3. Para criação ou atualização, preservar em cada corpo: identidade, gatilho, aquisição por paths, permissões, entrada/saída, término, ownership, dependências, gates/reentrada e denies.
4. Conferir que o papel adquire conteúdo diretamente nos paths autorizados; não aceitar resumo substantivo como substituto da origem.
5. Manter o corpo independente de qualquer ferramenta. Decisões específicas do destino pertencem ao builder consumidor.
6. Comparar os seis corpos por inspeção e reportar paths alterados mais uma matriz curta de cobertura.

## Fontes canônicas

- [[.agents/agents/pop-planner|pop-planner]] — leia ao criar ou traduzir o planejador de 002.
- [[.agents/agents/pop-recon|pop-recon]] — leia ao criar ou traduzir o especialista de reconhecimento delegado.
- [[.agents/agents/pop-execution-orchestrator|pop-execution-orchestrator]] — leia ao criar ou traduzir o coordenador de frentes em 004.
- [[.agents/agents/pop-executor|pop-executor]] — leia ao criar ou traduzir quem implementa uma frente em 004.
- [[.agents/agents/pop-judge-dredd|pop-judge-dredd]] — leia ao criar ou traduzir o juiz dos gates yolo.
- [[.agents/agents/pop-phase-verifier|pop-phase-verifier]] — leia ao criar ou traduzir o verificador da task final de phase.

Não copiar os corpos para esta skill, `references/` ou `assets/`.

## Criar ou atualizar

Criar um arquivo por especialista, com nome canônico e seções explícitas. Alterar somente a fonte afetada; se a mudança for compartilhada, aplicar conscientemente aos seis corpos e conferir divergências intencionais. O agente principal não é um papel materializado: segue `AGENTS.md`, delega primeiro e conserva somente roteamento, integração e transições. Rejeitar pedidos que removam separação entre planejamento, execução, julgamento e integração.

Exemplo mínimo: “Atualize `pop-executor` para adquirir um novo contrato.” Ler o corpo, seguir o gatilho do contrato, acrescentar o path autorizado e ajustar I/O ou término apenas se a nova dependência exigir.

## Consumir em builder futuro

Ler o corpo inteiro do papel selecionado e mapear cada obrigação para os recursos oficiais da ferramenta de destino. Preservar poderes e denies, produzir artefato autocontido e registrar qualquer capacidade que não tenha equivalência. Não editar a fonte para acomodar limitação do destino.

Exemplo mínimo: “Prepare a tradução de `pop-planner` para um builder.” Entregar o mapeamento entre as seções do corpo e os campos/capacidades do destino, mantendo a fonte intacta e marcando lacunas como `BLOCKED` quando alterarem a semântica.

## Evidência e parada

Finalizar com `concluída` e evidência por path quando todos os tópicos obrigatórios estiverem cobertos e nenhum deny tiver sido enfraquecido. Finalizar com `BLOCKED` quando faltar origem/dependência, houver incompatibilidade semântica ou a autorização exigir ampliar leitura, escrita ou poderes.
