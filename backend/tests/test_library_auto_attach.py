"""Tests pour l'auto-rattachement PDF facture → apprenant.

Couvre :
  - POST /api/library/upload avec auto-rattachement immédiat
  - POST /api/library/auto-attach (bulk)
  - GET /api/apprenants/{id}/documents (merge library + apprenant_documents)
  - GET /api/library (champ apprenant)
  - GET /api/library?scope=unattached (filtre apprenant_id en plus de dossier_id)
  - PATCH /api/library/{id}/attach-apprenant et /detach-apprenant
  - Normalisation des n° factures (importée directement)
"""
import io
import os
import sys
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

# Permet d'importer le module library pour tester _normalize_invoice_number
sys.path.insert(0, "/app/backend")
from routes.library import _normalize_invoice_number  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-trainees.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "blade_academy")

ADMIN_EMAIL = "admin@blade-academy.fr"
ADMIN_PASSWORD = "admin123"

# Marqueur unique pour identifier et nettoyer les données de test
TEST_TAG = f"TESTAA{uuid.uuid4().hex[:6].upper()}"


# Minimal valid PDF (1 page, ~600 bytes)
def _make_pdf_bytes() -> bytes:
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000100 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF"
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def session_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="session")
def seeded(mongo, session_client):
    """Crée 1 apprenant + 1 facture_cpf liée par dossier_cpf, et un 2e apprenant pour test orphelin."""
    # Apprenant principal
    dossier_cpf = f"CPF-{TEST_TAG}-001"
    numero_facture = f"BA-{TEST_TAG[-4:]}99"   # ex. "BA-A1B299"  (sera unparseable car trop de lettres)
    # On veut un format normalisable -> lettres puis chiffres uniquement
    numero_facture = f"BA-9{TEST_TAG[-3:]}"    # ex. "BA-9F2A" -> mauvais. Forçons des chiffres :
    numero_facture = f"BA-{int(time.time()) % 10000:04d}9"  # ex BA-12349, 5 chiffres, OK

    r = session_client.post(
        f"{BASE_URL}/api/apprenants",
        json={
            "nom": f"{TEST_TAG}_NOM",
            "prenom": "Auto",
            "email": f"{TEST_TAG.lower()}@test.example",
            "dossier_cpf": dossier_cpf,
        },
        timeout=15,
    )
    assert r.status_code in (200, 201), r.text
    apprenant = r.json()
    apprenant_id = apprenant["id"]

    # Facture CPF (insert direct car endpoint = XLSX import only)
    facture_id = str(uuid.uuid4())
    mongo.factures_cpf.insert_one({
        "id": facture_id,
        "numero_facture": numero_facture,
        "numero_dossier": dossier_cpf,
        "montant": 1500.0,
        "date_emission": "2026-01-01",
        "statut_reglement": "PAYEE",
        "_test_tag": TEST_TAG,
    })

    # Facture orpheline (existe en CPF mais dossier_cpf inconnu)
    orphan_num = f"OR-{int(time.time()) % 9000 + 1000}"
    mongo.factures_cpf.insert_one({
        "id": str(uuid.uuid4()),
        "numero_facture": orphan_num,
        "numero_dossier": f"GHOST-{TEST_TAG}",
        "montant": 200.0,
        "_test_tag": TEST_TAG,
    })

    info = {
        "apprenant_id": apprenant_id,
        "dossier_cpf": dossier_cpf,
        "numero_facture": numero_facture,
        "orphan_facture": orphan_num,
    }
    yield info

    # Teardown
    mongo.factures_cpf.delete_many({"_test_tag": TEST_TAG})
    mongo.dossier_documents.delete_many({"original_filename": {"$regex": f"^{TEST_TAG}|{numero_facture}|{orphan_num}"}})
    session_client.delete(f"{BASE_URL}/api/apprenants/{apprenant_id}")


# ---------------------------------------------------------------------------
# 1) Normalisation
# ---------------------------------------------------------------------------

class TestNormalizer:
    def test_canonical_variants_match(self):
        # Variantes décrites dans la spec (sans '.' ni '/' car Path.stem mange l'extension)
        variants = ["BA-1077.pdf", "B-A1077.pdf", "BA1077.pdf", "BA 1077.pdf", "ba_1077.pdf"]
        keys = [_normalize_invoice_number(v) for v in variants]
        assert all(k == "BA1077" for k in keys), f"Got {keys}"

    def test_non_invoice_filenames_return_none(self):
        assert _normalize_invoice_number("Rapport_Dossiers.xlsx") is None
        assert _normalize_invoice_number("document.pdf") is None
        assert _normalize_invoice_number("Facture-BA-1077.pdf") is None  # préfixe non standard
        assert _normalize_invoice_number("") is None
        assert _normalize_invoice_number(None) is None

    def test_too_few_digits(self):
        assert _normalize_invoice_number("BA-12.pdf") is None  # 2 chiffres < 3 minimum

    def test_with_extension_stripped(self):
        assert _normalize_invoice_number("XY-12345.pdf") == "XY12345"


