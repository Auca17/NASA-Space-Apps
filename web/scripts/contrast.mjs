/** Contrast audit of the app.css palette (WCAG 2.x ratios).
 * Prints a table of every text/background pair used by the UI. */
const L = (hex) => {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const light = {
  bg: "#f7f5f0", fg: "#1b1b18", panel: "#ffffff", muted: "#5b5b55",
  accent: "#b3401e", accentFg: "#ffffff", border: "#d8d5cc",
  good: "#2e7d32", warn: "#9e5c00", bad: "#b3261e",
  focus: "#1a56db", covered: "#5d8a4e", bareText: "#8a6d1f",
};
const dark = {
  bg: "#141412", fg: "#eceae3", panel: "#1f1f1c", muted: "#a8a69c",
  accent: "#e0683f", accentFg: "#141412", border: "#3a3a35",
  good: "#7fb069", warn: "#d99a2b", bad: "#e06a63", focus: "#7aa2ff",
  bareText: "#d9b45c",
};

const pairs = (p) => [
  ["fg / bg", p.fg, p.bg],
  ["fg / panel", p.fg, p.panel],
  ["muted / bg", p.muted, p.bg],
  ["muted / panel", p.muted, p.panel],
  ["accent-fg / accent", p.accentFg, p.accent],
  ["accent / panel", p.accent, p.panel],
  ["good / panel", p.good, p.panel],
  ["warn / panel", p.warn, p.panel],
  ["bad / panel", p.bad, p.panel],
  ["focus / panel", p.focus, p.panel],
  ["bareText / panel", p.bareText, p.panel],
];

console.log("| pair | light | dark | ≥4.5 |");
console.log("|---|---|---|---|");
pairs(light).forEach(([name, la, lb], i) => {
  const [, da, db] = pairs(dark)[i];
  const lr = ratio(la, lb), dr = ratio(da, db);
  console.log(`| ${name} | ${lr.toFixed(2)} | ${dr.toFixed(2)} | ` +
    `${lr >= 4.5 && dr >= 4.5 ? "OK" : "FAIL"} |`);
});
