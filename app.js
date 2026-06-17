async function chargerCalendrier() {
  const lastUpdate = document.getElementById("lastUpdate");
  const calendarEl = document.getElementById("calendar");

  try {
    const response = await fetch("./data/reservations.json?v=" + Date.now());
    const reservations = await response.json();

    lastUpdate.textContent = "Calendrier synchronisé avec Airbnb et Booking.";

    const events = reservations.map(r => ({
      title: r.source + " - Réservé",
      start: r.start,
      end: r.end,
      allDay: true,
      color: r.source === "Booking" ? "#0071c2" : "#ff5a5f"
    }));

    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: "dayGridMonth",
      locale: "fr",
      firstDay: 1,
      height: "auto",
      events: events
    });

    calendar.render();

  } catch (e) {
    lastUpdate.textContent = "Erreur de chargement du calendrier.";
    console.error(e);
  }
}

chargerCalendrier();
