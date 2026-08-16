/* ── Configuration ────────────────────────────────────── */

const NOTES_API_URL = "https://script.google.com/macros/s/AKfycbyT5F1dLPELwdLbsedvIlzyLo_iZVP36LynNBokLYDMgiez5AlwrkbfbT3m-TVA4l0q1g/exec";

/* Rafraîchissement automatique des données (sans recharger la page) */
const REFRESH_MS = 30000;

let notesGlobales = [];
let penseBeteTexte = "";        /* pense-bête partagé : 1 tâche par ligne */
let penseBeteDirtyUntil = 0;    /* garde anti-écrasement après édition locale */
let calendar = null;
let toutesGlobal = [];          /* réservations à venir + notes (affichage) */
let reservationsAVenir = [];    /* réservations à venir (compteur) */
let reservationsStats = [];     /* réservations passées + à venir (statistiques) */
let dernierSnapshot = "";

/* ── Helpers ──────────────────────────────────────────── */

function formatDateFR(dateText) {
  if (!dateText) return "—";
  return new Date(dateText + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric"
  });
}

function addDaysISO(dateISO, days) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function cleanText(value) {
  if (!value) return "";
  return String(value)
    .replace(/[^a-zA-ZÀ-ÿ0-9 '\-.,€]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanMoney(value) {
  if (!value) return "";
  const text = String(value).replace(/[^\d,.\s]/g, "").trim();
  return text ? text + " €" : "";
}

function countNights(start, end) {
  if (!start || !end) return 0;
  return Math.round((new Date(end) - new Date(start)) / 86400000);
}

async function loadJson(path) {
  const res = await fetch(path + "?v=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status + " sur " + path);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/* Fichier facultatif (peut ne pas encore exister sur le serveur) */
async function loadJsonOptionnel(path) {
  try {
    return await loadJson(path);
  } catch {
    return [];
  }
}

function parseEuros(value) {
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/[^\d,]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function formatEuros(n) {
  return n > 0 ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €" : "—";
}

/* ── Réservations ─────────────────────────────────────── */

function normalizeReservation(r) {
  const nuits = r.nuits || countNights(r.start, r.end);
  return {
    type: "reservation",
    source: r.source || "Airbnb",
    nom: cleanText(r.nom || ""),
    start: r.start,
    end: r.end,
    voyageurs: cleanText(r.voyageurs || ""),
    code: r.code || "",
    total_paye: r.total_paye || "",
    vous_gagnez: r.vous_gagnez || "",
    nuits
  };
}

function isValidReservation(r) {
  return r.start && r.end && new Date(r.end) > new Date(r.start) && r.nom;
}

function isCurrentOrFuture(r) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date((r.end || r.start) + "T00:00:00") >= today;
}

function overlapsMonth(r, date) {
  const ms = new Date(date.getFullYear(), date.getMonth(), 1);
  const me = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return new Date(r.start + "T00:00:00") < me &&
         new Date((r.end || r.start) + "T00:00:00") >= ms;
}

function overlaps(a, b) {
  return new Date(a.start + "T00:00:00") < new Date(b.end + "T00:00:00") &&
         new Date(a.end + "T00:00:00") > new Date(b.start + "T00:00:00");
}

function normalizeIcalReservation(r) {
  return {
    type: "reservation",
    source: r.source || "",
    nom: "",
    start: r.start,
    end: r.end,
    voyageurs: "",
    code: r.uid || "",
    total_paye: "",
    vous_gagnez: "",
    nuits: countNights(r.start, r.end),
    aCompleter: true
  };
}

function normalizedIcalTitle(r) {
  return cleanText(r.summary || r.title || "").toLowerCase();
}

function isGuestStay(r) {
  const source = (r.source || "").toLowerCase();
  const title = normalizedIcalTitle(r);

  if (source === "airbnb") return title === "reserved";
  // Booking étiquette TOUTE période occupée « CLOSED - Not available » (réservations
  // comme blocages), sans nom ni « Reserved ». On affiche donc tout créneau Booking,
  // sinon les vraies réservations Booking sont masquées.
  if (source === "booking") return Boolean(title);
  return false;
}

function hasExactCalendarStay(reservation, calendarRows) {
  const source = (reservation.source || "").toLowerCase();
  if (source !== "airbnb" && source !== "booking") return true;

  return calendarRows.some(row =>
    (row.source || "").toLowerCase() === source &&
    row.start === reservation.start &&
    row.end === reservation.end
  );
}

function isValidIcal(r) {
  return r.start && r.end && new Date(r.end) > new Date(r.start);
}

/* ── Notes : catégories & couleurs ────────────────────── */

const NOTE_CATS = {
  manuel:       { label: "Location manuelle", bg: "#7c3aed", fg: "#ffffff" },
  anniversaire: { label: "Anniversaire",      bg: "#f2c94c", fg: "#3b2f04" },
  perso:        { label: "Note personnelle",  bg: "#cbb891", fg: "#4a3a1f" }
};

/* Catégorie d'une note : explicite si définie, sinon devinée d'après le titre. */
function categorieNote(n) {
  if (n && NOTE_CATS[n.categorie]) return n.categorie;
  const t = ((n && (n.title || n.nom)) || "").toLowerCase();
  if (/anniv/.test(t)) return "anniversaire";
  if (/location|locat|loue|rental/.test(t)) return "manuel";
  return "perso";
}

function couleurNote(cat) {
  return NOTE_CATS[cat] || NOTE_CATS.perso;
}

function normalizeNote(n, index) {
  const start = n.start;
  const end = n.end || addDaysISO(start, 1);

  return {
    type: "note",
    id: n.id || "note_" + index + "_" + start,
    source: "Note",
    nom: cleanText(n.title || "Note"),
    title: cleanText(n.title || "Note"),
    start,
    end,
    description: String(n.description || ""),
    categorie: categorieNote(n)
  };
}

function isValidNote(n) {
  return n.start && n.title;
}

/* Le pense-bête est stocké comme une entrée spéciale (id "pensebete")
   dans le même fichier notes.json — on la réinjecte à chaque sauvegarde
   pour ne jamais la perdre. */
function itemPenseBete() {
  return {
    id: "pensebete",
    title: "pensebete",
    start: "",
    end: "",
    categorie: "",
    description: penseBeteTexte || ""
  };
}

function avecPenseBete(notes) {
  const sansPB = notes.filter(n => n.id !== "pensebete");
  return sansPB.concat([itemPenseBete()]);
}

async function saveNotes(notes) {
  await fetch(NOTES_API_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ notes: avecPenseBete(notes) })
  });

  alert("Note enregistrée. La page va se recharger.");
  setTimeout(() => location.reload(), 1500);
}

function ouvrirNoteForm(note = null, startISO = null, endISO = null) {
  const isEdit = !!note;
  const catActuelle = isEdit ? categorieNote(note) : "perso";

  const startValue = note?.start || startISO || "";
  const endValue = note?.end || endISO || addDaysISO(startValue, 1);

  document.getElementById("modalContent").innerHTML = `
    <span class="modal-source-tag note" id="noteTag">Note</span>
    <div class="modal-name">${isEdit ? "Modifier la note" : "Ajouter une note"}</div>

    <div class="modal-grid">
      <div class="modal-field">
        <label>Date début</label>
        <input id="noteStart" type="date" value="${escapeHtml(startValue)}" style="width:100%;border:none;background:transparent;font-weight:600">
      </div>

      <div class="modal-field">
        <label>Date fin</label>
        <input id="noteEnd" type="date" value="${escapeHtml(endValue)}" style="width:100%;border:none;background:transparent;font-weight:600">
      </div>

      <div class="modal-field full">
        <label>Titre</label>
        <input id="noteTitle" type="text" value="${escapeHtml(note?.title || note?.nom || "")}" placeholder="Ex : Nettoyage villa" style="width:100%;border:none;background:transparent;font-weight:600">
      </div>

      <div class="modal-field full">
        <label>Informations</label>
        <textarea id="noteDescription" rows="5" placeholder="Écris ici les informations..." style="width:100%;border:none;background:transparent;font-family:inherit;font-weight:500;resize:vertical">${escapeHtml(note?.description || "")}</textarea>
      </div>

      <div class="modal-field full">
        <label>Type de note</label>
        <div id="noteCatPicker" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
          ${Object.entries(NOTE_CATS).map(([key, c]) => `
            <button type="button" class="note-cat-btn" data-cat="${key}"
              style="flex:1;min-width:110px;border:none;border-radius:10px;padding:10px;cursor:pointer;font-weight:700;font-size:.82rem;background:${c.bg};color:${c.fg}">
              ${c.label}
            </button>`).join("")}
        </div>
      </div>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
      ${isEdit ? `<button id="deleteNoteBtn" style="background:#fee2e2;color:#991b1b;border:none;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer">Supprimer</button>` : ""}
      <button id="saveNoteBtn" style="background:#f2c94c;color:#1e293b;border:none;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer">Enregistrer</button>
    </div>

    <p style="font-size:.75rem;color:#64748b;margin-top:10px">
      Astuce : sur le calendrier, glisse ton doigt ou ta souris sur plusieurs dates pour créer une note sur plusieurs jours.
    </p>
  `;

  document.getElementById("modal").hidden = false;

  let categorieChoisie = catActuelle;
  const majPicker = () => {
    document.querySelectorAll(".note-cat-btn").forEach(b => {
      const actif = b.dataset.cat === categorieChoisie;
      b.style.outline = actif ? "3px solid #0f766e" : "none";
      b.style.outlineOffset = "1px";
      b.style.opacity = actif ? "1" : ".5";
    });
    const c = couleurNote(categorieChoisie);
    const tag = document.getElementById("noteTag");
    if (tag) { tag.style.background = c.bg; tag.style.color = c.fg; }
  };
  document.querySelectorAll(".note-cat-btn").forEach(b =>
    b.addEventListener("click", () => { categorieChoisie = b.dataset.cat; majPicker(); }));
  majPicker();

  document.getElementById("saveNoteBtn").onclick = async () => {
    const start = document.getElementById("noteStart").value;
    let end = document.getElementById("noteEnd").value;
    const title = document.getElementById("noteTitle").value.trim();
    const description = document.getElementById("noteDescription").value.trim();

    if (!start || !title) {
      alert("Date de début et titre obligatoires.");
      return;
    }

    if (!end || new Date(end) <= new Date(start)) {
      end = addDaysISO(start, 1);
    }

    let notes = [...notesGlobales];

    const nouvelleNote = {
      id: note?.id || "note_" + Date.now(),
      title,
      start,
      end,
      description,
      categorie: categorieChoisie
    };

    if (isEdit) {
      notes = notes.map(n => n.id === note.id ? nouvelleNote : n);
    } else {
      notes.push(nouvelleNote);
    }

    await saveNotes(notes);
  };

  if (isEdit && document.getElementById("deleteNoteBtn")) {
    document.getElementById("deleteNoteBtn").onclick = async () => {
      if (!confirm("Supprimer cette note ?")) return;
      const notes = notesGlobales.filter(n => n.id !== note.id);
      await saveNotes(notes);
    };
  }
}

/* ── Stats ────────────────────────────────────────────── */

function updateStats(reservations, calendarDate) {
  const duMois = reservations.filter(r => overlapsMonth(r, calendarDate));

  /* Cumul annuel : toute l'année en cours (janvier → décembre),
     d'après la date d'arrivée. Les années suivantes sont exclues. */
  const now = new Date();
  const cumul = reservations.filter(r => {
    const d = new Date(r.start + "T00:00:00");
    return d.getFullYear() === now.getFullYear();
  });

  const labelNuits = document.getElementById("labelNuitsAnnee");
  const labelRevenu = document.getElementById("labelRevenuAnnee");
  if (labelNuits) labelNuits.textContent = `Nuits en ${now.getFullYear()}`;
  if (labelRevenu) labelRevenu.textContent = `À recevoir en ${now.getFullYear()}`;

  document.getElementById("statNuitsMois").textContent =
    duMois.reduce((s, r) => s + r.nuits, 0) || "0";

  document.getElementById("statRevenuMois").textContent =
    formatEuros(duMois.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0));

  document.getElementById("statNuitsAnnee").textContent =
    cumul.reduce((s, r) => s + r.nuits, 0) || "0";

  document.getElementById("statRevenuAnnee").textContent =
    formatEuros(cumul.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0));
}

