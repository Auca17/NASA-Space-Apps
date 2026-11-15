/** Take the map to the user's area before marking a field: current
 * location (browser geolocation) or a place searched on OpenStreetMap
 * (Nominatim, through the same-origin /api/geocode proxy). */
import { useState } from "react";
import { useT } from "../../i18n";
import { apiUrl } from "../../api/client";
import { parseLatLon } from "../../domain/selection";

type Hit = { lat: number; lon: number; name: string };

export function PlaceFinder({ onGo }: {
  onGo: (lat: number, lon: number) => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);

  const useMyLocation = () => {
    setDenied(false);
    if (!("geolocation" in navigator)) { setDenied(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false);
               onGo(p.coords.latitude, p.coords.longitude); },
      () => { setLocating(false); setDenied(true); },
      { timeout: 8000 });
  };

  const search = async () => {
    if (!q.trim()) return;
    // pasted coordinates go straight to the map, no lookup
    const ll = parseLatLon(q);
    if (ll) { setHits(null); onGo(ll[0], ll[1]); return; }
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/geocode?q=${encodeURIComponent(q)}`));
      const j = (await r.json()) as { hits?: Hit[] };
      setHits(j.hits ?? []);
    } catch { setHits([]); }
    setBusy(false);
  };

  const pick = (h: Hit) => { setHits(null); setQ(h.name); onGo(h.lat, h.lon); };

  return (
    <div className="place-finder">
      <span className="place-title">{t("place.title")}</span>
      <div className="place-row">
        <button type="button" onClick={useMyLocation} disabled={locating}>
          {locating ? t("place.locating") : t("place.myLocation")}</button>
        <form className="search"
              onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={t("place.placeholder")}
                 aria-label={t("place.placeholder")} />
          <button type="submit" disabled={busy}
                  aria-label={t("place.search")}>
            {busy ? "…" : t("place.search")}</button>
        </form>
      </div>
      {denied && <p className="muted" role="status">{t("place.denied")}</p>}
      {hits && hits.length === 0 && (
        <p className="muted" role="status">{t("place.none")}</p>)}
      {hits && hits.length > 0 && (
        <ul className="search-results">
          {hits.slice(0, 5).map((h) => (
            <li key={`${h.lat}${h.lon}${h.name}`}>
              <button type="button" onClick={() => pick(h)}>{h.name}</button>
            </li>))}
        </ul>)}
      <p className="muted place-note">{t("place.note")}</p>
    </div>);
}
