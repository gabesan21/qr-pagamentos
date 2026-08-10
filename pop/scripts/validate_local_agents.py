#!/usr/bin/env python3
"""Validate the PoP's native agent files without invoking any coding agent."""

from __future__ import annotations

import argparse
import ast
from dataclasses import dataclass, field
import json
from pathlib import Path
import re
import sys
from types import ModuleType
from typing import Any, Callable


ROLES = (
    "pop-execution-orchestrator",
    "pop-executor",
    "pop-judge-dredd",
    "pop-phase-verifier",
    "pop-planner",
    "pop-recon",
)
SPECIALISTS = ROLES
REQUIRED_SECTIONS = (
    "Identidade",
    "Gatilho",
    "Aquisição por paths",
    "Permissões",
    "Entrada, saída e término",
    "Ownership",
    "Dependências",
    "Gates e reentrada",
    "Denies",
)
KIMI_ROUTING = {
    "pop-planner": "primary",
    "pop-judge-dredd": "primary",
    "pop-recon": "secondary",
    "pop-execution-orchestrator": "secondary",
    "pop-executor": "secondary",
    "pop-phase-verifier": "secondary",
}
CODEX_PROFILES = {
    "pop-planner": ("gpt-5.6-sol", "high", "workspace-write"),
    "pop-judge-dredd": ("gpt-5.6-sol", "high", "workspace-write"),
    "pop-recon": ("gpt-5.6-terra", "medium", "workspace-write"),
    "pop-execution-orchestrator": ("gpt-5.6-terra", "medium", "workspace-write"),
    "pop-executor": ("gpt-5.6-terra", "medium", "workspace-write"),
    "pop-phase-verifier": ("gpt-5.6-terra", "medium", "workspace-write"),
}
LEGACY_PROFILE_KEYS = {"tier", "tiers", "fallback", "fallbacks", "model_tier", "modelTier"}
FORBIDDEN_IMPORT_ROOTS = {
    "aiohttp",
    "anthropic",
    "http",
    "httpx",
    "keyring",
    "openai",
    "requests",
    "socket",
    "subprocess",
    "urllib",
}
FORBIDDEN_CALLS = {
    "os.popen",
    "os.system",
    "subprocess.call",
    "subprocess.check_call",
    "subprocess.check_output",
    "subprocess.Popen",
    "subprocess.run",
}


@dataclass
class Check:
    name: str
    errors: list[str] = field(default_factory=list)

    def fail(self, path: Path | str, reason: str) -> None:
        self.errors.append(f"{path}: {reason}")


@dataclass
class ValidationReport:
    checks: list[Check]

    @property
    def ok(self) -> bool:
        return all(not check.errors for check in self.checks)

    def render(self) -> str:
        lines: list[str] = []
        for check in self.checks:
            if not check.errors:
                lines.append(f"OK {check.name}")
                continue
            lines.append(f"FAIL {check.name} ({len(check.errors)})")
            lines.extend(f"  - {error}" for error in check.errors)
        lines.append("LOCAL_AGENTS_OK" if self.ok else "LOCAL_AGENTS_INVALID")
        return "\n".join(lines)


def load_module(path: Path, name: str) -> ModuleType:
    module = ModuleType(name)
    module.__file__ = str(path)
    module.__package__ = ""
    previous = sys.modules.get(name)
    sys.modules[name] = module
    try:
        source = path.read_bytes()
        exec(compile(source, str(path), "exec"), module.__dict__)
    finally:
        if previous is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = previous
    return module


def exact_files(directory: Path, suffix: str) -> set[str]:
    if not directory.is_dir() or directory.is_symlink():
        raise ValueError("diretório ausente ou inseguro")
    return {path.name for path in directory.iterdir() if path.is_file() and path.suffix == suffix}


def run_check(name: str, validation: Callable[[Check], None]) -> Check:
    check = Check(name)
    try:
        validation(check)
    except Exception as error:  # Every runtime must report independently.
        check.fail(name, str(error))
    return check


