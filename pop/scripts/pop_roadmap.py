#!/usr/bin/env python3
"""Mantém arquivos de epoch e de modification apenas com tasks ainda abertas.

`close <id>` é a operação de 006: exige memory canônica válida no mesmo
escopo e remove somente a linha da task — em `roadmap/*.md` ou
`modifications/*.md` — ou, para modification de task única, apenas o wikilink
`[[M-N.T-slug]]` da linha correspondente em `MODIFICATIONS.md` (a linha da
modification permanece). Epochs, phases e modifications nunca são removidas.
`prune --tracked-only` é a migração segura: remove linhas cujo arquivo de
memory já está versionado no Git. `check` lista resíduos sem editar.
"""

from __future__ import annotations

import argparse
import datetime
import re
import subprocess
import sys
from pathlib import Path

import poplib

TASK_ID = re.compile(
    r"(?<![0-9.])([0-9]+\.[0-9]+\.[0-9]+-[a-z0-9][a-z0-9-]*"
    r"|M-[0-9]+\.[0-9]+-[a-z0-9][a-z0-9-]*)")
ROW = re.compile(r"^\s*\|.*\|\s*$")
REQUIRED_MEMORY = ("task", "project", "started", "finished", "commit")

# Pastas com linhas de task removíveis no close: epochs e modifications
# multi-task. O índice MODIFICATIONS.md tem tratamento próprio (só o wikilink
# da task sai da linha).
ROW_DIRS = ("roadmap", "modifications")


def task_from_row(line: str) -> str | None:
    if not ROW.match(line):
        return None
    match = TASK_ID.search(line)
    return match.group(1) if match else None


def memory_path(root: Path, scope: Path, task_id: str) -> Path:
    return poplib.harness_root(scope) / "memory" / f"{task_id}.md"


def memory_valid(root: Path, scope: Path, task_id: str, *, canonical: bool) -> bool:
    path = memory_path(root, scope, task_id)
    if not path.is_file():
        return False
    if not canonical:
        return True
    meta, _ = poplib.parse_frontmatter(path.read_text(encoding="utf-8"))
    if any(meta.get(field) in (None, "") for field in REQUIRED_MEMORY):
        return False
    if "pr" not in meta:  # vazio explícito é válido; chave ausente não é
        return False
    if meta.get("task") != task_id:
        return False
    if meta.get("project") != poplib.project_label(root, scope):
        return False
    try:
        started = datetime.date.fromisoformat(str(meta["started"]))
        finished = datetime.date.fromisoformat(str(meta["finished"]))
    except ValueError:
        return False
    return started <= finished


