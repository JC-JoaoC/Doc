// Aplica a estética "cofounder" em todas as páginas Swagger individuais e
// no docs-csat/docs.html, preservando as specs JSON embutidas.
//
// Uso: node apply-cofounder.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// ---------- catálogo (mesma ordem dos hubs) ----------
const HC = [
  { key: 'cardiocheck', port: '3002', group: 'clinical' },
  { key: 'glicocheck',  port: '3003', group: 'clinical' },
  { key: 'hemocheck',   port: '3009', group: 'clinical' },
  { key: 'nutricheck',  port: '3004', group: 'clinical' },
  { key: 'osteocheck',  port: '3005', group: 'clinical' },
  { key: 'renalcheck',  port: '3006', group: 'clinical' },
  { key: 'sexcheck',    port: '3007', group: 'clinical' },
  { key: 'tireocheck',  port: '3008', group: 'clinical' },
  { key: 'aquaflow',    port: '3001', group: 'habit'    },
  { key: 'listaCompras', port: '—',  group: 'habit'    },
];

const N360 = [
  { key: 'admin',    port: '3005', group: 'backoffice' },
  { key: 'exames',   port: '3002', group: 'ai'         },
  { key: 'nutricao', port: '3003', group: 'ai'         },
  { key: 'corpo',    port: '3004', group: 'ai'         },
  { key: 'receitas', port: '3006', group: 'ai'         },
  { key: 'suporte',  port: '3005', group: 'ai'         },
  { key: 'portal',   port: '3008', group: 'ai'         },
];

// ---------- helpers ----------
const ICON_MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
const ICON_THEME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;

function topbar({ brandLabel, brandLogo, brandHref, navItems }) {
  const nav = navItems.map(n =>
    `    <a href="${n.href}"${n.active ? ' class="is-active"' : ''}>${n.label}</a>`
  ).join('\n');
  return `<header class="cf-topbar">
  <button class="cf-icon cf-menu-toggle" id="cfMenuToggle" aria-label="Abrir menu">${ICON_MENU}</button>
  <a class="cf-brand" href="${brandHref}">
    <span class="cf-logo">${brandLogo}</span>
    <span>${brandLabel}</span>
  </a>
  <nav class="cf-nav">
${nav}
  </nav>
  <div class="cf-spacer"></div>
  <input id="cfSearch" class="cf-search" type="search" placeholder="Buscar app…" />
  <button class="cf-icon" id="cfThemeToggle" aria-label="Alternar tema">${ICON_THEME}</button>
</header>`;
}

function sidebarHC() {
  const item = (label, href, tag) =>
    `    <a class="cf-nav-item" href="${href}">${label}<span class="cf-tag">${tag}</span></a>`;
  const clinical = HC.filter(a => a.group === 'clinical')
    .map(a => item(a.key, `../${a.key}/`, a.port)).join('\n');
  const habit = HC.filter(a => a.group === 'habit')
    .map(a => item(a.key, `../${a.key}/`, a.port)).join('\n');
  return `<aside class="cf-sidebar">
    <div class="cf-group">Geral</div>
    <a class="cf-nav-item" href="../index.html">Visão geral<span class="cf-tag">hub</span></a>
    <a class="cf-nav-item" href="../API.md">API.md<span class="cf-tag">md</span></a>
    <a class="cf-nav-item" href="../global.html">Spec global<span class="cf-tag">redoc</span></a>

    <div class="cf-group">Análise clínica</div>
${clinical}

    <div class="cf-group">Hábito e planejamento</div>
${habit}
  </aside>`;
}

function sidebarN360() {
  const item = (label, href, tag) =>
    `    <a class="cf-nav-item" href="${href}">${label}<span class="cf-tag">${tag}</span></a>`;
  const back = N360.filter(a => a.group === 'backoffice')
    .map(a => item(a.key, `../${a.key}/`, a.port)).join('\n');
  const ai = N360.filter(a => a.group === 'ai')
    .map(a => item(a.key, `../${a.key}/`, a.port)).join('\n');
  return `<aside class="cf-sidebar">
    <div class="cf-group">Geral</div>
    <a class="cf-nav-item" href="../index.html">Visão geral<span class="cf-tag">hub</span></a>
    <a class="cf-nav-item" href="../API.md">API.md<span class="cf-tag">md</span></a>

    <div class="cf-group">Backoffice</div>
${back}

    <div class="cf-group">Apps de IA</div>
${ai}
  </aside>`;
}

function ribbonAndSwagger() {
  return `    <section class="cf-ribbon">
      <h2 class="cf-ribbon-title" id="ribbonTitle">API</h2>
      <div class="cf-meta" id="ribbonMeta"></div>
    </section>
    <section class="cf-swagger">
      <div id="swagger-ui"></div>
    </section>`;
}

// ---------- transformações genéricas (Swagger pages com spec embutido) ----------

