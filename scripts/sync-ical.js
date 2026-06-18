const fs = require("fs");
const ical = require("node-ical");

const calendars = [
  { source: "Airbnb", url: process.env.AIRBNB_ICAL_URL },
  { source: "Booking", url: process.env.BOOKING_ICAL_URL }
];

function toDate(value) {
  if (!value) return "";
  return value.toISOString().split("T")[0];
}

async function main() {
  const reservations = [];

  for (const calendar of calendars) {
    if (!calendar.url) continue;

    const events = await ical.async.fromURL(calendar.url);

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
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
