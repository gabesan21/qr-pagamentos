#!/usr/bin/env python3
"""pop_move — move uma task entre estágios do kanban.

Encontra a pasta da task em qualquer projeto/estágio, valida a transição
(001→002→003→004→005→006, retornos 003→002, 004→002 e 005→004; `--force`
libera exceções), move a pasta inteira, atualiza `stage:` e `updated:` no
frontmatter do card e registra a linha no `## Log`.

Travas (sobrepostas só com `--force`): task com claim ativo de **outro**
agente não se move (`--by` identifica quem pede, default usuario@host);
001→002 exige a liberação humana `- [x] Pronto para planejar` no card —
ou `yolo: true` no frontmatter (a marca no roadmap é a liberação antecipada;
ver seção Yolo mode do WORKFLOW). O claim vale também para tasks yolo.

Uso:
    python3 scripts/pop_move.py <task-id> <estágio> [--reason "..."]
                                [--by NOME] [--force]
"""

import argparse
import shutil
import sys

import poplib

RETURNS = {
    ("003_human_approval", "002_planning"),
    ("004_processing", "002_planning"),
    ("005_verifying", "004_processing"),
}


def transition_allowed(src, dst):
    """True se dst é o próximo estágio de src ou um retorno permitido."""
    stages = poplib.STAGES
    if stages.index(dst) == stages.index(src) + 1:
        return True
    return (src, dst) in RETURNS


def update_card(card, new_stage, reason):
    """Atualiza stage:/updated: no frontmatter e appenda no ## Log."""
    lines = card.read_text(encoding="utf-8").splitlines()
    date = poplib.today()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                break
            key = lines[i].split(":", 1)[0].strip()
            if key == "stage":
                lines[i] = f"stage: {new_stage}"
            elif key == "updated":
                lines[i] = f"updated: {date}"
    card.write_text(append_log(lines, f"- {date} — {reason}") + "\n",
                    encoding="utf-8")


def append_log(lines, entry):
    """Insere a entrada no fim da seção ## Log (cria a seção se faltar)."""
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == "## Log")
    except StopIteration:
        return "\n".join(lines).rstrip("\n") + f"\n\n## Log\n\n{entry}"
    end = next((j for j in range(start + 1, len(lines))
                if lines[j].startswith("## ")), len(lines))
    last = end - 1
    while last > start and not lines[last].strip():
        last -= 1
    lines.insert(last + 1, entry)
    return "\n".join(lines).rstrip("\n")


def main():
    parser = argparse.ArgumentParser(
        description="Move a pasta de uma task para outro estágio do kanban, "
                    "atualizando frontmatter e Log do card.")
    parser.add_argument("task_id", help="id da task (nome da pasta, ex.: "
                                        "1.1.1-user-table-creation)")
    parser.add_argument("stage", choices=poplib.STAGES,
                        help="estágio de destino")
    parser.add_argument("--reason", default="transição via pop_move",
                        help="motivo curto registrado no Log do card")
    parser.add_argument("--by", default=poplib.default_agent(),
                        help="identificador do agente (default: usuario@host; "
                             "mesmo do pop_claim)")
    parser.add_argument("--force", action="store_true",
                        help="permite transição fora do fluxo padrão e "
                             "sobrepõe claim/liberação")
    parser.add_argument("--vault", metavar="DIR",
                        help="raiz do vault (default: pasta acima de scripts/)")
    args = parser.parse_args()

    root = poplib.vault_root(args.vault)
    found = poplib.find_task(root, args.task_id)
    if not found:
        print(f"Task não encontrada em nenhum projeto: {args.task_id}")
        return 1
    project, src, task_dir = found
    label = poplib.project_label(root, project)
    if src == args.stage:
        print(f"Task {args.task_id} já está em {src} ({label}).")
        return 1
    if not transition_allowed(src, args.stage) and not args.force:
        print(f"Transição não permitida: {src} → {args.stage}. "
              f"Fluxo: 001→002→003→004→005→006; retornos: 003→002, "
              f"004→002, 005→004. Use --force para exceções.")
        return 1

    card_src = task_dir / f"{args.task_id}.md"
    if card_src.is_file() and not args.force:
        meta = poplib.read_card(card_src)
        by, at = poplib.parse_claim(meta)
        if by and by != args.by and not poplib.claim_expired(at):
            print(f"OCUPADA: {args.task_id} tem claim ativo de {by} desde "
                  f"{at.isoformat(timespec='minutes')} — não mova task de "
                  f"outro agente (use --force para exceções).")
            return 1
        if (src == "001_initial_task" and args.stage == "002_planning"
                and meta.get("yolo") is not True
                and not poplib.task_released(card_src)):
            print(f"NÃO LIBERADA: {args.task_id} ainda não tem "
                  f"`- [x] Pronto para planejar` no card (seção Liberação) — "
                  f"o humano libera a saída de 001 (use --force para exceções).")
            return 1

    dest_dir = project / "kanban" / args.stage
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / args.task_id
    if dest.exists():
        print(f"Destino já existe: {dest}")
        return 1
    shutil.move(str(task_dir), str(dest))

    card = dest / f"{args.task_id}.md"
    if card.is_file():
        update_card(card, args.stage, f"{src}→{args.stage} — {args.reason}")
    else:
        print(f"[AVISO] card não encontrado para atualizar: {card}")
    print(f"OK: {args.task_id} ({label}) movida {src} → {args.stage}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
