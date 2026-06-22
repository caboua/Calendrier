const fs = require("fs");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

const DETAILS_PATH = "data/reservations_details.json";
const FRENCH_MONTHS = {
  janv: 1,
  janvier: 1,
  fevr: 2,
  févr: 2,
  fevrier: 2,
  février: 2,
  mars: 3,
  avr: 4,
  avril: 4,
  mai: 5,
  juin: 6,
  juil: 7,
  juillet: 7,
  aout: 8,
  août: 8,
  sept: 9,
  septembre: 9,
  oct: 10,
  octobre: 10,
  nov: 11,
  novembre: 11,
  dec: 12,
  déc: 12,
  decembre: 12,
  décembre: 12
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function readJson(path) {
  if (!fs.existsSync(path)) return [];
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function formatDate(year, month, day) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function parseFrenchDate(value, fallbackYear) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/(\d{1,2})\s+([a-z]+)\.?(?:\s+(\d{4}))?/i);
  if (!match) return "";

  const day = Number(match[1]);
  const month = FRENCH_MONTHS[match[2]];
  const year = Number(match[3] || fallbackYear);

  if (!day || !month || !year) return "";
  return formatDate(year, month, day);
}

function countNights(start, end) {
  if (!start || !end) return "";
  return Math.round((new Date(end) - new Date(start)) / 86400000);
}

function linesFromText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function findLineAfter(lines, label, predicate = value => value) {
  const normalizedLabel = normalizeText(label).toLowerCase();
  const index = lines.findIndex(line => {
    const normalizedLine = normalizeText(line).toLowerCase();
    return normalizedLine === normalizedLabel || normalizedLine.startsWith(normalizedLabel + ":");
  });
  if (index < 0) return "";

  const inlineValue = lines[index].replace(/^[^:]+:\s*/, "").trim();
  if (inlineValue !== lines[index] && predicate(inlineValue)) return inlineValue;

  for (let i = index + 1; i < Math.min(lines.length, index + 8); i += 1) {
    if (predicate(lines[i])) return lines[i];
  }

  return "";
}

function findMoneyAfter(lines, label) {
  const moneyPattern = /-?\d+(?:[.,]\d{2})?\s*€/;
  return findLineAfter(lines, label, value => moneyPattern.test(value));
}

function cleanName(subject, body) {
  const subjectMatch = subject.match(/Réservation confirmée\s*:\s*(.+?)\s+arrive/i);
  const candidate = subjectMatch
    ? subjectMatch[1]
    : (body.match(/Nouvelle réservation confirmée\s*!\s*(.+?)\s+arrive/i) || [])[1];

  return String(candidate || "")
    .replace(/@.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMoney(value) {
  const match = String(value || "").match(/-?\d+(?:[.,]\d{2})?\s*€/);
  return match ? match[0].replace(/\s+/g, " ") : "";
}

function parseAirbnbEmail(parsed) {
  const subject = parsed.subject || "";
  const body = parsed.text || "";
  const normalizedSubject = normalizeText(subject).toLowerCase();
  const normalizedBody = normalizeText(body).toLowerCase();

  if (!normalizedSubject.includes("reservation confirmee")
      && !normalizedBody.includes("nouvelle reservation confirmee")) {
    return null;
  }

  const lines = linesFromText(body);
  const fallbackYear = parsed.date ? parsed.date.getFullYear() : new Date().getFullYear();
  const startText = findLineAfter(lines, "Arrivée", value => parseFrenchDate(value, fallbackYear));
  const endText = findLineAfter(lines, "Départ", value => parseFrenchDate(value, fallbackYear));
  const start = parseFrenchDate(startText, fallbackYear);
  const end = parseFrenchDate(endText, fallbackYear);
  const name = cleanName(subject, body);
  const voyageurs = findLineAfter(lines, "Voyageurs");
  const code = findLineAfter(lines, "Code de confirmation");
  const totalPaye = cleanMoney(findMoneyAfter(lines, "Total (EUR)"));
  const vousGagnez = cleanMoney(findMoneyAfter(lines, "Vous gagnez"));

  if (!name || !start || !end) return null;

  return {
    source: "Airbnb",
    nom: name,
    start,
    end,
    voyageurs,
    code,
    total_paye: totalPaye,
    vous_gagnez: vousGagnez,
    nuits: countNights(start, end),
    sujet: subject
  };
}

function moneyNumber(value) {
  const match = String(value || "").replace(/\s/g, "").match(/-?\d+(?:[.,]\d{1,2})?/);
  return match ? Number(match[0].replace(",", ".")) : null;
}

function formatMoney(value) {
  return value == null
    ? ""
    : value.toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false
    }) + " €";
}

function firstValueAfter(lines, labels, predicate = value => value) {
  for (const label of labels) {
    const value = findLineAfter(lines, label, predicate);
    if (value) return value;
  }
  return "";
}

