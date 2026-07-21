"""poplib — utilitários compartilhados dos scripts CLI do PoP.

Fornece: detecção da raiz do vault, descoberta de projetos, parser simples de
frontmatter YAML (chave: valor, listas `[a, b]` e listas em bloco `- item`) e
helpers de cards de task. Suporte dual de anatomia: na **nova**, o harness mora
em `pop/` (`categories/<c>/<p>/pop/kanban`, repo embutido em
`<c>/<p>/<repo>/pop/kanban`); na **legada**, na raiz da pasta do projeto
(`kanban/` direto, repo embutido em `project/<repo>/`). `harness_root()` decide
por escopo. Apenas stdlib (Python >= 3.9).
"""

from __future__ import annotations

import datetime
import getpass
import json
import re
import socket
from pathlib import Path
from typing import Iterator, Optional, Tuple

STAGES = [
    "001_initial_task",
    "002_planning",
    "003_human_approval",
    "004_processing",
    "005_verifying",
    "006_done",
]

# Lease padrão do claim de task (ver pop_claim.py).
DEFAULT_LEASE_HOURS = 2
YOLO_RETURN_LIMIT = 2

# Checkbox de liberação humana no card (gate de saída do 001).
RELEASE_MARK = re.compile(r"^\s*[-*]\s*\[[xX]\]\s*Pronto para planejar")

def vault_root(override: Optional[str] = None) -> Path:
    """Raiz do vault: `--vault` se dado, senão a pasta acima de `scripts/`.

    Em clone included de anatomia nova os scripts moram em `pop/scripts/`:
    se a pasta acima chama `pop` e carrega `.included-harness.json`, a raiz
    é a pasta acima dela (a raiz do repo).
    """
    if override:
        return Path(override).resolve()
    base = Path(__file__).resolve().parent.parent
    if base.name == "pop" and (base / ".included-harness.json").is_file():
        return base.parent
    return base


def harness_root(project: Path) -> Path:
    """Raiz do harness do escopo: `pop/` nos projetos de `categories/`; o
    próprio escopo só na raiz do vault (meta-projeto, kanban na raiz)."""
    return project / "pop" if (project / "pop" / "kanban").is_dir() else project


def templates_dir(root: Path) -> Path:
    """Pasta de templates do vault: `pop/_templates` se existir, senão `_templates`."""
    new = root / "pop" / "_templates"
    return new if new.is_dir() else root / "_templates"


def today() -> str:
    """Data de hoje em AAAA-MM-DD."""
    return datetime.date.today().isoformat()


def _coerce(raw: str):
    """Converte um escalar do frontmatter: aspas, booleanos, vazio."""
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in ("'", '"'):
        return raw[1:-1]
    if raw.lower() == "true":
        return True
    if raw.lower() == "false":
        return False
    if raw == "":
        return None
    return raw


def _parse_value(raw: str):
    """Valor de uma chave: escalar ou lista inline `[a, b]`."""
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        if not inner:
            return []
        return [_coerce(item) for item in inner.split(",")]
    return _coerce(raw)


