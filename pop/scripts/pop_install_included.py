#!/usr/bin/env python3
"""Instala e **atualiza** o harness standalone de um repositório com PoP embutido.

O PoP raiz é a fonte única do harness: nenhum projeto evolui WORKFLOW, templates
ou scripts por conta própria — recebe deles uma cópia gerida. Para que "atualizar"
seja verificável, cada instalação carimba em `.included-harness.json` o
`content_sha` do conjunto gerido na origem; `--check-fresh` recomputa e falha
fechado quando o alvo ficou atrás. Sem carimbo não há como distinguir um clone
atual de um clone parado numa versão antiga do fluxo.

Manifest v2 (`harness_root: "pop"`): files/directories/anatomy/keep_files são
relativos ao harness_root e vão para `target/pop/`; o `.included-harness.json`
também mora em `pop/` (é o marcador que `poplib.vault_root` e o
`pop_validate --standalone` usam para detectar a anatomia nova). Skills,
AGENTS.md e CLAUDE.md ficam sempre na raiz do target. Manifest v1 (sem
`harness_root`) mantém o layout legado na raiz — zero regressão.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

SOURCE = Path(__file__).resolve().parent.parent
MANIFEST = SOURCE / "_templates" / "included-manifest.json"
SKILLS_SOURCE = (SOURCE.parent / ".agents" / "skills"
                 if (SOURCE / ".included-harness.json").is_file()
                 else SOURCE / ".agents" / "skills")
EXTERNAL_LINK = re.compile(r"\[\[categories/[^/]+/[^/]+/([^\]|#]+)([^\]]*)\]\]")
# Fallback do manifest: o alvo recebe o harness, não o ferramental do pai.
DEFAULT_EXCLUDE = ("__pycache__", "tests", ".pytest_cache")


def manifest():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def excluded(data, relative: Path, label: str = "") -> bool:
    """Caminho que o instalador não propaga.

    Duas listas, dois motivos. `exclude` tira ruído por nome de pasta
    (bytecode, suíte da origem). `exclude_files` tira, por rótulo exato,
    material que **só existe para quem hospeda outros projetos** — índices de
    agregação, criação de projeto, panorama entre escopos. Ele não é omitido
    por economia: se chegasse ao alvo, o harness instalado voltaria a
    descrever um mundo acima da própria raiz.
    """
    names = set(data.get("exclude", DEFAULT_EXCLUDE))
    if names.intersection(relative.parts):
        return True
    return bool(label) and label in set(data.get("exclude_files", ()))


def managed_sources(data):
    """`(rótulo estável, arquivo)` de tudo que o instalador propaga.

    O rótulo é independente do layout do alvo, então o `content_sha` só muda
    quando o **conteúdo** do harness muda — não quando o destino muda.
    """
    for name in data["files"]:
        yield name, SOURCE / name
    for name in data["directories"]:
        base = SOURCE / name
        for path in sorted(base.rglob("*")):
            relative = path.relative_to(base)
            label = f"{name}/{relative.as_posix()}"
            if path.is_file() and not excluded(data, relative, label):
                yield label, path
    for name in data["skills"]:
        base = SKILLS_SOURCE / name
        for path in sorted(base.rglob("*")):
            relative = path.relative_to(base)
            label = f"skills/{name}/{relative.as_posix()}"
            if path.is_file() and not excluded(data, relative, label):
                yield label, path
    yield "manifest", MANIFEST


def content_sha(data=None) -> str:
    """Impressão digital do harness na origem — o número de versão real."""
    data = data or manifest()
    digest = hashlib.sha256()
    for label, path in sorted(managed_sources(data)):
        digest.update(label.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def installed_stamp(target: Path, key: str = "content_sha"):
    """`(caminho do marcador, campo gravado)` do alvo; `None` se ausente."""
    marker = target / "pop" / ".included-harness.json"
    if not marker.is_file():
        marker = target / ".included-harness.json"
    if not marker.is_file():
        return None, None
    try:
        return marker, json.loads(marker.read_text(encoding="utf-8")).get(key)
    except json.JSONDecodeError:
        return marker, None


def is_vendored() -> bool:
    """Este script é a cópia instalada num escopo, não o original da origem.

    A cópia não consegue **comparar** versões: seu `SOURCE` é o harness local,
    já localizado na instalação, então o hash nunca bate com o da origem. Ela
    responde o que sabe de si — a versão carimbada — e para aí. Mandar procurar
    a origem seria transformar uma pergunta local em travessia de fronteira.
    """
    return (SOURCE / ".included-harness.json").is_file()


def localize(text: str, *, included_paths: bool = False) -> str:
    """Remove o prefixo de vault pai de wikilinks de um projeto included."""
    rendered = EXTERNAL_LINK.sub(
        lambda m: "[[" + m.group(1) + m.group(2) + "]]", text)
    if included_paths:
        rendered = re.sub(r"(?<!pop/)scripts/", "pop/scripts/", rendered)
    return rendered


def copy_file(source: Path, dest: Path, *, overwrite: bool = True,
              included_paths: bool = False) -> None:
    if dest.exists() and dest.is_dir():
        raise RuntimeError(f"colisão com diretório: {dest}")
    if dest.exists() and not overwrite:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    if source.suffix in {".md", ".py", ".json"}:
        text = source.read_text(encoding="utf-8")
        dest.write_text(localize(text, included_paths=(included_paths and source.suffix == ".md")),
                        encoding="utf-8")
    else:
        shutil.copy2(source, dest)


def copy_tree(source: Path, dest: Path, *, included_paths: bool = False,
              data=None, label_prefix: str = "") -> list:
    """Copia `source` em `dest` e devolve os arquivos escritos.

    Não varre o destino: pasta gerida **não** é pasta exclusiva. O projeto
    legitimamente guarda arquivos seus em `pop/scripts/` (verificação própria,
    fixtures), e apagar tudo o que não vem da origem destrói trabalho do
    projeto. A poda é feita pelo inventário da instalação anterior — ver
    `prune`.
    """
    data = data or manifest()
    written = []
    for path in source.rglob("*"):
        relative = path.relative_to(source)
        label = f"{label_prefix}{relative.as_posix()}" if label_prefix else ""
        if path.is_dir() or excluded(data, relative, label):
            continue
        target_file = dest / relative
        copy_file(path, target_file, included_paths=included_paths)
        written.append(target_file)
    return written


def prune(target: Path, previous, written) -> list:
    """Remove o que a instalação anterior trouxe e a atual não traz mais.

    Só arquivos que o **próprio instalador** escreveu antes são candidatos:
    é a única forma de retirar um template ou script aposentado sem tocar no
    que pertence ao projeto. Sem inventário anterior, nada é removido.
    """
    removed = []
    for rel in sorted(set(previous) - {str(p) for p in written}, reverse=True):
        path = target / rel
        if not path.is_file():
            continue
        path.unlink()
        removed.append(rel)
        parent = path.parent
        while parent != target and parent.is_dir() and not any(parent.iterdir()):
            parent.rmdir()
            parent = parent.parent
    return removed


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


# Termos que descrevem um mundo **acima** da raiz do escopo. Se qualquer um
# chega ao alvo, o harness instalado volta a ensinar o agente a subir — a falha
# que `exclude_files` e esta trava existem para impedir. O gate é sobre o texto
# que o agente lê como instrução.
BOUNDARY_TOKENS = ("vault", "categories/", "meta-projeto", "pop raiz",
                   "pop pai", "vault pai", "drafts/", "external-repository",
                   "repositórios agregados", "projeto-mãe", "full-multi-repo")
# Em código, identificador e glob não são instrução: `vault_root`, `--vault` e
# o padrão `categories/*/*` são mecânica interna e ficam. O que não pode é
# **texto dito ao agente** mandando-o sair do escopo — por isso o gate de `.py`
# olha só as mensagens (print, help, erro), não comentários nem regex.
BOUNDARY_TOKENS_CODE = ("meta-projeto", "pop raiz", "pop pai", "vault pai")


def _spoken_strings(source: str):
    """Literais que o script **diz** ao usuário: print, help= e erros."""
    import ast
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        target = node.func
        name = getattr(target, "id", None) or getattr(target, "attr", None)
        spoken = name in {"print", "error", "RuntimeError", "ValueError",
                          "SystemExit", "append"}
        for argument in (node.args if spoken else []):
            for piece in ast.walk(argument):
                if isinstance(piece, ast.Constant) and isinstance(piece.value, str):
                    yield piece.value
        for keyword in node.keywords:
            if keyword.arg != "help":
                continue
            for piece in ast.walk(keyword.value):
                if isinstance(piece, ast.Constant) and isinstance(piece.value, str):
                    yield piece.value


def boundary_violations() -> list[str]:
    """Rótulos do conjunto gerido que nomeiam algo fora do escopo do alvo.

    Falha fechada: instalar um harness que descreve o hospedeiro é o defeito,
    não um detalhe de redação. O alvo não deve nem ter vocabulário para
    descrever quem o instalou.
    """
    data = manifest()
    found = []
    for label, path in sorted(managed_sources(data)):
        if path.suffix not in {".md", ".py"}:
            continue
        # Audita o que **chega** ao alvo: `localize` já reescreve os wikilinks
        # com prefixo de categoria, e reprovar por eles seria falso positivo.
        text = localize(path.read_text(encoding="utf-8"),
                        included_paths=path.suffix == ".md")
        if path.suffix == ".md":
            haystacks, tokens = [text], BOUNDARY_TOKENS
        else:
            haystacks, tokens = list(_spoken_strings(text)), BOUNDARY_TOKENS_CODE
        hits = sorted({token for token in tokens
                       for hay in haystacks if token in hay.lower()})
        if hits:
            found.append(f"{label}: {', '.join(hits)}")
    return found


def audit() -> list[str]:
    data = manifest()
    missing = []
    for name in data["files"]:
        if not (SOURCE / name).is_file(): missing.append(name)
    for name in data["directories"]:
        if not (SOURCE / name).is_dir(): missing.append(name)
    for name in data["skills"]:
        if not (SKILLS_SOURCE / name / "SKILL.md").is_file(): missing.append(f"skill:{name}")
    return missing


def install(target: Path) -> None:
    target = target.resolve()
    if not target.is_dir():
        raise RuntimeError(f"destino não é diretório: {target}")
    missing = audit()
    if missing:
        raise RuntimeError("manifesto incompleto: " + ", ".join(missing))
    leaks = boundary_violations()
    if leaks:
        raise RuntimeError("conjunto gerido cita o escopo hospedeiro: "
                           + "; ".join(leaks))
    data = manifest()
    # harness_root: "pop" no manifest v2; "" (raiz do target) no v1 legado.
    hr = data.get("harness_root", "") or ""
    hb = target / hr if hr else target
    _, previous = installed_stamp(target, key="installed")
    # Preflight: somente caminhos explicitamente geridos podem ser escritos.
    written = []
    for name in data["files"]:
        copy_file(SOURCE / name, hb / name, included_paths=True)
        written.append(hb / name)
    for name in data["directories"]:
        written += copy_tree(SOURCE / name, hb / name, included_paths=True,
                             data=data, label_prefix=f"{name}/")
    for name in data["skills"]:
        written += copy_tree(SKILLS_SOURCE / name,
                             target / ".agents/skills" / name,
                             included_paths=True, data=data,
                             label_prefix=f"skills/{name}/")
    inventory = sorted(path.relative_to(target).as_posix() for path in written)
    prune(target, previous or [], [path.relative_to(target).as_posix()
                                   for path in written])
    # O marcador é o manifest + o carimbo de conteúdo e o inventário desta
    # instalação — o inventário é o que autoriza a poda da próxima.
    stamp = dict(data, content_sha=content_sha(data), installed=inventory)
    (hb / ".included-harness.json").write_text(
        json.dumps(stamp, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
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
    parser.add_argument("--check", action="store_true",
                        help="o harness está instalado no alvo?")
    parser.add_argument("--check-fresh", action="store_true",
                        help="o harness do alvo está na versão da origem?")
    parser.add_argument("--audit-manifest", action="store_true")
    parser.add_argument("--audit-boundary", action="store_true",
                        help="o conjunto gerido está livre do escopo hospedeiro?")
    parser.add_argument("--sha", action="store_true",
                        help="imprime o content_sha do harness na origem")
    args = parser.parse_args()
    missing = audit()
    if args.audit_manifest:
        if missing:
            print("manifesto incompleto: " + ", ".join(missing), file=sys.stderr); return 1
        print("manifesto fechado"); return 0
    if args.audit_boundary:
        leaks = boundary_violations()
        if leaks:
            print("conjunto gerido cita o escopo hospedeiro:", file=sys.stderr)
            for leak in leaks:
                print(f"  {leak}", file=sys.stderr)
            return 1
        print("fronteira íntegra"); return 0
    if (args.sha or args.check_fresh) and is_vendored():
        # Resposta local e completa. Comparar com a origem é responsabilidade
        # de quem instalou; o escopo não sai daqui para descobrir isso.
        _, stamped = installed_stamp(SOURCE.parent)
        version = stamped[:12] if stamped else "sem carimbo"
        print(f"harness instalado na versão {version} — a comparação com a "
              f"origem é feita por quem instalou, não por este escopo")
        return 0
    if args.sha:
        print(content_sha()); return 0
    if not args.target:
        parser.error("target é obrigatório")
    if args.check:
        marker, _ = installed_stamp(args.target)
        if missing or marker is None:
            print("harness incompleto", file=sys.stderr); return 1
        print("harness instalado"); return 0
    if args.check_fresh:
        if missing:
            print("manifesto incompleto: " + ", ".join(missing), file=sys.stderr)
            return 1
        marker, stamped = installed_stamp(args.target)
        if marker is None:
            print(f"harness ausente em {args.target}", file=sys.stderr); return 1
        current = content_sha()
        if stamped is None:
            print(f"harness sem carimbo em {marker} — instalado antes do "
                  f"content_sha; reinstale para datar", file=sys.stderr)
            return 1
        if stamped != current:
            print(f"harness DEFASADO em {args.target}: alvo {stamped[:12]} "
                  f"≠ origem {current[:12]} — rode "
                  f"`pop_install_included.py {args.target}`", file=sys.stderr)
            return 1
        print(f"harness atual ({current[:12]})"); return 0
    try:
        install(args.target)
    except RuntimeError as error:
        print(f"abortado: {error}", file=sys.stderr); return 1
    print(f"harness standalone instalado em {args.target}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
