// planetar-adsb: live aircraft round Victoria, BC -> planetar-broker.
//
// Topic published:
//   aircraft.adsb.position  (aircraft.adsb.Position.v1) - one envelope per
//       aircraft per poll whose position is new since the last one. The
//       payload is documented in normalize.mjs.
//
// Source: adsb.lol's public API (ODbL 1.0; attribution in every payload).

import { BrokerPublisher } from './publisher.mjs';
import { AdsbLolSource } from './source-adsblol.mjs';
import { normalizeAircraft } from './normalize.mjs';
import { createDeduper } from './dedupe.mjs';

const BROKER_HOST = process.env.BROKER_HOST ?? '127.0.0.1';
const BROKER_PUB_PORT = Number(process.env.BROKER_PUB_PORT ?? 12001);
// The Inner Harbour (planetar-ue's georeference origin). 40 nm covers that
// client's whole 52 km AIS area and the approaches to YYJ.
const CENTER = {
  lat: Number(process.env.ADSB_LAT ?? 48.423),
  lon: Number(process.env.ADSB_LON ?? -123.3708),
};
const RADIUS_NM = Number(process.env.ADSB_RADIUS_NM ?? 40);
const POLL_MS = Number(process.env.ADSB_POLL_MS ?? 10_000);
const SERVER_ID = process.env.ADSB_SERVER_ID ?? 'pac';

const publisher = new BrokerPublisher({ host: BROKER_HOST, port: BROKER_PUB_PORT });
publisher.start();

const source = new AdsbLolSource({ center: CENTER, radiusNm: RADIUS_NM, pollMs: POLL_MS });
const dedupe = createDeduper();
let batches = 0;

source.onBatch = ({ aircraft, nowMs }) => {
  const fresh = dedupe(aircraft.map((ac) => normalizeAircraft(ac, { nowMs, serverId: SERVER_ID })));
  let sent = 0;
  for (const pos of fresh) {
    if (publisher.publish({
      topic: 'aircraft.adsb.position',
      schemaName: 'aircraft.adsb.Position.v1',
      payload: pos,
    })) {
      sent += 1;
    }
  }
  batches += 1;
  if (batches % 30 === 1) {
    console.log(`[planetar-adsb] ${aircraft.length} aircraft in range, ${sent} new fixes published`
      + `${publisher.isOpen() ? '' : ' (broker down: nothing sent)'}`);
  }
};

console.log(`[planetar-adsb] centre ${CENTER.lat},${CENTER.lon} radius ${RADIUS_NM} nm, poll ${POLL_MS} ms,`
  + ` server=${SERVER_ID} broker=${BROKER_HOST}:${BROKER_PUB_PORT}`);
source.start();

process.on('SIGINT', () => {
  console.log('[planetar-adsb] shutting down');
  source.stop();
  process.exit(0);
});