const RIBBON_BOOT_JS = `
    // popula o ribbon com título/servers/versão a partir do spec
    (function () {
      try {
        var info = spec && spec.info ? spec.info : {};
        var t = document.getElementById('ribbonTitle');
        if (t) t.textContent = info.title || 'API';
        var meta = document.getElementById('ribbonMeta');
        if (meta) {
          (spec.servers || []).slice(0, 2).forEach(function (s) {
            var e = document.createElement('span'); e.className = 'cf-mono';
            e.textContent = s.url; meta.appendChild(e);
          });
          var v = document.createElement('span'); v.className = 'cf-mono';
          v.textContent = 'OpenAPI ' + (spec.openapi || '3.0'); meta.appendChild(v);
        }
        if (info.title) document.title = info.title + ' · Docs';
      } catch (e) {}
    })();
`;

function transformSwaggerPage(html, opts) {
  // 0) idempotência: remove blocos cofounder anteriores se existirem
  // (útil quando o script é rodado várias vezes em sequência)
  // remove um RIBBON_BOOT_JS duplicado
  html = html.replace(
    /(\(function\s*\(\)\s*\{\s*try\s*\{[\s\S]*?\}\s*catch\s*\(e\)\s*\{\}\s*\}\)\(\);\s*)\1+/g,
    '$1'
  );
  // remove duplicações do header cofounder se já existir
  if (/<header class="cf-topbar">/.test(html)) {
    // página já foi transformada — nada a fazer no markup
    return html;
  }

  // 1) html tag: garante data-theme
  html = html.replace(
    /<html\s+lang="pt-(?:BR|br)"\s*>/i,
    '<html lang="pt-BR" data-theme="light">'
  );

  // 2) head: adiciona Inter + cofounder.css, mantém swagger-ui.css, remove inline <style>
  // Padrão antigo nos docs/<app>:
  //   <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  //   <style>
  //     body {
  //       margin: 0;
  //       background: #f7f8fa;
  //     }
  //   </style>
  // </head>
  html = html.replace(
    /(<link rel="stylesheet" href="https:\/\/[^"]*swagger-ui\.css"\s*\/?>)\s*<style>[\s\S]*?<\/style>\s*<\/head>/,
    `<link rel="preconnect" href="https://rsms.me/" />
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  $1
  <link rel="stylesheet" href="${opts.cssHref}" />
</head>`
  );

  // 3) body opening — injeta topbar+sidebar+ribbon antes do #swagger-ui
  // Padrão antigo:
  //   <body>
  //     <div id="swagger-ui"></div>
  html = html.replace(
    /<body>\s*<div id="swagger-ui"><\/div>/,
    `<body>

${opts.topbarHtml}

<div class="cf-backdrop"></div>

<div class="cf-layout">
${opts.sidebarHtml}

  <main class="cf-main">
${ribbonAndSwagger()}
  </main>
</div>`
  );

  // 4a) script de init com spec embutido — injeta o RIBBON_BOOT_JS após o JSON.parse
  html = html.replace(
    /(const\s+spec\s*=\s*JSON\.parse\(document\.getElementById\('openapi-spec'\)\.textContent\);)/,
    `$1${RIBBON_BOOT_JS}`
  );

  // 4b) script de init via url (openapi.yaml) — adiciona onComplete que lê window.ui.specSelectors
  if (/url:\s*['"]\.?\/?openapi\.yaml['"]/.test(html) && !/onComplete/.test(html)) {
    html = html.replace(
      /(tryItOutEnabled:\s*[^,\n]+)(,?)(\s*}\);)/,
      `$1$2
      onComplete: function () {
        try {
          var spec = window.ui.specSelectors.specJson().toJS();
          var info = spec.info || {};
          var t = document.getElementById('ribbonTitle');
          if (t) t.textContent = info.title || 'API';
          var meta = document.getElementById('ribbonMeta');
          if (meta) {
            (spec.servers || []).slice(0, 2).forEach(function (s) {
              var e = document.createElement('span'); e.className = 'cf-mono';
              e.textContent = s.url; meta.appendChild(e);
            });
            var v = document.createElement('span'); v.className = 'cf-mono';
            v.textContent = 'OpenAPI ' + (spec.openapi || '3.0'); meta.appendChild(v);
          }
          if (info.title) document.title = info.title + ' \\u00b7 Docs';
        } catch (e) {}
      },$3`
    );
  }

  // 5) injeta cofounder.js antes de </body>
  if (!/cofounder\.js/.test(html)) {
    html = html.replace(
      /<\/body>/,
      `  <script src="${opts.jsHref}"></script>
</body>`
    );
  }

  return html;
}

// ---------- aplicar em docs/<app>/index.html ----------
const HC_TOPBAR = topbar({
  brandLabel: 'HealthCheck Docs',
  brandLogo: '⚕',
  brandHref: '../../index.html',
  navItems: [
    { href: '../../index.html', label: 'Overview' },
    { href: '../index.html', label: 'HealthCheck', active: true },
    { href: '../../nutricao360/index.html', label: 'Nutricao360' },
    { href: '../../docs-csat/docs.html', label: 'CSAT' },
  ],
});
const HC_SIDEBAR = sidebarHC();