def parse_frontmatter(text: str) -> Tuple[dict, str]:
    """Separa frontmatter e corpo. Sem frontmatter -> ({}, texto).

    Suporta `chave: valor`, listas inline `[a, b]` e listas em bloco
    (`chave:` seguida de linhas `- item`).
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    meta: dict = {}
    current = None
    end = None
    for i in range(1, len(lines)):
        line = lines[i]
        if line.strip() == "---":
            end = i
            break
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("- ") and current is not None:
            if not isinstance(meta[current], list):
                meta[current] = []
            meta[current].append(_coerce(stripped[2:]))
            continue
        if ":" in stripped and not line.startswith((" ", "\t")):
            key, _, raw = line.partition(":")
            current = key.strip()
            meta[current] = _parse_value(raw)
    if end is None:  # frontmatter sem fechamento
        return {}, text
    return meta, "\n".join(lines[end + 1:])


def discover_projects(root: Path) -> list:
    """Escopos de projeto do vault, todos na anatomia `pop/`: a raiz
    (meta-projeto `pop` — kanban na raiz, por exceção documentada — ou clone
    included, com `pop/kanban`), projetos em `categories/<c>/<p>/pop/kanban`
    e repos embutidos de `full-multi-repo` em `categories/<c>/<p>/<repo>/pop/kanban`.
    Anatomia legada (harness na raiz) não é mais reconhecida — o validador a
    reporta como violação (ver `check_strict_anatomy`)."""
    scopes = set()
    if (root / "kanban").is_dir() or (root / "pop" / "kanban").is_dir():
        scopes.add(root)
    # (pattern, nº de níveis do kanban até o escopo)
    patterns = (
        ("categories/*/*/pop/kanban", 2),      # projeto
        ("categories/*/*/*/pop/kanban", 2),    # repo embutido (full-multi-repo)
    )
    for pattern, up in patterns:
        for kanban in root.glob(pattern):
            if not kanban.is_dir():
                continue
            scope = kanban.parents[up - 1]
            rel = scope.relative_to(root)
            if any(part.startswith(".") for part in rel.parts):
                continue
            scopes.add(scope)
    return sorted(scopes)


# Pastas de harness do PoP dentro de um escopo de projeto: são as ÚNICAS que as
# réguas de tamanho/wikilink alcançam. Whitelist positiva — o que é do projeto
# (código, docs do repo, clones, `project/`, repo embutido, vendor) fica de fora
# por construção, sem depender do type. Os nomes são invariantes por type
# (ver TYPES.md): só a localização do código muda, e `discover_projects` já
# entrega o escopo certo, inclusive cada repo embutido de full-multi-repo.
HARNESS_DIRS = ("roadmap", "specs", "researches", "skills", "notes",
                "memory", "open_questions", "drafts", "kanban")
HARNESS_ROOT_FILES = ("PROJECT.md", "ROADMAP.md")  # INDEX.md tem régua própria (144/600)
# Cinto e suspensório: nunca desce em fonte bruta de pesquisa nem em código que
# possa estar aninhado sob uma pasta de harness.
_HARNESS_SKIP = {"raw", "worktrees", "_templates", "__pycache__",
                 "node_modules", "vendor", ".git", ".obsidian"}


def iter_harness_markdown(scope: Path) -> Iterator[Path]:
    """`.md` de harness sob um escopo de projeto (whitelist positiva).

    Anatomia nova: o harness inteiro (inclusive PROJECT.md/ROADMAP.md) mora
    em `pop/` — `harness_root()` resolve; nomes de HARNESS_DIRS não mudam.
    """
    hroot = harness_root(scope)
    for name in HARNESS_ROOT_FILES:
        if (hroot / name).is_file():
            yield hroot / name
    for name in HARNESS_DIRS:
        base = hroot / name
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*.md")):
            if not (_HARNESS_SKIP & set(path.relative_to(hroot).parts)):
                yield path


def iter_all_harness_markdown(root: Path) -> Iterator[Path]:
    """`.md` de harness de todos os escopos descobertos, sem repetição."""
    seen = set()
    for scope in discover_projects(root):
        for path in iter_harness_markdown(scope):
            if path not in seen:
                seen.add(path)
                yield path


def project_label(root: Path, project: Path) -> str:
    """Nome curto `<categoria>/<projeto>` de uma pasta de projeto — ou
    `<categoria>/<projeto>/<repo>` para repo embutido de full-multi-repo.
    A raiz do vault (meta-projeto) tem o rótulo fixo `pop`."""
    if project == root:
        return "pop"
    parts = project.relative_to(root / "categories").parts
    return "/".join(parts)


def project_dir(root: Path, label: str) -> Path:
    """Inverso de `project_label`: pasta do projeto a partir do rótulo.

    `<cat>/<proj>` -> `categories/<cat>/<proj>`;
    `<cat>/<proj>/<repo>` -> `categories/<cat>/<proj>/<repo>` (repo embutido
    de full-multi-repo, anatomia `pop/`);
    `pop` -> raiz do vault (meta-projeto).
    """
    if label == "pop":
        return root
    parts = [p for p in label.split("/") if p]
    return root.joinpath("categories", *parts)


def delivery_route(root: Path, project: Path, *, yolo: bool) -> dict:
    """Rota Git invariável; só o fluxo não-yolo usa target configurável."""
    # Meta PoP é a exceção com kanban na raiz. Um clone included aberto como
    # vault também tem project == root, mas seu kanban vive em `pop/` e segue
    # a rota externa develop → main.
    if project.resolve() == root.resolve() and (root / "kanban").is_dir():
        return {"task_branch": "main", "scope_pr": False,
                "target_branch": "main", "worktree": False,
                "merge_owner": "none"}
    if yolo:
        return {"task_branch": "develop", "scope_pr": True,
                "target_branch": "main", "worktree": True,
                "merge_owner": "user"}
    return {"task_branch": "task", "scope_pr": False,
            "target_branch": None, "worktree": True,
            "merge_owner": "user"}


def iter_cards(project: Path) -> Iterator[Tuple[str, Path, Path]]:
    """Itera (estágio, pasta_da_task, card.md) de um projeto."""
    for stage in STAGES:
        stage_dir = harness_root(project) / "kanban" / stage
        if not stage_dir.is_dir():
            continue
        for task_dir in sorted(p for p in stage_dir.iterdir() if p.is_dir()):
            card = task_dir / f"{task_dir.name}.md"
            if card.is_file():
                yield stage, task_dir, card


def read_card(card: Path) -> dict:
    """Frontmatter de um card, como dict (vazio se não houver)."""
    meta, _ = parse_frontmatter(card.read_text(encoding="utf-8"))
    return meta


def task_released(card: Path) -> bool:
    """True se o card tem `- [x] Pronto para planejar` fora de code fences."""
    in_fence = False
    for line in card.read_text(encoding="utf-8").splitlines():
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence and RELEASE_MARK.match(line):
            return True
    return False


def default_agent() -> str:
    """Identificador padrão do agente: usuario@host."""
    return f"{getpass.getuser()}@{socket.gethostname()}"


def now() -> datetime.datetime:
    return datetime.datetime.now().astimezone()


def telemetry_path(task_dir: Path) -> Path:
    """Sidecar efêmero da task; o 006 resume e descarta junto com o card."""
    return task_dir / f"{task_dir.name}.telemetry.json"


def read_telemetry(task_dir: Path) -> dict:
    path = telemetry_path(task_dir)
    if not path.is_file():
        return {"version": 1, "events": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"version": 1, "events": []}
    if not isinstance(data, dict) or not isinstance(data.get("events"), list):
        return {"version": 1, "events": []}
    return data


def record_telemetry(task_dir: Path, event: dict) -> None:
    """Acrescenta evento operacional mínimo, nunca reasoning ou prompts."""
    data = read_telemetry(task_dir)
    payload = {"at": now().isoformat(timespec="seconds"), **event}
    data["events"].append(payload)
    path = telemetry_path(task_dir)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def telemetry_summary(task_dir: Path) -> dict:
    """Resumo pequeno para a memory e para comparação na weekly-review."""
    events = read_telemetry(task_dir)["events"]
    contexts = sum(len(e.get("contexts") or []) for e in events)
    returns = {"003": 0, "005": 0}
    test_seconds = 0.0
    for event in events:
        if event.get("from") == "003_human_approval" and event.get("to") == "002_planning":
            returns["003"] += 1
        if event.get("from") == "005_verifying" and event.get("to") == "004_processing":
            returns["005"] += 1
        test_seconds += float(event.get("test_seconds") or 0)
    duration = None
    if len(events) >= 2:
        try:
            start = datetime.datetime.fromisoformat(events[0]["at"])
            end = datetime.datetime.fromisoformat(events[-1]["at"])
            duration = int((end - start).total_seconds())
        except (KeyError, TypeError, ValueError):
            pass
    return {"duration_seconds": duration, "contexts": contexts,
            "returns_003": returns["003"], "returns_005": returns["005"],
            "test_seconds": test_seconds, "events": len(events)}


def parse_claim(meta: dict) -> Tuple[Optional[str], Optional[datetime.datetime]]:
    """Retorna (claimed_by, claimed_at | None) do frontmatter de um card."""
    by = meta.get("claimed_by") or None
    raw = str(meta.get("claimed_at") or "")
    try:
        at = datetime.datetime.fromisoformat(raw)
        if at.tzinfo is None:
            at = at.astimezone()
    except ValueError:
        at = None
    return by, at


def claim_expired(at: Optional[datetime.datetime],
                  lease_hours: float = DEFAULT_LEASE_HOURS) -> bool:
    if at is None:
        return True  # claim sem timestamp válido não segura lease
    return now() - at > datetime.timedelta(hours=lease_hours)


def find_task(root: Path, task_id: str):
    """Localiza a task pelo nome da pasta em qualquer projeto/estágio.

    Retorna (projeto, estágio, pasta_da_task) ou None.
    """
    for project in discover_projects(root):
        kanban = harness_root(project) / "kanban"
        for stage in STAGES:
            task_dir = kanban / stage / task_id
            if task_dir.is_dir():
                return project, stage, task_dir
    return None
