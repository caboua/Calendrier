/*
 * Notification des changements de NOTES du calendrier partagé.
 *
 * Les notes (jaunes) sont ajoutées/modifiées/supprimées depuis le site et
 * committées dans data/notes.json (« Mise à jour notes calendrier »).
 * Ce script compare l'état précédent (.prevdata/notes.json, = version d'avant
 * le commit) à l'état courant (data/notes.json) et pousse une notification
 * ntfy pour chaque note ajoutée, modifiée ou supprimée.
 *
 * Utile pour un calendrier partagé entre plusieurs téléphones : chacun est
 * prévenu quand l'autre ajoute une date. Config : variable NTFY_URL.
 * Sans NTFY_URL, le script affiche seulement le message (aucun envoi).
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

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
              "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function fmt(iso) {
  if (!iso) return "?";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

/* Période lisible : un seul jour → date simple ; sinon « début → dernier jour ».
   (end est exclusif, comme les notes du site : fin = dernier jour + 1) */
function periode(start, end) {
  if (!start) return "?";
  if (!end || end === start) return fmt(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const jours = Math.round((e - s) / 86400000);
  if (jours <= 1) return fmt(start);
  const dernier = new Date(e);
  dernier.setDate(dernier.getDate() - 1);
  return `${fmt(start)} → ${fmt(dernier.toISOString().slice(0, 10))}`;
}

function aChange(a, b) {
  return a.title !== b.title
    || a.start !== b.start
    || a.end !== b.end
    || String(a.description || "") !== String(b.description || "");
}

function main() {
  /* On ignore l'entrée spéciale « pensebete » (mémo libre, pas une note datée). */
  const prev = readJson(".prevdata/notes.json").filter(n => n.id !== "pensebete");
  const cur = readJson("data/notes.json").filter(n => n.id !== "pensebete");

  const prevById = new Map(prev.map(n => [n.id, n]));
  const curById = new Map(cur.map(n => [n.id, n]));

  const lignes = [];

  for (const n of cur) {
    const avant = prevById.get(n.id);
    if (!avant) {
      lignes.push(`📌 Nouvelle note : ${n.title} — ${periode(n.start, n.end)}`);
    } else if (aChange(avant, n)) {
      lignes.push(`✏️ Note modifiée : ${n.title} — ${periode(n.start, n.end)}`);
    }
  }

  for (const n of prev) {
    if (!curById.has(n.id)) {
      lignes.push(`🗑️ Note supprimée : ${n.title} — ${periode(n.start, n.end)}`);
    }
  }

  if (lignes.length === 0) {
    console.log("Aucun changement de note à notifier.");
    return;
  }

  const titre = "Villa CABOUA - calendrier";
  const corps = lignes.join("\n");

  if (!NTFY_URL) {
    console.log("NTFY_URL absent : notification non envoyee.\n" + corps);
    return;
  }

  fetch(NTFY_URL, {
    method: "POST",
    headers: {
      "Title": titre,
      "Tags": "pushpin",
      "Priority": "default",
      "Click": CALENDRIER_URL
    },
    body: corps
  })
    .then(res => console.log(`Notification envoyee (HTTP ${res.status}) :\n` + corps))
    .catch(err => console.log("Echec notification : " + err.message));
}

main();
