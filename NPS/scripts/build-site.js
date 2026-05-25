// build-site.js — gerador genérico de documentação a partir de specs OpenAPI.
//
// Lê um docs.config.json no diretório atual, carrega cada openapi.yaml
// indicado, opcionalmente carrega arquivos markdown de "visão geral" e
// gera um único index.html self-contained (sidebar + busca + tema
// claro/escuro), usando render-spec.js para transformar cada spec em
// HTML estático no estilo "overview" (sem Swagger UI).
//
// Uso:
//   node build-site.js                  # lê ./docs.config.json
//   node build-site.js outra-config.json
//
// Dependência runtime: js-yaml (npm i js-yaml).
// Os arquivos render-spec.js e cofounder.css devem estar ao lado deste
// script (ver layout no SKILL.md).

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { renderSpecContent } = require('./render-spec');

const SCRIPT_DIR = __dirname;
const CWD = process.cwd();

const configPath = path.resolve(CWD, process.argv[2] || 'docs.config.json');
if (!fs.existsSync(configPath)) {
  console.error(`Config não encontrado: ${configPath}`);
  console.error('Crie um docs.config.json (ver exemplo no SKILL.md).');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const ROOT = path.dirname(configPath);
const OUT = path.resolve(ROOT, config.output || 'index.html');

const title = config.title || 'Documentação';
const heroEyebrow = config.heroEyebrow || 'Documentação';
const heroTitle = config.heroTitle || title;
const heroLede = config.heroLede || '';
const brand = config.brand || title;

// --- carrega specs ----------------------------------------------------------
function readSpec(specPath) {
  const abs = path.resolve(ROOT, specPath);
  const txt = fs.readFileSync(abs, 'utf8');
  if (/\.json$/i.test(abs)) return JSON.parse(txt);
  return yaml.load(txt);
}

const apps = (config.apps || []).map(app => {
  const spec = readSpec(app.spec);
  return {
    key: app.key,
    label: app.label || app.key,
    group: app.group || 'default',
    tag: app.tag || null,
    desc: app.desc || (spec.info && spec.info.description ? String(spec.info.description).split(/\n/)[0].trim() : ''),
    title: (spec.info && spec.info.title) || app.key,
    contentHtml: renderSpecContent(spec),
  };
});

// --- carrega "overviews" (arquivos markdown opcionais) ---------------------
const overviews = (config.overviews || []).map(o => ({
  key: o.key,
  label: o.label || o.key,
  group: o.group || 'default',
  md: fs.readFileSync(path.resolve(ROOT, o.file), 'utf8'),
}));

// --- agrupamento da sidebar ------------------------------------------------
const groups = config.groups || [];
const allGroupKeys = [
  ...new Set([
    ...groups.map(g => g.key),
    ...apps.map(a => a.group),
    ...overviews.map(o => o.group),
  ]),
];
const groupMeta = Object.fromEntries(
  allGroupKeys.map(k => {
    const meta = groups.find(g => g.key === k);
    return [k, { key: k, label: meta?.label || k }];
  })
);

const siteData = {
  title,
  brand,
  hero: { eyebrow: heroEyebrow, title: heroTitle, lede: heroLede },
  groups: allGroupKeys.map(k => groupMeta[k]),
  apps,
  overviews,
};

const dataJson = JSON.stringify(siteData)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');

// CSS embutido — copiado de ../assets/cofounder.css
const cssPath = path.join(SCRIPT_DIR, '..', 'assets', 'cofounder.css');
const cofounderCss = fs.readFileSync(cssPath, 'utf8');

const html = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlAttr(title)}</title>
  <link rel="icon" href="data:," />
  <link rel="preconnect" href="https://rsms.me/" />
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  <style>
${cofounderCss}

    .view { display: none; }
    .view.is-active { display: block; }
    .cf-hero {
      max-width: var(--content-w);
      margin: 0 auto;
      padding: 56px 28px 0;
    }
    .cf-hero .cf-eyebrow {
      font-size: 12px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted-2); margin: 0 0 14px;
    }
    .cf-hero h1 {
      font-size: 40px; line-height: 1.1; font-weight: 700;
      letter-spacing: -0.025em; margin: 0 0 14px;
      color: var(--fg-strong);
    }
    .cf-hero p.lede {
      font-size: 18px; line-height: 1.55; color: var(--muted);
      margin: 0 0 20px; max-width: 640px;
    }
    .cf-cards-section {
      max-width: var(--content-w);
      margin: 24px auto 0;
      padding: 0 28px;
    }
    .cf-section-title {
      grid-column: 1 / -1;
      margin: 32px 0 8px;
      font-size: 12px; font-weight: 600;
      letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted-2);
    }
  </style>
