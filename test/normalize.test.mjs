import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAircraft } from '../src/normalize.mjs';
import { createDeduper } from '../src/dedupe.mjs';
import { AdsbLolSource } from '../src/source-adsblol.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/point-victoria.json', import.meta.url), 'utf8'));
const nowMs = fixture.now;
const all = fixture.ac.map((ac) => normalizeAircraft(ac, { nowMs }));
const byHex = new Map(all.filter(Boolean).map((p) => [p.hex, p]));

test('an airliner: units in the field names, ellipsoidal altitude in metres', () => {
  const p = byHex.get('c0172e');
  assert.equal(p.flight, 'ACA33');
  assert.equal(p.registration, 'C-FIUF');
  assert.equal(p.aircraftType, 'B77L');
  assert.equal(p.altHaeM, Math.round(17300 * 0.3048));
  assert.equal(p.altBaroM, Math.round(17100 * 0.3048));
  assert.equal(p.groundSpeedKn, 369);
  assert.equal(p.trackDeg, 232.82);
  assert.equal(p.verticalRateFpm, 2048);
  assert.equal(p.onGround, false);
  assert.equal(p.method, 'adsb');
  assert.equal(p.serverId, 'pac');
  assert.match(p.attribution, /ODbL/);
});

test('the fix time is the position time, not the poll time', () => {
  const p = byHex.get('c0172e');
  assert.equal(p.lastSeenNs, String(BigInt(Math.round(nowMs - 414)) * 1_000_000n));
});

test('hex ids are lower case', () => {
  assert.ok(byHex.has('a1589d'));
});

test('on the ground: no altitude, flagged', () => {
  const p = byHex.get('c05f11');
  assert.equal(p.onGround, true);
  assert.equal(p.altBaroM, null);
  assert.equal(p.altHaeM, null);
});

test('multilateration is labelled as such', () => {
  assert.equal(byHex.get('c08a2b').method, 'mlat');
});

test('stale or unplaceable records are dropped', () => {
  assert.equal(byHex.has('c0beef'), false, 'position 95 s old');
  assert.equal(byHex.has('c0f00d'), false, 'no position');
  assert.equal(byHex.size, 4);
});

test('each fix is published once', () => {
  const fresh = createDeduper();
  assert.equal(fresh(all).length, 4);
  assert.equal(fresh(all).length, 0, 'same fixes again: nothing new');
  const moved = all.map((p) => (p && p.hex === 'c0172e' ? { ...p, lastSeenNs: '1' } : p));
  assert.deepEqual(fresh(moved).map((p) => p.hex), ['c0172e']);
});

test('the source polls the point endpoint and hands over the batch', async () => {
  let asked = '';
  const source = new AdsbLolSource({
    center: { lat: 48.423, lon: -123.3708 },
    radiusNm: 40,
    fetchImpl: async (url, opts) => {
      asked = url;
      assert.match(opts.headers['User-Agent'], /planetar-adsb/);
      return { ok: true, json: async () => fixture };
    },
  });
  const batch = await source.pollOnce();
  assert.equal(asked, 'https://api.adsb.lol/v2/point/48.4230/-123.3708/40');
  assert.equal(batch.aircraft.length, 6);
  assert.equal(batch.nowMs, nowMs);
});

test('an HTTP error is an error, not an empty sky', async () => {
  const source = new AdsbLolSource({
    center: { lat: 48.423, lon: -123.3708 },
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  await assert.rejects(source.pollOnce(), /429/);
});
