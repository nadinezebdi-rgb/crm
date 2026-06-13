"""Blade Academy CRM — Génération des documents PDF réglementaires.

Conventions, contrats, convocations, attestations, factures, émargements,
programmes et évaluations, conformes aux mentions obligatoires du Code du
travail (art. L.6353-1 et suivants).
"""

import io
from datetime import datetime, timezone

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth

NAVY = "#0B1726"
CYAN = "#4FC0EE"
INK = "#0F172A"
MUTED = "#64748B"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _fdate(iso):
    if not iso:
        return "à définir"
    try:
        return datetime.fromisoformat(str(iso)[:10]).strftime("%d/%m/%Y")
    except ValueError:
        return str(iso)


def _today():
    return datetime.now(timezone.utc).strftime("%d/%m/%Y")


def _duree(session):
    """(jours, heures) — 7h/jour, bornes incluses."""
    try:
        d1 = datetime.fromisoformat(session["date_debut"][:10])
        d2 = datetime.fromisoformat(session["date_fin"][:10])
        days = max((d2 - d1).days + 1, 1)
    except (TypeError, KeyError, ValueError):
        days = 1
    return days, days * 7


def _money(v):
    return f"{v:,.2f}".replace(",", " ").replace(".", ",") + " €"


def _person(p):
    return f"{p.get('prenom', '')} {p.get('nom', '')}".strip() or "—"


def _lieu_str(ctx):
    session, lieu = ctx["session"], ctx.get("lieu")
    if session.get("distanciel"):
        return "Formation à distance (classe virtuelle — le lien de connexion est communiqué aux stagiaires avant le début de la session)"
    if lieu:
        return f"{lieu.get('nom', '')}, {lieu.get('adresse', '')}, {lieu.get('code_postal', '')} {lieu.get('ville', '')}".strip(", ")
    return session.get("lieu_temporaire") or "Lieu à confirmer"


def _org_identite(org):
    forme = f" ({org['forme_juridique']})" if org.get("forme_juridique") else ""
    return (
        f"{org.get('nom', '')}{forme}, SIRET {org.get('siret', '—')}, dont le siège social est situé "
        f"{org.get('adresse', '')}, {org.get('code_postal', '')} {org.get('ville', '')}. "
        f"Déclaration d'activité enregistrée sous le numéro {org.get('nda', '—')} auprès du préfet de région "
        f"{org.get('nda_region', '—')} (cet enregistrement ne vaut pas agrément de l'État). "
        f"Organisme certifié Qualiopi n° {org.get('qualiopi_numero', '—')} au titre des actions de formation."
    )


def _client_identite(ctx):
    e = ctx.get("entreprise")
    if e:
        rep = f", représentée par {e['contact_nom']}" if e.get("contact_nom") else ""
        return f"{e.get('raison_sociale', '—')}, SIRET {e.get('siret', '—')}, {e.get('ville', '')}{rep}"
    apprenants = ctx.get("apprenants") or []
    if len(apprenants) == 1:
        return f"{_person(apprenants[0])} ({apprenants[0].get('email', '')})"
    return "Le bénéficiaire désigné aux présentes"


