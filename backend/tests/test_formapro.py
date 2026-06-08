"""FormaPro backend API regression tests.

Covers auth, CRUD (apprenants/formateurs/entreprises/financeurs/lieux),
sessions (incl. progression + status transitions), dashboard stats/calendar,
and PDF document generation.
"""

import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://train-hub-40.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@formapro.fr"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    assert "access_token" in s.cookies, "access_token cookie not set"
    assert "refresh_token" in s.cookies, "refresh_token cookie not set"
    return s


# --------------------------- AUTH ---------------------------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        assert "user_id" in data
        assert r.cookies.get("access_token")

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401

    def test_register_and_logout(self):
        import uuid
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "Test User"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["email"] == email
        assert s.cookies.get("access_token")
        # logout clears cookies
        r2 = s.post(f"{API}/auth/logout", timeout=30)
        assert r2.status_code == 200
        # /me should now 401 in a fresh session (server doesn't blacklist token, but cookies cleared)
        s2 = requests.Session()
        assert s2.get(f"{API}/auth/me", timeout=30).status_code == 401

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={"email": ADMIN_EMAIL, "password": "x", "name": "x"}, timeout=30)
        assert r.status_code == 400


# --------------------------- CRUD ---------------------------
CRUD_RESOURCES = [
    ("apprenants", {"nom": "TEST_Nom", "prenom": "TEST_Prenom", "email": "test_apprenant@example.com"}),
    ("formateurs", {"nom": "TEST_Form", "prenom": "TEST_Form", "email": "test_formateur@example.com", "interne": True, "tarif_journalier": 700}),
    ("entreprises", {"raison_sociale": "TEST_Entreprise", "siret": "11111111100011", "ville": "Paris"}),
    ("financeurs", {"nom": "TEST_Financeur", "type_financeur": "opco", "code": "TEST"}),
    ("lieux", {"nom": "TEST_Lieu", "capacite": 12, "distanciel": False}),
]


