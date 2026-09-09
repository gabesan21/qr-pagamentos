---
name: create-agent-codex
description: Gerar, atualizar e validar localmente custom agents nativos do Codex a partir dos contratos canônicos em `.agents/agents/`. Use ao traduzir um papel agent-agnostic para TOML em `.codex/agents/` e conferir schema, perfil, conteúdo, hash, determinismo e colisões sem executar modelo ou acessar provider.
---

# Criar agent Codex

Projetar um papel canônico para TOML standalone sem alterar sua semântica. Usar `pop/scripts/build_agent.py` para tornar validação local e escrita final reproduzíveis. Esta skill nunca envia prompt, agent, configuração ou contexto a provider.

## Fluxo

1. Ler integralmente o papel em `.agents/agents/<papel>.md` e as origens disparadas por ele. Nunca usar resumo como origem.
2. Escolher somente valores permitidos pelo perfil local em `references/config-contract.md`.
3. Renderizar um candidato fora de `.codex/agents/`:

   ```bash
   python .agents/skills/create-agent-codex/pop/scripts/build_agent.py render \
     .agents/agents/pop-executor.md /tmp/pop-executor.toml \
     --model gpt-5.6-terra --effort medium --sandbox-mode workspace-write
   ```

4. Validar o candidato localmente e promover atomicamente:

   ```bash
   python .agents/skills/create-agent-codex/pop/scripts/build_agent.py validate-static \
     /tmp/pop-executor.toml --source .agents/agents/pop-executor.md
   python .agents/skills/create-agent-codex/pop/scripts/build_agent.py promote \
     /tmp/pop-executor.toml .codex/agents/pop-executor.toml \
     --source .agents/agents/pop-executor.md
   ```

5. Para atualizar um agent já válido do mesmo nome, repetir o fluxo e passar `--replace` no `promote`. Nunca substituir colisão malformada ou de outro papel.
6. Conferir localmente os bytes e hashes de uma segunda renderização. Não usar `codex exec`, chat, spawn, autenticação, rede ou chamada de modelo como validação.

## Validação e status

- `validate-static <toml> --source <papel.md>` confere parser TOML, schema fechado, perfil local e igualdade byte a byte com a projeção determinística da origem para o mesmo tuple.
- `promote <candidato> <destino> --source <papel.md>` repete a comparação canônica antes de escrever; candidato ou destino existente adulterado falha sem troca.
- Tratar entrada/schema/enum inválido como `INVALID` (código 2) e colisão insegura como `COLLISION` (código 4). Todas falham antes de substituir o destino.
- O nome do arquivo final deve corresponder ao `name` declarado e o destino deve estar sob `.codex/agents/`.

## Invariantes semânticas

Preservar no `developer_instructions` o corpo canônico completo, incluindo identidade, gatilho, aquisição por paths, permissões, entrada/saída/término, ownership, dependências, gates/reentrada e denies. Sandbox não representa ownership ou tool deny. Ausência de qualquer seção obrigatória bloqueia a renderização.

Concluir com os paths de origem/candidato/destino, tuple configurado, digest validado e status `concluída`. Disponibilidade remota, resposta do modelo e comportamento de spawn não pertencem ao contrato deste harness local.
