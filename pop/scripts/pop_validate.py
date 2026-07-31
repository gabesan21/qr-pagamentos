#!/usr/bin/env python3
"""pop_validate — valida os limites e invariantes do vault PoP.

Checa: descrições do INDEX.md raiz (<=144 chars) e dos INDEX.md de categoria
(<=600 chars); notas de harness com <=150 linhas, raiz de plano com <=80 e
arquivo de frente em `subtasks/` com <=50 (whitelist
positiva — só as pastas de harness, nunca o código do produto); anatomia
`pop/` obrigatória nos projetos de `categories/` (harness na raiz da pasta —
`kanban/` ou `.included-harness.json` fora de `pop/` — é violação, a
fronteira da regra 13); frontmatter
obrigatório dos cards de task e coerência do `stage:` com a pasta; tetos dos
artefatos do gate adversarial (defesa 30, acusação 50, julgamento 40) e a
exclusividade entre as duas configurações do ato 1; layout de `memory/`
(pasta por data de conclusão, ledger <=1200 chars, entrada <=800 chars com
wikilink de evidência e indexada pelo ledger); worktrees
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
MAX_PLAN_LINES = 80      # raiz do plano (`<id>.plan.md`), independente de size
MAX_FRONT_LINES = 50     # arquivo de frente em `subtasks/`: fatia de 1 executor
MAX_PROJECT_AGENTS = 60  # AGENTS.md de projeto: ponteiro, não cópia do fluxo
# Tetos dos três artefatos do gate adversarial (ver [[specs/gate-adversarial]],
# tabela "Interfaces"). A chave é o sufixo do artefato **de task**, nunca o nome
# de um template: `_templates/TASK-DEFENSE.md` segue sendo nota comum de 150.
# O teto vale **por rodada**: o infixo `.r<n>` fica antes do sufixo, então o
# casamento por `endswith` já alcança `<id>.r2.accusation.md`.
GATE_ARTIFACT_LIMITS = {
    ".defense.md": 30,      # decisões contestáveis do plano
    ".accusation.md": 50,   # objeções do advogado do diabo
    ".judgment.md": 40,     # julgamento e rota do juiz
}
# Tetos de memory, em **caracteres**: memory é ledger e entrada, não nota, e o
# que a torna otimizável por agente é o tamanho do arquivo, não o nº de linhas.
# O ledger é a prova (frontmatter, entrega, verificação, índice); a entrada é
# uma coisa feita, com evidência linkada (ver [[_templates/MEMORY]] e
# [[_templates/MEMORY-ENTRY]]). Quem mede memory é `check_memory` — `note_limit`
# não alcança `memory/`.
MAX_MEMORY_LEDGER = 1200
MAX_MEMORY_ENTRY = 800
# Data em que o layout `memory/<AAAA-MM-DD>/` passou a ser obrigatório. Memory
# plana anterior a ela é legado tolerado — é o que mantém válidos os clones
# `included`, cujas memories este vault não reescreve.
MEMORY_LAYOUT_SINCE = "2026-07-27"
MEMORY_DATE_DIR = pop_roadmap.MEMORY_DATE_DIR
# Entrada: `<id>.<nn>-<slug>.md` na mesma pasta do ledger `<id>.md`. O `.`
# reaproveita a convenção dos artefatos de kanban (`<id>.plan.md`).
MEMORY_ENTRY_SUFFIX = re.compile(r"^\.(\d{2}-[a-z0-9][a-z0-9-]*)$")
VERIFY_ARTIFACT = ".verify.md"
GATE_PAIR_ARTIFACTS = (".accusation.md", ".judgment.md")
# Infixo de rodada dos artefatos do ato 1 (`<id>.r<n>.<artefato>.md`, desde
# `r1`): o que decide a configuração é a **família** do artefato, nunca a
# rodada, então toda checagem casa o nome com e sem o infixo.
ROUND_INFIX = re.compile(r"\.r\d+$")
# Data em que o gate adversarial passou a vigorar (ver [[WORKFLOW]], ato 1 do
# `005_closing`, "Transição — card anterior ao gate"). Card com `created:`
# anterior a ela passou por 002 quando a defesa ainda não existia: mesmo sob o
# gatilho, ele roda em configuração B e seu `.verify.md` é o esperado.
GATE_ADVERSARIAL_SINCE = "2026-07-27"
# Aplicação embute o processo DOX e só por isso excede o teto (regra 5).
DOX_MARKER = "Processo DOX"
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
# kanban): um card recém-criado linka `.plan/.approval/.verify` que ainda não
# nasceram — link de navegação esperado, não quebra real (ver [[WORKFLOW]]).
# Os artefatos do ato 1 levam infixo de rodada (`<id>.r<n>.accusation`), que
# `_stage_artifact_base` remove dos dois lados da comparação.
STAGE_ARTIFACT_SUFFIXES = (".plan", ".approval", ".verify",
                           ".defense", ".accusation", ".judgment")
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

            # Mesmo critério do `memory_valid`: o rótulo separa projetos
            # irmãos, então só vale onde existem irmãos. Num clone standalone
            # (escopo == raiz) a spec carrega o rótulo do vault pai, que o
            # clone não reproduz — basta o campo estar preenchido.
            if project == root:
                if not meta.get("project"):
                    violations.append(f"{path}:1: `project` vazio")
            elif meta.get("project") != expected_project:
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
    """Limite de linhas do arquivo, ou None se isento.

    Artefatos de planejamento têm régua própria e mais curta: a raiz do plano
    é a fatia lida por todo mundo e o arquivo de frente é a fatia lida por um
    executor. Plano que não couber **modulariza** em `subtasks/`; comprimir ou
    dividir a task é exceção (ver seção 002 do WORKFLOW). Defesa, acusação e
    julgamento seguem a mesma lógica, com os tetos que a spec do gate
    adversarial fixa.
    """
    if path.name in EXEMPT_NAMES:
        return None
    if path.name.endswith(".excalidraw.md"):
        return None  # diagrama Excalidraw: JSON embutido, não é nota
    for suffix, limit in GATE_ARTIFACT_LIMITS.items():
        if path.name.endswith(suffix):
            return limit
    if path.name.endswith(".plan.md"):
        return MAX_PLAN_LINES
    if path.parent.name == "subtasks":
        return MAX_FRONT_LINES
    return MAX_NOTE_LINES


def check_note_sizes(root, projects, violations):
    """(c) .md de harness <=150 linhas (plano: 80; frente em `subtasks/`: 50).

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
            kind = meta.get("return_kind")
            if kind not in (None, "") and str(kind) not in poplib.RETURN_KINDS:
                violations.append(
                    f"{card}:1: `return_kind` inválido `{kind}` "
                    f"(use {' | '.join(poplib.RETURN_KINDS)})")
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


