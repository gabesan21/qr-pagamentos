#!/usr/bin/env python3
"""Testes da anatomia `pop/` estrita dos scripts do PoP.

Só a anatomia nova (harness em `pop/`) é reconhecida; a legada (harness na
raiz do projeto, conteúdo em `project/`) é violação. Fixture: mini-vault em
TemporaryDirectory com meta-projeto na raiz, projeto novo e repo embutido novo
(full-multi-repo). Só stdlib.

Uso:
    python3 -m unittest discover -s scripts/tests -v   (da raiz do vault)
"""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent
VAULT = SCRIPTS.parent
# O poplib do PoP sombreia o da stdlib: garante que importamos o certo.
sys.modules.pop("poplib", None)
sys.path.insert(0, str(SCRIPTS))
import poplib  # noqa: E402

assert hasattr(poplib, "discover_projects"), "importou o poplib errado (stdlib)"


def make_kanban(base: Path) -> None:
    for stage in poplib.STAGES:
        (base / stage).mkdir(parents=True)


def release_card(card: Path) -> None:
    """Marca a liberação humana e um size válido no card recém-criado."""
    text = card.read_text(encoding="utf-8")
    text = text.replace("- [ ] Pronto para planejar", "- [x] Pronto para planejar")
    text = text.replace("size: S | M | L", "size: S")
    card.write_text(text, encoding="utf-8")


