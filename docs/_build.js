const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { execSync } = require('child_process');
function loadYaml(filePath) {
  const cmd = `npx --no js-yaml "${filePath}"`;
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out);
}

const docsDir = __dirname;
const apps = fs.readdirSync(docsDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(name => fs.existsSync(path.join(docsDir, name, 'openapi.yaml')))
  .sort();

const titles = {
  aquaflow: 'aquaflow API',
  cardiocheck: 'cardiocheck API',
  glicocheck: 'glicocheck API',
  hemocheck: 'hemocheck API',
  listaCompras: 'listaCompras API',
  nutricheck: 'nutricheck API',
  osteocheck: 'osteocheck API',
  renalcheck: 'renalcheck API',
  sexcheck: 'sexcheck API',
  tireocheck: 'tireocheck API',
};

for (const app of apps) {
  const yamlPath = path.join(docsDir, app, 'openapi.yaml');
  const spec = loadYaml(yamlPath);
  const specJson = JSON.stringify(spec).replace(/</g, '\\u003c');
  const title = titles[app] || `${app} API`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Documentação</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #f7f8fa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script id="openapi-spec" type="application/json">${specJson}</script>
  <script>
    const spec = JSON.parse(document.getElementById('openapi-spec').textContent);
    window.ui = SwaggerUIBundle({
      spec: spec,
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      tryItOutEnabled: false,
    });
  </script>
</body>
</html>
`;

  const outPath = path.join(docsDir, app, 'index.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`wrote ${path.relative(path.join(docsDir, '..'), outPath)} (${(html.length / 1024).toFixed(1)} KB)`);
}
