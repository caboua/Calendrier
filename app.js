async function chargerCalendrier() {
  const lastUpdate = document.getElementById("lastUpdate");
  const calendarEl = document.getElementById("calendar");

  try {
    const response = await fetch("./data/reservations.json?v=" + Date.now());
    const reservations = await response.json();

    lastUpdate.textContent = "Calendrier synchronisé avec Airbnb et Booking.";

    const events = reservations.map(r => ({
      title: `${r.source} - Réservé`,
      start: r.start,
      end: r.end,
      allDay: true,
      color: r.source === "Booking" ? "#0071c2" : "#ff5a5f",
      extendedProps: {
        source: r.source,
        debut: r.start,
        fin: r.end
      }
    }));

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",
      locale: "fr",
      firstDay: 1,
      height: "auto",
      events: events,

      eventClick: function(info) {
        const source = info.event.extendedProps.source;
        const debut = new Date(info.event.extendedProps.debut).toLocaleDateString("fr-FR");
        const fin = new Date(info.event.extendedProps.fin).toLocaleDateString("fr-FR");

        alert(
          "Détail de la réservation\n\n" +
          "Plateforme : " + source + "\n" +
          "Arrivée : " + debut + "\n" +
          "Départ : " + fin
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
