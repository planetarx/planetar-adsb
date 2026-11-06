// Each fix goes out once: adsb.lol returns every aircraft in range on every
// poll, and one that has not been heard since the last poll comes back with
// the same position (and so the same lastSeenNs).

export function createDeduper() {
  // hex -> lastSeenNs of the last fix let through.
  const last = new Map();
  return function fresh(positions) {
    const out = [];
    const seen = new Set();
    for (const pos of positions) {
      if (!pos) continue;
      seen.add(pos.hex);
      if (last.get(pos.hex) === pos.lastSeenNs) continue;
      last.set(pos.hex, pos.lastSeenNs);
      out.push(pos);
    }
    // Forget aircraft that have left, so the map cannot grow without bound.
    for (const hex of last.keys()) {
      if (!seen.has(hex)) last.delete(hex);
    }
    return out;
  };
}
