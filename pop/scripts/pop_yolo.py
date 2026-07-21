#!/usr/bin/env python3
"""Operações determinísticas do scheduler e da telemetria yolo."""

from __future__ import annotations

import argparse
import json
import sys

import poplib


def set_fields(card, fields):
    lines = card.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        raise RuntimeError(f"frontmatter ausente: {card}")
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        raise RuntimeError(f"frontmatter sem fechamento: {card}")
    found = set()
    for i in range(1, end):
        key = lines[i].split(":", 1)[0].strip()
        if key in fields:
            lines[i] = f"{key}: {fields[key]}"
            found.add(key)
    for key, value in fields.items():
        if key not in found:
            lines.insert(end, f"{key}: {value}")
            end += 1
    card.write_text("\n".join(lines) + "\n", encoding="utf-8")


def dependencies_done(root, project, meta):
    for task_id in meta.get("depends_on") or []:
        memory = poplib.harness_root(project) / "memory" / f"{task_id}.md"
        found = poplib.find_task(root, str(task_id))
        if not memory.is_file() and (not found or found[1] != "006_done"):
            return False
    return True


def eligible(root, *, by, allow_same_project, limit):
    selected, projects = [], set()
    for project in poplib.discover_projects(root):
        label = poplib.project_label(root, project)
        for stage, task_dir, card in poplib.iter_cards(project):
            if stage == "006_done":
                continue
            meta = poplib.read_card(card)
            if meta.get("yolo") is not True or meta.get("blocked") is True:
                continue
            if meta.get("circuit_breaker") is True:
                continue
            owner, at = poplib.parse_claim(meta)
            if owner and owner != by and not poplib.claim_expired(at):
                continue
            if not dependencies_done(root, project, meta):
                continue
            if not allow_same_project and label in projects:
                continue
            selected.append({"task": task_dir.name, "project": label, "stage": stage})
            projects.add(label)
            if len(selected) == limit:
                return selected
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    wave = sub.add_parser("wave", help="lista até 3 tasks yolo elegíveis")
    wave.add_argument("--limit", type=int, default=3, choices=(1, 2, 3))
    wave.add_argument("--by", default=poplib.default_agent())
    wave.add_argument("--allow-same-project", action="store_true",
                      help="use só após validar independência de escrita/repo")
    wave.add_argument("--json", action="store_true")
    wave.add_argument("--vault", metavar="DIR")

    mode = sub.add_parser("verify-mode", help="decide differential ou full")
    mode.add_argument("task_id")
    mode.add_argument("--vault", metavar="DIR")

    record = sub.add_parser("record", help="registra contexto/testes sem mover")
    record.add_argument("task_id")
    record.add_argument("--stage", required=True)
    record.add_argument("--context", action="append", default=[])
    record.add_argument("--test-seconds", type=float, default=0)
    record.add_argument("--result", default="completed")
    record.add_argument("--vault", metavar="DIR")

    summary = sub.add_parser("telemetry", help="resume a telemetria da task")
    summary.add_argument("task_id")
    summary.add_argument("--json", action="store_true")
    summary.add_argument("--vault", metavar="DIR")

    reset = sub.add_parser("reset", help="intervenção humana zera um gate")
    reset.add_argument("task_id")
    reset.add_argument("--gate", required=True, choices=("003", "005"))
    reset.add_argument("--reason", required=True)
    reset.add_argument("--vault", metavar="DIR")
    args = parser.parse_args()
    root = poplib.vault_root(args.vault)

    if args.command == "wave":
        tasks = eligible(root, by=args.by,
                         allow_same_project=args.allow_same_project,
                         limit=args.limit)
        if args.json:
            print(json.dumps(tasks, ensure_ascii=False))
        else:
            for task in tasks:
                print(f"{task['task']}\t{task['project']}\t{task['stage']}")
        return 0

    found = poplib.find_task(root, args.task_id)
    if not found:
        print(f"Task não encontrada: {args.task_id}", file=sys.stderr)
        return 1
    _project, _stage, task_dir = found
    card = task_dir / f"{args.task_id}.md"
    meta = poplib.read_card(card)

    if args.command == "verify-mode":
        try:
            returns = int(meta.get("yolo_005_returns") or 0)
        except (TypeError, ValueError):
            returns = 0
        mode = "full" if meta.get("critical") is True or returns else "differential"
        why = "critical/retorno anterior" if mode == "full" else "não critical e primeira rodada"
        print(f"{mode}\t{why}")
        return 0
    if args.command == "record":
        poplib.record_telemetry(task_dir, {
            "event": "stage", "stage": args.stage,
            "contexts": args.context, "test_seconds": args.test_seconds,
            "result": args.result})
        print(f"OK: telemetria registrada para {args.task_id}.")
        return 0
    if args.command == "telemetry":
        data = poplib.telemetry_summary(task_dir)
        if args.json:
            print(json.dumps(data, ensure_ascii=False))
        else:
            print(" · ".join(f"{key}={value}" for key, value in data.items()))
        return 0
    set_fields(card, {f"yolo_{args.gate}_returns": 0,
                      "circuit_breaker": "false", "blocked": "false",
                      "blocked_reason": ""})
    poplib.record_telemetry(task_dir, {
        "event": "human_reset", "gate": args.gate,
        "result": "reset", "reason": args.reason})
    print(f"OK: gate {args.gate} de {args.task_id} zerado por intervenção humana.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
