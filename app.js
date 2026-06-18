function formatDateFR(dateText) {
  if (!dateText) return "Non disponible";
  return new Date(dateText + "T00:00:00").toLocaleDateString("fr-FR");
}

function cleanText(value) {
  if (!value) return "";
  return String(value).replace(/�/g, "").replace(/\?/g, "").trim();
}

function cleanMoney(value) {
  if (!value) return "";
  let text = String(value).replace(/�/g, "").replace(/\?/g, "").replace(/€/g, "").trim();
  return text ? text + " €" : "";
}

function isValidReservation(r) {
  if (!r.start || !r.end) return false;
  return new Date(r.end) > new Date(r.start);
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

function mergeReservations(details, ical) {
  const validDetails = details.filter(isValidReservation);

  const merged = [...validDetails];

  ical.forEach(r => {
    if (!isValidReservation(r)) return;

    const alreadyExists = merged.some(d =>
      d.start === r.start && d.end === r.end
    );

    if (!alreadyExists) {
      merged.push({
        source: r.source || "Airbnb",
        nom: "Réservé",
        start: r.start,
        end: r.end,
        voyageurs: "",
        code: "",
        total_paye: "",
        vous_gagnez: "",
        nuits: Math.round((new Date(r.end) - new Date(r.start)) / 86400000)
      });
    }
  });

  return merged.sort((a, b) => a.start.localeCompare(b.start));
}

function afficherReservationsDuMois(reservations, calendarDate) {
  const container = document.getElementById("monthReservations");
  if (!container) return;

  const month = calendarDate.getMonth();
  const year = calendarDate.getFullYear();

  const list = reservations.filter(r => {
    const start = new Date(r.start + "T00:00:00");
    return start.getMonth() === month && start.getFullYear() === year;
  });

  if (list.length === 0) {
    container.innerHTML = "<p>Aucune réservation ce mois-ci.</p>";
    return;
  }

  container.innerHTML = list.map(r => `
    <div class="reservation-item ${r.source === "Booking" ? "booking" : ""}">
      <strong>${cleanText(r.nom) || "Réservé"}</strong>
      <div>${formatDateFR(r.start)} → ${formatDateFR(r.end)}</div>
      <div>${cleanText(r.nuits) ? cleanText(r.nuits) + " nuit(s)" : ""}</div>
      <div>${cleanText(r.voyageurs)}</div>
      <div>${cleanMoney(r.total_paye)}</div>
    </div>
  `).join("");
}

async function chargerCalendrier() {
  const lastUpdate = document.getElementById("lastUpdate");
  const calendarEl = document.getElementById("calendar");

  const details = await loadJson("./data/reservations_details.json");
  const ical = await loadJson("./data/reservations.json");

  const reservations = mergeReservations(details, ical);

  lastUpdate.textContent = "Calendrier synchronisé avec Airbnb et Booking.";

  const events = reservations.map(r => ({
    title: r.nom && r.nom !== "Réservé" ? r.nom : "Réservé",
    start: r.start,
    end: r.end,
    allDay: true,
    color: r.source === "Booking" ? "#0071c2" : "#ff5a5f",
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
      const r = info.event.extendedProps;

      alert(
        "Détail de la réservation\n\n" +
        "Plateforme : " + cleanText(r.source) + "\n\n" +
        "Nom : " + (cleanText(r.nom) || "Non disponible") + "\n\n" +
        "Arrivée : " + formatDateFR(r.start) + "\n" +
        "Départ : " + formatDateFR(r.end) + "\n" +
        "Nombre de nuits : " + cleanText(r.nuits) + "\n\n" +
        "Voyageurs : " + (cleanText(r.voyageurs) || "Non disponible") + "\n\n" +
        "Code : " + (cleanText(r.code) || "Non disponible") + "\n\n" +
        "Total payé : " + (cleanMoney(r.total_paye) || "Non disponible") + "\n\n" +
        "Vous gagnez : " + (cleanMoney(r.vous_gagnez) || "Non disponible")
      );
    }
  });

  calendar.render();
}

chargerCalendrier();