/* ── Modal réservation ────────────────────────────────── */

function ouvrirModal(r) {
  if (r.type === "note") {
    ouvrirNoteForm(r);
    return;
  }

  const src = (r.source || "Airbnb").toLowerCase();
  const srcLabel = r.source || "Airbnb";
  const nuits = r.nuits || countNights(r.start, r.end);
  const todo = r.aCompleter || !r.nom;

  document.getElementById("modalContent").innerHTML = `
    <span class="modal-source-tag ${src}">${escapeHtml(srcLabel)}</span>
    <div class="modal-name">${escapeHtml(r.nom || `${srcLabel} — informations en attente`)}</div>
    <div class="modal-grid">
      <div class="modal-field"><label>Arrivée</label><span>${formatDateFR(r.start)}</span></div>
      <div class="modal-field"><label>Départ</label><span>${formatDateFR(r.end)}</span></div>
      <div class="modal-field"><label>Nuits</label><span>${nuits || "—"}</span></div>
      <div class="modal-field"><label>Voyageurs</label><span>${escapeHtml(r.voyageurs) || "—"}</span></div>
      <div class="modal-field"><label>Tarif client</label><span class="money">${escapeHtml(cleanMoney(r.total_paye)) || "—"}</span></div>
      <div class="modal-field"><label>À recevoir</label><span class="money">${escapeHtml(cleanMoney(r.vous_gagnez)) || "—"}</span></div>
      ${r.code && !todo ? `<div class="modal-field full"><label>Code réservation</label><span>${escapeHtml(r.code)}</span></div>` : ""}
    </div>
    ${todo ? `<div class="modal-note">Les nuits sont confirmées par le calendrier ${escapeHtml(srcLabel)}. Les autres informations seront ajoutées dès que le mail sera reconnu.</div>` : ""}
  `;

  document.getElementById("modal").hidden = false;
}

