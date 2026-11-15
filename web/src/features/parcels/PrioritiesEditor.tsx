/** "Mis prioridades": the eight hazards as a reorderable list. Each
 * row is 48 px and carries a drag handle (pointer), up/down buttons
 * (keyboard + touch) and a "mostrar / ocultar" toggle. Hidden hazards
 * stay computed but leave the main view for "Más información". */
import { useRef, useState } from "react";
import { useT } from "../../i18n";
import {
  moveHazard, reorderHazard, toggleHidden,
  type HazardId, type Profile,
} from "../../domain/parcelsProfile";
import { Icon } from "./CropIcon";

const HAZARD_ICON: Record<HazardId, string> = {
  fire: "flame", drought: "drop", frost: "frost", enso: "enso",
  heat: "sun", snow: "snow", hail: "hail", flood: "wave",
};

export function PrioritiesEditor({ value, onChange }: {
  value: Profile;
  onChange: (p: Profile) => void;
}) {
  const { t } = useT();
  const listRef = useRef<HTMLUListElement>(null);
  const [dragId, setDragId] = useState<HazardId | null>(null);

  /** Pointer drag on the handle: reorder by the pointer's row. */
  const startDrag = (e: React.PointerEvent, id: HazardId) => {
    e.preventDefault();
    setDragId(id);
    const move = (ev: PointerEvent) => {
      const rows = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>("[data-hz]") ?? []);
      if (!rows.length) return;
      let to = rows.length - 1;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) { to = i; break; }
      }
      onChange({ ...value, order: reorderHazard(value.order, id, to) });
    };
    const up = () => {
      setDragId(null);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };

  return (
    <ul className="prio-list" ref={listRef}
        aria-label={t("parcels.prio.title")}>
      {value.order.map((id, i) => {
        const hidden = value.hidden.includes(id);
        const name = t(`parcels.hz.${id}`);
        return (
          <li key={id} data-hz={id}
              className={`prio-row${hidden ? " off" : ""}${
                dragId === id ? " dragging" : ""}`}>
            <button type="button" className="prio-grip"
                    aria-label={t("parcels.prio.drag", { name })}
                    onPointerDown={(e) => startDrag(e, id)}>
              <span aria-hidden="true">⠿</span>
            </button>
            <Icon kind={HAZARD_ICON[id]} size={16} />
            <span className="prio-name">{name}</span>
            <span className="prio-rank muted" aria-hidden="true">{i + 1}</span>
            <button type="button" className="prio-btn"
                    aria-label={t("parcels.prio.up", { name })}
                    disabled={i === 0}
                    onClick={() => onChange(
                      { ...value, order: moveHazard(value.order, id, -1) })}>
              ↑</button>
            <button type="button" className="prio-btn"
                    aria-label={t("parcels.prio.down", { name })}
                    disabled={i === value.order.length - 1}
                    onClick={() => onChange(
                      { ...value, order: moveHazard(value.order, id, 1) })}>
              ↓</button>
            <button type="button" className="chip"
                    aria-pressed={hidden}
                    onClick={() => onChange(toggleHidden(value, id))}>
              {hidden ? t("parcels.prio.show") : t("parcels.prio.hide")}
            </button>
          </li>);
      })}
    </ul>);
}
