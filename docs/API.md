# HealthCheck Apps — Documentação geral

Visão geral da arquitetura, fluxo de autenticação, integrações e catálogo completo das
procedures tRPC do monorepo `healthcheck-apps`.


## 1. O que é

Suite de 9 aplicações web independentes, todas compartilhando:

- O mesmo **banco MySQL** (com tabelas próprias por app + tabelas compartilhadas de auth/Guru).
- O mesmo **fluxo de autenticação** (OAuth + login por e-mail com verificação de assinatura
  na plataforma Guru).
- A mesma **stack**: TypeScript + Express + tRPC v10 + Drizzle ORM no servidor; React +
  Vite no client.
- O mesmo padrão de **deploy** (Docker + EasyPanel, um service por app + um MySQL).

Cada app é publicado em seu próprio subdomínio e roda em uma porta dedicada em
desenvolvimento.

| App           | Porta dev | Domínio                                    |
|---------------|-----------|--------------------------------------------|
| aquaflow      | 3001      | https://aqua.nutricao360.com/ |
| cardiocheck   | 3002      | https://cardiocheck.nutricao360.com/                  |
| glicocheck    | 3003      | https://glicocheck.nutricao360.com/ |
| nutricheck    | 3004      | https://nutricheck.nutricao360.com/ |
| osteocheck    | 3005      | https://osteocheck.nutricao360.com/ |
| renalcheck    | 3006      | https://renalcheck.nutricao360.com/   |
| sexcheck      | 3007      | https://sexcheck.nutricao360.com/ |
| tireocheck    | 3008      | https://tireocheck.nutricao360.com/                          |
| hemocheck     | 3009      | https://hemograma.nutricao360.com/                                 |

MySQL compartilhado roda na porta `3306`.

---

## 2. Arquitetura

```
┌─────────────────┐     ┌──────────────────────────────────────┐
│  Browser SPA    │────▶│  Express server (port 30NN)          │
│  (React + Vite) │     │  ┌─────────────────────────────────┐ │
└─────────────────┘     │  │ /api/oauth/callback             │ │
                        │  │ /api/webhook/guru   (GET/POST)  │ │
                        │  │ /api/trpc/*         (tRPC)      │ │
                        │  │ /                   (SPA / Vite)│ │
                        │  └─────────────────────────────────┘ │
                        └──────────────┬───────────────────────┘
                                       │
                  ┌────────────────────┼────────────────────┐
                  ▼                    ▼                    ▼
            ┌───────────┐       ┌─────────────┐      ┌─────────────┐
            │ MySQL     │       │ Guru API    │      │ shared-auth │
            │ (Drizzle) │       │ (subs)      │      │ (npm pkg)   │
            └───────────┘       └─────────────┘      └─────────────┘
```

Pontos-chave:

- **`shared-auth/`** é um pacote local (importado por todos os apps via workspace `pnpm`)
  contendo o schema Drizzle de `users`, `guru_subscriptions`, `guru_webhook_events`, a
  função `loginWithGuruEmail`, o handler do webhook Guru e helpers de verificação de
  assinatura.
- Cada app tem seu próprio `server/db.ts` com queries específicas (Drizzle), seu
  `server/routers.ts` com as procedures tRPC e os schemas Zod.
- A pasta `server/_core/` é o **boilerplate compartilhado**, replicado nos 9 apps:
  trpc base, contexto, cookies, OAuth, system router, vite/static.

### Stack

| Camada       | Tecnologia                                            |
|--------------|-------------------------------------------------------|
| Frontend     | React 18, Vite, Tailwind, shadcn/ui, TanStack Query    |
| RPC          | tRPC v10 (`@trpc/server/adapters/express`)             |
| Backend      | Express, Node.js                                       |
| DB           | MySQL + Drizzle ORM (`mysql2` driver)                  |
| Auth         | JWT (jose) em cookie HTTP-only                          |
| Pagamento    | Guru (webhook + API REST de transações)                |
| Build/Deploy | Docker (Dockerfile único parametrizado por `APP=`), EasyPanel |