def gate_adversarial_applies(meta):
    """Gatilho do par advogado + juiz, derivável só do frontmatter do card.

    `yolo: true` **e** (`size: L` **ou** `critical: true`) — nenhuma marca nova
    liga o gate (ver [[specs/gate-adversarial]]).
    """
    return meta.get("yolo") is True and (str(meta.get("size")) == "L"
                                         or meta.get("critical") is True)


def gate_adversarial_predates(meta):
    """Card planejado antes de o gate vigorar — cláusula de transição.

    `created:` anterior a `GATE_ADVERSARIAL_SINCE` significa 002 concluído
    quando a defesa ainda não existia: o ato 1 roda em configuração B e o
    `.verify.md` é o artefato correto, mesmo com o gatilho ligado. Usa só campo
    existente e imutável; `created:` ausente ou inválido não isenta (e já é
    violação por conta própria).
    """
    created = _valid_iso_date(meta.get("created"))
    return created is not None and created.isoformat() < GATE_ADVERSARIAL_SINCE


def gate_artifacts_of(task_dir):
    """Artefatos do ato 1 desta task, como pares (caminho, família).

    Varre a pasta em vez de casar o nome literal `<id><família>`, porque o
    artefato do par nasce por rodada (`<id>.r<n>.accusation.md`, desde `r1`) e
    o `.verify.md` pode aparecer com o mesmo infixo. O que decide a
    configuração é a família; a rodada só distingue as tentativas.
    """
    found = []
    for path in sorted(task_dir.iterdir()):
        if not path.is_file():
            continue
        for family in (VERIFY_ARTIFACT, *GATE_PAIR_ARTIFACTS):
            if not path.name.endswith(family):
                continue
            stem = path.name[: -len(family)]
            if ROUND_INFIX.sub("", stem) == task_dir.name:
                found.append((path, family))
            break
    return found


