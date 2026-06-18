/* ── Configuration ────────────────────────────────────── */

const NOTES_API_URL = "https://script.google.com/macros/s/AKfycbyT5F1dLPELwdLbsedvIlzyLo_iZVP36LynNBokLYDMgiez5AlwrkbfbT3m-TVA4l0q1g/exec";

let notesGlobales = [];

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
  try {
    const res = await fetch(path + "?v=" + Date.now());
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
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

function normalizeIcalBooking(r) {
  return {
    type: "reservation",
    source: "Booking",
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

function isValidIcal(r) {
  return r.start && r.end && new Date(r.end) > new Date(r.start);
}

/* ── Notes jaunes ─────────────────────────────────────── */

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
    description: String(n.description || "")
  };
}

function isValidNote(n) {
  return n.start && n.title;
}

async function saveNotes(notes) {
  await fetch(NOTES_API_URL, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ notes })
  });

  alert("Note enregistrée. La page va se recharger.");
  setTimeout(() => location.reload(), 1500);
}

function ouvrirNoteForm(note = null, startISO = null, endISO = null) {
  const isEdit = !!note;

  const startValue = note?.start || startISO || "";
  const endValue = note?.end || endISO || addDaysISO(startValue, 1);

  document.getElementById("modalContent").innerHTML = `
    <span class="modal-source-tag note">Note jaune</span>
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
      description
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
  const year = calendarDate.getFullYear();

  const duMois = reservations.filter(r => overlapsMonth(r, calendarDate));
  const deJanvierAuMoisActuel = reservations.filter(r => {
    const d = new Date(r.start + "T00:00:00");
    return d.getFullYear() === year && d.getMonth() <= calendarDate.getMonth();
  });

  document.getElementById("statNuitsMois").textContent =
    duMois.reduce((s, r) => s + r.nuits, 0) || "0";

  document.getElementById("statRevenuMois").textContent =
    formatEuros(duMois.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0));

  document.getElementById("statNuitsAnnee").textContent =
    deJanvierAuMoisActuel.reduce((s, r) => s + r.nuits, 0) || "0";

  document.getElementById("statRevenuAnnee").textContent =
    formatEuros(deJanvierAuMoisActuel.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0));
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
    <div class="modal-name">${escapeHtml(r.nom || "Réservation Booking")}</div>
    <div class="modal-grid">
      <div class="modal-field"><label>Arrivée</label><span>${formatDateFR(r.start)}</span></div>
      <div class="modal-field"><label>Départ</label><span>${formatDateFR(r.end)}</span></div>
      <div class="modal-field"><label>Nuits</label><span>${nuits || "—"}</span></div>
      <div class="modal-field"><label>Voyageurs</label><span>${escapeHtml(r.voyageurs) || "—"}</span></div>
      <div class="modal-field"><label>Tarif client</label><span class="money">${escapeHtml(cleanMoney(r.total_paye)) || "—"}</span></div>
      <div class="modal-field"><label>À recevoir</label><span class="money">${escapeHtml(cleanMoney(r.vous_gagnez)) || "—"}</span></div>
      ${r.code && !todo ? `<div class="modal-field full"><label>Code réservation</label><span>${escapeHtml(r.code)}</span></div>` : ""}
    </div>
    ${todo ? `<div class="modal-note">ℹ️ Réservation Booking synchronisée automatiquement, dates seules.</div>` : ""}
  `;

  document.getElementById("modal").hidden = false;
}

function fermerModal() {
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
    return `
      <article class="reservation-item note" data-key="${escapeHtml(cleKey(r))}">
        <div class="res-header">
          <div class="res-name">${escapeHtml(r.nom)}</div>
          <span class="res-source note">Note</span>
        </div>
        <div class="res-dates">📝 ${formatDateFR(r.start)} → ${formatDateFR(r.end)}</div>
        <div class="res-meta"><span>${escapeHtml(r.description || "").split("\n")[0] || "Voir le détail"}</span></div>
      </article>
    `;
  }

  const nuits = r.nuits || countNights(r.start, r.end);
  const todo = r.aCompleter || !r.nom;
  const nom = r.nom || "Réservation Booking";

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

/* ── Init calendrier ──────────────────────────────────── */

async function chargerCalendrier() {
  const details = await loadJson("./data/reservations_details.json");
  const reservations = details
    .map(normalizeReservation)
    .filter(isValidReservation)
    .filter(isCurrentOrFuture)
    .sort((a, b) => a.start.localeCompare(b.start));

  const bloque = await loadJson("./data/reservations.json");
  const bookingAuto = bloque
    .filter(r => (r.source || "").toLowerCase() === "booking")
    .map(normalizeIcalBooking)
    .filter(isValidIcal)
    .filter(isCurrentOrFuture)
    .filter(g => !reservations.some(r => overlaps(r, g)));

  const notesJson = await loadJson("./data/notes.json");
  notesGlobales = notesJson.map((n, i) => ({
    id: n.id || "note_" + i + "_" + n.start,
    title: n.title || "Note",
    start: n.start,
    end: n.end || addDaysISO(n.start, 1),
    description: n.description || ""
  }));

  const notes = notesGlobales
    .map(normalizeNote)
    .filter(isValidNote)
    .filter(isCurrentOrFuture);

  const toutes = reservations.concat(bookingAuto).concat(notes)
    .sort((a, b) => a.start.localeCompare(b.start));

  const lastUpdate = document.getElementById("lastUpdate");
  lastUpdate.textContent = toutes.length
    ? `${toutes.length} élément${toutes.length > 1 ? "s" : ""} chargé${toutes.length > 1 ? "s" : ""}`
    : "Aucune réservation à venir.";

  const events = toutes.map(r => {
    if (r.type === "note") {
      return {
        title: "📝 " + r.nom,
        start: r.start,
        end: r.end,
        allDay: true,
        color: "#f2c94c",
        textColor: "#1e293b",
        display: "block",
        extendedProps: r
      };
    }

    const sc = sourceClass(r.source, r.type);
    const colors = { airbnb: "#ff5a5f", booking: "#0071c2", manuel: "#7c3aed" };

    return {
      title: r.aCompleter ? "Booking — à compléter" : r.nom,
      start: r.start,
      end: r.end,
      allDay: true,
      color: colors[sc] || "#ff5a5f",
      display: "block",
      classNames: r.aCompleter ? ["fc-acompleter"] : [],
      extendedProps: r
    };
  });

  const initDate = toutes.find(r => isCurrentOrFuture(r))?.start;

  const calendar = new FullCalendar.Calendar(document.getElementById("calendar"), {
    initialView: "dayGridMonth",
    initialDate: initDate || new Date().toISOString().slice(0, 10),
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

    events,

    select(info) {
      ouvrirNoteForm(null, info.startStr, info.endStr);
    },

    dateClick(info) {
      ouvrirNoteForm(null, info.dateStr, addDaysISO(info.dateStr, 1));
    },

    datesSet(info) {
      afficherListeMois(toutes, info.view.currentStart, ouvrirModal);
      updateStats(reservations, info.view.currentStart);
    },

    eventClick(info) {
      ouvrirModal(info.event.extendedProps);
    }
  });

  calendar.render();
}

chargerCalendrier();
