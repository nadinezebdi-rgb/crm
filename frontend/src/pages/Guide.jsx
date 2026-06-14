import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Question,
  Kanban,
  UserPlus,
  GraduationCap,
  Archive,
  Users,
  FileArrowUp,
  DownloadSimple,
  ArrowsClockwise,
  FilePdf,
  Sparkle,
  Receipt,
  Buildings,
  Bank,
  MapPin,
  CaretDown,
  CaretRight,
  CheckCircle,
  Lightning,
  Upload,
  ArrowFatRight,
} from "@phosphor-icons/react";

function Section({ id, icon: Icon, title, subtitle, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid={`guide-section-${id}`}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="h-10 w-10 rounded-md bg-navy text-white flex items-center justify-center flex-shrink-0">
          <Icon size={20} weight="duotone" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 font-display">{title}</h2>
            {badge ? (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
        </div>
        {open ? <CaretDown size={16} className="text-slate-400" /> : <CaretRight size={16} className="text-slate-400" />}
      </button>
      {open ? <div className="px-5 pb-6 pt-1 border-t border-slate-100">{children}</div> : null}
    </section>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center">{n}</div>
      <div className="flex-1 pb-4">
        <div className="text-sm font-semibold text-slate-900 mb-1">{title}</div>
        <div className="text-sm text-slate-600 leading-relaxed space-y-1.5">{children}</div>
      </div>
    </div>
  );
}

function Tip({ children, type = "info" }) {
  const styles = {
    info: "bg-blue-50 border-blue-200 text-blue-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
    success: "bg-emerald-50 border-emerald-200 text-emerald-900",
  };
  const icons = {
    info: <Lightning size={14} weight="fill" className="text-blue-500" />,
    warning: <Lightning size={14} weight="fill" className="text-amber-500" />,
    success: <CheckCircle size={14} weight="fill" className="text-emerald-500" />,
  };
  return (
    <div className={`flex items-start gap-2 p-3 border rounded-md text-xs ${styles[type]}`}>
      <span className="flex-shrink-0 mt-0.5">{icons[type]}</span>
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-300 bg-slate-100 text-slate-700 text-[11px] font-mono">
      {children}
    </kbd>
  );
}

const TOC = [
  { id: "intro", label: "Vue d'ensemble" },
  { id: "kanban", label: "Tableau de Bord (Kanban)" },
  { id: "onboarding", label: "Onboarding stagiaire" },
  { id: "excel", label: "Importer un fichier Excel" },
  { id: "export", label: "Exporter vers Excel / CSV" },
  { id: "documents", label: "Importer & télécharger un document" },
  { id: "pdf-ia", label: "Extraction IA d'un PDF" },
  { id: "actions", label: "Actions de Formation" },
  { id: "archives", label: "Dossiers Clôturés" },
  { id: "formateurs", label: "Formateurs & Sous-traitants" },
  { id: "reset", label: "Reset des dossiers" },
];

export default function Guide() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="px-8 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-navy text-white flex items-center justify-center">
            <Question size={22} weight="duotone" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 font-display">Guide d'utilisation</h1>
            <p className="text-xs text-slate-500 mt-0.5">Tout ce que vous pouvez faire avec votre CRM Blade Academy</p>
          </div>
        </div>
      </div>

      <div className="p-8 max-w-5xl mx-auto">
        {/* Sommaire */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 mb-6">
          <div className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-3">Sommaire</div>
          <ol className="grid grid-cols-2 gap-y-1.5 gap-x-6 text-sm">
            {TOC.map((item, i) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  data-testid={`toc-${item.id}`}
                  className="text-navy hover:underline inline-flex items-center gap-1.5"
                >
                  <span className="text-slate-400 font-mono text-[11px] w-5">{String(i + 1).padStart(2, "0")}</span>
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-3">
          {/* Vue d'ensemble */}
          <Section id="intro" icon={Kanban} title="Vue d'ensemble" subtitle="Que fait votre CRM ?" defaultOpen>
            <p className="text-sm text-slate-600 leading-relaxed">
              Blade Academy CRM est conçu pour piloter au quotidien vos parcours de formation,
              du <strong>devis envoyé</strong> jusqu'au <strong>règlement final</strong>, en passant par le suivi pédagogique,
              l'archivage Qualiopi et la facturation CPF.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
              {[
                { icon: Kanban, label: "Tableau de bord visuel", desc: "Pipeline Kanban à 5 colonnes (Devis → Réglé)" },
                { icon: UserPlus, label: "Onboarding rapide", desc: "Créer un stagiaire en quelques secondes" },
                { icon: GraduationCap, label: "Fiches stagiaires", desc: "Coordonnées, formation, documents, statut" },
                { icon: Archive, label: "Archives", desc: "Coffre-fort des dossiers réglés avec recherche" },
                { icon: FileArrowUp, label: "Import Excel", desc: "Récupérer un export EDOF en 1 clic" },
                { icon: Sparkle, label: "Extraction IA", desc: "Lire un PDF et remplir le dossier automatiquement" },
              ].map((f) => (
                <div key={f.label} className="flex gap-3 p-3 bg-slate-50 border border-slate-100 rounded-md">
                  <f.icon size={20} weight="duotone" className="text-navy flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{f.label}</div>
                    <div className="text-xs text-slate-500">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Kanban */}
          <Section id="kanban" icon={Kanban} title="Tableau de Bord — Pipeline Kanban" subtitle="Suivre les dossiers en cours de manière visuelle">
            <p className="text-sm text-slate-600 mb-4">
              Le Tableau de Bord affiche tous vos stagiaires actifs sous forme de cartes réparties en 5 colonnes :
            </p>
            <ol className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-5">
              {["Devis en attente", "Devis validé", "En action de formation", "Fin d'action de formation", "Facturé"].map((c, i) => (
                <li key={c} className="text-center p-3 bg-slate-50 border border-slate-200 rounded">
                  <div className="text-[10px] font-bold text-slate-400 mb-1">{i + 1}</div>
                  <div className="text-xs font-semibold text-slate-700">{c}</div>
                </li>
              ))}
            </ol>
            <Step n={1} title="Faire avancer un dossier">
              Sur chaque carte, cliquez sur <strong>« Avancer »</strong> pour passer à la colonne suivante.
              Vous pouvez aussi <strong>glisser-déposer</strong> la carte vers la colonne de votre choix.
            </Step>
            <Step n={2} title="Marquer comme réglé">
              Une fois la facture encaissée, cliquez sur <strong>« Marquer comme réglé »</strong> (bouton vert).
              La carte disparaît automatiquement du tableau et entre dans <strong>« Dossiers Clôturés »</strong>.
            </Step>
            <Step n={3} title="Ouvrir le détail d'un stagiaire">
              Cliquez sur le nom du stagiaire (ou allez dans <em>Actions de Formation</em>) pour ouvrir son panneau de détail
              avec toutes ses informations et ses documents.
            </Step>
            <Tip type="info">
              Les cartes affichent un <strong>badge couleur</strong> selon le financeur :
              🔵 OPCO · 🟢 CPF · 🟡 Privé. Le nom du formateur et la date d'entrée sont aussi visibles d'un coup d'œil.
            </Tip>
          </Section>

          {/* Onboarding */}
          <Section id="onboarding" icon={UserPlus} title="Onboarding — Créer un stagiaire" subtitle="Le formulaire rapide d'entrée individuelle">
            <Step n={1} title="Accéder au formulaire">
              Cliquez sur <strong>« Onboarding »</strong> dans la sidebar (zone <em>Espace Actif</em>),
              ou sur le bouton <strong>« Nouveau stagiaire »</strong> en haut du Tableau de Bord.
            </Step>
            <Step n={2} title="Remplir les informations">
              <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                <li>Nom, Prénom <span className="text-red-600">*</span> (obligatoires)</li>
                <li>Date de naissance, adresse, email, téléphone</li>
                <li>Formateur attribué (à choisir dans le menu déroulant)</li>
                <li>Type de financeur : OPCO / CPF / Privé</li>
                <li>Intitulé de la formation (suggestions Anglais A1 → C2)</li>
              </ul>
            </Step>
            <Step n={3} title="Valider">
              Cliquez <strong>« Créer le dossier »</strong>. Le stagiaire apparaît immédiatement dans la colonne
              <strong> « Devis en attente »</strong> du Tableau de Bord.
            </Step>
          </Section>

          {/* Import Excel */}
          <Section id="excel" icon={FileArrowUp} title="Importer un fichier Excel (export EDOF)" subtitle="Créer plusieurs dossiers à partir d'un export Mon Compte Formation">
            <Step n={1} title="Ouvrir la boîte d'import">
              Sur le <strong>Tableau de Bord</strong>, cliquez sur <strong>« Télécharger fichier Excel »</strong>.
            </Step>
            <Step n={2} title="Sélectionner le fichier">
              Glissez-déposez ou cliquez sur la zone pour choisir votre fichier <Kbd>.xlsx</Kbd> ou <Kbd>.csv</Kbd>
              (max 15 Mo).
            </Step>
            <Step n={3} title="Choisir les valeurs par défaut">
              <ul className="list-disc list-inside space-y-0.5">
                <li><strong>Financeur</strong> : OPCO / CPF / Privé</li>
                <li><strong>Formation</strong> : par défaut « ANGLAIS »</li>
                <li><strong>Formateur attribué</strong> : à appliquer sur tout l'import (réassignable individuellement après)</li>
              </ul>
            </Step>
            <Step n={4} title="Importer">
              Cliquez sur <strong>« Importer »</strong>. Le CRM détecte automatiquement les colonnes :
              Nom · Prénom · Date de naissance · Adresse · Email · Téléphone · Date début · Date fin · Formation.
              Un récap s'affiche avec le nombre de dossiers créés et les éventuelles lignes ignorées.
            </Step>
            <Tip type="success">
              Tous les dossiers importés entrent dans <strong>« Devis en attente »</strong>. Vous n'avez plus qu'à les
              faire avancer dans le pipeline au fur et à mesure.
            </Tip>
          </Section>

          {/* Export */}
          <Section id="export" icon={DownloadSimple} title="Exporter vers Excel ou CSV" subtitle="Récupérer tous vos dossiers dans un fichier">
            <Step n={1} title="Cliquer sur Export EDOF">
              Bouton vert <strong>« Export EDOF »</strong> en haut du Tableau de Bord.
            </Step>
            <Step n={2} title="Choisir le format">
              <strong>Excel (.xlsx)</strong> avec entête stylé et colonnes ajustées,
              ou <strong>CSV</strong> avec séparateur point-virgule (compatible Excel français).
            </Step>
            <Step n={3} title="Choisir le périmètre">
              <ul className="list-disc list-inside">
                <li><strong>Tous les dossiers</strong> (actifs + archivés)</li>
                <li><strong>Dossiers actifs</strong> uniquement (le Kanban)</li>
                <li><strong>Archives</strong> uniquement (clôturés)</li>
              </ul>
            </Step>
            <Step n={4} title="Télécharger">
              Le fichier se télécharge avec toutes les 16 colonnes : Nom, Prénom, Date de naissance, Adresse, Email,
              Téléphone, Formation, Type Financeur, Détail Financeur, Formateur, Date d'entrée, Début formation, Fin formation,
              Statut, Date clôture, Notes.
            </Step>
          </Section>

          {/* Documents — la section démo */}
          <Section
            id="documents"
            icon={Upload}
            title="Importer & télécharger un document"
            subtitle="Devis signé, attestation, facture, justificatif de paiement"
            badge="Démo"
            defaultOpen
          >
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Vous pouvez attacher jusqu'à 4 types de documents à chaque dossier stagiaire. Formats acceptés :
              <Kbd>.pdf</Kbd> <Kbd>.xlsx</Kbd> <Kbd>.csv</Kbd> <Kbd>.docx</Kbd> <Kbd>.png</Kbd> <Kbd>.jpg</Kbd>.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-5">
              <div className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mb-3 flex items-center gap-1.5">
                <ArrowFatRight size={12} weight="fill" /> Importer un document
              </div>
              <Step n={1} title="Ouvrir un dossier stagiaire">
                Allez dans <Link to="/actions" className="text-navy underline font-semibold">Actions de Formation</Link>
                {" "}ou <Link to="/apprenants" className="text-navy underline font-semibold">Apprenants</Link>, puis cliquez sur la ligne du stagiaire.
                Le panneau de détail s'ouvre sur la droite.
              </Step>
              <Step n={2} title="Repérer la section « Documents »">
                Faites défiler le panneau jusqu'à la section <strong>« Documents »</strong>. Vous y voyez 4 cartes :
                <em> Devis signé</em>, <em>Attestation de réalisation</em>, <em>Facture</em>, <em>Justificatif de paiement</em>.
              </Step>
              <Step n={3} title="Cliquer sur « Importer »">
                À droite du type de document à attacher, cliquez sur le petit bouton <strong>« Importer »</strong>
                {" "}(icône <Upload size={11} className="inline" />). Le sélecteur de fichier s'ouvre.
              </Step>
              <Step n={4} title="Choisir votre fichier">
                Sélectionnez votre document (PDF, Excel, Word, image…). L'upload démarre immédiatement.
                Un message vert confirme <em>« Document ajouté »</em>.
              </Step>
              <Step n={5} title="Vérifier le résultat">
                Le fichier apparaît sous le type de document avec son nom, sa taille et 2 actions :
                <DownloadSimple size={13} className="inline mx-1" /> télécharger ·
                supprimer.
              </Step>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
              <div className="text-[11px] uppercase tracking-widest text-emerald-700 font-bold mb-3 flex items-center gap-1.5">
                <ArrowFatRight size={12} weight="fill" /> Télécharger / récupérer un document
              </div>
              <Step n={1} title="Ouvrir le panneau du stagiaire">
                Même procédure : cliquez sur la ligne du stagiaire dans Actions de Formation ou Apprenants.
              </Step>
              <Step n={2} title="Cliquer sur l'icône de téléchargement">
                À droite de chaque fichier listé sous un type de document, cliquez sur l'icône
                {" "}<DownloadSimple size={14} weight="bold" className="inline" /> (flèche descendante).
              </Step>
              <Step n={3} title="Le fichier s'enregistre sur votre ordinateur">
                Le fichier original (Excel, PDF, etc.) est téléchargé avec son nom d'origine.
                Vous pouvez l'ouvrir comme un fichier classique.
              </Step>
              <Tip type="success">
                Pour générer un <strong>PDF récapitulatif du dossier complet</strong> (identité + formation + financement
                + liste des documents), cliquez sur le bouton <strong>« PDF »</strong> en haut du panneau.
              </Tip>
            </div>
          </Section>

          {/* Extraction IA */}
          <Section id="pdf-ia" icon={Sparkle} title="Extraction IA depuis un PDF" subtitle="Remplir automatiquement un dossier en chargeant le PDF du stagiaire" badge="IA">
            <p className="text-sm text-slate-600 mb-4">
              Vous avez le dossier PDF d'un stagiaire (EDOF, contrat, fiche de renseignement) ? Le CRM peut lire le
              document avec une intelligence artificielle (Claude Haiku) et remplir automatiquement les champs vides.
            </p>
            <Step n={1} title="Ouvrir le panneau du stagiaire concerné">
              Dans Actions de Formation ou Apprenants, cliquez sur le stagiaire.
            </Step>
            <Step n={2} title="Cliquer sur « Charger PDF » (bouton violet)">
              En haut à droite du panneau de détail, le bouton <strong>« Charger PDF »</strong> avec l'icône
              {" "}<Sparkle size={12} className="inline" />.
            </Step>
            <Step n={3} title="Sélectionner le PDF du stagiaire">
              L'IA lit le document et extrait : Nom, Prénom, Date de naissance, Adresse, Email, Téléphone, et
              <strong> détecte automatiquement le niveau Anglais</strong> (A1, A2, B1, B2, C1, C2).
            </Step>
            <Step n={4} title="Validation">
              Un message confirme les champs mis à jour. Les champs <strong>déjà remplis</strong> sont préservés —
              seuls les champs vides sont complétés. Le niveau Anglais détecté écrase le champ Formation.
            </Step>
          </Section>

          {/* Actions de Formation */}
          <Section id="actions" icon={GraduationCap} title="Actions de Formation" subtitle="Vue détaillée de tous les parcours en cours">
            <p className="text-sm text-slate-600 mb-3">
              Cette page affiche tous les dossiers actifs sous forme de cartes (alternative au Kanban).
              Idéal pour rechercher un stagiaire spécifique ou filtrer par statut.
            </p>
            <Step n={1} title="Rechercher">
              Tapez n'importe quel mot dans la barre <strong>« Rechercher »</strong> en haut.
              Filtre par nom, prénom, formation, formateur, financeur.
            </Step>
            <Step n={2} title="Filtrer par statut">
              Utilisez le menu déroulant à côté pour n'afficher que les <em>Devis en attente</em>, <em>En formation</em>, etc.
            </Step>
            <Step n={3} title="Ouvrir un dossier">
              Cliquez sur la carte → panneau de détail à droite avec édition, upload de documents, génération PDF.
            </Step>
          </Section>

          {/* Archives */}
          <Section id="archives" icon={Archive} title="Dossiers Clôturés (Archives)" subtitle="Coffre-fort numérique des dossiers réglés">
            <p className="text-sm text-slate-600 mb-3">
              Tous les dossiers passés au statut <strong>« Réglé »</strong> arrivent ici automatiquement.
              Ils ne polluent plus le Tableau de Bord mais restent accessibles à vie.
            </p>
            <Step n={1} title="Rechercher dans les archives">
              La barre de recherche en haut filtre instantanément par nom, prénom, OPCO, formateur ou formation.
            </Step>
            <Step n={2} title="Consulter un ancien dossier">
              Cliquez sur une ligne → tous les détails s'affichent en mode lecture seule avec accès aux documents :
              devis signé, attestation, facture, justificatif de paiement (téléchargement uniquement, pas de modification).
            </Step>
          </Section>

          {/* Formateurs */}
          <Section id="formateurs" icon={Users} title="Formateurs & Sous-traitants" subtitle="Gérer votre équipe pédagogique">
            <p className="text-sm text-slate-600 mb-3">
              3 formateurs sont préchargés : <strong>NEO FORMATION</strong>, <strong>HIGH SKILLS</strong>,
              {" "}<strong>VIRGINIA DERFEUIL</strong>. Vous pouvez en ajouter, modifier ou supprimer librement.
            </p>
            <Step n={1} title="Ajouter un formateur">
              Onglet <strong>Formateurs</strong> dans la zone <em>Données</em>. Cliquez sur <strong>« Ajouter »</strong>,
              remplissez le formulaire (nom, email, téléphone, spécialité), validez.
            </Step>
            <Step n={2} title="Sous-traitants">
              Si vous travaillez avec des organismes externes (entreprises de formation), créez-les dans l'onglet
              <strong> Sous-traitants</strong> (ou Entreprises) avec leurs coordonnées et leur SIRET.
            </Step>
          </Section>

          {/* Reset */}
          <Section id="reset" icon={ArrowsClockwise} title="Reset des dossiers" subtitle="Repartir de zéro en début de cohorte">
            <p className="text-sm text-slate-600 mb-3">
              Le bouton rouge <strong>« Reset »</strong> du Tableau de Bord vous permet de supprimer tous les dossiers
              et leurs documents, et remettre les compteurs à zéro.
            </p>
            <Step n={1} title="Cliquer sur Reset">
              Bouton rouge en haut du Tableau de Bord.
            </Step>
            <Step n={2} title="Choisir le périmètre">
              Tous · Actifs uniquement · Archives uniquement.
            </Step>
            <Step n={3} title="Confirmer">
              Tapez exactement <Kbd>RESET</Kbd> dans le champ de confirmation, puis cliquez sur <strong>« Reset »</strong>.
            </Step>
            <Tip type="warning">
              Cette action est <strong>irréversible</strong>. Pour conserver une trace, exportez d'abord en Excel
              via le bouton <em>Export EDOF</em> avant de cliquer sur Reset.
            </Tip>
          </Section>
        </div>

        <div className="mt-8 text-center text-xs text-slate-400">
          Une question ou un bug à signaler ?  Contactez votre administrateur Blade Academy.
        </div>
      </div>
    </div>
  );
}
