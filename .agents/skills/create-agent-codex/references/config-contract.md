# Contrato de configuração Codex

## Perfil local capturado em 2026-08-08

- Chaves standalone: `name`, `description`, `developer_instructions`, `model`, `model_reasoning_effort`, `sandbox_mode`.
- Models declarados por este builder: `gpt-5.6-sol`, `gpt-5.6-terra`.
- Efforts aceitos no artefato: `minimal`, `low`, `medium`, `high`, `xhigh`.
- Sandbox: `read-only`, `workspace-write`, `danger-full-access`.

Fontes oficiais: `https://learn.chatgpt.com/docs/agent-configuration/subagents`, `https://learn.chatgpt.com/docs/config-file/config-reference` e `https://learn.chatgpt.com/docs/models`, consultadas em 2026-08-08. Os identificadores são gravados como configuração local; o builder não testa conta, provider, disponibilidade ou resposta de modelo. `max|ultra` não entram na allowlist local.

## Fronteira de validação

Validação cobre somente parse TOML, schema fechado, strings não vazias, enums locais, nome, caminho final e SHA-256. `validate-static` e `promote` exigem o Markdown canônico e refazem a projeção com o tuple do candidato; qualquer diferença de corpo ou bytes é tamper e falha antes da escrita. Repetir render/promoção comprova determinismo e idempotência. Não há JSON de prova nem comando que inicie sessão, prompt, modelo, autenticação, rede ou provider.

## Escrita segura

`render` e `promote` escrevem arquivo temporário no diretório do destino, sincronizam e fazem rename atômico. `promote` aceita somente `.codex/agents/<name>.toml`. Destino existente requer `--replace`; mesmo assim, deve corresponder à origem canônica e ter o mesmo `name`. Toda validação ocorre antes da troca.
