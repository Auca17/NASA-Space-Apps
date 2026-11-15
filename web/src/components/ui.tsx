import { useRef, useState, type ReactNode } from "react";
import { useT } from "../i18n";

export function Card({ title, children, className = "" }:
    { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

/** Bottom sheet on mobile, side panel on desktop (CSS does the split).
 *  Grab handle: tap or Enter/Space toggles, drag down collapses. */
export function BottomSheet({ children, open }: {
    children: ReactNode; open: boolean }) {
  const { t } = useT();
  const [collapsed, setCollapsed] = useState(false);
  const drag = useRef<number | null>(null);
  if (!open) return null;
  return (
    <aside className={`panel${collapsed ? " collapsed" : ""}`}
           aria-label={t("ui.panel")}>
      <button type="button" className="grab"
              aria-expanded={!collapsed}
              aria-label={t(collapsed ? "panel.expand"
                                       : "panel.collapse")}
              onClick={() => setCollapsed(!collapsed)}
              onPointerDown={(e) => { drag.current = e.clientY; }}
              onPointerMove={(e) => {
                if (drag.current != null &&
                    e.clientY - drag.current > 60) {
                  setCollapsed(true); drag.current = null;
                }
              }}
              onPointerUp={() => { drag.current = null; }} />
      <div className="panel-inner">{children}</div>
    </aside>
  );
}

export function Legend({ from, to, mid, colors }: {
    from: string; to: string; mid?: string; colors: string[] }) {
  const { t } = useT();
  return (
    <div className="legend" role="img"
         aria-label={t("legend.range", { from, to })}>
      <span>{from}</span>
      <span className="bar" style={{
        background: `linear-gradient(90deg, ${colors.join(",")})` }} />
      {mid && <span>{mid}</span>}
      <span>{to}</span>
    </div>
  );
}

export function Tooltip({ label, text }:
    { label?: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button type="button" className="glossary-btn"
              aria-label={label ?? "?"} aria-expanded={open}
              onClick={() => setOpen(!open)}>?</button>
      {open && <span className="tooltip-pop" role="tooltip">{text}</span>}
    </span>
  );
}
