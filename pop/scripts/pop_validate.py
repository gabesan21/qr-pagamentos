#!/usr/bin/env python3
"""pop_validate — valida os limites e invariantes do vault PoP.

Checa: descrições do INDEX.md raiz (<=144 chars) e dos INDEX.md de categoria
(<=600 chars); notas de harness com <=150 linhas (whitelist
positiva — só as pastas de harness, nunca o código do produto); anatomia
`pop/` obrigatória nos projetos de `categories/` (harness na raiz da pasta —
`kanban/` ou `.included-harness.json` fora de `pop/` — é violação, a
fronteira da regra 13); frontmatter
obrigatório dos cards de task e coerência do `stage:` com a pasta; worktrees
órfãs (aviso); wikilinks quebrados (aviso — link para nota futura é
legítimo); e anotações `<!-- pop-hash: <caminho> sha256=<hash> -->` de
citação de código (fail-closed: arquivo citado inexistente ou hash
divergente é violação — ver regra 9 do DOX). Coleções com `specs/INDEX.md`
também recebem validação estrita de metadados, estrutura, supersessão e
descoberta; coleções sem índice permanecem legadas. Exit 1 se houver violação;
avisos não falham.

Uso:
    python3 scripts/pop_validate.py [--vault DIR]
"""

import argparse
import datetime
import hashlib
import json
import re
import sys

import poplib
import pop_roadmap

MAX_ROOT_DESC = 144
MAX_CAT_DESC = 600
MAX_NOTE_LINES = 150
EXEMPT_NAMES = {"AGENTS.md", "WORKFLOW.md", "README.md"}
CARD_REQUIRED = ("id", "project", "stage", "created", "updated")
ORIGIN_VALUES = ("roadmap", "modifications")
MODIFICATION_REF = re.compile(r"^M-\d+$")
SIZE_VALUES = {"S", "M", "L"}
SPEC_REQUIRED = (
    "id", "project", "domain", "kind", "status", "implementation",
    "origin", "created", "updated", "supersedes", "superseded_by",
)
SPEC_ENUMS = {
    "kind": {"contract", "overview"},
    "status": {"draft", "active", "superseded"},
    "implementation": {"planned", "partial", "implemented",
                       "not_applicable"},
}
KEBAB_CASE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

ROOT_ENTRY = re.compile(r"^- \[\[.*?\]\]\s*—\s*(.+)$")
TASK_DIR = re.compile(r"^(?:\d+\.\d+\.\d+|M-\d+\.\d+)-")
WIKILINK = re.compile(r"!?\[\[([^\]|#^]*)")
POP_HASH = re.compile(r"<!--\s*pop-hash:\s*(\S+)\s+sha256=([0-9a-fA-F]+)\s*-->")
INLINE_CODE = re.compile(r"`[^`]*`")
LINK_SKIP_PARTS = {"external-repository", ".obsidian", ".git", "worktrees",
                   "__pycache__", "node_modules", "vendor"}
# Sufixos dos artefatos de estágio da própria task (criados só ao avançar no
# kanban): um card em 001-005 linka `.plan/.approval/.verify` que ainda não
# nasceram — link de navegação esperado, não quebra real (ver [[WORKFLOW]]).
STAGE_ARTIFACT_SUFFIXES = (".plan", ".approval", ".verify")
EXTERNAL_PROJECT_LINK = re.compile(r"\[\[categories/[^/]+/[^/]+/")


def _spec_links(path):
    """Retorna alvos de wikilinks fora de fences, sem alias ou heading."""
    links = []
    for _, line in lines_outside_fences(path):
        for match in WIKILINK.finditer(INLINE_CODE.sub("", line)):
            target = match.group(1).strip().rstrip("\\").split("#", 1)[0]
            if target:
                links.append(target)
    return links


