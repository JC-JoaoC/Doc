// Lê as specs OpenAPI (YAML) dos apps catalogados abaixo + dois arquivos
// markdown de visão geral, e gera um único site self-contained em ./index.html.
//
// Uso: node build-site.js

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { renderSpecContent } = require('./render-spec');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'index.html');

const loadYaml = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const loadText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Catálogo único: cada entrada vira um app no SPA.
// `label` herda de `key` quando omitido.
const catalog = [
  { key: 'cardiocheck',  group: 'clinical',    port: 3002, spec: 'docs/cardiocheck/openapi.yaml',  desc: 'Análise cardiovascular — 10 exames lipídicos/inflamatórios, 5 razões e correlações de risco.' },
  { key: 'glicocheck',   group: 'clinical',    port: 3003, spec: 'docs/glicocheck/openapi.yaml',   desc: 'Análise glicêmica — controle de glicose, resistência à insulina (HOMA-IR/Beta) e marcadores metabólicos.' },
  { key: 'hemocheck',    group: 'clinical',    port: 3009, spec: 'docs/hemocheck/openapi.yaml',    desc: 'Hemograma completo — séries vermelha, branca e plaquetária, com razão NLR e correlações hematológicas.' },
  { key: 'nutricheck',   group: 'clinical',    port: 3004, spec: 'docs/nutricheck/openapi.yaml',   desc: 'Análise nutricional — vitaminas, minerais, índices calculados e correlações nutricionais.' },
  { key: 'osteocheck',   group: 'clinical',    port: 3005, spec: 'docs/osteocheck/openapi.yaml',   desc: 'Saúde óssea — 10 marcadores (cálcio, vitamina D, PTH, CTX, P1NP…), razões e correlações.' },
  { key: 'renalcheck',   group: 'clinical',    port: 3006, spec: 'docs/renalcheck/openapi.yaml',   desc: 'Função renal — 7 exames, razão BUN/creatinina, estadiamento DRC G1–G5.' },
  { key: 'sexcheck',     group: 'clinical',    port: 3007, spec: 'docs/sexcheck/openapi.yaml',     desc: 'Hormônios sexuais — perfis masculino e feminino, fase do ciclo, SOP, hipogonadismo.' },
  { key: 'tireocheck',   group: 'clinical',    port: 3008, spec: 'docs/tireocheck/openapi.yaml',   desc: 'Função tireoidiana — TSH, T4L, T3L, T3R, anti-TPO/TG, razão T3L/T3R e correlações.' },
  { key: 'aquaflow',     group: 'habit',       port: 3001, spec: 'docs/aquaflow/openapi.yaml',     desc: 'Hidratação personalizada — perfil, meta diária calculada e slots ao longo do dia.' },
  { key: 'listaCompras', group: 'habit',       port: null, spec: 'docs/listaCompras/openapi.yaml', desc: 'Plano alimentar via PDF + LLM, lista de compras com conversão automática e meal-prep.' },
  { key: 'n360-admin',    label: 'admin',    group: 'nutricao360', port: 3005, spec: 'nutricao360/admin/openapi.yaml',    desc: 'Painel administrativo central — gestão de admins, usuários, exames, planos, relatórios, suplementos, IA, base de conhecimento, FirePay e webhooks.' },
  { key: 'n360-exames',   label: 'exames',   group: 'nutricao360', port: 3002, spec: 'nutricao360/exames/openapi.yaml',   desc: 'Upload de exames (PDF/OCR Mistral) e análise via IA (OpenRouter) com RAG. SSO por token e integrações Hotmart/Guru.' },
  { key: 'n360-nutricao', label: 'nutricao', group: 'nutricao360', port: 3003, spec: 'nutricao360/nutricao/openapi.yaml', desc: 'Análise nutricional — reconhece refeições por foto (vision) ou texto, calcula calorias/macros e registra histórico em NutritionLog.' },
  { key: 'n360-corpo',    label: 'corpo',    group: 'nutricao360', port: 3004, spec: 'nutricao360/corpo/openapi.yaml',    desc: 'Análise corporal a partir de 3 fotos + medidas antropométricas, com histórico, estatísticas e relatório textual.' },
  { key: 'n360-receitas', label: 'receitas', group: 'nutricao360', port: 3006, spec: 'nutricao360/receitas/openapi.yaml', desc: 'Chat IA de receitas — sessões persistentes com RAG sobre recipe_reference e respostas em JSON.' },
  { key: 'n360-suporte',  label: 'suporte',  group: 'nutricao360', port: 3005, spec: 'nutricao360/suporte/openapi.yaml',  desc: 'Chat IA de suporte — mesma arquitetura do receitas, com RAG sobre support_reference para dúvidas operacionais.' },
  { key: 'n360-portal',   label: 'portal',   group: 'nutricao360', port: 3008, spec: 'nutricao360/portal/openapi.yaml',   desc: 'Portal do cliente — login por e-mail, lista documentos aprovados/pendentes por etapa e status CSAT externo.' },
  { key: 'nps',                 label: 'nps-api', group: 'feedback', port: 3000, spec: 'NPS/nps/openapi.yaml',                desc: 'Pesquisa NPS de alunos — Auth REST (cookie de sessão) + tRPC para submissão pública e dashboard administrativo.' },
  { key: 'acompanhamento-leads', label: 'leads',  group: 'leads',    port: 3001, spec: 'acompanhamento/specs/leads/openapi.yaml', desc: 'Captura de leads do formulário de acompanhamento nutricional, com sincronização assíncrona ao ActiveCampaign.' },
  { key: 'dash-api', label: 'API do Painel', group: 'dashboard', port: 3001, spec: 'dashboard/openapi/api.yaml', desc: 'Reembolsos, Atendimentos, NPS, CSAT, autenticação e proxy de IA (OpenRouter) do painel dashboard.' },
];