def validate_generic(root: Path, check: Check) -> None:
    agents_contract = (root / "AGENTS.md").read_text(encoding="utf-8")
    if "Principal delegation-first" not in agents_contract or "sempre delega" not in agents_contract:
        check.fail(root / "AGENTS.md", "contrato delegation-first do principal ausente")
    source_dir = root / ".agents/agents"
    expected = {f"{role}.md" for role in ROLES}
    try:
        actual = exact_files(source_dir, ".md")
    except ValueError as error:
        check.fail(source_dir, str(error))
        return
    if actual != expected:
        check.fail(source_dir, f"papéis divergentes; ausentes={sorted(expected-actual)} extras={sorted(actual-expected)}")
    for role in ROLES:
        path = source_dir / f"{role}.md"
        if not path.is_file() or path.is_symlink():
            check.fail(path, "fonte ausente ou symlink")
            continue
        body = path.read_text(encoding="utf-8")
        if not body.startswith(f"# {role}\n"):
            check.fail(path, "heading H1 diverge do nome canônico")
        sections = re.findall(r"(?m)^## ([^\n]+)\n", body)
        if tuple(sections) != REQUIRED_SECTIONS:
            check.fail(path, f"seções devem ser exatamente as nove canônicas; encontrado={sections}")
        required_semantics = {
            "Aquisição por paths": ("ler",),
            "Ownership": ("escrever", "write"),
            "Denies": ("não",),
        }
        section_bodies = {
            match.group(1): match.group(2).casefold()
            for match in re.finditer(
                r"(?ms)^## ([^\n]+)\n\n(.*?)(?=^## |\Z)",
                body,
            )
        }
        for section, alternatives in required_semantics.items():
            content = section_bodies.get(section, "")
            if not any(marker.casefold() in content for marker in alternatives):
                check.fail(path, f"{section} não explicita a semântica canônica")


def validate_claude(root: Path, check: Check) -> None:
    builder_path = root / ".agents/skills/create-agent-claude-code/scripts/build_agents.py"
    builder = load_module(builder_path, "pop_validate_claude_builder")
    source_dir = root / ".agents/agents"
    profiles_path = root / ".claude/pop-agent-profiles.json"
    runtime_path = root / ".claude/pop-agent-runtime.json"
    destination = root / ".claude/agents"
    rendered, manifest = builder.render_all(source_dir, profiles_path, runtime_path)
    builder.validate_destination(destination, rendered, manifest)
    actual_agents = exact_files(destination, ".md")
    expected_agents = {f"{role}.md" for role in ROLES}
    if actual_agents != expected_agents:
        check.fail(destination, f"agents divergentes; ausentes={sorted(expected_agents-actual_agents)} extras={sorted(actual_agents-expected_agents)}")

    settings_path = root / ".claude/settings.json"
    settings = json.loads(settings_path.read_text(encoding="utf-8"))
    profiles = builder.validate_profiles(builder.load_json(profiles_path))
    if "agent" in settings:
        check.fail(settings_path, "o principal segue AGENTS.md e não deve selecionar custom agent")
    expected_settings = {"model": "opus", "effortLevel": "high"}
    for key, expected in expected_settings.items():
        if settings.get(key) != expected:
            check.fail(settings_path, f"{key} deve ser {expected!r}")
    if set(settings.get("availableModels", [])) != {profile["model"] for profile in profiles.values()}:
        check.fail(settings_path, "availableModels diverge dos perfis")
    permissions = settings.get("permissions")
    if not isinstance(permissions, dict) or permissions.get("defaultMode") != "dontAsk":
        check.fail(settings_path, "permissions.defaultMode do principal deve ser dontAsk")
    denied = permissions.get("deny", []) if isinstance(permissions, dict) else []
    if not {"WebFetch", "WebSearch"}.issubset(denied):
        check.fail(settings_path, "deny de web incompleto")
    runtime = builder.load_json(runtime_path)
    configured_depth = settings.get("env", {}).get("CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH")
    if configured_depth != str(runtime.get("maxSpawnDepth")):
        check.fail(settings_path, "spawn depth diverge do preflight local persistido")


