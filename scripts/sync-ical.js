const fs = require("fs");
const ical = require("node-ical");

const DETAILS_PATH = "data/reservations_details.json";
const CANCELLED_PATH = "data/annulations.json";

const calendars = [
  { source: "Airbnb", url: process.env.AIRBNB_ICAL_URL },
  { source: "Booking", url: process.env.BOOKING_ICAL_URL }
];

function toDate(value) {
  if (!value) return "";
  return value.toISOString().split("T")[0];
}

function readJson(path) {
  if (!fs.existsSync(path)) return [];
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

/* Même clé que dans sync-airbnb-gmail.js et app.js */
function reservationKey(reservation) {
  return reservation.code || [
    reservation.source,
    reservation.nom,
    reservation.start,
    reservation.end
  ].join("|");
}

/*
 * Déduction des annulations : une réservation détaillée (mail) à venir
 * qui n'a plus de séjour aux dates exactes dans l'iCal de sa plateforme
 * est considérée annulée. Si elle réapparaît dans l'iCal, on la retire
 * de la liste (auto-correction). Les séjours déjà passés ne sont plus
 * vérifiables (les iCal ne gardent pas l'historique) : on ne touche pas
 * à leur statut.
 */
function updateCancellations({ calendarRows, details, cancelled, fetchedSources, today }) {
  const byKey = new Map(cancelled.map(entry => [entry.key, entry]));

  for (const reservation of details) {
    const source = String(reservation.source || "").toLowerCase();
    if (!fetchedSources.has(source)) continue;
    if (!reservation.start || !reservation.end) continue;
    if (new Date(reservation.end + "T00:00:00") < today) continue;

    const exact = calendarRows.some(row =>
      String(row.source || "").toLowerCase() === source &&
      row.start === reservation.start &&
      row.end === reservation.end
    );

    const key = reservationKey(reservation);

    if (exact) {
      byKey.delete(key);
    } else if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        source: reservation.source || "",
        nom: reservation.nom || "",
        start: reservation.start,
        end: reservation.end,
        detecte: toDate(today instanceof Date ? today : new Date())
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    String(a.start).localeCompare(String(b.start)));
}

async function main() {
  const reservations = [];
  const fetchedSources = new Set();

  for (const calendar of calendars) {
    if (!calendar.url) continue;

    const events = await ical.async.fromURL(calendar.url);
    fetchedSources.add(calendar.source.toLowerCase());

    for (const key in events) {
      const event = events[key];

      if (event.type !== "VEVENT" || !event.start || !event.end) continue;

      reservations.push({
        source: calendar.source,
        title: event.summary || "Réservé",
        summary: event.summary || "",
        description: event.description || "",
        location: event.location || "",
        uid: event.uid || "",
        start: toDate(event.start),
        end: toDate(event.end)
      });
    }
  }

  reservations.sort((a, b) => a.start.localeCompare(b.start));
  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/reservations.json", JSON.stringify(reservations, null, 2) + "\n");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cancelledList = updateCancellations({
    calendarRows: reservations,
    details: readJson(DETAILS_PATH),
    cancelled: readJson(CANCELLED_PATH),
    fetchedSources,
    today
  });

  fs.writeFileSync(CANCELLED_PATH, JSON.stringify(cancelledList, null, 2) + "\n");
  console.log(`Annulations déduites: ${cancelledList.length}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { updateCancellations, reservationKey };
