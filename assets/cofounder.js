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

  function toggleTheme() {
    var cur = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('cf-theme', next); } catch (e) {}
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

  // ---------- bind ----------
  function init() {
    var toggleBtn = document.getElementById('cfThemeToggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleTheme);

    var menuBtn = document.getElementById('cfMenuToggle');
    if (menuBtn) menuBtn.addEventListener('click', toggleDrawer);

    var backdrop = document.querySelector('.cf-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    markActive();
    wireSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // expõe utilitários globais (úteis em páginas que recarregam swagger ao trocar tema)
  window.cofounder = {
    toggleTheme: toggleTheme,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
  };
})();