def validate_kimi(root: Path, check: Check) -> None:
    builder_path = root / ".agents/skills/create-agent-kimi-code/scripts/build_agent.py"
    builder = load_module(builder_path, "pop_validate_kimi_builder")
    source_dir = root / ".agents/agents"
    destination = root / ".kimi-code/agents"
    expected = {f"{role}.md" for role in ROLES}
    actual = exact_files(destination, ".md")
    if actual != expected:
        check.fail(destination, f"agents divergentes; ausentes={sorted(expected-actual)} extras={sorted(actual-expected)}")
    observed: dict[str, str] = {}
    for role, routing in KIMI_ROUTING.items():
        source = source_dir / f"{role}.md"
        agent = destination / f"{role}.md"
        canonical_role, body = builder.read_source(source)
        if canonical_role != role:
            check.fail(source, f"papel derivado {canonical_role!r} diverge")
            continue
        expected_content = builder.render_agent(role, body, routing)
        if not agent.is_file() or agent.read_text(encoding="utf-8") != expected_content:
            check.fail(agent, "bytes divergem da projeção determinística")
            continue
        fields, _ = builder.parse_generated_agent(expected_content)
        observed[role] = fields.get("model_preference")
    if observed != KIMI_ROUTING:
        check.fail(destination, f"routing deve ser 2 primary/4 secondary; encontrado={observed}")
    try:
        import tomllib
        config = tomllib.loads((root / ".kimi-code/config.toml").read_text(encoding="utf-8"))
        secondary = config.get("secondary_model", {})
        if secondary != {"model": "kimi-code/kimi-for-coding"}:
            check.fail(root / ".kimi-code/config.toml", "secondary deve ser exatamente K2.7 sem effort graduado")
    except (OSError, UnicodeError, ValueError) as error:
        check.fail(root / ".kimi-code/config.toml", f"config local ilegível: {error}")


def validate_codex(root: Path, check: Check) -> None:
    builder_path = root / ".agents/skills/create-agent-codex/scripts/build_agent.py"
    builder = load_module(builder_path, "pop_validate_codex_builder")
    source_dir = root / ".agents/agents"
    destination = root / ".codex/agents"
    expected = {f"{role}.toml" for role in SPECIALISTS}
    actual = exact_files(destination, ".toml")
    if actual != expected:
        check.fail(destination, f"especialistas divergentes; ausentes={sorted(expected-actual)} extras={sorted(actual-expected)}")
    principal_path = destination / "pop-orchestrator.toml"
    if principal_path.exists():
        check.fail(principal_path, "o principal não deve ser custom agent Codex")
    for role, profile in CODEX_PROFILES.items():
        path = destination / f"{role}.toml"
        source = source_dir / f"{role}.md"
        if not path.is_file() or path.is_symlink():
            check.fail(path, "agent ausente ou symlink")
            continue
        document = builder.validate_against_source(path.read_bytes(), source)
        actual_profile = (
            document["model"],
            document["model_reasoning_effort"],
            document["sandbox_mode"],
        )
        if actual_profile != profile:
            check.fail(path, f"tuple deve ser {profile}, encontrado={actual_profile}")


def validate_opencode(root: Path, check: Check) -> None:
    builder_path = root / ".agents/skills/create-agent-opencode/scripts/build_agents.py"
    builder = load_module(builder_path, "pop_validate_opencode_builder")
    source_dir = root / ".agents/agents"
    profiles_path = root / ".opencode/pop-agent-profiles.json"
    rendered, manifest = builder.render_all(source_dir, profiles_path)
    manifest_path = root / builder.MANIFEST
    actual_manifest = builder.load_manifest(root)
    if actual_manifest != manifest:
        check.fail(manifest_path, "manifesto diverge da projeção fresca")
    for relative, expected in rendered.items():
        path = root / relative
        if not path.is_file() or path.read_text(encoding="utf-8") != expected:
            check.fail(path, "artefato ausente ou diverge da projeção fresca")
    destination = root / ".opencode/agents"
    expected_agents = {f"{role}.md" for role in ROLES}
    actual_agents = exact_files(destination, ".md")
    if actual_agents != expected_agents:
        check.fail(destination, f"agents divergentes; ausentes={sorted(expected_agents-actual_agents)} extras={sorted(actual_agents-expected_agents)}")


def find_legacy_key(value: Any, prefix: str = "") -> list[str]:
    found: list[str] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if key in LEGACY_PROFILE_KEYS:
                found.append(path)
            found.extend(find_legacy_key(nested, path))
    elif isinstance(value, list):
        for index, nested in enumerate(value):
            found.extend(find_legacy_key(nested, f"{prefix}[{index}]"))
    return found


