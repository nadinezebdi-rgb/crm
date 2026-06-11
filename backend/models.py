"""Pydantic models / payloads for Blade Academy API."""
from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, EmailStr, ConfigDict

RoleType = Literal["admin", "formateur", "apprenant", "entreprise"]
SessionStatus = Literal["brouillon", "planification", "planifiee", "terminee", "archivee"]
ActionType = Literal["formation", "bilan_competences", "vae", "apprentissage"]


class RegisterPayload(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: RoleType = "admin"


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class SessionPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nom: str
    code_interne: Optional[str] = None
    type_session: Literal["formation_professionnelle", "conseil"] = "formation_professionnelle"
    type_action: ActionType = "formation"
    statut: SessionStatus = "brouillon"
    formation_interne: bool = False
    sous_traitance: bool = False
    retire_catalogue: bool = False
    fuseau_horaire: str = "Europe/Paris"
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    lieu_id: Optional[str] = None
    lieu_temporaire: Optional[str] = None
    distanciel: bool = False
    administrateurs: List[str] = Field(default_factory=list)
    formateurs: List[str] = Field(default_factory=list)
    apprenants: List[str] = Field(default_factory=list)
    entreprise_id: Optional[str] = None
    financeur_id: Optional[str] = None
    programme: Optional[str] = None
    categorie: Optional[str] = None
    niveau: Optional[str] = None
    prix_ht: float = 0.0
    cout_ht: float = 0.0
    inclus_bpf: bool = True
    description: Optional[str] = None


class ApprenantPayload(BaseModel):
    nom: str
    prenom: str
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    entreprise_id: Optional[str] = None
    date_naissance: Optional[str] = None
    adresse: Optional[str] = None
    dossier_cpf: Optional[str] = None
    notes: Optional[str] = None


class FormateurPayload(BaseModel):
    nom: str
    prenom: str
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    interne: bool = True
    specialites: List[str] = Field(default_factory=list)
    tarif_journalier: float = 0.0
    notes: Optional[str] = None


class EntreprisePayload(BaseModel):
    raison_sociale: str
    siret: Optional[str] = None
    adresse: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    contact_nom: Optional[str] = None
    notes: Optional[str] = None


class FinanceurPayload(BaseModel):
    nom: str
    type_financeur: Literal["opco", "pole_emploi", "cpf", "entreprise", "autre"] = "opco"
    code: Optional[str] = None
    email: Optional[EmailStr] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    notes: Optional[str] = None


class LieuPayload(BaseModel):
    nom: str
    adresse: Optional[str] = None
    code_postal: Optional[str] = None
    ville: Optional[str] = None
    capacite: int = 0
    equipements: List[str] = Field(default_factory=list)
    distanciel: bool = False
    notes: Optional[str] = None


class OrganismeSettings(BaseModel):
    nom: str = ""
    forme_juridique: str = ""
    adresse: str = ""
    code_postal: str = ""
    ville: str = ""
    pays: str = ""
    siret: str = ""
    rcs: str = ""
    code_ape: str = ""
    tva: str = ""
    nda: str = ""
    nda_region: str = ""
    qualiopi_numero: str = ""
    qualiopi_certificateur: str = ""
    email: str = ""
    telephone: str = ""
    site_web: str = ""


class EdofCommitPayload(BaseModel):
    rows: List[Dict[str, Any]]
    mapping: Dict[str, Optional[str]]
    create_sessions: bool = True
    groupement: Literal["mois", "exact"] = "mois"


class FusionPayload(BaseModel):
    apprenant_ids: List[str]


DEFAULT_ORGANISME = {
    "nom": "Blade Academy",
    "forme_juridique": "SAS",
    "adresse": "26 Rue Jules Lefebvre",
    "code_postal": "02130",
    "ville": "Fère-en-Tardenois",
    "pays": "France",
    "siret": "984 617 654 00012",
    "rcs": "Soissons 984 617 654",
    "code_ape": "85.59A",
    "tva": "FR50984617654",
    "nda": "32020170602",
    "nda_region": "Hauts-de-France",
    "qualiopi_numero": "338511-1",
    "qualiopi_certificateur": "CERTIF OPAC",
    "email": "blade.academy@hotmail.com",
    "telephone": "+33 (0)6 51 21 84 87",
    "site_web": "https://blade-academy.fr",
}

MOIS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

DOC_TITLES = {
    "convention": "Convention de formation professionnelle",
    "contrat": "Contrat de formation",
    "convocation": "Convocation à la formation",
    "attestation": "Attestation de fin de formation",
    "facture": "Facture",
    "emargement": "Feuille d'émargement",
    "programme": "Programme de formation",
    "evaluation": "Évaluation de la formation",
}

DOC_TYPE_TO_CATEGORIE = {
    "convention": "convention",
    "contrat": "contrat",
    "convocation": "convocation_certification",
    "attestation": "attestation_assiduite",
    "facture": "facture",
    "emargement": "emargement",
    "programme": "autre",
    "evaluation": "autre",
}

CATEGORIES_DOCUMENTS_APPRENANT = {
    "certificat", "convocation_certification", "facture", "attestation_assiduite",
    "releve_connexion", "contrat", "emargement", "dpc", "convention", "communications", "autre",
}