def check_gate_artifacts(root, projects, violations):
    """(k) exclusividade entre as duas configurações do ato 1 do 005_closing.

    Onde o gatilho liga, o ato 1 é julgado pelo par advogado + juiz e não
    existe `.verify.md`; onde não liga, vale o revisor único e não nascem
    `.accusation.md` nem `.judgment.md`. Nunca os três — daí a coexistência
    `.verify` + artefato do par ser violação em qualquer direção: seja qual for
    o gatilho, um dos dois está fora da configuração vigente. A regra é por
    família, então vale igual para cada rodada (`<id>.r<n>.<artefato>.md`).

    **Ausência nunca é violação:** quase nenhuma task tem qualquer um dos três,
    e task fora do yolo nunca terá. A regra é de coexistência e de coerência
    com o gatilho, jamais de presença.

    **Transição:** card com `created:` anterior a `GATE_ADVERSARIAL_SINCE` roda
    em configuração B mesmo sob o gatilho — a mesma cláusula que o ato 1 do
    `005_closing` enuncia. A isenção é **estreita**: ela só tira o `.verify.md`
    da lista de proibidos, e o artefato do par continua proibido nesse card.
    Pular a checagem inteira deixaria a coexistência passar justamente na
    classe de maior risco.
    """
    for project in projects:
        for _, task_dir, card in poplib.iter_cards(project):
            meta = poplib.read_card(card)
            if not gate_adversarial_applies(meta):
                forbidden = GATE_PAIR_ARTIFACTS
                reason = ("gate adversarial desligado: o ato 1 é o revisor "
                          "independente único, que produz `.verify.md`")
            elif gate_adversarial_predates(meta):
                forbidden = GATE_PAIR_ARTIFACTS
                reason = ("card anterior a " + GATE_ADVERSARIAL_SINCE + ": a "
                          "cláusula de transição isenta só o `.verify.md`, e o "
                          "ato 1 roda em configuração B")
            else:
                forbidden = (VERIFY_ARTIFACT,)
                reason = ("gate adversarial ligado (`yolo: true` e (`size: L` "
                          "ou `critical: true`)): o ato 1 é o par advogado + "
                          "juiz, sem revisor independente")
            for path, family in gate_artifacts_of(task_dir):
                if family in forbidden:
                    violations.append(
                        f"{path}:1: `{family}` fora da configuração do ato 1 "
                        f"desta task — {reason}")


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


MEMORY_TASK_ID = re.compile(
    r"^(?:\d+\.\d+\.\d+-[a-z0-9][a-z0-9-]*"
    r"|M-\d+\.\d+-[a-z0-9][a-z0-9-]*"
    r"|D-\d{8}-[a-z0-9][a-z0-9-]*)$")


def _memory_entry_of(stem, ledger_stems):
    """(task, entry) se `stem` é entrada de algum ledger presente, senão None.

    Casar contra os ledgers que existem — em vez de fatiar o nome por regex —
    é o que resolve `8.1.10-foo`: o id inteiro casa como ledger antes de
    qualquer tentativa de ler `.10-foo` como número de entrada.
    """
    for task in ledger_stems:
        if not stem.startswith(f"{task}."):
            continue
        match = MEMORY_ENTRY_SUFFIX.match(stem[len(task):])
        if match:
            return task, match.group(1)
    return None


