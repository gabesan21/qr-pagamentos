---
name: update-harness
description: Verifica se o harness deste repositório está em dia com o PoP original (https://github.com/gabesan21/project-of-projects) e atualiza respeitando o formato — merge git em fork completo, reinstalação gerida em repo included. Use quando o usuário pedir para atualizar o harness, sincronizar com o PoP original ou checar defasagem do fluxo.
---

# update-harness

Mantém o harness deste repositório em dia com o PoP original, **sem pisar no que é do usuário**. As atualizações do upstream são sempre *mergeadas* com o estado local — nunca sobrescritas cegamente.

**Roda fora do kanban, sempre.** Atualização de harness é manutenção do material que o kanban consulta — sem card, branch, worktree ou PR de task (regra 13 e "Escopo corrente" do [[WORKFLOW|WORKFLOW]]).

## Princípios

- **Confirmação antes de escrever:** a skill verifica e propõe; o humano confirma antes de qualquer merge ou reinstalação. Push, nunca — só por ordem explícita.
- **Nada é perdido:** fork atualiza por merge git (conflito vira decisão do humano); included atualiza pela reinstalação gerida, que só sobrescreve o conjunto gerido e só poda o que o inventário anterior registrou. Specs, roadmap, memory, notas e arquivos próprios ficam intactos por construção.
- **Arquivo gerido editado localmente é drift:** se `git status` mostrar modificação local em arquivo do conjunto gerido, reporte ao humano antes de atualizar — a atualização o descarta por design, mas nunca em silêncio.

## 1. Detecte o formato

- Existe `pop/.unirepo-harness.json` → **included** (harness instalado por `pop_install_unirepo.py`).
- Não há marcador e a raiz tem `WORKFLOW.md` + `kanban/` → **fork** (cópia completa do PoP).
  - Se o remote `origin` já é `https://github.com/gabesan21/project-of-projects`, este repo é um **clone da origem**: atualize com `git pull` comum e encerre.
- Nenhum dos dois → este repo não usa o PoP; diga isso e pare.

## 2. Verifique a frescor

### Included

O marcador carimba o `content_sha` do harness na origem no momento da instalação.

1. Descubra a origem — **pergunte ao humano se não souber**: uma cópia local do PoP (a que instalou este repo) ou o repositório público. Sem origem local conhecida, faça um clone raso do público em pasta temporária: `git clone --depth 1 https://github.com/gabesan21/project-of-projects /tmp/pop-upstream`.
2. Compare: `python3 <origem>/pop/scripts/pop_install_unirepo.py --sha` com o campo `content_sha` de `pop/.unirepo-harness.json`. Iguais → harness em dia, encerre.
3. **Aviso de origem diferente:** sha diferente pode significar defasagem *ou* origem distinta da que instalou (outro idioma, outra versão). Reinstalar do repositório público sobre um harness instalado de uma origem em outro idioma **troca o idioma do harness inteiro**. Nesse caso, pare e confirme com o humano antes de seguir.

### Fork

1. `git remote add upstream https://github.com/gabesan21/project-of-projects` (se ausente) e `git fetch upstream`.
2. `git log --oneline HEAD..upstream/main` vazio → em dia, encerre. Senão, liste os commits novos para o humano.

## 3. Atualize (após confirmação)

### Included → reinstalação gerida

1. `git status` limpo nos arquivos geridos? Se houver edição local neles, reporte o `git diff --stat` antes de prosseguir.
2. `python3 <origem>/pop/scripts/pop_install_unirepo.py .` — idempotente: sobrescreve só o conjunto gerido e poda só o que o inventário anterior autoriza.
3. Commit próprio no repo: mensagem curta dizendo que o harness foi atualizado (ex.: `chore: atualiza harness PoP`).

### Fork → merge git

1. `git merge upstream/main` na branch padrão do fork. Nunca `reset --hard`, nunca `--ours`/`--theirs` automático.
2. O upstream só carrega harness — seu conteúdo próprio (projetos, notas, memory) não existe lá, então o merge não o toca.
3. Conflito → pare e apresente os arquivos em conflito ao humano; a decisão é dele.

## 4. Reporte

Feche com um resumo curto: formato detectado, versão anterior → versão atual (sha ou range de commits), arquivos geridos tocados e qualquer drift descartado com ciência do humano.
