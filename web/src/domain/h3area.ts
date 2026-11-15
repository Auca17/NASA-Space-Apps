/** Area geometry helpers. The H3 res-5 fire queries are gone with the
 * fire view (task 49); `circleRing` stays for the location-accuracy
 * circle the field flow draws. */
export type LatLon = [number, number]; // [lat, lon]

const EARTH_R_KM = 6371;

/** Circle approximated as a 32-vertex polygon. */
export function circleRing(lat: number, lon: number, radiusKm: number) {
  const pts: LatLon[] = [];
  const ang = radiusKm / EARTH_R_KM;
  const la = (lat * Math.PI) / 180;
  for (let i = 0; i < 32; i++) {
    const b = (i / 32) * 2 * Math.PI;
    const la2 = Math.asin(
      Math.sin(la) * Math.cos(ang) +
        Math.cos(la) * Math.sin(ang) * Math.cos(b));
    const lo2 =
      (lon * Math.PI) / 180 +
      Math.atan2(
        Math.sin(b) * Math.sin(ang) * Math.cos(la),
        Math.cos(ang) - Math.sin(la) * Math.sin(la2));
    pts.push([(la2 * 180) / Math.PI, (lo2 * 180) / Math.PI]);
  }
  return pts;
}
