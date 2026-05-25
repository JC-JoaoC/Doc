// Renderiza uma spec OpenAPI como HTML estático no estilo "overview"
// (sem Swagger UI). Usa as classes do cofounder.css.

const METHOD_COLORS = {
  get:     '#2050ff',
  post:    '#0a8a3a',
  put:     '#bb7700',
  patch:   '#1a8aa6',
  delete:  '#c43a3a',
  options: '#7c7c7c',
  head:    '#7c7c7c',
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// markdown leve: parágrafos, **bold**, `code`, listas, links autodetectados
function mdLite(text) {
  if (!text) return '';
  const blocks = String(text).trim().split(/\n{2,}/).map(block => {
    const isList = /^\s*[-*]\s/.test(block);
    if (isList) {
      const items = block.split(/\n/).map(line => {
        const m = line.match(/^\s*[-*]\s+(.*)$/);
        return m ? `<li>${inline(m[1])}</li>` : '';
      }).join('');
      return `<ul>${items}</ul>`;
    }
    const oneLine = block.replace(/\s*\n\s*/g, ' ').trim();
    return `<p>${inline(oneLine)}</p>`;
  });
  return blocks.join('\n');
}

function inline(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\bhttps?:\/\/[^\s<>"]+/g, url => {
      const clean = url.replace(/[).,;:]+$/, '');
      const trail = url.slice(clean.length);
      return `<a href="${clean}" target="_blank" rel="noopener">${clean}</a>${trail}`;
    });
}

function splitLede(text) {
  if (!text) return { lede: '', rest: '' };
  const blocks = String(text).trim().split(/\n{2,}/);
  const lede = blocks[0] || '';
  const rest = blocks.slice(1).join('\n\n');
  return { lede: lede.replace(/\s*\n\s*/g, ' ').trim(), rest };
}

// ----------------------- $ref resolver -----------------------
function getRefName($ref) {
  return $ref ? $ref.split('/').pop() : null;
}

function resolveRef(spec, $ref) {
  if (!$ref || !$ref.startsWith('#/')) return null;
  const parts = $ref.slice(2).split('/');
  let cur = spec;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return null;
  }
  return cur;
}

// ----------------------- representação inline de schema -----------------------
function renderSchemaInline(schema) {
  if (!schema) return '<em>n/a</em>';
  if (schema.$ref) {
    const name = getRefName(schema.$ref);
    return `<a href="#schema-${escapeHtml(name)}"><code>${escapeHtml(name)}</code></a>`;
  }
  if (schema.allOf) return schema.allOf.map(renderSchemaInline).join(' &amp; ');
  if (schema.oneOf) return schema.oneOf.map(renderSchemaInline).join(' | ');
  if (schema.anyOf) return schema.anyOf.map(renderSchemaInline).join(' | ');
  if (schema.type === 'array' && schema.items) {
    return `<code>array&lt;</code>${renderSchemaInline(schema.items)}<code>&gt;</code>`;
  }
  if (schema.enum) {
    return `<code>enum</code>(${schema.enum.slice(0, 6).map(e => `<code>${escapeHtml(JSON.stringify(e))}</code>`).join(', ')}${schema.enum.length > 6 ? ', …' : ''})`;
  }
  if (schema.type) {
    const fmt = schema.format ? ` (${escapeHtml(schema.format)})` : '';
    const nul = schema.nullable ? ' • nullable' : '';
    return `<code>${escapeHtml(schema.type)}${fmt}</code>${nul}`;
  }
  if (schema.const !== undefined) {
    return `<code>const</code> <code>${escapeHtml(JSON.stringify(schema.const))}</code>`;
  }
  return '<em>—</em>';
}

// ----------------------- hero / servers -----------------------
function pillsFromServers(servers) {
  const list = (servers || [])
    .filter(s => !/localhost|127\.0\.0\.1/i.test(s.url || ''));
  if (!list.length) return '';
  return `
    <h4 class="cf-servers-title">Servers</h4>
    <div class="cf-pills">${list
      .map(s => `<span class="cf-pill"><code>${escapeHtml(s.url)}</code></span>`)
      .join('')}</div>`;
}

function renderHero(spec) {
  const info = spec.info || {};
  const { lede, rest } = splitLede(info.description);
  return `
    <p class="cf-eyebrow">API</p>
    <h1>${escapeHtml(info.title || 'API')}</h1>
    ${lede ? `<p class="cf-lede">${inline(lede)}</p>` : ''}
    ${rest ? `<div class="cf-info-desc">${mdLite(rest)}</div>` : ''}
    ${pillsFromServers(spec.servers)}
  `;
}

