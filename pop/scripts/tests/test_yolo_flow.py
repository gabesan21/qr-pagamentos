#!/usr/bin/env python3
"""Regressões do circuit breaker, scheduler, telemetria e entrega yolo."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
STAGES = ("001_initial_task", "002_planning", "003_human_approval",
          "004_processing", "005_verifying", "006_done")


class YoloFlowTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "vault"
        for stage in STAGES:
            (self.root / "kanban" / stage).mkdir(parents=True)

    def run_cli(self, script, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / script), *args,
             "--vault", str(self.root)], capture_output=True, text=True)

    def card(self, task, stage="003_human_approval", project="pop", **fields):
        folder = self.root / "kanban" / stage / task
        folder.mkdir(parents=True)
        data = {"id": task.split("-", 1)[0], "project": project,
                "stage": stage, "critical": "false", "yolo": "true",
                "blocked": "false", "depends_on": "[]",
                "created": "2026-07-21", "updated": "2026-07-21",
                **fields}
        text = "---\n" + "\n".join(f"{k}: {v}" for k, v in data.items())
        text += "\n---\n\n# Task\n\n## Log\n"
        path = folder / f"{task}.md"
        path.write_text(text, encoding="utf-8")
        return path

    def test_duas_devolucoes_e_terceira_aciona_circuit_breaker(self):
        task = "1.1.1-loop-yolo"
        self.card(task)
        for attempt in (1, 2):
            result = self.run_cli("pop_move.py", task, "002_planning",
                                  "--context", f"critic-{attempt}")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            card = self.root / "kanban/002_planning" / task / f"{task}.md"
            self.assertIn(f"yolo_003_returns: {attempt}", card.read_text())
            self.assertEqual(self.run_cli("pop_move.py", task,
                                          "003_human_approval").returncode, 0)
        result = self.run_cli("pop_move.py", task, "002_planning",
                              "--context", "critic-3")
        self.assertEqual(result.returncode, 1)
        card = self.root / "kanban/003_human_approval" / task / f"{task}.md"
        text = card.read_text()
        self.assertIn("circuit_breaker: true", text)
        self.assertIn("blocked: true", text)
        self.assertTrue((card.parent / f"{task}.telemetry.json").is_file())

    def test_verify_mode_full_em_critical_ou_retorno(self):
        task = "1.1.2-verify-mode"
        card = self.card(task, stage="005_verifying")
        result = self.run_cli("pop_yolo.py", "verify-mode", task)
        self.assertTrue(result.stdout.startswith("differential"))
        card.write_text(card.read_text().replace("critical: false", "critical: true"))
        result = self.run_cli("pop_yolo.py", "verify-mode", task)
        self.assertTrue(result.stdout.startswith("full"))

    def test_wave_limita_tres_e_um_por_projeto(self):
        # O meta-projeto conta como um; crie outros três escopos migrados.
        self.card("1.1.1-meta")
        for index in range(3):
            project = self.root / f"categories/a/p{index}"
            for stage in STAGES:
                (project / "pop/kanban" / stage).mkdir(parents=True)
            folder = project / "pop/kanban/002_planning" / f"2.1.{index + 1}-task"
            folder.mkdir(parents=True)
            (folder / f"2.1.{index + 1}-task.md").write_text(
                "---\nproject: a/p%d\nstage: 002_planning\nyolo: true\n"
                "blocked: false\ndepends_on: []\n---\n" % index, encoding="utf-8")
        result = self.run_cli("pop_yolo.py", "wave", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads(result.stdout)), 3)

    def test_telemetry_resume_contextos_devolucoes_e_testes(self):
        task = "1.1.3-telemetry"
        self.card(task)
        self.assertEqual(self.run_cli(
            "pop_move.py", task, "002_planning", "--context", "critic",
            "--test-seconds", "12.5").returncode, 0)
        result = self.run_cli("pop_yolo.py", "telemetry", task, "--json")
        data = json.loads(result.stdout)
        self.assertEqual(data["contexts"], 1)
        self.assertEqual(data["returns_003"], 1)
        self.assertEqual(data["test_seconds"], 12.5)


class YoloDeliveryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        self.git("init", "-b", "develop")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Test")
        (self.repo / "base.txt").write_text("base\n")
        self.git("add", ".")
        self.git("commit", "-m", "base")
        self.git("branch", "main")
        self.git("switch", "-c", "task/1.1.1-entrega")
        (self.repo / "feature.txt").write_text("ok\n")
        self.git("add", ".")
        self.git("commit", "-m", "feature")
        self.git("switch", "develop")
        for stage in STAGES:
            (self.repo / "pop/kanban" / stage).mkdir(parents=True)
        task = "1.1.1-entrega"
        folder = self.repo / "pop/kanban/006_done" / task
        folder.mkdir(parents=True)
        (folder / f"{task}.md").write_text(
            "---\nproject: app/repo\nstage: 006_done\nyolo: true\n---\n")
        self.git("add", "pop")
        self.git("commit", "-m", "harness")

    def git(self, *args):
        result = subprocess.run(["git", "-C", str(self.repo), *args],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def test_integrate_entrega_em_develop_sem_tocar_main(self):
        main_before = self.git("rev-parse", "main").stdout.strip()
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "pop_delivery.py"), "integrate",
             "1.1.1-entrega", "--repo", str(self.repo), "--vault", str(self.repo)],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.git("rev-parse", "main").stdout.strip(), main_before)
        self.assertEqual(self.git("merge-base", "--is-ancestor",
                                  "task/1.1.1-entrega", "develop").returncode, 0)


if __name__ == "__main__":
    unittest.main()
