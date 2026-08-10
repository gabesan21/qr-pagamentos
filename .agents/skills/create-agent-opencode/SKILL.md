---
name: create-agent-opencode
description: Gerar e validar localmente bundles candidatos dos seis subagents do OpenCode a partir dos contratos em `.agents/agents/`. Use ao projetar model, variant, permission, allowlists de Task/skill e subagent_depth, sem invocar modelos.
---

# Criar agents OpenCode

Tratar `.agents/agents/*.md` como fonte autoral e o bundle gerado como projeção descartável. Usar `pop/scripts/build_agents.py` para manter schema, colisões e escrita reproduzíveis.

## Fluxo

1. Ler integralmente os seis especialistas e [[.agents/skills/create-agent-generic/SKILL|create-agent-generic]]. O principal segue `AGENTS.md` e não é materializado.
2. Preparar um perfil fechado como `fixtures/profiles.valid.json`: cada tuple `provider/model` declara variants suportadas e cada papel fixa `mode`, `model`, `variant`, permissions e skills.
   O OpenCode separa o ID no primeiro `/`: modelos da assinatura Kimi usam `kimi-for-coding/<modelo>`; modelos escolhidos no OpenRouter usam `openrouter/<organização>/<modelo>`. Não copie o slug de catálogo do OpenRouter sem o prefixo do provider OpenCode.
3. Gerar em uma raiz candidata vazia ou gerida, nunca na raiz ativa nem diretamente em `.opencode/`:

   ```sh
   python3 .agents/skills/create-agent-opencode/pop/scripts/build_agents.py build \
     --source-dir .agents/agents \
     --profiles .agents/skills/create-agent-opencode/fixtures/profiles.valid.json \
     --destination /tmp/pop-opencode-candidate
   ```

4. Repetir com `validate-static`. Esse passo prova bytes, schema fechado, corpo integral, tuple, permissions, manifesto e `subagent_depth`.
5. Materializar os arquivos nos paths autorizados da task. Nunca editar o bundle gerado manualmente.

O builder e seus testes nunca invocam `opencode`, nem mesmo para version, help, list ou discovery. A entrega é a configuração materializada na pasta correspondente.

## Invariantes fail-closed

- Preservar no prompt o corpo canônico completo e seus nove tópicos. Enforcement nativo complementa ownership e denies; não os substitui.
- Aceitar somente `permission`; rejeitar `tools`, campos desconhecidos, model herdado, variant ausente, tuple sem capability, mode divergente e allowlist incompleta.
- Fixar os seis papéis como `subagent`. O agente principal nativo do OpenCode segue `AGENTS.md`; Task cria child session e `task_id` apenas retoma a mesma filha.
- Emitir `subagent_depth: 2`: o principal pode lançar especialistas e planner/execution-orchestrator podem declarar seu único tipo de filho. Manter waves/DAG no papel canônico.
- Negar `webfetch` e `websearch`; negar Task aos não delegadores; exigir allowlists exatas para planner e execution-orchestrator; exigir skill default-deny com entradas explícitas.
- Não habilitar background subagents, flags experimentais, concorrência ou qualquer compatibilidade Pi.
- Tratar descoberta apenas como prova local de nomes/modes listados. Model, variant, nesting, permissões e isolamento são declarações do bundle validadas por parser/schema; não executar prompt, modelo, provider, autenticação ou sessão para validá-las.
- A validação termina em geração determinística, hashes, políticas declaradas e segurança de escrita. Não criar discovery ou probe comportamental nem persistir IDs, credenciais ou evidência de runtime.

## Status

`BLOCKED` é terminal quando faltar capability declarada, origem ou deny representável. Não substituir uma falha local por execução de coding agent ou acesso externo.