# ---------------------------------------------------------------------------
# Moteur de rendu PDF (blocs structurés)
# ---------------------------------------------------------------------------
def build_pdf(title: str, blocks: list, org: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left, right = 2 * cm, width - 2 * cm
    usable = right - left

    def draw_header():
        c.setFillColor(colors.HexColor(NAVY))
        c.rect(0, height - 3 * cm, width, 3 * cm, fill=1, stroke=0)
        c.setFillColor(colors.HexColor(CYAN))
        c.rect(0, height - 3.12 * cm, width, 0.12 * cm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(left, height - 1.7 * cm, (org.get("nom") or "Blade Academy").upper())
        c.setFillColor(colors.HexColor(CYAN))
        c.setFont("Helvetica", 9)
        q = f"Organisme de formation certifié Qualiopi N° {org['qualiopi_numero']}" if org.get("qualiopi_numero") else "Organisme de formation certifié Qualiopi"
        c.drawString(left, height - 2.3 * cm, q)
        c.setFillColor(colors.HexColor("#CBD5E1"))
        c.setFont("Helvetica", 8)
        right_lines = [
            f"{org.get('adresse', '')}, {org.get('code_postal', '')} {org.get('ville', '')}".strip(", "),
            f"{org.get('telephone', '')} — {org.get('email', '')}".strip(" —"),
            org.get("site_web", ""),
        ]
        ry = height - 1.4 * cm
        for rl in right_lines:
            if rl:
                c.drawRightString(right, ry, rl)
                ry -= 0.45 * cm

    def draw_footer():
        c.setFillColor(colors.HexColor(MUTED))
        c.setFont("Helvetica", 7)
        parts = []
        if org.get("nom"):
            forme = f" ({org['forme_juridique']})" if org.get("forme_juridique") else ""
            parts.append(f"{org['nom']}{forme}")
        if org.get("siret"):
            parts.append(f"SIRET {org['siret']}")
        if org.get("rcs"):
            parts.append(f"RCS {org['rcs']}")
        if org.get("tva"):
            parts.append(f"TVA {org['tva']}")
        c.drawString(left, 2.1 * cm, " · ".join(parts))
        if org.get("nda"):
            region = f" auprès du préfet de région {org['nda_region']}" if org.get("nda_region") else ""
            c.drawString(left, 1.7 * cm, f"Déclaration d'activité enregistrée sous le numéro {org['nda']}{region}. Cet enregistrement ne vaut pas agrément de l'État.")
        c.setFont("Helvetica", 8)
        c.drawString(left, 1.2 * cm, f"Document généré le {datetime.now(timezone.utc).strftime('%d/%m/%Y à %H:%M UTC')}")
        qf = f"Qualiopi N° {org['qualiopi_numero']}" if org.get("qualiopi_numero") else "Conforme Qualiopi"
        certif = f" — {org['qualiopi_certificateur']}" if org.get("qualiopi_certificateur") else ""
        c.drawRightString(right, 1.2 * cm, f"{qf}{certif}")

    def wrap(text, font="Helvetica", size=10, indent=0):
        max_w = usable - indent
        lines, cur = [], ""
        for word in str(text).split():
            cand = (cur + " " + word).strip()
            if stringWidth(cand, font, size) <= max_w:
                cur = cand
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        return lines or [""]

    draw_header()
    c.setFillColor(colors.HexColor(INK))
    c.setFont("Helvetica-Bold", 15)
    c.drawString(left, height - 4.4 * cm, title)
    y = height - 5.4 * cm

    def ensure(space):
        nonlocal y
        if y - space < 3 * cm:
            draw_footer()
            c.showPage()
            y = height - 2.5 * cm

    for block in blocks:
        kind = block[0]
        if kind == "h":
            ensure(1.3 * cm)
            y -= 0.3 * cm
            c.setFillColor(colors.HexColor(NAVY))
            c.setFont("Helvetica-Bold", 11.5)
            c.drawString(left, y, block[1])
            c.setFillColor(colors.HexColor(CYAN))
            c.rect(left, y - 0.16 * cm, 1.2 * cm, 0.05 * cm, fill=1, stroke=0)
            y -= 0.7 * cm
        elif kind in ("p", "b"):
            font = "Helvetica-Bold" if kind == "b" else "Helvetica"
            indent = block[2] if len(block) > 2 else 0
            c.setFillColor(colors.HexColor(INK))
            for ln in wrap(block[1], font, 10, indent):
                ensure(0.55 * cm)
                c.setFont(font, 10)
                c.drawString(left + indent, y, ln)
                y -= 0.5 * cm
            y -= 0.1 * cm
        elif kind == "sp":
            y -= 0.45 * cm
        elif kind == "sign":
            ensure(5.6 * cm)
            y -= 0.3 * cm
            col_w = (usable - 1 * cm) / 2
            x2 = left + col_w + 1 * cm
            c.setFillColor(colors.HexColor(INK))
            c.setFont("Helvetica-Bold", 10)
            c.drawString(left, y, block[1])
            c.drawString(x2, y, block[2])
            y -= 0.45 * cm
            c.setFillColor(colors.HexColor("#475569"))
            c.setFont("Helvetica", 8.5)
            c.drawString(left, y, "Nom, qualité, date, signature et cachet :")
            c.drawString(x2, y, "Nom, qualité, date, signature et cachet :")
            y -= 0.3 * cm
            box_h = 3.2 * cm
            c.setStrokeColor(colors.HexColor("#94A3B8"))
            c.roundRect(left, y - box_h, col_w, box_h, 6, fill=0, stroke=1)
            c.roundRect(x2, y - box_h, col_w, box_h, 6, fill=0, stroke=1)
            y -= box_h + 0.6 * cm

    draw_footer()
    c.save()
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Contenus par type de document
# ---------------------------------------------------------------------------
def _prix_lignes(session):
    ht = session.get("prix_ht", 0) or 0
    tva = round(ht * 0.20, 2)
    return ht, tva, round(ht + tva, 2)


def build_convention(ctx):
    s, org = ctx["session"], ctx["org"]
    jours, heures = _duree(s)
    ht, tva, ttc = _prix_lignes(s)
    apprenants = ctx.get("apprenants") or []
    formateurs = ctx.get("formateurs") or []
    financeur = ctx.get("financeur")

    blocks = [
        ("p", "Convention de formation professionnelle conclue en application des articles L.6353-1 et L.6353-2 du Code du travail."),
        ("sp",),
        ("h", "Entre les soussignés"),
        ("p", f"D'une part, {_org_identite(org)} Ci-après dénommé « l'Organisme de formation »."),
        ("sp",),
        ("p", f"D'autre part, {_client_identite(ctx)}. Ci-après dénommé « le Client »."),
        ("p", "Il est convenu ce qui suit :"),
        ("h", "Article 1 — Objet, nature et durée de la formation"),
        ("p", f"L'Organisme de formation organise l'action de formation suivante : « {s['nom']} » (code interne {s.get('code_interne', '—')})."),
        ("p", f"Nature de l'action, au sens de l'article L.6313-1 du Code du travail : action de formation. Catégorie : {s.get('categorie') or '—'}. Niveau : {s.get('niveau') or '—'}. Programme : {s.get('programme') or '—'}."),
        ("p", f"Durée : {jours} jour(s), soit {heures} heures de formation. Dates : du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))}."),
    ]
    if s.get("description"):
        blocks.append(("p", f"Objectifs : {s['description']}"))
    blocks += [
        ("h", "Article 2 — Lieu et modalités de déroulement"),
        ("p", f"La formation se déroule en modalité {'distancielle' if s.get('distanciel') else 'présentielle'} : {_lieu_str(ctx)}."),
        ("p", "Horaires indicatifs : 9h00 – 12h30 et 13h30 – 17h00, sauf aménagement convenu entre les parties."),
        ("h", "Article 3 — Effectif et stagiaires concernés"),
        ("p", f"La présente convention concerne {len(apprenants)} stagiaire(s) :"),
    ]
    for a in apprenants:
        blocks.append(("p", f"• {_person(a)} ({a.get('email', '—')})", 12))
    if not apprenants:
        blocks.append(("p", "• Liste des stagiaires à annexer à la présente convention.", 12))
    noms_formateurs = ", ".join(_person(f) for f in formateurs) or "l'équipe pédagogique de l'Organisme"
    blocks += [
        ("h", "Article 4 — Moyens pédagogiques, techniques et d'encadrement"),
        ("p", f"L'encadrement pédagogique est assuré par : {noms_formateurs}. Les moyens mobilisés comprennent supports de formation remis aux stagiaires, exercices pratiques et mises en situation, ainsi que les équipements nécessaires à la modalité retenue."),
        ("h", "Article 5 — Modalités de suivi et sanction de la formation"),
        ("p", "L'assiduité des stagiaires est attestée par la signature de feuilles d'émargement par demi-journée, contresignées par le formateur. Les acquis sont évalués en cours et/ou en fin de formation. À l'issue de la formation, l'Organisme délivre à chaque stagiaire une attestation de fin de formation mentionnant les objectifs, la nature, la durée de l'action et les résultats de l'évaluation des acquis, conformément à l'article L.6353-1 du Code du travail."),
        ("h", "Article 6 — Prix de la formation"),
        ("b", f"Prix : {_money(ht)} HT, TVA (20 %) : {_money(tva)}, soit {_money(ttc)} TTC."),
        ("p", "Ce prix comprend l'ingénierie pédagogique, l'animation, les supports remis aux stagiaires et la délivrance des documents de fin de formation."),
    ]
    if financeur:
        blocks.append(("p", f"Financement : la prise en charge est assurée en tout ou partie par {financeur.get('nom', '—')} ({financeur.get('type', 'financeur')}). En cas de prise en charge partielle ou de refus du financeur, le solde reste dû par le Client."))
    blocks += [
        ("h", "Article 7 — Modalités de règlement"),
        ("p", "Le règlement s'effectue par virement bancaire à réception de facture, au plus tard 30 jours à compter de sa date d'émission. Tout retard de paiement entraîne de plein droit l'application de pénalités de retard au taux d'intérêt légal majoré, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € (art. D.441-5 du Code de commerce)."),
        ("h", "Article 8 — Dédit, annulation et abandon"),
        ("p", "En cas d'annulation par le Client plus de 10 jours ouvrés avant le début de la formation, aucune somme n'est due. En cas d'annulation moins de 10 jours ouvrés avant le début, l'Organisme retient 50 % du prix à titre de dédit. En cas d'abandon en cours de formation du fait du Client ou des stagiaires, le prix reste dû en totalité, sauf cas de force majeure dûment justifié. Les sommes versées à ce titre ne peuvent être imputées sur l'obligation de financement de la formation professionnelle ni faire l'objet d'une prise en charge par un financeur."),
        ("p", "En cas d'annulation du fait de l'Organisme de formation, les sommes éventuellement versées sont intégralement remboursées."),
        ("h", "Article 9 — Différends éventuels"),
        ("p", "Si une contestation ou un différend n'a pu être réglé à l'amiable, le tribunal compétent du ressort du siège de l'Organisme de formation sera seul compétent pour régler le litige."),
        ("sp",),
        ("b", f"Fait en deux exemplaires originaux, le {_today()}."),
        ("sign", "Pour l'Organisme de formation", "Pour le Client"),
    ]
    return "Convention de formation professionnelle", blocks


def build_contrat(ctx):
    s, org = ctx["session"], ctx["org"]
    jours, heures = _duree(s)
    ht, tva, ttc = _prix_lignes(s)
    blocks = [
        ("p", "Contrat de formation professionnelle conclu entre l'organisme de formation et une personne physique, en application des articles L.6353-3 à L.6353-7 du Code du travail."),
        ("sp",),
        ("h", "Entre les soussignés"),
        ("p", f"D'une part, {_org_identite(org)} Ci-après dénommé « l'Organisme de formation »."),
        ("sp",),
        ("p", f"D'autre part, {_client_identite(ctx)}. Ci-après dénommé « le Stagiaire »."),
        ("h", "Article 1 — Objet, nature, durée et effectif"),
        ("p", f"Action de formation : « {s['nom']} » (code {s.get('code_interne', '—')}), au sens de l'article L.6313-1 du Code du travail. Durée : {jours} jour(s) soit {heures} heures, du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))}."),
        ("p", f"Objectifs : {s.get('description') or 'définis dans le programme remis au Stagiaire avant la signature du présent contrat.'}"),
        ("h", "Article 2 — Lieu, modalités et encadrement"),
        ("p", f"Modalité {'distancielle' if s.get('distanciel') else 'présentielle'} : {_lieu_str(ctx)}. L'encadrement est assuré par l'équipe pédagogique de l'Organisme. L'assiduité est attestée par émargement par demi-journée."),
        ("h", "Article 3 — Niveau requis et sanction de la formation"),
        ("p", f"Niveau de connaissances préalables requis : {s.get('niveau') or 'aucun prérequis spécifique'}. À l'issue de la formation, une attestation de fin de formation est délivrée au Stagiaire (art. L.6353-1 du Code du travail)."),
        ("h", "Article 4 — Délai de rétractation"),
        ("p", "À compter de la date de signature du présent contrat, le Stagiaire dispose d'un délai de 10 jours pour se rétracter (art. L.6353-5 du Code du travail). Il en informe l'Organisme par lettre recommandée avec accusé de réception. Dans ce cas, aucune somme ne peut être exigée du Stagiaire."),
        ("h", "Article 5 — Prix et modalités de paiement"),
        ("b", f"Prix : {_money(ht)} HT, TVA (20 %) : {_money(tva)}, soit {_money(ttc)} TTC."),
        ("p", "Aucune somme ne peut être exigée avant l'expiration du délai de rétractation. Il ne peut être payé à l'expiration de ce délai un premier versement supérieur à 30 % du prix. Le solde donne lieu à échelonnement des paiements au fur et à mesure du déroulement de l'action de formation (art. L.6353-6 du Code du travail)."),
        ("h", "Article 6 — Interruption de la formation"),
        ("p", "En cas de cessation anticipée de la formation du fait de l'Organisme ou d'abandon par le Stagiaire pour un autre motif que la force majeure dûment reconnue, le présent contrat est résilié. Dans ce cas, seules les prestations effectivement dispensées sont dues au prorata temporis de leur valeur prévue au contrat. En cas de force majeure dûment reconnue empêchant le Stagiaire de suivre la formation, il peut résilier le contrat ; seules les prestations effectivement dispensées sont alors dues."),
        ("h", "Article 7 — Différends éventuels"),
        ("p", "Si une contestation ou un différend n'a pu être réglé à l'amiable, le tribunal compétent du ressort du siège de l'Organisme de formation sera seul compétent pour régler le litige."),
        ("sp",),
        ("b", f"Fait en deux exemplaires originaux, le {_today()}."),
        ("sign", "Pour l'Organisme de formation", "Le Stagiaire (lu et approuvé)"),
    ]
    return "Contrat de formation professionnelle", blocks


def build_convocation(ctx):
    s, org = ctx["session"], ctx["org"]
    jours, heures = _duree(s)
    apprenants = ctx.get("apprenants") or []
    formateurs = ctx.get("formateurs") or []
    noms_formateurs = ", ".join(_person(f) for f in formateurs) or "l'équipe pédagogique"
    blocks = [
        ("p", "Madame, Monsieur,"),
        ("p", "Nous avons le plaisir de vous convoquer à la session de formation suivante :"),
        ("sp",),
        ("b", f"« {s['nom']} » (code {s.get('code_interne', '—')})"),
        ("p", f"Dates : du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))} — {jours} jour(s), {heures} heures."),
        ("p", "Horaires : 9h00 – 12h30 et 13h30 – 17h00."),
        ("p", f"Lieu / modalité : {_lieu_str(ctx)}."),
        ("p", f"Intervenant(s) : {noms_formateurs}."),
        ("h", "Stagiaires convoqués"),
    ]
    for a in apprenants:
        blocks.append(("p", f"• {_person(a)}", 12))
    if not apprenants:
        blocks.append(("p", "• Voir liste jointe.", 12))
    blocks += [
        ("h", "Consignes pratiques"),
        ("p", "Merci de vous présenter 15 minutes avant le début de la première demi-journée, muni(e) d'une pièce d'identité. L'émargement est obligatoire à chaque demi-journée. En cas d'empêchement, merci de nous prévenir au plus tôt."),
        ("p", f"Si vous êtes en situation de handicap et avez besoin d'un aménagement, contactez notre référent handicap : {org.get('email', '—')} / {org.get('telephone', '—')}."),
        ("sp",),
        ("p", f"Pour toute question : {org.get('email', '—')} — {org.get('telephone', '—')}."),
        ("p", "Dans l'attente de vous accueillir, nous vous prions d'agréer, Madame, Monsieur, nos salutations distinguées."),
        ("sp",),
        ("b", f"Fait le {_today()} — La Direction"),
    ]
    return "Convocation à la formation", blocks


def build_attestation(ctx):
    s, org = ctx["session"], ctx["org"]
    jours, heures = _duree(s)
    apprenants = ctx.get("apprenants") or []
    blocks = [
        ("p", f"Je soussigné(e), représentant légal de {org.get('nom', '—')}, organisme de formation déclaré sous le numéro {org.get('nda', '—')}, atteste que le(s) stagiaire(s) désigné(s) ci-dessous a (ont) suivi l'action de formation suivante :"),
        ("sp",),
        ("b", f"« {s['nom']} » (code {s.get('code_interne', '—')})"),
        ("p", f"Nature de l'action (art. L.6313-1 du Code du travail) : action de formation. Durée : {jours} jour(s), soit {heures} heures, du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))}."),
        ("h", "Stagiaire(s) concerné(s)"),
    ]
    for a in apprenants:
        blocks.append(("p", f"• {_person(a)}", 12))
    if not apprenants:
        blocks.append(("p", "• Voir liste annexée.", 12))
    blocks += [
        ("h", "Objectifs et résultats"),
        ("p", f"Objectifs de la formation : {s.get('description') or 'tels que définis au programme de formation remis au stagiaire.'}"),
        ("p", "Résultats de l'évaluation des acquis : les acquis ont été évalués au cours et à l'issue de la formation conformément aux modalités prévues au programme. Le stagiaire a atteint les objectifs pédagogiques visés."),
        ("p", "La présente attestation est délivrée en application de l'article L.6353-1 du Code du travail pour servir et valoir ce que de droit."),
        ("sp",),
        ("b", f"Fait à {org.get('ville', '—')}, le {_today()}."),
        ("sign", "Pour l'Organisme de formation", "Cachet de l'organisme"),
    ]
    return "Attestation de fin de formation", blocks


def build_facture(ctx):
    s, org = ctx["session"], ctx["org"]
    jours, heures = _duree(s)
    ht, tva, ttc = _prix_lignes(s)
    apprenants = ctx.get("apprenants") or []
    financeur = ctx.get("financeur")
    num = f"FAC-{s.get('code_interne') or s['id'][:8]}"
    blocks = [
        ("b", f"Facture n° {num}"),
        ("p", f"Date d'émission : {_today()} — Échéance : 30 jours à compter de l'émission."),
        ("h", "Client"),
        ("p", _client_identite(ctx) + "."),
        ("h", "Désignation"),
        ("p", f"Action de formation professionnelle : « {s['nom']} » (code {s.get('code_interne', '—')}), du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))}, {jours} jour(s) soit {heures} heures, {len(apprenants)} stagiaire(s), modalité {'distancielle' if s.get('distanciel') else 'présentielle'}."),
        ("sp",),
        ("b", f"Total HT : {_money(ht)}"),
        ("b", f"TVA (20 %) : {_money(tva)}"),
        ("b", f"Total TTC : {_money(ttc)}"),
        ("sp",),
    ]
    if financeur:
        blocks.append(("p", f"Prise en charge : {financeur.get('nom', '—')} ({financeur.get('type', 'financeur')}). En cas de subrogation de paiement, la facture est adressée directement au financeur ; tout reste à charge demeure dû par le Client."))
    blocks += [
        ("h", "Conditions de règlement"),
        ("p", "Règlement par virement bancaire à réception, au plus tard à la date d'échéance. Pas d'escompte pour paiement anticipé. Tout retard de paiement entraîne de plein droit des pénalités de retard au taux d'intérêt légal majoré ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 € (art. D.441-5 du Code de commerce)."),
        ("p", f"Formation dispensée par {org.get('nom', '—')} — déclaration d'activité n° {org.get('nda', '—')}."),
    ]
    return "Facture", blocks


def build_emargement(ctx):
    s = ctx["session"]
    jours, heures = _duree(s)
    apprenants = ctx.get("apprenants") or []
    formateurs = ctx.get("formateurs") or []
    noms_formateurs = ", ".join(_person(f) for f in formateurs) or "—"
    blocks = [
        ("p", f"Formation : « {s['nom']} » (code {s.get('code_interne', '—')}) — du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))} ({jours} jour(s), {heures} heures)."),
        ("p", f"Lieu / modalité : {_lieu_str(ctx)}. Formateur(s) : {noms_formateurs}."),
        ("p", "Feuille à faire signer par chaque stagiaire à chaque demi-journée. Le formateur contresigne en fin de journée."),
        ("h", "Émargement des stagiaires — Date : ........ / ........ / ................"),
    ]
    for a in apprenants:
        blocks += [
            ("b", _person(a)),
            ("p", "Matin : ........................................................    Après-midi : ........................................................", 12),
            ("sp",),
        ]
    if not apprenants:
        blocks.append(("p", "Aucun stagiaire inscrit — compléter manuellement."))
    blocks += [
        ("sp",),
        ("sign", "Le(s) formateur(s)", "Pour l'Organisme de formation"),
    ]
    return "Feuille d'émargement", blocks


def build_programme(ctx):
    s, org = ctx["session"], ctx["org"]
    jours, heures = _duree(s)
    ht, tva, ttc = _prix_lignes(s)
    blocks = [
        ("b", f"« {s['nom']} » (code {s.get('code_interne', '—')})"),
        ("p", f"Catégorie : {s.get('categorie') or '—'} — Programme : {s.get('programme') or '—'}."),
        ("h", "Objectifs pédagogiques"),
        ("p", s.get("description") or "À l'issue de la formation, le stagiaire sera capable de mettre en œuvre les compétences visées par le programme."),
        ("h", "Public visé et prérequis"),
        ("p", f"Public : salariés, demandeurs d'emploi et toute personne souhaitant développer ses compétences. Niveau requis : {s.get('niveau') or 'aucun prérequis spécifique'}."),
        ("h", "Durée, dates et modalités"),
        ("p", f"{jours} jour(s) soit {heures} heures, du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))}. Modalité {'distancielle' if s.get('distanciel') else 'présentielle'} : {_lieu_str(ctx)}."),
        ("h", "Méthodes mobilisées"),
        ("p", "Alternance d'apports théoriques et de mises en pratique, supports remis aux stagiaires, études de cas et échanges avec le formateur."),
        ("h", "Modalités d'évaluation et de suivi"),
        ("p", "Évaluation des acquis en cours et en fin de formation, feuilles d'émargement par demi-journée, attestation de fin de formation remise à chaque stagiaire (art. L.6353-1 du Code du travail), questionnaire de satisfaction à chaud."),
        ("h", "Accessibilité aux personnes en situation de handicap"),
        ("p", f"Nos formations sont accessibles aux personnes en situation de handicap. Pour tout besoin d'aménagement, contactez notre référent handicap : {org.get('email', '—')} / {org.get('telephone', '—')}."),
        ("h", "Tarif"),
        ("b", f"{_money(ht)} HT — {_money(ttc)} TTC (TVA 20 %)."),
        ("p", f"Délai d'accès : inscription possible jusqu'à 48h avant le début de la session, sous réserve de places disponibles. Contact : {org.get('email', '—')}."),
    ]
    return "Programme de formation", blocks


def build_evaluation(ctx):
    s = ctx["session"]
    blocks = [
        ("p", f"Formation : « {s['nom']} » (code {s.get('code_interne', '—')}) — du {_fdate(s.get('date_debut'))} au {_fdate(s.get('date_fin'))}."),
        ("p", "Stagiaire (facultatif) : ................................................................"),
        ("p", "Merci d'entourer la note correspondant à votre appréciation (1 = très insatisfait, 5 = très satisfait)."),
        ("h", "Votre appréciation"),
    ]
    for critere in [
        "Atteinte des objectifs annoncés",
        "Contenu et qualité des supports",
        "Animation et pédagogie du formateur",
        "Rythme et durée de la formation",
        "Organisation et conditions matérielles",
        "Applicabilité des acquis dans votre activité",
    ]:
        blocks.append(("p", f"• {critere} :    1    2    3    4    5", 6))
    blocks += [
        ("h", "Recommandation"),
        ("p", "Recommanderiez-vous cette formation ?    OUI  /  NON"),
        ("h", "Commentaires et suggestions"),
        ("p", "................................................................................................................................"),
        ("p", "................................................................................................................................"),
        ("p", "................................................................................................................................"),
        ("sp",),
        ("p", "Merci pour votre retour — il contribue à l'amélioration continue de nos formations (démarche Qualiopi)."),
    ]
    return "Évaluation de la formation (à chaud)", blocks


DOC_BUILDERS = {
    "convention": build_convention,
    "contrat": build_contrat,
    "convocation": build_convocation,
    "attestation": build_attestation,
    "facture": build_facture,
    "emargement": build_emargement,
    "programme": build_programme,
    "evaluation": build_evaluation,
}
