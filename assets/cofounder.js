/* ============================================================
   cofounder.js — comportamentos compartilhados
   - tema light/dark com persistência
   - drawer mobile da sidebar
   - marcação do link ativo via [href]
   - busca simples na sidebar (input #cfSearch filtra .cf-nav-item)
   ============================================================ */
(function () {
  'use strict';

  // ---------- tema ----------
  var root = document.documentElement;
  var stored = (function () {
    try { return localStorage.getItem('cf-theme'); } catch (e) { return null; }
  })();
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  } else if (!root.hasAttribute('data-theme')) {
    root.setAttribute('data-theme', 'light');
  }

  var SVG_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var SVG_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

  function updateThemeIcons() {
    var theme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var svg = theme === 'dark' ? SVG_MOON : SVG_SUN;
    var label = theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
    document.querySelectorAll('#cfThemeToggle, #themeToggle').forEach(function (btn) {
      btn.innerHTML = svg;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
  }

  function toggleTheme() {
    var cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('cf-theme', next); } catch (e) {}
    updateThemeIcons();
  }

  // ---------- drawer mobile ----------
  function openDrawer() {
    var sidebar = document.querySelector('.cf-sidebar');
    var backdrop = document.querySelector('.cf-backdrop');
    if (!sidebar) return;
    sidebar.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-open');
  }
  function closeDrawer() {
    var sidebar = document.querySelector('.cf-sidebar');
    var backdrop = document.querySelector('.cf-backdrop');
    if (!sidebar) return;
    sidebar.classList.remove('is-open');
    if (backdrop) backdrop.classList.remove('is-open');
  }
  function toggleDrawer() {
    var sidebar = document.querySelector('.cf-sidebar');
    if (!sidebar) return;
    if (sidebar.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  }

  // ---------- active link ----------
  function markActive() {
    var here = window.location.pathname.replace(/\/+$/, '') || '/';
    var hereFile = here.split('/').pop();
    document.querySelectorAll('.cf-sidebar a.cf-nav-item, .cf-topbar .cf-nav a').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      // ignora externos e âncoras puras
      if (/^https?:/i.test(href) || href.startsWith('#')) return;
      var clean = href.replace(/[?#].*$/, '').replace(/\/+$/, '');
      var file = clean.split('/').pop();
      if (clean && (clean === here || (file && file === hereFile && file !== ''))) {
        a.classList.add('is-active');
      }
    });
  }

  // ---------- busca na sidebar ----------
  function wireSearch() {
    var input = document.getElementById('cfSearch');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      document.querySelectorAll('.cf-sidebar .cf-nav-item').forEach(function (el) {
        var t = el.textContent.toLowerCase();
        el.style.display = !q || t.indexOf(q) !== -1 ? '' : 'none';
      });
    });
  }

  // ---------- tabs Example/Schema ----------
  function wireTabs(root) {
    (root || document).addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('.cf-tab[data-tab-name]');
      if (!tab) return;
      e.preventDefault();
      var container = tab.closest('[data-tabs]');
      if (!container) return;
      var name = tab.getAttribute('data-tab-name');
      container.querySelectorAll('.cf-tab').forEach(function (t) {
        t.classList.toggle('is-active', t.getAttribute('data-tab-name') === name);
      });
      container.querySelectorAll('.cf-tab-panel').forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-panel-name') === name);
      });
    });
  }

  // ---------- collapse de endpoints e schemas ----------
  function wireCollapse(root) {
    (root || document).addEventListener('click', function (e) {
      // ignora clicks dentro de links/botões (mas não na seta de collapse)
      if (e.target.closest('a')) return;
      if (e.target.closest('button') && !e.target.closest('[data-collapse-toggle]')) return;
      var head = e.target.closest('[data-collapse-toggle]');
      if (!head) return;
      var card = head.parentNode;
      if (card) card.classList.toggle('is-collapsed');
    });
  }

  // ---------- bind ----------
  function init() {
    document.querySelectorAll('#cfThemeToggle, #themeToggle').forEach(function (btn) {
      btn.addEventListener('click', toggleTheme);
    });

    var menuBtn = document.getElementById('cfMenuToggle');
    if (menuBtn) menuBtn.addEventListener('click', toggleDrawer);

    var backdrop = document.querySelector('.cf-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    wireTabs(document);
    wireCollapse(document);

    markActive();
    wireSearch();
    updateThemeIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.cofounder = {
    toggleTheme: toggleTheme,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
  };
})();
