import { useState } from "react";
import { useT } from "../../i18n";
import { APP_NAME } from "../../config";
import { apiUrl } from "../../api/client";

type Hit = { lat: number; lon: number; name: string };

export function Welcome({ onLocate, onExplore }: {
  onLocate: (lat: number, lon: number) => void;
  onExplore: () => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const geo = () => {
    if (!("geolocation" in navigator)) { setDenied(true); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => onLocate(p.coords.latitude, p.coords.longitude),
      () => setDenied(true),
      { timeout: 8000 });
  };

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      // same-origin proxy: public Nominatim sends no CORS header
      const r = await fetch(
        apiUrl(`/api/geocode?q=${encodeURIComponent(q)}`));
      const j = (await r.json()) as
        { hits: { lat: number; lon: number; name: string }[] };
      setHits(j.hits ?? []);
    } catch { setHits([]); }
    setBusy(false);
  };

  return (
    <div className="welcome">
      <h2>{APP_NAME}</h2>
      <p className="muted">{t("app.tagline")}</p>
      <h3>{t("welcome.title")}</h3>
      <p>{t("welcome.text")}</p>
      <div className="actions">
        <button className="primary" onClick={geo}>{t("welcome.myZone")}</button>
        <button onClick={onExplore}>{t("welcome.explore")}</button>
      </div>
      <p className="geo-note">{t("welcome.geoNote")}</p>
      {(denied || hits.length >= 0) && (
        <>
          {denied && <p className="muted">{t("welcome.noGps")}</p>}
          <form className="search" onSubmit={(e) => { e.preventDefault(); search(); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder={t("welcome.searchPlaceholder")}
                   aria-label={t("welcome.searchPlaceholder")} />
            <button type="submit" disabled={busy}>
              {busy ? t("welcome.searching") : "→"}
            </button>
          </form>
          <ul className="search-results">
            {hits.map((h) => (
              <li key={`${h.lat}${h.lon}${h.name}`}>
                <button type="button" onClick={() => onLocate(h.lat, h.lon)}>
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
