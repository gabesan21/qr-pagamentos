#!/usr/bin/env python3
"""pop_move — move uma task entre estágios do kanban.

Encontra a pasta da task em qualquer projeto/estágio, valida a transição
(001→002→003→004→005_closing; retornos 003→002, 004→002, 005_closing→004 e
005_closing→002; task `yolo: true` não crítica transita 002→004 direto, sem
rodada 003 — o 003 do yolo só existe para `critical: true`; `--force` libera
exceções), move a pasta inteira, atualiza `stage:` e `updated:` no
frontmatter do card e registra a linha no `## Log`.

O retorno `005_closing→002` é a rota de **defeito de plano**: conta como
devolução de plano (`yolo_003_returns`), não de execução.

Todo retorno saindo de `005_closing` grava `return_kind:` no card, porque a
devolução é incremental: o tipo dimensiona a emenda de plano, decide quais
frentes reentram em 004 e escolhe o modo da re-revisão. `→002` exige
`--return-kind lacuna|premissa`; `→004` assume `execucao`.

Em task yolo, o retorno saindo de `005_closing` é validado contra os
marcadores de máquina do `.verify.md` (ver poplib/[[specs/judge-dredd]]):
o último `pop-verdict` precisa existir e casar com a rota; `aprovada` é
terminal (não há re-julgamento); veredito com `pontual=true` segue a rota de
reparo dirigido, não o pop_move; devolução exige o `pop-delta` da rodada. O
retorno grava `return_base:` (HEAD do repo) e a reentrada `004→005_closing`
exige que algum caminho do delta tenha mudado desde essa base — reapresentar
ao juiz sem trabalho no delta é recusado. `--force` sobrepõe cada trava.

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
import subprocess
import sys

import poplib

RETURNS = {
    ("003_human_approval", "002_planning"),
    ("004_processing", "002_planning"),
    ("005_closing", "004_processing"),
    ("005_closing", "002_planning"),
}

# Retornos que reprovam o plano, não a execução (contador `yolo_003_returns`).
PLAN_RETURNS = {
    ("003_human_approval", "002_planning"),
    ("005_closing", "002_planning"),
}


def transition_allowed(src, dst, *, yolo_single_gate=False):
    """True se dst é o próximo estágio de src ou um retorno permitido.

    `yolo_single_gate` (task yolo não crítica) libera o salto 002→004: o
    gate único de qualidade do yolo é o do 005_closing (ver seção Yolo mode
    do WORKFLOW).
    """
    stages = poplib.STAGES
    if stages.index(dst) == stages.index(src) + 1:
        return True
    if yolo_single_gate and (src, dst) == ("002_planning", "004_processing"):
        return True
    return (src, dst) in RETURNS


def resolve_return_kind(src, dst, requested):
    """Classificação a gravar em `return_kind:`, ou (None, mensagem de erro).

    A devolução é incremental, então o tipo é obrigatório onde ele muda o que
    acontece depois: `005_closing→002` decide entre emendar o plano (`lacuna`)
    e replanejar (`premissa`), e essa escolha também define o modo da
    re-revisão. `005_closing→004` é sempre `execucao`. Nas demais transições o
    campo não se aplica — em `003→002` nada foi executado ainda.
    """
    if (src, dst) == ("005_closing", "002_planning"):
        if requested in ("lacuna", "premissa"):
            return requested, None
        return None, ("CLASSIFIQUE O RETORNO: defeito de plano exige "
                      "`--return-kind lacuna` (plano incompleto, o entregue "
                      "está correto → emenda) ou `--return-kind premissa` "
                      "(estratégia errada → replanejamento). Sem isso o 002 "
                      "não sabe o tamanho da correção (use --force para "
                      "exceções).")
    if (src, dst) == ("005_closing", "004_processing"):
        if requested in (None, "execucao"):
            return "execucao", None
        return None, (f"RETORNO INCOMPATÍVEL: `{requested}` classifica defeito "
                      "de plano e vai para 002_planning; a rota para 004 é "
                      "sempre `execucao` (use --force para exceções).")
    if requested:
        return None, (f"`--return-kind` não se aplica a {src} → {dst}: só "
                      "retornos saindo de 005_closing são classificados "
                      "(use --force para exceções).")
    return None, None


def git_head(project):
    """HEAD do repo que contém o projeto, ou None sem git."""
    try:
        out = subprocess.run(["git", "-C", str(project), "rev-parse", "HEAD"],
                             capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip() or None


def git_changed_paths(project, base):
    """Arquivos mudados desde `base` (inclui worktree), ou None sem git."""
    try:
        out = subprocess.run(
            ["git", "-C", str(project), "diff", "--name-only", base],
            capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return [line.strip() for line in out.stdout.splitlines() if line.strip()]


def verify_gate_error(task_dir, task_id, dst, return_kind):
    """Recusa de retorno 005→004/002 pelos marcadores do `.verify.md`.

    O veredito da rodada é o contrato executável do gate: sem ele o retorno é
    palpite do orquestrador. As travas cortam os bugs observados em campo
    (incidente 12.5.5/qr-pagamentos, 2026-08-05): re-julgar aprovação, rota
    completa para delta pontual e devolução sem delta.
    """
    verify = task_dir / f"{task_id}.verify.md"
    if not verify.is_file():
        return ("SEM JULGAMENTO: retorno saindo de 005_closing exige "
                f"`{verify.name}` com o veredito da rodada — juiz que reprova "
                "sem artefato não devolve (use --force para exceções).")
    verdicts, deltas = poplib.parse_verify_markers(
        verify.read_text(encoding="utf-8"))
    if not verdicts:
        return ("SEM MARCADOR DE VEREDITO: encerre a rodada no "
                f"`{verify.name}` com `<!-- pop-verdict round=<n> "
                "decision=... -->` (e `<!-- pop-delta ... -->` ao devolver) "
                "antes de mover (use --force para exceções).")
    last = verdicts[-1]
    decision = last.get("decision")
    if decision == "aprovada":
        return ("APROVAÇÃO É TERMINAL: o último pop-verdict do "
                f"`{verify.name}` aprova a task — não existe re-julgamento "
                "nem revisão independente sobre aprovação; siga para "
                "entrega/encerramento (use --force para exceções).")
    if decision == "reparo-dirigido":
        return ("REPARO DIRIGIDO EM ANDAMENTO: delta pontual não vira rota — "
                "despache o patch e colha o adendo do juiz; só o adendo que "
                "devolver autoriza mover (use --force para exceções).")
    expected = "execucao" if dst == "004_processing" else return_kind
    if decision != expected:
        return (f"VEREDITO INCOMPATÍVEL: o último pop-verdict declara "
                f"`{decision}`, mas a rota pedida é `{expected}` — rota e "
                "veredito andam juntos (use --force para exceções).")
    delta = deltas.get(last.get("round"))
    if not delta:
        return ("DEVOLUÇÃO SEM DELTA: o veredito devolve mas falta o "
                f"`<!-- pop-delta round={last.get('round')} ... -->` no "
                f"`{verify.name}` — sem delta, 002 não sabe se emenda ou "
                "replaneja e 004 não sabe o que reexecutar (use --force "
                "para exceções).")
    if decision == "execucao" and delta.get("pontual") == "true":
        return ("DELTA PONTUAL: bloqueante `pontual=true` segue a rota "
                "default de reparo dirigido (sem pop_move, sem contador); a "
                "rota completa é para defeito difuso — esgotados os 2 "
                "reparos da rodada, repita com --force e o motivo no "
                "--reason.")
    return None


def reentry_gate_error(project, task_dir, task_id, meta):
    """Recusa de reentrada 004→005 sem trabalho nos caminhos do delta.

    Só age quando há evidência completa (delta com `paths`, `return_base` e
    git disponível) — fail-open no resto: a trava existe para cortar a
    reapresentação do mesmo problema ao juiz, não para bloquear fluxo legado.
    """
    base = str(meta.get("return_base") or "").strip()
    if not base or meta.get("return_kind") not in poplib.RETURN_KINDS:
        return None
    verify = task_dir / f"{task_id}.verify.md"
    if not verify.is_file():
        return None
    _verdicts, deltas = poplib.parse_verify_markers(
        verify.read_text(encoding="utf-8"))
    if not deltas:
        return None
    last_delta = list(deltas.values())[-1]
    paths = poplib.marker_paths(last_delta)
    if not paths:
        return None
    changed = git_changed_paths(project, base)
    if changed is None:
        return None
    for path in paths:
        for touched in changed:
            if (touched == path or touched.endswith("/" + path)
                    or path.endswith("/" + touched)):
                return None
    return ("REENTRADA SEM TRABALHO NO DELTA: nenhum caminho do delta "
            f"({', '.join(paths)}) mudou desde `return_base` {base[:12]} — "
            "reapresentar ao juiz com o mesmo problema queima rodada à toa; "
            "execute o delta antes de mover (use --force para exceções).")


def update_card(card, new_stage, reason, fields=None):
    """Atualiza stage:/updated: no frontmatter e appenda no ## Log."""
    lines = card.read_text(encoding="utf-8").splitlines()
    date = poplib.today()
    fields = fields or {}
    found = set()
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                end = i
                break
            key = lines[i].split(":", 1)[0].strip()
            if key == "stage":
                lines[i] = f"stage: {new_stage}"
            elif key == "updated":
                lines[i] = f"updated: {date}"
            elif key in fields:
                lines[i] = f"{key}: {fields[key]}"
                found.add(key)
        for key, value in fields.items():
            if key not in found:
                lines.insert(end, f"{key}: {value}")
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
    parser.add_argument("--return-kind", choices=poplib.RETURN_KINDS,
                        help="classificação do retorno saindo de 005_closing: "
                             "lacuna|premissa (→002, obrigatório) ou execucao "
                             "(→004, default)")
    parser.add_argument("--context", action="append", default=[],
                        help="contexto de agente colhido neste estágio; repetível")
    parser.add_argument("--test-seconds", type=float, default=0,
                        help="tempo de testes associado à transição")
    parser.add_argument("--by", default=poplib.default_agent(),
                        help="identificador do agente (default: usuario@host; "
                             "mesmo do pop_claim)")
    parser.add_argument("--force", action="store_true",
                        help="permite transição fora do fluxo padrão e "
                             "sobrepõe claim/liberação")
    parser.add_argument("--scope", "--vault", dest="vault", metavar="DIR",
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
    card_src = task_dir / f"{args.task_id}.md"
    meta = poplib.read_card(card_src) if card_src.is_file() else {}
    yolo_single_gate = (meta.get("yolo") is True
                        and meta.get("critical") is not True)
    if (not transition_allowed(src, args.stage,
                               yolo_single_gate=yolo_single_gate)
            and not args.force):
        print(f"Transição não permitida: {src} → {args.stage}. "
              f"Fluxo: 001→002→003→004→005_closing (yolo não crítica: "
              f"002→004 direto, sem 003); retornos: 003→002, 004→002, "
              f"005_closing→004 (execução) e 005_closing→002 (defeito de "
              f"plano). Use --force para exceções.")
        return 1

    if card_src.is_file() and not args.force:
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

    return_gate = None
    if (src, args.stage) in PLAN_RETURNS:
        return_gate = "003"
    elif (src, args.stage) == ("005_closing", "004_processing"):
        return_gate = "005"

    return_kind, kind_error = resolve_return_kind(src, args.stage,
                                                  args.return_kind)
    if kind_error and not args.force:
        print(kind_error)
        return 1

    if meta.get("yolo") is True and not args.force:
        if src == "005_closing" and args.stage in ("004_processing",
                                                   "002_planning"):
            gate_error = verify_gate_error(task_dir, args.task_id,
                                           args.stage, return_kind)
            if gate_error:
                print(gate_error)
                return 1
        if (src, args.stage) == ("004_processing", "005_closing"):
            gate_error = reentry_gate_error(project, task_dir,
                                            args.task_id, meta)
            if gate_error:
                print(gate_error)
                return 1

    fields = {}
    if return_kind:
        fields["return_kind"] = return_kind
        if src == "005_closing":
            head = git_head(project)
            if head:
                fields["return_base"] = head
    if meta.get("yolo") is True and return_gate:
        key = f"yolo_{return_gate}_returns"
        try:
            attempts = int(meta.get(key) or 0)
        except (TypeError, ValueError):
            attempts = 0
        if attempts >= poplib.YOLO_RETURN_LIMIT and not args.force:
            reason = (f"circuit breaker yolo no {return_gate}: terceira "
                      "reprovação exige diagnóstico humano")
            update_card(card_src, src, reason, {
                "blocked": "true", "blocked_reason": reason,
                "circuit_breaker": "true"})
            poplib.record_telemetry(task_dir, {
                "event": "circuit_breaker", "stage": src,
                "gate": return_gate, "contexts": args.context,
                "test_seconds": args.test_seconds, "result": "blocked"})
            print(f"BLOQUEADA: {args.task_id} — {reason}.")
            return 1
        fields[key] = attempts + 1

    dest_dir = poplib.harness_root(project) / "kanban" / args.stage
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / args.task_id
    if dest.exists():
        print(f"Destino já existe: {dest}")
        return 1
    shutil.move(str(task_dir), str(dest))

    card = dest / f"{args.task_id}.md"
    if card.is_file():
        update_card(card, args.stage, f"{src}→{args.stage} — {args.reason}", fields)
        poplib.record_telemetry(dest, {
            "event": "transition", "from": src, "to": args.stage,
            "contexts": args.context, "test_seconds": args.test_seconds,
            "return_kind": return_kind,
            "result": "returned" if return_gate else "advanced"})
    else:
        print(f"[AVISO] card não encontrado para atualizar: {card}")
    print(f"OK: {args.task_id} ({label}) movida {src} → {args.stage}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
