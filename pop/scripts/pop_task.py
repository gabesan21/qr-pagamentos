#!/usr/bin/env python3
"""pop_task — scaffolding de uma task nova em 001_initial_task.

Cria `kanban/001_initial_task/<id>/<id>.md` no harness do projeto indicado
(`pop/kanban/...` na anatomia nova, `kanban/...` na legada) a partir de
`_templates/TASK.md`, preenchendo id, project, origem (epoch/phase do roadmap
ou modification), datas e título, e cria a pasta `subtasks/` vazia. Recusa se
a task já existir em qualquer projeto/estágio (ids são únicos no vault).

Duas origens de id: roadmap `<epoch>.<phase>.<task>-<slug>` (ex.:
1.2.3-user-table) e modifications `M-<modification>.<task>-<slug>` (ex.:
M-1.1-ajusta-contrato — task 1 da modification M-1).

Uso:
    python3 scripts/pop_task.py <categoria>/<projeto> <task-id> [--title "..."]
    ex.: python3 scripts/pop_task.py agents/meu-projeto 1.2.3-user-table-creation
         python3 scripts/pop_task.py agents/meu-projeto M-1.1-ajusta-contrato
    Repo embutido (full-multi-repo): <categoria>/<projeto>/<repo>.
"""

import argparse
import re
import sys

import poplib

ROADMAP_ID = re.compile(r"^(\d+)\.(\d+)\.(\d+)-([a-z0-9][a-z0-9-]*)$")
MODIFICATION_ID = re.compile(r"^M-(\d+)\.(\d+)-([a-z0-9][a-z0-9-]*)$")


def fill_template(template, task_id, project, title):
    """Substitui os placeholders óbvios do _templates/TASK.md.

    Preenche só o bloco de frontmatter da origem da task e apaga o da origem
    não usada, como o template instrui: roadmap fica com `epoch`/`phase`
    (sem `modification`); modifications fica com `modification: M-<n>`
    (sem `epoch`/`phase`).
    """
    date = poplib.today()
    roadmap = ROADMAP_ID.match(task_id)
    text = template
    if roadmap:
        epoch, phase_n, task_n, slug = roadmap.groups()
        numeric_id = f"{epoch}.{phase_n}.{task_n}"
        text = text.replace("\nmodification:\n", "\n")
        pairs = [
            ("<n>.<m>.<t>", numeric_id),
            ("<n>.<m>", f"{epoch}.{phase_n}"),
            ("<n>", epoch),
        ]
    else:
        mod_n, task_n, slug = MODIFICATION_ID.match(task_id).groups()
        numeric_id = f"M-{mod_n}.{task_n}"
        text = text.replace("\nepoch: <n>\n", "\n")
        text = text.replace('\nphase: "<n>.<m>"\n', "\n")
        text = text.replace("\nmodification:\n", f"\nmodification: M-{mod_n}\n")
        pairs = [
            ("<n>.<m>.<t>", numeric_id),
            ("origin: roadmap", "origin: modifications"),
            ("M-<n>", f"M-{mod_n}"),
        ]
    pairs += [
        ("<categoria>/<projeto>", project),
        ("<id>-<slug>", task_id),
        ("<título curto>", title or slug.replace("-", " ")),
        ("created: AAAA-MM-DD", f"created: {date}"),
        ("updated: AAAA-MM-DD", f"updated: {date}"),
        ("- AAAA-MM-DD — criada em 001_initial_task — <motivo/origem>",
         f"- {date} — criada em 001_initial_task — via pop_task"),
    ]
    for old, new in pairs:
        text = text.replace(old, new)
    return text


def main():
    parser = argparse.ArgumentParser(
        description="Cria a pasta e o card de uma task nova em "
                    "kanban/001_initial_task, a partir de _templates/TASK.md.")
    parser.add_argument("project", metavar="CATEGORIA/PROJETO",
                        help="projeto de destino (ex.: agents/meu-projeto; "
                             "repo embutido: applications/meu-app/frontend)")
    parser.add_argument("task_id", metavar="TASK-ID",
                        help="id completo da task (ex.: 1.2.3-user-table-creation "
                             "ou M-1.1-ajusta-contrato)")
    parser.add_argument("--title", help="título curto do card "
                                        "(default: slug com espaços)")
    parser.add_argument("--vault", metavar="DIR",
                        help="raiz do vault (default: pasta acima de scripts/)")
    args = parser.parse_args()

    modification = MODIFICATION_ID.match(args.task_id)
    if not modification and not ROADMAP_ID.match(args.task_id):
        print(f"Id inválido: {args.task_id} — esperado "
              f"<epoch>.<phase>.<task>-<slug-kebab> (ex.: 1.2.3-user-table) ou "
              f"M-<modification>.<task>-<slug-kebab> (ex.: M-1.1-ajusta-contrato).")
        return 1

    root = poplib.vault_root(args.vault)
    project_dir = poplib.project_dir(root, args.project)
    harness = poplib.harness_root(project_dir)  # pop/ na anatomia nova
    if not (harness / "kanban").is_dir():
        print(f"Projeto sem kanban/ (nem pop/kanban/): {project_dir} — "
              f"confira <categoria>/<projeto>[/<repo>].")
        return 1
    existing = poplib.find_task(root, args.task_id)
    if existing:
        _, stage, task_dir = existing
        print(f"Task já existe em {stage}: {task_dir}")
        return 1
    template_path = poplib.templates_dir(root) / "TASK.md"
    if not template_path.is_file():
        print(f"Template não encontrado: {template_path}")
        return 1

    task_dir = harness / "kanban" / "001_initial_task" / args.task_id
    task_dir.mkdir(parents=True)
    (task_dir / "subtasks").mkdir()
    card = task_dir / f"{args.task_id}.md"
    card.write_text(
        fill_template(template_path.read_text(encoding="utf-8"),
                      args.task_id, args.project, args.title),
        encoding="utf-8")
    print(f"OK: task criada em {card}")
    if modification:
        print("Lembrete: preencha 'O quê', 'Por quê' e depends_on, e linke "
              "[[{}]] na modification (MODIFICATIONS.md ou "
              "modifications/m-{}-*.md).".format(args.task_id,
                                                 modification.group(1)))
    else:
        print("Lembrete: preencha 'O quê', 'Por quê' e depends_on, e linke "
              "[[{}]] no arquivo da epoch.".format(args.task_id))
    print("A task só sai de 001 quando o humano marcar "
          "`- [x] Pronto para planejar` (seção Liberação do card).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
