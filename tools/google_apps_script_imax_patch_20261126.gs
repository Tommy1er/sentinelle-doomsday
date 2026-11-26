// PATCH IMAX PRIORITE - 2026-11-26. Remplace quelques fonctions de Code.gs.
// Pour revenir en arriere : supprimer ce fichier, ou propriete DOOMSDAY_IMAX_PRIORITY = false.
var DOOMSDAY_IMAX_PATCH = { version: "imax-priority-20261126", key: "DOOMSDAY_IMAX_PRIORITY" };

function sentinelleImaxPriorityOn_() {
return PropertiesService.getScriptProperties().getProperty(DOOMSDAY_IMAX_PATCH.key) !== "false";
}

function sentinelleIsImax_(s) {
if (!s) return false;
if (s.imaxByTag === true || s.imaxByAuditorium === true) return true;
var bits = (Array.isArray(s.tags) ? s.tags : []).concat([s.version || "", s.auditorium || ""]);
return bits.some(function (t) { return /imax/i.test(String(t)); });
}

function sentinelleImaxAlert_(date, sessions, opened) {
var starts = sessions.map(function (s) { return s.reservabilityStart; }).filter(function (x) { return !!x; }).sort();
var lines = [
opened ? "🎬🚨 IMAX OUVERT — AVENGERS: DOOMSDAY — PATHÉ CALIFORNIE"
: "🎬 IMAX PUBLIÉ — AVENGERS: DOOMSDAY — PATHÉ CALIFORNIE (ventes pas encore ouvertes)",
"Date : " + date,
opened ? "Réserve MAINTENANT : les meilleures places IMAX partent en premier."
: "Ouverture des ventes annoncée : " + (starts.length ? sentinelleCasablancaTime_(starts[0]) : "non communiquée"),
"Séances IMAX :"
];
sessions.slice(0, 10).forEach(function (s) {
lines.push(sentinelleSessionLine_(s));
if (s.bookingUrl) lines.push("  Réserver : " + s.bookingUrl);
});
if (sessions.length > 10) lines.push("… et " + (sessions.length - 10) + " autres séances IMAX.");
lines.push("Laser : à confirmer sur la page de réservation. Aucun achat automatique.");
lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
return {
subject: (opened ? "🎬🚨 IMAX OUVERT — Doomsday Pathé Californie " : "🎬 IMAX publié — Doomsday Pathé Californie ") + date,
body: lines.join("\n")
};
}

function sentinelleStandardAlert_(date, opened, loud) {
var lines = [
loud ? "🚨 AVENGERS: DOOMSDAY — RÉSERVATION OUVERTE (API PATHÉ)"
: "INFO (pas IMAX) — AVENGERS: DOOMSDAY — séances classiques ajoutées",
"Cinéma : Pathé Californie — Casablanca",
"Date : " + date,
"Attention : ce signal ne garantit pas de places encore disponibles ni un paiement réussi.",
"Séances détectées :"
];
opened.slice(0, 10).forEach(function (s) {
lines.push(sentinelleSessionLine_(s));
if (s.bookingUrl) lines.push("  Réserver : " + s.bookingUrl);
});
if (opened.length > 10) lines.push("… et " + (opened.length - 10) + " autres séances.");
lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
return {
subject: loud ? "🚨 DOOMSDAY — réservation ouverte Pathé Californie " + date
: "ℹ️ DOOMSDAY — séances classiques ajoutées (pas IMAX) " + date,
body: lines.join("\n")
};
}

// Remplace la version de Code.gs : l'IMAX a son propre titre, le classique devient calme.
function sentinelleDetailedAlert_(date, opened) {
if (!sentinelleImaxPriorityOn_()) return sentinelleStandardAlert_(date, opened, true);
var imax = opened.filter(sentinelleIsImax_);
var std = opened.filter(function (s) { return !sentinelleIsImax_(s); });
if (imax.length) {
var a = sentinelleImaxAlert_(date, imax, true);
if (std.length) a.body += "\nAussi ajoutées en salles classiques : " + std.length + " séance(s).";
return a;
}
return sentinelleStandardAlert_(date, std, false);
}

// Remplace la version de Code.gs : pas de rappels insistants pour une alerte INFO.
function sentinelleArmCritical_(props, nowIso, summary) {
if (String(summary).indexOf("INFO (pas IMAX)") === 0) return;
props.setProperty(DOOMSDAY_BOOKING_V1.criticalKey, JSON.stringify({
nonce: new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 8),
armedAt: nowIso, summary: String(summary).slice(0, 700), sent: 0, acked: false
}));
}

