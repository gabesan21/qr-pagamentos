#!/usr/bin/env python3
"""Regressões da limpeza segura de tasks concluídas do roadmap."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import poplib

SCRIPTS = Path(__file__).resolve().parent.parent


class RoadmapLifecycleTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "vault"
        self.task = "0.1.1-fix-concluido"
        self.epoch = self.root / "roadmap/0-manutencao.md"
        self.card = self.root / "kanban/006_done" / self.task / f"{self.task}.md"
        self.memory = self.root / "memory" / f"{self.task}.md"
        self.card.parent.mkdir(parents=True)
        self.memory.parent.mkdir(parents=True)
        self.epoch.parent.mkdir(parents=True)
        self.card.write_text(
            f"---\nid: 0.1.1\nproject: pop\nstage: 006_done\n"
            "created: 2026-07-21\nupdated: 2026-07-21\n---\n",
            encoding="utf-8")
        self.epoch.write_text(
            "# Epoch 0\n\n## Phase 0.1 — manutenção\n\n"
            "| Task | Descrição | Status |\n|---|---|---|\n"
            f"| [[{self.task}]] | correção | concluída |\n"
            "| `0.1.2-aberta` | próxima | não iniciada |\n",
            encoding="utf-8")

    def run_cli(self, script, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / script), *args, "--vault", str(self.root)],
            capture_output=True, text=True)

    def write_memory(self, *, task=None, commit="abc123", include_pr=True):
        task = task or self.task
        pr = "pr:\n" if include_pr else ""
        self.memory.write_text(
            "---\n"
            f"task: {task}\nproject: pop\nstarted: 2026-07-20\n"
            f"finished: 2026-07-21\ncommit: {commit}\n{pr}---\n\n# Memory\n",
            encoding="utf-8")

    def test_close_remove_somente_task_e_preserva_epoch_phase_e_aberta(self):
        self.write_memory()
        result = self.run_cli("pop_roadmap.py", "close", self.task)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        text = self.epoch.read_text(encoding="utf-8")
        self.assertNotIn(self.task, text)
        self.assertIn("# Epoch 0", text)
        self.assertIn("## Phase 0.1", text)
        self.assertIn("0.1.2-aberta", text)

    def test_close_aborta_sem_memory_valida_e_preserva_linha(self):
        self.write_memory(task="0.1.9-outra")
        result = self.run_cli("pop_roadmap.py", "close", self.task)
        self.assertEqual(result.returncode, 1)
        self.assertIn(self.task, self.epoch.read_text(encoding="utf-8"))

    def test_close_aborta_sem_chave_pr_mas_aceita_pr_vazio(self):
        self.write_memory(include_pr=False)
        result = self.run_cli("pop_roadmap.py", "close", self.task)
        self.assertEqual(result.returncode, 1)
        self.assertIn(self.task, self.epoch.read_text(encoding="utf-8"))
        self.write_memory(include_pr=True)
        result = self.run_cli("pop_roadmap.py", "close", self.task)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_close_duplicado_aborta_sem_escrever_qualquer_epoch(self):
        self.write_memory()
        duplicate = self.root / "roadmap/1-outra.md"
        duplicate.write_text(
            f"# Epoch 1\n\n## Phase 1.1\n\n| Task | Descrição | Status |\n"
            f"|---|---|---|\n| [[{self.task}]] | duplicada | concluída |\n",
            encoding="utf-8")
        before_epoch = self.epoch.read_bytes()
        before_duplicate = duplicate.read_bytes()
        result = self.run_cli("pop_roadmap.py", "close", self.task)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.epoch.read_bytes(), before_epoch)
        self.assertEqual(duplicate.read_bytes(), before_duplicate)

    def test_validator_acusa_residuo_com_memory(self):
        self.write_memory()
        result = self.run_cli("pop_validate.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("task concluída residual", result.stdout)

    def test_validator_nao_acusa_task_aberta_sem_memory(self):
        result = self.run_cli("pop_validate.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_pop_worktree_consumidor_recusa_meta_pop_e_mostra_main(self):
        route = self.run_cli("pop_worktree.py", "route", self.task)
        self.assertEqual(route.returncode, 0, route.stdout + route.stderr)
        self.assertIn("worktree=não", route.stdout)
        self.assertIn("integration_branch=main", route.stdout)
        add = self.run_cli("pop_worktree.py", "add", self.task)
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
