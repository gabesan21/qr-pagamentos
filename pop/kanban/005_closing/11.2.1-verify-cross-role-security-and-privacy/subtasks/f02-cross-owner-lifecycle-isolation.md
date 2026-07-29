# F02 — Cross-owner and lifecycle isolation

## Objetivo

Provar que merchant A não lê/altera dados de merchant B e que usuários deletados ou desabilitados não agem.

## Escopo

- Auditar queries de orders, links, products, categories, storefront, media.
- Adicionar testes de ID de outro owner em rotas owner-scoped.
- Adicionar testes de login com status DISABLED e sessão revogada.
- Adicionar testes de soft-delete impedindo mutações no target.

## Critérios

- Tentativa de acesso a resource de outro owner retorna unavailable/404/403 opaco.
- Usuário DISABLED não autentica; sessão revogada não autoriza.
- Soft-deleted target falha em toda mutação com not-found opaco.

## Critérios de aceite

- Acesso a resource de outro owner retorna unavailable/404/403 opaco.
- Login com status DISABLED e sessão revogada não autorizam.
- Soft-deleted target falha em toda mutação com not-found opaco.

## Specs

- [[pop/specs/administrative-foundation|Administrative foundation]]
- [[pop/specs/product-scope|Product scope]]

## Não editar

Services existentes, salvo para corrigir falha severity-1.
