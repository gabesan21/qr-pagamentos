#!/usr/bin/env python3
"""Regressões do contrato opt-in para coleções modulares de specs."""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent


class SpecValidationTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name) / "vault"
        (self.root / "kanban").mkdir(parents=True)
        self.specs = self.root / "specs"
        self.specs.mkdir()

    def run_validator(self):
        return subprocess.run(
            [sys.executable, str(SCRIPTS / "pop_validate.py"),
             "--vault", str(self.root)],
            capture_output=True, text=True)

    def write_spec(self, rel="contrato.md", **changes):
        values = {
            "id": Path(rel).stem,
            "project": "pop",
            "domain": Path(rel).parts[0] if len(Path(rel).parts) == 2 else "core",
            "kind": "contract",
            "status": "active",
            "implementation": "implemented",
            "origin": '"1.1"',
            "created": "2026-07-20",
            "updated": "2026-07-20",
            "supersedes": "[]",
            "superseded_by": "",
        }
        values.update(changes)
        frontmatter = "\n".join(f"{key}: {value}" for key, value in values.items())
        path = self.specs / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\n{frontmatter}\n---\n\n# Spec\n", encoding="utf-8")
        return path

    def adopt(self, *targets):
        links = "\n".join(f"- [[{target}]] — *siga para validar*." for target in targets)
        (self.specs / "INDEX.md").write_text(
            f"# Specs\n\n{links}\n", encoding="utf-8")

    def assert_invalid(self, expected):
        result = self.run_validator()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(expected, result.stdout)

    def test_aceita_colecao_valida_com_contrato_direto(self):
        self.write_spec()
        self.adopt("specs/contrato")
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_aceita_contrato_alcancavel_por_overview_de_dominio(self):
        overview = self.write_spec("pagamentos/overview.md", id="pagamentos",
                                   kind="overview")
        self.write_spec("pagamentos/cotacoes.md")
        overview.write_text(
            overview.read_text(encoding="utf-8")
            + "\n- [[pagamentos/cotacoes]] — *siga para cotar*.\n",
            encoding="utf-8")
        self.adopt("specs/pagamentos/overview")
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_colecao_sem_index_permanece_legada(self):
        (self.specs / "legada.md").write_text("# Sem frontmatter\n", encoding="utf-8")
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejeita_campos_enums_id_e_datas_invalidos(self):
        self.write_spec(id="ID ruim", status="publicada", created="20-07-2026",
                        updated="2026-07-19")
        self.adopt("specs/contrato")
        result = self.run_validator()
        self.assertEqual(result.returncode, 1)
        for expected in ("`id` inválido", "`status` inválido", "`created` inválido"):
            self.assertIn(expected, result.stdout)

    def test_rejeita_campo_obrigatorio_ausente(self):
        path = self.write_spec()
        path.write_text(path.read_text(encoding="utf-8").replace(
            "origin: \"1.1\"\n", ""), encoding="utf-8")
        self.adopt("specs/contrato")
        self.assert_invalid("frontmatter sem `origin`")

    def test_rejeita_campo_obrigatorio_vazio_e_updated_anterior(self):
        self.write_spec(origin="", created="2026-07-20", updated="2026-07-19")
        self.adopt("specs/contrato")
        result = self.run_validator()
        self.assertEqual(result.returncode, 1)
        self.assertIn("frontmatter com `origin` vazio", result.stdout)
        self.assertIn("`updated` anterior a `created`", result.stdout)

    def test_rejeita_id_duplicado(self):
        self.write_spec("um.md", id="duplicado")
        self.write_spec("dois.md", id="duplicado")
        self.adopt("specs/um", "specs/dois")
        self.assert_invalid("`id` duplicado `duplicado`")

    def test_rejeita_project_divergente(self):
        self.write_spec(project="outro")
        self.adopt("specs/contrato")
        self.assert_invalid("difere do label do escopo `pop`")

    def test_aceita_project_igual_ao_label_completo_do_escopo(self):
        project = self.root / "categories/agents/gandalf-harness"
        (project / "pop/kanban").mkdir(parents=True)
        self.specs = project / "pop/specs"
        self.specs.mkdir()
        self.write_spec(project="agents/gandalf-harness")
        self.adopt("contrato")
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejeita_dominio_divergente_da_subpasta(self):
        self.write_spec("pagamentos/contrato.md", domain="outro")
        self.adopt("specs/pagamentos/contrato")
        self.assert_invalid("`domain` `outro` difere da pasta `pagamentos`")

    def test_rejeita_pasta_profunda(self):
        self.write_spec("pagamentos/api/contrato.md", domain="pagamentos")
        self.adopt("specs/pagamentos/api/contrato")
        result = self.run_validator()
        self.assertEqual(result.returncode, 1)
        self.assertIn("profundidade inválida", result.stdout)

    def test_rejeita_spec_atual_inalcancavel(self):
        self.write_spec()
        self.adopt()
        self.assert_invalid("inalcançável por `specs/INDEX.md`")

    def test_rejeita_supersessao_inexistente(self):
        self.write_spec(status="superseded", superseded_by="nova")
        self.adopt()
        self.assert_invalid("referencia ID inexistente `nova`")

    def test_aceita_supersessao_reciproca(self):
        self.write_spec("antiga.md", status="superseded", superseded_by="nova")
        self.write_spec("nova.md", status="active", supersedes="[antiga]")
        self.adopt("specs/nova")
        result = self.run_validator()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejeita_supersessao_nao_reciproca(self):
        self.write_spec("antiga.md", status="superseded", superseded_by="nova")
        self.write_spec("nova.md", status="active")
        self.adopt("specs/nova")
        self.assert_invalid("supersessão não recíproca")


if __name__ == "__main__":
    unittest.main()
