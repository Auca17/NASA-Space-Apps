/** SVG icons for crops and result badges. Stroke icons in
 * currentColor so they inherit the chip/badge color; `title` gives a
 * text alternative (never color alone). Emoji only as a last resort. */
import { cropIconKind } from "../../domain/parcels";

const P = {
  stroke: "currentColor",
  fill: "none",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glyph({ kind }: { kind: string }) {
  switch (kind) {
    case "grain":
      // cereal head: a stem with symmetric grains
      return (
        <>
          <path {...P} d="M8 13V6" />
          <path {...P} d="M8 6C6 6 5 4.8 5 3.2 6.8 3.2 8 4.5 8 6Z" />
          <path {...P} d="M8 6c2 0 3-1.2 3-2.8C9.2 3.2 8 4.5 8 6Z" />
          <path {...P} d="M8 9.5C6.4 9.5 5.3 8.5 5.3 7c1.6 0 2.7 1 2.7 2.5Z" />
          <path {...P} d="M8 9.5c1.6 0 2.7-1 2.7-2.5-1.6 0-2.7 1-2.7 2.5Z" />
          <path {...P} d="M8 13c-1.6 0-2.7-1-2.7-2.5 1.6 0 2.7 1 2.7 2.5Z" />
          <path {...P} d="M8 13c1.6 0 2.7-1 2.7-2.5-1.6 0-2.7 1-2.7 2.5Z" />
        </>);
    case "pod":
      // legume pod with peas
      return (
        <>
          <path {...P} d="M3.5 10.5C6 6.5 10 3.5 13 3c-.5 3-3.5 7-7.5 8.5" />
          <path {...P} d="M3.5 10.5C5 12 8.5 12.8 11 11.5" />
          <circle {...P} cx="7.2" cy="7.6" r="1" />
          <circle {...P} cx="9.8" cy="5.4" r="1" />
          <circle {...P} cx="6" cy="10" r="1" />
        </>);
    case "flower":
      // sunflower / rapeseed bloom
      return (
        <>
          <circle {...P} cx="8" cy="6.2" r="1.8" />
          <path {...P} d="M8 2.6v-1M4.8 3.4l-.8-.9M11.2 3.4l.8-.9M4.4 6.2H3M12 6.2h1.4M5.2 9l-1 1M10.8 9l1 1" />
          <path {...P} d="M8 8v5.4M8 11.4c-1.4 0-2.4-.8-2.4-2 1.4 0 2.4.8 2.4 2Z" />
        </>);
    case "boll":
      // cotton boll
      return (
        <>
          <path {...P} d="M8 9.5C5.5 9.5 4 7.6 4 5.4 4 3.6 5.2 2.6 6.4 3.4 6.4 2.2 7.6 1.8 8 1.8s1.6.4 1.6 1.6C10.8 2.6 12 3.6 12 5.4c0 2.2-1.5 4.1-4 4.1Z" />
          <path {...P} d="M8 9.5V12.4M8 12.4 5.8 14M8 12.4l2.2 1.6" />
        </>);
    case "bare":
      // bare soil: dashed field rows
      return (
        <>
          <path {...P} d="M3 5h10" strokeDasharray="2.4 1.8" />
          <path {...P} d="M3 8h10" strokeDasharray="2.4 1.8" />
          <path {...P} d="M3 11h10" strokeDasharray="2.4 1.8" />
        </>);
    case "leaf":
    default:
      return (
        <>
          <path {...P} d="M8 13.5V9" />
          <path {...P} d="M8 9C8 5.5 5.5 3 2.5 3c0 3.8 2.2 6 5.5 6Z" />
          <path {...P} d="M8 9c0-4 2-6.5 5.5-6.5C13.5 6.5 11.5 9 8 9Z" />
        </>);
    case "flame":
      return (
        <>
          <path {...P} d="M8 13.6c-2.5 0-4.2-1.6-4.2-3.9 0-1.5.8-2.8 1.7-3.8C6 5.4 6.4 5 6.6 4.4c.3-1 .6-2.1.2-3.2 2.4 1 4.2 3 4.6 5.6.3-.4.4-1 .4-1.6.9.9 1.4 2.2 1.4 4 0 2.4-2 4.4-5.2 4.4Z" />
          <path {...P} d="M8 13.6c-1.2 0-2.1-.8-2.1-1.9 0-1.2 1-1.7 1.5-2.7.3-.5.4-1.1.3-1.7 1.3.7 2.4 2.1 2.4 3.6 0 1.1-.9 2.7-2.1 2.7Z" />
        </>);
    case "drop":
      return (
        <path {...P} d="M8 13.8c-2.1 0-3.7-1.5-3.7-3.6C4.3 7.4 6.3 4.4 8 2.2c1.7 2.2 3.7 5.2 3.7 8 0 2.1-1.6 3.6-3.7 3.6Z" />);
    case "alert":
      return (
        <>
          <path {...P} d="M8 2.4 14 13H2L8 2.4Z" />
          <path {...P} d="M8 6.4v3" />
          <circle cx="8" cy="11.3" r="0.9" fill="currentColor" />
        </>);
    case "fire-station":
      return (
        <>
          <path {...P} d="M3 13.5V7L8 3.2 13 7v6.5" />
          <path {...P} d="M2 7.5 8 3.2l6 4.3" />
          <path {...P} d="M6.4 13.5V9.8h3.2v3.7" />
        </>);
    case "hospital":
      return (
        <>
          <rect {...P} x="3.2" y="4.5" width="9.6" height="9" rx="1" />
          <path {...P} d="M8 7v4M6 9h4" />
        </>);
  }
}

export function Icon({ kind, title, size = 16, className = "" }: {
    kind: string; title?: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16"
         className={`pi ${className}`}
         role={title ? "img" : undefined}
         aria-hidden={title ? undefined : true}
         aria-label={title}>
      {title && <title>{title}</title>}
      <Glyph kind={kind} />
    </svg>);
}

export function CropIcon({ crop, title, size = 16, className = "" }: {
    crop: string; title?: string; size?: number; className?: string }) {
  return <Icon kind={cropIconKind(crop)} title={title} size={size}
               className={className} />;
}
