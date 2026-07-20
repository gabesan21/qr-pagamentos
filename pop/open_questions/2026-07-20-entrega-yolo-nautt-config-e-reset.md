---
status: aberta
origem: sessão
created: 2026-07-20
---

# Entrega yolo: base URL Nautt configurável + reset de onboarding — validar em develop e decidir PR para main

Escopo yolo de 2 tasks da Epoch 0 concluído e integrado em `develop` (sem PR por task):

1. [[0.1.1-configurable-nautt-base-url]] — `NAUTT_API_BASE_URL` (opcional, HTTPS canônico, default produção) alimenta os três clientes Nautt; documentada em `.env.example`, `install/`, `compose.yaml`. Merge `a3a82ae`.
2. [[0.1.2-reset-nautt-credential-onboarding]] (**critical**) — reset local-only de onboarding travado (`REGISTERING`/`INDETERMINATE` → `UNREGISTERED`), rota `POST /nautt-credentials/reset`, affordance bilíngue com disclosure. Merge `e80dae2`.
3. [[0.1.3-accept-real-webhook-registration-envelope]] (**critical**) — causa raiz do travamento: produção omite `success` no 201 do `POST /client-webhooks` e o adapter o descartava como ambíguo; envelope real aceito, validação estrita de `data` intacta. Merge `e60d617`.

**Como testar:**
- Suba o ambiente atualizado e, na conta travada (`?nautt=recovery`), use o botão de reset; refaça o cadastro da key — com a correção do envelope, o registro agora deve concluir em `ACTIVE` (o webhook já existente na Nautt vira órfão inerte; apague-o no painel se possível).
- Para sandbox: defina `NAUTT_API_BASE_URL=https://<sandbox>/api/v2` no `.env` e refaça o onboarding; valor inválido (http, credenciais, fragmento) deve ser rejeitado sem detalhar o motivo.
- `pnpm check`, `install/test.sh` e `pnpm container:contract-check` já verdes em develop.

**Follow-ups não bloqueantes registrados:** copy `nauttRecoveryRequired` ficou obsoleta ao lado do botão de reset; nit de `//` no path quando o override termina em `/`; sugestão sobre `activate()` sem claim-token (seguro hoje).

Decisão pendente do humano: testar o deliverable e autorizar (ou não) o PR `develop` → `main`.

## Resposta (user)