def _spec_aliases(root, specs_dir, path):
    """Formas de wikilink aceitas para um documento da coleção."""
    rel_collection = path.relative_to(specs_dir).with_suffix("").as_posix()
    rel_root = path.relative_to(root).with_suffix("").as_posix()
    return {path.stem, rel_collection, rel_root}


def _linked_specs(root, specs_dir, source, documents):
    """Resolve links de `source` somente contra documentos desta coleção."""
    aliases = {}
    for path in documents:
        for alias in _spec_aliases(root, specs_dir, path):
            aliases.setdefault(alias, set()).add(path)
    resolved = set()
    for target in _spec_links(source):
        matches = aliases.get(target.removesuffix(".md"), set())
        if len(matches) == 1:
            resolved.update(matches)
    return resolved


def _valid_iso_date(value):
    """Valida data canônica AAAA-MM-DD e devolve date, ou None."""
    raw = str(value or "")
    try:
        parsed = datetime.date.fromisoformat(raw)
    except ValueError:
        return None
    return parsed if parsed.isoformat() == raw else None


def check_spec_collections(root, projects, violations):
    """Valida o contrato opt-in das coleções que possuem `specs/INDEX.md`.

    Uma coleção sem índice é legada. Depois da adoção, todo Markdown exceto o
    índice é spec canônica; contratos atuais devem ser alcançáveis diretamente
    pelo índice ou por um overview que ele referencia diretamente.
    """
    for project in projects:
        specs_dir = poplib.harness_root(project) / "specs"
        index = specs_dir / "INDEX.md"
        if not index.is_file():
            continue

        documents = sorted(path for path in specs_dir.rglob("*.md")
                           if path != index)
        metadata = {}
        ids = {}
        expected_project = poplib.project_label(root, project)

        for path in documents:
            rel = path.relative_to(specs_dir)
            if len(rel.parts) > 2:
                violations.append(
                    f"{path}:1: spec em profundidade inválida; use no máximo "
                    "`specs/<domain>/arquivo.md`")

            meta, _ = poplib.parse_frontmatter(
                path.read_text(encoding="utf-8"))
            metadata[path] = meta
            for field in SPEC_REQUIRED:
                if field not in meta:
                    violations.append(
                        f"{path}:1: frontmatter sem `{field}`")
                elif (field not in {"supersedes", "superseded_by"}
                      and meta[field] in (None, "")):
                    violations.append(
                        f"{path}:1: frontmatter com `{field}` vazio")

            spec_id = meta.get("id")
            if not isinstance(spec_id, str) or not KEBAB_CASE.fullmatch(spec_id):
                violations.append(f"{path}:1: `id` inválido `{spec_id}` "
                                  "(use kebab-case)")
            elif spec_id in ids:
                violations.append(f"{path}:1: `id` duplicado `{spec_id}` "
                                  f"(também em {ids[spec_id]})")
            else:
                ids[spec_id] = path

            if meta.get("project") != expected_project:
                violations.append(
                    f"{path}:1: `project` `{meta.get('project')}` difere do "
                    f"label do escopo `{expected_project}`")

            domain = meta.get("domain")
            if not isinstance(domain, str) or not KEBAB_CASE.fullmatch(domain):
                violations.append(f"{path}:1: `domain` inválido `{domain}` "
                                  "(use kebab-case)")
            elif len(rel.parts) == 2 and domain != rel.parts[0]:
                violations.append(
                    f"{path}:1: `domain` `{domain}` difere da pasta "
                    f"`{rel.parts[0]}`")

            for field, accepted in SPEC_ENUMS.items():
                if meta.get(field) not in accepted:
                    options = " | ".join(sorted(accepted))
                    violations.append(
                        f"{path}:1: `{field}` inválido `{meta.get(field)}` "
                        f"(use {options})")

            created = _valid_iso_date(meta.get("created"))
            updated = _valid_iso_date(meta.get("updated"))
            if created is None:
                violations.append(f"{path}:1: `created` inválido "
                                  f"`{meta.get('created')}` (use AAAA-MM-DD)")
            if updated is None:
                violations.append(f"{path}:1: `updated` inválido "
                                  f"`{meta.get('updated')}` (use AAAA-MM-DD)")
            if created and updated and updated < created:
                violations.append(f"{path}:1: `updated` anterior a `created`")

            supersedes_value = meta.get("supersedes")
            if not isinstance(supersedes_value, list):
                violations.append(f"{path}:1: `supersedes` deve ser lista")
            else:
                for old_id in supersedes_value:
                    if (not isinstance(old_id, str)
                            or not KEBAB_CASE.fullmatch(old_id)):
                        violations.append(
                            f"{path}:1: ID inválido em `supersedes`: "
                            f"`{old_id}`")

            replacement_value = meta.get("superseded_by")
            if (replacement_value is not None
                    and (not isinstance(replacement_value, str)
                         or not KEBAB_CASE.fullmatch(replacement_value))):
                violations.append(
                    f"{path}:1: `superseded_by` inválido "
                    f"`{replacement_value}` (use um ID em kebab-case)")

        for path, meta in metadata.items():
            spec_id = meta.get("id")
            status = meta.get("status")
            replacement_value = meta.get("superseded_by")
            replacement = (replacement_value
                           if isinstance(replacement_value, str) else None)
            supersedes = meta.get("supersedes")
            supersedes = supersedes if isinstance(supersedes, list) else []

            if status == "superseded" and not replacement:
                violations.append(
                    f"{path}:1: spec `superseded` sem `superseded_by`")
            if status in {"draft", "active"} and replacement:
                violations.append(
                    f"{path}:1: spec `{status}` não pode ter `superseded_by`")
            if supersedes and status not in {"draft", "active"}:
                violations.append(
                    f"{path}:1: spec que substitui outra deve ser draft ou active")

            if replacement:
                replacement_path = ids.get(replacement)
                if replacement_path is None:
                    violations.append(
                        f"{path}:1: `superseded_by` referencia ID inexistente "
                        f"`{replacement}`")
                else:
                    replacement_meta = metadata[replacement_path]
                    if replacement_meta.get("status") not in {"draft", "active"}:
                        violations.append(
                            f"{path}:1: substituta `{replacement}` deve ser "
                            "draft ou active")
                    if spec_id not in (replacement_meta.get("supersedes") or []):
                        violations.append(
                            f"{path}:1: supersessão não recíproca com "
                            f"`{replacement}`")

            for old_id in supersedes:
                if not isinstance(old_id, str):
                    continue
                old_path = ids.get(old_id)
                if old_path is None:
                    violations.append(
                        f"{path}:1: `supersedes` referencia ID inexistente "
                        f"`{old_id}`")
                    continue
                old_meta = metadata[old_path]
                if old_meta.get("status") != "superseded":
                    violations.append(
                        f"{path}:1: spec substituída `{old_id}` deve ter status "
                        "superseded")
                if old_meta.get("superseded_by") != spec_id:
                    violations.append(
                        f"{path}:1: supersessão não recíproca com `{old_id}`")

        direct = _linked_specs(root, specs_dir, index, documents)
        via_overview = set()
        for path in direct:
            if metadata[path].get("kind") == "overview":
                via_overview.update(
                    _linked_specs(root, specs_dir, path, documents))
        reachable = direct | via_overview
        for path, meta in metadata.items():
            if meta.get("status") in {"draft", "active"} and path not in reachable:
                violations.append(
                    f"{path}:1: spec `{meta.get('status')}` inalcançável por "
                    "`specs/INDEX.md` diretamente ou via overview")


