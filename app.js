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

function cleanMultiline(value) {
  if (!value) return "";
  return String(value)
    .replace(/[^a-zA-ZÀ-ÿ0-9 '\-.,€\n]/g, "")
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
  return String(value || "")
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
    type: "reservation",
    source: r.source || "Airbnb",
    nom: cleanText(r.nom || ""),
    start: r.start,
    end: r.end,
    voyageurs: cleanText(r.voyageurs || ""),
    code: r.code || "",
    total_paye: r.total_paye || "",
    vous_gagnez: r.vous_gagnez || "",
    nuits: nuits
  };
}

function normalizeNote(n) {
  return {
    type: "note",
    source: "Note",
    nom: cleanText(n.title || "Note"),
    start: n.start,
    end: n.end || n.start,
    description: cleanMultiline(n.description || "")
  };
}

function isValidReservation(r) {
  return r.start && r.end && new Date(r.end) > new Date(r.start) && r.nom;
}

function isValidNote(n) {
  return n.start && n.nom;
}

function isCurrentOrFuture(r) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = r.end || r.start;
  return new Date(end + "T00:00:00") >= today;
}

function overlapsMonth(r, date) {
  const ms = new Date(date.getFullYear(), date.getMonth(), 1);
  const me = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const start = new Date(r.start + "T00:00:00");
  const end = new Date((r.end || r.start) + "T00:00:00");
  return start < me && end >= ms;
}

function overlaps(a, b) {
  return new Date(a.start + "T00:00:00") < new Date(b.end + "T00:00:00")
      && new Date(a.end + "T00:00:00") > new Date(b.start + "T00:00:00");
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

  const duMois = reservations.filter(r => overlapsMonth(r, calendarDate));
  const deJanvierAuMoisActuel = reservations.filter(r => {
    const d = new Date(r.start + "T00:00:00");
    return d.getFullYear() === year && d.getMonth() <= calendarDate.getMonth();
  });

  const nuitsMois = duMois.reduce((s, r) => s + r.nuits, 0);
  const revenuMois = duMois.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0);
  const nuitsAnnee = deJanvierAuMoisActuel.reduce((s, r) => s + r.nuits, 0);
  const revenuAnnee = deJanvierAuMoisActuel.reduce((s, r) => s + parseEuros(r.vous_gagnez), 0);

  document.getElementById("statNuitsMois").textContent = nuitsMois || "0";
  document.getElementById("statRevenuMois").textContent = formatEuros(revenuMois);
  document.getElementById("statNuitsAnnee").textContent = nuitsAnnee || "0";
  document.getElementById("statRevenuAnnee").textContent = formatEuros(revenuAnnee);
}

/* ── Modal ────────────────────────────────────────────── */

function ouvrirModal(r) {
  if (r.type === "note") {
    document.getElementById("modalContent").innerHTML = `
      <span class="modal-source-tag note">Note</span>
      <div class="modal-name">${escapeHtml(r.nom || "Note")}</div>
      <div class="modal-grid">
        <div class="modal-field full">
          <label>Date</label>
          <span>${formatDateFR(r.start)}</span>
        </div>
        <div class="modal-field full">
          <label>Informations</label>
          <span style="white-space:pre-line">${escapeHtml(r.description || "—")}</span>
        </div>
      </div>
    `;
    document.getElementById("modal").hidden = false;
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
      ${r.code && !todo ? `<div class="modal-field full"><label>Code réservation</label><span>${escapeHtml(r.code)}</span></div>` : ""}
    </div>
    ${todo ? `<div class="modal-note">ℹ️ Réservation Booking synchronisée automatiquement, dates seules.</div>` : ""}
    ${r.code && !todo ? `<div class="modal-code">Référence : ${escapeHtml(r.code)}</div>` : ""}
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
  return r.code || r.nom || (r.start + "_" + (r.end || r.start));
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
        <div class="res-dates">📝 ${formatDateFR(r.start)}</div>
        <div class="res-meta">
          <span>${escapeHtml(r.description || "").split("\n")[0] || "Voir le détail"}</span>
        </div>
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
  const notes = notesJson
    .map(normalizeNote)
    .filter(isValidNote)
    .filter(isCurrentOrFuture);

  const toutes = reservations
    .concat(bookingAuto)
    .concat(notes)
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
        end: r.start,
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

  const calendar = new FullCalendar.Calendar(
    document.getElementById("calendar"),
    {
      initialView: "dayGridMonth",
      initialDate: initDate || new Date().toISOString().slice(0, 10),
      locale: "fr",
      firstDay: 1,
      height: "auto",

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

      eventDidMount(info) {
        const r = info.event.extendedProps;
        if (r.type === "note") {
          info.el.title = r.description || r.nom;
        } else if (r.nuits > 1) {
          info.el.title = `${info.event.title} — ${r.nuits} nuits`;
        }
      },

      datesSet(info) {
        const date = info.view.currentStart;
        afficherListeMois(toutes, date, ouvrirModal);
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
