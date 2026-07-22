#!/usr/bin/env python3
"""Regressões da limpeza segura de tasks concluídas do roadmap e das
modifications: `pop_roadmap.py close` remove a linha da task em
`roadmap/*.md` ou `modifications/*.md` e, na modification de task única,
remove só o wikilink da linha do `MODIFICATIONS.md`."""

import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent

TASK_R = "1.1.1-fix-concluido"      # task de roadmap (epoch 1, phase 1.1)
TASK_M = "M-1.1-ajuste-concluido"   # task de modification multi-task (M-1)
TASK_S = "M-2.1-hotfix-concluido"   # modification de task única (só no índice)

NUMERIC = re.compile(r"(?:\d+\.\d+\.\d+|M-\d+\.\d+)")


class CloseLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "vault"
        (self.root / "kanban/006_done").mkdir(parents=True)
        (self.root / "memory").mkdir(parents=True)
        (self.root / "roadmap").mkdir(parents=True)
        (self.root / "modifications").mkdir(parents=True)

    def run_cli(self, script, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / script), *args, "--vault", str(self.root)],
            capture_output=True, text=True)

    def write_card(self, task, stage="006_done"):
        numeric = NUMERIC.match(task).group(0)
        fields = {"id": numeric, "project": "pop", "stage": stage,
                  "created": "2026-07-20", "updated": "2026-07-21"}
        if numeric.startswith("M-"):
            fields.update(origin="modifications",
                          modification=numeric.rsplit(".", 1)[0])
        else:
            fields.update(origin="roadmap", epoch=numeric.split(".")[0],
                          phase=f'"{numeric.rsplit(".", 1)[0]}"')
        folder = self.root / "kanban" / stage / task
        folder.mkdir(parents=True)
        card = folder / f"{task}.md"
        card.write_text(
            "---\n" + "\n".join(f"{k}: {v}" for k, v in fields.items())
            + "\n---\n", encoding="utf-8")
        return card

    def write_memory(self, task, *, memory_task=None, commit="abc123",
                     include_pr=True):
        pr = "pr:\n" if include_pr else ""
        (self.root / "memory" / f"{task}.md").write_text(
            "---\n"
            f"task: {memory_task or task}\nproject: pop\nstarted: 2026-07-20\n"
            f"finished: 2026-07-21\ncommit: {commit}\n{pr}---\n\n# Memory\n",
            encoding="utf-8")

    def write_epoch(self):
        epoch = self.root / "roadmap/1-core.md"
        epoch.write_text(
            "# Epoch 1\n\n## Phase 1.1 — base\n\n"
            "| Task | Descrição | Status |\n|---|---|---|\n"
            f"| [[{TASK_R}]] | correção | concluída |\n"
            "| `1.1.2-aberta` | próxima | não iniciada |\n",
            encoding="utf-8")
        return epoch

    def write_modification(self):
        mod = self.root / "modifications/m-1-ajustes.md"
        mod.write_text(
            "# M-1 — ajustes\n\n"
            "| Task | Descrição | Status |\n|---|---|---|\n"
            f"| [[{TASK_M}]] | ajuste | concluída |\n"
            "| `M-1.2-aberta` | próxima | não iniciada |\n",
            encoding="utf-8")
        return mod

    def write_index(self):
        index = self.root / "MODIFICATIONS.md"
        index.write_text(
            "# Modifications\n\n"
            "| # | Modification | Descrição | Status |\n|---|---|---|---|\n"
            "| M-1 | [[modifications/m-1-ajustes\\|ajustes]] | ajustes "
            "| em andamento |\n"
            f"| M-2 | hotfix [[{TASK_S}]] | hotfix pontual | em andamento |\n",
            encoding="utf-8")
        return index


