function formatDateFR(dateText) {
  if (!dateText) return "";
  return new Date(dateText + "T00:00:00").toLocaleDateString("fr-FR");
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
      title: r.nom ? `${r.nom}` : "Réservé",
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

      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,listMonth"
      },

      buttonText: {
        today: "Aujourd'hui",
        month: "Mois",
        list: "Liste"
      },

      events,

      eventClick: function(info) {
        const r = info.event.extendedProps;

        alert(
          "Détail de la réservation\n\n" +
          "Plateforme : " + (r.source || "") + "\n\n" +
          "Nom : " + (r.nom || "Non disponible") + "\n\n" +
          "Arrivée : " + formatDateFR(r.start) + "\n" +
          "Départ : " + formatDateFR(r.end) + "\n\n" +
          "Voyageurs : " + (r.voyageurs || "Non disponible") + "\n\n" +
          "Code : " + (r.code || "Non disponible") + "\n\n" +
          "Total payé : " + (r.total_paye || "Non disponible") + "\n\n" +
          "Vous gagnez : " + (r.vous_gagnez || "Non disponible")
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
