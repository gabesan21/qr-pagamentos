#!/usr/bin/env python3
"""Confere se o diff de uma frente respeita seu ownership declarado."""

import argparse
import fnmatch
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import List, Optional


def git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, check=False
    )
    if result.returncode:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(message or f"git {' '.join(args)} falhou")
    return result.stdout


def nul_paths(raw: bytes) -> set[str]:
    return {
        item.decode("utf-8", errors="surrogateescape")
        for item in raw.split(b"\0")
        if item
    }


def changed_paths(repo: Path, base: str) -> set[str]:
    if base.startswith("-"):
        raise ValueError(f"ref base inválida: {base!r}")
    base_commit = git(repo, "rev-parse", "--verify", f"{base}^{{commit}}").decode(
        "utf-8"
    ).strip()
    paths = nul_paths(
        git(repo, "diff", "--no-renames", "--name-only", "-z", f"{base_commit}...HEAD")
    )
    paths.update(
        nul_paths(git(repo, "diff", "--no-renames", "--name-only", "-z", "HEAD"))
    )
    paths.update(
        nul_paths(git(repo, "ls-files", "--others", "--exclude-standard", "-z"))
    )
    return paths


def normalize_allow(pattern: str) -> str:
    normalized = pattern.replace("\\", "/").removeprefix("./").rstrip("/")
    parts = PurePosixPath(normalized).parts
    if not normalized or normalized.startswith("/") or ".." in parts:
        raise ValueError(f"escopo inválido: {pattern!r}")
    return normalized


def matches_glob(path: str, pattern: str) -> bool:
    """Glob por segmento: `*` não cruza `/`; `**` cruza zero ou mais."""
    path_parts = PurePosixPath(path).parts
    pattern_parts = PurePosixPath(pattern).parts

    def match(path_index: int, pattern_index: int) -> bool:
        if pattern_index == len(pattern_parts):
            return path_index == len(path_parts)
        part = pattern_parts[pattern_index]
        if part == "**":
            return match(path_index, pattern_index + 1) or (
                path_index < len(path_parts) and match(path_index + 1, pattern_index)
            )
        return (
            path_index < len(path_parts)
            and fnmatch.fnmatchcase(path_parts[path_index], part)
            and match(path_index + 1, pattern_index + 1)
        )

    return match(0, 0)


def matches_scope(path: str, patterns: List[str]) -> bool:
    for pattern in patterns:
        if any(char in pattern for char in "*?["):
            if matches_glob(path, pattern):
                return True
        elif path == pattern or path.startswith(f"{pattern}/"):
            return True
    return False


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Falha se o diff sair de --allow ou entrar em --deny."
    )
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--base", required=True, help="ref base da frente")
    parser.add_argument(
        "--allow",
        action="append",
        required=True,
        metavar="PATH|GLOB",
        help="arquivo, diretório ou glob pertencente à frente; repetível",
    )
    parser.add_argument(
        "--deny",
        action="append",
        default=[],
        metavar="PATH|GLOB",
        help="exceção de escrita proibida; repetível e prevalece sobre --allow",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    try:
        repo = Path(
            git(args.repo.resolve(), "rev-parse", "--show-toplevel")
            .decode("utf-8")
            .strip()
        )
        allowed = [normalize_allow(pattern) for pattern in args.allow]
        denied = [normalize_allow(pattern) for pattern in args.deny]
        changed = changed_paths(repo, args.base)
    except (RuntimeError, ValueError) as error:
        print(f"erro: {error}", file=sys.stderr)
        return 2

    violations = sorted(
        path
        for path in changed
        if not matches_scope(path, allowed) or matches_scope(path, denied)
    )
    if violations:
        print("violação de ownership: caminho fora de --allow ou coberto por --deny")
        for path in violations:
            print(f"- {path}")
        return 1

    print(f"ownership válido: {len(changed)} caminho(s) alterado(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