function parseBookingEmail(parsed) {
  const subject = parsed.subject || "";
  const body = parsed.text || "";
  const combined = normalizeText(subject + " " + body).toLowerCase();
  if (!combined.includes("booking.com") && !combined.includes("booking number")) return null;

  const lines = linesFromText(body);
  const fallbackYear = parsed.date ? parsed.date.getFullYear() : new Date().getFullYear();
  const datePredicate = value => parseFrenchDate(value, fallbackYear);
  const startText = firstValueAfter(lines, ["Date d'arrivée", "Arrivée", "Check-in"], datePredicate);
  const endText = firstValueAfter(lines, ["Date de départ", "Départ", "Check-out"], datePredicate);
  const start = parseFrenchDate(startText, fallbackYear);
  const end = parseFrenchDate(endText, fallbackYear);

  let name = firstValueAfter(lines, ["Nom du client", "Nom de l'hôte", "Client"]);
  name = String(name).replace(/\s+(?:Afficher|Langue|E-mail|Email|Téléphone).*$/i, "").trim();
  if (!name) {
    const subjectMatch = subject.match(/(?:réservation|reservation)(?:\s+Booking\.com)?\s*[-:]\s*(.+?)\s+arrive/i);
    name = subjectMatch ? subjectMatch[1].trim() : "";
  }

  const guestLine = lines.find(line => /\b\d+\s+adulte/i.test(normalizeText(line))) || "";
  const guestMatch = normalizeText(guestLine).match(/(\d+)\s+adulte/i);
  const voyageurs = guestMatch
    ? `${guestMatch[1]} adulte${Number(guestMatch[1]) > 1 ? "s" : ""}`
    : "";

  const codeLine = firstValueAfter(lines, ["Numéro de réservation", "Numero de reservation", "Booking number"]);
  const codeMatch = String(codeLine).match(/[A-Z0-9-]{6,}/i);
  const total = moneyNumber(firstValueAfter(lines, ["Montant total", "Prix total", "Total"]));
  const payoutDirect = moneyNumber(firstValueAfter(lines, ["Vous recevrez", "Montant à recevoir", "Versement"]));
  const commission = moneyNumber(firstValueAfter(lines, ["Commission et frais", "Commission"]));
  const payout = payoutDirect != null
    ? payoutDirect
    : (total != null && commission != null ? total - commission : null);

  if (!name || !start || !end) return null;

  return {
    source: "Booking",
    nom: name,
    start,
    end,
    voyageurs,
    code: codeMatch ? codeMatch[0] : "",
    total_paye: formatMoney(total),
    vous_gagnez: formatMoney(payout),
    nuits: countNights(start, end),
    sujet: subject
  };
}

function parseReservationEmail(parsed) {
  return parseBookingEmail(parsed) || parseAirbnbEmail(parsed);
}

function reservationKey(reservation) {
  return reservation.code || [
    reservation.source,
    reservation.nom,
    reservation.start,
    reservation.end
  ].join("|");
}

function mergeReservations(existing, parsed) {
  const byKey = new Map();

  for (const reservation of existing) {
    byKey.set(reservationKey(reservation), reservation);
  }

  for (const reservation of parsed) {
    const key = reservationKey(reservation);
    const previous = byKey.get(key) || {};
    byKey.set(key, { ...previous, ...reservation });
  }

  return Array.from(byKey.values()).sort((a, b) =>
    String(a.start || "").localeCompare(String(b.start || ""))
      || String(a.nom || "").localeCompare(String(b.nom || ""))
  );
}

async function openAllMail(client) {
  const boxes = await client.list();
  const allMail = boxes.find(box => box.specialUse === "\\All")
    || boxes.find(box => /all mail|tous les messages/i.test(box.name));
  await client.mailboxOpen(allMail ? allMail.path : "INBOX");
}

async function fetchReservationMessages() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.log("GMAIL_USER/GMAIL_APP_PASSWORD absent: synchronisation Gmail ignorée.");
    return [];
  }

  const client = new ImapFlow({
    host: process.env.GMAIL_IMAP_HOST || "imap.gmail.com",
    port: Number(process.env.GMAIL_IMAP_PORT || 993),
    secure: true,
    auth: { user, pass }
  });

  await client.connect();

  try {
    await openAllMail(client);

    const since = new Date(process.env.GMAIL_SINCE || "2026-01-01T00:00:00Z");
    const uids = await client.search({ since });
    const reservations = [];

    for await (const message of client.fetch(uids, { envelope: true, source: true })) {
      const from = message.envelope.from?.map(item => item.address).join(" ") || "";
      const subject = message.envelope.subject || "";

      if (!/airbnb|booking/i.test(from) && !/airbnb|booking|réservation|reservation/i.test(subject)) continue;

      const parsed = await simpleParser(message.source);
      const reservation = parseReservationEmail(parsed);
      if (reservation) reservations.push(reservation);
    }

    return reservations;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function main() {
  fs.mkdirSync("data", { recursive: true });

  const parsed = await fetchReservationMessages();
  if (parsed.length === 0) {
    console.log("Aucune réservation Gmail à fusionner.");
    return;
  }

  const existing = readJson(DETAILS_PATH);
  const merged = mergeReservations(existing, parsed);

  fs.writeFileSync(DETAILS_PATH, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Réservations Gmail extraites: ${parsed.length}`);
  console.log(`Réservations détaillées totales: ${merged.length}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  parseAirbnbEmail,
  parseBookingEmail,
  parseReservationEmail
};
