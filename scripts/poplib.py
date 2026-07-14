"""poplib — utilitários compartilhados dos scripts CLI do PoP.

Fornece: detecção da raiz do vault, descoberta de projetos (pastas com
`kanban/`: `categories/<categoria>/<projeto>/` e repos embutidos de
`full-multi-repo` em `project/<repo>/`), parser simples de frontmatter YAML
(chave: valor, listas `[a, b]` e listas em bloco `- item`) e helpers de
cards de task. Apenas stdlib (Python >= 3.9).
"""

from __future__ import annotations

import datetime
import getpass
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

# Checkbox de liberação humana no card (gate de saída do 001).
RELEASE_MARK = re.compile(r"^\s*[-*]\s*\[[xX]\]\s*Pronto para planejar")

def vault_root(override: Optional[str] = None) -> Path:
    """Raiz do vault: `--vault` se dado, senão a pasta acima de `scripts/`."""
    if override:
        return Path(override).resolve()
    return Path(__file__).resolve().parent.parent


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
    """Projetos do vault: pastas com `kanban/` — `categories/<categoria>/<projeto>/`,
    os repos embutidos em `project/<repo>/` (`full-multi-repo`) e a própria raiz
    (meta-projeto `pop`: improvements do PoP em si)."""
    projects = []
    if (root / "kanban").is_dir():
        projects.append(root)
    for pattern in ("categories/*/*/kanban", "categories/*/*/project/*/kanban"):
        for kanban in sorted(root.glob(pattern)):
            rel = kanban.parent.relative_to(root)
            if any(part.startswith(".") for part in rel.parts):
                continue
            if kanban.is_dir():
                projects.append(kanban.parent)
    return projects


def project_label(root: Path, project: Path) -> str:
    """Nome curto `<categoria>/<projeto>` de uma pasta de projeto — ou
    `<categoria>/<projeto>/<repo>` para repo embutido (segmento `project/` omitido).
    A raiz do vault (meta-projeto) tem o rótulo fixo `pop`."""
    if project == root:
        return "pop"
    parts = project.relative_to(root / "categories").parts
    if len(parts) == 4 and parts[2] == "project":
        return "/".join((parts[0], parts[1], parts[3]))
    return "/".join(parts)


def project_dir(root: Path, label: str) -> Path:
    """Inverso de `project_label`: pasta do projeto a partir do rótulo.

    `<cat>/<proj>` -> `categories/<cat>/<proj>`;
    `<cat>/<proj>/<repo>` -> `categories/<cat>/<proj>/project/<repo>`;
    `pop` -> raiz do vault (meta-projeto).
    """
    if label == "pop":
        return root
    parts = [p for p in label.split("/") if p]
    if len(parts) == 3:
        return root / "categories" / parts[0] / parts[1] / "project" / parts[2]
    return root.joinpath("categories", *parts)


def iter_cards(project: Path) -> Iterator[Tuple[str, Path, Path]]:
    """Itera (estágio, pasta_da_task, card.md) de um projeto."""
    for stage in STAGES:
        stage_dir = project / "kanban" / stage
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
        for stage in STAGES:
            task_dir = project / "kanban" / stage / task_id
            if task_dir.is_dir():
                return project, stage, task_dir
    return None