---

## 3. Autenticação

Dois caminhos coexistem; ambos terminam em um JWT assinado em cookie HTTP-only.

### 3.1 OAuth (callback)

```
Browser ──┐
          │ 1) inicia OAuth no IdP externo (link no SPA)
          ▼
        IdP ──▶ redirect → GET /api/oauth/callback?code=…&state=…
                              │
                              ▼
                        sdk.exchangeCodeForToken
                        sdk.getUserInfo
                        db.upsertUser
                        sdk.createSessionToken (JWT, 1 ano)
                        Set-Cookie: __session_<APP_ID>
                              │
                              ▼
                        302 → /
```

### 3.2 Login por e-mail com verificação Guru

Procedure tRPC `auth.emailAccess`:

```
1. cliente envia { email }
2. checkGuruSubscription(email):
   ├─ olha guru_subscriptions local; se "active" e não expirado → OK
   └─ senão, consulta API da Guru (2 janelas paralelas de 5 meses cada,
      até 3 páginas) procurando uma transação aprovada do e-mail
3. se não há assinatura ativa → retorna { success: false, error }
4. upsert do user em `users`
5. emite JWT (jose, HS256, 365d) e seta cookie
```

### 3.3 Cookie de sessão

- **Nome**: `__session_<APP_ID>` (ex.: `__session_aqua`).
- **HTTP-only**, `SameSite` ajustado por `getSessionCookieOptions(req)` (varia por origem).
- **Validade**: 1 ano (`ONE_YEAR_MS`).
- **Payload JWT**: `{ openId, appId, name }`, assinado com `JWT_SECRET`.

### 3.4 Variáveis de ambiente (por app)

| Variável             | Função                                              |
|----------------------|------------------------------------------------------|
| `DATABASE_URL`       | `mysql://user:pass@host:3306/healthcheck_db`         |
| `JWT_SECRET`         | Segredo HMAC do JWT de sessão.                       |
| `GURU_API_TOKEN`     | Bearer token para a API REST da Guru (fallback).     |
| `GURU_ACCOUNT_TOKEN` | Token esperado em `payload.api_token` do webhook.    |
| `VITE_APP_ID`        | Identificador do app (`aqua`, `cardio`, …).          |
| `NODE_ENV`           | `development` (Vite) ou `production` (static).       |
| `PORT`               | Porta de escuta (3000 no container).                 |

---

## 4. Integração Guru

A Guru é a plataforma de pagamento/assinaturas. Dois canais são usados:

### 4.1 Webhook (`POST /api/webhook/guru`)