function fermerModal() {
  /* si une sauvegarde du pense-bête était en attente, on l'envoie tout de suite */
  if (penseBeteSaveTimer) sauverPenseBete();
  document.getElementById("modal").hidden = true;
}

document.getElementById("modalClose").addEventListener("click", fermerModal);
document.getElementById("modal").addEventListener("click", e => {
  if (e.target === e.currentTarget) fermerModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") fermerModal();
});

/* ── Sidebar ──────────────────────────────────────────── */

function sourceClass(source, type) {
  if (type === "note") return "note";
  const s = (source || "").toLowerCase();
  if (s === "booking") return "booking";
  if (s === "manuel") return "manuel";
  return "airbnb";
}

function cleKey(r) {
  return r.id || r.code || r.nom || (r.start + "_" + (r.end || r.start));
}

function cardReservation(r) {
  const sc = sourceClass(r.source, r.type);

  if (r.type === "note") {
    const c = couleurNote(r.categorie);
    return `
      <article class="reservation-item note" data-key="${escapeHtml(cleKey(r))}" style="border-left-color:${c.bg}">
        <div class="res-header">
          <div class="res-name">${escapeHtml(r.nom)}</div>
          <span class="res-source note" style="background:${c.bg};color:${c.fg}">${escapeHtml(c.label)}</span>
        </div>
        <div class="res-dates">📝 ${formatDateFR(r.start)} → ${formatDateFR(r.end)}</div>
        <div class="res-meta"><span>${escapeHtml(r.description || "").split("\n")[0] || "Voir le détail"}</span></div>
      </article>
    `;
  }

  const nuits = r.nuits || countNights(r.start, r.end);
  const todo = r.aCompleter || !r.nom;
  const nom = r.nom || `${r.source || "Plateforme"} — informations en attente`;

  return `
    <article class="reservation-item ${sc}${todo ? " acompleter" : ""}" data-key="${escapeHtml(cleKey(r))}">
      <div class="res-header">
        <div class="res-name">${escapeHtml(nom)}</div>
        <span class="res-source ${sc}">${escapeHtml(r.source || "Airbnb")}</span>
      </div>
      <div class="res-dates">📅 ${formatDateFR(r.start)} → ${formatDateFR(r.end)}</div>
      <div class="res-meta">
        <span>🌙 ${nuits} nuit${nuits > 1 ? "s" : ""}</span>
        ${r.voyageurs ? `<span>👥 ${escapeHtml(r.voyageurs)}</span>` : ""}
        ${cleanMoney(r.vous_gagnez) ? `<span>💰 ${escapeHtml(cleanMoney(r.vous_gagnez))}</span>` : ""}
        ${todo ? `<span class="res-todo">à compléter</span>` : ""}
      </div>
    </article>
  `;
}