def _check_memory_folder(folder, violations):
    """Uma pasta de data: um ledger por task e suas entradas subordinadas."""
    files = [p for p in sorted(folder.iterdir()) if p.suffix == ".md"]
    for path in sorted(folder.iterdir()):
        if path.is_dir():
            violations.append(
                f"{path}: pasta de data de memory não tem subpasta; ledger e "
                "entradas ficam lado a lado")
    ledgers = {p.stem: p for p in files if MEMORY_TASK_ID.match(p.stem)}
    ledger_text = {}
    for task, path in sorted(ledgers.items()):
        text = path.read_text(encoding="utf-8")
        ledger_text[task] = text
        meta, _ = poplib.parse_frontmatter(text)
        if meta.get("task") != task:
            violations.append(
                f"{path}:1: `task` `{meta.get('task')}` difere do nome do "
                f"arquivo `{task}`")
        for field in pop_roadmap.REQUIRED_MEMORY:
            if meta.get(field) in (None, ""):
                violations.append(f"{path}:1: ledger sem `{field}`")
        if str(meta.get("finished") or "") != folder.name:
            violations.append(
                f"{path}:1: `finished` `{meta.get('finished')}` difere da "
                f"pasta `{folder.name}`; a pasta é a data de conclusão")
        if len(text) > MAX_MEMORY_LEDGER:
            violations.append(
                f"{path}:1: ledger com {len(text)} caracteres "
                f"(máx. {MAX_MEMORY_LEDGER}) — mova conteúdo para entradas")

    for path in files:
        if path.stem in ledgers:
            continue
        parsed = _memory_entry_of(path.stem, ledgers)
        if parsed is None:
            violations.append(
                f"{path}:1: nome fora do layout de memory; use `<id>.md` "
                "(ledger) ou `<id>.<nn>-<slug>.md` (entrada) com ledger na "
                "mesma pasta")
            continue
        task, entry = parsed
        text = path.read_text(encoding="utf-8")
        meta, _ = poplib.parse_frontmatter(text)
        if meta.get("task") != task:
            violations.append(
                f"{path}:1: `task` `{meta.get('task')}` difere do ledger "
                f"`{task}`")
        if meta.get("entry") != entry:
            violations.append(
                f"{path}:1: `entry` `{meta.get('entry')}` difere do nome do "
                f"arquivo `{entry}`")
        if len(text) > MAX_MEMORY_ENTRY:
            violations.append(
                f"{path}:1: entrada com {len(text)} caracteres "
                f"(máx. {MAX_MEMORY_ENTRY}) — quase sempre são duas entradas")
        if not WIKILINK.search(text):
            violations.append(
                f"{path}:1: entrada sem wikilink de evidência; aponte a spec "
                "ou o arquivo que atesta a mudança")
        if f"[[{path.stem}" not in ledger_text.get(task, ""):
            violations.append(
                f"{path}:1: entrada órfã — não indexada em `## Entradas` do "
                f"ledger `{task}.md`")


def check_memory(root, projects, violations):
    """(m) `memory/` no layout granular: pasta de data, ledger e entradas.

    Memory plana em `memory/<id>.md` é legado tolerado enquanto `finished` for
    anterior a `MEMORY_LAYOUT_SINCE`, e a exigência do layout só alcança o
    **escopo corrente** (`scope == root`). Escopo aninhado valida a própria
    memory quando roda o seu `pop_validate`: cobrar aqui o layout de um clone
    `included` seria mandar este vault reescrever memory que não é dele — e a
    régua nasceria reprovando trabalho em voo lá dentro. O conteúdo das pastas
    de data, quando existem, é validado em qualquer escopo: aí o layout já foi
    adotado e o que se checa é coerência, não migração.
    """
    for scope in projects:
        base = poplib.harness_root(scope) / "memory"
        if not base.is_dir():
            continue
        for child in sorted(base.iterdir()):
            if child.is_dir():
                if _valid_iso_date(child.name) is None:
                    violations.append(
                        f"{child}: pasta de `memory/` deve ser uma data "
                        "`AAAA-MM-DD` (a data de conclusão da task)")
                    continue
                _check_memory_folder(child, violations)
            elif child.suffix == ".md" and scope == root:
                meta, _ = poplib.parse_frontmatter(
                    child.read_text(encoding="utf-8"))
                if str(meta.get("finished") or "") >= MEMORY_LAYOUT_SINCE:
                    violations.append(
                        f"{child}:1: memory solta em `memory/`; desde "
                        f"{MEMORY_LAYOUT_SINCE} o ledger mora em "
                        "`memory/<AAAA-MM-DD>/<id>.md`")


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


