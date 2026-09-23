#!/usr/bin/env python3
"""Build and validate isolated OpenCode agent candidate bundles."""

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
ROLE_MODES = {role: "subagent" for role in ROLES}
CHILDREN = {
    "pop-execution-orchestrator": ("pop-executor",),
    "pop-planner": ("pop-recon",),
}
REQUIRED_SECTIONS = (
    "Identidade", "Gatilho", "Aquisição por paths", "Permissões",
    "Entrada, saída e término", "Ownership", "Dependências", "Gates e reentrada", "Denies",
)
PROFILE_FIELDS = {"mode", "model", "variant", "permissions", "skills"}
TOP_LEVEL_FIELDS = {"version", "subagent_depth", "capabilities", "roles"}
PERMISSION_NAMES = {"read", "edit", "glob", "grep", "list", "bash", "lsp"}
ROLE_PERMISSIONS = {
    "pop-execution-orchestrator": {"read", "glob", "grep", "list", "edit"},
    "pop-executor": {"read", "glob", "grep", "list", "edit", "bash", "lsp"},
    "pop-judge-dredd": {"read", "glob", "grep", "list", "edit", "bash"},
    "pop-phase-verifier": {"read", "glob", "grep", "list", "edit", "bash", "lsp"},
    "pop-planner": {"read", "glob", "grep", "list", "edit"},
    "pop-recon": {"read", "glob", "grep", "list", "edit"},
}
REQUIRED_SKILLS = {"pop-judge-dredd": {"judge-dredd"}}
MANIFEST = ".pop-opencode-builder.json"
MANIFEST_FIELDS = {"version", "generator", "files", "sources", "profile"}
RENDERED_FILES = {"opencode.json"} | {f".opencode/agents/{role}.md" for role in ROLES}
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class BuildError(Exception):
    """Input, validation, collision, or discovery failed closed."""


def contains_key(value: Any, forbidden: str) -> bool:
    if isinstance(value, dict):
        return forbidden in value or any(contains_key(item, forbidden) for item in value.values())
    if isinstance(value, list):
        return any(contains_key(item, forbidden) for item in value)
    return False


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise BuildError(f"JSON inválido ou ilegível em {path}: {error}") from error
    if not isinstance(value, dict):
        raise BuildError(f"{path} deve conter objeto JSON")
    if contains_key(value, "tools"):
        raise BuildError("campo deprecated tools é proibido em todo o perfil")
    return value


def string_list(value: Any, location: str) -> list[str]:
    if not isinstance(value, list) or not value or any(not isinstance(item, str) or not item for item in value):
        raise BuildError(f"{location} deve ser lista não vazia de strings não vazias")
    if len(value) != len(set(value)):
        raise BuildError(f"{location} contém duplicatas")
    return value