function afficherListeMois(items, calendarDate, onClickRes) {
  const container = document.getElementById("monthReservations");
  const monthName = calendarDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  document.getElementById("monthTitle").textContent = `Réservations — ${monthName}`;

  const list = items.filter(r => overlapsMonth(r, calendarDate));

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">🏖️<br>Aucune réservation ou note ce mois.</div>`;
    return;
  }

  container.innerHTML = list.map(cardReservation).join("");

  list.forEach(r => {
    const el = container.querySelector(`[data-key="${CSS.escape(cleKey(r))}"]`);
    if (el) el.addEventListener("click", () => onClickRes(r));
  });
}

/* ── Chargement des données ───────────────────────────── */

/* Même clé que dans scripts/sync-ical.js et sync-airbnb-gmail.js */
function reservationKeyBrute(d) {
  return d.code || [d.source, d.nom, d.start, d.end].join("|");
}

async function chargerDonnees() {
  const [details, bloque, notesJson, annuleesJson] = await Promise.all([
    loadJson("./data/reservations_details.json"),
    loadJson("./data/reservations.json"),
    loadJson("./data/notes.json"),
    loadJsonOptionnel("./data/annulations.json")
  ]);

  /* Annulées = déduites par la synchro (plus au calendrier plateforme) :
     on les ignore partout, affichage comme statistiques. */
  const annulations = new Set(annuleesJson.map(a => a.key));
  const detailsActifs = details.filter(d => !annulations.has(reservationKeyBrute(d)));

  const reservations = detailsActifs
    .map(normalizeReservation)
    .filter(isValidReservation)
    .filter(isCurrentOrFuture)
    .filter(r => hasExactCalendarStay(r, bloque))
    .sort((a, b) => a.start.localeCompare(b.start));

  const reservationsAuto = bloque
    .filter(isGuestStay)
    .map(normalizeIcalReservation)
    .filter(isValidIcal)
    .filter(isCurrentOrFuture)
    .filter(g => !reservations.some(r => overlaps(r, g)));

  /* Les séjours déjà terminés servent aux statistiques cumulées
     (ils ne sont plus dans les iCal des plateformes, on garde les détails mail). */
  const passees = detailsActifs
    .map(normalizeReservation)
    .filter(isValidReservation)
    .filter(r => !isCurrentOrFuture(r));

  /* Extrait le pense-bête (entrée spéciale) et le retire des notes datées. */
  const pbItem = notesJson.find(n => n.id === "pensebete");
  const pbTexte = pbItem ? (pbItem.description || pbItem.text || "") : "";
  const notesDatees = notesJson.filter(n => n.id !== "pensebete");

  const nouvellesNotes = notesDatees.map((n, i) => ({
    id: n.id || "note_" + i + "_" + n.start,
    title: n.title || "Note",
    start: n.start,
    end: n.end || addDaysISO(n.start, 1),
    description: n.description || "",
    categorie: categorieNote(n)
  }));

  const notes = nouvellesNotes
    .map(normalizeNote)
    .filter(isValidNote)
    .filter(isCurrentOrFuture);

  const aVenir = reservations.concat(reservationsAuto)
    .sort((a, b) => a.start.localeCompare(b.start));
  const toutes = aVenir.concat(notes)
    .sort((a, b) => a.start.localeCompare(b.start));

  return {
    snapshot: JSON.stringify({ details, bloque, notesJson, annuleesJson }),
    toutes,
    aVenir,
    stats: passees.concat(aVenir),
    notes: nouvellesNotes,
    penseBete: pbTexte
  };
}