class StrictAnatomyTest(unittest.TestCase):
    """Mini-vault com os 3 escopos válidos: meta, novo, embutido novo."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name) / "vault"
        make_kanban(self.root / "kanban")                                # meta
        shutil.copytree(VAULT / "_templates", self.root / "_templates")
        make_kanban(self.root / "categories/a/novo/pop/kanban")          # novo
        make_kanban(self.root / "categories/a/fmr/repo1/pop/kanban")     # fmr novo

    def run_script(self, script, *args):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / script), *args,
             "--vault", str(self.root)],
            capture_output=True, text=True)

    def test_discover_projects_acha_os_3_escopos_sem_duplicata(self):
        scopes = poplib.discover_projects(self.root)
        expected = sorted([
            self.root,
            self.root / "categories/a/novo",
            self.root / "categories/a/fmr/repo1",
        ])
        self.assertEqual(scopes, expected)
        self.assertEqual(len(scopes), len(set(scopes)))

    def test_roundtrip_label_dir(self):
        for label in ("a/novo", "a/fmr/repo1"):
            path = poplib.project_dir(self.root, label)
            self.assertTrue((poplib.harness_root(path) / "kanban").is_dir(),
                            f"{label}: {path} sem kanban")
            self.assertEqual(poplib.project_label(self.root, path), label)
        self.assertEqual(poplib.project_dir(self.root, "pop"), self.root)
        self.assertEqual(poplib.project_label(self.root, self.root), "pop")

    def test_pop_task_cria_card_na_anatomia_pop(self):
        for label, rel in (
                ("a/novo", "categories/a/novo/pop/kanban"),
                ("a/fmr/repo1", "categories/a/fmr/repo1/pop/kanban")):
            task_id = f"1.1.{hash(label) % 9 + 1}-task-{label.replace('/', '-')}"
            result = self.run_script("pop_task.py", label, task_id)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            card = (self.root / rel / "001_initial_task" / task_id
                    / f"{task_id}.md")
            self.assertTrue(card.is_file(), f"card ausente: {card}")

    def test_pop_move_001_para_002(self):
        label, rel, task_id = (
            "a/novo", "categories/a/novo/pop/kanban", "2.1.1-move-novo")
        self.assertEqual(
            self.run_script("pop_task.py", label, task_id).returncode, 0)
        card = (self.root / rel / "001_initial_task" / task_id
                / f"{task_id}.md")
        release_card(card)
        result = self.run_script("pop_move.py", task_id, "002_planning")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(
            (self.root / rel / "002_planning" / task_id).is_dir())
        self.assertFalse(
            (self.root / rel / "001_initial_task" / task_id).exists())

    def test_pop_validate_exit_0_na_fixture(self):
        # com cards vivos na anatomia pop/, inclusive um já movido para 002
        self.assertEqual(
            self.run_script("pop_task.py", "a/novo", "3.1.1-val-novo")
            .returncode, 0)
        release_card(self.root / "categories/a/novo/pop/kanban"
                     / "001_initial_task" / "3.1.1-val-novo"
                     / "3.1.1-val-novo.md")
        self.assertEqual(
            self.run_script("pop_move.py", "3.1.1-val-novo", "002_planning")
            .returncode, 0)
        result = self.run_script("pop_validate.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_pop_validate_nao_avisa_link_estagio_irmao(self):
        # card em 001 linka `.plan/.approval/.verify` (do template) que só
        # nascem ao avançar — link de navegação esperado, não deve virar aviso.
        self.assertEqual(
            self.run_script("pop_task.py", "a/novo", "4.1.1-links-estagio")
            .returncode, 0)
        release_card(self.root / "categories/a/novo/pop/kanban"
                     / "001_initial_task" / "4.1.1-links-estagio"
                     / "4.1.1-links-estagio.md")
        result = self.run_script("pop_validate.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("4.1.1-links-estagio.plan", result.stdout)
        self.assertNotIn("4.1.1-links-estagio.approval", result.stdout)
        self.assertNotIn("4.1.1-links-estagio.verify", result.stdout)

    def test_pop_validate_rejeita_anatomia_legada(self):
        # harness na raiz da pasta (kanban/ legado) => violação, exit 1
        make_kanban(self.root / "categories/a/legado/kanban")
        result = self.run_script("pop_validate.py")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("anatomia legada", result.stdout)
        self.assertIn("categories/a/legado/kanban", result.stdout)

    def test_pop_validate_ignora_scaffold_sem_harness(self):
        # pasta só com `project/` e sem harness = scaffold ainda-não-importado,
        # não é projeto do PoP => NÃO é violação de anatomia (caso nautt-v2).
        (self.root / "categories/a/scaffold/project").mkdir(parents=True)
        (self.root / "categories/a/scaffold/.gitignore").write_text(
            "project/*\n", encoding="utf-8")
        result = self.run_script("pop_validate.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class IncludedInstallV2Test(unittest.TestCase):
    """Instalação included v2 (harness_root=pop) num repo temporário."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.target = Path(self._tmp.name) / "repo"
        self.target.mkdir()
        (self.target / ".gitignore").write_text("node_modules/\n",
                                                encoding="utf-8")

    def test_instala_layout_pop_e_valida_standalone(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "pop_install_included.py"),
             str(self.target)],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        pop = self.target / "pop"
        for rel in ("WORKFLOW.md", "TYPES.md", "INBOX.md",
                    ".included-harness.json", "scripts/pop_validate.py",
                    "_templates/TASK.md", "kanban/001_initial_task/.gitkeep",
                    "worktrees/.gitkeep"):
            self.assertTrue((pop / rel).exists(), f"faltou pop/{rel}")
        # skills, AGENTS.md e CLAUDE.md ficam na raiz do repo
        self.assertTrue(
            (self.target / ".agents/skills/new-task/SKILL.md").is_file())
        self.assertTrue((self.target / "AGENTS.md").is_file())
        self.assertTrue((self.target / "CLAUDE.md").is_symlink())
        gitignore = (self.target / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("pop/worktrees/*", gitignore)
        self.assertIn("!pop/worktrees/.gitkeep", gitignore)

        # pop_validate --standalone rodando DE DENTRO do repo (exercita
        # vault_root com scripts em pop/scripts, sem --vault)
        result = subprocess.run(
            [sys.executable, str(pop / "scripts" / "pop_validate.py"),
             "--standalone"],
            capture_output=True, text=True, cwd=self.target)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("standalone válido", result.stdout)


if __name__ == "__main__":
    unittest.main()