def tracked(root: Path, path: Path) -> bool:
    try:
        rel = path.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    result = subprocess.run(
        ["git", "-C", str(root), "ls-files", "--error-unmatch", rel.as_posix()],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return result.returncode == 0


def task_rows(root: Path):
    """Linhas de tabela com id de task em roadmap/*.md e modifications/*.md."""
    for scope in poplib.discover_projects(root):
        harness = poplib.harness_root(scope)
        for folder in ROW_DIRS:
            base = harness / folder
            if not base.is_dir():
                continue
            for path in sorted(base.glob("*.md")):
                for number, line in enumerate(
                        path.read_text(encoding="utf-8").splitlines(), 1):
                    task_id = task_from_row(line)
                    if task_id:
                        yield scope, path, number, task_id


def modification_link_rows(root: Path):
    """Wikilinks [[M-N.T-slug]] em linhas de tabela do MODIFICATIONS.md.

    Modification de task única vive só na linha do índice; o close remove
    apenas esse wikilink (a linha da modification permanece).
    """
    link = re.compile(r"\[\[(M-[0-9]+\.[0-9]+-[a-z0-9][a-z0-9-]*)")
    for scope in poplib.discover_projects(root):
        index = poplib.harness_root(scope) / "MODIFICATIONS.md"
        if not index.is_file():
            continue
        for number, line in enumerate(
                index.read_text(encoding="utf-8").splitlines(), 1):
            if not ROW.match(line):
                continue
            for match in link.finditer(line):
                yield scope, index, number, match.group(1)


def residuals(root: Path, *, tracked_only: bool = False):
    rows = list(task_rows(root)) + list(modification_link_rows(root))
    for scope, path, number, task_id in rows:
        memory = memory_path(root, scope, task_id)
        if (memory_valid(root, scope, task_id, canonical=False)
                and (not tracked_only or tracked(root, memory))):
            yield scope, path, number, task_id


def _remove_row(matches, task_id: str) -> bool:
    """Remove a única linha de `task_id` entre os arquivos de origem.

    Retorna True se removeu; False se não achou linha. Levanta RuntimeError
    se a task aparecer em mais de uma linha (aborta sem escrever nada).
    """
    count = sum(len(indexes) for _, _, indexes in matches)
    if count == 0:
        return False
    if count != 1:
        raise RuntimeError(
            f"esperada exatamente 1 linha de `{task_id}`, encontradas {count}")
    path, lines, indexes = matches[0]
    remove_index = indexes[0]
    kept = lines[:remove_index] + lines[remove_index + 1:]
    path.write_text("\n".join(kept) + "\n", encoding="utf-8")
    return True


def _unlink_modification_index(harness: Path, task_id: str) -> None:
    """Task única: remove só o wikilink [[M-N.T-slug]] da linha do índice.

    A linha da modification permanece (status `concluída`); o id volta à
    forma cravada `` `M-N.T-slug` ``, como uma task ainda não linkada.
    """
    index = harness / "MODIFICATIONS.md"
    if not index.is_file():
        raise RuntimeError(
            f"nenhuma linha de `{task_id}` em roadmap/modifications e "
            f"{index} ausente")
    lines = index.read_text(encoding="utf-8").splitlines()
    hits = [i for i, line in enumerate(lines)
            if ROW.match(line) and task_id in line]
    if len(hits) != 1:
        raise RuntimeError(
            f"esperada exatamente 1 linha de `{task_id}` em {index}, "
            f"encontradas {len(hits)}")
    pattern = re.compile(
        r"\[\[" + re.escape(task_id) + r"(?:\|[^\]]*)?\]\]")
    lines[hits[0]], count = pattern.subn(f"`{task_id}`", lines[hits[0]])
    if count != 1:
        raise RuntimeError(
            f"wikilink [[{task_id}]] não encontrado na linha de {index}")
    index.write_text("\n".join(lines) + "\n", encoding="utf-8")


def remove_task(root: Path, scope: Path, task_id: str, *, canonical: bool,
                tracked_only: bool) -> int:
    memory = memory_path(root, scope, task_id)
    if not memory_valid(root, scope, task_id, canonical=canonical):
        raise RuntimeError(f"memory inválida ou ausente: {memory}")
    if tracked_only and not tracked(root, memory):
        raise RuntimeError(f"memory não versionada: {memory}")
    harness = poplib.harness_root(scope)
    matches = []
    for folder in ROW_DIRS:
        base = harness / folder
        if not base.is_dir():
            continue
        for path in sorted(base.glob("*.md")):
            lines = path.read_text(encoding="utf-8").splitlines()
            indexes = [i for i, line in enumerate(lines)
                       if task_from_row(line) == task_id]
            if indexes:
                matches.append((path, lines, indexes))
    if not _remove_row(matches, task_id):
        _unlink_modification_index(harness, task_id)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "close", "prune"))
    parser.add_argument("task_id", nargs="?")
    parser.add_argument("--vault", metavar="DIR")
    parser.add_argument("--tracked-only", action="store_true")
    args = parser.parse_args()
    root = poplib.vault_root(args.vault)

    if args.command == "check":
        found = list(residuals(root, tracked_only=args.tracked_only))
        for _, path, number, task_id in found:
            print(f"{path}:{number}: task concluída residual `{task_id}`")
        return 1 if found else 0

    if args.command == "close":
        if not args.task_id:
            parser.error("close exige task_id")
        found = poplib.find_task(root, args.task_id)
        if not found:
            print(f"task não encontrada no kanban: {args.task_id}", file=sys.stderr)
            return 1
        scope, stage, _ = found
        if stage != "006_done":
            print(f"task deve estar em 006_done, está em {stage}", file=sys.stderr)
            return 1
        targets = [(scope, args.task_id)]
        canonical = True
    else:
        targets = [(scope, task_id) for scope, _, _, task_id in residuals(
            root, tracked_only=args.tracked_only)]
        canonical = False

    try:
        for scope, task_id in targets:
            remove_task(root, scope, task_id, canonical=canonical,
                        tracked_only=args.tracked_only)
            print(f"OK: removida linha concluída `{task_id}`")
    except RuntimeError as error:
        print(f"abortado: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
