#!/usr/bin/env python3
"""Mantém arquivos de epoch apenas com phases e tasks ainda abertas.

`close <id>` é a operação de 006: exige memory canônica válida no mesmo
escopo e remove somente a linha da task. `prune --tracked-only` é a migração
segura: remove linhas cujo arquivo de memory já está versionado no Git.
`check` lista resíduos sem editar.
"""

from __future__ import annotations

import argparse
import datetime
import re
import subprocess
import sys
from pathlib import Path

import poplib

TASK_ID = re.compile(r"(?<![0-9.])([0-9]+\.[0-9]+\.[0-9]+-[a-z0-9][a-z0-9-]*)")
ROW = re.compile(r"^\s*\|.*\|\s*$")
REQUIRED_MEMORY = ("task", "project", "started", "finished", "commit")


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


def roadmap_rows(root: Path):
    for scope in poplib.discover_projects(root):
        roadmap = poplib.harness_root(scope) / "roadmap"
        if not roadmap.is_dir():
            continue
        for path in sorted(roadmap.glob("*.md")):
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                task_id = task_from_row(line)
                if task_id:
                    yield scope, path, number, task_id


def residuals(root: Path, *, tracked_only: bool = False):
    for scope, path, number, task_id in roadmap_rows(root):
        memory = memory_path(root, scope, task_id)
        if (memory_valid(root, scope, task_id, canonical=False)
                and (not tracked_only or tracked(root, memory))):
            yield scope, path, number, task_id


def remove_task(root: Path, scope: Path, task_id: str, *, canonical: bool,
                tracked_only: bool) -> int:
    memory = memory_path(root, scope, task_id)
    if not memory_valid(root, scope, task_id, canonical=canonical):
        raise RuntimeError(f"memory inválida ou ausente: {memory}")
    if tracked_only and not tracked(root, memory):
        raise RuntimeError(f"memory não versionada: {memory}")
    roadmap = poplib.harness_root(scope) / "roadmap"
    matches = []
    for path in sorted(roadmap.glob("*.md")):
        lines = path.read_text(encoding="utf-8").splitlines()
        indexes = [i for i, line in enumerate(lines)
                   if task_from_row(line) == task_id]
        if indexes:
            matches.append((path, lines, indexes))
    count = sum(len(indexes) for _, _, indexes in matches)
    if count != 1:
        raise RuntimeError(
            f"esperada exatamente 1 linha de `{task_id}`, encontradas {count}")
    path, lines, indexes = matches[0]
    remove_index = indexes[0]
    kept = lines[:remove_index] + lines[remove_index + 1:]
    path.write_text("\n".join(kept) + "\n", encoding="utf-8")
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
