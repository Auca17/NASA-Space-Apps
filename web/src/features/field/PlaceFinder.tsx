/** Take the map to the user's area before marking a field: current
 * location (browser geolocation) or a place searched on OpenStreetMap
 * (Nominatim, through the same-origin /api/geocode proxy). */
import { useRef, useState } from "react";
import { useT } from "../../i18n";
import { apiUrl } from "../../api/client";
import { parseLatLon } from "../../domain/selection";

type Hit = { lat: number; lon: number; name: string };

export function PlaceFinder({ onGo }: {
  onGo: (lat: number, lon: number, precise?: boolean, accuracy?: number) => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const searchRevision = useRef(0);
  const resetSearch = () => {
    searchRevision.current++;
    setHits(null);
    setFailed(false);
    setBusy(false);
  };

  const useMyLocation = () => {
    setDenied(false);
    resetSearch();
    if (!("geolocation" in navigator)) { setDenied(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = p.coords;
        if (accuracy > 0) onGo(latitude, longitude, true, accuracy);
        else onGo(latitude, longitude, true);
      },
      () => { setLocating(false); setDenied(true); },
      { timeout: 8000 });
  };

  const search = async () => {
    const input = q.trim();
    if (!input || busy) return;
    resetSearch();
    const revision = searchRevision.current;
    setDenied(false);
    const ll = parseLatLon(input);
    if (ll) { onGo(ll[0], ll[1], true); return; }
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/geocode?q=${encodeURIComponent(input)}&bias=ar`));
      if (!r.ok) throw new Error("Geocoding request failed");
      const j = (await r.json()) as { hits?: Hit[] };
      if (revision === searchRevision.current) setHits(j.hits ?? []);
    } catch {
      if (revision === searchRevision.current) setFailed(true);
    } finally {
      if (revision === searchRevision.current) setBusy(false);
    }
  };

  const pick = (h: Hit) => { setHits(null); setQ(h.name); onGo(h.lat, h.lon); };

  return (
    <div className="place-finder">
      <span className="place-title">{t("place.title")}</span>
      <p className="muted place-note">{t("place.hint")}</p>
      <div className="place-row">
        <button type="button" onClick={useMyLocation} disabled={locating}>
          {locating ? t("place.locating") : t("place.myLocation")}</button>
        <form className="search"
              onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input value={q} onChange={(e) => { resetSearch(); setQ(e.target.value); }}
                 placeholder={t("place.placeholder")}
                 aria-label={t("place.placeholder")} />
          <button type="submit" disabled={busy}
                  aria-label={t("place.search")}>
            {busy ? "…" : t("place.search")}</button>
        </form>
      </div>
      {denied && <p className="muted" role="status">{t("place.denied")}</p>}
      {failed && <p className="muted" role="status">{t("place.failed")}</p>}
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
