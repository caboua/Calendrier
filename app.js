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

function afficherReservationsDuMois(reservations, calendarDate) {
  const container = document.getElementById("monthReservations");
  if (!container) return;

  const month = calendarDate.getMonth();
  const year = calendarDate.getFullYear();

  const list = reservations.filter(r => {
    if (!r.start) return false;
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

  try {
    const response = await fetch("./data/reservations_details.json?v=" + Date.now());
    let reservations = await response.json();

    if (!Array.isArray(reservations) || reservations.length === 0) {
      const fallback = await fetch("./data/reservations.json?v=" + Date.now());
      reservations = await fallback.json();
    }

    lastUpdate.textContent = "Calendrier synchronisé avec Airbnb et Booking.";

    const events = reservations.map(r => ({
      title: r.nom ? r.nom : "Réservé",
      start: r.start,
      end: r.end,
      allDay: true,
      color: r.source === "Booking" ? "#0071c2" : "#ff5a5f",
      extendedProps: r
    }));

    const calendar = new FullCalendar.Calendar(calendarEl, {
     initialView: "dayGridMonth",
views: {
  listYear: {
    type: "list",
    duration: { years: 1 },
    buttonText: "Liste année"
  }
},
      locale: "fr",
      firstDay: 1,
      height: "auto",
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
          "Nom : " + cleanText(r.nom) + "\n\n" +
          "Arrivée : " + formatDateFR(r.start) + "\n" +
          "Départ : " + formatDateFR(r.end) + "\n" +
          "Nombre de nuits : " + cleanText(r.nuits) + "\n\n" +
          "Voyageurs : " + cleanText(r.voyageurs) + "\n\n" +
          "Code : " + cleanText(r.code) + "\n\n" +
          "Total payé : " + cleanMoney(r.total_paye) + "\n\n" +
          "Vous gagnez : " + cleanMoney(r.vous_gagnez)
        );
      }
    });

    calendar.render();

  } catch (e) {
    lastUpdate.textContent = "Erreur de chargement du calendrier.";
    console.error(e);
  }
}

chargerCalendrier();
