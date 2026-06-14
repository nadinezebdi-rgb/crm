import React, { useState } from "react";
import CrudPage from "@/components/CrudPage";
import ImportEdofDialog from "@/components/ImportEdofDialog";
import DocumentDemoBanner from "@/components/DocumentDemoBanner";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Trash } from "@phosphor-icons/react";

function ResetEdofButton({ onDone }) {
  const [loading, setLoading] = useState(false);
  const reset = async () => {
    if (!window.confirm("Effacer tous les apprenants et sessions importés depuis EDOF ? Cette action est définitive.")) return;
    setLoading(true);
    try {
      const { data } = await api.delete("/import/edof/reset");
      toast.success(`${data.apprenants_supprimes} apprenant(s) et ${data.sessions_supprimees} session(s) supprimé(s)`);
      onDone?.();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Suppression impossible");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant="outline" onClick={reset} disabled={loading} data-testid="edof-reset-btn" className="border-red-200 text-red-600 hover:bg-red-50">
      <Trash size={16} className="mr-1.5" /> {loading ? "Suppression…" : "Effacer imports EDOF"}
    </Button>
  );
}

export default function Apprenants() {
  return (
    <CrudPage
      title="Apprenants"
      subtitle="Vos stagiaires et bénéficiaires de formation."
      endpoint="apprenants"
      testid="apprenants-page"
      rowHref={(it) => `/apprenants/${it.id}`}
      headerBanner={<DocumentDemoBanner />}
      extraActions={(reload) => (
        <>
          <ResetEdofButton onDone={reload} />
          <ImportEdofDialog onDone={reload} />
        </>
      )}
      columns={[
        { key: "prenom", label: "Prénom" },
        { key: "nom", label: "Nom" },
        { key: "email", label: "Email" },
        { key: "telephone", label: "Téléphone" },
        { key: "formation", label: "Formation" },
        { key: "date_debut", label: "Début" },
        { key: "date_fin", label: "Fin" },
        { key: "dossier_cpf", label: "N° dossier CPF" },
      ]}
      blank={{ nom: "", prenom: "", email: "", telephone: "", date_naissance: "", adresse: "", dossier_cpf: "", formation: "", niveau: "", date_debut: "", date_fin: "", notes: "" }}
      fields={[
        { key: "prenom", label: "Prénom *" },
        { key: "nom", label: "Nom *" },
        { key: "email", label: "Email", type: "email" },
        { key: "telephone", label: "Téléphone" },
        { key: "date_naissance", label: "Date de naissance", type: "date" },
        { key: "dossier_cpf", label: "N° dossier CPF" },
        { key: "formation", label: "Formation" },
        { key: "niveau", label: "Niveau (anglais)" },
        { key: "date_debut", label: "Date de début", type: "date" },
        { key: "date_fin", label: "Date de fin", type: "date" },
        { key: "adresse", label: "Adresse", full: true },
        { key: "notes", label: "Notes", type: "textarea", full: true },
      ]}
    />
  );
}