function appliquerDonnees(d) {
  dernierSnapshot = d.snapshot;
  toutesGlobal = d.toutes;
  reservationsAVenir = d.aVenir;
  reservationsStats = d.stats;
  notesGlobales = d.notes;
  /* On garde la version locale pendant ~3 min après une modification, le temps
     que GitHub Pages republie notes.json (sinon la tâche cochée réapparaîtrait). */
  if (Date.now() > penseBeteDirtyUntil) penseBeteTexte = d.penseBete || "";
}

function versEvenements(items) {
  return items.map(r => {
    if (r.type === "note") {
      const c = couleurNote(r.categorie);
      return {
        title: "📝 " + r.nom,
        start: r.start,
        end: r.end,
        allDay: true,
        color: c.bg,
        textColor: c.fg,
        display: "block",
        extendedProps: r
      };
    }

    const sc = sourceClass(r.source, r.type);
    const colors = { airbnb: "#ff385c", booking: "#006ce4", manuel: "#7c3aed" };

    return {
      title: r.aCompleter ? `${r.source} — informations en attente` : r.nom,
      start: r.start,
      end: r.end,
      allDay: true,
      color: colors[sc] || "#ff385c",
      display: "block",
      classNames: r.aCompleter ? ["fc-acompleter"] : [],
      extendedProps: r
    };
  });
}

