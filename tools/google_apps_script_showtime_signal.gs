/**
 * Pure candidate classifier based on real Morocco responses observed 2026-11-16.
 * Not wired into the scheduled monitor. No network, properties or notifications.
 * bookingProposedByApi is an API signal; it does not prove seats or checkout.
 */
function patheShowtimeSignalsV1(payload, nowUtc) {
  function instant(value) {
    if (typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      throw new Error("Explicit-offset timestamp required");
    }
    var parsed=Date.parse(value);
    if (!isFinite(parsed)) throw new Error("Invalid timestamp");
    return parsed;
  }
  var now=instant(nowUtc);
  if (!Array.isArray(payload) || payload.length>1000) throw new Error("Invalid showtime array");
  var seen={};
  return payload.map(function(s) {
    if (!s || typeof s!=="object" || Array.isArray(s) ||
        typeof s.time!=="string" ||
        !/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s.time) ||
        typeof s.version!=="string" || s.version.length>50 ||
        typeof s.status!=="string" || !s.status || s.status.length>64 ||
        !Array.isArray(s.tags) || s.tags.length>30 ||
        s.tags.some(function(t){return typeof t!=="string" || t.length>100;})) {
      throw new Error("Invalid detailed showtime schema");
    }
    // Validate calendar date without interpreting the timezone-less local clock.
    var d=s.time.slice(0,10),p=d.split("-").map(Number);
    var utc=new Date(Date.UTC(p[0],p[1]-1,p[2]));
    if (utc.getUTCFullYear()!==p[0] || utc.getUTCMonth()!==p[1]-1 || utc.getUTCDate()!==p[2]) {
      throw new Error("Invalid local calendar date");
    }
    var start=instant(s.reservabilityStart),end=instant(s.reservabilityEnd);
    if (start>=end) throw new Error("Invalid reservation window");
    var link=s.refCmd;
    if (link!==null && link!==undefined && link!=="" &&
        (typeof link!=="string" || !/^https:\/\/s\.pathe\.ma\/fr\/V5401S\d+\/booking$/.test(link))) {
      throw new Error("Unverified booking URL or wrong cinema");
    }
    link=link||null;
    var key=link || s.time+"|"+s.version+"|"+String(s.auditoriumName||"");
    if (seen[key]) throw new Error("Duplicate showtime identity");
    seen[key]=true;
    var tags=Array.from(new Set(s.tags)).sort();
    return {
      id:key,localTime:s.time,localTimeZone:"Africa/Casablanca",
      version:s.version,tags:tags,status:s.status,
      reservabilityStart:s.reservabilityStart,reservabilityEnd:s.reservabilityEnd,
      bookingUrl:link,
      bookingProposedByApi:s.status==="available" && link!==null && now>=start && now<end,
      imaxByTag:tags.indexOf("imax")!==-1,
      imaxLaserConfirmed:false,seatsKnown:false
    };
  }).sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0;});
}