def lines_outside_fences(path):
    """Itera (nº da linha, linha) ignorando blocos de código cercados."""
    in_fence = False
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            yield n, line


def check_root_index(root, violations):
    """(a) INDEX.md raiz: descrição de projeto <=144 chars."""
    index = root / "INDEX.md"
    if not index.is_file():
        return
    for n, line in lines_outside_fences(index):
        m = ROOT_ENTRY.match(line.strip())
        if m and len(m.group(1)) > MAX_ROOT_DESC:
            violations.append(f"{index}:{n}: descrição com {len(m.group(1))} "
                              f"chars (máx. {MAX_ROOT_DESC})")


def check_category_indexes(root, categories, violations):
    """(b) INDEX.md de categoria: descrição de projeto <=600 chars."""
    for category in sorted(categories):
        index = root / "categories" / category / "INDEX.md"
        if not index.is_file():
            continue
        entry_start, desc = None, []

        def flush():
            if entry_start and len(" ".join(desc)) > MAX_CAT_DESC:
                violations.append(
                    f"{index}:{entry_start}: descrição com "
                    f"{len(' '.join(desc))} chars (máx. {MAX_CAT_DESC})")

        for n, line in lines_outside_fences(index):
            stripped = line.strip()
            if stripped.startswith("#"):
                flush()
                entry_start = n if stripped.startswith("### ") else None
                desc = []
            elif entry_start and stripped and not stripped.startswith("- **Status:**"):
                desc.append(stripped)
        flush()


