#!/usr/bin/env python3
"""pop_recon — relatório de recon determinístico de um diretório de projeto.

Gera um inventário (árvore, linguagens/LOC, manifests, hotspots de git,
entry points/configs/CI e, para bases majoritariamente markdown, um modo
escrita) para o agente ler **antes** de varrer arquivos manualmente. Zero
LLM, zero rede, só stdlib (Python >= 3.9) — saída determinística: a mesma
árvore produz sempre o mesmo texto (sem timestamps, ordenação estável).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

# Pastas ignoradas em toda a varredura: controle de versão, dependências
# instaladas, artefatos do PoP e caches/builds usuais de várias linguagens.
IGNORE_DIRS = {
    ".git", "node_modules", "worktrees", "__pycache__", ".venv", "venv",
    "env", "dist", "build", ".next", "target", ".cache", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", "vendor", ".tox", "coverage", ".idea",
    ".vscode", "bin", "obj", ".gradle", ".terraform",
}

TREE_MAX_DEPTH = 4
TREE_MAX_ENTRIES = 40
HOTSPOTS_TOP_N = 15
TEXT_READ_LIMIT = 5_000_000  # bytes; acima disso o arquivo não é lido como texto

CODE_ENTRY_POINTS = (
    "main.py", "__main__.py", "manage.py", "app.py", "wsgi.py", "asgi.py",
    "main.go", "main.rs", "main.js", "main.ts", "index.js", "index.ts",
    "server.js", "server.ts",
)
CONFIG_FILES = (
    "Makefile", "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "tsconfig.json", "webpack.config.js", "vite.config.js", "vite.config.ts",
    "next.config.js", "next.config.ts", "setup.py", "setup.cfg",
    "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml",
    "package.json", ".env.example", "Procfile", "tox.ini", "pytest.ini",
)
CI_GLOBS = (
    ".github/workflows/*.yml", ".github/workflows/*.yaml",
    ".gitlab-ci.yml", ".circleci/config.yml", "Jenkinsfile", ".travis.yml",
)

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?\n)---\s*\n", re.DOTALL)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")


# --------------------------------------------------------------------------
# Descoberta de arquivos
# --------------------------------------------------------------------------

def iter_files(root: Path) -> List[Path]:
    """Todos os arquivos sob `root`, ignorando IGNORE_DIRS, em ordem estável."""
    files: List[Path] = []
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir(), key=lambda p: p.name)
        except OSError:
            continue
        dirs = []
        for entry in entries:
            if entry.is_dir():
                if entry.name not in IGNORE_DIRS:
                    dirs.append(entry)
            elif entry.is_file():
                files.append(entry)
        stack.extend(reversed(dirs))
    files.sort(key=lambda p: p.relative_to(root).as_posix())
    return files


def read_text(path: Path) -> Optional[str]:
    """Lê um arquivo como texto UTF-8; None se binário, ilegível ou grande demais."""
    try:
        if path.stat().st_size > TEXT_READ_LIMIT:
            return None
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


# --------------------------------------------------------------------------
# Seção: árvore anotada truncada
# --------------------------------------------------------------------------

def render_tree(root: Path) -> str:
    lines = [
        f"Árvore de `{root.name}` (profundidade máx. {TREE_MAX_DEPTH}, "
        f"até {TREE_MAX_ENTRIES} entradas por pasta; ignora "
        f"{', '.join(sorted(IGNORE_DIRS))}):",
        "",
    ]
    _render_dir(root, root, depth=0, prefix="", out=lines)
    return "\n".join(lines)


def _render_dir(root: Path, current: Path, depth: int, prefix: str, out: List[str]) -> None:
    try:
        entries = sorted(
            (e for e in current.iterdir() if e.name not in IGNORE_DIRS),
            key=lambda p: (p.is_file(), p.name),
        )
    except OSError:
        return
    truncated = False
    if len(entries) > TREE_MAX_ENTRIES:
        entries = entries[:TREE_MAX_ENTRIES]
        truncated = True
    for index, entry in enumerate(entries):
        is_last = index == len(entries) - 1 and not truncated
        connector = "└── " if is_last else "├── "
        label = entry.name + ("/" if entry.is_dir() else "")
        out.append(f"{prefix}{connector}{label}")
        if entry.is_dir():
            if depth + 1 >= TREE_MAX_DEPTH:
                out.append(f"{prefix}{'    ' if is_last else '│   '}└── ... (profundidade truncada)")
            else:
                extension = "    " if is_last else "│   "
                _render_dir(root, entry, depth + 1, prefix + extension, out)
    if truncated:
        out.append(f"{prefix}└── ... (mais entradas truncadas)")


# --------------------------------------------------------------------------
# Seção: linguagens/LOC
# --------------------------------------------------------------------------

def count_languages(files: List[Path], root: Path) -> Dict[str, Tuple[int, int]]:
    """Extensão -> (nº arquivos, nº linhas), só para arquivos lidos como texto."""
    counts: Dict[str, Tuple[int, int]] = {}
    for path in files:
        suffix = path.suffix.lower() or "(sem extensão)"
        text = read_text(path)
        if text is None:
            continue
        lines = text.count("\n") + (1 if text and not text.endswith("\n") else 0)
        n_files, n_lines = counts.get(suffix, (0, 0))
        counts[suffix] = (n_files + 1, n_lines + lines)
    return counts


def render_languages(counts: Dict[str, Tuple[int, int]]) -> str:
    if not counts:
        return "Linguagens/LOC: nenhum arquivo de texto reconhecido."
    lines = ["Linguagens/LOC (por extensão, arquivos de texto):", ""]
    for ext in sorted(counts, key=lambda e: (-counts[e][1], e)):
        n_files, n_lines = counts[ext]
        lines.append(f"- `{ext}`: {n_files} arquivo(s), {n_lines} linha(s)")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Seção: manifests de dependência
# --------------------------------------------------------------------------

def parse_package_json(text: str) -> List[str]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    deps = []
    for key in ("dependencies", "devDependencies"):
        section = data.get(key)
        if isinstance(section, dict):
            deps.extend(section.keys())
    return sorted(set(deps))


def parse_go_mod(text: str) -> List[str]:
    deps = []
    in_block = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("require ("):
            in_block = True
            continue
        if in_block:
            if stripped == ")":
                in_block = False
                continue
            token = stripped.split()
            if token:
                deps.append(token[0])
            continue
        if stripped.startswith("require "):
            token = stripped[len("require "):].split()
            if token:
                deps.append(token[0])
    return sorted(set(deps))


def parse_cargo_toml(text: str) -> List[str]:
    return sorted(set(_toml_table_keys(text, "dependencies")))


def parse_pyproject_toml(text: str) -> List[str]:
    """Extrai dependências de pyproject.toml sem `tomllib` (stdlib só em 3.11+).

    Cobre os dois formatos usuais: PEP 621 (`[project]` / `dependencies = [...]`)
    e Poetry (`[tool.poetry.dependencies]`, tabela chave = versão).
    """
    deps: List[str] = []
    project_match = re.search(
        r"^\[project\]\s*$(.*?)(?=^\[|\Z)", text, re.MULTILINE | re.DOTALL
    )
    if project_match:
        array_match = re.search(
            r"dependencies\s*=\s*\[(.*?)\]", project_match.group(1), re.DOTALL
        )
        if array_match:
            for item in re.findall(r'["\']([^"\']+)["\']', array_match.group(1)):
                name = re.split(r"[<>=!~\[\s;]", item, maxsplit=1)[0].strip()
                if name:
                    deps.append(name)
    deps.extend(_toml_table_keys(text, "tool.poetry.dependencies"))
    return sorted(set(deps))


def _toml_table_keys(text: str, table: str) -> List[str]:
    """Chaves de uma tabela TOML simples `[table]` (fallback mínimo, sem libs)."""
    escaped = re.escape(f"[{table}]")
    match = re.search(rf"^{escaped}\s*$(.*?)(?=^\[|\Z)", text, re.MULTILINE | re.DOTALL)
    if not match:
        return []
    keys = []
    for line in match.group(1).splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        key = stripped.split("=", 1)[0].strip().strip('"').strip("'")
        if key and key != "python":
            keys.append(key)
    return keys


MANIFEST_PARSERS = {
    "package.json": parse_package_json,
    "go.mod": parse_go_mod,
    "pyproject.toml": parse_pyproject_toml,
    "Cargo.toml": parse_cargo_toml,
}


def render_manifests(files: List[Path], root: Path) -> str:
    found = [f for f in files if f.name in MANIFEST_PARSERS]
    if not found:
        return "Manifests: nenhum manifest reconhecido encontrado."
    lines = ["Manifests de dependência:", ""]
    for path in sorted(found, key=lambda p: p.relative_to(root).as_posix()):
        text = read_text(path)
        rel = path.relative_to(root).as_posix()
        if text is None:
            lines.append(f"- `{rel}`: ilegível como texto")
            continue
        deps = MANIFEST_PARSERS[path.name](text)
        if deps:
            lines.append(f"- `{rel}`: {', '.join(deps)}")
        else:
            lines.append(f"- `{rel}`: sem dependências detectadas")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Seção: hotspots por churn git
# --------------------------------------------------------------------------

def render_hotspots(root: Path) -> str:
    if not (root / ".git").exists():
        return ("Hotspots por churn git: sem repositório git no alvo "
                "(pasta `.git/` ausente) — seção não disponível.")
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "log", "--pretty=format:", "--name-only"],
            capture_output=True, text=True, check=False,
        )
    except OSError:
        return "Hotspots por churn git: git não disponível no ambiente — seção não disponível."
    if result.returncode != 0:
        return "Hotspots por churn git: `git log` falhou — seção não disponível."
    counts: Dict[str, int] = {}
    for line in result.stdout.splitlines():
        path = line.strip()
        if path:
            counts[path] = counts.get(path, 0) + 1
    if not counts:
        return "Hotspots por churn git: repositório sem histórico de commits ainda."
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:HOTSPOTS_TOP_N]
    lines = [f"Hotspots por churn git (top {len(ranked)} por nº de commits):", ""]
    for path, n in ranked:
        lines.append(f"- `{path}`: {n} commit(s)")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Seção: entry points / configs / CI
# --------------------------------------------------------------------------

def render_entry_points(files: List[Path], root: Path) -> str:
    rels = {f.relative_to(root).as_posix() for f in files}
    entry_points = sorted(
        rel for rel in rels if Path(rel).name in CODE_ENTRY_POINTS
    )
    configs = sorted(
        rel for rel in rels if Path(rel).name in CONFIG_FILES
    )
    ci_files = sorted(
        rel for rel in rels
        if rel.startswith(".github/workflows/") and (rel.endswith(".yml") or rel.endswith(".yaml"))
        or Path(rel).name in (".gitlab-ci.yml", "Jenkinsfile", ".travis.yml")
        or rel == ".circleci/config.yml"
    )
    lines = ["Entry points, configs e CI detectados:", ""]
    lines.append(f"- Entry points: {', '.join(f'`{p}`' for p in entry_points) if entry_points else 'nenhum detectado'}")
    lines.append(f"- Configs: {', '.join(f'`{p}`' for p in configs) if configs else 'nenhum detectado'}")
    lines.append(f"- CI: {', '.join(f'`{p}`' for p in ci_files) if ci_files else 'nenhum detectado'}")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Seção: modo escrita (bases majoritariamente markdown)
# --------------------------------------------------------------------------

def is_writing_mode(files: List[Path]) -> bool:
    """Base majoritariamente markdown: > metade dos arquivos de texto contados são `.md`."""
    text_exts = [f.suffix.lower() for f in files if f.suffix]
    if not text_exts:
        return False
    md_count = sum(1 for ext in text_exts if ext == ".md")
    return md_count > 0 and md_count >= len(text_exts) / 2


def render_writing_mode(files: List[Path], root: Path) -> str:
    md_files = sorted(
        (f for f in files if f.suffix.lower() == ".md"),
        key=lambda p: p.relative_to(root).as_posix(),
    )
    lines = ["Modo escrita (base majoritariamente markdown):", ""]
    lines.append("Estrutura de capítulos (headings de nível 1-2) e wordcount:")
    lines.append("")
    frontmatter_inventory = []
    for path in md_files:
        text = read_text(path)
        rel = path.relative_to(root).as_posix()
        if text is None:
            continue
        fm_match = FRONTMATTER_RE.match(text)
        body = text
        if fm_match:
            body = text[fm_match.end():]
            fm_keys = sorted({
                line.split(":", 1)[0].strip()
                for line in fm_match.group(1).splitlines()
                if ":" in line and not line.strip().startswith("#")
            })
            frontmatter_inventory.append((rel, fm_keys))
        headings = [
            m.group(0).strip()
            for m in (HEADING_RE.match(line) for line in body.splitlines())
            if m and len(m.group(1)) <= 2
        ]
        wordcount = len(body.split())
        lines.append(f"- `{rel}` ({wordcount} palavras)")
        for heading in headings:
            lines.append(f"  - {heading}")
    lines.append("")
    lines.append("Inventário de frontmatter:")
    lines.append("")
    if frontmatter_inventory:
        for rel, keys in frontmatter_inventory:
            keys_str = ", ".join(keys) if keys else "(vazio)"
            lines.append(f"- `{rel}`: {keys_str}")
    else:
        lines.append("- nenhum arquivo com frontmatter detectado")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Montagem do relatório
# --------------------------------------------------------------------------

def build_report(root: Path) -> str:
    files = iter_files(root)
    sections = [
        f"# Recon de `{root.name}`",
        "",
        "Relatório determinístico gerado por `pop_recon.py` — artefato derivado, "
        "não commitado como fonte de verdade. Leia antes de varrer arquivos.",
        "",
        "## Árvore",
        "",
        render_tree(root),
        "",
        "## Linguagens/LOC",
        "",
        render_languages(count_languages(files, root)),
        "",
        "## Manifests",
        "",
        render_manifests(files, root),
        "",
        "## Hotspots",
        "",
        render_hotspots(root),
        "",
        "## Entry points/configs/CI",
        "",
        render_entry_points(files, root),
    ]
    if is_writing_mode(files):
        sections.extend(["", "## Modo escrita", "", render_writing_mode(files, root)])
    return "\n".join(sections) + "\n"


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Gera um relatório de recon determinístico (RECON.md) de um "
            "diretório de projeto: árvore, linguagens/LOC, manifests, "
            "hotspots de git, entry points/configs/CI e, para bases "
            "majoritariamente markdown, modo escrita. Zero LLM, só stdlib."
        )
    )
    parser.add_argument("dir", type=Path, help="diretório do projeto a analisar")
    parser.add_argument(
        "--output", nargs="?", const="RECON.md", default=None, metavar="PATH",
        help="grava o relatório em PATH (default do nome: RECON.md) em vez de stdout",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    target = args.dir.resolve()
    if not target.is_dir():
        print(f"erro: diretório não encontrado: {target}", file=sys.stderr)
        return 2
    report = build_report(target)
    if args.output:
        output_path = Path(args.output)
        output_path.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