def validate_profiles(document: dict[str, Any]) -> dict[str, Any]:
    if set(document) != TOP_LEVEL_FIELDS or document.get("version") != 1:
        raise BuildError("perfil exige somente version=1, subagent_depth, capabilities e roles")
    if document["subagent_depth"] != 2 or isinstance(document["subagent_depth"], bool):
        raise BuildError("subagent_depth deve ser explicitamente 2 para a topologia canônica")
    capabilities = document["capabilities"]
    if not isinstance(capabilities, dict) or not capabilities:
        raise BuildError("capabilities deve ser mapa não vazio de provider/model")
    variants_by_model: dict[str, tuple[str, ...]] = {}
    for model, capability in capabilities.items():
        if not isinstance(model, str) or "/" not in model or model.strip() != model or model == "inherit":
            raise BuildError(f"capability exige provider/model concreto: {model!r}")
        if not isinstance(capability, dict) or set(capability) != {"variants"}:
            raise BuildError(f"capability de {model} aceita somente variants")
        variants_by_model[model] = tuple(string_list(capability["variants"], f"{model}.variants"))
    roles = document["roles"]
    if not isinstance(roles, dict) or set(roles) != set(ROLES):
        actual = set(roles) if isinstance(roles, dict) else set()
        raise BuildError(f"roles deve conter exatamente os seis especialistas; divergência={sorted(actual ^ set(ROLES))}")
    normalized: dict[str, dict[str, Any]] = {}
    for role in ROLES:
        profile = roles[role]
        fields = set(profile) if isinstance(profile, dict) else set()
        if not isinstance(profile, dict) or fields != PROFILE_FIELDS:
            raise BuildError(f"perfil {role} divergente; ausentes={sorted(PROFILE_FIELDS-fields)} extras={sorted(fields-PROFILE_FIELDS)}")
        if profile["mode"] != ROLE_MODES[role]:
            raise BuildError(f"{role}.mode deve ser {ROLE_MODES[role]}")
        model, variant = profile["model"], profile["variant"]
        if not isinstance(model, str) or model not in variants_by_model:
            raise BuildError(f"{role}.model não possui capability fechada")
        if not isinstance(variant, str) or variant not in variants_by_model[model]:
            raise BuildError(f"{role}.variant não é suportada pela capability de {model}")
        permissions = string_list(profile["permissions"], f"{role}.permissions")
        if set(permissions) - PERMISSION_NAMES:
            raise BuildError(f"{role}.permissions desconhecidas: {sorted(set(permissions)-PERMISSION_NAMES)}")
        if set(permissions) != ROLE_PERMISSIONS[role]:
            raise BuildError(f"{role}.permissions deve ser exatamente {sorted(ROLE_PERMISSIONS[role])}")
        skills = string_list(profile["skills"], f"{role}.skills")
        if any(not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", skill) for skill in skills):
            raise BuildError(f"{role}.skills contém nome inválido")
        if not REQUIRED_SKILLS.get(role, set()).issubset(skills):
            raise BuildError(f"{role}.skills omite skill canônica obrigatória")
        normalized[role] = {**profile, "permissions": permissions, "skills": skills}
    return {"version": 1, "subagent_depth": 2, "capabilities": variants_by_model, "roles": normalized}


def load_sources(source_dir: Path) -> dict[str, str]:
    if not source_dir.is_dir() or source_dir.is_symlink():
        raise BuildError(f"diretório de fontes ausente ou inseguro: {source_dir}")
    expected = {f"{role}.md" for role in ROLES}
    actual = {path.name for path in source_dir.iterdir() if path.is_file()}
    if actual != expected:
        raise BuildError(f"fontes devem ser exatamente os seis especialistas; divergência={sorted(actual ^ expected)}")
    sources: dict[str, str] = {}
    for role in ROLES:
        path = source_dir / f"{role}.md"
        if path.is_symlink():
            raise BuildError(f"fonte não pode ser symlink: {path}")
        try:
            body = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            raise BuildError(f"fonte ilegível {path}: {error}") from error
        if not body.startswith(f"# {role}\n"):
            raise BuildError(f"heading incompatível em {path}")
        missing = [section for section in REQUIRED_SECTIONS if f"## {section}\n" not in body]
        if missing:
            raise BuildError(f"{path} não cobre seções canônicas: {missing}")
        sources[role] = body
    return sources


def identity(body: str) -> str:
    match = re.search(r"^## Identidade\n\n(.+?)(?:\n\n|\Z)", body, re.MULTILINE | re.DOTALL)
    if not match:
        raise BuildError("não foi possível derivar description da Identidade")
    return " ".join(match.group(1).split())


def permission_policy(role: str, profile: dict[str, Any]) -> dict[str, Any]:
    policy: dict[str, Any] = {"*": "deny"}
    policy.update({permission: "allow" for permission in profile["permissions"]})
    policy.update({"external_directory": "deny", "webfetch": "deny", "websearch": "deny"})
    task = {"*": "deny"}
    task.update({child: "allow" for child in CHILDREN.get(role, ())})
    skills = {"*": "deny"}
    skills.update({skill: "allow" for skill in profile["skills"]})
    policy.update({"task": task, "skill": skills})
    return policy


def render_agent(role: str, profile: dict[str, Any], body: str) -> str:
    fields = (
        f"description: {json.dumps(identity(body), ensure_ascii=False)}",
        f"mode: {json.dumps(profile['mode'])}",
        f"model: {json.dumps(profile['model'])}",
        f"variant: {json.dumps(profile['variant'])}",
        f"permission: {json.dumps(permission_policy(role, profile), ensure_ascii=False, sort_keys=True)}",
    )
    prefix = (
        "Projeção nativa OpenCode do contrato canônico do PoP. Preserve integralmente aquisição por paths, "
        "ownership, gates e denies; permissions do runtime complementam e não substituem o contrato. "
        "Task cria uma child session; use task_id somente para retomar a mesma filha.\n\n"
    )
    return "---\n" + "\n".join(fields) + "\n---\n\n" + prefix + body


def digest(content: str | bytes) -> str:
    return hashlib.sha256(content.encode("utf-8") if isinstance(content, str) else content).hexdigest()


def render_all(source_dir: Path, profiles_path: Path) -> tuple[dict[str, str], dict[str, Any]]:
    sources = load_sources(source_dir)
    raw_profile = profiles_path.read_bytes()
    profiles = validate_profiles(load_json(profiles_path))
    rendered = {f".opencode/agents/{role}.md": render_agent(role, profiles["roles"][role], sources[role]) for role in ROLES}
    rendered["opencode.json"] = json.dumps(
        {"$schema": "https://opencode.ai/config.json", "subagent_depth": profiles["subagent_depth"]},
        ensure_ascii=False, indent=2, sort_keys=True,
    ) + "\n"
    manifest = {
        "version": 1, "generator": "create-agent-opencode",
        "files": {name: digest(content) for name, content in sorted(rendered.items())},
        "sources": {f"{role}.md": digest(sources[role]) for role in ROLES},
        "profile": digest(raw_profile),
    }
    return rendered, manifest


def safe_destination(destination: Path) -> None:
    if destination.name == ".opencode" or ".opencode" in destination.parts:
        raise BuildError("destination deve ser raiz candidata, nunca .opencode ou descendente")
    if destination.resolve(strict=False) == Path.cwd().resolve():
        raise BuildError("destination não pode ser o diretório de trabalho ativo")
    if (destination / ".git").exists() or (destination / "AGENTS.md").exists():
        raise BuildError("destination parece raiz ativa; use diretório candidato isolado")
    if destination.is_symlink() or (destination.exists() and not destination.is_dir()):
        raise BuildError(f"destination inseguro: {destination}")
    if destination.exists():
        for path in destination.rglob("*"):
            if path.is_symlink():
                raise BuildError(f"bundle contém symlink inseguro: {path}")


def validate_hashes(value: Any, names: set[str], location: str) -> None:
    if not isinstance(value, dict) or set(value) != names:
        raise BuildError(f"{location} deve conter exatamente {sorted(names)}")
    if any(not isinstance(item, str) or not SHA256.fullmatch(item) for item in value.values()):
        raise BuildError(f"{location} contém digest inválido")


def load_manifest(destination: Path) -> dict[str, Any] | None:
    path = destination / MANIFEST
    if not path.exists():
        return None
    document = load_json(path)
    if set(document) != MANIFEST_FIELDS or document.get("version") != 1 or document.get("generator") != "create-agent-opencode":
        raise BuildError(f"manifesto incompatível em {path}")
    validate_hashes(document["files"], RENDERED_FILES, f"{path}.files")
    validate_hashes(document["sources"], {f"{role}.md" for role in ROLES}, f"{path}.sources")
    if not isinstance(document["profile"], str) or not SHA256.fullmatch(document["profile"]):
        raise BuildError(f"profile digest inválido em {path}")
    return document


def validate_bundle(destination: Path, rendered: dict[str, str], manifest: dict[str, Any], check_safe: bool = True) -> None:
    if check_safe:
        safe_destination(destination)
    if not destination.is_dir() or load_manifest(destination) != manifest:
        raise BuildError("bundle ausente ou manifesto divergente")
    for relative, expected in rendered.items():
        path = destination / relative
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            raise BuildError(f"artefato ausente ou divergente: {path}")


def write_bundle(destination: Path, rendered: dict[str, str], manifest: dict[str, Any]) -> None:
    safe_destination(destination)
    prior = load_manifest(destination) if destination.exists() else None
    managed = set(prior["files"]) if prior else set()
    if prior:
        for relative, expected_digest in prior["files"].items():
            path = destination / relative
            if not path.is_file() or digest(path.read_bytes()) != expected_digest:
                raise BuildError(f"arquivo gerido foi alterado fora do builder: {path}")
    for relative in rendered:
        if (destination / relative).exists() and relative not in managed:
            raise BuildError(f"colisão com arquivo não gerido: {destination / relative}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{destination.name}.staging-", dir=destination.parent))
    backup = destination.parent / f".{destination.name}.backup-{os.getpid()}"
    try:
        if destination.exists():
            shutil.copytree(destination, staging, dirs_exist_ok=True)
        for relative, content in rendered.items():
            target = staging / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8", newline="\n")
        (staging / MANIFEST).write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8", newline="\n",
        )
        validate_bundle(staging, rendered, manifest, check_safe=False)
        if backup.exists():
            raise BuildError(f"backup transacional já existe: {backup}")
        if destination.exists():
            os.replace(destination, backup)
        os.replace(staging, destination)
    except Exception:
        if backup.exists() and not destination.exists():
            os.replace(backup, destination)
        raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    if backup.exists():
        try:
            shutil.rmtree(backup)
        except OSError as error:
            print(
                f"WARNING: bundle novo confirmado em {destination}, "
                f"mas o backup pós-commit não foi removido ({backup}): {error}",
                file=sys.stderr,
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("build", "validate-static"))
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        rendered, manifest = render_all(args.source_dir, args.profiles)
        if args.action == "build":
            write_bundle(args.destination, rendered, manifest)
        else:
            validate_bundle(args.destination, rendered, manifest)
    except (BuildError, OSError, UnicodeError) as error:
        print(f"BLOCKED: {error}", file=sys.stderr)
        return 2
    messages = {
        "build": f"concluída: bundle candidato gerado localmente em {args.destination}",
        "validate-static": "STATIC_OK: seis subagents, config, manifesto e corpos validados localmente",
    }
    print(messages[args.action])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
