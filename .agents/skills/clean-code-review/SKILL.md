---
name: clean-code-review
description: Roteiro de revisão de código com severidade e evidência - verificar comportamento, complexidade, nomes e testes sem virar policiamento estético. Use ao verificar tasks de código (005) e como critério de leitura em gates de plano ou PR. Só projetos de código.
---

# clean-code-review

**Princípio: aprova-se a mudança que melhora a saúde geral do código, não a mudança perfeita.** A revisão produz evidência, não opinião: cada comentário aponta trecho, impacto e severidade. Quem escreve o código usa a skill irmã `clean-code-change`.

**Parametrização:** rode/confira os comandos declarados na seção **"Verificação do projeto"** do AGENTS.md do projeto. Nunca bloqueie por preferência pessoal, contagem de linhas ou estilo que ferramenta automática já cobre.

## Roteiro de leitura

1. Leia primeiro **objetivo, contrato afetado e testes**; só então o diff — na ordem em que o sistema o executa ou o usuário o experimenta, não na ordem alfabética dos arquivos.
2. Verifique, nesta ordem de importância:
   - **Comportamento e bordas:** o código faz o que o contrato promete? Casos de erro, limites e efeitos externos cobertos?
   - **Testes:** existem, são simples e falhariam se o comportamento novo quebrasse? Teste que nunca falha não protege.
   - **Complexidade e acoplamento:** a mudança reduz ou ao menos não aumenta a complexidade acidental? A abstração nova representa variação real?
   - **Nomes e comentários:** intenção legível sem decifrar detalhes; comentário explica "porquê", não narra o código.
   - **Consistência local e documentação:** segue o idioma do arquivo/projeto; documentação e specs afetadas atualizadas.
3. Confirme a **evidência automática**: formatter/linter/testes do projeto executados e limpos (ou desvio justificado por escrito).

## Severidade de cada comentário

| Severidade | Quando | Efeito |
|------------|--------|--------|
| **bloqueante** | Correção, risco, quebra de contrato, teste ausente para comportamento novo | Impede aprovação até resolver |
| **sugestão** | Melhoria justificável de leitura, coesão ou custo futuro | Autor decide; registrar a razão |
| **nit** | Preferência não bloqueante | Nunca segura a mudança |

- Todo comentário traz **trecho + impacto + razão** — "fica mais limpo" não é razão; "o leitor precisa simular 3 estados para saber se X ocorre" é.
- Se a explicação do autor só vive na conversa, peça que ela vire **código mais simples ou comentário de motivo** — conversa se perde, código fica.

## Decisão

- **Aprove** quando a mudança melhora a saúde do código, mesmo imperfeita.
- Dívida identificada mas adiada exige **follow-up explícito e rastreável** (nota no card, seção "Aberto" da spec ou proposta de task) — aprovar sem registrar é perder a dívida.
- **Devolva** (no PoP: retorno de 005 para 004/002) apenas por item bloqueante, citando o critério ferido e a evidência.

## O que esta revisão não é

- Não é gate de perfeição nem de gosto: estilo automatizável pertence ao formatter/linter, não ao revisor.
- Não é auditoria do repositório inteiro: o escopo é o diff e o que ele toca.
- Não impõe limites numéricos nem padrões de OO — coesão, domínio e evidência decidem.
