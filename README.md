# planetar-adsb

Live aircraft for the planetar Victoria, BC operating area. Polls the public
[adsb.lol](https://adsb.lol) API for every aircraft within a radius of the
Inner Harbour and publishes each new position onto planetar-broker, the same
way `planetar-ais` publishes vessels.

> Status (2026-11-06): first pass. Built for the planetar-ue Explore client's
> aircraft layer. Local only (no GitHub remote yet); not deployed to www0.

## Topic published

| Topic | Schema | Purpose |
|---|---|---|
| `aircraft.adsb.position` | `aircraft.adsb.Position.v1` | One envelope per aircraft per poll whose position is new. |

Payload (`src/normalize.mjs` is authoritative): `hex` (ICAO 24-bit address, lower
case), `flight`, `registration`, `aircraftType`, `category`, `lat`, `lon`,
`onGround`, `altHaeM` (metres above the WGS84 ellipsoid, from readsb's
`alt_geom`; the planetar convention for altitude), `altBaroM` (pressure
altitude, metres), `groundSpeedKn`, `trackDeg`, `verticalRateFpm`, `squawk`,
`emergency`, `method` (`adsb`, `mlat`, `tisb`, `adsr`, `adsc`, `other`),
`positionAgeS`, `lastSeenNs` (when the position was heard, not when it was
polled), `serverId`, `source`, `attribution`.

Records with no position, or a position more than 60 s old, are dropped. An
aircraft not heard since the last poll is not published again; consumers age
it out themselves.

## Data licence

adsb.lol's data is under the **Open Database License (ODbL 1.0)**: attribution
is required, and a public database derived from it must be ODbL too. Every
payload carries `attribution: "adsb.lol (ODbL 1.0)"`; anything that shows these
aircraft should show that credit. (OpenSky and airplanes.live were not used:
both restrict commercial use.)

## Run

Broker must be listening on `127.0.0.1:12001`.

```bash
npm install
npm start
npm test        # node:test, no network
```

| Var | Default | Notes |
|---|---|---|
| `ADSB_LAT`, `ADSB_LON` | `48.423`, `-123.3708` | centre (the Inner Harbour) |
| `ADSB_RADIUS_NM` | `40` | 1-250 |
| `ADSB_POLL_MS` | `10000` | at least 2000; one request at a time, backs off on errors to 5 min |
| `ADSB_SERVER_ID` | `pac` | the planetar-ui server the aircraft belong to |
| `ADSBLOL_API` | `https://api.adsb.lol` | |
| `BROKER_HOST`, `BROKER_PUB_PORT` | `127.0.0.1`, `12001` | |

`src/publisher.mjs` and `src/zmesg.mjs` are copies of planetar-ais's (keep in
step with `../planetar-ui/bridge/zmesg.mjs`).

Licence: GPLv3 (see `LICENSE`).
