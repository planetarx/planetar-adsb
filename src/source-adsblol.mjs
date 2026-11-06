// Polls adsb.lol's public API for every aircraft within a radius of a point.
//
//   GET https://api.adsb.lol/v2/point/{lat}/{lon}/{radius_nm}
//   -> { ac: [ ...readsb records ], now: <ms>, total, ... }
//
// One request per pollMs (default 10 s): the API is free and keyless, so be a
// good citizen - a fixed User-Agent, never two requests at once, back off on
// errors. The data is ODbL 1.0 (https://adsb.lol, attribution required).

const API = process.env.ADSBLOL_API ?? 'https://api.adsb.lol';

export class AdsbLolSource {
  constructor({ center, radiusNm = 40, pollMs = 10_000, userAgent, fetchImpl = globalThis.fetch } = {}) {
    this.center = center;
    this.radiusNm = Math.min(Math.max(radiusNm, 1), 250);
    this.pollMs = Math.max(pollMs, 2_000);
    this.userAgent = userAgent ?? 'planetar-adsb/0.1 (+https://planetar.ca)';
    this.fetch = fetchImpl;
    this.onBatch = () => {};
    this.timer = null;
    this.failures = 0;
    this.stopped = false;
  }

  url() {
    const { lat, lon } = this.center;
    return `${API}/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${this.radiusNm}`;
  }

  start() {
    this.stopped = false;
    this._tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async pollOnce() {
    const res = await this.fetch(this.url(), {
      headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!body || !Array.isArray(body.ac)) throw new Error('no "ac" array in the response');
    // The server's clock, so record ages are measured against the data's own time.
    const nowMs = typeof body.now === 'number' ? body.now : Date.now();
    return { aircraft: body.ac, nowMs };
  }

  async _tick() {
    if (this.stopped) return;
    let delay = this.pollMs;
    try {
      const batch = await this.pollOnce();
      if (this.failures > 0) console.log(`[adsb.lol] recovered after ${this.failures} failure(s)`);
      this.failures = 0;
      this.onBatch(batch);
    } catch (e) {
      this.failures += 1;
      // Twice the poll, four times ... capped at 5 minutes.
      delay = Math.min(this.pollMs * 2 ** Math.min(this.failures, 5), 300_000);
      console.log(`[adsb.lol] poll failed (${e.message}); retry in ${Math.round(delay / 1000)} s`);
    }
    if (!this.stopped) this.timer = setTimeout(() => this._tick(), delay);
  }
}
