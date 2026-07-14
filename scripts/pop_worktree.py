#!/usr/bin/env python3
"""pop_worktree — cria/remove a worktree git de uma task.

`add` cria `worktrees/<task-id>` na pasta do projeto da task, com a branch
`task/<task-id>`. Repositório alvo: `--repo`, ou a própria pasta do projeto
quando ela é um repo git (clone `included` / repo embutido de
`full-multi-repo`), senão a raiz do vault. `--repo <nome>` que case com
`project/<nome>/` do projeto usa esse clone e aninha a worktree em
`worktrees/<task-id>/<nome>/` (task cross de `multi-repo`/`full-multi-repo` —
repita o comando para cada repo afetado). `remove` desfaz a worktree e apaga
a branch se já estiver mergeada (`--delete-branch` força a exclusão).

Uso:
    python3 scripts/pop_worktree.py add    <task-id> [--repo DIR|NOME] [--base BRANCH]
    python3 scripts/pop_worktree.py remove <task-id> [--repo DIR|NOME] [--delete-branch]
"""

import argparse
import subprocess
import sys

import poplib


def git(repo, *args):
    """Roda git no repo; retorna CompletedProcess (não levanta exceção)."""
    return subprocess.run(["git", "-C", str(repo), *args],
                          capture_output=True, text=True)


def fail(action, result):
    """Relata a falha do git de forma legível e retorna exit code 1."""
    detail = (result.stderr or result.stdout).strip() or "sem detalhes"
    print(f"Falha ao {action} (git exit {result.returncode}):\n  {detail}")
    return 1


def cmd_add(repo, worktree, branch, base, rel):
    """git worktree add worktrees/<id>[/<repo>] -b task/<id> [<base>]."""
    if worktree.exists():
        print(f"Worktree já existe: {worktree}")
        return 1
    worktree.parent.mkdir(parents=True, exist_ok=True)
    args = ["worktree", "add", str(worktree), "-b", branch]
    if base:
        args.append(base)
    result = git(repo, *args)
    if result.returncode != 0:
        return fail(f"criar a worktree {worktree}", result)
    print(f"OK: worktree {worktree} criada na branch {branch}"
          + (f" a partir de {base}." if base else "."))
    print(f"Lembrete: registre `worktree: {rel}` no frontmatter do card.")
    return 0


def cmd_remove(repo, worktree, branch, force_delete):
    """git worktree remove + apaga a branch se mergeada (ou com --delete-branch)."""
    result = git(repo, "worktree", "remove", str(worktree))
    if result.returncode != 0:
        return fail(f"remover a worktree {worktree}", result)
    print(f"OK: worktree {worktree} removida.")

    merged = git(repo, "branch", "--merged")
    is_merged = merged.returncode == 0 and any(
        line.strip().lstrip("* ") == branch
        for line in merged.stdout.splitlines())
    if is_merged or force_delete:
        flag = "-D" if force_delete else "-d"
        result = git(repo, "branch", flag, branch)
        if result.returncode != 0:
            return fail(f"apagar a branch {branch}", result)
        print(f"OK: branch {branch} apagada"
              + (" (forçado)." if force_delete and not is_merged else "."))
    else:
        print(f"Branch {branch} mantida (não mergeada — use --delete-branch "
              f"para forçar).")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Cria ou remove a worktree git de uma task "
                    "(worktrees/<id>, branch task/<id>).")
    parser.add_argument("action", choices=["add", "remove"],
                        help="add: cria worktree e branch; remove: desfaz")
    parser.add_argument("task_id", help="id da task (nome da pasta no kanban)")
    parser.add_argument("--repo", metavar="DIR|NOME",
                        help="repositório git alvo: caminho, ou nome de clone "
                             "em project/<nome>/ do projeto da task (worktree "
                             "aninhada em worktrees/<id>/<nome>/); default: "
                             "pasta do projeto se for repo git, senão a raiz "
                             "do vault")
    parser.add_argument("--base", metavar="BRANCH",
                        help="branch de partida para a nova branch (só no add)")
    parser.add_argument("--delete-branch", action="store_true",
                        help="no remove, apaga a branch mesmo sem merge")
    parser.add_argument("--vault", metavar="DIR",
                        help="raiz do vault (default: pasta acima de scripts/)")
    args = parser.parse_args()

    root = poplib.vault_root(args.vault)
    found = poplib.find_task(root, args.task_id)
    if not found:
        print(f"Task não encontrada em nenhum projeto: {args.task_id}")
        return 1
    project, stage, _ = found
    print(f"Task {args.task_id} em {poplib.project_label(root, project)} "
          f"({stage}).")

    worktree = project / "worktrees" / args.task_id
    if args.repo:
        embedded = project / "project" / args.repo
        if "/" not in args.repo and embedded.is_dir():
            # nome de clone do projeto: worktree aninhada, uma por repo afetado
            repo = embedded
            worktree = worktree / args.repo
        else:
            repo = poplib.vault_root(args.repo)
    elif (project / ".git").exists():
        repo = project  # clone included ou repo embutido de full-multi-repo
    else:
        repo = root
    if not (repo / ".git").exists():
        print(f"Não é um repositório git: {repo}")
        return 1
    branch = f"task/{args.task_id}"
    if args.action == "add":
        return cmd_add(repo, worktree, branch, args.base,
                       worktree.relative_to(project).as_posix())
    return cmd_remove(repo, worktree, branch, args.delete_branch)


if __name__ == "__main__":
    sys.exit(main())