def note_limit(path):
    """Limite de linhas do arquivo, ou None se isento."""
    if path.name in EXEMPT_NAMES:
        return None
    if path.name.endswith(".excalidraw.md"):
        return None  # diagrama Excalidraw: JSON embutido, não é nota
    return MAX_NOTE_LINES


def check_note_sizes(root, projects, violations):
    """(c) .md de harness <=150 linhas.

    Whitelist positiva (`poplib.iter_harness_markdown`): a régua só alcança as
    pastas de harness de cada escopo descoberto — nunca arquivos do projeto
    (código, docs do repo, `project/`, vendor, `node_modules`). Cada repo
    embutido de `full-multi-repo` entra como escopo próprio, então seu harness
    é coberto, mas seu código não. A raiz (meta-projeto `pop`) é só mais um
    escopo, coberta pelas suas próprias pastas de planejamento.
    """
    for scope in projects:
        for path in poplib.iter_harness_markdown(scope):
            limit = note_limit(path)
            if limit is None:
                continue
            count = len(path.read_text(encoding="utf-8").splitlines())
            if count > limit:
                violations.append(f"{path}:1: {count} linhas (máx. {limit})")


def check_card_origin(card, meta, violations):
    """Frontmatter da origem: roadmap exige epoch/phase; modifications exige
    `modification: M-<n>` (e não exige epoch/phase). Card antigo sem `origin`
    é inferido pelo prefixo `M-` do id."""
    origin = meta.get("origin")
    if origin in (None, ""):
        origin = ("modifications"
                  if str(meta.get("id") or "").startswith("M-") else "roadmap")
    elif origin not in ORIGIN_VALUES:
        violations.append(f"{card}:1: `origin` inválido `{origin}` "
                          f"(use {' | '.join(ORIGIN_VALUES)})")
        return
    if origin == "roadmap":
        for field in ("epoch", "phase"):
            if meta.get(field) in (None, ""):
                violations.append(f"{card}:1: frontmatter sem `{field}` "
                                  "(origem roadmap)")
    elif not MODIFICATION_REF.fullmatch(str(meta.get("modification") or "")):
        violations.append(f"{card}:1: `modification` ausente ou inválido "
                          f"`{meta.get('modification')}` (use M-<n>)")


