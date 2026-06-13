"""Tests for the NEW endpoints in iteration 3:
- DELETE /api/dossiers-admin/clear?scope=all|active|closed
- POST /api/dossiers-admin/import-edof (multipart)
- Auto-seeded formateurs NEO FORMATION / HIGH SKILLS / VIRGINIA DERFEUIL
"""
import io
import os

import pytest
import requests

BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].splitlines()[0]
).rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@blade-academy.fr"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


# --------------------------- Seeded formateurs ---------------------------
class TestSeededFormateurs:
    """Iteration 3 must auto-seed: NEO FORMATION / HIGH SKILLS / VIRGINIA DERFEUIL."""

    def test_three_required_formateurs_present(self, admin):
        r = admin.get(f"{API}/formateurs", timeout=30)
        assert r.status_code == 200
        items = r.json()
        # Build a normalised "PRENOM NOM" set for lookup
        names = {f"{(it.get('prenom') or '').strip().upper()} {(it.get('nom') or '').strip().upper()}".strip() for it in items}
        required = {"NEO FORMATION", "HIGH SKILLS", "VIRGINIA DERFEUIL"}
        missing = required - names
        assert not missing, f"Missing seeded formateurs: {missing}. Found: {names}"


# --------------------------- Auth required ---------------------------
class TestAdminAuthRequired:
    def test_clear_requires_auth(self):
        r = requests.delete(f"{API}/dossiers-admin/clear?scope=all", timeout=15)
        assert r.status_code == 401, r.text

    def test_import_requires_auth(self):
        files = {"file": ("x.csv", b"Nom;Prenom\nA;B\n", "text/csv")}
        r = requests.post(f"{API}/dossiers-admin/import-edof", files=files, timeout=15)
        assert r.status_code == 401, r.text


# --------------------------- Clear scopes ---------------------------
def _csv_bytes(rows):
    header = "Nom;Prénom;Date de naissance;Adresse;Email;Téléphone;Intitulé de la formation;Date de début;Date de fin"
    body = "\n".join(";".join(r) for r in rows)
    return (header + "\n" + body + "\n").encode("utf-8")


def _virginia_id(admin):
    r = admin.get(f"{API}/formateurs", timeout=15)
    for f in r.json():
        if (f.get("prenom") or "").upper() == "VIRGINIA" and (f.get("nom") or "").upper() == "DERFEUIL":
            return f["id"]
    return None


