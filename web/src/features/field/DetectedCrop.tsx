/** Crop detected automatically for a parcel (INTA Mapa Nacional de
 * Cultivos): the user fills nothing in. Shows the crop of each campaign
 * with its share, the source and the campaign, or «sin identificar». */
import { useEffect, useState } from "react";
import { apiCrop } from "../../api";
import type { CropDetection, CropSeason } from "../../api/types";
import { plotBody, type Multi } from "../../domain/selection";
import { useT, type Lang } from "../../i18n";

const TXT = {
  es: {
    title: "Campaña pasada (INTA)", loading: "Buscando el cultivo en el mapa del INTA…",
    summer: "Verano", winter: "Invierno", of: "de la parcela",
    no_coverage: "sin identificar", unavailable: "sin identificar", crop: "sin identificar",
    non_agricultural: "sin cultivo (no agrícola)", fallow: "barbecho",
    whyNone: "Esta parcela está fuera de la cobertura del Mapa Nacional de Cultivos (solo zona agrícola de Argentina).",
    whyDown: "No pudimos consultar el mapa del INTA ahora.",
    source: "Fuente",
    declare: "Cultivo (completalo vos)", declarePh: "Escribí el cultivo, por ej. trigo",
    declared: "Cultivo declarado por vos",
  },
  en: {
    title: "Last campaign (INTA)", loading: "Looking up the crop in INTA's map…",
    summer: "Summer", winter: "Winter", of: "of the parcel",
    no_coverage: "unidentified", unavailable: "unidentified", crop: "unidentified",
    non_agricultural: "no crop (non-agricultural)", fallow: "fallow",
    whyNone: "This parcel is outside the National Crop Map's coverage (Argentina's farming area only).",
    whyDown: "We couldn't reach INTA's map right now.",
    source: "Source",
    declare: "Crop (fill it in)", declarePh: "Type the crop, e.g. wheat",
    declared: "Crop declared by you",
  },
} as const;

/** One campaign as text: what was found and where it comes from. */
export function cropLine(s: CropSeason, lang: Lang) {
  const tx = TXT[lang];
  const pct = new Intl.NumberFormat(lang, { style: "percent" });
  const campaign = `${tx[s.season]} ${s.campaign}`;
  const crop = s.status === "crop" && s.crop ? s.crop[lang] : tx[s.status];
  const known = s.status !== "no_coverage" && s.status !== "unavailable";
  return { crop, detail: known && s.share != null
    ? `${pct.format(s.share)} ${tx.of} · ${campaign}` : campaign };
}

const CROPS = ["maíz", "soja", "trigo", "girasol", "cebada", "sorgo",
               "pastura", "barbecho"];

/** Typed crop, saved on blur or Enter. */
function DeclareInput({ value, label, placeholder, onCommit }: {
  value: string; label: string; placeholder: string; onCommit: (v: string) => void;
}) {
  const [v, setV] = useState(value);
  return (<>
    <datalist id="declare-crop-list">
      {CROPS.map((c) => <option key={c} value={c} />)}
    </datalist>
    <input value={v} aria-label={label} placeholder={placeholder}
           list="declare-crop-list"
           onChange={(e) => setV(e.target.value)}
           onBlur={() => v.trim() !== value && onCommit(v.trim())}
           onKeyDown={(e) => { if (e.key === "Enter")
             (e.target as HTMLInputElement).blur(); }} />
  </>);
}

/** `onDeclare`: when the map has no crop, the user can type it instead. */
export function DetectedCrop({ geom, declared = "", onDeclare }: {
  geom: Multi; declared?: string; onDeclare?: (crop: string) => void;
}) {
  const { lang } = useT();
  const tx = TXT[lang];
  const [res, setRes] = useState<CropDetection | null | undefined>(undefined);
  const key = JSON.stringify(geom);
  useEffect(() => {
    let live = true;
    setRes(undefined);
    apiCrop(plotBody(geom)).then((r) => { if (live) setRes(r); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (res === undefined) {
    return <p className="muted detected-crop" role="status">{tx.loading}</p>;
  }
  const seasons = res?.seasons ?? [];
  const shown = seasons.filter((s) => s.status !== "no_coverage" &&
                                      s.status !== "unavailable");
  if (!shown.length) {
    const down = !res || seasons.some((s) => s.status === "unavailable");
    return (
      <div className="detected-crop">
        {declared
          ? <span>{tx.declared}: <strong>{declared}</strong></span>
          : <span>{tx.title}: <strong>{tx.no_coverage}</strong></span>}
        <span className="muted"> · {down ? tx.whyDown : tx.whyNone}</span>
        {onDeclare && (
          <label className="declare-crop">
            <DeclareInput value={declared} label={tx.declare}
                          placeholder={tx.declarePh} onCommit={onDeclare} />
          </label>)}
      </div>);
  }
  return (
    <div className="detected-crop">
      <span>{tx.title}:</span>
      <ul>
        {shown.map((s) => {
          const line = cropLine(s, lang);
          return (
            <li key={s.season}><strong>{line.crop}</strong>
              <span className="muted"> · {line.detail}</span></li>);
        })}
      </ul>
      <span className="muted">{tx.source}: <a href={res!.source_url}
        target="_blank" rel="noreferrer">{res!.source}</a>
        {" "}(~{res!.resolution_m} m)</span>
    </div>);
}
