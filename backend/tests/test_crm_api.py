"""Tests E2E pour le CRM Formation API.

Couvre:
- Health check
- CRUD Formateurs (+ cascade détachement stagiaires)
- CRUD Stagiaires + workflow Kanban (status transitions)
- Active/Closed filtering + auto-archivage
- Recherche dans dossiers clôturés
- Upload/download/delete documents
- Suppression cascade stagiaire->documents
- Stats
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-trainees.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


@pytest.fixture(scope="session")
def created_ids():
    return {"formateurs": [], "stagiaires": [], "documents": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup(client, created_ids):
    yield
    # Best-effort cleanup
    for did in created_ids["documents"]:
        try:
            client.delete(f"{API}/documents/{did}")
        except Exception:
            pass
    for sid in created_ids["stagiaires"]:
        try:
            client.delete(f"{API}/stagiaires/{sid}")
        except Exception:
            pass
    for fid in created_ids["formateurs"]:
        try:
            client.delete(f"{API}/formateurs/{fid}")
        except Exception:
            pass


# ---------- Health ----------

def test_health_root(client):
    r = client.get(f"{API}/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("service") == "CRM Formation API"
    assert data.get("status") == "ok"


# ---------- Formateurs CRUD ----------

def test_formateur_crud_full(client, created_ids):
    # CREATE
    payload = {"nom": "TESTDupont", "prenom": "Jean", "email": "jean.test@x.fr", "specialite": "Anglais"}
    r = client.post(f"{API}/formateurs", json=payload)
    assert r.status_code == 200, r.text
    f = r.json()
    assert f["nom"] == "TESTDupont"
    assert f["prenom"] == "Jean"
    assert "id" in f
    created_ids["formateurs"].append(f["id"])

    fid = f["id"]
    # LIST
    r = client.get(f"{API}/formateurs")
    assert r.status_code == 200
    assert any(x["id"] == fid for x in r.json())

    # GET single
    r = client.get(f"{API}/formateurs/{fid}")
    assert r.status_code == 200
    assert r.json()["email"] == "jean.test@x.fr"

    # UPDATE
    r = client.put(f"{API}/formateurs/{fid}", json={"specialite": "Espagnol"})
    assert r.status_code == 200
    assert r.json()["specialite"] == "Espagnol"

    # Verify persistence
    r = client.get(f"{API}/formateurs/{fid}")
    assert r.json()["specialite"] == "Espagnol"

    # DELETE
    r = client.delete(f"{API}/formateurs/{fid}")
    assert r.status_code == 200
    assert r.json().get("deleted") is True
    created_ids["formateurs"].remove(fid)

    r = client.get(f"{API}/formateurs/{fid}")
    assert r.status_code == 404


def test_formateur_required_fields(client):
    r = client.post(f"{API}/formateurs", json={"nom": "OnlyNom"})
    assert r.status_code == 422


# ---------- Stagiaires + Kanban workflow ----------

def test_stagiaire_create_with_formateur_link(client, created_ids):
    # Create formateur first
    rf = client.post(f"{API}/formateurs", json={"nom": "TESTFormateur", "prenom": "Marie"})
    assert rf.status_code == 200
    fid = rf.json()["id"]
    created_ids["formateurs"].append(fid)

    # Create stagiaire linked
    payload = {
        "nom": "TESTMartin",
        "prenom": "Paul",
        "financeur": "OPCO",
        "financeur_detail": "Atlas",
        "formation": "Anglais B1",
        "formateur_id": fid,
    }
    r = client.post(f"{API}/stagiaires", json=payload)
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["status"] == "devis_attente"
    assert s["financeur"] == "OPCO"
    assert s["formateur_id"] == fid
    assert s["formateur_nom"] == "Marie TESTFormateur"
    created_ids["stagiaires"].append(s["id"])

    # GET retrieves formateur_nom
    r = client.get(f"{API}/stagiaires/{s['id']}")
    assert r.status_code == 200
    assert r.json()["formateur_nom"] == "Marie TESTFormateur"


def test_stagiaire_required_fields(client):
    r = client.post(f"{API}/stagiaires", json={"nom": "X", "prenom": "Y"})
    assert r.status_code == 422  # missing financeur


def test_kanban_workflow_full(client, created_ids):
    # Create stagiaire
    r = client.post(f"{API}/stagiaires", json={"nom": "TESTKan", "prenom": "K", "financeur": "CPF"})
    sid = r.json()["id"]
    created_ids["stagiaires"].append(sid)

    # devis_attente -> devis_valide
    r = client.patch(f"{API}/stagiaires/{sid}/status", json={"status": "devis_valide"})
    assert r.status_code == 200
    assert r.json()["status"] == "devis_valide"

    # en_formation should set date_debut_formation
    r = client.patch(f"{API}/stagiaires/{sid}/status", json={"status": "en_formation"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "en_formation"
    assert body["date_debut_formation"] is not None

    # fin_formation should set date_fin_formation
    r = client.patch(f"{API}/stagiaires/{sid}/status", json={"status": "fin_formation"})
    assert r.status_code == 200
    body = r.json()
    assert body["date_fin_formation"] is not None

    # facture
    r = client.patch(f"{API}/stagiaires/{sid}/status", json={"status": "facture"})
    assert r.status_code == 200

    # Active list should contain it
    r = client.get(f"{API}/stagiaires/active")
    assert any(x["id"] == sid for x in r.json())

    # regle -> date_cloture set + archived
    r = client.patch(f"{API}/stagiaires/{sid}/status", json={"status": "regle"})
    assert r.status_code == 200
    body = r.json()
    assert body["date_cloture"] is not None

    # Active should NOT contain it
    r = client.get(f"{API}/stagiaires/active")
    assert not any(x["id"] == sid for x in r.json())

    # Closed SHOULD contain it
    r = client.get(f"{API}/stagiaires/closed")
    assert any(x["id"] == sid for x in r.json())


def test_invalid_status_rejected(client, created_ids):
    r = client.post(f"{API}/stagiaires", json={"nom": "TESTI", "prenom": "I", "financeur": "Privé"})
    sid = r.json()["id"]
    created_ids["stagiaires"].append(sid)
    r = client.patch(f"{API}/stagiaires/{sid}/status", json={"status": "not_a_status"})
    assert r.status_code == 422


def test_closed_search(client, created_ids):
    # Create + regler a stagiaire with searchable fields
    r = client.post(f"{API}/stagiaires", json={
        "nom": "TESTRecherche",
        "prenom": "Zorglub",
        "financeur": "OPCO",
        "financeur_detail": "UniqueTagXYZ",
        "formation": "Python avancé",
    })
    sid = r.json()["id"]
    created_ids["stagiaires"].append(sid)
    client.patch(f"{API}/stagiaires/{sid}/status", json={"status": "regle"})

    # Search by formation
    r = client.get(f"{API}/stagiaires/closed", params={"q": "Python"})
    assert r.status_code == 200
    assert any(x["id"] == sid for x in r.json())

    # Search by financeur_detail
    r = client.get(f"{API}/stagiaires/closed", params={"q": "UniqueTagXYZ"})
    assert any(x["id"] == sid for x in r.json())

    # Search by prenom
    r = client.get(f"{API}/stagiaires/closed", params={"q": "Zorglub"})
    assert any(x["id"] == sid for x in r.json())

    # No match
    r = client.get(f"{API}/stagiaires/closed", params={"q": "ZZZNoMatchString"})
    assert not any(x["id"] == sid for x in r.json())


# ---------- Cascade formateur ----------

def test_formateur_delete_detaches_stagiaires(client, created_ids):
    rf = client.post(f"{API}/formateurs", json={"nom": "TESTCascade", "prenom": "Tmp"})
    fid = rf.json()["id"]

    rs = client.post(f"{API}/stagiaires", json={
        "nom": "TESTDetach", "prenom": "D", "financeur": "OPCO", "formateur_id": fid
    })
    sid = rs.json()["id"]
    created_ids["stagiaires"].append(sid)

    r = client.delete(f"{API}/formateurs/{fid}")
    assert r.status_code == 200

    # Stagiaire still exists, formateur_id is null
    r = client.get(f"{API}/stagiaires/{sid}")
    assert r.status_code == 200
    assert r.json()["formateur_id"] is None


# ---------- Documents ----------

def test_documents_lifecycle(client, created_ids):
    rs = client.post(f"{API}/stagiaires", json={"nom": "TESTDoc", "prenom": "D", "financeur": "Privé"})
    sid = rs.json()["id"]
    created_ids["stagiaires"].append(sid)

    # Upload
    file_content = b"FAKE PDF CONTENT for test"
    files = {"file": ("devis.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {"type": "devis_signe"}
    r = client.post(f"{API}/stagiaires/{sid}/documents", files=files, data=data)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["type"] == "devis_signe"
    assert doc["original_filename"] == "devis.pdf"
    assert doc["size"] == len(file_content)
    did = doc["id"]

    # List
    r = client.get(f"{API}/stagiaires/{sid}/documents")
    assert r.status_code == 200
    assert any(x["id"] == did for x in r.json())

    # Download
    r = client.get(f"{API}/documents/{did}/download")
    assert r.status_code == 200
    assert r.content == file_content

    # Delete
    r = client.delete(f"{API}/documents/{did}")
    assert r.status_code == 200

    r = client.get(f"{API}/documents/{did}/download")
    assert r.status_code == 404


def test_stagiaire_delete_cascades_documents(client, created_ids):
    rs = client.post(f"{API}/stagiaires", json={"nom": "TESTCascadeStag", "prenom": "C", "financeur": "OPCO"})
    sid = rs.json()["id"]

    files = {"file": ("att.txt", io.BytesIO(b"hello"), "text/plain")}
    r = client.post(f"{API}/stagiaires/{sid}/documents", files=files, data={"type": "attestation"})
    did = r.json()["id"]

    r = client.delete(f"{API}/stagiaires/{sid}")
    assert r.status_code == 200

    r = client.get(f"{API}/documents/{did}/download")
    assert r.status_code == 404


# ---------- Stats ----------

def test_stats_shape(client):
    r = client.get(f"{API}/stats")
    assert r.status_code == 200
    data = r.json()
    for key in ("total", "actifs", "clotures", "by_status"):
        assert key in data
    assert isinstance(data["by_status"], dict)
    assert data["total"] == data["actifs"] + data["clotures"]