// Remplace la version de Code.gs : IMAX publié avant la vente => alerte dédiée + rappels.
function sentinelleListedAlert_(date, listed) {
if (sentinelleImaxPriorityOn_()) {
var imax = listed.filter(sentinelleIsImax_);
if (imax.length) {
var a = sentinelleImaxAlert_(date, imax, false);
sentinelleArmCritical_(PropertiesService.getScriptProperties(), new Date().toISOString(), a.body);
return a;
}
}
var starts = listed.map(function (s) { return s.reservabilityStart; }).filter(function (x) { return !!x; }).sort();
var lines = [
"📅 AVENGERS: DOOMSDAY — SÉANCES PUBLIÉES À PATHÉ CALIFORNIE",
"Date : " + date,
"Ventes : pas encore ouvertes" + (starts.length ?
" — ouverture annoncée par Pathé : " + sentinelleCasablancaTime_(starts[0]) : " — heure d'ouverture non communiquée"),
"Séances :"
];
listed.slice(0, 10).forEach(function (s) { lines.push(sentinelleSessionLine_(s)); });
if (listed.length > 10) lines.push("… et " + (listed.length - 10) + " autres séances.");
lines.push("Fiche officielle : " + DOOMSDAY_SENTINEL.publicPage);
return { subject: "📅 DOOMSDAY — séances publiées Pathé Californie " + date, body: lines.join("\n") };
}

// Remplace la version de Code.gs : un jour qui recoit un tag imax a un titre IMAX.
function sentinelleEventMessage_(delta) {
var imaxDays = delta.added.concat(delta.updated).filter(function (day) {
return day.tags.concat(day.versions).some(function (t) { return /imax/i.test(t); });
});
var title = delta.type === "PROGRAMME_REMOVED" ? "⚠️ [DOOMSDAY] Programmation retirée"
: imaxDays.length ? "🎬 [DOOMSDAY] IMAX apparaît dans la programmation Pathé Californie"
: "🚨 [DOOMSDAY] Programmation détectée ou modifiée";
var lines = [
"Cinéma : Pathé Californie — Casablanca",
"Film : Avengers: Doomsday",
"Statut : DONNÉES DE PROGRAMMATION (pas une vente de billets confirmée)",
"Jours actuellement programmés : " + delta.totalDays
];
if (delta.firstObservation) lines.push("Premier contrôle : état déjà programmé.");
if (delta.added.length) lines.push("Nouvelles dates :\n" + delta.added.map(sentinelleFormatDay_).join("\n"));
if (delta.updated.length) lines.push("Dates modifiées :\n" + delta.updated.map(sentinelleFormatDay_).join("\n"));
if (delta.removed.length) lines.push("Dates retirées :\n" + delta.removed.map(sentinelleFormatDay_).join("\n"));
lines.push("Vérification manuelle : " + DOOMSDAY_SENTINEL.publicPage);
return { subject: title, body: lines.join("\n\n") };
}

// A lancer une fois a la main : verifie que le patch est bien actif. N'envoie rien.
function imaxPatchSelfTest() {
var imaxS = { localTime: "2026-12-18 20:00:00", version: "vostfr-ma", tags: ["DEFAULT", "imax"], auditorium: "IMAX",
bookingUrl: "https://s.pathe.ma/fr/V5401S1/booking", imaxByTag: false, imaxByAuditorium: false };
var stdS = { localTime: "2026-12-18 10:30:00", version: "vf-ma", tags: ["DEFAULT"], auditorium: "1",
bookingUrl: "https://s.pathe.ma/fr/V5401S2/booking" };
var r = {
patch: DOOMSDAY_IMAX_PATCH.version,
priorityOn: sentinelleImaxPriorityOn_(),
imaxSubject: sentinelleDetailedAlert_("2026-12-18", [imaxS, stdS]).subject,
standardSubject: sentinelleDetailedAlert_("2026-12-18", [stdS]).subject,
loopArmsAfterOpening: sentinelleCheckWithBookingOnce.toString().indexOf("sentinelleArmCritical_(props, now, alert.body)") !== -1,
loopUsesListedAlert: sentinelleCheckWithBookingOnce.toString().indexOf("sentinelleListedAlert_(date, listed)") !== -1
};
r.ok = r.imaxSubject.indexOf("IMAX OUVERT") !== -1 && r.standardSubject.indexOf("pas IMAX") !== -1 &&
r.loopArmsAfterOpening && r.loopUsesListedAlert;
console.log(JSON.stringify(r));
return r;
}