# ---------------------------------------------------------------------------
# 2) Auto-rattachement à l'upload
# ---------------------------------------------------------------------------

class TestUploadAutoAttach:
    def test_upload_auto_attaches_when_facture_matches(self, session_client, seeded):
        num = seeded["numero_facture"]  # ex "BA-12349"
        filename = f"{num}.pdf"
        files = {"file": (filename, _make_pdf_bytes(), "application/pdf")}
        data = {"type": "facture"}
        r = session_client.post(f"{BASE_URL}/api/library/upload", files=files, data=data, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("apprenant_id") == seeded["apprenant_id"], doc
        assert doc.get("auto_attached") is True
        meta = doc.get("auto_attach_meta") or {}
        assert meta.get("numero_facture") == num
        assert meta.get("numero_dossier") == seeded["dossier_cpf"]
        # Champ apprenant enrichi
        assert doc.get("apprenant") and doc["apprenant"]["id"] == seeded["apprenant_id"]

    def test_upload_variant_filename_normalizes(self, session_client, seeded):
        """Le même n° mais sous forme 'BA12349.pdf' (sans tiret) doit aussi matcher."""
        num = seeded["numero_facture"].replace("-", "")
        filename = f"{num}.pdf"
        files = {"file": (filename, _make_pdf_bytes(), "application/pdf")}
        data = {"type": "facture"}
        r = session_client.post(f"{BASE_URL}/api/library/upload", files=files, data=data, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("apprenant_id") == seeded["apprenant_id"], doc

    def test_upload_unparseable_filename_no_attach(self, session_client, seeded):
        filename = f"{TEST_TAG}_random_document.pdf"
        files = {"file": (filename, _make_pdf_bytes(), "application/pdf")}
        data = {"type": "facture"}
        r = session_client.post(f"{BASE_URL}/api/library/upload", files=files, data=data, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("apprenant_id") in (None, ""), doc
        assert not doc.get("auto_attached")


# ---------------------------------------------------------------------------
# 3) Bulk auto-attach
# ---------------------------------------------------------------------------

class TestBulkAutoAttach:
    def test_bulk_report_structure(self, session_client, seeded):
        # Pré-uploads non rattachés : OK, orphelin, unparseable, xlsx.
        # IMPORTANT : on uploade tous avec des noms unparseable (préfixe TEST_TAG_) puis on RENOMME
        # en DB pour atteindre l'état souhaité. Cela évite l'auto-attach immédiat à l'upload.
        num = seeded["numero_facture"]
        upload_ok = f"{TEST_TAG}_bulkok.pdf"
        upload_unparseable = f"{TEST_TAG}_unp.pdf"
        upload_orphan = f"{TEST_TAG}_orphan.pdf"
        upload_xlsx = f"{TEST_TAG}_data.xlsx"

        target_ok = f"{num}.pdf"          # doit aller en SUCCÈS (match apprenant)
        target_unparseable = upload_unparseable  # reste unparseable -> SKIPPED
        target_orphan = f"{seeded['orphan_facture']}.pdf"  # ANOMALIES (facture sans apprenant)
        target_xlsx = f"{num}.xlsx"       # SKIPPED par extension

        uploads = [
            (upload_ok, "application/pdf", target_ok),
            (upload_unparseable, "application/pdf", target_unparseable),
            (upload_orphan, "application/pdf", target_orphan),
            (upload_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", target_xlsx),
        ]
        client = MongoClient(MONGO_URL)[DB_NAME]
        for fname, ctype, final_name in uploads:
            files = {"file": (fname, _make_pdf_bytes(), ctype)}
            r = session_client.post(f"{BASE_URL}/api/library/upload", files=files, data={"type": "facture"}, timeout=20)
            assert r.status_code == 200, f"{fname} -> {r.status_code} {r.text}"
            doc_id = r.json()["id"]
            if final_name != fname:
                client.dossier_documents.update_one(
                    {"id": doc_id},
                    {"$set": {"original_filename": final_name, "apprenant_id": None, "auto_attached": False}}
                )

        xlsx_name = target_xlsx
        orphan_name = target_orphan
        unparseable_name = target_unparseable

        r = session_client.post(f"{BASE_URL}/api/library/auto-attach", timeout=60)
        assert r.status_code == 200, r.text
        report = r.json()
        assert "total_examined" in report
        assert "attached" in report
        assert isinstance(report.get("successes"), list)
        assert isinstance(report.get("anomalies"), list)
        assert isinstance(report.get("skipped"), list)

        success_files = [s.get("filename") for s in report["successes"]]
        skip_reasons = [s.get("filename") for s in report["skipped"]]
        anomaly_files = [a.get("filename") for a in report["anomalies"]]

        # Le doc renommé doit être rattaché (succès)
        assert f"{num}.pdf" in success_files, f"Expected {num}.pdf in successes, got {success_files}"
        # Le xlsx doit être skipped (jamais tenté)
        assert xlsx_name in skip_reasons, f"Expected {xlsx_name} in skipped, got {skip_reasons}"
        # L'orphan doit être en anomalies (facture connue mais apprenant absent)
        assert orphan_name in anomaly_files, f"Expected {orphan_name} in anomalies, got {anomaly_files}"
        # Le unparseable doit être en skipped (préfixe non reconnu)
        assert unparseable_name in skip_reasons, f"Expected {unparseable_name} in skipped, got {skip_reasons}"

        # Anomalie orpheline doit contenir une reason mentionnant dossier ou apprenant
        orphan_entry = next(a for a in report["anomalies"] if a.get("filename") == orphan_name)
        assert "apprenant" in orphan_entry.get("reason", "").lower() or "dossier" in orphan_entry.get("reason", "").lower()


# ---------------------------------------------------------------------------
# 4) GET /api/apprenants/{id}/documents merge
# ---------------------------------------------------------------------------

class TestApprenantDocumentsMerge:
    def test_library_docs_appear_in_apprenant_documents(self, session_client, seeded):
        # Upload qui auto-attache
        num = seeded["numero_facture"]
        filename = f"merge_{num}.pdf"  # préfixe -> unparseable, on rattachera ensuite manuellement
        files = {"file": (filename, _make_pdf_bytes(), "application/pdf")}
        r = session_client.post(f"{BASE_URL}/api/library/upload", files=files, data={"type": "facture"}, timeout=20)
        assert r.status_code == 200
        doc = r.json()
        doc_id = doc["id"]

        # Attach manuel
        r2 = session_client.patch(
            f"{BASE_URL}/api/library/{doc_id}/attach-apprenant",
            json={"apprenant_id": seeded["apprenant_id"]},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        attached = r2.json()
        assert attached.get("apprenant_id") == seeded["apprenant_id"]

        # GET /api/apprenants/{id}/documents
        r3 = session_client.get(f"{BASE_URL}/api/apprenants/{seeded['apprenant_id']}/documents", timeout=15)
        assert r3.status_code == 200
        docs = r3.json()
        matched = [d for d in docs if d.get("id") == doc_id]
        assert matched, f"Library doc not found in apprenant documents: {docs}"
        m = matched[0]
        assert m.get("source") == "library"
        assert m.get("categorie") == "facture"


# ---------------------------------------------------------------------------
# 5) GET /api/library — champ apprenant + scope unattached
# ---------------------------------------------------------------------------

class TestLibraryListing:
    def test_attached_doc_has_apprenant_field(self, session_client, seeded):
        # Upload + auto-attach
        num = seeded["numero_facture"]
        filename = f"{num}.pdf"
        files = {"file": (filename, _make_pdf_bytes(), "application/pdf")}
        r = session_client.post(f"{BASE_URL}/api/library/upload", files=files, data={"type": "facture"}, timeout=20)
        assert r.status_code == 200
        uploaded = r.json()
        doc_id = uploaded["id"]

        r2 = session_client.get(f"{BASE_URL}/api/library?type=facture", timeout=15)
        assert r2.status_code == 200
        docs = r2.json()
        found = next((d for d in docs if d.get("id") == doc_id), None)
        assert found is not None
        assert found.get("apprenant") is not None
        assert found["apprenant"]["id"] == seeded["apprenant_id"]
        assert found["apprenant"].get("dossier_cpf") == seeded["dossier_cpf"]

    def test_unattached_scope_excludes_apprenant_attached(self, session_client, seeded):
        # Le doc rattaché ne doit PAS apparaître en scope=unattached
        r = session_client.get(f"{BASE_URL}/api/library?scope=unattached", timeout=15)
        assert r.status_code == 200
        unattached = r.json()
        for d in unattached:
            assert not d.get("apprenant_id"), f"Doc {d.get('id')} avec apprenant_id={d.get('apprenant_id')} ne devrait pas être 'unattached'"
            assert not d.get("dossier_id"), f"Doc {d.get('id')} avec dossier_id={d.get('dossier_id')} ne devrait pas être 'unattached'"


# ---------------------------------------------------------------------------
# 6) Detach apprenant
# ---------------------------------------------------------------------------

class TestDetachApprenant:
    def test_detach_clears_apprenant_id(self, session_client, seeded):
        # Upload + auto-attach
        num = seeded["numero_facture"]
        filename = f"todetach_{num}.pdf"  # préfixe -> non-auto, on rattachera manuellement
        files = {"file": (filename, _make_pdf_bytes(), "application/pdf")}
        r = session_client.post(f"{BASE_URL}/api/library/upload", files=files, data={"type": "facture"}, timeout=20)
        doc_id = r.json()["id"]

        # Attach
        session_client.patch(
            f"{BASE_URL}/api/library/{doc_id}/attach-apprenant",
            json={"apprenant_id": seeded["apprenant_id"]},
            timeout=15,
        )
        # Detach
        r2 = session_client.patch(f"{BASE_URL}/api/library/{doc_id}/detach-apprenant", timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("apprenant_id") in (None, "")
