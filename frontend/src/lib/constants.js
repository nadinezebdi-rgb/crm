export const STATUS_COLUMNS = [
  { id: "devis_attente", title: "Devis en attente", hint: "Relances à effectuer" },
  { id: "devis_valide", title: "Devis validé", hint: "Accord de financement reçu" },
  { id: "en_formation", title: "En action de formation", hint: "Apprentissage en cours" },
  { id: "fin_formation", title: "Fin d'action de formation", hint: "Documents administratifs" },
  { id: "facture", title: "Facturé", hint: "En attente du règlement" },
];

export const STATUS_LABELS = {
  devis_attente: "Devis en attente",
  devis_valide: "Devis validé",
  en_formation: "En action de formation",
  fin_formation: "Fin d'action de formation",
  facture: "Facturé",
  regle: "Réglé (clôturé)",
};

export const FINANCEURS = ["OPCO", "CPF", "Privé"];

export const FINANCEUR_STYLES = {
  OPCO: "bg-blue-100 text-blue-800 border border-blue-200",
  CPF: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Privé": "bg-amber-100 text-amber-800 border border-amber-200",
};

export const FINANCEUR_DOT = {
  OPCO: "bg-blue-500",
  CPF: "bg-emerald-500",
  "Privé": "bg-amber-500",
};

export const DOC_TYPES = [
  { id: "devis_signe", label: "Devis signé" },
  { id: "attestation", label: "Attestation de réalisation" },
  { id: "facture", label: "Facture" },
  { id: "justificatif_paiement", label: "Justificatif de paiement" },
];

export const DOC_TYPE_LABEL = {
  devis_signe: "Devis signé",
  attestation: "Attestation",
  facture: "Facture",
  justificatif_paiement: "Justificatif de paiement",
};