class CloseRoadmapTest(CloseLifecycleTest):
    def test_close_remove_somente_task_e_preserva_epoch_phase_e_aberta(self):
        self.write_card(TASK_R)
        self.write_memory(TASK_R)
        epoch = self.write_epoch()
        result = self.run_cli("pop_roadmap.py", "close", TASK_R)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = epoch.read_text(encoding="utf-8")
        self.assertNotIn(TASK_R, text)
        self.assertIn("# Epoch 1", text)
        self.assertIn("## Phase 1.1", text)
        self.assertIn("1.1.2-aberta", text)

    def test_close_aborta_sem_chave_pr_mas_aceita_pr_vazio(self):
        self.write_card(TASK_R)
        epoch = self.write_epoch()
        self.write_memory(TASK_R, include_pr=False)
        result = self.run_cli("pop_roadmap.py", "close", TASK_R)
        self.assertEqual(result.returncode, 1)
        self.assertIn(TASK_R, epoch.read_text(encoding="utf-8"))
        self.write_memory(TASK_R, include_pr=True)
        result = self.run_cli("pop_roadmap.py", "close", TASK_R)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class CloseModificationTest(CloseLifecycleTest):
    def test_close_multitask_remove_linha_e_preserva_modification_e_aberta(self):
        self.write_card(TASK_M)
        self.write_memory(TASK_M)
        mod = self.write_modification()
        index = self.write_index()
        before_index = index.read_bytes()
        result = self.run_cli("pop_roadmap.py", "close", TASK_M)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = mod.read_text(encoding="utf-8")
        self.assertNotIn(TASK_M, text)
        self.assertIn("# M-1 — ajustes", text)
        self.assertIn("M-1.2-aberta", text)
        # a linha da modification no índice nunca é tocada
        self.assertEqual(index.read_bytes(), before_index)

    def test_close_task_unica_remove_so_o_wikilink_do_indice(self):
        self.write_card(TASK_S)
        self.write_memory(TASK_S)
        index = self.write_index()
        result = self.run_cli("pop_roadmap.py", "close", TASK_S)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = index.read_text(encoding="utf-8")
        self.assertNotIn(f"[[{TASK_S}]]", text)
        self.assertIn(f"`{TASK_S}`", text)
        # a linha da modification permanece
        self.assertIn("| M-2 |", text)
        self.assertIn("em andamento", text)

    def test_close_aborta_sem_memory_valida_e_preserva_linha(self):
        self.write_card(TASK_M)
        self.write_memory(TASK_M, memory_task="M-1.9-outra")
        mod = self.write_modification()
        result = self.run_cli("pop_roadmap.py", "close", TASK_M)
        self.assertEqual(result.returncode, 1)
        self.assertIn(TASK_M, mod.read_text(encoding="utf-8"))

    def test_close_duplicado_aborta_sem_escrever_arquivo_algum(self):
        self.write_card(TASK_M)
        self.write_memory(TASK_M)
        mod = self.write_modification()
        duplicate = self.root / "modifications/m-9-outra.md"
        duplicate.write_text(
            "# M-9\n\n| Task | Descrição | Status |\n|---|---|---|\n"
            f"| [[{TASK_M}]] | duplicada | concluída |\n",
            encoding="utf-8")
        before_mod = mod.read_bytes()
        before_duplicate = duplicate.read_bytes()
        result = self.run_cli("pop_roadmap.py", "close", TASK_M)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(mod.read_bytes(), before_mod)
        self.assertEqual(duplicate.read_bytes(), before_duplicate)


class ResidualValidationTest(CloseLifecycleTest):
    def test_validator_acusa_residuo_no_roadmap(self):
        self.write_card(TASK_R)
        self.write_memory(TASK_R)
        self.write_epoch()
        result = self.run_cli("pop_validate.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("task concluída residual", result.stdout)

    def test_validator_acusa_residuo_em_modifications(self):
        self.write_card(TASK_M)
        self.write_memory(TASK_M)
        self.write_modification()
        result = self.run_cli("pop_validate.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn(TASK_M, result.stdout)

    def test_validator_acusa_residuo_de_wikilink_no_indice(self):
        self.write_card(TASK_S)
        self.write_memory(TASK_S)
        self.write_index()
        result = self.run_cli("pop_validate.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn(TASK_S, result.stdout)

    def test_validator_nao_acusa_task_aberta_sem_memory(self):
        self.write_card(TASK_R)
        self.write_epoch()
        self.write_modification()
        self.write_index()
        result = self.run_cli("pop_validate.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class WorktreeConsumerTest(CloseLifecycleTest):
    def test_pop_worktree_consumidor_recusa_meta_pop_e_mostra_main(self):
        self.write_card(TASK_R)
        route = self.run_cli("pop_worktree.py", "route", TASK_R)
        self.assertEqual(route.returncode, 0, route.stdout + route.stderr)
        self.assertIn("worktree=não", route.stdout)
        self.assertIn("integration_branch=main", route.stdout)
        add = self.run_cli("pop_worktree.py", "add", TASK_R)
        self.assertEqual(add.returncode, 1)
        self.assertIn("direto em main", add.stdout)
        self.assertFalse((self.root / "worktrees").exists())

    def test_pop_worktree_consumidor_expoe_yolo_develop_para_main(self):
        project = self.root / "categories/applications/exemplo"
        task = "1.1.1-yolo-externa"
        card = project / "pop/kanban/004_processing" / task / f"{task}.md"
        card.parent.mkdir(parents=True)
        card.write_text(
            "---\nid: 1.1.1\nproject: applications/exemplo\n"
            "stage: 004_processing\nyolo: true\ncreated: 2026-07-21\n"
            "updated: 2026-07-21\n---\n", encoding="utf-8")
        route = self.run_cli("pop_worktree.py", "route", task)
        self.assertEqual(route.returncode, 0, route.stdout + route.stderr)
        self.assertIn("worktree=sim", route.stdout)
        self.assertIn("integration_branch=develop", route.stdout)
        self.assertIn("target_branch=main", route.stdout)
        self.assertIn("merge_owner=user", route.stdout)


if __name__ == "__main__":
    unittest.main()