for (const app of HC) {
  const p = path.join(ROOT, 'docs', app.key, 'index.html');
  const html = fs.readFileSync(p, 'utf8');
  const out = transformSwaggerPage(html, {
    topbarHtml: HC_TOPBAR,
    sidebarHtml: HC_SIDEBAR,
    cssHref: '../../assets/cofounder.css',
    jsHref: '../../assets/cofounder.js',
  });
  fs.writeFileSync(p, out, 'utf8');
  console.log('OK docs/' + app.key);
}

// ---------- aplicar em nutricao360/<app>/index.html ----------
const N360_TOPBAR = topbar({
  brandLabel: 'Nutricao360 Docs',
  brandLogo: 'N',
  brandHref: '../../index.html',
  navItems: [
    { href: '../../index.html', label: 'Overview' },
    { href: '../../docs/index.html', label: 'HealthCheck' },
    { href: '../index.html', label: 'Nutricao360', active: true },
    { href: '../../docs-csat/docs.html', label: 'CSAT' },
  ],
});
const N360_SIDEBAR = sidebarN360();

for (const app of N360) {
  const p = path.join(ROOT, 'nutricao360', app.key, 'index.html');
  if (!fs.existsSync(p)) {
    console.log('skip nutricao360/' + app.key + ' (missing)');
    continue;
  }
  const html = fs.readFileSync(p, 'utf8');
  // detecta se a página usa swagger-ui (spec embutido OU via url)
  const usesSwaggerUI = /id="swagger-ui"/.test(html);
  if (!usesSwaggerUI) {
    console.log('skip nutricao360/' + app.key + ' (sem #swagger-ui)');
    continue;
  }
  const out = transformSwaggerPage(html, {
    topbarHtml: N360_TOPBAR,
    sidebarHtml: N360_SIDEBAR,
    cssHref: '../../assets/cofounder.css',
    jsHref: '../../assets/cofounder.js',
  });
  fs.writeFileSync(p, out, 'utf8');
  console.log('OK nutricao360/' + app.key);
}

// ---------- aplicar em docs-csat/docs.html ----------
{
  const p = path.join(ROOT, 'docs-csat', 'docs.html');
  let html = fs.readFileSync(p, 'utf8');

  // html tag
  html = html.replace(
    /<html\s+lang="pt-(?:BR|br)"\s*>/i,
    '<html lang="pt-BR" data-theme="light">'
  );

  // head: troca o bloco <style>...</style> + remove .loading inline mas mantém swagger-ui.css
  html = html.replace(
    /(<link rel="stylesheet" href="https:\/\/[^"]*swagger-ui\.css"\s*\/?>)\s*<style>[\s\S]*?<\/style>/,
    `<link rel="preconnect" href="https://rsms.me/" />
    <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    $1
    <link rel="stylesheet" href="../assets/cofounder.css" />`
  );

  // remove o .loading inline (já não vamos usar)
  html = html.replace(/<div id="swagger-ui"><div class="loading">[^<]*<\/div><\/div>/, '<div id="swagger-ui"></div>');

  // topbar+sidebar+ribbon
  const csatTopbar = topbar({
    brandLabel: 'CSAT Docs',
    brandLogo: '◎',
    brandHref: '../index.html',
    navItems: [
      { href: '../index.html', label: 'Overview' },
      { href: '../docs/index.html', label: 'HealthCheck' },
      { href: '../nutricao360/index.html', label: 'Nutricao360' },
      { href: './docs.html', label: 'CSAT', active: true },
    ],
  });
  const csatSidebar = `<aside class="cf-sidebar">
    <div class="cf-group">Geral</div>
    <a class="cf-nav-item" href="../index.html">Visão geral<span class="cf-tag">hub</span></a>

    <div class="cf-group">Pesquisa &amp; satisfação</div>
    <a class="cf-nav-item" href="./docs.html">CSAT Plano Alimentar<span class="cf-tag">REST</span></a>
  </aside>`;

  html = html.replace(
    /<body>\s*<div id="swagger-ui"><\/div>/,
    `<body>

${csatTopbar}

<div class="cf-backdrop"></div>

<div class="cf-layout">
${csatSidebar}

  <main class="cf-main">
${ribbonAndSwagger()}
  </main>
</div>`
  );

  // injeta RIBBON_BOOT_JS após a const spec
  html = html.replace(
    /(const\s+spec\s*=\s*JSON\.parse\(document\.getElementById\('spec'\)\.textContent\);)/,
    `$1${RIBBON_BOOT_JS.replace("'openapi-spec'", "'spec'")}`
  );

  if (!/cofounder\.js/.test(html)) {
    html = html.replace(/<\/body>/, `    <script src="../assets/cofounder.js"></script>\n  </body>`);
  }

  fs.writeFileSync(p, html, 'utf8');
  console.log('OK docs-csat/docs.html');
}

console.log('Done.');
