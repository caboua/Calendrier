const COLORS = {
  airbnb: '#ff5a5f',
  booking: '#0071c2',
  manual: '#2f8f46',
  default: '#7c7c7c'
};

function sourceFromText(text = '') {
  const lower = text.toLowerCase();
  if (lower.includes('airbnb')) return 'airbnb';
  if (lower.includes('booking')) return 'booking';
  if (lower.includes('manual')) return 'manual';
  return 'default';
}

async function loadReservations() {
  try {
    const response = await fetch(`data/reservations.json?v=${Date.now()}`);
    if (!response.ok) throw new Error('Fichier data/reservations.json introuvable');
    return await response.json();
  } catch (error) {
    console.error(error);
    return { updatedAt: null, events: [] };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const data = await loadReservations();
  const lastUpdate = document.getElementById('lastUpdate');

  if (data.updatedAt) {
    lastUpdate.textContent = `Dernière synchronisation : ${new Date(data.updatedAt).toLocaleString('fr-FR')}`;
  } else {
    lastUpdate.textContent = 'Aucune synchronisation trouvée pour le moment.';
  }

  const events = (data.events || []).map(event => {
    const source = sourceFromText(`${event.source || ''} ${event.title || ''}`);
    return {
      title: event.publicTitle || 'Réservé',
      start: event.start,
      end: event.end,
      allDay: true,
      backgroundColor: COLORS[source],
      borderColor: COLORS[source],
      extendedProps: { source }
    };
  });

  const calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    initialView: window.innerWidth < 700 ? 'listMonth' : 'dayGridMonth',
    locale: 'fr',
    firstDay: 1,
    height: 'auto',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,listMonth'
    },
    buttonText: { today: 'Aujourd’hui', month: 'Mois', list: 'Liste' },
    events
  });

  calendar.render();
});