def validate_harness_boundary(root: Path, check: Check) -> None:
    legacy_catalogs = (
        root / "scripts/models.json",
        root / ".agents/models.json",
        root / ".claude/models.json",
        root / ".kimi-code/models.json",
        root / ".codex/models.json",
        root / ".opencode/models.json",
    )
    for path in legacy_catalogs:
        if path.exists():
            check.fail(path, "catálogo central legado deve estar ausente")

    pi_skill = root / ".agents/skills/create-agent-pi"
    if pi_skill.exists():
        check.fail(pi_skill, "Pi não possui agents nativos equivalentes; adapter deve estar ausente")

    forbidden_native_surfaces = (
        root / ".pi/agents",
        root / ".pi/agent",
        root / ".pi/extensions/pop-agents.ts",
        root / ".pi/extensions/pop-subagents.ts",
    )
    for path in forbidden_native_surfaces:
        if path.exists():
            check.fail(path, "adapter não suportado deve estar ausente")

    profile_documents = (
        root / ".claude/pop-agent-profiles.json",
        root / ".claude/pop-agent-runtime.json",
        root / ".claude/settings.json",
        root / ".opencode/pop-agent-profiles.json",
        root / "opencode.json",
    )
    for path in profile_documents:
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            check.fail(path, f"JSON de perfil/config ilegível: {error}")
            continue
        legacy = find_legacy_key(document)
        if legacy:
            check.fail(path, f"chaves de routing central legado: {legacy}")


def validate_corpus(root: Path, check: Check) -> None:
    scripts_root = harness_root(root) / "scripts"
    validator_path = scripts_root / "validate_kanban_agents.py"
    corpus_root = scripts_root / "tests/fixtures/kanban-agents"
    if not corpus_root.is_dir() and (root / "pop/.included-harness.json").is_file():
        return
    validator = load_module(validator_path, "pop_validate_kanban_agents")
    loaded, errors, counts = validator.validate(corpus_root, root)
    if errors:
        for error in errors:
            check.fail(corpus_root, error)
    if loaded != 40:
        check.fail(corpus_root, f"corpus deve carregar 40 casos; encontrado={loaded}")
    if counts != validator.CRITERION_COUNTS:
        check.fail(corpus_root, f"distribuição C01-C08 divergente; encontrado={counts}")


def dotted_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = dotted_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return None


def validate_no_egress(root: Path, check: Check) -> None:
    scripts_root = harness_root(root) / "scripts"
    paths = (
        scripts_root / "validate_local_agents.py",
        scripts_root / "validate_kanban_agents.py",
        root / ".agents/skills/create-agent-claude-code/scripts/build_agents.py",
        root / ".agents/skills/create-agent-kimi-code/scripts/build_agent.py",
        root / ".agents/skills/create-agent-codex/scripts/build_agent.py",
        root / ".agents/skills/create-agent-opencode/scripts/build_agents.py",
    )
    test_path = scripts_root / "tests/test_validate_local_agents.py"
    if test_path.is_file():
        paths += (test_path,)
    for path in paths:
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, UnicodeError, SyntaxError) as error:
            check.fail(path, f"fonte Python ilegível: {error}")
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split(".", 1)[0] in FORBIDDEN_IMPORT_ROOTS:
                        check.fail(path, f"import de egress/processo proibido na linha {node.lineno}: {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if module.split(".", 1)[0] in FORBIDDEN_IMPORT_ROOTS:
                    check.fail(path, f"import de egress/processo proibido na linha {node.lineno}: {module}")
            elif isinstance(node, ast.Call):
                target = dotted_name(node.func)
                if target in FORBIDDEN_CALLS or (target and target.startswith("os.spawn")):
                    check.fail(path, f"chamada de processo proibida na linha {node.lineno}: {target}")


def validate(root: Path) -> ValidationReport:
    root = root.resolve()
    validations = (
        ("generic", lambda check: validate_generic(root, check)),
        ("claude-code", lambda check: validate_claude(root, check)),
        ("kimi-code", lambda check: validate_kimi(root, check)),
        ("codex", lambda check: validate_codex(root, check)),
        ("opencode", lambda check: validate_opencode(root, check)),
        ("harness", lambda check: validate_harness_boundary(root, check)),
        ("corpus", lambda check: validate_corpus(root, check)),
        ("local-only", lambda check: validate_no_egress(root, check)),
    )
    return ValidationReport([run_check(name, function) for name, function in validations])


def harness_root(root: Path) -> Path:
    """Raiz física do harness; em included, os scripts moram em `pop/`."""
    candidate = root / "pop"
    return candidate if (candidate / ".included-harness.json").is_file() else root


def default_root() -> Path:
    """Raiz do repositório que contém o harness, original ou instalado."""
    scripts_parent = Path(__file__).resolve().parents[1]
    if (scripts_parent / ".included-harness.json").is_file():
        return scripts_parent.parent
    return scripts_parent


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=default_root())
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    report = validate(args.root)
    print(report.render())
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
