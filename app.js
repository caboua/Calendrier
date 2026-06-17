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
      title: `${r.source || "Réservation"} - ${r.nom || "Réservé"}`,
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
          "Plateforme : " + (r.source || "") + "\n" +
          "Nom : " + (r.nom || "Non disponible") + "\n" +
          "Arrivée : " + (r.start || "") + "\n" +
          "Départ : " + (r.end || "") + "\n" +
          "Voyageurs : " + (r.voyageurs || "Non disponible") + "\n" +
          "Code : " + (r.code || "Non disponible") + "\n" +
          "Total payé : " + (r.total_paye || "Non disponible") + "\n" +
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