def check_cards(root, projects, violations):
    """(d) cards: frontmatter obrigatório e stage coerente com a pasta."""
    for project in projects:
        for stage, task_dir, card in poplib.iter_cards(project):
            meta = poplib.read_card(card)
            for field in CARD_REQUIRED:
                if meta.get(field) in (None, ""):
                    violations.append(f"{card}:1: frontmatter sem `{field}`")
            check_card_origin(card, meta, violations)
            if meta.get("stage") and meta["stage"] != stage:
                violations.append(f"{card}:1: stage `{meta['stage']}` difere "
                                  f"da pasta `{stage}`")
            size = meta.get("size")
            if size not in (None, "") and str(size) not in SIZE_VALUES:
                violations.append(f"{card}:1: `size` inválido `{size}` "
                                  f"(use S | M | L)")
            for gate in ("003", "005"):
                key = f"yolo_{gate}_returns"
                if key not in meta:
                    continue
                try:
                    count = int(meta[key])
                except (TypeError, ValueError):
                    count = -1
                if count < 0 or count > poplib.YOLO_RETURN_LIMIT:
                    violations.append(
                        f"{card}:1: `{key}` inválido `{meta[key]}` (use 0..2)")
            if meta.get("circuit_breaker") is True and meta.get("blocked") is not True:
                violations.append(
                    f"{card}:1: circuit breaker exige `blocked: true`")
            telemetry = poplib.telemetry_path(task_dir)
            if telemetry.is_file():
                data = poplib.read_telemetry(task_dir)
                if not data["events"] and telemetry.stat().st_size:
                    violations.append(f"{telemetry}: telemetria inválida")


def check_release(root, projects, warnings):
    """(g) card além de 001 sem a liberação marcada (aviso)."""
    for project in projects:
        for stage, task_dir, card in poplib.iter_cards(project):
            if stage != "001_initial_task" and not poplib.task_released(card):
                warnings.append(f"{card}:1: em {stage} sem `- [x] Pronto "
                                f"para planejar` — gate de liberação pulado?")


def check_worktrees(root, projects, warnings):
    """(e) worktrees não vazias sem task em 004_processing (aviso)."""
    for project in projects:
        harness = poplib.harness_root(project)
        wt_root = harness / "worktrees"
        if not wt_root.is_dir():
            continue
        for wt in sorted(p for p in wt_root.iterdir() if p.is_dir()):
            if not any(wt.iterdir()):
                continue
            if project == root and not TASK_DIR.match(wt.name):
                continue  # worktree de sessão da regra 19, não de task
            if not (harness / "kanban" / "004_processing" / wt.name).is_dir():
                warnings.append(f"{wt}: worktree sem task correspondente em "
                                f"004_processing")


def check_roadmap_residuals(root, violations):
    """Task com memory já concluída não pode permanecer no roadmap nem nas
    modifications (no MODIFICATIONS.md o resíduo é o wikilink da task)."""
    for scope, path, number, task_id in pop_roadmap.residuals(root):
        memory = pop_roadmap.memory_path(root, scope, task_id)
        # O escopo raiz é o próprio repo validado (meta PoP ou included
        # standalone). Escopos aninhados só contam com prova versionada pelo
        # vault, evitando mutar clones externos gitignorados.
        if scope != root and not pop_roadmap.tracked(root, memory):
            continue
        violations.append(
            f"{path}:{number}: task concluída residual `{task_id}` — "
            "remova a linha (ou o wikilink, no MODIFICATIONS.md) após "
            "validar a memory")


# Marcadores inequívocos de harness do PoP fora de `pop/`: um projeto legado
# sempre tem `kanban/` na raiz (qualquer type) ou, se included, o manifesto na
# raiz. Uma pasta `project/` sem harness é scaffold ainda-não-importado (não é
# projeto do PoP) — fica de fora, não é violação de anatomia. Nomes genéricos
# (`scripts/`, `docs/`) que o código do produto pode ter legitimamente também
# ficam de fora, como manda a whitelist positiva.
LEGACY_MARKERS = ("kanban", ".included-harness.json")


def _scan_legacy_markers(scope, root, violations):
    """Reporta marcadores inequívocos de harness fora de `pop/` num escopo."""
    for name in LEGACY_MARKERS:
        if (scope / name).exists():
            violations.append(
                f"{(scope / name)}: harness fora de `pop/` — anatomia legada / "
                f"fronteira da regra 13; mova o harness para `pop/`")