/* ── Rafraîchissement automatique (30 s) ──────────────── */

function majIndicateur() {
  const el = document.getElementById("lastUpdate");
  if (!el) return;
  const n = reservationsAVenir.length;
  const heure = new Date().toLocaleTimeString("fr-FR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
  el.textContent =
    (n ? `${n} réservation${n > 1 ? "s" : ""} à venir` : "Aucune réservation à venir")
    + ` · actualisé à ${heure}`;
}

function signalerMaj() {
  const badge = document.getElementById("liveBadge");
  if (!badge) return;
  badge.classList.add("flash");
  setTimeout(() => badge.classList.remove("flash"), 2500);
}

function majAffichage() {
  if (!calendar) return;
  calendar.refetchEvents();
  const dateCourante = calendar.view.currentStart;
  afficherListeMois(toutesGlobal, dateCourante, ouvrirModal);
  updateStats(reservationsStats, dateCourante);
}

async function rafraichir() {
  try {
    const d = await chargerDonnees();
    if (d.snapshot !== dernierSnapshot) {
      appliquerDonnees(d);
      majAffichage();
      signalerMaj();
    }
    majIndicateur();
  } catch {
    /* réseau indisponible : on garde les données affichées */
  }
}

/* ── Synchronisation forcée ───────────────────────────── */

/* Demande au robot GitHub d'aller rechercher immédiatement les calendriers
   Airbnb/Booking (via le script Google, qui déclenche le workflow).
   Le résultat s'affiche tout seul grâce au rafraîchissement auto (30 s). */
function initBoutonSync() {
  const btn = document.getElementById("btnForceSync");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "⏳ Lancement…";

    try {
      await fetch(NOTES_API_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({ action: "sync" })
      });
      btn.textContent = "✓ Synchro en cours (~2 min)";
      /* anti-spam : on laisse le temps à la synchro de finir */
      setTimeout(() => {
        btn.textContent = "🔄 Forcer la synchro";
        btn.disabled = false;
      }, 120000);
    } catch {
      btn.textContent = "✗ Échec — réessayer";
      setTimeout(() => {
        btn.textContent = "🔄 Forcer la synchro";
        btn.disabled = false;
      }, 5000);
    }
  });
}

/* ── Pense-bête (liste de tâches à cocher, partagée) ──── */

let penseBeteSaveTimer = null;

function penseBeteTaches() {
  return penseBeteTexte.split("\n").map(t => t.trim()).filter(Boolean);
}

function rendrePenseBeteListe() {
  const liste = document.getElementById("pbListe");
  if (!liste) return;
  const taches = penseBeteTaches();

  if (taches.length === 0) {
    liste.innerHTML = `<li class="pb-vide">Rien à faire 🎉<br>Ajoute une tâche ci-dessus.</li>`;
    return;
  }

  liste.innerHTML = taches.map((t, i) => `
    <li class="pb-item" data-i="${i}">
      <label>
        <input type="checkbox" class="pb-check" aria-label="Marquer comme fait">
        <span class="pb-texte">${escapeHtml(t)}</span>
      </label>
    </li>
  `).join("");

  liste.querySelectorAll(".pb-check").forEach(chk => {
    chk.addEventListener("change", () => {
      const li = chk.closest(".pb-item");
      const idx = Number(li.dataset.i);
      li.classList.add("pb-done");           /* petite animation avant retrait */
      setTimeout(() => {
        const restantes = penseBeteTaches();
        restantes.splice(idx, 1);
        penseBeteTexte = restantes.join("\n");
        rendrePenseBeteListe();
        programmerSavePenseBete();
      }, 320);
    });
  });
}