def _stage_artifact_base(stem):
    """Id da task por trás de um stem de artefato de estágio.

    Remove o sufixo de artefato e, atrás dele, o infixo de rodada — `<id>`,
    `<id>.verify` e `<id>.r2.accusation` reduzem todos ao mesmo `<id>`.
    """
    for suffix in STAGE_ARTIFACT_SUFFIXES:
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    return ROUND_INFIX.sub("", stem)


def _is_stage_artifact_of(name, base):
    """`name` é artefato de estágio da task `base`, com ou sem rodada."""
    return (any(name.endswith(suffix) for suffix in STAGE_ARTIFACT_SUFFIXES)
            and _stage_artifact_base(name) == base)


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
                src_task = _stage_artifact_base(path.stem.lower())
                if _is_stage_artifact_of(name, src_task):
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


def check_project_agents(root, projects, violations):
    """(j) AGENTS.md de projeto cabe em 60 linhas — é ponteiro, não cópia.

    O arquivo cresce sozinho quando narra o fluxo em vez de linkar o WORKFLOW,
    e a narração apodrece na primeira mudança de estágio. Aplicação que embute
    o processo DOX é a única isenta (regra 5). O AGENTS.md da raiz é o do
    vault, não de projeto: fora do alcance.
    """
    for project in projects:
        if project == root:
            continue
        path = project / "AGENTS.md"
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        if DOX_MARKER in text:
            continue
        total = len(text.splitlines())
        if total > MAX_PROJECT_AGENTS:
            violations.append(
                f"{path}:1: {total} linhas (máx. {MAX_PROJECT_AGENTS}) — "
                f"aponte para o WORKFLOW em vez de narrar o fluxo")


def check_harness_freshness(root, projects, violations):
    """(i) harness instalado num projeto está na versão da origem.

    O PoP raiz é a fonte única: um projeto com `pop/.included-harness.json`
    recebeu uma cópia gerida do WORKFLOW, dos templates e dos scripts. Se o
    carimbo `content_sha` divergir, aquele projeto está operando um fluxo que
    o vault já abandonou — falha fechada, porque o remédio é um comando só.
    Só o vault que **é** a origem faz esta checagem (o clone não se audita).
    """
    try:
        import pop_install_included as installer
    except ImportError:
        return
    if installer.SOURCE != root or not installer.MANIFEST.is_file():
        return
    current = installer.content_sha()
    for project in projects:
        marker, stamped = installer.installed_stamp(project)
        if marker is None:
            continue
        label = project.relative_to(root)
        if stamped is None:
            violations.append(
                f"{marker}: harness sem carimbo `content_sha` — reinstale com "
                f"`python3 scripts/pop_install_included.py {label}`")
        elif stamped != current:
            violations.append(
                f"{marker}: harness DEFASADO ({stamped[:12]} ≠ origem "
                f"{current[:12]}) — reinstale com "
                f"`python3 scripts/pop_install_included.py {label}`")


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
                violations.append(
                    f"{path}:{n}: link aponta para fora do escopo")


def main():
    parser = argparse.ArgumentParser(
        description="Valida limites do vault: 144/600 chars, 150 linhas, "
                    "frontmatter dos cards, worktrees órfãs, wikilinks "
                    "quebrados, specs adotadas e anotações pop-hash de "
                    "citação de código.")
    parser.add_argument("--scope", "--vault", dest="vault", metavar="DIR",
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
    check_gate_artifacts(root, projects, violations)
    check_release(root, projects, warnings)
    check_worktrees(root, projects, warnings)
    check_memory(root, projects, violations)
    check_roadmap_residuals(root, violations)
    check_strict_anatomy(root, violations)
    check_spec_collections(root, projects, violations)
    check_wikilinks(root, warnings)
    check_hash_pins(root, violations)
    check_project_agents(root, projects, violations)
    check_harness_freshness(root, projects, violations)
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