</head>
<body>
  <header class="cf-topbar">
    <button class="cf-icon cf-menu-toggle" id="menuToggle" aria-label="Abrir menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <a class="cf-brand" href="#/home">
      <span>${escapeHtmlAttr(brand)}</span>
    </a>
    <div class="cf-spacer"></div>
    <input id="search" class="cf-search" type="search" placeholder="Buscar…" />
    <button class="cf-icon" id="themeToggle" aria-label="Alternar tema"></button>
  </header>

  <div class="cf-backdrop" id="backdrop"></div>

  <div class="cf-layout">
    <aside class="cf-sidebar" id="sidebar"></aside>

    <main class="cf-main">
      <section class="view" id="view-home">
        <div class="cf-hero">
          <p class="cf-eyebrow">${escapeHtmlAttr(heroEyebrow)}</p>
          <h1>${escapeHtmlAttr(heroTitle)}</h1>
          ${heroLede ? `<p class="lede">${escapeHtmlAttr(heroLede)}</p>` : ''}
        </div>
        <div id="homeCards"></div>
      </section>

      <section class="view" id="view-md">
        <article class="cf-content" id="mdContent"></article>
      </section>

      <section class="view" id="view-spec">
        <article class="cf-content" id="specContent"></article>
      </section>
    </main>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked@11/marked.min.js"></script>

  <script id="site-data" type="application/json">${dataJson}</script>
  <script>
    const data = JSON.parse(document.getElementById('site-data').textContent);
    const apps = data.apps;
    const overviews = data.overviews;
    const groups = data.groups;

    // ---------- THEME ----------
    const SVG_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const SVG_SUN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
    const themeBtn = document.getElementById('themeToggle');
    function paintThemeIcon() {
      const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      themeBtn.innerHTML = theme === 'dark' ? SVG_MOON : SVG_SUN;
      const label = theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
      themeBtn.setAttribute('aria-label', label);
      themeBtn.setAttribute('title', label);
    }
    const savedTheme = localStorage.getItem('cf-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    paintThemeIcon();
    themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('cf-theme', next);
      paintThemeIcon();
    });

    // ---------- SIDEBAR ----------
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('backdrop');
    document.getElementById('menuToggle').addEventListener('click', () => {
      const opened = sidebar.classList.toggle('is-open');
      backdrop.classList.toggle('is-open', opened);
    });
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
    });

    function navItemHtml(route, label, tag) {
      const tagHtml = tag ? \`<span class="cf-tag">\${tag}</span>\` : '';
      return \`<a class="cf-nav-item" data-route="\${route}" href="#/\${route}">\${label}\${tagHtml}</a>\`;
    }

    function populateSidebar() {
      let html = '';
      html += '<a class="cf-nav-item" data-route="home" href="#/home">Início</a>';
      for (const g of groups) {
        const ovs = overviews.filter(o => o.group === g.key);
        const ais = apps.filter(a => a.group === g.key);
        if (!ovs.length && !ais.length) continue;
        html += \`<div class="cf-group">\${g.label}</div>\`;
        for (const o of ovs) html += navItemHtml('md-' + o.key, o.label, 'md');
        for (const a of ais) html += navItemHtml(a.key, a.label, a.tag || 'api');
      }
      sidebar.innerHTML = html;
    }

    function cardHtml(a) {
      const tag = a.tag ? \`<span class="cf-tag">\${a.tag}</span>\` : '';
      return \`<a class="cf-card" data-route="\${a.key}" href="#/\${a.key}">
        <div class="cf-card-head"><h3>\${a.label}</h3>\${tag}</div>
        <p>\${a.desc || ''}</p>
        <span class="cf-card-link">Abrir →</span>
      </a>\`;
    }

    function populateHomeCards() {
      const container = document.getElementById('homeCards');
      let html = '';
      for (const g of groups) {
        const list = apps.filter(a => a.group === g.key);
        if (!list.length) continue;
        html += '<div class="cf-cards-section"><div class="cf-cards">';
        html += '<h2 class="cf-section-title">' + g.label + '</h2>';
        html += list.map(cardHtml).join('');
        html += '</div></div>';
      }
      container.innerHTML = html;
    }

    // ---------- ROUTER ----------
    let currentRoute = null;
    function setRoute(route) {
      currentRoute = route;
      document.querySelectorAll('a.cf-nav-item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.route === route);
      });
      const isHome = route === 'home';
      const isMd = route.startsWith('md-');
      document.getElementById('view-home').classList.toggle('is-active', isHome);
      document.getElementById('view-md').classList.toggle('is-active', isMd);
      document.getElementById('view-spec').classList.toggle('is-active', !isHome && !isMd);
      if (isHome) {
        document.title = data.title;
      } else if (isMd) {
        const o = overviews.find(x => 'md-' + x.key === route);
        if (!o) { setRoute('home'); return; }
        document.title = o.label + ' · ' + data.title;
        document.getElementById('mdContent').innerHTML =
          window.marked ? marked.parse(o.md) : o.md;
      } else {
        const info = apps.find(x => x.key === route);
        if (!info) { setRoute('home'); return; }
        document.title = info.title + ' · ' + data.title;
        document.getElementById('specContent').innerHTML = info.contentHtml;
      }
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      if (history.replaceState) history.replaceState(null, '', '#/' + route);
      window.scrollTo(0, 0);
    }

    // ---------- tabs Example/Schema ----------
    document.body.addEventListener('click', (e) => {
      const tab = e.target.closest && e.target.closest('.cf-tab[data-tab-name]');
      if (!tab) return;
      e.preventDefault();
      const container = tab.closest('[data-tabs]');
      if (!container) return;
      const name = tab.getAttribute('data-tab-name');
      container.querySelectorAll('.cf-tab').forEach(t => {
        t.classList.toggle('is-active', t.getAttribute('data-tab-name') === name);
      });
      container.querySelectorAll('.cf-tab-panel').forEach(p => {
        p.classList.toggle('is-active', p.getAttribute('data-panel-name') === name);
      });
    });

    // ---------- collapse de endpoints/schemas ----------
    document.body.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      if (e.target.closest('button') && !e.target.closest('[data-collapse-toggle]')) return;
      const head = e.target.closest('[data-collapse-toggle]');
      if (!head) return;
      const card = head.parentNode;
      if (card) card.classList.toggle('is-collapsed');
    });

    // ---------- SEARCH ----------
    document.getElementById('search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('.cf-sidebar a.cf-nav-item').forEach(el => {
        const txt = el.textContent.toLowerCase();
        el.style.display = !q || txt.includes(q) ? '' : 'none';
      });
    });

    // ---------- INIT ----------
    populateSidebar();
    populateHomeCards();
    if (window.marked) marked.setOptions({ gfm: true, breaks: false, headerIds: true });

    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-route]');
      if (!el) return;
      e.preventDefault();
      setRoute(el.dataset.route);
    });

    const initial = (location.hash || '').replace(/^#\\/?/, '') || 'home';
    setRoute(initial);
    window.addEventListener('hashchange', () => {
      const r = (location.hash || '').replace(/^#\\/?/, '') || 'home';
      if (r !== currentRoute) setRoute(r);
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
const kb = (html.length / 1024).toFixed(1);
console.log(`OK: ${path.relative(CWD, OUT)} escrito (${kb} KB, ${apps.length} specs + ${overviews.length} overviews)`);

function escapeHtmlAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
