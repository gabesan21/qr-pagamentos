#!/usr/bin/env python3
"""Testes do gate de ownership das frentes de execução."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent.parent / "pop_check_scope.py"


class PopCheckScopeTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name) / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "PoP Test")
        (self.repo / "src").mkdir()
        (self.repo / "src/model.py").write_text("MODEL = 1\n", encoding="utf-8")
        (self.repo / "README.md").write_text("base\n", encoding="utf-8")
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD").stdout.strip()

    def git(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", "-C", str(self.repo), *args],
            check=True,
            capture_output=True,
            text=True,
        )

    def check_scope(
        self, *allowed: str, denied=()
    ) -> subprocess.CompletedProcess[str]:
        command = [
            sys.executable,
            str(SCRIPT),
            "--repo",
            str(self.repo),
            "--base",
            self.base,
        ]
        for pattern in allowed:
            command.extend(["--allow", pattern])
        for pattern in denied:
            command.extend(["--deny", pattern])
        return subprocess.run(command, capture_output=True, text=True)

    def test_aceita_arquivo_modificado_e_novo_dentro_do_ownership(self):
        (self.repo / "src/model.py").write_text("MODEL = 2\n", encoding="utf-8")
        (self.repo / "src/new.py").write_text("NEW = True\n", encoding="utf-8")

        result = self.check_scope("src")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("2 caminho(s)", result.stdout)

    def test_rejeita_alteracao_fora_do_ownership(self):
        (self.repo / "README.md").write_text("mudou\n", encoding="utf-8")

        result = self.check_scope("src/**")

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("README.md", result.stdout)

    def test_aceita_glob_de_arquivo(self):
        (self.repo / "src/model.py").write_text("MODEL = 3\n", encoding="utf-8")

        result = self.check_scope("src/*.py")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_glob_simples_nao_cruza_diretorio(self):
        (self.repo / "src/deep").mkdir()
        (self.repo / "src/deep/segredo.py").write_text("SECRET = 1\n", encoding="utf-8")

        result = self.check_scope("src/*.py")

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("src/deep/segredo.py", result.stdout)

    def test_glob_duplo_cruza_diretorios(self):
        (self.repo / "src/a/b").mkdir(parents=True)
        (self.repo / "src/a/b/model.py").write_text("MODEL = 4\n", encoding="utf-8")

        result = self.check_scope("src/**/*.py")

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_deny_prevalece_sobre_allow(self):
        (self.repo / "src/generated").mkdir()
        (self.repo / "src/generated/model.py").write_text("AUTO = 1\n", encoding="utf-8")

        result = self.check_scope("src", denied=("src/generated",))

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("src/generated/model.py", result.stdout)

    def test_confere_diff_commitado_desde_a_base(self):
        (self.repo / "README.md").write_text("commit fora\n", encoding="utf-8")
        self.git("add", "README.md")
        self.git("commit", "-qm", "fora do ownership")

        result = self.check_scope("src")

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("README.md", result.stdout)

    def test_rejeita_escopo_que_escapa_do_repo(self):
        result = self.check_scope("../outro")

        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("escopo inválido", result.stderr)

    def test_rename_valida_origem_e_destino(self):
        self.git("mv", "README.md", "src/README.md")

        result = self.check_scope("src")

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("README.md", result.stdout)

    def test_rejeita_base_com_formato_de_opcao(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--repo",
                str(self.repo),
                "--base=-p",
                "--allow",
                "src",
            ],
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("ref base inválida", result.stderr)


if __name__ == "__main__":
    unittest.main()