function ajouterTache(texte) {
  texte = (texte || "").trim();
  if (!texte) return;
  penseBeteTexte = penseBeteTaches().concat([texte]).join("\n");
  rendrePenseBeteListe();
  programmerSavePenseBete();
}

function ouvrirPenseBete() {
  document.getElementById("modalContent").innerHTML = `
    <span class="modal-source-tag pensebete">📝 Pense-bête</span>
    <div class="modal-name pensebete-titre">Choses à faire</div>

    <div class="pb-ajout">
      <input id="pbInput" type="text" placeholder="Ajouter une tâche… (ex : acheter du gaz)" />
      <button id="pbAdd" class="pb-add">＋ Ajouter</button>
    </div>

    <ul class="pb-liste" id="pbListe"></ul>

    <p class="pb-hint" id="pbStatut">🔒 Partagé sur tous les téléphones · coche une tâche pour la retirer.</p>
  `;

  document.getElementById("modal").hidden = false;
  rendrePenseBeteListe();

  const input = document.getElementById("pbInput");
  input.focus();
  const valider = () => { ajouterTache(input.value); input.value = ""; input.focus(); };
  document.getElementById("pbAdd").onclick = valider;
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); valider(); }
  });
}

/* Sauvegarde différée (regroupe plusieurs coches rapides en un seul envoi). */
function programmerSavePenseBete() {
  penseBeteDirtyUntil = Date.now() + 180000;
  const statut = document.getElementById("pbStatut");
  if (statut) statut.textContent = "💾 Enregistrement…";
  clearTimeout(penseBeteSaveTimer);
  penseBeteSaveTimer = setTimeout(sauverPenseBete, 700);
}

async function sauverPenseBete() {
  clearTimeout(penseBeteSaveTimer);
  penseBeteSaveTimer = null;
  penseBeteDirtyUntil = Date.now() + 180000;

  const datees = notesGlobales.map(n => ({
    id: n.id, title: n.title, start: n.start,
    end: n.end, categorie: n.categorie, description: n.description
  }));

  try {
    await fetch(NOTES_API_URL, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify({ notes: avecPenseBete(datees) })
    });
    const statut = document.getElementById("pbStatut");
    if (statut) statut.textContent = "✓ Enregistré · partagé sur tous les téléphones.";
  } catch {
    const statut = document.getElementById("pbStatut");
    if (statut) statut.textContent = "✗ Échec de l'enregistrement — réessaie.";
  }
}

function initBoutonPenseBete() {
  const btn = document.getElementById("btnPenseBete");
  if (btn) btn.addEventListener("click", ouvrirPenseBete);
}

/* ── Init calendrier ──────────────────────────────────── */

async function chargerCalendrier() {
  try {
    appliquerDonnees(await chargerDonnees());
  } catch {
    appliquerDonnees({ snapshot: "", toutes: [], aVenir: [], stats: [], notes: [] });
  }

  calendar = new FullCalendar.Calendar(document.getElementById("calendar"), {
    fixedWeekCount: false,
    showNonCurrentDates: false,
    initialView: "dayGridMonth",
    initialDate: reservationsAVenir.length
      ? reservationsAVenir[0].start
      : new Date().toISOString().slice(0, 10),
    locale: "fr",
    firstDay: 1,
    height: "auto",

    selectable: true,
    selectMirror: true,
    longPressDelay: 300,
    selectLongPressDelay: 300,
    unselectAuto: true,

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listYear"
    },

    views: {
      listYear: { type: "list", duration: { years: 1 }, buttonText: "Liste" }
    },

    buttonText: {
      today: "Aujourd'hui",
      month: "Mois"
    },

    events(info, success) {
      success(versEvenements(toutesGlobal));
    },

    select(info) {
      ouvrirNoteForm(null, info.startStr, info.endStr);
    },

    dateClick(info) {
      ouvrirNoteForm(null, info.dateStr, addDaysISO(info.dateStr, 1));
    },

    datesSet(info) {
      afficherListeMois(toutesGlobal, info.view.currentStart, ouvrirModal);
      updateStats(reservationsStats, info.view.currentStart);
    },

    eventClick(info) {
      ouvrirModal(info.event.extendedProps);
    }
  });

  calendar.render();
  majIndicateur();
  initBoutonSync();
  initBoutonPenseBete();

  setInterval(rafraichir, REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) rafraichir();
  });
}

chargerCalendrier();
