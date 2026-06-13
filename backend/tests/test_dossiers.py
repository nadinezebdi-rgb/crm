"""Tests for the NEW Dossiers Kanban workflow endpoints.

Covers:
- Auth required on all /api/dossiers* routes
- Create dossier (defaults: status=devis_attente, date_entree set)
- GET /active vs /closed lists
- PATCH /status: full workflow transitions + auto dates
- Search ?q= on /closed (nom/prenom/financeur_nom/formation/formateur_nom)
- PUT partial update
- Documents upload/list/download/delete
- DELETE dossier removes attached documents
- Regression: existing endpoints (sessions, apprenants, formateurs, /api/) still work
"""
import io
import os
import uuid

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


@pytest.fixture(scope="module")
def formateur_id(admin):
    """Pick an existing formateur from seed data."""
    r = admin.get(f"{API}/formateurs", timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert items, "No formateurs seeded"
    return items[0]["id"]


# --------------------------- API root / regression ---------------------------
class TestApiRoot:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["service"] == "Blade Academy API"
        assert d["version"] == "1.0.0"


# --------------------------- Existing endpoints (regression) ---------------------------
class TestRegression:
    @pytest.mark.parametrize("resource", ["sessions", "apprenants", "formateurs", "entreprises", "financeurs", "lieux"])
    def test_existing_endpoints_still_work(self, admin, resource):
        r = admin.get(f"{API}/{resource}", timeout=30)
        assert r.status_code == 200, f"{resource}: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)


# --------------------------- Auth required ---------------------------
class TestDossierAuth:
    def test_active_requires_auth(self):
        r = requests.get(f"{API}/dossiers/active", timeout=15)
        assert r.status_code == 401

    def test_closed_requires_auth(self):
        r = requests.get(f"{API}/dossiers/closed", timeout=15)
        assert r.status_code == 401

    def test_create_requires_auth(self):
        r = requests.post(f"{API}/dossiers", json={"nom": "x", "prenom": "y", "financeur_type": "CPF"}, timeout=15)
        assert r.status_code == 401


# --------------------------- Create + defaults ---------------------------
class TestDossierCreate:
    def test_create_minimal(self, admin):
        payload = {
            "nom": "TEST_Durand",
            "prenom": "TEST_Pierre",
            "financeur_type": "OPCO",
            "financeur_nom": "Atlas",
            "formation": "Scrum Master",
        }
        r = admin.post(f"{API}/dossiers", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "devis_attente"
        assert d["date_entree"]
        assert d["date_cloture"] is None
        assert d["date_debut_formation"] is None
        assert d["date_fin_formation"] is None
        assert d["nom"] == "TEST_Durand"
        assert d["formateur_nom"] is None  # no formateur_id provided
        assert "id" in d
        # cleanup
        admin.delete(f"{API}/dossiers/{d['id']}", timeout=30)

    def test_create_with_formateur(self, admin, formateur_id):
        payload = {
            "nom": "TEST_WithForm",
            "prenom": "TEST_X",
            "financeur_type": "CPF",
            "formateur_id": formateur_id,
        }
        r = admin.post(f"{API}/dossiers", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["formateur_id"] == formateur_id
        assert d["formateur_nom"], "formateur_nom must be computed"
        admin.delete(f"{API}/dossiers/{d['id']}", timeout=30)

    def test_create_invalid_financeur_type(self, admin):
        r = admin.post(f"{API}/dossiers", json={"nom": "x", "prenom": "y", "financeur_type": "INVALID"}, timeout=15)
        assert r.status_code == 422

    def test_create_missing_required(self, admin):
        r = admin.post(f"{API}/dossiers", json={"nom": "x"}, timeout=15)
        assert r.status_code == 422


# --------------------------- Workflow status transitions ---------------------------
class TestDossierWorkflow:
    def test_full_workflow(self, admin, formateur_id):
        # CREATE
        r = admin.post(f"{API}/dossiers", json={
            "nom": "TEST_Workflow", "prenom": "TEST_Flow",
            "financeur_type": "OPCO", "financeur_nom": "Atlas",
            "formation": "Scrum", "formateur_id": formateur_id,
        }, timeout=30)
        assert r.status_code == 200
        did = r.json()["id"]

        try:
            # Initial state: appears in /active
            active = admin.get(f"{API}/dossiers/active", timeout=30).json()
            assert any(d["id"] == did for d in active)
            closed = admin.get(f"{API}/dossiers/closed", timeout=30).json()
            assert not any(d["id"] == did for d in closed)

            # devis_valide
            r = admin.patch(f"{API}/dossiers/{did}/status", json={"status": "devis_valide"}, timeout=15)
            assert r.status_code == 200
            assert r.json()["status"] == "devis_valide"
            assert r.json()["date_debut_formation"] is None

            # en_formation -> date_debut auto
            r = admin.patch(f"{API}/dossiers/{did}/status", json={"status": "en_formation"}, timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["status"] == "en_formation"
            assert d["date_debut_formation"] is not None
            assert d["date_fin_formation"] is None

            # fin_formation -> date_fin auto
            r = admin.patch(f"{API}/dossiers/{did}/status", json={"status": "fin_formation"}, timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["date_fin_formation"] is not None

            # facture (no auto date)
            r = admin.patch(f"{API}/dossiers/{did}/status", json={"status": "facture"}, timeout=15)
            assert r.status_code == 200
            assert r.json()["status"] == "facture"

            # regle -> date_cloture auto, disappears from /active, appears in /closed
            r = admin.patch(f"{API}/dossiers/{did}/status", json={"status": "regle"}, timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["status"] == "regle"
            assert d["date_cloture"] is not None

            active = admin.get(f"{API}/dossiers/active", timeout=30).json()
            assert not any(x["id"] == did for x in active), "Dossier should be gone from /active"
            closed = admin.get(f"{API}/dossiers/closed", timeout=30).json()
            assert any(x["id"] == did for x in closed), "Dossier should appear in /closed"
        finally:
            admin.delete(f"{API}/dossiers/{did}", timeout=15)

    def test_invalid_status_value(self, admin):
        r = admin.post(f"{API}/dossiers", json={"nom": "x", "prenom": "y", "financeur_type": "CPF"}, timeout=30).json()
        did = r["id"]
        try:
            r = admin.patch(f"{API}/dossiers/{did}/status", json={"status": "bad"}, timeout=15)
            assert r.status_code == 422
        finally:
            admin.delete(f"{API}/dossiers/{did}", timeout=15)

    def test_status_404(self, admin):
        r = admin.patch(f"{API}/dossiers/nonexistent-id/status", json={"status": "regle"}, timeout=15)
        assert r.status_code == 404


# --------------------------- Update (partial) ---------------------------
class TestDossierUpdate:
    def test_partial_update(self, admin):
        r = admin.post(f"{API}/dossiers", json={
            "nom": "TEST_Up", "prenom": "TEST_X", "financeur_type": "Privé",
        }, timeout=30).json()
        did = r["id"]
        try:
            r = admin.put(f"{API}/dossiers/{did}", json={"telephone": "0102030405", "formation": "Excel"}, timeout=15)
            assert r.status_code == 200
            d = r.json()
            assert d["telephone"] == "0102030405"
            assert d["formation"] == "Excel"
            # untouched fields preserved
            assert d["nom"] == "TEST_Up"

            # empty payload -> 400
            r = admin.put(f"{API}/dossiers/{did}", json={}, timeout=15)
            assert r.status_code == 400
        finally:
            admin.delete(f"{API}/dossiers/{did}", timeout=15)


# --------------------------- Search on /closed ---------------------------
class TestClosedSearch:
    @pytest.fixture(scope="class")
    def closed_dossier(self, admin):
        r = admin.get(f"{API}/formateurs", timeout=30).json()
        formateur_id = r[0]["id"] if r else None
        r = admin.post(f"{API}/dossiers", json={
            "nom": "TEST_SrcZebra", "prenom": "TEST_Sasha",
            "financeur_type": "OPCO", "financeur_nom": "TEST_AtlasSearch",
            "formation": "TEST_Cybersécu", "formateur_id": formateur_id,
        }, timeout=30).json()
        did = r["id"]
        admin.patch(f"{API}/dossiers/{did}/status", json={"status": "regle"}, timeout=15)
        yield did, r.get("formateur_nom") or ""
        admin.delete(f"{API}/dossiers/{did}", timeout=15)

    def test_search_by_nom(self, admin, closed_dossier):
        did, _ = closed_dossier
        # Refetch to get formateur_nom
        all_closed = admin.get(f"{API}/dossiers/closed", timeout=30).json()
        dossier = next((d for d in all_closed if d["id"] == did), None)
        assert dossier, "Closed dossier not found"

        r = admin.get(f"{API}/dossiers/closed", params={"q": "srczebra"}, timeout=15)
        assert r.status_code == 200
        assert any(d["id"] == did for d in r.json())

    def test_search_case_insensitive(self, admin, closed_dossier):
        did, _ = closed_dossier
        r = admin.get(f"{API}/dossiers/closed", params={"q": "SASHA"}, timeout=15).json()
        assert any(d["id"] == did for d in r)

    def test_search_by_financeur_nom(self, admin, closed_dossier):
        did, _ = closed_dossier
        r = admin.get(f"{API}/dossiers/closed", params={"q": "AtlasSearch"}, timeout=15).json()
        assert any(d["id"] == did for d in r)

    def test_search_by_formation(self, admin, closed_dossier):
        did, _ = closed_dossier
        r = admin.get(f"{API}/dossiers/closed", params={"q": "Cybersécu"}, timeout=15).json()
        assert any(d["id"] == did for d in r)

    def test_search_no_match(self, admin):
        r = admin.get(f"{API}/dossiers/closed", params={"q": "zzz_no_match_xyz123"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == []


# --------------------------- Documents ---------------------------
class TestDocuments:
    def test_upload_list_download_delete(self, admin):
        r = admin.post(f"{API}/dossiers", json={
            "nom": "TEST_Docs", "prenom": "TEST_X", "financeur_type": "CPF",
        }, timeout=30).json()
        did = r["id"]

        try:
            # Upload
            files = {"file": ("devis.pdf", b"%PDF-1.4 fake content for testing", "application/pdf")}
            data = {"type": "devis_signe"}
            r = admin.post(f"{API}/dossiers/{did}/documents", files=files, data=data, timeout=30)
            assert r.status_code == 200, r.text
            doc = r.json()
            assert doc["type"] == "devis_signe"
            assert doc["original_filename"] == "devis.pdf"
            assert doc["size"] > 0
            doc_id = doc["id"]

            # List
            r = admin.get(f"{API}/dossiers/{did}/documents", timeout=15)
            assert r.status_code == 200
            assert any(d["id"] == doc_id for d in r.json())

            # Download
            r = admin.get(f"{API}/dossier-documents/{doc_id}/download", timeout=15)
            assert r.status_code == 200
            assert b"%PDF" in r.content
            cd = r.headers.get("content-disposition", "")
            assert "devis.pdf" in cd

            # Delete
            r = admin.delete(f"{API}/dossier-documents/{doc_id}", timeout=15)
            assert r.status_code == 200
            r = admin.get(f"{API}/dossier-documents/{doc_id}/download", timeout=15)
            assert r.status_code == 404
        finally:
            admin.delete(f"{API}/dossiers/{did}", timeout=15)

    def test_upload_invalid_type(self, admin):
        r = admin.post(f"{API}/dossiers", json={
            "nom": "TEST_BadType", "prenom": "TEST", "financeur_type": "CPF",
        }, timeout=30).json()
        did = r["id"]
        try:
            files = {"file": ("x.pdf", b"x", "application/pdf")}
            r = admin.post(f"{API}/dossiers/{did}/documents", files=files, data={"type": "INVALID"}, timeout=15)
            assert r.status_code == 422
        finally:
            admin.delete(f"{API}/dossiers/{did}", timeout=15)

    def test_delete_dossier_cascades_documents(self, admin):
        r = admin.post(f"{API}/dossiers", json={
            "nom": "TEST_Cascade", "prenom": "X", "financeur_type": "CPF",
        }, timeout=30).json()
        did = r["id"]
        files = {"file": ("a.pdf", b"%PDF", "application/pdf")}
        doc = admin.post(f"{API}/dossiers/{did}/documents", files=files, data={"type": "attestation"}, timeout=15).json()
        doc_id = doc["id"]
        # Delete dossier
        r = admin.delete(f"{API}/dossiers/{did}", timeout=15)
        assert r.status_code == 200
        # Document should be gone too
        r = admin.get(f"{API}/dossier-documents/{doc_id}/download", timeout=15)
        assert r.status_code == 404