class TestClearScopes:
    def test_clear_all_then_import_then_scope_active(self, admin):
        # Reset state — clear all dossiers
        r = admin.delete(f"{API}/dossiers-admin/clear?scope=all", timeout=30)
        assert r.status_code == 200
        # Verify empty
        r = admin.get(f"{API}/dossiers/active", timeout=15)
        assert r.status_code == 200 and r.json() == []
        r = admin.get(f"{API}/dossiers/closed", timeout=15)
        assert r.status_code == 200 and r.json() == []

        # Import 3 dossiers
        csv = _csv_bytes([
            ["TESTA", "Alice", "12/03/1990", "10 rue A, Paris", "a@x.fr", "0102030405", "ANGLAIS B1", "01/02/2026", "01/03/2026"],
            ["TESTB", "Bob",   "05/07/1985", "20 rue B, Lyon",  "b@x.fr", "0203040506", "ANGLAIS A2", "02/02/2026", "02/03/2026"],
            ["TESTC", "Carol", "22/11/1992", "30 rue C, Lille", "c@x.fr", "0304050607", "ANGLAIS B2", "03/02/2026", "03/03/2026"],
        ])
        files = {"file": ("edof.csv", csv, "text/csv")}
        data = {"default_financeur": "CPF", "default_formation": "ANGLAIS", "default_formateur_id": _virginia_id(admin) or ""}
        r = admin.post(f"{API}/dossiers-admin/import-edof", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["created"] == 3
        assert body["total_rows"] == 3
        assert body["skipped"] == []
        m = body["mapping_detected"]
        # All 9 EDOF fields auto-mapped
        for k in ["nom", "prenom", "date_naissance", "adresse", "email", "telephone", "formation", "date_debut", "date_fin"]:
            assert m.get(k), f"Mapping for {k} is None: {m}"
        assert "columns" in body

        # Verify dossiers exist + fields properly populated
        r = admin.get(f"{API}/dossiers/active", timeout=15)
        items = r.json()
        assert len(items) == 3
        sample = next(d for d in items if d["nom"] == "TESTA")
        assert sample["prenom"] == "Alice"
        assert sample["date_naissance"] == "1990-03-12"
        assert sample["adresse"] == "10 rue A, Paris"
        assert sample["email"] == "a@x.fr"
        assert sample["telephone"] == "0102030405"
        assert sample["formation"] == "ANGLAIS B1"
        assert sample["date_debut_formation"] == "2026-02-01"
        assert sample["date_fin_formation"] == "2026-03-01"
        assert sample["financeur_type"] == "CPF"
        assert sample["status"] == "devis_attente"
        # formateur_nom is the seeded VIRGINIA DERFEUIL (order may vary in attach)
        assert sample.get("formateur_nom") and "VIRGINIA" in sample["formateur_nom"].upper()

        # Move one to "regle" to simulate archive
        rid = sample["id"]
        # Walk status forward
        for s in ["devis_valide", "en_formation", "fin_formation", "facture", "regle"]:
            rr = admin.patch(f"{API}/dossiers/{rid}/status", json={"status": s}, timeout=15)
            assert rr.status_code == 200

        # scope=active must delete the 2 remaining actives, preserve the closed
        r = admin.delete(f"{API}/dossiers-admin/clear?scope=active", timeout=30)
        assert r.status_code == 200
        assert r.json()["deleted"] == 2
        r = admin.get(f"{API}/dossiers/active", timeout=15)
        assert r.json() == []
        r = admin.get(f"{API}/dossiers/closed", timeout=15)
        assert len(r.json()) == 1

        # scope=closed must delete the archive
        r = admin.delete(f"{API}/dossiers-admin/clear?scope=closed", timeout=30)
        assert r.status_code == 200
        assert r.json()["deleted"] == 1
        r = admin.get(f"{API}/dossiers/closed", timeout=15)
        assert r.json() == []


# --------------------------- Import validation errors ---------------------------
class TestImportValidation:
    def test_invalid_default_formateur(self, admin):
        csv = _csv_bytes([["X", "Y", "", "", "", "", "ANGLAIS", "", ""]])
        files = {"file": ("e.csv", csv, "text/csv")}
        data = {"default_financeur": "CPF", "default_formation": "ANGLAIS", "default_formateur_id": "does-not-exist-xyz"}
        r = admin.post(f"{API}/dossiers-admin/import-edof", files=files, data=data, timeout=30)
        assert r.status_code == 400
        assert "formateur" in r.text.lower()

    def test_file_too_large(self, admin):
        big = b"Nom;Prenom\n" + (b"A;B\n" * 5_000_000)  # > 15 MB
        assert len(big) > 15 * 1024 * 1024
        files = {"file": ("big.csv", big, "text/csv")}
        data = {"default_financeur": "CPF", "default_formation": "ANGLAIS"}
        r = admin.post(f"{API}/dossiers-admin/import-edof", files=files, data=data, timeout=60)
        assert r.status_code == 400
        assert "volumineux" in r.text.lower()

    def test_missing_nom_prenom_columns(self, admin):
        csv = b"Email;Telephone\nx@x.fr;0102030405\n"
        files = {"file": ("bad.csv", csv, "text/csv")}
        data = {"default_financeur": "CPF", "default_formation": "ANGLAIS"}
        r = admin.post(f"{API}/dossiers-admin/import-edof", files=files, data=data, timeout=15)
        assert r.status_code == 400
        body = r.text.lower()
        assert "nom" in body and "prenom" in body.replace("é", "e")

    def test_rows_without_nom_or_prenom_skipped(self, admin):
        # Cleanup first
        admin.delete(f"{API}/dossiers-admin/clear?scope=all", timeout=30)
        csv_text = (
            "Nom;Prénom;Email\n"
            "DUPONT;Jean;jean@x.fr\n"
            ";Pierre;p@x.fr\n"      # missing nom -> skipped
            "MARTIN;;m@x.fr\n"      # missing prenom -> skipped
            "DURAND;Sophie;s@x.fr\n"
        ).encode("utf-8")
        files = {"file": ("e.csv", csv_text, "text/csv")}
        data = {"default_financeur": "CPF", "default_formation": "ANGLAIS"}
        r = admin.post(f"{API}/dossiers-admin/import-edof", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["created"] == 2
        assert body["total_rows"] == 4
        assert len(body["skipped"]) == 2
        # Cleanup
        admin.delete(f"{API}/dossiers-admin/clear?scope=all", timeout=30)


# --------------------------- Excel format ---------------------------
class TestImportXlsx:
    def test_import_xlsx(self, admin):
        admin.delete(f"{API}/dossiers-admin/clear?scope=all", timeout=30)
        try:
            from openpyxl import Workbook
        except ImportError:
            pytest.skip("openpyxl not installed")
        wb = Workbook()
        ws = wb.active
        ws.append(["Nom", "Prénom", "Date de naissance", "Email"])
        ws.append(["XLSX1", "Anna", "01/01/1990", "anna@x.fr"])
        ws.append(["XLSX2", "Bruno", "02/02/1991", "bruno@x.fr"])
        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        files = {"file": ("e.xlsx", bio.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        data = {"default_financeur": "OPCO", "default_formation": "ANGLAIS"}
        r = admin.post(f"{API}/dossiers-admin/import-edof", files=files, data=data, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["created"] == 2
        items = admin.get(f"{API}/dossiers/active", timeout=15).json()
        assert all(d["financeur_type"] == "OPCO" for d in items)
        assert all(d["formation"] == "ANGLAIS" for d in items)
        admin.delete(f"{API}/dossiers-admin/clear?scope=all", timeout=30)
