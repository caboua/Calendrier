const COLORS = {
  airbnb: '#ff5a5f',
  booking: '#0071c2',
  default: '#7c7c7c'
};

function sourceFromText(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('airbnb')) return 'airbnb';
  if (lower.includes('booking')) return 'booking';
  return 'default';
}

async function loadReservations() {
  try {
    const response = await fetch(`data/reservations.json?v=${Date.now()}`);
    if (!response.ok) throw new Error('Fichier data/reservations.json introuvable');

    const data = await response.json();

    if (Array.isArray(data)) {
      return {
        updatedAt: null,
        events: data
      };
    }

    return data;
  } catch (error) {
    console.error(error);
    return { updatedAt: null, events: [] };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadReservations();

  const lastUpdate = document.getElementById('lastUpdate');
  if (lastUpdate) {
    lastUpdate.textContent = data.updatedAt
      ? `Dernière synchronisation : ${new Date(data.updatedAt).toLocaleString('fr-FR')}`
      : 'Calendrier synchronisé avec Airbnb et Booking.';
  }

  const events = (data.events || []).map(event => {
    const source = sourceFromText(`${event.source || ''} ${event.title || ''}`);
    return {
      title: 'Réservé',
      start: event.start,
      end: event.end,
      allDay: true,
      backgroundColor: COLORS[source],
      borderColor: COLORS[source]
    };
  });

  const calendarEl = document.getElementById('calendar');

  if (!calendarEl) {
    console.error('Élément #calendar introuvable');
    return;
  }

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: window.innerWidth < 700 ? 'listMonth' : 'dayGridMonth',
    locale: 'fr',
    firstDay: 1,
    height: 'auto',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,listMonth'
    },
    buttonText: {
      today: 'Aujourd’hui',
      month: 'Mois',
      list: 'Liste'
    },
    events
  });

  calendar.render();
});
