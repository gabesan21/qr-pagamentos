---
name: create-agent-kimi-code
description: Projetar um dos seis especialistas do PoP em agent Markdown e configuração candidata do Kimi Code, com routing simbólico primary/secondary e validação fail-closed. O principal segue AGENTS.md e não é materializado.
---

# Criar agent do Kimi Code

Tratar `.agents/agents/<papel>.md` como fonte autoral. Gerar uma projeção autocontida; nunca editar o corpo canônico para acomodar o Kimi.

## Limites do formato

- Usar apenas os campos conhecidos `name`, `description`, `whenToUse`, `override`, `model_preference`, `tools`, `disallowedTools` e `subagents`.
- Tratar `primary` como o model corrente do main e `secondary` como `[secondary_model]`; neste harness, secondary aponta sempre para `kimi-code/kimi-for-coding` (K2.7). Nunca gravar alias concreto no agent.
- Não prometer model+effort efetivos por spawn, nesting máximo ou validação agregada dos agents. Se alguma dessas garantias for exigida, terminar `BLOCKED`.
- Rejeitar K2.7/`kimi-for-coding` com effort `medium`: Thinking booleano não demonstra esse nível.
- Validar o TOML candidato com `tomllib`; a skill nunca executa o Kimi Code.

## Fluxo

1. Ler integralmente o corpo selecionado e [[.agents/skills/create-agent-generic/SKILL|create-agent-generic]]; conferir os nove tópicos semânticos e os denies.
2. Escolher `primary` ou `secondary`. Para `secondary`, exigir config fonte, config candidata e o alias K2.7; omitir `default_effort`, pois K2.7 usa Thinking booleano quando não declara `support_efforts`.
3. Executar `pop/scripts/build_agent.py build`. O script preserva o corpo integral, aplica allowlists conservadoras e gera config candidata; a materialização autorizada usa `.kimi-code/config.toml` com K3 primary e K2.7 secondary, sem credenciais.
4. Executar `pop/scripts/build_agent.py validate` contra a fonte, o agent gerado e, quando houver, o TOML candidato.
5. Reportar paths, routing, hashes, determinismo e limitações. Terminar `BLOCKED` se uma obrigação/deny não couber no schema.

Geração e validação não podem invocar `kimi`, nem mesmo para version, help, doctor, carregamento ou discovery. A entrega é a presença dos arquivos configurados na pasta correspondente.

## Comandos

```sh
python3 pop/scripts/build_agent.py build \
  --source .agents/agents/pop-planner.md \
  --agent-out /tmp/kimi-agents/pop-planner.md \
  --routing primary

python3 pop/scripts/build_agent.py build \
  --source .agents/agents/pop-executor.md \
  --agent-out /tmp/kimi-agents/pop-executor.md \
  --routing secondary --config-source /path/config.toml \
  --config-out /tmp/kimi-config.toml \
  --secondary-model kimi-code/kimi-for-coding

python3 pop/scripts/build_agent.py validate \
  --source .agents/agents/pop-executor.md \
  --agent /tmp/kimi-agents/pop-executor.md --routing secondary \
  --config /tmp/kimi-config.toml
```

Para requisito não demonstrado, passar `--require-guarantee effective-model-effort`, `max-agent-nesting` ou `aggregate-agent-validation`; o exit não zero é deliberado. Não contornar a recusa removendo o flag.

## Cobertura obrigatória

O corpo canônico integral preserva identidade, gatilho, aquisição, permissões, entrada/saída, término, ownership, dependências, gates/reentrada e denies. O frontmatter apenas acrescenta enforcement representável: allowlist de tools, denylist e allowlist de subagents. Restrição por path continua no corpo; não a rotular como sandbox do runtime.

## Fontes

- [[researches/harnesses-nativos-de-agentes/kimi-code-agents|Agents do Kimi Code]] — leia antes de mudar schema, routing, permissões ou validação.
- [[specs/orquestracao-multiagente|Orquestração multiagente]] — leia para preservar papéis, envelope, ownership e gates.