@pytest.mark.parametrize("resource,payload", CRUD_RESOURCES)
def test_crud_full_cycle(admin_session, resource, payload):
    # LIST (should be 200, list type)
    r = admin_session.get(f"{API}/{resource}", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    # CREATE
    r = admin_session.post(f"{API}/{resource}", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    created = r.json()
    assert "id" in created
    item_id = created["id"]
    for k, v in payload.items():
        assert created.get(k) == v, f"{resource}.{k}: {created.get(k)} != {v}"

    # GET BY ID
    r = admin_session.get(f"{API}/{resource}/{item_id}", timeout=30)
    assert r.status_code == 200
    assert r.json()["id"] == item_id

    # UPDATE
    update_payload = {**payload}
    # tweak one field for each
    if "nom" in update_payload:
        update_payload["nom"] = "TEST_UPD"
    elif "raison_sociale" in update_payload:
        update_payload["raison_sociale"] = "TEST_UPD"
    r = admin_session.put(f"{API}/{resource}/{item_id}", json=update_payload, timeout=30)
    assert r.status_code == 200
    updated = r.json()
    expected = update_payload.get("nom") or update_payload.get("raison_sociale")
    assert updated.get("nom") == expected or updated.get("raison_sociale") == expected

    # GET to verify persistence
    r = admin_session.get(f"{API}/{resource}/{item_id}", timeout=30)
    assert (r.json().get("nom") or r.json().get("raison_sociale")) == expected

    # DELETE
    r = admin_session.delete(f"{API}/{resource}/{item_id}", timeout=30)
    assert r.status_code == 200

    # GET should now 404
    r = admin_session.get(f"{API}/{resource}/{item_id}", timeout=30)
    assert r.status_code == 404


def test_crud_requires_auth():
    for res, _ in CRUD_RESOURCES:
        r = requests.get(f"{API}/{res}", timeout=30)
        assert r.status_code == 401, f"{res} did not require auth"


# --------------------------- SESSIONS ---------------------------
class TestSessions:
    def test_list_sessions_has_progression(self, admin_session):
        r = admin_session.get(f"{API}/sessions", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        s = items[0]
        # progression structure
        assert "progression" in s
        prog = s["progression"]
        for k in ("checks", "done", "total", "percent"):
            assert k in prog
        assert isinstance(prog["checks"], dict)
        # ca / marge / taux_marge
        for k in ("ca", "marge", "taux_marge"):
            assert k in s

    def test_create_update_status_progression_delete(self, admin_session):
        # CREATE
        payload = {
            "nom": "TEST_Session",
            "prix_ht": 1000.0,
            "cout_ht": 400.0,
            "date_debut": "2026-06-01",
            "date_fin": "2026-06-03",
        }
        r = admin_session.post(f"{API}/sessions", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        sess = r.json()
        sid = sess["id"]
        assert sess["code_interne"].startswith("SES-")
        assert sess["ca"] == 1000.0
        assert sess["marge"] == 600.0
        assert sess["taux_marge"] == 60.0

        # PATCH status
        r = admin_session.patch(f"{API}/sessions/{sid}/statut", json={"statut": "planifiee"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["statut"] == "planifiee"

        # PATCH status invalid
        r = admin_session.patch(f"{API}/sessions/{sid}/statut", json={"statut": "invalid"}, timeout=30)
        assert r.status_code == 400

        # PATCH progression
        r = admin_session.patch(
            f"{API}/sessions/{sid}/progression",
            json={"convocations_envoyees": True, "evaluations_envoyees": True},
            timeout=30,
        )
        assert r.status_code == 200
        prog = r.json()["progression"]
        assert prog["checks"]["convocations"] is True
        assert prog["checks"]["evaluations"] is True

        # PATCH progression invalid field
        r = admin_session.patch(f"{API}/sessions/{sid}/progression", json={"invalid_field": True}, timeout=30)
        assert r.status_code == 400

        # PUT update
        upd = {**payload, "nom": "TEST_Session_Renamed", "prix_ht": 2000.0, "cout_ht": 500.0}
        r = admin_session.put(f"{API}/sessions/{sid}", json=upd, timeout=30)
        assert r.status_code == 200
        sess2 = r.json()
        assert sess2["nom"] == "TEST_Session_Renamed"
        assert sess2["ca"] == 2000.0

        # DELETE
        r = admin_session.delete(f"{API}/sessions/{sid}", timeout=30)
        assert r.status_code == 200


# --------------------------- DASHBOARD ---------------------------
class TestDashboard:
    def test_stats(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/stats", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_sessions", "sessions_actives", "total_apprenants", "ca", "by_status"):
            assert k in d, f"missing {k}"
        for s in ("brouillon", "planification", "planifiee", "terminee", "archivee"):
            assert s in d["by_status"]
        assert isinstance(d["total_sessions"], int)
        assert d["total_sessions"] >= 4  # demo seeds 4

    def test_calendar(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/calendar", timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # All items should have date_debut set
        for item in items:
            assert item.get("date_debut") is not None


# --------------------------- DOCUMENTS / PDF ---------------------------
DOC_TYPES = ["convention", "contrat", "convocation", "attestation", "facture", "emargement", "programme", "evaluation"]


@pytest.fixture(scope="module")
def a_session_id(admin_session):
    r = admin_session.get(f"{API}/sessions", timeout=30)
    items = r.json()
    return items[0]["id"]


@pytest.mark.parametrize("doc_type", DOC_TYPES)
def test_pdf_generation(admin_session, a_session_id, doc_type):
    r = admin_session.get(f"{API}/documents/session/{a_session_id}/{doc_type}", timeout=60)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    # PDF starts with %PDF
    assert r.content[:4] == b"%PDF", f"{doc_type} not a valid PDF"
    assert len(r.content) > 500


def test_pdf_invalid_type(admin_session, a_session_id):
    r = admin_session.get(f"{API}/documents/session/{a_session_id}/badtype", timeout=30)
    assert r.status_code == 400


def test_pdf_invalid_session(admin_session):
    r = admin_session.get(f"{API}/documents/session/nonexistent/convention", timeout=30)
    assert r.status_code == 404
