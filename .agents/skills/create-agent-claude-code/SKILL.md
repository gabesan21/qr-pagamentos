---
name: create-agent-claude-code
description: Gerar, atualizar e validar os seis especialistas do PoP no formato oficial do Claude Code, a partir de `.agents/agents/` e de perfis explícitos. Use ao materializar ou conferir `.claude/agents/`; o principal segue AGENTS.md e não é custom agent.
---

# Criar agentes para Claude Code

Tratar `.agents/agents/*.md` como única fonte semântica. Gerar uma projeção autocontida: frontmatter nativo seguido pelo corpo canônico integral, sem reescrever identidade, aquisição, ownership, gates ou denies.

## Preparar o perfil

1. Criar um JSON com `version: 1` e `roles`, contendo exatamente os seis especialistas canônicos.
2. Declarar em cada papel `model`, `effort`, `tools`, `disallowedTools`, `permissionMode`, `skills`, `nesting` e `web`.
3. Usar modelo explícito diferente de `inherit`; usar `effort` em `low|medium|high|xhigh|max`.
4. Manter `web: false` e negar `WebFetch` e `WebSearch` nos seis contratos.
5. Usar `nesting: false` em todos os especialistas; o agente principal da sessão faz o dispatch seguindo `AGENTS.md`.

Partir de `fixtures/profiles.valid.json` apenas como fixture executável; escolher modelo, effort e ferramentas conforme a policy real do ambiente.

## Gerar e validar

O builder e seus testes nunca invocam `claude`, nem mesmo para version, help, doctor, context ou carregamento. A entrega é a configuração materializada em `.claude/agents/`, validada por parser, hashes e determinismo.

```bash
python3 .agents/skills/create-agent-claude-code/pop/scripts/build_agents.py generate \
  --source-dir .agents/agents \
  --profiles perfil.json \
  --destination .claude/agents \
  --runtime runtime.json

python3 .agents/skills/create-agent-claude-code/pop/scripts/build_agents.py validate \
  --source-dir .agents/agents \
  --profiles perfil.json \
  --destination .claude/agents \
  --runtime runtime.json
```

Omitir `--runtime` apenas quando nenhum override conhecido puder ser inspecionado. O script sempre verifica `CLAUDE_CODE_SUBAGENT_MODEL`. O JSON de runtime aceita somente:

- `invocationModels`: mapa parcial papel → modelo efetivo;
- `availableModels`: lista da policy que deve conter todos os modelos declarados;
- `parentPermissionMode`: modo do pai que prevalece sobre o agent;
- `thinkingEnabled`: estado herdado da sessão, validado mas nunca emitido.

`generate` monta e valida toda a árvore em staging, preserva arquivos não geridos e só então troca o destino com rollback. Colisão com arquivo não gerido, symlink, origem ausente, campo desconhecido ou incompatibilidade termina sem mutar o destino. `validate` também compara bytes e hashes do manifesto.

## Limites fail-closed

- Não adicionar campo de thinking ao frontmatter: Claude Code herda esse estado da sessão.
- Não prometer que o frontmatter supera environment, invocação, `availableModels` ou modo do pai. Informar overrides conhecidos via `--runtime`; divergência bloqueia.
- Não expressar allowlist de filhos como garantia em subagent aninhado: o runtime ignora os nomes entre parênteses nesse caso. Se o contrato exigir essa restrição estática, parar como `BLOCKED`.
- Não usar o builder para editar `.agents/agents/`. Corrigir a fonte pela skill `create-agent-generic` e regenerar.
- Não executar comandos do Claude Code como parte da geração ou validação.

## Evidência

Reportar comando, manifesto gerado, seis arquivos conferidos e resultado. `concluída` exige segunda geração sem mudança de bytes; qualquer equivalência não demonstrável que enfraqueça um deny resulta em `BLOCKED`.