Vide [`openapi.yaml`](./openapi.yaml#L83) para o contrato. Em resumo:

1. Valida `api_token` contra `GURU_ACCOUNT_TOKEN`.
2. Persiste o payload bruto em `guru_webhook_events` (auditoria).
3. Se `product.id` não está na lista interna de produtos → responde `{ success: true,
   message: "Ignored" }` sem afetar a assinatura.
4. Senão, faz upsert em `guru_subscriptions` com `status = active|inactive` e calcula
   `expiresAt` a partir de `GURU_PRODUCT_PERIODS[productId]` (em meses, ver tabela
   abaixo).

### 4.2 API REST da Guru (fallback no login)

Quando o login por e-mail não encontra assinatura local, o servidor consulta
`GET https://digitalmanager.guru/api/v2/transactions` em duas janelas paralelas de 5
meses, até 3 páginas cada, procurando uma transação aprovada do e-mail. Se acha, persiste
em `guru_subscriptions` (com o `expiresAt` calculado) e retorna `isActive: true`.

### 4.3 Tabela de produtos Guru → meses de acesso

Definida em `shared-auth/guru.ts` (`GURU_PRODUCT_PERIODS`). 17 product IDs mapeados para
períodos entre 1 e 12 meses. Atualizar ali quando um produto novo entrar.

---

## 5. Endpoints REST

Documentados formalmente em [`openapi.yaml`](./openapi.yaml). Resumo:

| Método | Caminho                  | Auth | Função                                |
|--------|--------------------------|------|----------------------------------------|
| GET    | `/api/oauth/callback`    | —    | Conclui OAuth e seta cookie de sessão.|
| GET    | `/api/webhook/guru`      | —    | Liveness probe do webhook.            |
| POST   | `/api/webhook/guru`      | token in body | Evento de assinatura Guru.   |
| GET/POST | `/api/trpc/{procedure}` | cookie | Gateway tRPC (ver §6).           |

---

## 6. Procedures tRPC

O caminho HTTP de cada procedure é `/api/trpc/{router}.{procedure}`. Queries vão por
`GET` com `input` URL-encoded; mutations vão por `POST` com JSON no body. Todas elas
estão definidas em `<app>/server/routers.ts` (e em `server/_core/systemRouter.ts` para o
router `system`).

Auth:

- **public** — qualquer um.
- **protected** — exige cookie de sessão válido.
- **admin** — exige cookie de sessão de usuário com `role = 'admin'` na tabela `users`.

### 6.1 Procedures compartilhadas (presentes em todos os 9 apps)

| Procedure              | Tipo     | Auth      | Input                              | Output                                    |
|------------------------|----------|-----------|-------------------------------------|--------------------------------------------|
| `system.health`        | query    | public    | `{ timestamp: number }`             | `{ ok: true }`                             |
| `system.notifyOwner`   | mutation | admin     | `{ title, content }`                | `{ success: boolean }`                     |
| `auth.me`              | query    | public    | —                                   | `User \| null`                             |
| `auth.logout`          | mutation | public    | —                                   | `{ success: true }`                        |
| `auth.emailAccess`     | mutation | public    | `{ email }`                         | `{ success, user? } \| { success: false, error }` |
| `auth.checkAccess`     | query    | public    | `{ email }`                         | `{ isActive, status, productName?, expiresAt? }` |

### 6.2 aquaflow (hidratação) — porta 3001

| Procedure                  | Tipo     | Auth      | Input                                                                 | Output                                          |
|----------------------------|----------|-----------|------------------------------------------------------------------------|--------------------------------------------------|
| `profile.get`              | query    | protected | —                                                                      | `HydrationProfile \| null`                       |
| `profile.upsert`           | mutation | protected | dados do perfil (peso, nível de atividade, clima, horários, refeições, treino, copo) | `{ dailyGoalMl, strategy }`     |
| `profile.toggleReminders`  | mutation | protected | `{ paused: boolean }`                                                  | `{ paused }`                                     |
| `profile.reset`            | mutation | protected | —                                                                      | `{ success: true }`                              |
| `intake.getByDate`         | query    | protected | `{ date: "YYYY-MM-DD" }`                                               | `IntakeRecord[]`                                 |
| `intake.complete`          | mutation | protected | `{ date, slotIndex, amountMl }`                                        | `{ success: true }`                              |
| `intake.undo`              | mutation | protected | `{ id }`                                                               | `{ success: true }`                              |
| `history.getSummaries`     | query    | protected | `{ startDate, endDate }`                                               | `DailySummary[]`                                 |

### 6.3 cardiocheck — porta 3002

| Procedure              | Tipo     | Auth      | Input                                                | Output                                    |
|------------------------|----------|-----------|-------------------------------------------------------|--------------------------------------------|
| `analysis.preview`     | mutation | public    | `{ exams: Record<string, { value, unit }> }`          | `{ examResults, ratios, correlations }`    |
| `analysis.save`        | mutation | protected | `{ examDate, exams }`                                 | `{ id, examResults, ratios, correlations }`|
| `analysis.getById`     | query    | protected | `{ id }`                                              | `Analysis \| null`                         |
| `analysis.list`        | query    | protected | —                                                     | `AnalysisSummary[]`                        |
| `analysis.evolution`   | query    | protected | —                                                     | `EvolutionPoint[]`                         |
| `analysis.delete`      | mutation | protected | `{ id }`                                              | `{ success: boolean }`                     |

### 6.4 glicocheck — porta 3003

| Procedure          | Tipo     | Auth      | Input                                                                                                  | Output            |
|--------------------|----------|-----------|---------------------------------------------------------------------------------------------------------|--------------------|
| `analysis.create`  | mutation | protected | `{ analysisDate, glicemiaJejum?, insulina?, hba1c?, frutosamina?, peptideoC?, acidoUrico?, homaIr?, homaBeta?, relacaoGlicoseInsulina?, correlations? }` | `{ id }`           |
| `analysis.list`    | query    | protected | —                                                                                                       | `Analysis[]`       |
| `analysis.get`     | query    | protected | `{ id }`                                                                                                | `Analysis \| null` |
| `analysis.delete`  | mutation | protected | `{ id }`                                                                                                | `{ success }`      |

### 6.5 nutricheck — porta 3004

| Procedure          | Tipo     | Auth      | Input                                                              | Output                            |
|--------------------|----------|-----------|---------------------------------------------------------------------|------------------------------------|
| `analysis.create`  | mutation | protected | `{ analysisDate, exams?: Record<string, number \| null> }`         | `{ id, ratios, correlations }`     |
| `analysis.list`    | query    | protected | —                                                                   | `Analysis[]`                       |
| `analysis.getById` | query    | protected | `{ id }`                                                            | `Analysis \| null`                 |
| `analysis.delete`  | mutation | protected | `{ id }`                                                            | `{ success }`                      |

### 6.6 osteocheck — porta 3005

| Procedure          | Tipo     | Auth      | Input                                                                              | Output            |
|--------------------|----------|-----------|------------------------------------------------------------------------------------|--------------------|
| `analysis.preview` | mutation | public    | `{ examValues, patientAge?, patientSex?, patientMenopause? }`                      | `Results`          |
| `analysis.save`    | mutation | protected | `{ examDate, patientAge?, patientSex?, patientMenopause?, examValues }`            | `{ id, results }`  |
| `analysis.list`    | query    | protected | —                                                                                  | `Analysis[]`       |
| `analysis.get`     | query    | protected | `{ id }`                                                                           | `Analysis \| null` |
| `analysis.delete`  | mutation | protected | `{ id }`                                                                           | `{ success: true }`|

### 6.7 renalcheck — porta 3006

| Procedure          | Tipo     | Auth      | Input                                                          | Output            |
|--------------------|----------|-----------|----------------------------------------------------------------|--------------------|
| `analysis.preview` | mutation | public    | `{ examValues, patientAge?, patientSex? }`                     | `Results`          |
| `analysis.save`    | mutation | protected | `{ examDate, patientAge?, patientSex?, examValues }`           | `{ id, results }`  |
| `analysis.list`    | query    | protected | —                                                              | `Analysis[]`       |
| `analysis.get`     | query    | protected | `{ id }`                                                       | `Analysis \| null` |
| `analysis.delete`  | mutation | protected | `{ id }`                                                       | `{ success: true }`|

### 6.8 sexcheck — porta 3007

| Procedure            | Tipo     | Auth      | Input                                                | Output                                                       |
|----------------------|----------|-----------|-------------------------------------------------------|---------------------------------------------------------------|
| `analysis.preview`   | mutation | public    | `{ sex: "masculino" \| "feminino", exams }`           | `{ examResults, ratios, correlations }`                       |
| `analysis.save`      | mutation | protected | `{ examDate, sex, exams }`                            | `{ id, examResults, ratios, correlations }`                   |
| `analysis.getById`   | query    | protected | `{ id }`                                              | `Analysis \| null`                                            |
| `analysis.list`      | query    | protected | —                                                     | `AnalysisSummary[]` (com contadores por categoria)            |
| `analysis.evolution` | query    | protected | —                                                     | `EvolutionPoint[]`                                            |
| `analysis.delete`    | mutation | protected | `{ id }`                                              | `{ success: boolean }`                                        |

### 6.9 tireocheck — porta 3008

| Procedure          | Tipo     | Auth      | Input                                                                              | Output            |
|--------------------|----------|-----------|------------------------------------------------------------------------------------|--------------------|
| `analysis.preview` | mutation | public    | `{ examValues, patientAge?, patientSex?, patientMenopause? }`                      | `Results`          |
| `analysis.save`    | mutation | protected | `{ examDate, patientAge?, patientSex?, patientMenopause?, examValues }`            | `{ id, results }`  |
| `analysis.list`    | query    | protected | —                                                                                  | `Analysis[]`       |
| `analysis.get`     | query    | protected | `{ id }`                                                                           | `Analysis \| null` |
| `analysis.delete`  | mutation | protected | `{ id }`                                                                           | `{ success: true }`|

### 6.10 hemocheck — porta 3009

| Procedure            | Tipo     | Auth      | Input                                                              | Output                                                  |
|----------------------|----------|-----------|---------------------------------------------------------------------|---------------------------------------------------------|
| `analysis.preview`   | mutation | public    | `{ exams, sex?: "male" \| "female" }`                              | `{ examResults, ratios, correlations }`                 |
| `analysis.save`      | mutation | protected | `{ examDate, exams, sex? }`                                        | `{ id, examResults, ratios, correlations }`             |
| `analysis.getById`   | query    | protected | `{ id }`                                                           | `Analysis \| null`                                      |
| `analysis.list`      | query    | protected | —                                                                  | `AnalysisSummary[]`                                     |
| `analysis.evolution` | query    | protected | —                                                                  | `EvolutionPoint[]`                                      |
| `analysis.delete`    | mutation | protected | `{ id }`                                                           | `{ success: boolean }`                                  |

---

## 7. Banco de dados

Todos os apps compartilham o mesmo banco MySQL `healthcheck_db`. Script de bootstrap:
[`init-database.sql`](../init-database.sql).

### 7.1 Tabelas compartilhadas

| Tabela                | Função                                                          |
|-----------------------|-----------------------------------------------------------------|
| `users`               | Conta de usuário (id, openId, email, role, lastSignedIn).       |
| `guru_subscriptions`  | Estado consolidado da assinatura por e-mail.                    |
| `guru_webhook_events` | Auditoria — todo evento Guru recebido (payload JSON cru).       |

### 7.2 Tabelas por app

| App         | Tabelas                                  |
|-------------|------------------------------------------|
| aquaflow    | `aqua_profiles`, `aqua_intake_records`   |
| cardiocheck | `cardio_analyses`                        |
| glicocheck  | `glico_analyses`                         |
| nutricheck  | `nutri_analyses`                         |
| osteocheck  | `osteo_analyses`                         |
| renalcheck  | `renal_analyses`                         |
| sexcheck    | `sex_analyses`                           |
| tireocheck  | `tireo_analyses`                         |
| hemocheck   | `hemo_analyses`                          |

A maioria das tabelas de análise segue o mesmo molde (`userId`, `examDate`, `patientAge`,
`patientSex`, `examValues` JSON, `results` JSON). Aquaflow é a exceção, com modelo de
perfil + ingestões.

---

## 8. Como visualizar a documentação Swagger

A spec OpenAPI está em [`openapi.yaml`](./openapi.yaml). Algumas formas de visualizar:

1. **Swagger Editor online** — abrir <https://editor.swagger.io>, **File → Import file**
   e selecionar o `openapi.yaml`.
2. **VS Code** — extensões como _OpenAPI (Swagger) Editor_ (`42Crunch.vscode-openapi`)
   renderizam o preview lado a lado.
3. **Redoc CLI** (gera um HTML estático):

   ```bash
   npx @redocly/cli build-docs docs/openapi.yaml -o docs/api.html
   ```

---

## 9. Como rodar localmente

```bash
# instalar dependências
pnpm install

# subir todos os apps em paralelo
pnpm dev

# ou apenas um
pnpm dev:aqua
pnpm dev:cardio
# ...

# inicializar o banco (MySQL precisa estar rodando)
pnpm db:init
```

Deploy em produção: ver [`DEPLOY-EASYPANEL.md`](../DEPLOY-EASYPANEL.md).
