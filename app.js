function formatDateFR(dateText) {
  if (!dateText) return "Non disponible";
  return new Date(dateText + "T00:00:00").toLocaleDateString("fr-FR");
}

function cleanText(value) {
  if (!value) return "Non disponible";
  return String(value)
    .replace(/�/g, "")
    .replace(/\?/g, "")
    .trim();
}

function cleanMoney(value) {
  if (!value) return "Non disponible";
  let text = String(value)
    .replace(/�/g, "")
    .replace(/\?/g, "")
    .replace(/€/g, "")
    .trim();

  return text + " €";
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
      locale: "fr",
      firstDay: 1,
      height: "auto",
      events,

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
    afficherReservationsDuMois(reservations, calendar.getDate());

calendar.on("datesSet", function() {
  afficherReservationsDuMois(reservations, calendar.getDate());
});

  } catch (e) {
    lastUpdate.textContent = "Erreur de chargement du calendrier.";
    console.error(e);
  }
}

chargerCalendrier();
