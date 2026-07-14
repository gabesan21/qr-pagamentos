#!/usr/bin/env python3
"""Instala ou atualiza o harness standalone de um repositório included.

Manifest v2 (`harness_root: "pop"`): files/directories/anatomy/keep_files são
relativos ao harness_root e vão para `target/pop/`; o `.included-harness.json`
também mora em `pop/` (é o marcador que `poplib.vault_root` e o
`pop_validate --standalone` usam para detectar a anatomia nova). Skills,
AGENTS.md e CLAUDE.md ficam sempre na raiz do target. Manifest v1 (sem
`harness_root`) mantém o layout legado na raiz — zero regressão.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parent.parent
MANIFEST = SOURCE / "_templates" / "included-manifest.json"
EXTERNAL_LINK = re.compile(r"\[\[categories/[^/]+/[^/]+/([^\]|#]+)([^\]]*)\]\]")


def manifest():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def localize(text: str) -> str:
    """Remove o prefixo de vault pai de wikilinks de um projeto included."""
    return EXTERNAL_LINK.sub(lambda m: "[[" + m.group(1) + m.group(2) + "]]", text)


def copy_file(source: Path, dest: Path, *, overwrite: bool = True) -> None:
    if dest.exists() and dest.is_dir():
        raise RuntimeError(f"colisão com diretório: {dest}")
    if dest.exists() and not overwrite:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix in {".md", ".py", ".json"}:
        dest.write_text(localize(source.read_text(encoding="utf-8")), encoding="utf-8")
    else:
        shutil.copy2(source, dest)


def copy_tree(source: Path, dest: Path) -> None:
    for path in source.rglob("*"):
        if path.is_dir() or "__pycache__" in path.parts:
            continue
        copy_file(path, dest / path.relative_to(source))


def preserve_worktree_marker(target: Path, prefix: str = "") -> None:
    """Permite versionar só o marcador, mesmo em repos que ignoram worktrees/,
    e impede que o bytecode dos scripts instalados entre no Git.
    `prefix` é o harness_root com barra (`pop/`) na anatomia nova."""
    ignore = target / ".gitignore"
    if not ignore.exists():
        return
    wt = f"{prefix}worktrees"
    block = (f"# included-harness: preservar a anatomia standalone no Git\n"
             f"!{wt}/\n{wt}/*\n!{wt}/.gitkeep\n")
    text = ignore.read_text(encoding="utf-8")
    if f"!{wt}/.gitkeep" not in text:
        text = text.rstrip() + "\n\n" + block
    if "__pycache__/" not in text:
        text = (text.rstrip() +
                "\n# included-harness: bytecode dos scripts\n__pycache__/\n")
    ignore.write_text(text, encoding="utf-8")


def audit() -> list[str]:
    data = manifest()
    missing = []
    for name in data["files"]:
        if not (SOURCE / name).is_file(): missing.append(name)
    for name in data["directories"]:
        if not (SOURCE / name).is_dir(): missing.append(name)
    for name in data["skills"]:
        if not (SOURCE / ".agents/skills" / name / "SKILL.md").is_file(): missing.append(f"skill:{name}")
    return missing


def install(target: Path) -> None:
    target = target.resolve()
    if not target.is_dir():
        raise RuntimeError(f"destino não é diretório: {target}")
    missing = audit()
    if missing:
        raise RuntimeError("manifesto incompleto: " + ", ".join(missing))
    data = manifest()
    # harness_root: "pop" no manifest v2; "" (raiz do target) no v1 legado.
    hr = data.get("harness_root", "") or ""
    hb = target / hr if hr else target
    # Preflight: somente caminhos explicitamente geridos podem ser escritos.
    for name in data["files"]:
        copy_file(SOURCE / name, hb / name)
    for name in data["directories"]:
        copy_tree(SOURCE / name, hb / name)
    for name in data["skills"]:
        copy_tree(SOURCE / ".agents/skills" / name, target / ".agents/skills" / name)
    copy_file(MANIFEST, hb / ".included-harness.json")
    for rel in data["anatomy"]:
        (hb / rel).mkdir(parents=True, exist_ok=True)
    # Git não preserva diretórios vazios: estes marcadores são parte gerida do
    # contrato, para que um clone real mantenha toda a anatomia standalone.
    for rel in data.get("keep_files", []):
        marker = hb / rel
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.touch()
    preserve_worktree_marker(target, f"{hr}/" if hr else "")
    # O AGENTS pertence ao projeto: nunca o substituímos. Só corrigimos links do pai.
    for path in target.rglob("*.md"):
        if ".git" in path.parts or "kanban" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        rendered = localize(text)
        if rendered != text:
            path.write_text(rendered, encoding="utf-8")
    agents = target / "AGENTS.md"
    if not agents.exists():
        copy_file(SOURCE / "_templates/AGENTS-PROJECT.md", agents)
    claude = target / "CLAUDE.md"
    if not claude.exists():
        claude.symlink_to("AGENTS.md")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("target", nargs="?", type=Path)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--audit-manifest", action="store_true")
    args = parser.parse_args()
    missing = audit()
    if args.audit_manifest:
        if missing:
            print("manifesto incompleto: " + ", ".join(missing), file=sys.stderr); return 1
        print("manifesto fechado"); return 0
    if not args.target:
        parser.error("target é obrigatório")
    if args.check:
        target_manifest = args.target / "pop" / ".included-harness.json"
        if not target_manifest.is_file():
            target_manifest = args.target / ".included-harness.json"
        if missing or not target_manifest.is_file():
            print("harness incompleto", file=sys.stderr); return 1
        print("harness instalado"); return 0
    try:
        install(args.target)
    except RuntimeError as error:
        print(f"abortado: {error}", file=sys.stderr); return 1
    print(f"harness standalone instalado em {args.target}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
