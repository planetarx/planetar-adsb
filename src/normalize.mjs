// One adsb.lol (readsb "aircraft.json" style) record -> aircraft.adsb.Position.v1.
//
// Units are in the field names, so a consumer never has to guess: metres,
// knots (aviation keeps knots), degrees, feet per minute.
//
//   altHaeM   geometric altitude, metres above the WGS84 ellipsoid. readsb's
//             alt_geom is GNSS height referenced to WGS84 (feet). The
//             planetar convention for any altitude is ellipsoidal (altHae).
//   altBaroM  pressure altitude (1013.25 hPa), metres: what the aircraft flies
//             and ATC sees, not a height above anything in particular.
//   onGround  readsb reports alt_baro "ground" for aircraft on the surface.
//
// Returns null for a record that cannot be placed (no position, or a position
// older than maxPosAgeS).

const FT = 0.3048;

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function normalizeAircraft(ac, { nowMs, serverId = 'pac', maxPosAgeS = 60 } = {}) {
  if (!ac || typeof ac !== 'object') return null;
  const lat = num(ac.lat);
  const lon = num(ac.lon);
  const hex = text(ac.hex).toLowerCase();
  if (lat == null || lon == null || !hex) return null;
  const seenPos = num(ac.seen_pos) ?? num(ac.seen) ?? 0;
  if (seenPos > maxPosAgeS) return null;

  const onGround = ac.alt_baro === 'ground';
  const altBaroFt = onGround ? null : num(ac.alt_baro);
  const altGeomFt = num(ac.alt_geom);
  // The fix is as old as its position, not as the poll.
  const fixMs = Math.round(nowMs - seenPos * 1000);

  // Where the position came from: ADS-B proper, multilateration, or a
  // ground station's rebroadcast. Consumers may trust them differently.
  const kind = text(ac.type);
  const method = kind.startsWith('mlat') || (Array.isArray(ac.mlat) && ac.mlat.includes('lat')) ? 'mlat'
    : kind.startsWith('tisb') || (Array.isArray(ac.tisb) && ac.tisb.includes('lat')) ? 'tisb'
    : kind.startsWith('adsr') ? 'adsr'
    : kind.startsWith('adsc') ? 'adsc'
    : kind.startsWith('other') || kind.startsWith('mode_s') ? 'other'
    : 'adsb';

  return {
    hex,
    flight: text(ac.flight),
    registration: text(ac.r),
    aircraftType: text(ac.t),
    category: text(ac.category),
    lat,
    lon,
    onGround,
    altBaroM: altBaroFt == null ? null : Math.round(altBaroFt * FT),
    altHaeM: altGeomFt == null ? null : Math.round(altGeomFt * FT),
    groundSpeedKn: num(ac.gs),
    trackDeg: num(ac.track) ?? num(ac.true_heading),
    verticalRateFpm: num(ac.geom_rate) ?? num(ac.baro_rate),
    squawk: text(ac.squawk),
    emergency: text(ac.emergency) || 'none',
    method,
    positionAgeS: seenPos,
    lastSeenNs: String(BigInt(fixMs) * 1_000_000n),
    serverId,
    source: 'adsb.lol',
    // adsb.lol's data is ODbL: the credit travels with every record.
    attribution: 'adsb.lol (ODbL 1.0)',
  };
}
