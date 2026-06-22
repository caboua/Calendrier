const assert = require("assert");
const { parseAirbnbEmail, parseBookingEmail } = require("./sync-airbnb-gmail");

const airbnb = parseAirbnbEmail({
  subject: "Réservation confirmée : Natacha Couinedic arrive le 18 juil.",
  date: new Date("2026-06-01T00:00:00Z"),
  text: `
Nouvelle réservation confirmée !
Arrivée
18 juil. 2026
Départ
20 juil. 2026
Voyageurs
5 adultes
Code de confirmation
HMQH58XXQA
Total (EUR)
421,37 €
Vous gagnez
344,35 €
`
});

assert.equal(airbnb.nom, "Natacha Couinedic");
assert.equal(airbnb.start, "2026-07-18");
assert.equal(airbnb.voyageurs, "5 adultes");
assert.equal(airbnb.total_paye, "421,37 €");

const mina = parseAirbnbEmail({
  subject: "Réservation confirmée : Mina Miminne arrive le 3 août",
  date: new Date("2026-06-19T23:55:17Z"),
  text: `
Nouvelle réservation confirmée ! Mina arrive le 3 août
Arrivée       Départ
lun. 3 août   lun. 10 août
16:00         10:00
Voyageurs 5 adultes, 1 enfant, 1 bébé
Code de confirmation HM4ZP2K5KN
Total (EUR) 1 320,93 €
Vous gagnez 1 084,94 €
`
});

assert.equal(mina.nom, "Mina Miminne");
assert.equal(mina.start, "2026-08-03");
assert.equal(mina.end, "2026-08-10");
assert.equal(mina.voyageurs, "5 adultes, 1 enfant, 1 bébé");
assert.equal(mina.total_paye, "1320,93 €");
assert.equal(mina.vous_gagnez, "1084,94 €");

const booking = parseBookingEmail({
  subject: "Réservation Booking.com - François Casas arrive le 5 déc.",
  date: new Date("2026-06-01T00:00:00Z"),
  text: `
Booking.com
Nom du client: François Casas
Date d'arrivée: sam. 5 déc. 2026
Date de départ: ven. 18 déc. 2026
3 adultes
Numéro de réservation: 5647275875
Montant total: 1748,49 €
Commission et frais: 273,69 €
`
});

assert.equal(booking.nom, "François Casas");
assert.equal(booking.start, "2026-12-05");
assert.equal(booking.end, "2026-12-18");
assert.equal(booking.voyageurs, "3 adultes");
assert.equal(booking.total_paye, "1748,49 €");
assert.equal(booking.vous_gagnez, "1474,80 €");

console.log("Reservation email parser tests passed.");
