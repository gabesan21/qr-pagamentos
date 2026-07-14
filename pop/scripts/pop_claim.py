#!/usr/bin/env python3
"""pop_claim — claim (lease) de task: evita dois agentes na mesma task.

O orquestrador registra `claimed_by:`/`claimed_at:` no card ao assumir a
task e libera ao parar num gate. Claim de outro agente ainda dentro do
lease (default 2h) → recusa com exit 1. Claim expirado pode ser tomado.

Uso:
    python3 scripts/pop_claim.py <task-id> [--by NOME]          # assumir
    python3 scripts/pop_claim.py <task-id> --release [--by NOME]
    python3 scripts/pop_claim.py <task-id> --status
    Opções: --lease-hours N (default 2) · --force · --vault DIR
"""

import argparse
import sys

import poplib

DEFAULT_LEASE_HOURS = poplib.DEFAULT_LEASE_HOURS


def set_fields(card, updates):
    """Grava campos no frontmatter do card (cria a chave se faltar)."""
    lines = card.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        sys.exit(f"Card sem frontmatter: {card}")
    end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    for key, value in updates.items():
        for i in range(1, end):
            if lines[i].startswith(f"{key}:"):
                lines[i] = f"{key}: {value}".rstrip()
                break
        else:
            lines.insert(end, f"{key}: {value}".rstrip())
            end += 1
    card.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(
        description="Claim (lease) de task para evitar trabalho duplicado.")
    parser.add_argument("task_id")
    parser.add_argument("--by", default=poplib.default_agent(),
                        help="identificador do agente (default: usuario@host)")
    parser.add_argument("--release", action="store_true",
                        help="libera o claim em vez de assumir")
    parser.add_argument("--status", action="store_true",
                        help="só mostra o estado do claim")
    parser.add_argument("--lease-hours", type=float, default=DEFAULT_LEASE_HOURS,
                        help=f"validade do claim em horas (default {DEFAULT_LEASE_HOURS})")
    parser.add_argument("--force", action="store_true",
                        help="ignora dono/lease (release ou takeover forçado)")
    parser.add_argument("--vault", metavar="DIR")
    args = parser.parse_args()

    root = poplib.vault_root(args.vault)
    found = poplib.find_task(root, args.task_id)
    if not found:
        print(f"Task não encontrada: {args.task_id}")
        return 1
    _project, stage, task_dir = found
    card = task_dir / f"{args.task_id}.md"
    if not card.is_file():
        sys.exit(f"Card não encontrado: {card}")
    meta = poplib.read_card(card)
    by, at = poplib.parse_claim(meta)
    holds = by is not None and not poplib.claim_expired(at, args.lease_hours)

    if args.status:
        if by is None:
            print(f"{args.task_id} [{stage}]: livre")
            return 0
        state = "ativo" if holds else "EXPIRADO"
        print(f"{args.task_id} [{stage}]: claim {state} de {by} desde "
              f"{at.isoformat(timespec='minutes') if at else '?'}")
        return 1 if holds and by != args.by else 0

    if args.release:
        if by is None:
            print(f"{args.task_id}: já estava livre.")
            return 0
        if by != args.by and not args.force:
            print(f"{args.task_id}: claim é de {by}, não de {args.by} — "
                  f"use --force para liberar mesmo assim.")
            return 1
        set_fields(card, {"claimed_by": "", "claimed_at": ""})
        print(f"{args.task_id}: claim liberado.")
        return 0

    # assumir
    if holds and by != args.by and not args.force:
        print(f"{args.task_id} [{stage}]: OCUPADA — claim ativo de {by} desde "
              f"{at.isoformat(timespec='minutes')} (lease {args.lease_hours}h). "
              f"Não trabalhe nesta task.")
        return 1
    if by and by != args.by:
        why = "expirado" if not holds else "forçado (--force)"
        print(f"{args.task_id}: tomando claim {why} de {by}.")
    set_fields(card, {"claimed_by": args.by,
                      "claimed_at": poplib.now().isoformat(timespec="minutes")})
    print(f"{args.task_id} [{stage}]: claim registrado para {args.by} "
          f"(lease {args.lease_hours}h — renove refazendo o claim).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
