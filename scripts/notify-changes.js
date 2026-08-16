/*
 * Notification des nouveautés du calendrier.
 *
 * Compare l'état précédent (snapshot dans .prevdata/, pris avant la synchro)
 * avec l'état courant (data/), puis pousse une notification vers ntfy
 * (app iPhone/Android) en cas de :
 *   - nouvelle réservation confirmée (Airbnb « Reserved » ou Booking),
 *   - annulation nouvellement déduite (data/annulations.json).
 *
 * Config : variable d'environnement NTFY_URL (ex. https://ntfy.sh/mon-canal-prive).
 * Si NTFY_URL est absent, le script se contente d'afficher le message (aucun envoi).
 * Le script ne fait jamais échouer le workflow.
 */

const fs = require("fs");

const NTFY_URL = process.env.NTFY_URL || "";
const CALENDRIER_URL = "https://caboua.github.io/Calendrier/";

function readJson(path) {
  if (!fs.existsSync(path)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function cleanText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/* Un vrai séjour voyageur (et non un simple blocage de dates du propriétaire). */
function isGuestStay(r) {
  const source = (r.source || "").toLowerCase();
  const title = cleanText(r.summary || r.title || "");
  if (source === "airbnb") return title === "reserved";
  // Booking étiquette toute période occupée « CLOSED - Not available » : on la
  // traite comme une réservation (sinon les vraies résas Booking sont ignorées).
  if (source === "booking") return Boolean(title);
  return false;
}

function stayKey(r) {
  return [(r.source || "").toLowerCase(), r.start, r.end].join("|");
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
              "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function fmt(iso) {
  if (!iso) return "?";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

function isFuture(iso) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso + "T00:00:00") >= today;
}

function main() {
  const prevRes = readJson(".prevdata/reservations.json");
  const newRes = readJson("data/reservations.json");
  const prevAnn = readJson(".prevdata/annulations.json");
  const newAnn = readJson("data/annulations.json");

  const prevStays = new Set(prevRes.map(stayKey));
  const nouvelles = newRes
    .filter(isGuestStay)
    .filter(r => isFuture(r.end || r.start))
    .filter(r => !prevStays.has(stayKey(r)));

  const prevAnnKeys = new Set(prevAnn.map(a => a.key));
  const annulations = newAnn.filter(a => !prevAnnKeys.has(a.key));

  const lignes = [];
  for (const r of nouvelles) {
    lignes.push(`🟢 Nouvelle réservation ${r.source} : ${fmt(r.start)} → ${fmt(r.end)}`);
  }
  for (const a of annulations) {
    const nom = a.nom ? ` (${a.nom})` : "";
    lignes.push(`🔴 Annulation ${a.source}${nom} : ${fmt(a.start)} → ${fmt(a.end)}`);
  }

  if (lignes.length === 0) {
    console.log("Aucune nouveauté à notifier.");
    return;
  }

  const titre = lignes.length === 1
    ? "Villa CABOUA - calendrier"
    : `Villa CABOUA - ${lignes.length} nouveautes`;
  const corps = lignes.join("\n");

  if (!NTFY_URL) {
    console.log("NTFY_URL absent : notification non envoyee.\n" + titre + "\n" + corps);
    return;
  }

  fetch(NTFY_URL, {
    method: "POST",
    headers: {
      "Title": titre,               // en-têtes ASCII uniquement
      "Tags": "calendar",
      "Priority": "high",           // iOS : déclenche son + vibration
      "Click": CALENDRIER_URL
    },
    body: corps                     // le corps porte accents et emojis (UTF-8)
  })
    .then(res => console.log(`Notification envoyee (HTTP ${res.status}) :\n` + corps))
    .catch(err => console.log("Echec notification : " + err.message));
}

main();
