import { useEffect, useId, useRef } from "react";

/**
 * Logo de Ashfield animado. En reposo las hojas se mecen y la llama titila.
 * El viento sale del scroll de cualquier panel y de la rueda del mouse
 * (zoom del globo): con brisa las hojas se inclinan; con una ráfaga vuelan
 * chispas y la hoja verde se prende fuego de abajo hacia arriba. Cuando el
 * viento calma, el cultivo rebrota. Con "reducir movimiento" no hay balanceo
 * ni partículas, pero la hoja igual cambia de color.
 */

const STRONG = 0.55; // umbral de ráfaga (0..1)
const SVG_NS = "http://www.w3.org/2000/svg";

interface Particle { el: SVGCircleElement; x: number; y: number; vx: number; vy: number; age: number; life: number; r: number }

export function WindLogo({ size = 32, title = "Ashfield" }: { size?: number; title?: string }) {
  const uid = useId().replace(/:/g, "");
  const flameRef = useRef<SVGGElement>(null);
  const leafRef = useRef<SVGGElement>(null);
  const fxRef = useRef<SVGGElement>(null);
  const stopRefs = [useRef<SVGStopElement>(null), useRef<SVGStopElement>(null), useRef<SVGStopElement>(null)];

  useEffect(() => {
    const reduce = typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let wind = 0;
    let heat = 0;
    let raf = 0;
    const parts: Particle[] = [];
    const last = new WeakMap<EventTarget, { pos: number; t: number }>();

    const push = (target: number) => {
      const v = Math.min(1, target);
      if (v > wind) wind += (v - wind) * 0.35;
    };
    const onScroll = (e: Event) => {
      const el = e.target === document ? document.scrollingElement : (e.target as Element);
      if (!el) return;
      const t = performance.now();
      const pos = el.scrollTop + el.scrollLeft;
      const prev = last.get(el);
      last.set(el, { pos, t });
      if (!prev) return;
      push(Math.abs(pos - prev.pos) / Math.max(8, t - prev.t) / 3.2); // px/ms
    };
    const onWheel = (e: WheelEvent) => push(Math.abs(e.deltaY) / 160);

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    addEventListener("wheel", onWheel, { passive: true });

    const spark = (x: number, y: number) => {
      const g = fxRef.current;
      if (reduce || !g || parts.length > 30) return;
      const el = document.createElementNS(SVG_NS, "circle");
      el.setAttribute("fill", "var(--logo-ember-hot)");
      g.appendChild(el);
      parts.push({ el, x, y, age: 0, life: 45, r: 0.8,
        vx: 0.35 + Math.random() * 0.35, vy: -0.15 - Math.random() * 0.25 });
    };

    const frame = (t: number) => {
      wind *= 0.965;
      const strong = Math.max(0, wind - STRONG) / (1 - STRONG);
      if (strong > 0) heat = Math.min(1, heat + strong * 0.02);
      else if (wind < 0.2) heat = Math.max(0, heat - 0.004);
      if (strong > 0 && Math.random() < 0.6) spark(21 + Math.random() * 6, 12 + Math.random() * 16);
      if (heat > 0.6 && Math.random() < 0.15 * heat) spark(42 + Math.random() * 6, 20 + Math.random() * 10);

      const s = reduce ? 0 : t / 1000;
      const sway = reduce ? 0 : 1 + wind * 3;
      const lean = reduce ? 0 : wind * 16;
      /* idle sway must read at 30 px in the top bar: ±5° flame, ±5.5°
       * leaf, ~7 % flame flicker (ui-style.md §3 "sway gently and
       * flicker" — bigger is noise, this is still a breeze) */
      const aF = lean + Math.sin(s * 1.6) * 5 * sway + Math.sin(s * 7.3) * wind * 3;
      const aL = lean * 0.8 + Math.sin(s * 1.3 + 1.1) * 5.5 * sway + Math.sin(s * 6.1 + 2) * wind * 3;
      const fl = reduce ? 1 : 1 + Math.sin(s * 9) * 0.07 + Math.sin(s * 14.7) * 0.045;
      const lk = heat > 0.9 && !reduce ? 1 + Math.sin(s * 11) * 0.03 : 1;
      flameRef.current?.setAttribute("transform",
        `rotate(${aF.toFixed(2)} 31 47) translate(31 47) scale(${(2 - fl).toFixed(3)} ${fl.toFixed(3)}) translate(-31 -47)`);
      leafRef.current?.setAttribute("transform",
        `rotate(${aL.toFixed(2)} 33 47) translate(33 47) scale(${(2 - lk).toFixed(3)} ${lk.toFixed(3)}) translate(-33 -47)`);

      const edge = heat * 1.1; // frente de fuego en la hoja, de la base a la punta
      const offs = [Math.max(0, edge - 0.25), Math.min(1, Math.max(0, edge - 0.05)), Math.min(1, edge + 0.04)];
      stopRefs.forEach((r, i) => r.current?.setAttribute("offset", offs[i].toFixed(3)));

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age++; p.x += p.vx + wind * 0.25; p.y += p.vy;
        const f = 1 - p.age / p.life;
        p.el.setAttribute("cx", p.x.toFixed(2));
        p.el.setAttribute("cy", p.y.toFixed(2));
        p.el.setAttribute("r", (p.r * f + 0.2).toFixed(2));
        p.el.setAttribute("opacity", f.toFixed(2));
        if (f <= 0) { p.el.remove(); parts.splice(i, 1); }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("scroll", onScroll, { capture: true });
      removeEventListener("wheel", onWheel);
      parts.forEach((p) => p.el.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grad = `wl-heat-${uid}`;
  return (
    <svg className="wind-logo anim" viewBox="0 0 64 64" width={size}
         height={size} role="img" aria-label={title}>
      <defs>
        <linearGradient id={grad} gradientUnits="userSpaceOnUse" x1="38" y1="47" x2="47" y2="14">
          <stop ref={stopRefs[0]} offset="0" style={{ stopColor: "var(--logo-ember)" }} />
          <stop ref={stopRefs[1]} offset="0" style={{ stopColor: "var(--logo-ember-hot)" }} />
          <stop ref={stopRefs[2]} offset="0" style={{ stopColor: "var(--logo-crop)" }} />
        </linearGradient>
      </defs>
      <path d="M12 54 Q32 49 52 54" fill="none" stroke="var(--logo-stubble)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M7 60 Q32 54 57 60" fill="none" stroke="var(--logo-stubble)" strokeWidth="2.6" strokeLinecap="round" />
      <g ref={flameRef} data-part="flame">
        <path d="M31 47 C17 43 12 27 21 9 C23 22 32 27 31 47 Z" fill="var(--logo-ember)" />
      </g>
      <g ref={leafRef} data-part="leaf">
        <path d="M33 47 C33 31 40 22 49 15 C53 31 46 44 33 47 Z" fill={`url(#${grad})`} />
      </g>
      <path d="M32 47 L32 53" stroke="var(--fg)" strokeWidth="2.6" strokeLinecap="round" />
      <g ref={fxRef} />
    </svg>
  );
}
