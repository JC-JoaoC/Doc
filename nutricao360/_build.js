// Gera nutricao360/<app>/index.html a partir de nutricao360/<app>/openapi.yaml
// no estilo "overview" (sem Swagger UI), usando o renderer compartilhado.
//
// Uso: node nutricao360/_build.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { renderSpecContent, specTagAnchors } = require('../render-spec');

function loadYaml(filePath) {
  const cmd = `npx --no js-yaml "${filePath}"`;
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out);
}

const baseDir = __dirname;

const N360 = [
  { key: 'admin',    port: '3005', group: 'backoffice' },
  { key: 'exames',   port: '3002', group: 'ai'         },
  { key: 'nutricao', port: '3003', group: 'ai'         },
  { key: 'corpo',    port: '3004', group: 'ai'         },
  { key: 'receitas', port: '3006', group: 'ai'         },
  { key: 'suporte',  port: '3005', group: 'ai'         },
  { key: 'portal',   port: '3008', group: 'ai'         },
];

const ICON_MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;

function topbarHtml() {
  return `<header class="cf-topbar">
  <button class="cf-icon cf-menu-toggle" id="cfMenuToggle" aria-label="Abrir menu">${ICON_MENU}</button>
  <a class="cf-brand" href="../../index.html">
    <span class="cf-logo">N</span>
    <span>Nutricao360 Docs</span>
  </a>
  <nav class="cf-nav">
    <a href="../../index.html">Overview</a>
    <a href="../../docs/index.html">HealthCheck</a>
    <a href="../index.html" class="is-active">Nutricao360</a>
    <a href="../../docs-csat/docs.html">CSAT</a>
  </nav>
  <div class="cf-spacer"></div>
  <input id="cfSearch" class="cf-search" type="search" placeholder="Buscar…" />
  <button class="cf-icon" id="cfThemeToggle" aria-label="Alternar tema"></button>
</header>`;
}

function sidebarHtml(spec) {
  const item = (label, href, tag) =>
    `    <a class="cf-nav-item" href="${href}">${label}<span class="cf-tag">${tag}</span></a>`;
  const back = N360.filter(a => a.group === 'backoffice')
    .map(a => item(a.key, `../${a.key}/`, a.port)).join('\n');
  const ai = N360.filter(a => a.group === 'ai')
    .map(a => item(a.key, `../${a.key}/`, a.port)).join('\n');

  const anchors = specTagAnchors(spec)
    .map(a => `    <a class="cf-nav-item" href="${a.href}">${a.label}<span class="cf-tag">${a.count}</span></a>`)
    .join('\n');

  return `<aside class="cf-sidebar">
    <div class="cf-group">Esta API</div>
${anchors || '    <a class="cf-nav-item" href="#">—<span class="cf-tag">0</span></a>'}

    <div class="cf-group">Backoffice</div>
${back}

    <div class="cf-group">Apps de IA</div>
${ai}

    <div class="cf-group">Geral</div>
    <a class="cf-nav-item" href="../index.html">Visão geral<span class="cf-tag">hub</span></a>
    <a class="cf-nav-item" href="../API.md">API.md<span class="cf-tag">md</span></a>
  </aside>`;
}

for (const app of N360) {
  const yamlPath = path.join(baseDir, app.key, 'openapi.yaml');
  if (!fs.existsSync(yamlPath)) {
    console.log(`skip nutricao360/${app.key} (sem openapi.yaml)`);
    continue;
  }
  const spec = loadYaml(yamlPath);
  const title = (spec.info && spec.info.title) || `${app.key} API`;
  const contentHtml = renderSpecContent(spec);

  const html = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Documentação</title>
  <link rel="icon" href="data:," />
  <link rel="preconnect" href="https://rsms.me/" />
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  <link rel="stylesheet" href="../../assets/cofounder.css" />
</head>
<body>

${topbarHtml()}

<div class="cf-backdrop"></div>

<div class="cf-layout">
${sidebarHtml(spec)}

  <main class="cf-main">
    <article class="cf-content">
${contentHtml}
    </article>
  </main>
</div>

  <script src="../../assets/cofounder.js"></script>
</body>
</html>
`;

  const outPath = path.join(baseDir, app.key, 'index.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`wrote nutricao360/${app.key}/index.html (${(html.length / 1024).toFixed(1)} KB)`);
}