// ----------------------- parameters / request body / responses -----------------------
function renderParameters(parameters, spec) {
  if (!parameters || !parameters.length) return '';
  const rows = parameters.map(rawP => {
    const p = rawP.$ref ? (resolveRef(spec, rawP.$ref) || rawP) : rawP;
    return `
      <tr>
        <td><code>${escapeHtml(p.name)}</code></td>
        <td>${escapeHtml(p.in || '')}</td>
        <td>${renderSchemaInline(p.schema)}</td>
        <td>${p.required ? '<span class="cf-required">obrig.</span>' : '<span class="cf-optional">opcional</span>'}</td>
        <td>${mdLite(p.description || '')}</td>
      </tr>`;
  }).join('');
  return `
    <h4>Parâmetros</h4>
    <table class="cf-spec-table">
      <thead><tr><th>Nome</th><th>Em</th><th>Tipo</th><th></th><th>Descrição</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ----------------------- exemplos gerados a partir do schema -----------------------
function defaultExampleForType(type, format) {
  switch (type) {
    case 'string':
      if (format === 'email') return 'user@example.com';
      if (format === 'uri' || format === 'url') return 'https://example.com';
      if (format === 'date-time') return '2025-01-01T00:00:00Z';
      if (format === 'date') return '2025-01-01';
      if (format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (format === 'binary') return '<binary>';
      return 'string';
    case 'integer': return 0;
    case 'number':  return 0;
    case 'boolean': return true;
    case 'null':    return null;
    default: return null;
  }
}

function generateExample(schema, spec, seen) {
  seen = seen || new Set();
  if (!schema || typeof schema !== 'object') return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum && schema.enum.length) return schema.enum[0];
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return null;
    const next = new Set(seen); next.add(schema.$ref);
    const target = resolveRef(spec, schema.$ref);
    return target ? generateExample(target, spec, next) : null;
  }
  if (schema.allOf) {
    const merged = {};
    for (const part of schema.allOf) {
      const ex = generateExample(part, spec, seen);
      if (ex && typeof ex === 'object' && !Array.isArray(ex)) Object.assign(merged, ex);
    }
    return Object.keys(merged).length ? merged : null;
  }
  if (schema.oneOf) return generateExample(schema.oneOf[0], spec, seen);
  if (schema.anyOf) return generateExample(schema.anyOf[0], spec, seen);
  if (schema.type === 'array' || schema.items) {
    return [generateExample(schema.items || {}, spec, seen)];
  }
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const obj = {};
    if (schema.properties) {
      for (const [k, v] of Object.entries(schema.properties)) obj[k] = generateExample(v, spec, seen);
    }
    if (!Object.keys(obj).length && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      obj['<chave>'] = generateExample(schema.additionalProperties, spec, seen);
    }
    return obj;
  }
  return defaultExampleForType(schema.type, schema.format);
}

function safeJson(value) {
  try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); }
}

// ----------------------- tabs Example/Schema por content-type -----------------------
function renderBodyTabs(content, spec) {
  const types = Object.keys(content || {});
  if (!types.length) return '';
  return types.map(t => {
    const sch = (content[t] && content[t].schema) || {};
    const ex = (content[t] && content[t].example !== undefined)
      ? content[t].example
      : generateExample(sch, spec);
    const exJson = safeJson(ex);
    const props = renderSchemaProps(sch, spec) || '<p class="cf-meta-line">Sem propriedades.</p>';
    return `
      <div class="cf-body-type">
        <p class="cf-meta-line"><code>${escapeHtml(t)}</code> → ${renderSchemaInline(sch)}</p>
        <div class="cf-tabs" data-tabs>
          <div class="cf-tabs-bar">
            <button type="button" class="cf-tab is-active" data-tab-name="example">Example Value</button>
            <button type="button" class="cf-tab" data-tab-name="schema">Schema</button>
          </div>
          <div class="cf-tab-panel is-active" data-panel-name="example">
            <pre class="cf-code"><code>${escapeHtml(exJson)}</code></pre>
          </div>
          <div class="cf-tab-panel" data-panel-name="schema">
            ${props}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderRequestBody(rb, spec) {
  if (!rb) return '';
  const rbFull = rb.$ref ? (resolveRef(spec, rb.$ref) || rb) : rb;
  const content = rbFull.content || {};
  const required = rbFull.required ? '<span class="cf-required">obrig.</span>' : '';
  return `
    <h4>Request body ${required}</h4>
    ${rbFull.description ? mdLite(rbFull.description) : ''}
    ${renderBodyTabs(content, spec)}`;
}

function renderResponses(responses, spec) {
  if (!responses) return '';
  const items = Object.entries(responses).map(([code, rawResp]) => {
    const klass = `cf-status-${String(code).charAt(0)}xx`;
    const resp = rawResp.$ref ? (resolveRef(spec, rawResp.$ref) || rawResp) : rawResp;
    const content = resp.content || {};
    return `
      <div class="cf-response">
        <div class="cf-response-head">
          <code class="${klass}">${escapeHtml(code)}</code>
          <span class="cf-response-desc">${mdLite(resp.description || rawResp.description || '')}</span>
        </div>
        ${Object.keys(content).length ? renderBodyTabs(content, spec) : ''}
      </div>`;
  }).join('');
  return `
    <h4>Respostas</h4>
    <div class="cf-responses">${items}</div>`;
}

function renderSecurity(op) {
  const sec = op.security;
  if (!sec || !sec.length) return '';
  const items = sec.map(s => {
    const names = Object.keys(s);
    if (!names.length) return '<em>público</em>';
    return names.map(n => `<a href="#sec-${escapeHtml(n)}"><code>${escapeHtml(n)}</code></a>`).join(' + ');
  }).join(' &nbsp;<em>ou</em>&nbsp; ');
  return `<p class="cf-endpoint-security">🔒 <strong>Auth:</strong> ${items}</p>`;
}

function renderEndpoint(method, path, op, spec) {
  const color = METHOD_COLORS[method] || '#7c7c7c';
  const anchor = (method + path).replace(/[^a-zA-Z0-9]/g, '-');
  return `
    <article class="cf-endpoint is-collapsed" id="op-${anchor}">
      <header class="cf-endpoint-head" data-collapse-toggle>
        <span class="cf-method" style="background:${color}">${method.toUpperCase()}</span>
        <code class="cf-path">${escapeHtml(path)}</code>
        ${op.summary ? `<span class="cf-endpoint-summary-inline">${escapeHtml(op.summary)}</span>` : ''}
        ${op.deprecated ? '<span class="cf-deprecated">deprecated</span>' : ''}
        <span class="cf-collapse-arrow" aria-hidden="true">▾</span>
      </header>
      <div class="cf-endpoint-body">
        ${op.description ? `<div class="cf-endpoint-desc">${mdLite(op.description)}</div>` : ''}
        ${renderSecurity(op)}
        ${renderParameters(op.parameters, spec)}
        ${renderRequestBody(op.requestBody, spec)}
        ${renderResponses(op.responses, spec)}
      </div>
    </article>`;
}

// ----------------------- agrupamento por tag -----------------------
function groupEndpointsByTag(spec) {
  const tags = spec.tags || [];
  const tagMap = new Map();
  for (const t of tags) tagMap.set(t.name, { name: t.name, description: t.description, ops: [] });

  for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
      const op = pathItem[method];
      if (!op) continue;
      const opTags = op.tags && op.tags.length ? op.tags : ['default'];
      for (const tag of opTags) {
        if (!tagMap.has(tag)) tagMap.set(tag, { name: tag, ops: [] });
        tagMap.get(tag).ops.push({ method, path: pathKey, op });
      }
    }
  }
  return [...tagMap.values()].filter(t => t.ops.length);
}

