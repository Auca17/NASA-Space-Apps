/** Ashfield landing — vanilla renderer for / and /es/.
 *  Language comes from <html lang>; all strings live in content.ts. */
import "./landing.css";
import { CONTENT, type Landing, type Status } from "./content";

const lang = (document.documentElement.lang === "es" ? "es" : "en");
const c: Landing = CONTENT[lang];

const ICONS: Record<Status, string> = {
  done: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.8 8.2l2.2 2.2 4.2-4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  partial: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="8" r="2.6" fill="currentColor"/></svg>',
  "not-included": '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

const status = (s: Status) =>
  `<span class="status status-${s}">${ICONS[s]}${c.brief.statusLabel[s]}</span>`;

const seeLink = (see?: { label: string; href: string }) =>
  see ? `<a href="${see.href}">${see.label}</a>` : "";

const reqRow = (r: Landing["brief"]["groups"][number]["rows"][number]) => `
  <tr>
    <th scope="row"><span class="req-id">${r.id}</span>${r.requirement}</th>
    <td class="cell-does">${r.does}</td>
    <td class="cell-status">${status(r.status)}</td>
    <td class="cell-see">${seeLink(r.see)}</td>
    <td class="cell-limit">${r.limit ?? ""}</td>
  </tr>`;

const reqGroup = (g: Landing["brief"]["groups"][number]) => `
  <section class="req-group" aria-labelledby="req-${g.title.slice(0, 1)}">
    <h3>${g.title}</h3>
    <div class="table-wrap" role="region" tabindex="0" aria-label="${g.title}">
      <table class="req-table">
        <thead><tr>
          <th scope="col">${c.brief.cols.requirement}</th>
          <th scope="col">${c.brief.cols.does}</th>
          <th scope="col">${c.brief.cols.status}</th>
          <th scope="col">${c.brief.cols.see}</th>
          <th scope="col">${c.brief.cols.limit}</th>
        </tr></thead>
        <tbody>${g.rows.map(reqRow).join("")}</tbody>
      </table>
    </div>
  </section>`;

const figure = (img: Landing["proof"]["img"]) => `
  <figure class="chart">
    <img src="${img.src}" alt="${img.alt}" width="${img.width}" height="${img.height}" loading="lazy" decoding="async" />
    <figcaption>${img.caption}</figcaption>
  </figure>`;

const riskTable = () => `
  <div class="table-wrap" role="region" tabindex="0" aria-label="${c.trust.riskTitle}">
    <table class="risk-table">
      <thead><tr>
        <th scope="col">${c.trust.riskCols.label}</th>
        <th scope="col" class="num">${c.trust.riskCols.roc}</th>
        <th scope="col" class="num">${c.trust.riskCols.pr}</th>
        <th scope="col" class="num">${c.trust.riskCols.brier}</th>
      </tr></thead>
      <tbody>${c.trust.riskRows.map((r, i) => `
        <tr class="${i === 0 ? "risk-best" : ""}">
          <th scope="row">${r.label}</th>
          <td class="num">${r.roc}</td><td class="num">${r.pr}</td><td class="num">${r.brier}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;

const dataTable = () => `
  <div class="table-wrap" role="region" tabindex="0" aria-label="${c.data.heading}">
    <table class="data-table">
      <thead><tr>
        <th scope="col">${c.data.cols.name}</th>
        <th scope="col">${c.data.cols.what}</th>
        <th scope="col">${c.data.cols.resolution}</th>
        <th scope="col">${c.data.cols.where}</th>
      </tr></thead>
      <tbody>${c.data.rows.map((r) => `
        <tr><th scope="row">${r.name}</th><td>${r.what}</td>
        <td>${r.resolution}</td><td>${r.where}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>`;

const pendingList = () => `
  <h3>${c.data.pendingTitle}</h3>
  <ul class="pending">${c.data.pending.map((p) =>
    `<li><strong>${p.name}</strong> — ${p.why}</li>`).join("")}
  </ul>`;

const linksList = () => `
  <ul class="links">${c.team.links.map((l) => l.pending
    ? `<li><span class="pending-link">${l.label}</span> <span class="pend-tag">[PENDIENTE]</span></li>`
    : `<li><a href="${l.href}">${l.label}</a></li>`).join("")}
  </ul>`;

const videoBtn = c.hero.video
  ? `<a class="btn btn-ghost" href="${c.hero.video}">▶ Watch the video</a>` : "";

document.getElementById("root")!.innerHTML = `
  <a class="skip" href="#main">${c.skip}</a>
  <header class="site-head">
    <a class="brand" href="${lang === "es" ? "/es/" : "/"}" aria-label="Ashfield">
      <img class="brand-mark" src="/brand/ashfield-mark-light.svg" alt="" width="28" height="28" />
      <span class="brand-name">Ashfield</span>
    </a>
    <nav class="site-nav" aria-label="Page">
      <a class="lang-switch" href="${c.otherLang.href}" hreflang="${c.otherLang.label.toLowerCase()}">${c.otherLang.label}</a>
      <a class="btn btn-primary" href="/app/">${c.nav.openApp}</a>
    </nav>
  </header>
  <main id="main">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-text">
        <h1 id="hero-title">${c.hero.title}</h1>
        <p class="lede">${c.hero.lede}</p>
        <p class="tagline">${c.hero.tagline}</p>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg" href="/app/">${c.hero.openApp}</a>
          ${videoBtn}
        </div>
      </div>
      <img class="hero-mark" src="/brand/ashfield-mark-light.svg" alt="${c.hero.markAlt}" width="120" height="120" />
      <figure class="hero-shot">
        <img src="${c.hero.shot.src}" alt="${c.hero.shot.alt}"
             width="${c.hero.shot.width}" height="${c.hero.shot.height}"
             decoding="async" />
        <figcaption>${c.hero.shot.caption}</figcaption>
      </figure>
    </section>

    <section aria-labelledby="s-problem">
      <h2 id="s-problem">${c.problem.heading}</h2>
      ${c.problem.paragraphs.map((p) => `<p>${p}</p>`).join("")}
    </section>

    <section aria-labelledby="s-brief">
      <h2 id="s-brief">${c.brief.heading}</h2>
      <p class="section-lead">${c.brief.intro}</p>
      ${c.brief.groups.map(reqGroup).join("")}
    </section>

    <section aria-labelledby="s-proof">
      <h2 id="s-proof">${c.proof.heading}</h2>
      <p>${c.proof.lead}</p>
      ${figure(c.proof.img)}
      <dl class="metrics">${c.proof.metrics.map((m) =>
        `<div class="metric"><dt>${m.label}</dt><dd>${m.value}</dd></div>`).join("")}
      </dl>
      <p class="note">${c.proof.logNote}</p>
      <p>${c.proof.method}</p>
    </section>

    <section aria-labelledby="s-trust">
      <h2 id="s-trust">${c.trust.heading}</h2>
      <h3>${c.trust.riskTitle}</h3>
      <p>${c.trust.riskIntro}</p>
      ${riskTable()}
      <p class="note">${c.trust.riskNote}</p>
      <h3>${c.trust.orinTitle}</h3>
      <p>${c.trust.orinText}</p>
      ${figure(c.trust.orinImg)}
      <p class="note">${c.trust.orinHonest}</p>
    </section>

    <section aria-labelledby="s-data">
      <h2 id="s-data">${c.data.heading}</h2>
      ${dataTable()}
      ${pendingList()}
    </section>

    <section aria-labelledby="s-human">
      <h2 id="s-human">${c.human.heading}</h2>
      ${c.human.paragraphs.map((p) => `<p>${p}</p>`).join("")}
      <p class="disclaimer">${c.human.disclaimer}</p>
    </section>

    <section aria-labelledby="s-limits">
      <h2 id="s-limits">${c.limits.heading}</h2>
      <ul class="limits">${c.limits.items.map((i) => `<li>${i}</li>`).join("")}</ul>
    </section>

    <section aria-labelledby="s-team">
      <h2 id="s-team">${c.team.heading}</h2>
      <ul class="team">${c.team.members.map((m) =>
        `<li><strong>${m.name}</strong><span>${m.role}</span></li>`).join("")}
      </ul>
      <h3>${c.team.linksTitle}</h3>
      ${linksList()}
      <p class="note">${c.team.credits}</p>
      <p class="note">${c.team.orinNote}</p>
    </section>
  </main>
  <footer class="site-foot"><p>${c.footer.note}</p></footer>
`;
