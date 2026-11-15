/** What is on the field NOW: this season's Sentinel-2 read by phenology.
 * No published crop map covers the running campaign, so this is the
 * current information; INTA's map stays below as last campaign. */
import { useEffect, useState } from "react";
import { apiCurrentCrop } from "../../api";
import type { CurrentCrop } from "../../api/types";
import { plotBody, type Multi } from "../../domain/selection";
import { useT } from "../../i18n";

const TXT = {
  es: { title: "Ahora en el campo", season: "campaña {s}",
        loading: "Leyendo las imágenes Sentinel-2 de esta campaña (puede tardar un minuto)…",
        image: "imagen Sentinel-2 del {d}", none: "No hay imágenes despejadas suficientes de esta campaña.",
        out: "Fuera de la zona modelada (Argentina).", down: "No pudimos leer las imágenes ahora.",
        note: "Soja o maíz tardío todavía no se distinguen: se siembran en noviembre-diciembre." },
  en: { title: "On the field now", season: "{s} season",
        loading: "Reading this season's Sentinel-2 images (may take a minute)…",
        image: "Sentinel-2 image of {d}", none: "Not enough clear images this season.",
        out: "Outside the modelled area (Argentina).", down: "We couldn't read the images right now.",
        note: "Soybean or late maize can't be told yet: they are sown Nov-Dec." },
} as const;

export function CurrentCropPanel({ geom }: { geom: Multi }) {
  const { lang } = useT();
  const tx = TXT[lang];
  const [res, setRes] = useState<CurrentCrop | null | undefined>(undefined);
  const key = JSON.stringify(geom);
  useEffect(() => {
    let live = true;
    setRes(undefined);
    apiCurrentCrop(plotBody(geom)).then((r) => { if (live) setRes(r); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const pct = new Intl.NumberFormat(lang, { style: "percent" });
  const day = res?.as_of ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(res.as_of + "T00:00:00Z")).replace(/\./g, "") : "";
  return (
    <div className="detected-crop current-crop">
      <span><strong>{tx.title}</strong>
        {res?.season && <span className="muted"> · {tx.season.replace("{s}", res.season)}</span>}
      </span>
      {res === undefined && <p className="muted" role="status">{tx.loading}</p>}
      {res !== undefined && res?.status !== "available" && (
        <p className="muted" role="status">
          {!res || res.status === "unavailable" ? tx.down
            : res.status === "no_coverage" ? tx.out : tx.none}</p>)}
      {res?.status === "available" && <>
        <ul>
          {res.zones.map((z) => (
            <li key={z.class.id}><strong>{z.class[lang]}</strong>
              <span className="muted"> · {pct.format(z.share)}</span></li>))}
        </ul>
        <span className="muted">{tx.image.replace("{d}", day)} · {tx.note}</span>
      </>}
    </div>);
}