function renderEndpointsSection(spec) {
  const groups = groupEndpointsByTag(spec);
  if (!groups.length) return '';
  return groups.map(g => `
    <section class="cf-spec-section" id="tag-${encodeURIComponent(g.name)}">
      <h2>${escapeHtml(g.name)}</h2>
      ${g.description ? mdLite(g.description) : ''}
      ${g.ops.map(e => renderEndpoint(e.method, e.path, e.op, spec)).join('')}
    </section>`).join('');
}

// ----------------------- schemas (components/schemas) -----------------------
function renderSchemaProps(schema, spec) {
  // resolve $ref no topo
  if (schema.$ref) {
    const target = resolveRef(spec, schema.$ref);
    if (target) schema = target;
  }
  // allOf merge superficial
  if (schema.allOf) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const part of schema.allOf) {
      const p = part.$ref ? (resolveRef(spec, part.$ref) || part) : part;
      if (p.properties) Object.assign(merged.properties, p.properties);
      if (p.required) merged.required.push(...p.required);
    }
    schema = merged;
  }
  if (!schema.properties && schema.type === 'array' && schema.items) {
    return `<p class="cf-meta-line">array de ${renderSchemaInline(schema.items)}</p>`;
  }
  if (!schema.properties) return '';
  const required = new Set(schema.required || []);
  const rows = Object.entries(schema.properties).map(([propName, rawProp]) => {
    const prop = rawProp.$ref ? (resolveRef(spec, rawProp.$ref) || rawProp) : rawProp;
    return `
      <tr>
        <td><code>${escapeHtml(propName)}</code></td>
        <td>${renderSchemaInline(rawProp)}</td>
        <td>${required.has(propName) ? '<span class="cf-required">obrig.</span>' : '<span class="cf-optional">opcional</span>'}</td>
        <td>${mdLite(prop.description || '')}${prop.example !== undefined ? `<div class="cf-meta-line">ex.: <code>${escapeHtml(JSON.stringify(prop.example))}</code></div>` : ''}</td>
      </tr>`;
  }).join('');
  return `
    <table class="cf-spec-table">
      <thead><tr><th>Propriedade</th><th>Tipo</th><th></th><th>Descrição</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSchemaCard(name, schema, spec) {
  const typeLabel = schema.type || (schema.allOf ? 'object' : (schema.$ref ? 'alias' : ''));
  const example = safeJson(generateExample(schema, spec));
  const props = renderSchemaProps(schema, spec) || '<p class="cf-meta-line">Sem propriedades documentadas.</p>';
  return `
    <article class="cf-schema is-collapsed" id="schema-${escapeHtml(name)}">
      <header class="cf-endpoint-head" data-collapse-toggle>
        <span class="cf-method" style="background:#7c7c7c">${escapeHtml((typeLabel || '').toUpperCase())}</span>
        <code class="cf-path">${escapeHtml(name)}</code>
        ${schema.description ? `<span class="cf-endpoint-summary-inline">${escapeHtml(firstLine(schema.description))}</span>` : ''}
        <span class="cf-collapse-arrow" aria-hidden="true">▾</span>
      </header>
      <div class="cf-endpoint-body">
        ${schema.description ? `<div class="cf-endpoint-desc">${mdLite(schema.description)}</div>` : ''}
        <div class="cf-tabs" data-tabs>
          <div class="cf-tabs-bar">
            <button type="button" class="cf-tab is-active" data-tab-name="example">Example Value</button>
            <button type="button" class="cf-tab" data-tab-name="schema">Schema</button>
          </div>
          <div class="cf-tab-panel is-active" data-panel-name="example">
            <pre class="cf-code"><code>${escapeHtml(example)}</code></pre>
          </div>
          <div class="cf-tab-panel" data-panel-name="schema">
            ${props}
          </div>
        </div>
      </div>
    </article>`;
}

function firstLine(text) {
  if (!text) return '';
  return String(text).split(/\n/)[0].trim().slice(0, 120);
}

function renderSchemasSection(spec) {
  const schemas = (spec.components && spec.components.schemas) || {};
  const names = Object.keys(schemas);
  if (!names.length) return '';
  return `
    <section class="cf-spec-section" id="schemas">
      <h2>Schemas</h2>
      ${names.map(n => renderSchemaCard(n, schemas[n], spec)).join('')}
    </section>`;
}

// ----------------------- security schemes -----------------------
function renderSecuritySchemesSection(spec) {
  const schemes = (spec.components && spec.components.securitySchemes) || {};
  const names = Object.keys(schemes);
  if (!names.length) return '';
  const rows = names.map(n => {
    const s = schemes[n];
    const detail = [
      s.type && `tipo: <code>${escapeHtml(s.type)}</code>`,
      s.scheme && `scheme: <code>${escapeHtml(s.scheme)}</code>`,
      s.bearerFormat && `formato: <code>${escapeHtml(s.bearerFormat)}</code>`,
      s.in && `em: <code>${escapeHtml(s.in)}</code>`,
      s.name && `param: <code>${escapeHtml(s.name)}</code>`,
    ].filter(Boolean).join(' • ');
    return `
      <article class="cf-schema" id="sec-${escapeHtml(n)}">
        <header class="cf-endpoint-head">
          <span class="cf-method" style="background:#7c7c7c">AUTH</span>
          <code class="cf-path">${escapeHtml(n)}</code>
        </header>
        ${s.description ? `<div class="cf-endpoint-desc">${mdLite(s.description)}</div>` : ''}
        <p class="cf-meta-line">${detail}</p>
      </article>`;
  }).join('');
  return `
    <section class="cf-spec-section" id="security">
      <h2>Autenticação</h2>
      ${rows}
    </section>`;
}

// ----------------------- entry -----------------------
function renderSpecContent(spec) {
  return `
    ${renderHero(spec)}
    ${renderSecuritySchemesSection(spec)}
    ${renderEndpointsSection(spec)}
    ${renderSchemasSection(spec)}
  `;
}

function specTagAnchors(spec) {
  const groups = groupEndpointsByTag(spec);
  const items = groups.map(g => ({
    label: g.name,
    href: `#tag-${encodeURIComponent(g.name)}`,
    count: g.ops.length,
  }));
  const schemas = (spec.components && spec.components.schemas) || {};
  if (Object.keys(schemas).length) {
    items.push({ label: 'Schemas', href: '#schemas', count: Object.keys(schemas).length });
  }
  const sec = (spec.components && spec.components.securitySchemes) || {};
  if (Object.keys(sec).length) {
    items.push({ label: 'Autenticação', href: '#security', count: Object.keys(sec).length });
  }
  return items;
}

module.exports = { renderSpecContent, specTagAnchors };
