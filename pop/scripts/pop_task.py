#!/usr/bin/env python3
"""pop_task — scaffolding de uma task nova em 001_initial_task.

Cria `kanban/001_initial_task/<id>/<id>.md` no harness do projeto indicado
(`pop/kanban/...` na anatomia nova, `kanban/...` na legada) a partir de
`_templates/TASK.md`, preenchendo id, project, epoch, phase, datas e título,
e cria a pasta `subtasks/` vazia. Recusa se a task já existir em qualquer
projeto/estágio (ids são únicos no vault).

Uso:
    python3 scripts/pop_task.py <categoria>/<projeto> <task-id> [--title "..."]
    ex.: python3 scripts/pop_task.py agents/meu-projeto 1.2.3-user-table-creation
    Repo embutido (full-multi-repo): <categoria>/<projeto>/<repo>.
"""

import argparse
import re
import sys

import poplib

TASK_ID = re.compile(r"^(\d+)\.(\d+)\.(\d+)-([a-z0-9][a-z0-9-]*)$")


def fill_template(template, task_id, project, title):
    """Substitui os placeholders óbvios do _templates/TASK.md."""
    epoch, phase_n, _, slug = TASK_ID.match(task_id).groups()
    phase = f"{epoch}.{phase_n}"
    numeric_id = task_id.split("-", 1)[0]
    date = poplib.today()
    text = template
    for old, new in (
        ("<n>.<m>.<t>", numeric_id),
        ("<n>.<m>", phase),
        ("<n>", epoch),
        ("<categoria>/<projeto>", project),
        ("<id>-<slug>", task_id),
        ("<título curto>", title or slug.replace("-", " ")),
        ("created: AAAA-MM-DD", f"created: {date}"),
        ("updated: AAAA-MM-DD", f"updated: {date}"),
        ("- AAAA-MM-DD — criada em 001_initial_task — <motivo/origem>",
         f"- {date} — criada em 001_initial_task — via pop_task"),
    ):
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
                        help="id completo da task (ex.: 1.2.3-user-table-creation)")
    parser.add_argument("--title", help="título curto do card "
                                        "(default: slug com espaços)")
    parser.add_argument("--vault", metavar="DIR",
                        help="raiz do vault (default: pasta acima de scripts/)")
    args = parser.parse_args()

    if not TASK_ID.match(args.task_id):
        print(f"Id inválido: {args.task_id} — esperado "
              f"<epoch>.<phase>.<task>-<slug-kebab> (ex.: 1.2.3-user-table).")
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
    print("Lembrete: preencha 'O quê', 'Por quê' e depends_on, e linke "
          "[[{}]] no arquivo da epoch.".format(args.task_id))
    print("A task só sai de 001 quando o humano marcar "
          "`- [x] Pronto para planejar` (seção Liberação do card).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
