function formatDateFR(dateText) {
  if (!dateText) return "Non disponible";
  return new Date(dateText + "T00:00:00").toLocaleDateString("fr-FR");
}

function cleanText(value) {
  if (!value) return "";
  return String(value)
    .replace(/�/g, "")
    .replace(/\?/g, "é")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMoney(value) {
  if (!value) return "";
  const text = String(value)
    .replace(/�/g, "")
    .replace(/\?/g, "")
    .replace(/€/g, "")
    .trim();
  return text ? text + " €" : "";
}

function displayText(value) {
  return escapeHtml(value) || "À compléter";
}

function displayMoney(value) {
  return cleanMoney(value) || "À compléter";
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isValidReservation(r) {
  if (!r.start || !r.end) return false;
  return new Date(r.end) > new Date(r.start);
}

function countNights(start, end) {
  if (!start || !end) return "";
  return Math.round((new Date(end) - new Date(start)) / 86400000);
}

function normalizeReservation(r) {
  return {
    source: r.source || "",
    nom: cleanText(r.nom || ""),
    start: r.start,
    end: r.end,
    voyageurs: cleanText(r.voyageurs || ""),
    total_paye: r.total_paye || "",
    vous_gagnez: r.vous_gagnez || "",
    nuits: r.nuits || countNights(r.start, r.end)
  };
}

function isCompleteReservation(r) {
  return isValidReservation(r)
    && cleanText(r.nom) !== "";
}

function isCurrentOrFutureReservation(r) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(r.end + "T00:00:00") >= today;
}

function overlapsMonth(r, calendarDate) {
  const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const monthEnd = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  const start = new Date(r.start + "T00:00:00");
  const end = new Date(r.end + "T00:00:00");
  return start < monthEnd && end > monthStart;
}

async function loadJson(path) {
  try {
    const response = await fetch(path + "?v=" + Date.now());
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function buildReservations(details) {
  return details
    .map(normalizeReservation)
    .filter(isCompleteReservation)
    .filter(isCurrentOrFutureReservation)
    .sort((a, b) => a.start.localeCompare(b.start));
}

function reservationRows(r) {
  return `
    <dl class="reservation-details">
      <div><dt>Nom</dt><dd>${escapeHtml(r.nom)}</dd></div>
      <div><dt>Arrivée</dt><dd>${formatDateFR(r.start)}</dd></div>
      <div><dt>Départ</dt><dd>${formatDateFR(r.end)}</dd></div>
      <div><dt>Nuits</dt><dd>${displayText(r.nuits)}</dd></div>
      <div><dt>Personnes</dt><dd>${displayText(r.voyageurs)}</dd></div>
      <div><dt>Tarif client</dt><dd>${displayMoney(r.total_paye)}</dd></div>
      <div><dt>À recevoir</dt><dd>${displayMoney(r.vous_gagnez)}</dd></div>
    </dl>
  `;
}

function afficherReservationsDuMois(reservations, calendarDate) {
  const container = document.getElementById("monthReservations");
  if (!container) return;

  const list = reservations.filter(r => overlapsMonth(r, calendarDate));

  if (list.length === 0) {
    container.innerHTML = "<p>Aucune réservation complète ce mois-ci.</p>";
    return;
  }

  container.innerHTML = list.map(r => `
    <article class="reservation-item ${r.source === "Booking" ? "booking" : ""}">
      ${reservationRows(r)}
    </article>
  `).join("");
}

function detailReservation(r) {
  alert(
    "Détail de la réservation\n\n" +
    "Nom : " + cleanText(r.nom) + "\n" +
    "Date arrivée : " + formatDateFR(r.start) + "\n" +
    "Date départ : " + formatDateFR(r.end) + "\n" +
    "Nombre de nuit : " + (cleanText(r.nuits) || "À compléter") + "\n" +
    "Nombre de personne : " + (cleanText(r.voyageurs) || "À compléter") + "\n" +
    "Tarif client : " + (cleanMoney(r.total_paye) || "À compléter") + "\n" +
    "Somme que je vais recevoir : " + (cleanMoney(r.vous_gagnez) || "À compléter")
  );
}

async function chargerCalendrier() {
  const lastUpdate = document.getElementById("lastUpdate");
  const calendarEl = document.getElementById("calendar");

  const details = await loadJson("./data/reservations_details.json");
  const reservations = buildReservations(details);

  lastUpdate.textContent = "Calendrier des réservations complètes.";

  const events = reservations.map(r => ({
    title: cleanText(r.nom),
    start: r.start,
    end: r.end,
    allDay: true,
    color: r.source === "Booking" ? "#0071c2" : "#ff5a5f",
    display: "block",
    extendedProps: r
  }));

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    locale: "fr",
    firstDay: 1,
    height: "auto",

    views: {
      listYear: {
        type: "list",
        duration: { years: 1 },
        buttonText: "Liste année"
      }
    },

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listYear"
    },

    buttonText: {
      today: "Aujourd'hui",
      month: "Mois",
      list: "Liste année"
    },

    events,

    datesSet: function(info) {
      afficherReservationsDuMois(reservations, info.view.currentStart);
    },

    eventClick: function(info) {
      detailReservation(info.event.extendedProps);
    }
  });

  calendar.render();
}

chargerCalendrier();
