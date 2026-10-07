---
task: F-20261007-nautt-webhook-400-diagnostics
entry: 01-structured-reasons
---

# Classificação e registro estruturado de rejeições 400

Estendeu o parser `parseWebhookEnvelope` e o writer `logWebhookRejection` para classificar e emitir exatamente um log estruturado por requisição rejeitada com HTTP 400 após autenticação HMAC bem-sucedida.

As razões identificam `invalid_utf8`, `invalid_json`, `schema_invalid`, headers ausentes/divergentes (`delivery_header_invalid`, `delivery_header_mismatch`, `event_header_invalid`, `event_header_mismatch`), datas inválidas, integridade de tentativas e `claim_identity_conflict`. Nenhum corpo bruto, assinatura, segredo ou chave privada é exposto; falhas de persistência continuam retornando 503 sem log de 400.

## Evidência

- [[pop/specs/nautt-finance-integration|Nautt Finance integration]] — *requisito atualizado de rejeição 400 observável*.
- [[src/integrations/nautt/webhook-envelope.ts]] — *classificação fechada de parsing e headers*.
- [[src/integrations/nautt/webhook-intake.ts]] — *emissão segura do diagnóstico antes do retorno 400*.
- [[src/observability/webhook-rejection-log.ts]] — *writer estruturado seguro e redaction*.
