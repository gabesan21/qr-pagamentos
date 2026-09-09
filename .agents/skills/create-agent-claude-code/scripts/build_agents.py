#!/usr/bin/env python3
"""Build and validate Claude Code agents from canonical PoP contracts."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from typing import Any

ROLES = (
    "pop-execution-orchestrator", "pop-executor", "pop-judge-dredd",
    "pop-phase-verifier", "pop-planner", "pop-recon",
)
DELEGATING_ROLES: set[str] = set()
CHILD_AGENTS = {
}
EFFORTS = {"low", "medium", "high", "xhigh", "max"}
PERMISSION_MODES = {"default", "manual", "acceptEdits", "auto", "dontAsk", "bypassPermissions", "plan"}
OVERRIDING_PARENT_MODES = {"acceptEdits", "auto", "bypassPermissions"}
PROFILE_FIELDS = {"model", "effort", "tools", "disallowedTools", "permissionMode", "skills", "nesting", "web"}
RUNTIME_FIELDS = {
    "invocationModels", "availableModels", "parentPermissionMode", "thinkingEnabled",
    "maxSpawnDepth", "nesting",
}
NESTING_FIELDS = {"executionMode", "currentDepth", "allowedChildren"}
REQUIRED_SECTIONS = (
    "Identidade", "Gatilho", "Aquisição por paths", "Permissões",
    "Entrada, saída e término", "Ownership", "Dependências", "Gates e reentrada", "Denies",
)
MANIFEST = ".pop-agent-builder.json"
MANIFEST_FIELDS = {"version", "generator", "files", "sources", "profile"}
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


class BuildError(Exception):
    """A fail-closed validation or transactional build error."""


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise BuildError(f"JSON inválido ou ilegível em {path}: {error}") from error
    if not isinstance(value, dict):
        raise BuildError(f"{path} deve conter um objeto JSON")
    return value


def require_string_list(value: Any, location: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
        raise BuildError(f"{location} deve ser uma lista de strings não vazias")
    if len(value) != len(set(value)):
        raise BuildError(f"{location} contém duplicatas")
    return value


def validate_profiles(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if set(document) != {"version", "roles"} or document.get("version") != 1:
        raise BuildError("perfil exige somente version=1 e roles")
    roles = document.get("roles")
    if not isinstance(roles, dict) or set(roles) != set(ROLES):
        raise BuildError("roles deve conter exatamente os seis especialistas canônicos")
    validated: dict[str, dict[str, Any]] = {}
    for role in ROLES:
        profile = roles[role]
        if not isinstance(profile, dict) or set(profile) != PROFILE_FIELDS:
            fields = set(profile) if isinstance(profile, dict) else set()
            raise BuildError(
                f"perfil {role} inválido; ausentes={sorted(PROFILE_FIELDS-fields)}, "
                f"desconhecidos={sorted(fields-PROFILE_FIELDS)}"
            )
        model = profile["model"]
        normalized_model = model.strip() if isinstance(model, str) else ""
        if not normalized_model or normalized_model == "inherit":
            raise BuildError(f"{role}.model deve ser explícito e diferente de inherit")
        if profile["effort"] not in EFFORTS:
            raise BuildError(f"{role}.effort fora do enum oficial: {profile['effort']!r}")
        if profile["permissionMode"] not in PERMISSION_MODES:
            raise BuildError(f"{role}.permissionMode inválido: {profile['permissionMode']!r}")
        tools = require_string_list(profile["tools"], f"{role}.tools")
        denied = require_string_list(profile["disallowedTools"], f"{role}.disallowedTools")
        skills = require_string_list(profile["skills"], f"{role}.skills")
        if not isinstance(profile["nesting"], bool) or not isinstance(profile["web"], bool):
            raise BuildError(f"{role}.nesting e web devem ser booleanos")
        if profile["web"] or not {"WebFetch", "WebSearch"}.issubset(denied):
            raise BuildError(f"{role} deve negar web, WebFetch e WebSearch explicitamente")
        if profile["nesting"] and role not in DELEGATING_ROLES:
            raise BuildError(f"{role} não pode habilitar nesting pelo contrato canônico")
        # Claude Code gives deny precedence over allow.
        effective_tools = [tool for tool in tools if tool not in denied]
        effective_denied = list(denied)
        if profile["nesting"]:
            if "Agent" not in effective_tools or "Agent" in effective_denied:
                raise BuildError(f"{role} habilita nesting sem Agent efetivamente permitido")
            effective_tools[effective_tools.index("Agent")] = f"Agent({','.join(CHILD_AGENTS[role])})"
        else:
            effective_tools = [tool for tool in effective_tools if tool != "Agent"]
            if "Agent" not in effective_denied:
                effective_denied.append("Agent")
        validated[role] = {
            **profile, "model": normalized_model, "tools": effective_tools,
            "disallowedTools": effective_denied, "skills": skills,
        }
    return validated


def load_sources(source_dir: Path) -> dict[str, str]:
    if not source_dir.is_dir() or source_dir.is_symlink():
        raise BuildError(f"diretório canônico ausente ou inseguro: {source_dir}")
    expected = {f"{role}.md" for role in ROLES}
    actual = {entry.name for entry in source_dir.iterdir() if entry.is_file()}
    if expected != actual:
        raise BuildError(
            f"fontes .md devem ser exatamente os seis especialistas; "
            f"ausentes={sorted(expected-actual)}, extras={sorted(actual-expected)}"
        )
    sources: dict[str, str] = {}
    for role in ROLES:
        path = source_dir / f"{role}.md"
        if path.is_symlink():
            raise BuildError(f"origem canônica não pode ser symlink: {path}")
        try:
            body = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise BuildError(f"origem canônica ilegível: {path}: {error}") from error
        if not body.startswith(f"# {role}\n"):
            raise BuildError(f"título canônico incompatível em {path}")
        missing = [section for section in REQUIRED_SECTIONS if f"## {section}\n" not in body]
        if missing:
            raise BuildError(f"{path} não cobre seções canônicas: {missing}")
        sources[role] = body
    return sources


def identity_description(body: str) -> str:
    match = re.search(r"^## Identidade\n\n(.+?)(?:\n\n|\Z)", body, re.MULTILINE | re.DOTALL)
    if not match:
        raise BuildError("não foi possível derivar description da seção Identidade")
    return " ".join(match.group(1).split())


def render_agent(role: str, profile: dict[str, Any], body: str) -> str:
    scalar = lambda value: json.dumps(value, ensure_ascii=False)
    fields = (
        f"name: {scalar(role)}",
        f"description: {scalar(identity_description(body))}",
        f"tools: {scalar(profile['tools'])}",
        f"disallowedTools: {scalar(profile['disallowedTools'])}",
        f"model: {scalar(profile['model'])}",
        f"permissionMode: {scalar(profile['permissionMode'])}",
        f"skills: {scalar(profile['skills'])}",
        f"effort: {scalar(profile['effort'])}",
    )
    return "---\n" + "\n".join(fields) + "\n---\n\n" + body


def effective_max_spawn_depth(runtime: dict[str, Any]) -> int:
    configured = runtime.get("maxSpawnDepth")
    if configured is not None and (not isinstance(configured, int) or isinstance(configured, bool) or configured < 1):
        raise BuildError("runtime.maxSpawnDepth deve ser inteiro positivo")
    env_value = os.environ.get("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH")
    if env_value is not None:
        try:
            effective = int(env_value)
        except ValueError as error:
            raise BuildError("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH deve ser inteiro positivo") from error
        if effective < 1:
            raise BuildError("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH deve ser inteiro positivo")
        if configured is not None and configured != effective:
            raise BuildError("runtime.maxSpawnDepth diverge de CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH")
        return effective
    if configured is None:
        raise BuildError("preflight de nesting exige runtime.maxSpawnDepth ou env equivalente")
    return configured


def validate_nesting(runtime: dict[str, Any], profiles: dict[str, dict[str, Any]]) -> None:
    enabled = {role for role, profile in profiles.items() if profile["nesting"]}
    if not enabled:
        if runtime.get("nesting") not in (None, {}):
            raise BuildError("runtime.nesting deve ser vazio quando todos os especialistas negam nesting")
        return
    max_depth = effective_max_spawn_depth(runtime)
    nesting = runtime.get("nesting")
    if not isinstance(nesting, dict) or set(nesting) != enabled:
        raise BuildError(f"runtime.nesting deve cobrir exatamente {sorted(enabled)}")
    for role in sorted(enabled):
        preflight = nesting[role]
        if not isinstance(preflight, dict) or set(preflight) != NESTING_FIELDS:
            fields = set(preflight) if isinstance(preflight, dict) else set()
            raise BuildError(
                f"runtime.nesting.{role} inválido; ausentes={sorted(NESTING_FIELDS-fields)}, "
                f"desconhecidos={sorted(fields-NESTING_FIELDS)}"
            )
        execution_mode = preflight["executionMode"]
        if execution_mode not in {"main", "subagent"}:
            raise BuildError(f"runtime.nesting.{role}.executionMode deve ser main ou subagent")
        current_depth = preflight["currentDepth"]
        if not isinstance(current_depth, int) or isinstance(current_depth, bool) or current_depth < 0:
            raise BuildError(f"runtime.nesting.{role}.currentDepth deve ser inteiro não negativo")
        if current_depth >= max_depth:
            raise BuildError(f"depth efetivo impede {role} de delegar: {current_depth} >= {max_depth}")
        allowed = require_string_list(preflight["allowedChildren"], f"runtime.nesting.{role}.allowedChildren")
        expected = list(CHILD_AGENTS[role])
        if allowed != expected:
            raise BuildError(f"allowlist de filhos incompatível em {role}; esperado={expected}")
        if execution_mode == "subagent":
            raise BuildError(
                f"allowlist de filhos de {role} não é representável em subagent aninhado; "
                "Claude Code ignora os nomes em Agent(...)"
            )


def validate_runtime(runtime: dict[str, Any], profiles: dict[str, dict[str, Any]]) -> None:
    if set(runtime) - RUNTIME_FIELDS:
        raise BuildError(f"campos de runtime desconhecidos: {sorted(set(runtime)-RUNTIME_FIELDS)}")
    env_model = os.environ.get("CLAUDE_CODE_SUBAGENT_MODEL")
    if env_model:
        mismatches = [role for role, profile in profiles.items() if profile["model"] != env_model]
        if mismatches:
            raise BuildError(f"CLAUDE_CODE_SUBAGENT_MODEL={env_model!r} substitui modelos de {mismatches}")
    invocation = runtime.get("invocationModels", {})
    if not isinstance(invocation, dict) or any(role not in ROLES for role in invocation):
        raise BuildError("runtime.invocationModels deve ser mapa parcial dos papéis canônicos")
    for role, effective in invocation.items():
        if not isinstance(effective, str) or effective != profiles[role]["model"]:
            raise BuildError(f"override de invocação incompatível em {role}: {effective!r}")
    available = runtime.get("availableModels")
    if available is not None:
        allowed = require_string_list(available, "runtime.availableModels")
        blocked = [role for role, profile in profiles.items() if profile["model"] not in allowed]
        if blocked:
            raise BuildError(f"availableModels não garante o modelo declarado de {blocked}")
    parent_mode = runtime.get("parentPermissionMode")
    if parent_mode is not None:
        if parent_mode not in PERMISSION_MODES:
            raise BuildError(f"parentPermissionMode inválido: {parent_mode!r}")
        if parent_mode in OVERRIDING_PARENT_MODES:
            incompatible = [role for role, profile in profiles.items() if profile["permissionMode"] != parent_mode]
            if incompatible:
                raise BuildError(f"modo do pai {parent_mode!r} prevalece e diverge em {incompatible}")
    thinking = runtime.get("thinkingEnabled")
    if thinking is not None and not isinstance(thinking, bool):
        raise BuildError("runtime.thinkingEnabled deve ser booleano")
    validate_nesting(runtime, profiles)


def sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def render_all(source_dir: Path, profiles_path: Path, runtime_path: Path | None):
    sources = load_sources(source_dir)
    profiles = validate_profiles(load_json(profiles_path))
    validate_runtime(load_json(runtime_path) if runtime_path else {}, profiles)
    rendered = {f"{role}.md": render_agent(role, profiles[role], sources[role]) for role in ROLES}
    manifest = {
        "version": 1,
        "generator": "create-agent-claude-code",
        "files": {name: sha256(content) for name, content in sorted(rendered.items())},
        "sources": {f"{role}.md": sha256(sources[role]) for role in ROLES},
        "profile": sha256(profiles_path.read_text(encoding="utf-8")),
    }
    return rendered, manifest


def ensure_safe_tree(destination: Path) -> None:
    if destination.is_symlink():
        raise BuildError(f"destino não pode ser symlink: {destination}")
    if destination.exists() and not destination.is_dir():
        raise BuildError(f"destino existe e não é diretório: {destination}")
    if destination.exists():
        for path in destination.rglob("*"):
            if path.is_symlink():
                raise BuildError(f"destino contém symlink inseguro: {path}")


def validate_hash_map(value: Any, location: str, expected_names: set[str]) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) != expected_names:
        raise BuildError(f"{location} deve conter exatamente {sorted(expected_names)}")
    for name, digest in value.items():
        if Path(name).name != name or name in {".", ".."} or "/" in name or "\\" in name:
            raise BuildError(f"basename inseguro em {location}: {name!r}")
        if not isinstance(digest, str) or not SHA256_PATTERN.fullmatch(digest):
            raise BuildError(f"hash SHA-256 inválido em {location}.{name}")
    return value


def validate_manifest(document: dict[str, Any], location: Path) -> set[str]:
    if set(document) != MANIFEST_FIELDS:
        raise BuildError(f"schema de manifesto incompatível em {location}")
    if document["version"] != 1 or document["generator"] != "create-agent-claude-code":
        raise BuildError(f"identidade de manifesto incompatível em {location}")
    expected = {f"{role}.md" for role in ROLES}
    files = validate_hash_map(document["files"], f"{location}.files", expected)
    validate_hash_map(document["sources"], f"{location}.sources", expected)
    if not isinstance(document["profile"], str) or not SHA256_PATTERN.fullmatch(document["profile"]):
        raise BuildError(f"hash de perfil inválido em {location}")
    return set(files)


def existing_managed_files(destination: Path) -> set[str]:
    manifest_path = destination / MANIFEST
    if not manifest_path.exists():
        return set()
    return validate_manifest(load_json(manifest_path), manifest_path)


def write_staging(staging: Path, destination: Path, rendered: dict[str, str], manifest: dict[str, Any]) -> None:
    if destination.exists():
        shutil.copytree(destination, staging, dirs_exist_ok=True)
    managed = existing_managed_files(destination) if destination.exists() else set()
    for name in rendered:
        target = destination / name
        if target.exists() and name not in managed:
            raise BuildError(f"colisão com arquivo não gerido: {target}")
    for stale in managed - set(rendered):
        stale_path = staging / stale
        if stale_path.exists():
            stale_path.unlink()
    for name, content in rendered.items():
        (staging / name).write_text(content, encoding="utf-8", newline="\n")
    (staging / MANIFEST).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def swap_tree(staging: Path, destination: Path) -> None:
    backup = destination.parent / f".{destination.name}.backup-{os.getpid()}"
    if backup.exists():
        raise BuildError(f"backup transacional já existe: {backup}")
    moved_old = False
    try:
        if destination.exists():
            os.replace(destination, backup)
            moved_old = True
        os.replace(staging, destination)
    except OSError as error:
        if moved_old and backup.exists() and not destination.exists():
            os.replace(backup, destination)
        raise BuildError(f"falha na troca transacional: {error}") from error
    if backup.exists():
        shutil.rmtree(backup)


def generate(destination: Path, rendered: dict[str, str], manifest: dict[str, Any]) -> None:
    ensure_safe_tree(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{destination.name}.staging-", dir=destination.parent))
    try:
        write_staging(staging, destination, rendered, manifest)
        for name, expected in rendered.items():
            if (staging / name).read_text(encoding="utf-8") != expected:
                raise BuildError(f"staging divergente em {name}")
        swap_tree(staging, destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def validate_destination(destination: Path, rendered: dict[str, str], manifest: dict[str, Any]) -> None:
    ensure_safe_tree(destination)
    if not destination.is_dir():
        raise BuildError(f"destino ausente: {destination}")
    for name, expected in rendered.items():
        path = destination / name
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            raise BuildError(f"artefato ausente ou divergente: {path}")
    manifest_path = destination / MANIFEST
    actual_manifest = load_json(manifest_path)
    validate_manifest(actual_manifest, manifest_path)
    if actual_manifest != manifest:
        raise BuildError(f"manifesto divergente: {destination / MANIFEST}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("generate", "validate"))
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--runtime", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        rendered, manifest = render_all(args.source_dir, args.profiles, args.runtime)
        if args.action == "generate":
            generate(args.destination, rendered, manifest)
        else:
            validate_destination(args.destination, rendered, manifest)
    except (BuildError, OSError, UnicodeError) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 2
    verb = "gerados" if args.action == "generate" else "validados"
    print(f"concluída: {len(rendered)} agents {verb} em {args.destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
