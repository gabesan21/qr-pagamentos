#!/usr/bin/env python3
"""Valida o corpus executavel de conformidade do kanban e dos agentes."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


VAULT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = Path(__file__).resolve().parent / "tests/fixtures/kanban-agents"
REQUIRED_CASE_KEYS = (
    "schema_version", "id", "criterion", "title", "sources", "entry",
    "envelope", "action", "expectations", "result", "effects", "verification",
)
CRITERION_COUNTS = {"C01": 2, "C02": 5, "C03": 6, "C04": 5,
                    "C05": 5, "C06": 5, "C07": 6, "C08": 6}
ROLES = {
    "main-agent", "pop-planner", "pop-recon",
    "pop-execution-orchestrator", "pop-executor", "pop-judge-dredd",
    "pop-phase-verifier",
}


@dataclass(frozen=True)
class Decision:
    observations: dict[str, Any]
    result: tuple[str, str | None, str]
    allowed: frozenset[str]
    forbidden: frozenset[str]


def decision(observation: tuple[str, Any], result: tuple[str, str | None, str],
             allowed: str, forbidden: str) -> Decision:
    return Decision(
        {observation[0]: observation[1]}, result,
        frozenset(allowed.split()), frozenset(forbidden.split()),
    )


# O operation seleciona a regra; observacao, resultado e efeitos sao derivados sem
# consultar expectations/result/effects do fixture.
RULES = {
    "validate-manifest-order-and-uniqueness": decision(("manifest.cases[].id", True), ("concluida", None, "deterministic-manifest"), "read-corpus", "rewrite-fixtures run-before-10.1.5"),
    "resolve-each-source-path-and-section": decision(("case.sources", True), ("concluida", None, "canonical-origins-resolved"), "read-canonical-origins", "copy-normative-prose edit-canonical-origins"),
    "route-local-non-yolo-closing": decision(("quality-gate.actor", "none"), ("concluida", "005-act-3", "local-non-yolo-has-no-review-gate"), "continue-to-closing", "spawn-pop-judge-dredd open-task-pr"),
    "open-task-pr-and-wait": decision(("quality-gate.actor", "user"), ("concluida", "await-human-merge", "external-non-yolo-pr-gate"), "open-task-pr set-awaiting-merge", "spawn-pop-judge-dredd merge-for-user"),
    "transition-after-planning": decision(("transition", "002_planning->004_processing"), ("concluida", "004_processing", "yolo-non-critical"), "move-to-004", "create-003-round spawn-judge-at-003"),
    "dispatch-critical-plan-gate": decision(("gate.actor", "pop-judge-dredd"), ("concluida", "003_human_approval", "critical-yolo-gate"), "spawn-fresh-judge", "skip-003 reuse-planner-context"),
    "spawn-judge": decision(("judge.context", "fresh-judge-session"), ("concluida", "judge-round", "independent-fresh-context"), "read-authorized-origins write-verify", "reuse-planner-context reuse-executor-context"),
    "append-missing-criterion-and-optional-front": decision(("existing-identifiers", True), ("reentrada", "002_planning", "append-only-lacuna"), "append-criterion append-one-front", "renumber-criteria rewrite-F01 full-replan"),
    "reassess-invalidated-surface": decision(("next-review.mode", "full"), ("reentrada", "002_planning", "premise-invalidated-prior-review"), "replan-invalidated-surface", "treat-as-lacuna use-differential-review"),
    "execute-return-delta": decision(("executed-fronts", ["F02"]), ("reentrada", "004_processing", "partial-execution-return"), "edit-src/F02 reuse-intact-evidence", "reexecute-F01 reintegrate-F03"),
    "dispatch-directed-repair": decision(("return-counter", 0), ("reentrada", "same-review-round", "directed-repair"), "patch-delta-path judge-append-10-lines", "pop-move increment-return-counter judge-applies-fix"),
    "classify-third-repair": decision(("delta.pontual", False), ("reentrada", "004_processing", "third-repair-proves-diffuse-defect"), "name-diffuse-delta", "dispatch-third-directed-repair judge-fixes-delivery"),
    "route-after-approved-verdict": decision(("new-judge-contexts", 0), ("rejeitada", "005-act-2", "approval-is-terminal"), "continue-closing", "spawn-second-judge append-reversing-verdict"),
    "apply-first-return": decision(("yolo_005_returns", 1), ("reentrada", "004_processing", "first-return-allowed"), "increment-execution-counter dispatch-delta", "set-circuit-breaker rerun-intact-fronts"),
    "apply-second-plan-return": decision(("yolo_003_returns", 2), ("reentrada", "002_planning", "second-return-allowed"), "increment-plan-counter dispatch-plan-delta", "set-circuit-breaker full-replan-for-lacuna"),
    "apply-third-route-failure": decision(("circuit_breaker", True), ("BLOCKED", None, "third-failure-same-route"), "record-breaker-diagnosis", "dispatch-fourth-cycle continue-yolo"),
    "compare-progress": decision(("circuit_breaker", True), ("BLOCKED", None, "repeated-theme-without-new-fact"), "record-no-progress", "automatic-reentry increment-and-ignore-repeat"),
    "enforce-wall-budget": decision(("blocked", True), ("BLOCKED", None, "gate-wall-budget-exceeded"), "record-round-diagnosis", "spawn-next-judge-round continue-repair-loop"),
    "check-diff-scope": decision(("integration", "rejected"), ("rejeitada", "worker", "diff-outside-owns"), "return-to-responsible-worker", "integrate-out-of-scope-diff expand-worker-owns"),
    "validate-expected-input": decision(("status", "BLOCKED"), ("BLOCKED", None, "dependency-missing"), "report-missing-F01", "implement-F01 simulate-F01-result edit-F02"),
    "read-authorized-origins": decision(("substantive-context.source", "origin-paths"), ("concluida", None, "direct-origin-acquisition"), "read-authorized-paths", "accept-orchestrator-replay-as-proof read-full-plan-unnecessarily"),
    "authorize-read": decision(("read.subtasks/F02", "denied"), ("BLOCKED", None, "required-context-outside-may-read"), "report-insufficient-authorization", "read-F02 read-other-session self-expand-may-read"),
    "resolve-required-path": decision(("status", "BLOCKED"), ("BLOCKED", None, "origin-missing"), "report-missing-path", "invent-contract search-foreign-context edit-delivery"),
    "authorize-web": decision(("web-access", "denied"), ("rejeitada", None, "default-web-deny"), "continue-offline-if-possible", "network-read network-write"),
    "read-official-source": decision(("evidence.fields", ["direct_official_url", "consulted_at_absolute_date"]), ("concluida", None, "three-conditions-satisfied"), "read-official-controlled-source persist-url-and-date", "web-write community-source-as-proof implementation"),
    "evaluate-web-eligibility": decision(("blocked", True), ("BLOCKED", None, "mixed-research-and-implementation"), "report-ineligible-scope", "grant-partial-web split-scope-without-planning"),
    "handle-auth-challenge": decision(("status", "BLOCKED"), ("BLOCKED", None, "authentication-required"), "record-blocking-source", "authenticate request-credentials use-secondary-proof"),
    "assess-official-evidence": decision(("status", "BLOCKED"), ("BLOCKED", None, "official-evidence-insufficient"), "state-uncertainty record-official-gap", "use-forum-as-proof broaden-web-allow invent-finding"),
    "build-wave": decision(("wave", ["F01", "F02"]), ("concluida", "parallel-wave", "logical-and-write-independence"), "dispatch-isolated-workers", "coordinate-by-shared-write integrate-results"),
    "resolve-write-collision": decision(("execution-mode", "serial"), ("serializada", "F01-then-F02", "overlapping-write-set"), "serialize-fronts request-ownership-redesign", "parallel-dispatch allow-concurrent-write"),
    "dispatch-isolated-branches": decision(("worker-worktrees", True), ("concluida", "parallel-wave", "isolated-worktrees"), "derive-worker-branches-from-task-branch", "share-write-worktree worker-merges-peer"),
    "integrate-own-result": decision(("integration", "denied"), ("rejeitada", "main-agent", "delegated-role-cannot-integrate"), "return-diff-and-evidence", "merge cherry-pick move-card"),
    "validate-scope-and-integrate": decision(("integration.actor", "main-agent"), ("concluida", "integrated", "principal-only-integration"), "integrate-authorized-diff record-evidence", "integrate-failed-scope delegate-final-integration"),
    "build-yolo-wave": decision(("launched-task-count", 3), ("concluida", "wave", "yolo-wave-cap"), "launch-up-to-three-independent-tasks defer-T4", "launch-four-tasks parallelize-collisions"),
    "validate-predecessors": decision(("status", "BLOCKED"), ("BLOCKED", None, "predecessor-incomplete"), "report-missing-ledger", "run-suite reopen-predecessor simulate-ledger"),
    "run-accumulated-checklist": decision(("phase-suite-run-count", 1), ("concluida", "005_closing", "phase-checklist-executed"), "write-suite run-declared-checklist fix-phase-defects", "run-per-predecessor-task use-web"),
    "authorize-fix": decision(("write.other-phase/file", "denied"), ("follow-up", "new-task-or-modification", "defect-outside-phase-scope"), "record-structural-finding", "edit-other-phase expand-owns reopen-closed-task"),
    "rerun-delta": decision(("rerun-criteria", ["C07"]), ("reentrada", "005_closing", "delta-only-rerun"), "rerun-C07 reuse-C01-C02-evidence", "rerun-full-suite rewrite-intact-tests"),
    "route-structural-finding": decision(("finding.route", "follow-up"), ("follow-up", "new-task-or-modification", "structural-defect-above-phase"), "record-finding-in-memory propose-follow-up", "change-durable-contract reopen-closed-task silently-fix-above-phase"),
    "handle-phase-criterion": decision(("test-run-count", 0), ("concluida", "phase-checklist", "tests-deferred-to-final-task"), "record-C01-C08-for-phase", "write-tests run-tests mark-phase-criteria-passed"),
}


class DuplicateKey(ValueError):
    pass


def load_json(path: Path) -> Any:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise DuplicateKey(f"chave duplicada: {key}")
            result[key] = value
        return result

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=reject_duplicates)


def matches_type(value: Any, expected: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "null": value is None,
    }.get(expected, True)


def validate_schema(value: Any, schema: dict[str, Any], location: str) -> list[str]:
    errors: list[str] = []
    expected_type = schema.get("type")
    if expected_type:
        types = expected_type if isinstance(expected_type, list) else [expected_type]
        if not any(matches_type(value, item) for item in types):
            return [f"{location}: tipo invalido; esperado {types}"]
    if "const" in schema and value != schema["const"]:
        errors.append(f"{location}: difere de const {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{location}: fora do enum")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{location}: string curta")
        if "pattern" in schema and not re.fullmatch(schema["pattern"], value):
            errors.append(f"{location}: nao casa com pattern")
    if isinstance(value, int) and not isinstance(value, bool) and value < schema.get("minimum", value):
        errors.append(f"{location}: abaixo do minimum")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            errors.append(f"{location}: poucos itens")
        if "items" in schema:
            for index, item in enumerate(value):
                errors.extend(validate_schema(item, schema["items"], f"{location}[{index}]"))
    if isinstance(value, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                errors.append(f"{location}: campo ausente {key}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for key in value.keys() - properties.keys():
                errors.append(f"{location}: campo extra {key}")
        for key, child in properties.items():
            if key in value:
                errors.extend(validate_schema(value[key], child, f"{location}.{key}"))
    return errors


def validate_schema_contract(schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append("schema: draft inesperado")
    if schema.get("type") != "object" or schema.get("additionalProperties") is not False:
        errors.append("schema: raiz deve ser object fechado")
    if tuple(schema.get("required", [])) != REQUIRED_CASE_KEYS:
        errors.append("schema: required canonico foi alterado")
    properties = schema.get("properties", {})
    checks = {
        ("schema_version", "const"): "1.0.0",
        ("id", "pattern"): "^c0[1-8]-[0-9]{2}-[a-z0-9-]+$",
        ("criterion", "enum"): list(CRITERION_COUNTS),
        ("verification", "additionalProperties"): False,
    }
    for (name, field), expected in checks.items():
        if properties.get(name, {}).get(field) != expected:
            errors.append(f"schema: properties.{name}.{field} foi alterado")
    return errors


def source_heading_resolves(source: dict[str, str], vault_root: Path) -> tuple[bool, str]:
    path = (vault_root / source["path"]).resolve()
    try:
        path.relative_to(vault_root.resolve())
    except ValueError:
        return False, "path escapa da raiz"
    if not path.is_file():
        return False, "path ausente"
    requested = source["section"].strip().casefold()
    headings = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^#{1,6}\s+(.+?)\s*$", line)
        if match:
            headings.append(match.group(1).strip().casefold())
    found = any(heading == requested or heading.startswith(requested + " (") for heading in headings)
    return found, "secao ausente" if not found else ""


def assert_rule_preconditions(case: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    envelope = case["envelope"]
    action = case["action"]
    if envelope["role"] not in ROLES:
        errors.append("envelope.role desconhecido")
    if envelope["web"] == "official-read-only" and envelope["role"] != "pop-executor":
        errors.append("web oficial concedida a papel inelegivel")
    if envelope["web"] == "official-read-only":
        state = case["entry"]["state"]
        eligible = state.get("yolo", state.get("eligible")) is True
        no_implementation = state.get("implementation", False) is False
        if not eligible or not no_implementation:
            errors.append("web oficial sem elegibilidade cumulativa")
    allowed_dispatches = {"spawn-judge", "dispatch-directed-repair"}
    if action["actor"] != envelope["role"] and action["operation"] not in allowed_dispatches:
        errors.append("action.actor difere de envelope.role")
    if set(envelope["owns"]) & set(envelope["must_not_edit"]):
        errors.append("owns colide com must_not_edit")
    if case["criterion"] == "C08" and envelope["web"] != "deny":
        errors.append("phase verifier nao pode usar web")
    return errors


def predicate_holds(actual: Any, predicate: str, expected: Any) -> bool:
    if predicate == "equals":
        return actual == expected
    if predicate == "contains":
        return all(item in actual for item in expected)
    if predicate == "less-than-or-equal":
        return actual <= expected
    if predicate in {"is-unique-and-ascending", "all-resolve", "remain-unchanged", "pairwise-distinct"}:
        return actual is expected
    if predicate == "differs-from":
        return actual != expected
    if predicate == "increment-by":
        return actual == expected
    return False


def validate_case(case: dict[str, Any], vault_root: Path) -> list[str]:
    errors: list[str] = []
    operation = case["action"]["operation"]
    rule = RULES.get(operation)
    if rule is None:
        return [f"operation sem regra observavel: {operation}"]
    errors.extend(assert_rule_preconditions(case))
    for source in case["sources"]:
        resolved, reason = source_heading_resolves(source, vault_root)
        if not resolved:
            errors.append(f"source {source['path']}#{source['section']}: {reason}")
    if len(case["expectations"]) != 1:
        errors.append("deve haver uma expectation atomica")
    else:
        expectation = case["expectations"][0]
        subject = expectation["subject"]
        if subject not in rule.observations:
            errors.append(f"subject nao derivado pela regra: {subject}")
        elif not predicate_holds(rule.observations[subject], expectation["predicate"], expectation["value"]):
            errors.append(f"expectation nao corresponde a observacao derivada: {subject}")
    actual_result = (case["result"]["status"], case["result"]["route"], case["result"]["reason"])
    if actual_result != rule.result:
        errors.append(f"result divergente; derivado={rule.result!r}")
    if frozenset(case["effects"]["allowed"]) != rule.allowed:
        errors.append("effects.allowed diverge da regra")
    if frozenset(case["effects"]["forbidden"]) != rule.forbidden:
        errors.append("effects.forbidden diverge da regra")
    if set(case["effects"]["allowed"]) & set(case["effects"]["forbidden"]):
        errors.append("efeito simultaneamente permitido e proibido")
    return errors


def validate(corpus_root: Path = DEFAULT_CORPUS, vault_root: Path = VAULT_ROOT) -> tuple[int, list[str], dict[str, int]]:
    errors: list[str] = []
    try:
        schema = load_json(corpus_root / "schema.json")
        manifest = load_json(corpus_root / "manifest.json")
    except (OSError, json.JSONDecodeError, DuplicateKey) as exc:
        return 0, [f"corpus: {exc}"], {}
    errors.extend(validate_schema_contract(schema))
    expected_manifest_keys = {"schema_version", "schema", "order", "verification", "cases"}
    if set(manifest) != expected_manifest_keys:
        errors.append("manifest: campos invalidos")
    if manifest.get("schema_version") != "1.0.0" or manifest.get("schema") != "schema.json":
        errors.append("manifest: schema/version invalidos")
    if manifest.get("order") != "id-ascending":
        errors.append("manifest: order deve ser id-ascending")
    if manifest.get("verification") != {"owner": "phase", "task": "10.1.5-verificacao-da-phase"}:
        errors.append("manifest: verification invalida")
    items = manifest.get("cases", [])
    ids = [item.get("id") for item in items]
    if ids != sorted(ids) or len(ids) != len(set(ids)):
        errors.append("manifest: ids devem ser unicos e ascendentes")
    if len(items) != 40:
        errors.append(f"manifest: esperado 40 casos, obtido {len(items)}")
    counts = {criterion: 0 for criterion in CRITERION_COUNTS}
    loaded = 0
    listed_paths: set[str] = set()
    for item in items:
        if set(item) != {"id", "criterion", "path"}:
            errors.append(f"manifest item {item.get('id')}: campos invalidos")
            continue
        case_id = item["id"]
        expected_path = f"cases/{case_id}.json"
        if item["path"] != expected_path:
            errors.append(f"{case_id}: path do manifesto nao e canonico")
        if item["criterion"] != case_id[:3].upper():
            errors.append(f"{case_id}: criterio do manifesto diverge do id")
        listed_paths.add(item["path"])
        path = corpus_root / item["path"]
        try:
            case = load_json(path)
        except (OSError, json.JSONDecodeError, DuplicateKey) as exc:
            errors.append(f"{case_id}: {exc}")
            continue
        loaded += 1
        if case.get("id") != case_id or case.get("criterion") != item["criterion"]:
            errors.append(f"{case_id}: manifesto e caso divergem")
        schema_errors = validate_schema(case, schema, case_id)
        errors.extend(f"{case_id}: {error}" for error in schema_errors)
        if case.get("verification") != manifest.get("verification"):
            errors.append(f"{case_id}: verification diverge do manifesto")
        counts[item["criterion"]] = counts.get(item["criterion"], 0) + 1
        if not schema_errors:
            errors.extend(f"{case_id}: {error}" for error in validate_case(case, vault_root))
    actual_paths = {str(path.relative_to(corpus_root)) for path in (corpus_root / "cases").glob("*.json")}
    extras = actual_paths - listed_paths
    missing = listed_paths - actual_paths
    if extras:
        errors.append(f"manifest: casos nao listados: {sorted(extras)}")
    if missing:
        errors.append(f"manifest: paths ausentes: {sorted(missing)}")
    if counts != CRITERION_COUNTS:
        errors.append(f"manifest: distribuicao C01-C08 invalida: {counts}")
    return loaded, errors, counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--vault-root", type=Path, default=VAULT_ROOT)
    args = parser.parse_args(argv)
    loaded, errors, counts = validate(args.corpus.resolve(), args.vault_root.resolve())
    if errors:
        for error in errors:
            print(f"[FALHA] {error}")
        print(f"{loaded}/40 casos carregados; {len(errors)} falha(s)")
        return 1
    criteria = ", ".join(f"{name}={counts[name]}" for name in sorted(counts))
    print(f"40/40 casos conformes — {criteria}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
