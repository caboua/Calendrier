/* ── Helpers ──────────────────────────────────────────── */

function formatDateFR(dateText) {
  if (!dateText) return "—";
  return new Date(dateText + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric", month: "long", year: "numeric"
  });
}

function cleanText(value) {
  if (!value) return "";
  return String(value)
    .replace(/[^a-zA-ZÀ-ÿ0-9 '\-.,€]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMoney(value) {
  if (!value) return "";
  const text = String(value)
    .replace(/[^\d,.\s]/g, "")
    .trim();
  return text ? text + " €" : "";
}

function escapeHtml(value) {
  return String(cleanText(value) || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countNights(start, end) {
  if (!start || !end) return 0;
  return Math.round((new Date(end) - new Date(start)) / 86400000);
}

function normalizeReservation(r) {
  const nuits = r.nuits || countNights(r.start, r.end);
  return {
    source:       r.source || "Airbnb",
    nom:          cleanText(r.nom || ""),
    start:        r.start,
    end:          r.end,
    voyageurs:    cleanText(r.voyageurs || ""),
    code:         r.code || "",
    total_paye:   r.total_paye || "",
    vous_gagnez:  r.vous_gagnez || "",
    nuits:        nuits
  };
}

function isValidReservation(r) {
  return r.start && r.end && new Date(r.end) > new Date(r.start) && r.nom;
}

function isCurrentOrFuture(r) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(r.end + "T00:00:00") >= today;
}

function overlapsMonth(r, date) {
  const ms = new Date(date.getFullYear(), date.getMonth(), 1);
  const me = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return new Date(r.start + "T00:00:00") < me
      && new Date(r.end   + "T00:00:00") > ms;
}

async function loadJson(path) {
  try {
    const res = await fetch(path + "?v=" + Date.now());
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

/* ── Stats ────────────────────────────────────────────── */

function parseEuros(value) {
  if (!value) return 0;
  const n = parseFloat(String(value).replace(/[^\d,]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function formatEuros(n) {
  return n > 0 ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €" : "—";
}

function updateStats(reservations, calendarDate) {
  const year = calendarDate.getFullYear();

  const duMois   = reservations.filter(r => overlapsMonth(r, calendarDate));
  const delannee = reservations.filter(r =>
    new Date(r.start + "T00:00:00").getFullYear() === year ||
    new Date(r.end   + "T00:00:00").getFullYear() === year
  );

  const nuitsMois    = duMois.reduce((s, r) => s + r.nuits, 0);
  const revenuMois   = duMois.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0);
  const nuitsAnnee   = delannee.reduce((s, r) => s + r.nuits, 0);
  const revenuAnnee  = delannee.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0);

  document.getElementById("statNuitsMois").textContent    = nuitsMois || "0";
  document.getElementById("statRevenuMois").textContent   = formatEuros(revenuMois);
  document.getElementById("statNuitsAnnee").textContent   = nuitsAnnee || "0";
  document.getElementById("statRevenuAnnee").textContent  = formatEuros(revenuAnnee);
}

/* ── Modal ────────────────────────────────────────────── */

function ouvrirModal(r) {
  const src = (r.source || "Airbnb").toLowerCase();
  const srcLabel = r.source || "Airbnb";
  const nuits = r.nuits || countNights(r.start, r.end);

  document.getElementById("modalContent").innerHTML = `
    <span class="modal-source-tag ${src}">${escapeHtml(srcLabel)}</span>
    <div class="modal-name">${escapeHtml(r.nom)}</div>
    <div class="modal-grid">
      <div class="modal-field">
        <label>Arrivée</label>
        <span>${formatDateFR(r.start)}</span>
      </div>
      <div class="modal-field">
        <label>Départ</label>
        <span>${formatDateFR(r.end)}</span>
      </div>
      <div class="modal-field">
        <label>Nuits</label>
        <span>${nuits || "—"}</span>
      </div>
      <div class="modal-field">
        <label>Voyageurs</label>
        <span>${escapeHtml(r.voyageurs) || "—"}</span>
      </div>
      <div class="modal-field">
        <label>Tarif client</label>
        <span class="money">${escapeHtml(cleanMoney(r.total_paye)) || "—"}</span>
      </div>
      <div class="modal-field">
        <label>À recevoir</label>
        <span class="money">${escapeHtml(cleanMoney(r.vous_gagnez)) || "—"}</span>
      </div>
      ${r.code ? `<div class="modal-field full"><label>Code réservation</label><span>${escapeHtml(r.code)}</span></div>` : ""}
    </div>
    ${r.code ? `<div class="modal-code">Référence : ${escapeHtml(r.code)}</div>` : ""}
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

/* ── Sidebar (liste du mois) ──────────────────────────── */

function sourceClass(source) {
  const s = (source || "").toLowerCase();
  if (s === "booking") return "booking";
  if (s === "manuel")  return "manuel";
  return "airbnb";
}

function cardReservation(r) {
  const sc = sourceClass(r.source);
  const nuits = r.nuits || countNights(r.start, r.end);
  return `
    <article class="reservation-item ${sc}" data-key="${escapeHtml(r.code || r.nom)}">
      <div class="res-header">
        <div class="res-name">${escapeHtml(r.nom)}</div>
        <span class="res-source ${sc}">${escapeHtml(r.source || "Airbnb")}</span>
      </div>
      <div class="res-dates">
        📅 ${formatDateFR(r.start)} → ${formatDateFR(r.end)}
      </div>
      <div class="res-meta">
        <span>🌙 ${nuits} nuit${nuits > 1 ? "s" : ""}</span>
        ${r.voyageurs ? `<span>👥 ${escapeHtml(r.voyageurs)}</span>` : ""}
        ${cleanMoney(r.vous_gagnez) ? `<span>💰 ${escapeHtml(cleanMoney(r.vous_gagnez))}</span>` : ""}
      </div>
    </article>
  `;
}

function afficherListeMois(reservations, calendarDate, onClickRes) {
  const container = document.getElementById("monthReservations");
  const monthName = calendarDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  document.getElementById("monthTitle").textContent = `Réservations — ${monthName}`;

  const list = reservations.filter(r => overlapsMonth(r, calendarDate));
  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">🏖️<br>Aucune réservation ce mois.</div>`;
    return;
  }

  container.innerHTML = list.map(cardReservation).join("");

  list.forEach(r => {
    const key = r.code || r.nom;
    const el = container.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (el) el.addEventListener("click", () => onClickRes(r));
  });
}

/* ── Init calendrier ──────────────────────────────────── */

async function chargerCalendrier() {
  const details      = await loadJson("./data/reservations_details.json");
  const reservations = details
    .map(normalizeReservation)
    .filter(isValidReservation)
    .filter(isCurrentOrFuture)
    .sort((a, b) => a.start.localeCompare(b.start));

  const lastUpdate = document.getElementById("lastUpdate");
  lastUpdate.textContent = reservations.length
    ? `${reservations.length} réservation${reservations.length > 1 ? "s" : ""} chargée${reservations.length > 1 ? "s" : ""}`
    : "Aucune réservation à venir.";

  const events = reservations.map(r => {
    const sc = sourceClass(r.source);
    const colors = { airbnb: "#ff5a5f", booking: "#0071c2", manuel: "#7c3aed" };
    return {
      title:         r.nom,
      start:         r.start,
      end:           r.end,
      allDay:        true,
      color:         colors[sc] || "#ff5a5f",
      display:       "block",
      extendedProps: r
    };
  });

  const initDate = reservations.find(r => isCurrentOrFuture(r))?.start;

  const calendar = new FullCalendar.Calendar(
    document.getElementById("calendar"),
    {
      initialView:  "dayGridMonth",
      initialDate:  initDate || new Date().toISOString().slice(0, 10),
      locale:       "fr",
      firstDay:     1,
      height:       "auto",

      headerToolbar: {
        left:   "prev,next today",
        center: "title",
        right:  "dayGridMonth,listYear"
      },

      views: {
        listYear: { type: "list", duration: { years: 1 }, buttonText: "Liste" }
      },

      buttonText: {
        today: "Aujourd'hui",
        month: "Mois"
      },

      events,

      eventDidMount(info) {
        const nuits = info.event.extendedProps.nuits;
        if (nuits > 1) info.el.title = `${info.event.title} — ${nuits} nuits`;
      },

      datesSet(info) {
        const date = info.view.currentStart;
        afficherListeMois(reservations, date, ouvrirModal);
        updateStats(reservations, date);
      },

      eventClick(info) {
        ouvrirModal(info.event.extendedProps);
      }
    }
  );

  calendar.render();
}

chargerCalendrier();