const apps = catalog.map((a) => ({ ...a, spec: loadYaml(a.spec) }));

const csatSpec = loadYaml('docs-csat/openapi.yaml');
const apiMd = loadText('docs/API.md');
const nutri360Md = loadText('nutricao360/API.md');
const dashMetricasMd = loadText('dashboard/overviews/metricas.md');

// Pré-renderiza o HTML "estilo overview" para cada spec (sem Swagger UI).
// Embutimos só o HTML — a spec crua não precisa mais ir pro cliente.
const siteData = {
  apps: apps.map(({ key, label, group, port, desc, spec }) => ({
    key,
    label: label || key,
    group,
    port,
    desc,
    title: spec.info?.title || key,
    contentHtml: renderSpecContent(spec),
  })),
  csat: {
    key: 'csat',
    title: csatSpec.info?.title || 'CSAT Plano Alimentar API',
    contentHtml: renderSpecContent(csatSpec),
  },
  overview: apiMd,
  nutri360Overview: nutri360Md,
  dashMetricasOverview: dashMetricasMd,
};

const dataJson = JSON.stringify(siteData)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')

// CSS cofounder embutido (inline) — espelha assets/cofounder.css
const cofounderCss = fs.readFileSync(path.join(ROOT, 'assets', 'cofounder.css'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Documentação</title>
  <link rel="icon" href="data:," />
  <link rel="preconnect" href="https://rsms.me/" />
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  <style>
${cofounderCss}

    /* tweaks específicos do SPA raiz */
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
    /* markdown reaproveita .cf-content */

    /* grupos colapsáveis na sidebar */
    .cf-sidebar .cf-group {
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer; user-select: none;
    }
    .cf-sidebar .cf-group::after {
      content: "";
      width: 7px; height: 7px;
      border-right: 1.5px solid currentColor;
      border-bottom: 1.5px solid currentColor;
      transform: rotate(45deg);
      transition: transform .15s ease;
      opacity: .55;
      margin: 0 4px 2px 8px;
    }
    .cf-sidebar .cf-group:hover::after { opacity: .9; }
    .cf-sidebar .cf-group.is-collapsed::after { transform: rotate(-45deg); }
    .cf-sidebar a.cf-nav-item.is-hidden { display: none !important; }
  </style>
</head>
<body>
  <header class="cf-topbar">
    <button class="cf-icon cf-menu-toggle" id="menuToggle" aria-label="Abrir menu">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <a class="cf-brand" href="#/overview">
      <span class="cf-logo">⚕</span>
      <span>Documentação</span>
    </a>
    <nav class="cf-nav">
      <a href="#/overview">Overview</a>
      <a href="#/n360-overview">Nutricao360</a>
      <a href="#/csat">CSAT</a>
      <a href="#/nps">NPS</a>
      <a href="#/acompanhamento-leads">Acompanhamento</a>
      <a href="#/dash-metricas">dashboard</a>
    </nav>
    <div class="cf-spacer"></div>
    <input id="search" class="cf-search" type="search" placeholder="Buscar app…" />
    <button class="cf-icon" id="themeToggle" aria-label="Alternar tema"></button>
  </header>

  <div class="cf-backdrop" id="backdrop"></div>

  <div class="cf-layout">
    <aside class="cf-sidebar" id="sidebar">
      <div class="cf-group">Geral</div>
      <a class="cf-nav-item" data-route="overview" href="#/overview">Visão geral<span class="cf-tag">md</span></a>

      <div class="cf-group" data-section="clinical">Análise clínica</div>
      <!-- preenchido por JS -->

      <div class="cf-group" data-section="habit">Hábito e planejamento</div>
      <!-- preenchido por JS -->

      <div class="cf-group" data-section="nutricao360">Nutricao360</div>
      <a class="cf-nav-item" data-route="n360-overview" href="#/n360-overview">Visão geral<span class="cf-tag">md</span></a>
      <!-- apps do nutricao360 preenchidos por JS -->

      <div class="cf-group" data-section="other">Pesquisa &amp; satisfação</div>
      <a class="cf-nav-item" data-route="csat" href="#/csat">CSAT Plano Alimentar<span class="cf-tag">REST</span></a>
      <!-- NPS preenchido por JS no grupo feedback -->

      <div class="cf-group" data-section="feedback">NPS</div>
      <!-- preenchido por JS -->

      <div class="cf-group" data-section="leads">Captura de leads</div>
      <!-- preenchido por JS -->

      <div class="cf-group" data-section="dashboard">dashboard · Painel</div>
      <a class="cf-nav-item" data-route="dash-metricas" href="#/dash-metricas">Cálculo das Métricas<span class="cf-tag">md</span></a>
      <!-- apps do dashboard preenchidos por JS -->
    </aside>

    <main class="cf-main">
      <!-- view: overview -->
      <section class="view" id="view-overview">
        <div class="cf-hero">
          <p class="cf-eyebrow">Documentação</p>
          <h1>HealthCheck Apps</h1>
          <p class="lede">
            Documentação consolidada: 10 aplicações HealthCheck (banco MySQL único,
            integração com a plataforma Guru), o monorepo <strong>Nutricao360</strong> com
            7 apps Next.js (admin, exames, nutricao, corpo, receitas, suporte e portal)
            e o CSAT Plano Alimentar com sua API REST dedicada.
          </p>
          <div class="cf-pills">
            <a class="cf-pill" data-route="cardiocheck">cardiocheck</a>
            <a class="cf-pill" data-route="glicocheck">glicocheck</a>
            <a class="cf-pill" data-route="aquaflow">aquaflow</a>
            <a class="cf-pill" data-route="n360-overview">Nutricao360</a>
            <a class="cf-pill" data-route="csat">CSAT</a>
          </div>
        </div>
        <div class="cf-cards-section"><div class="cf-cards" id="cardsClinical"></div></div>
        <div class="cf-cards-section"><div class="cf-cards" id="cardsHabit"></div></div>
        <div class="cf-cards-section"><div class="cf-cards" id="cardsNutri360"></div></div>
        <div class="cf-cards-section"><div class="cf-cards" id="cardsOther"></div></div>
        <div class="cf-cards-section"><div class="cf-cards" id="cardsFeedback"></div></div>
        <div class="cf-cards-section"><div class="cf-cards" id="cardsLeads"></div></div>
        <div class="cf-cards-section"><div class="cf-cards" id="cardsDashboard"></div></div>
        <article class="cf-content" id="overviewMd"></article>
      </section>

      <!-- view: nutricao360 overview -->
      <section class="view" id="view-n360-overview">
        <article class="cf-content" id="n360OverviewMd"></article>
      </section>

      <!-- view: dashboard métricas overview -->
      <section class="view" id="view-dash-metricas">
        <article class="cf-content" id="dashMetricasMd"></article>
      </section>

      <!-- view: spec (reutilizada para cada app) -->
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
    const csat = data.csat;

    // ---------- THEME ----------
    const SVG_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const SVG_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
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

    // ---------- SIDEBAR (mobile drawer) ----------
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('backdrop');
    const MOBILE_MQ = window.matchMedia('(max-width: 900px)');

    function toggleMenu() {
      const opened = sidebar.classList.toggle('is-open');
      backdrop.classList.toggle('is-open', opened);
    }

    document.getElementById('menuToggle').addEventListener('click', toggleMenu);
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
    });

    function navItemHtml(key, label, port) {
      const tagHtml = port
        ? \`<span class="cf-tag">\${port}</span>\`
        : '<span class="cf-tag">api</span>';
      return \`<a class="cf-nav-item" data-route="\${key}" href="#/\${key}">\${label}\${tagHtml}</a>\`;
    }

    function populateSidebar() {
      const clinical = apps.filter(a => a.group === 'clinical');
      const habit = apps.filter(a => a.group === 'habit');
      const nutri360 = apps.filter(a => a.group === 'nutricao360');
      const feedback = apps.filter(a => a.group === 'feedback');
      const leads = apps.filter(a => a.group === 'leads');
      const dashboard = apps.filter(a => a.group === 'dashboard');
      const clinHtml = clinical.map(a => navItemHtml(a.key, a.label, a.port)).join('');
      const habitHtml = habit.map(a => navItemHtml(a.key, a.label, a.port || '—')).join('');
      const n360Html = nutri360.map(a => navItemHtml(a.key, a.label, a.port)).join('');
      const feedbackHtml = feedback.map(a => navItemHtml(a.key, a.label, a.port)).join('');
      const leadsHtml = leads.map(a => navItemHtml(a.key, a.label, a.port)).join('');
      const dashboardHtml = dashboard.map(a => navItemHtml(a.key, a.label, a.port)).join('');
      sidebar.querySelector('[data-section="clinical"]').insertAdjacentHTML('afterend', clinHtml);
      sidebar.querySelector('[data-section="habit"]').insertAdjacentHTML('afterend', habitHtml);
      // o item "Visão geral" do nutricao360 já está hard-coded; inserimos os apps abaixo dele
      const n360OverviewItem = sidebar.querySelector('a.cf-nav-item[data-route="n360-overview"]');
      n360OverviewItem.insertAdjacentHTML('afterend', n360Html);
      sidebar.querySelector('[data-section="feedback"]').insertAdjacentHTML('afterend', feedbackHtml);
      sidebar.querySelector('[data-section="leads"]').insertAdjacentHTML('afterend', leadsHtml);
      // o item "Cálculo das Métricas" do dashboard já está hard-coded; inserimos os apps abaixo dele
      const dashOverviewItem = sidebar.querySelector('a.cf-nav-item[data-route="dash-metricas"]');
      dashOverviewItem.insertAdjacentHTML('afterend', dashboardHtml);
    }

    function cardHtml(a) {
      const port = a.port ? \`<span class="cf-tag">\${a.port}</span>\` : '<span class="cf-tag">—</span>';
      return \`<a class="cf-card" data-route="\${a.key}" href="#/\${a.key}">
        <div class="cf-card-head"><h3>\${a.label}</h3>\${port}</div>
        <p>\${a.desc}</p>
        <span class="cf-card-link">Abrir →</span>
      </a>\`;
    }

    function sectionHeader(title) {
      return '<h2 class="cf-section-title">' + title + '</h2>';
    }

    function populateCards() {
      document.getElementById('cardsClinical').innerHTML =
        sectionHeader('Análise clínica') +
        apps.filter(a => a.group === 'clinical').map(cardHtml).join('');
      document.getElementById('cardsHabit').innerHTML =
        sectionHeader('Hábito e planejamento') +
        apps.filter(a => a.group === 'habit').map(cardHtml).join('');
      document.getElementById('cardsNutri360').innerHTML =
        sectionHeader('Nutricao360 · monorepo de 7 apps') +
        \`<a class="cf-card" data-route="n360-overview" href="#/n360-overview">
          <div class="cf-card-head"><h3>Visão geral</h3><span class="cf-tag">md</span></div>
          <p>Documentação consolidada da API do monorepo Nutricao360 — convenções, autenticação, fluxos de status e webhooks de pagamento.</p>
          <span class="cf-card-link">Abrir →</span>
        </a>\` +
        apps.filter(a => a.group === 'nutricao360').map(cardHtml).join('');
      document.getElementById('cardsOther').innerHTML =
        sectionHeader('Pesquisa &amp; satisfação') +
        \`<a class="cf-card" data-route="csat" href="#/csat">
          <div class="cf-card-head"><h3>CSAT Plano Alimentar</h3><span class="cf-tag">REST</span></div>
          <p>Pesquisa de satisfação de planos alimentares — login JWT, registro público de respostas e enriquecimento via Nutrição 360.</p>
          <span class="cf-card-link">Abrir →</span>
        </a>\`;
      document.getElementById('cardsFeedback').innerHTML =
        sectionHeader('NPS') +
        apps.filter(a => a.group === 'feedback').map(cardHtml).join('');
      document.getElementById('cardsLeads').innerHTML =
        sectionHeader('Captura de leads') +
        apps.filter(a => a.group === 'leads').map(cardHtml).join('');
      document.getElementById('cardsDashboard').innerHTML =
        sectionHeader('dashboard · Painel de Atendimento, Suporte & Nutrição') +
        \`<a class="cf-card" data-route="dash-metricas" href="#/dash-metricas">
          <div class="cf-card-head"><h3>Cálculo das Métricas</h3><span class="cf-tag">md</span></div>
          <p>Referência técnica de como cada indicador do painel é calculado — fonte de dados, fórmula exata e o arquivo onde vive a lógica.</p>
          <span class="cf-card-link">Abrir →</span>
        </a>\` +
        apps.filter(a => a.group === 'dashboard').map(cardHtml).join('');
    }

    // ---------- COLAPSO DE GRUPOS NA SIDEBAR ----------
    // Cada título de grupo esconde/mostra os itens (subtítulos) abaixo dele,
    // até o próximo título de grupo.
    function setGroupCollapsed(group, collapsed) {
      group.classList.toggle('is-collapsed', collapsed);
      let el = group.nextElementSibling;
      while (el && !el.classList.contains('cf-group')) {
        if (el.classList.contains('cf-nav-item')) {
          el.classList.toggle('is-hidden', collapsed);
        }
        el = el.nextElementSibling;
      }
    }

    function setupGroupCollapse() {
      sidebar.querySelectorAll('.cf-group').forEach(group => {
        // começa recolhido por padrão
        setGroupCollapsed(group, true);
        group.addEventListener('click', () => {
          setGroupCollapsed(group, !group.classList.contains('is-collapsed'));
        });
      });
    }

    // ---------- ROUTER ----------
    let currentRoute = null;
    function setRoute(route) {
      currentRoute = route;
      // active nav
      document.querySelectorAll('a.cf-nav-item').forEach(el => {
        el.classList.toggle('is-active', el.dataset.route === route);
      });
      // views
      const isOverview = route === 'overview';
      const isN360Overview = route === 'n360-overview';
      const isDashMetricas = route === 'dash-metricas';
      document.getElementById('view-overview').classList.toggle('is-active', isOverview);
      document.getElementById('view-n360-overview').classList.toggle('is-active', isN360Overview);
      document.getElementById('view-dash-metricas').classList.toggle('is-active', isDashMetricas);
      document.getElementById('view-spec').classList.toggle('is-active', !isOverview && !isN360Overview && !isDashMetricas);
      if (isOverview) {
        document.title = 'HealthCheck Apps · Documentação';
      } else if (isN360Overview) {
        document.title = 'Nutricao360 · Documentação';
      } else if (isDashMetricas) {
        document.title = 'dashboard · Cálculo das Métricas';
      } else {
        renderSpec(route);
      }
      // fecha drawer mobile
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      // url hash
      if (history.replaceState) {
        history.replaceState(null, '', '#/' + route);
      }
      // scroll to top
      window.scrollTo(0, 0);
    }

    function specFor(route) {
      if (route === 'csat') return csat;
      return apps.find(x => x.key === route) || null;
    }

    function renderSpec(route) {
      const info = specFor(route);
      if (!info) { setRoute('overview'); return; }
      document.title = info.title;
      document.getElementById('specContent').innerHTML = info.contentHtml;
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
    setupGroupCollapse();
    populateCards();

    // markdown render
    if (window.marked) {
      marked.setOptions({ gfm: true, breaks: false, headerIds: true });
      document.getElementById('overviewMd').innerHTML = marked.parse(data.overview);
      document.getElementById('n360OverviewMd').innerHTML = marked.parse(data.nutri360Overview);
      document.getElementById('dashMetricasMd').innerHTML = marked.parse(data.dashMetricasOverview);
    } else {
      document.getElementById('overviewMd').textContent = data.overview;
      document.getElementById('n360OverviewMd').textContent = data.nutri360Overview;
      document.getElementById('dashMetricasMd').textContent = data.dashMetricasOverview;
    }

    // delegated click for any [data-route]
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-route]');
      if (!el) return;
      e.preventDefault();
      setRoute(el.dataset.route);
    });

    // initial route from hash
    const initial = (location.hash || '').replace(/^#\\/?/, '') || 'overview';
    setRoute(initial);
    window.addEventListener('hashchange', () => {
      const r = (location.hash || '').replace(/^#\\/?/, '') || 'overview';
      if (r !== currentRoute) setRoute(r);
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
const kb = (html.length / 1024).toFixed(1);
console.log(`OK: index.html escrito (${kb} KB, ${apps.length + 1} specs embutidas)`);