def check_strict_anatomy(root, violations):
    """(i) anatomia `pop/` obrigatória nos projetos de `categories/`.

    Num projeto sob `categories/` (e em cada repo embutido de full-multi-repo),
    nenhum artefato inequívoco de harness do PoP pode estar na raiz da pasta:
    `kanban/` ou `.included-harness.json` fora de `pop/` é violação — o harness
    inteiro mora em `pop/`. A raiz do vault (meta-projeto) é isenta: sua
    anatomia mora na raiz por exceção documentada.
    """
    categories = root / "categories"
    if not categories.is_dir():
        return
    for project in sorted(categories.glob("*/*")):
        if not project.is_dir():
            continue
        if any(part.startswith(".") for part in project.relative_to(root).parts):
            continue
        _scan_legacy_markers(project, root, violations)
        # um nível a mais: repo embutido de full-multi-repo
        for sub in sorted(project.glob("*")):
            if sub.is_dir() and sub.name != "pop" and not sub.name.startswith("."):
                _scan_legacy_markers(sub, root, violations)


def check_wikilinks(root, warnings):
    """(f) wikilinks quebrados: alvo sem arquivo correspondente (aviso)."""
    targets = set()
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        # partes relativas à raiz: nome de pasta acima do vault não interfere
        if LINK_SKIP_PARTS & set(rel.parts):
            continue
        rel = rel.as_posix().lower()
        targets.update({path.name.lower(), path.stem.lower(), rel})
        if rel.endswith(".md"):
            targets.add(rel[:-3])
    # Origem restrita ao harness (whitelist): wikilink quebrado em doc de código
    # ou vendor é ruído, não sinal. A coleta de ALVOS acima segue a árvore toda,
    # então um link de harness para um arquivo de código continua resolvendo.
    for path in sorted(poplib.iter_all_harness_markdown(root)):
        if path.name.endswith(".excalidraw.md"):
            continue
        for n, line in lines_outside_fences(path):
            for m in WIKILINK.finditer(INLINE_CODE.sub("", line)):
                # `\` final: alias com pipe escapado (`[[x\|y]]` em tabela)
                target = m.group(1).strip().rstrip("\\")
                # pula vazio (link só de heading), placeholder e reticências
                if not target or "<" in target or set(target) <= {"."}:
                    continue
                low = target.lower()
                name = low.rsplit("/", 1)[-1]
                if {low, f"{low}.md", name} & targets:
                    continue
                # Link da task para um artefato de estágio irmão ainda não
                # criado (`<id>.plan|approval|verify`): navegação esperada.
                src_stem = path.stem.lower()
                for suf in STAGE_ARTIFACT_SUFFIXES:
                    if src_stem.endswith(suf):
                        src_stem = src_stem[: -len(suf)]
                        break
                if name in {f"{src_stem}{suf}" for suf in STAGE_ARTIFACT_SUFFIXES}:
                    continue
                warnings.append(f"{path}:{n}: wikilink quebrado [[{target}]]")


def check_hash_pins(root, violations):
    """(h) anotações pop-hash: arquivo citado existe e o hash confere.

    Fail-closed (regra 9 do DOX): anotação malformada, arquivo citado
    inexistente ou hash divergente é violação. Caminho é relativo à pasta
    do arquivo que carrega a anotação; a mensagem de divergência imprime
    o hash atual para colar após revisar a citação.
    """
    for path in sorted(root.rglob("*.md")):
        parts = set(path.relative_to(root).parts)
        if parts & LINK_SKIP_PARTS or "_templates" in parts or "raw" in parts:
            continue
        for n, line in lines_outside_fences(path):
            for m in POP_HASH.finditer(line):
                relpath, digest = m.group(1), m.group(2).lower()
                if len(digest) != 64:
                    violations.append(f"{path}:{n}: pop-hash malformado "
                                      f"(sha256 com {len(digest)} hex, "
                                      f"esperado 64)")
                    continue
                target = (path.parent / relpath).resolve()
                if not target.is_file():
                    violations.append(f"{path}:{n}: pop-hash cita arquivo "
                                      f"inexistente `{relpath}`")
                    continue
                actual = hashlib.sha256(target.read_bytes()).hexdigest()
                if actual != digest:
                    violations.append(
                        f"{path}:{n}: pop-hash divergente para `{relpath}` "
                        f"— o arquivo citado mudou; revise a citação e "
                        f"atualize para sha256={actual}")


