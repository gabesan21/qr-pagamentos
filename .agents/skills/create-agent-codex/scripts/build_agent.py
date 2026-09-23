#!/usr/bin/env python3
"""Render and validate standalone Codex custom-agent TOML files."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import tomllib
from pathlib import Path
from typing import Any

REQUIRED_KEYS = {
    "name",
    "description",
    "developer_instructions",
    "model",
    "model_reasoning_effort",
    "sandbox_mode",
}
MODELS = {"gpt-5.6-sol", "gpt-5.6-terra"}
EFFORTS = {"minimal", "low", "medium", "high", "xhigh"}
SANDBOX_MODES = {"read-only", "workspace-write", "danger-full-access"}
ROLE_SECTIONS = (
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
ROLE_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class Invalid(ValueError):
    """Input or static schema is invalid."""


class Collision(ValueError):
    """An existing output cannot be replaced safely."""


def nonempty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise Invalid(f"{field} deve ser string não vazia")
    return value


def parse_role(source: Path) -> tuple[str, str, str]:
    try:
        body = source.read_text(encoding="utf-8")
    except OSError as exc:
        raise Invalid(f"não foi possível ler o papel: {source}: {exc}") from exc

    heading = re.match(r"\A# ([^\n]+)\n", body)
    if not heading:
        raise Invalid("papel deve iniciar com heading H1")
    name = heading.group(1).strip()
    if not ROLE_NAME.fullmatch(name):
        raise Invalid(f"nome de papel inválido: {name!r}")

    sections: dict[str, str] = {}
    matches = list(re.finditer(r"(?m)^## ([^\n]+)\n", body))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        sections[match.group(1).strip()] = body[match.end() : end].strip()
    missing = [section for section in ROLE_SECTIONS if not sections.get(section)]
    if missing:
        raise Invalid("seções canônicas ausentes/vazias: " + ", ".join(missing))

    description = " ".join(sections["Gatilho"].split())
    instructions = (
        "Projeção nativa Codex de um contrato canônico do PoP. "
        "Preserve integralmente os poderes, limites, aquisição direta, ownership e denies abaixo; "
        "a sandbox não substitui essas obrigações.\n\n"
        + body.rstrip()
        + "\n"
    )
    return name, description, instructions


def toml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def render_agent(source: Path, model: str, effort: str, sandbox_mode: str) -> bytes:
    if model not in MODELS:
        raise Invalid(f"model fora da allowlist local: {model}")
    if effort not in EFFORTS:
        raise Invalid(f"model_reasoning_effort fora da allowlist local: {effort}")
    if sandbox_mode not in SANDBOX_MODES:
        raise Invalid(f"sandbox_mode fora da allowlist local: {sandbox_mode}")
    name, description, instructions = parse_role(source)
    values = {
        "name": name,
        "description": description,
        "developer_instructions": instructions,
        "model": model,
        "model_reasoning_effort": effort,
        "sandbox_mode": sandbox_mode,
    }
    lines = [f"{key} = {toml_string(values[key])}" for key in values]
    candidate = ("\n".join(lines) + "\n").encode("utf-8")
    validate_static_bytes(candidate)
    return candidate


def validate_static_bytes(content: bytes) -> dict[str, str]:
    try:
        document = tomllib.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
        raise Invalid(f"TOML inválido: {exc}") from exc
    keys = set(document)
    if keys != REQUIRED_KEYS:
        missing = sorted(REQUIRED_KEYS - keys)
        extra = sorted(keys - REQUIRED_KEYS)
        raise Invalid(f"schema standalone divergente; ausentes={missing}; extras={extra}")
    for key in REQUIRED_KEYS:
        nonempty_string(document[key], key)
    if not ROLE_NAME.fullmatch(document["name"]):
        raise Invalid("name não está em kebab-case")
    if document["model"] not in MODELS:
        raise Invalid(f"model fora da allowlist local: {document['model']}")
    if document["model_reasoning_effort"] not in EFFORTS:
        raise Invalid("model_reasoning_effort fora da allowlist local")
    if document["sandbox_mode"] not in SANDBOX_MODES:
        raise Invalid("sandbox_mode fora da allowlist local")
    return document


def validate_against_source(content: bytes, source: Path) -> dict[str, str]:
    """Validate structure and exact deterministic projection from a canonical role."""
    agent = validate_static_bytes(content)
    expected = render_agent(
        source,
        agent["model"],
        agent["model_reasoning_effort"],
        agent["sandbox_mode"],
    )
    if expected != content:
        raise Invalid("agent diverge da projeção determinística da origem canônica")
    return agent


def read_bytes(path: Path, label: str) -> bytes:
    try:
        return path.read_bytes()
    except OSError as exc:
        raise Invalid(f"não foi possível ler {label}: {path}: {exc}") from exc


def atomic_write(
    path: Path,
    content: bytes,
    replace: bool,
    expected_name: str,
    source: Path,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if not replace:
            raise Collision(f"destino já existe: {path}; use --replace conscientemente")
        try:
            current = validate_against_source(path.read_bytes(), source)
        except (OSError, Invalid) as exc:
            raise Collision(f"destino existente não é substituível com segurança: {exc}") from exc
        if current["name"] != expected_name:
            raise Collision("destino existente pertence a outro agent")

    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
            temporary = handle.name
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    except OSError as exc:
        raise Invalid(f"falha de escrita atômica em {path}: {exc}") from exc
    finally:
        if temporary:
            try:
                Path(temporary).unlink(missing_ok=True)
            except OSError:
                pass


def require_agent_destination(path: Path, expected_name: str) -> None:
    if path.parent.name != "agents" or path.parent.parent.name != ".codex":
        raise Invalid("destino final deve estar em .codex/agents/")
    if path.name != f"{expected_name}.toml":
        raise Invalid("nome do destino deve corresponder ao name do agent")


def reject_render_agent_destination(path: Path) -> None:
    normalized_parts = path.resolve(strict=False).parts
    if any(
        part == ".codex"
        and index + 1 < len(normalized_parts)
        and normalized_parts[index + 1] == "agents"
        for index, part in enumerate(normalized_parts)
    ):
        raise Invalid("render não pode escrever sob .codex/agents/; use promote")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    render = commands.add_parser("render", help="renderizar candidato estaticamente válido")
    render.add_argument("source", type=Path)
    render.add_argument("candidate", type=Path)
    render.add_argument("--model", required=True)
    render.add_argument("--effort", required=True)
    render.add_argument("--sandbox-mode", required=True)
    render.add_argument("--replace", action="store_true")

    static = commands.add_parser("validate-static", help="validar apenas estrutura e allowlists")
    static.add_argument("agent", type=Path)
    static.add_argument("--source", required=True, type=Path)

    promote = commands.add_parser("promote", help="promover candidato validado localmente")
    promote.add_argument("candidate", type=Path)
    promote.add_argument("output", type=Path)
    promote.add_argument("--source", required=True, type=Path)
    promote.add_argument("--replace", action="store_true")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "render":
            reject_render_agent_destination(args.candidate)
            content = render_agent(args.source, args.model, args.effort, args.sandbox_mode)
            agent = validate_static_bytes(content)
            atomic_write(args.candidate, content, args.replace, agent["name"], args.source)
            digest = hashlib.sha256(content).hexdigest()
            print(f"LOCAL_OK name={agent['name']} sha256={digest}")
        else:
            content = read_bytes(args.agent if args.command == "validate-static" else args.candidate, "agent")
            agent = validate_against_source(content, args.source)
            if args.command == "validate-static":
                digest = hashlib.sha256(content).hexdigest()
                print(f"LOCAL_OK name={agent['name']} sha256={digest}")
            else:
                require_agent_destination(args.output, agent["name"])
                atomic_write(args.output, content, args.replace, agent["name"], args.source)
                digest = hashlib.sha256(content).hexdigest()
                print(f"OK promovido name={agent['name']} sha256={digest} output={args.output}")
        return 0
    except Collision as exc:
        print(f"COLLISION: {exc}", file=sys.stderr)
        return 4
    except Invalid as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
