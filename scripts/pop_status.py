#!/usr/bin/env python3
"""pop_status — panorama do vault PoP.

Mostra, por projeto, a contagem de tasks por estágio do kanban e as listas
que pedem atenção humana: aguardando liberação (001), aguardando aprovação
(003), verificação crítica (005 + critical), aguardando merge, bloqueadas
e alerta de WIP > 3 em 004.

Uso:
    python3 scripts/pop_status.py [--project <categoria>/<projeto>] [--vault DIR]
"""

import argparse
import datetime
import sys

import poplib

WIP_LIMIT = 3
STALE_DAYS = 14


def _stale_since(meta):
    """Dias desde `updated:`, ou None se ausente/inválido."""
    raw = str(meta.get("updated") or "")
    try:
        updated = datetime.date.fromisoformat(raw)
    except ValueError:
        return None
    return (datetime.date.today() - updated).days


def collect(project):
    """Coleta contagens e listas de atenção de um projeto."""
    counts = {stage: 0 for stage in poplib.STAGES}
    attention = {"release": [], "approval": [], "critical": [], "merge": [],
                 "blocked": [], "stale": [], "claimed": []}
    for stage, task_dir, card in poplib.iter_cards(project):
        counts[stage] += 1
        meta = poplib.read_card(card)
        tid = task_dir.name
        if stage == "001_initial_task" and not poplib.task_released(card):
            attention["release"].append(tid)
        if stage == "003_human_approval":
            attention["approval"].append(tid)
        if stage == "005_verifying" and meta.get("critical") is True:
            attention["critical"].append(tid)
        if meta.get("awaiting_merge") is True:
            attention["merge"].append(tid)
        if meta.get("blocked") is True:
            reason = meta.get("blocked_reason") or "sem motivo registrado"
            attention["blocked"].append(f"{tid} — {reason}")
        if stage != "006_done":
            days = _stale_since(meta)
            if days is not None and days > STALE_DAYS:
                attention["stale"].append(f"{tid} — sem update há {days} dias")
        by, at = poplib.parse_claim(meta)
        if by and stage != "006_done":
            when = at.isoformat(timespec="minutes") if at else "?"
            mark = "" if not poplib.claim_expired(at) else " [EXPIRADO]"
            attention["claimed"].append(f"{tid} — {by} desde {when}{mark}")
    return counts, attention


def print_project(label, counts, attention):
    """Imprime o bloco de um projeto."""
    total = sum(counts.values())
    print(f"\n## {label} — {total} task(s)")
    for stage in poplib.STAGES:
        if counts[stage]:
            print(f"  {stage}: {counts[stage]}")
    if total == 0:
        print("  (kanban vazio)")
    if counts["004_processing"] > WIP_LIMIT:
        print(f"  [ALERTA] WIP em 004_processing: {counts['004_processing']} "
              f"(limite {WIP_LIMIT})")


def print_list(title, items):
    """Imprime uma lista de atenção, se não vazia."""
    if not items:
        return
    print(f"\n{title}:")
    for item in items:
        print(f"  - {item}")


def main():
    parser = argparse.ArgumentParser(
        description="Panorama do vault: tasks por estágio e gates pendentes.")
    parser.add_argument("--project", metavar="CATEGORIA/PROJETO",
                        help="limita a um projeto (ex.: agents/meu-projeto)")
    parser.add_argument("--vault", metavar="DIR",
                        help="raiz do vault (default: pasta acima de scripts/)")
    args = parser.parse_args()

    root = poplib.vault_root(args.vault)
    projects = poplib.discover_projects(root)
    if args.project:
        projects = [p for p in projects
                    if poplib.project_label(root, p) == args.project]
        if not projects:
            print(f"Projeto não encontrado: {args.project}")
            return 1
    if not projects:
        print("Nenhum projeto com kanban encontrado no vault — tudo tranquilo.")
        return 0

    merged = {"release": [], "approval": [], "critical": [], "merge": [],
              "blocked": [], "stale": [], "claimed": []}
    print(f"Vault: {root}")
    for project in projects:
        label = poplib.project_label(root, project)
        counts, attention = collect(project)
        print_project(label, counts, attention)
        for key, items in attention.items():
            merged[key].extend(f"{tid} ({label})" for tid in items)

    print_list("Aguardando liberação do humano (001, sem "
               "`- [x] Pronto para planejar`)", merged["release"])
    print_list("Aguardando aprovação humana (003)", merged["approval"])
    print_list("Verificação crítica pendente (005, critical)", merged["critical"])
    print_list("Aguardando merge (awaiting_merge)", merged["merge"])
    print_list("Bloqueadas", merged["blocked"])
    print_list(f"Paradas (sem update há >{STALE_DAYS} dias, fora de 006)",
               merged["stale"])
    print_list("Em execução (claim ativo — não pegue estas tasks)",
               merged["claimed"])
    if not any(merged.values()):
        print("\nNada aguardando o humano.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
