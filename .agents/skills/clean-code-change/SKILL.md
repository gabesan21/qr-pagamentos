---
name: clean-code-change
description: Práticas de clean code para quem escreve código - clarificar o contrato antes de codar, legibilidade local, refatoração segura e triagem de dívida. Use em toda task que cria ou altera código, ao planejar (002) e ao executar (004). Só projetos de código.
---

# clean-code-change

**Princípio: código limpo é código que quem não o escreveu entende e modifica com segurança.** Clean code não é métrica única nem checklist estético — é evidência: contrato claro, teste que protege, diff com uma intenção. Esta skill acompanha quem **escreve** código; a revisão usa a irmã `clean-code-review`.

**Parametrização:** os comandos de verificação (formatter, linter, testes) são os declarados na seção **"Verificação do projeto"** do AGENTS.md do projeto. Esta skill nunca impõe limites numéricos (linhas, parâmetros, aninhamento), SOLID ou padrões de OO — coesão e domínio decidem, não contagem.

## 1. Clarifique antes de codar

**Gatilho:** o requisito, bug ou diff ainda não permite explicar comportamento, fronteiras e efeito observável em poucas frases.

1. Declare **entrada, saída, invariantes, casos de erro e efeitos externos** da mudança.
2. Localize o contrato existente: API, tipo, teste, documentação ou chamada representativa.
3. Escolha o **menor ponto de mudança** que preserva esse contrato; sem contrato verificável, escreva ou atualize o teste **antes** da alteração estrutural.
4. Separe preparação/refatoração da mudança funcional quando misturá-las tornar o diff difícil de revisar.

**Saída verificável:** descrição do comportamento + teste/cenário que **falha antes e passa depois** da mudança. Em task do kanban, isso alimenta a tabela "Critérios de aceite e verificação" do plano (002).

## 2. Legibilidade local

**Gatilho:** o leitor precisa simular muitos estados, adivinhar a intenção de um nome ou alternar entre arquivos para entender uma unidade.

1. Renomeie símbolos para **domínio, papel e unidade** — nem siglas opacas, nem frases redundantes.
2. Torne o caminho feliz e os casos excepcionais **distinguíveis**; reduza negações e aninhamento apenas quando o fluxo ficar mais direto.
3. Extraia função/conceito **somente** se o resultado for um nome que explica uma ideia mantendo coesão — não divida uma operação coesa em camadas artificiais para "encurtar".
4. Comentário serve para **motivo, restrição, trade-off ou protocolo externo**; apague comentário que apenas narra o código.

**Saída verificável:** um leitor novo explica "o quê" e "por quê" olhando nomes, organização e comentário mínimo.

## 3. Refatore com segurança

**Gatilho:** uma mudança recorrente está cara por acoplamento, duplicação com regra realmente comum, fluxo opaco ou fronteira de módulo confusa.

1. **Caracterize** o comportamento atual com testes, exemplos executáveis ou outra observação confiável — sem rede, primeiro reduza o risco.
2. Nomeie a **hipótese** (que leitura/manutenção fica mais simples) e o **risco** (que comportamento não pode mudar).
3. Aplique **uma transformação pequena por vez**: renomear, extrair, mover, encapsular, simplificar condição.
4. Compile, rode os testes relevantes e revise o diff **a cada passo**; pare quando o objetivo for atendido.
5. Refatoração ampla vai em mudança **separada** da funcionalidade (no PoP: outra task), salvo limpeza local óbvia.

**Saída verificável:** comportamento preservado por testes e diff com **uma única intenção estrutural**.

## 4. Duplicação e abstração

- Unifique duplicação **só** se a regra e o ritmo de mudança forem os mesmos — abstração prematura mistura casos distintos e custa mais que a repetição.
- Uma abstração é valiosa quando simplifica uma **variação real**; não generalize por adivinhação nem crie interface de uso único.
- Simplicidade = a **menor quantidade de conceitos** que atende o requisito atual.

## 5. Triagem de dívida na mudança

**Gatilho:** a alteração introduz complexidade, duplicação ou um alerta de ferramenta — não espere o repositório degradar.

1. Rode formatter, linter, análise estática e testes **do projeto** (seção "Verificação do projeto" do AGENTS.md).
2. Diferencie **alerta mecânico de risco real**: priorize caminho crítico, código frequentemente alterado, falha de teste, segurança e custo de entendimento. Smell é sinal de investigação, não prova de defeito.
3. Corrija o que é **local e seguro** dentro da task; dívida maior vira item rastreável (nota no card, seção "Aberto" da spec ou proposta de task) com contexto, impacto e próximo passo.
4. A régua é **melhorar a saúde geral a cada mudança**, não exigir perfeição antes de integrar.

**Saída verificável:** evidência dos comandos executados e decisão explícita para cada desvio relevante.

## O que esta skill não é

- Não é maximizar número de arquivos, classes, interfaces ou camadas.
- Não é obedecer limites rígidos de linhas, parâmetros ou aninhamento ignorando coesão e domínio.
- Não substitui arquitetura, segurança, desempenho, acessibilidade, requisitos nem testes de integração.
- Não justifica refatorar sem valor: código pouco elegante, mas estável e raro de mudar, pode não ser prioridade — nunca reescreva código estável sem benefício demonstrável.