def check_standalone(root, violations):
    """Contrato estrito para um clone included, sem fallback ao vault pai.

    O harness mora em `pop/` (`hb`), com o `.included-harness.json` dentro
    dele; skills ficam sempre na raiz do repo. Sem `pop/` a checagem falha
    fechada (manifesto ausente).
    """
    hb = root / "pop"
    manifest_path = hb / ".included-harness.json"
    if not manifest_path.is_file():
        violations.append(f"{manifest_path}: manifesto standalone ausente")
        return
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        violations.append(f"{manifest_path}: JSON inválido: {error}")
        return
    for name in data.get("files", []):
        if not (hb / name).is_file():
            violations.append(f"{hb / name}: arquivo obrigatório ausente")
    for name in data.get("directories", []):
        if not (hb / name).is_dir():
            violations.append(f"{hb / name}: diretório obrigatório ausente")
    for name in data.get("skills", []):
        path = root / ".agents/skills" / name / "SKILL.md"
        if not path.is_file():
            violations.append(f"{path}: skill obrigatória ausente")
    for name in data.get("anatomy", []):
        if not (hb / name).is_dir():
            violations.append(f"{hb / name}: anatomia obrigatória ausente")
    for name in data.get("keep_files", []):
        if not (hb / name).is_file():
            violations.append(f"{hb / name}: marcador Git obrigatório ausente")
    for path in root.rglob("*.md"):
        parts = set(path.relative_to(root).parts)
        if parts & {".git", "worktrees", "kanban"}:
            continue
        for n, line in lines_outside_fences(path):
            if EXTERNAL_PROJECT_LINK.search(line):
                violations.append(f"{path}:{n}: link aponta para vault pai")


def main():
    parser = argparse.ArgumentParser(
        description="Valida limites do vault: 144/600 chars, 150 linhas, "
                    "frontmatter dos cards, worktrees órfãs, wikilinks "
                    "quebrados, specs adotadas e anotações pop-hash de "
                    "citação de código.")
    parser.add_argument("--vault", metavar="DIR",
                        help="raiz do vault (default: pasta acima de scripts/)")
    parser.add_argument("--standalone", action="store_true",
                        help="falha fechada para o contrato included local")
    args = parser.parse_args()

    root = poplib.vault_root(args.vault)
    projects = poplib.discover_projects(root)
    categories = {poplib.project_label(root, p).split("/")[0]
                  for p in projects if p != root}

    violations, warnings = [], []
    check_root_index(root, violations)
    check_category_indexes(root, categories, violations)
    check_note_sizes(root, projects, violations)
    check_cards(root, projects, violations)
    check_release(root, projects, warnings)
    check_worktrees(root, projects, warnings)
    check_roadmap_residuals(root, violations)
    check_strict_anatomy(root, violations)
    check_spec_collections(root, projects, violations)
    check_wikilinks(root, warnings)
    check_hash_pins(root, violations)
    if args.standalone:
        check_standalone(root, violations)

    for w in warnings:
        print(f"[AVISO] {w}")
    for v in violations:
        print(f"[VIOLAÇÃO] {v}")
    if violations:
        print(f"\n{len(violations)} violação(ões) encontrada(s).")
        return 1
    if args.standalone:
        print("standalone válido")
    print("Vault válido — nenhuma violação encontrada."
          + (f" ({len(warnings)} aviso(s).)" if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
