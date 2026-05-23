// Limpeza one-shot: remove duplicação do bloco IIFE do ribbon causada por
// rodar apply-cofounder.js mais de uma vez antes da idempotência ser adicionada.
//
// Uso: node dedup-cofounder.js

const fs = require('fs');
const path = require('path');

const FILES = [
  'docs/cardiocheck/index.html',
  'docs/glicocheck/index.html',
  'docs/hemocheck/index.html',
  'docs/nutricheck/index.html',
  'docs/osteocheck/index.html',
  'docs/renalcheck/index.html',
  'docs/sexcheck/index.html',
  'docs/tireocheck/index.html',
  'docs/aquaflow/index.html',
  'docs/listaCompras/index.html',
  'docs-csat/docs.html',
];

const BLOCK_MARKER = "// popula o ribbon com título/servers/versão a partir do spec";

for (const rel of FILES) {
  const p = path.join(__dirname, rel);
  if (!fs.existsSync(p)) continue;
  let html = fs.readFileSync(p, 'utf8');
  const parts = html.split(BLOCK_MARKER);
  if (parts.length <= 2) {
    console.log('clean ' + rel);
    continue;
  }
  // mantém apenas a primeira ocorrência completa do bloco
  // estrutura: [antes, IIFE1+conteúdoEntre, IIFE2+conteúdoEntre, ...]
  // queremos: [antes, IIFE1+conteúdoEntre, sufixoAposUltimo]
  // pegamos a primeira occurrence completa + tudo após a última ocorrência
  // Estratégia simples: junta antes + marker + parts[1] (que vai até a próxima ocorrência)
  // e descarta as outras ocorrências, mas mantém o que vem DEPOIS da última.
  // No nosso caso, o conteúdo entre duas ocorrências é exatamente o mesmo IIFE,
  // então mantemos o primeiro e descartamos os duplicados — qualquer "lixo" entre
  // o último IIFE e o `window.ui = ...` vai ficar no último split-part.
  const last = parts[parts.length - 1];
  // o "last" começa logo após o último marker; queremos pular o IIFE redundante
  // e pegar só o que vem DEPOIS dele. Pulamos pelo bloco IIFE conhecido.
  const iifeEnd = last.indexOf('})();');
  const tail = iifeEnd >= 0 ? last.slice(iifeEnd + '})();'.length) : last;

  html = parts[0] + BLOCK_MARKER + parts[1] + tail;
  fs.writeFileSync(p, html, 'utf8');
  console.log('dedup ' + rel + ' (' + (parts.length - 1) + ' ocorrências → 1)');
}
console.log('Done.');
