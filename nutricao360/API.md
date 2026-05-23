# Nutricao360 — Documentação da API

Documentação consolidada dos 7 apps Next.js do monorepo **Nutricao360**.
Cada app expõe seu próprio `GET /api/swagger` (spec OpenAPI 3.1 gerada por
`@fourmed3/swagger`) e UI em `/api-docs`. Esta página espelha o conteúdo
das specs por app e padroniza convenções comuns.

## Visão geral

| App | Porta dev | URL prod | Propósito |
|---|---|---|---|
| [admin](#1-admin-3005) | 3005 | https://admin.nutricao360.com | Painel administrativo central |
| [exames](#2-exames-3002) | 3002 | https://exames.nutricao360.com | Upload e análise de exames laboratoriais |
| [nutricao](#3-nutricao-3003) | 3003 | https://nutricao.nutricao360.com | Análise nutricional (foto ou texto) |
| [corpo](#4-corpo-3004) | 3004 | https://corpo.nutricao360.com | Análise corporal por fotos |
| [receitas](#5-receitas-3006) | 3006 | https://receitas.nutricao360.com | Chat IA de receitas |
| [suporte](#6-suporte-3005) | 3005¹ | https://suporte.nutricao360.com | Chat IA de suporte |
| [portal](#7-portal-3008) | 3008 | https://portal.nutricao360.com | Portal do cliente (login por e-mail) |

¹ Colisão de porta com `admin` no dev local — ajustar uma das duas para subir simultaneamente.

## Convenções comuns

### Autenticação

| Esquema | Como funciona | Onde aparece |
|---|---|---|
| **NextAuth (sessão)** | Cookie `next-auth.session-token` (JWT) emitido por `getServerSession(authOptions)` do `@fourmed3/auth`. | Quase todos os apps (admin, exames, corpo, nutricao). |
| **`requireAdmin`** | Helper que valida sessão **e** role de admin. | admin (quase todas as rotas). |
| **e-mail + assinatura** | Validação por `UnifiedSubscriptionService` (Hotmart + Guru) — sem cookie/login. | portal, corpo (upload), receitas, suporte, nutricao (upload), exames (upload). |
| **`x-api-key`** | Header de API key para integrações externas. | `admin: /api/external/meal-plans/by-email`. |
| **`x-hotmart-hottok`** | Token compartilhado da Hotmart. | `exames: /api/webhooks/hotmart`. |
| **`x-admin-token`** | Token de auditoria/admin para listar webhooks. | `exames: /api/webhooks/hotmart/latest`. |
| **`Authorization: Bearer <CRON_SECRET>`** | Cron protegido por bearer (Vercel Cron). | `admin: /api/cron/process-scheduled`. |
| **`api_token` (body Guru)** | Token compartilhado da plataforma Guru. | Webhooks Guru em vários apps. |
| **SSOToken** | Token gerado e validado em `SSOToken` para emitir JWT. | `exames: /api/sso/*`. |

### Fluxo de status de análise

```
PENDING ──▶ SCHEDULED ──▶ APPROVED
   │                          ▲
   └─────────▶ REJECTED       │
                              │
       (admin escolhe `approve` ou `reject`,
        opcionalmente agenda com `schedule`)
```

Endpoints `/api/admin/<entidade>/{id}/approve` aceitam `action`:
`approve | reject | schedule | cancel-schedule | update-schedule`.

### Códigos HTTP

| Código | Significado |
|---|---|
| `200 / 201` | Sucesso. |
| `202` | Aceito; processamento em background (webhooks de formulário). |
| `302` | Redirect (NextAuth). |
| `304` | Não modificado (ETag em `admin/analytics/summary`). |
| `400` | Parâmetros inválidos. |
| `401` | Sessão / token inválido. |
| `403` | Permissão insuficiente ou assinatura inativa. |
| `404` | Recurso inexistente. |
| `409` | Conflito (e-mail duplicado). |
| `429` | Rate-limit excedido. |
| `500` | Erro interno. |
| `503` | Serviço indisponível (uso pesado no `admin/supplements`). |

---

## 1. `admin` (3005)

Painel administrativo central. Gestão de admins, usuários, exames, planos, relatórios, suplementos, IA, base de conhecimento (RAG), integrações Hotmart/Guru/FirePay, webhooks de formulários CDA (Etapa 1 e 2) e crons.

> Spec: [`admin/openapi.yaml`](./admin/openapi.yaml) · UI: [`admin/`](./admin/)

### Auth / Sessão

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| POST | `/api/admin/login` | público | Login do admin (bcrypt + AuditLog). |
| POST | `/api/admin/logout` | adminSession | Logout. |
| GET·POST | `/api/auth/[...nextauth]` | público | NextAuth catch-all. |

### Admin Users

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/admin-users` | adminSession | Lista paginada de AdminUser. |
| POST | `/api/admin/admin-users` | adminSession | Cria AdminUser (bcrypt). |
| PUT | `/api/admin/admin-users/{id}` | adminSession | Atualiza AdminUser. |
| DELETE | `/api/admin/admin-users/{id}` | adminSession | Exclui AdminUser. |

### AI Config

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/ai-config` | adminSession | Lista AIConfig (prompts/modelos/settings). |
| POST | `/api/admin/ai-config` | adminSession | Cria AIConfig. |
| PUT | `/api/admin/ai-config` | adminSession | Atualiza AIConfig. |
| DELETE | `/api/admin/ai-config` | adminSession | Exclui AIConfig. |
| POST | `/api/admin/ai-config/settings` | adminSession | Salva chaves de API e limites em SystemConfig. |
| POST | `/api/admin/ai-config/test-connection` | adminSession | Testa OpenAI/OpenRouter/Google AI. |

### Analytics

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/activity` | adminSession | Atividades das últimas 24h. |
| GET | `/api/admin/analysts` | adminSession | Nomes únicos de admins ativos. |
| GET | `/api/admin/analytics/summary` | adminSession | Sumário agregado (suporta `If-None-Match` → 304). |
| GET | `/api/admin/analytics/timeline` | adminSession | Timeline diária. |
| GET | `/api/admin/analytics/rankings` | adminSession | Ranking de colaboradores. |
| GET | `/api/admin/analytics/export` | adminSession | Export `xlsx` ou `csv`. |

### Clients

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/clients` | adminSession | Lista clientes B2B com uso/receita do mês. |

### Exams

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/exams` | adminSession | Lista paginada com filtros. |
| GET | `/api/admin/exams/{id}` | adminSession | Detalhes do exame. |
| PUT | `/api/admin/exams/{id}` | adminSession | Atualiza campos (fileName/extractedText/analysis/status). |
| POST | `/api/admin/exams/{id}/approve` | adminSession | Ação de aprovação. |
| GET | `/api/admin/exams/{id}/download-pdf` | adminSession | PDF do exame. |
| POST | `/api/admin/exams/{id}/generate-analysis` | adminSession | Gera análise via IA + RAG. |
| POST | `/api/admin/exams/{id}/resend-email` | adminSession | Reenvia e-mail aprovado. |
| GET | `/api/admin/exams/analysts` | adminSession | analysisStatusBy distintos. |
| POST | `/api/admin/exams/manual-upload` | adminSession | Upload manual (PDF OCR via Mistral ou texto). |

### Meal Plans

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/meal-plans` | adminSession | Lista paginada. |
| GET | `/api/admin/meal-plans/{id}` | adminSession | Detalhes do plano. |
| PUT | `/api/admin/meal-plans/{id}` | adminSession | Atualiza plano. |
| DELETE | `/api/admin/meal-plans/{id}` | adminSession (SUPER_ADMIN) | Exclui plano. |
| POST | `/api/admin/meal-plans/{id}/approve` | adminSession | Ação de aprovação. |
| GET | `/api/admin/meal-plans/{id}/download-pdf` | adminSession | PDF do plano. |
| POST | `/api/admin/meal-plans/{id}/regenerate` | adminSession | Regenera via IA (PLANOS). |
| POST | `/api/admin/meal-plans/{id}/resend-email` | adminSession | Reenvia e-mail aprovado. |
| GET | `/api/admin/meal-plans/analysts` | adminSession | analysisStatusBy distintos. |
| GET | `/api/admin/regenerate-meal-plans` | adminSession | Status da regeneração. |
| POST | `/api/admin/regenerate-meal-plans` | adminSession | Regenera planos faltantes (background). |
| POST | `/api/admin/regenerate-meal-plans/single` | adminSession | Regenera plano para um único userId. |
| GET | `/api/meal-plans` | adminSession | Lista por etapa via `mealPlanService`. |
| GET | `/api/meal-plans/stats` | adminSession | Stats por etapa. |

### Reports

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/reports` | adminSession | Lista paginada. |
| GET | `/api/admin/reports/{id}` | adminSession | Detalhes do relatório. |
| PUT | `/api/admin/reports/{id}` | adminSession | Atualiza relatório (mescla `formData` em metadata). |
| POST | `/api/admin/reports/{id}/approve` | adminSession | Ação de aprovação. |
| GET | `/api/admin/reports/{id}/download-pdf` | adminSession | PDF. |
| POST | `/api/admin/reports/{id}/regenerate` | adminSession | Regenera via IA (RELATORIOS). |
| POST | `/api/admin/reports/{id}/resend-email` | adminSession | Reenvia e-mail. |
| GET | `/api/admin/reports/analysts` | adminSession | analysisStatusBy distintos. |

### Supplements

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/supplements` | adminSession | Lista paginada (limite ≤100). |
| GET | `/api/admin/supplements/{id}` | adminSession | Detalhes. |
| PUT | `/api/admin/supplements/{id}` | adminSession | Atualiza (com validação de tamanho). |
| POST | `/api/admin/supplements/{id}/approve` | adminSession | Ação de aprovação (transação). |
| GET | `/api/admin/supplements/{id}/download-pdf` | adminSession | PDF. |
| POST | `/api/admin/supplements/{id}/regenerate` | adminSession | Regenera via IA (SUPLEMENTACAO). |
| POST | `/api/admin/supplements/{id}/resend-email` | adminSession | Reenvia e-mail. |
| GET | `/api/admin/supplements/analysts` | adminSession | analysisStatusBy distintos. |

### Knowledge Base (RAG)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/knowledge-base` | adminSession | Lista itens. |
| POST | `/api/admin/knowledge-base` | adminSession | Cria item (gera embeddings OpenAI). |
| PUT | `/api/admin/knowledge-base` | adminSession | Atualiza (regenera embedding se content mudar). |
| DELETE | `/api/admin/knowledge-base` | adminSession | Exclui item (`KnowledgeBase` ou `BodyReference`). |
| GET | `/api/admin/knowledge-base/debug` | adminSession + admin check | Debug do RAG. |

Tipos de item: `meal_plan`, `body_reference`, `exam_reference`, `supplement_reference`,
`report_reference`, `recipe_reference`, `support_reference`, `nutrition_reference`.

### Users (clientes finais)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/users` | adminSession | Lista paginada com filtros. |
| PUT | `/api/admin/users/{id}` | adminSession | Atualiza User (sync `GuruSubscription`). |
| DELETE | `/api/admin/users/{id}` | adminSession | Exclui User (cascade + cleanup). |
| PUT | `/api/admin/users/{id}/status` | adminSession | Ativa/suspende. |
| GET | `/api/admin/users/{id}/merge?sourceId=...` | adminSession | Preview de merge. |
| POST | `/api/admin/users/{id}/merge` | adminSession | Executa merge (transação). |

### Stats e externas

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/admin/stats` | adminSession | Stats gerais do painel. |
| GET | `/api/external/meal-plans/by-email?email=` | `x-api-key` | API externa — MealPlan APPROVED por e-mail. |

### FirePay

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| POST | `/api/firepay/check` | adminSession | Verifica status de uma lista de e-mails. |
| POST | `/api/firepay/import` | adminSession | Importa usuários (JSON ou CSV, +2 meses). |

### Cron

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/cron/process-scheduled` | Bearer `CRON_SECRET` (opcional) | Aprova SCHEDULED em background. |
| GET | `/api/cron/process-webhooks` | público | Processa `WebhookQueue` (até 5 min). |

### Webhooks

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| POST | `/api/webhook/form-submission` | público | Webhook Etapa 1 — cria plano/relatório/suplemento (background AI). Query `type?`. |
| POST | `/api/webhook/form-submission-etapa2` | público | Etapa 2 (legado) — cria MealPlan placeholder. |
| POST | `/api/webhook/etapa2/meal-plan` | público | Etapa 2 — cria MealPlan placeholder. |
| POST | `/api/webhook/etapa2/report` | público | Etapa 2 — cria Report placeholder. |
| GET | `/api/webhook/firepay` | público | Health-check. |
| POST | `/api/webhook/firepay` | público | Evento FirePay (paid/refunded/canceled/chargeback). |

---

## 2. `exames` (3002)

Upload de exames (PDF OCR via Mistral, ou texto) + análise via IA (OpenRouter) com RAG sobre `exam_reference`. SSO por token, NextAuth e integrações Hotmart/Guru.

> Spec: [`exames/openapi.yaml`](./exames/openapi.yaml) · UI: [`exames/`](./exames/)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/swagger` | público | OpenAPI spec. |
| POST | `/api/auth/register` | público | Registra usuário (bcrypt + profile vazio). |
| GET·POST | `/api/auth/[...nextauth]` | público | NextAuth catch-all. |
| POST | `/api/sso/signin` | SSOToken | Valida SSOToken e emite JWT (30 d). |
| POST | `/api/sso/validate-token` | SSOToken | Valida SSOToken (não emite JWT). |
| GET | `/api/exams` | sessão | Lista exames APPROVED do usuário. |
| GET | `/api/exams/{id}` | sessão | Detalhe do exame. |
| GET | `/api/exams/stats` | sessão | Stats (total/pending/today/recent). |
| POST | `/api/exams/upload` | e-mail | Upload (JSON com texto ou multipart com PDF) — dispara análise em background. |
| POST | `/api/exams/analyze` | sessão | Analisa exame previamente salvo (RAG + IA). |
| GET | `/api/webhook/guru` | público | Health-check Guru. |
| POST | `/api/webhook/guru` | api_token | Webhook Guru — sync GuruSubscription. |
| POST | `/api/webhooks/hotmart` | x-hotmart-hottok | Webhook Hotmart (mapeia para status interno). |
| GET | `/api/webhooks/hotmart/latest` | x-admin-token | 10 últimos webhooks + assinaturas. |

---

## 3. `nutricao` (3003)

Análise nutricional — reconhece refeições por **foto** (vision) ou **texto**, calcula calorias/macros via IA com RAG (`nutrition_reference`) e persiste em `NutritionLog`.

> Spec: [`nutricao/openapi.yaml`](./nutricao/openapi.yaml) · UI: [`nutricao/`](./nutricao/)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/swagger` | público | OpenAPI spec. |
| POST | `/api/nutrition/analyze` | sessão **ou** e-mail no form | Vision + analysis a partir de imagem (≤10 MB). |
| POST | `/api/nutrition/analyze-text` | sessão **ou** e-mail no body | Análise a partir de `foods[{name,quantity}]`. |
| GET | `/api/nutrition/stats` | sessão | Stats do dia, semana e refeições recentes. |
| GET | `/api/nutrition/verify-email?email=&page=` | público | Valida assinatura e lista 10 logs/pág. |
| GET | `/api/webhook/guru` | público | Health-check. |
| POST | `/api/webhook/guru` | api_token | Webhook Guru. |

---

## 4. `corpo` (3004)

Análise corporal a partir de **3 fotos** (frente, lateral, costas) + medidas antropométricas. Vision model da OpenRouter, persiste `BodyAnalysis`.

> Spec: [`corpo/openapi.yaml`](./corpo/openapi.yaml) · UI: [`corpo/`](./corpo/)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/swagger` | público | OpenAPI spec. |
| GET·POST | `/api/auth/[...nextauth]` | público | NextAuth catch-all. |
| POST | `/api/body/analyze` | e-mail | Analisa 3 fotos + dados antropométricos. |
| DELETE | `/api/body/analysis/{id}` | sessão | Exclui análise do usuário logado. |
| POST | `/api/body/report` | sessão | Gera relatório textual (≤200 palavras). |
| GET | `/api/body/stats?email=` | público | Stats + histórico recente. |
| GET | `/api/body/verify-email?email=&page=` | público | Valida assinatura e lista análises paginadas. |
| GET | `/api/webhook/guru` | público | Health-check. |
| POST | `/api/webhook/guru` | api_token | Webhook Guru. |

---

## 5. `receitas` (3006)

Chat IA de receitas com sessões persistentes (`ChatSession` + `ChatMessage`) e RAG sobre `recipe_reference`.

> Spec: [`receitas/openapi.yaml`](./receitas/openapi.yaml) · UI: [`receitas/`](./receitas/)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/swagger` | público | OpenAPI spec. |
| GET | `/api/auth/verify-email?email=` | público | Valida assinatura + lista até 20 sessões. |
| POST | `/api/chat` | e-mail | Envia mensagem (cria sessão se `sessionId` ausente). |
| GET | `/api/chat/{sessionId}?email=` | e-mail | Carrega sessão + mensagens. |
| DELETE | `/api/chat/{sessionId}?email=` | e-mail | Exclui sessão (cascade). |
| GET | `/api/webhook/guru` | público | Health-check + `GURU_PRODUCT_PERIODS`. |
| POST | `/api/webhook/guru` | api_token | Webhook Guru com expiração por produto. |

---

## 6. `suporte` (3005)

Chat IA de suporte ao cliente — mesma arquitetura do `receitas`, com RAG sobre `support_reference`. Sessões marcadas com prefixo `[SUPORTE]`.

> Spec: [`suporte/openapi.yaml`](./suporte/openapi.yaml) · UI: [`suporte/`](./suporte/)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/swagger` | público | OpenAPI spec. |
| GET | `/api/auth/verify-email?email=` | público | Valida assinatura + lista sessões `[SUPORTE]`. |
| POST | `/api/chat` | e-mail | Envia mensagem. |
| GET | `/api/chat/{sessionId}?email=` | e-mail | Carrega sessão + mensagens. |
| GET | `/api/webhook/guru` | público | Health-check + `GURU_PRODUCT_PERIODS`. |
| POST | `/api/webhook/guru` | api_token | Webhook Guru. |

---

## 7. `portal` (3008)

Portal do cliente — entrada por **e-mail** (sem login), agrega documentos APPROVED (top 2 por categoria), flags de pendências por etapa e consulta CSAT externo.

> Spec: [`portal/openapi.yaml`](./portal/openapi.yaml) · UI: [`portal/`](./portal/)

| Método | Caminho | Auth | Descrição |
|---|---|---|---|
| GET | `/api/swagger` | público | OpenAPI spec. |
| GET | `/api/portal/verify-email?email=` | público | Valida assinatura ativa. |
| GET | `/api/portal/evaluation-status?email=` | público | Status CSAT (`evaluated\|pending\|unknown`). |
| POST | `/api/documents` | público (sub) | Lista documentos aprovados/pendentes por etapa. |

---

## Webhooks de pagamento — onde estão

| Plataforma | App | Endpoint(s) | Auth |
|---|---|---|---|
| **Hotmart** | exames | `POST /api/webhooks/hotmart` · `GET /api/webhooks/hotmart/latest` | `x-hotmart-hottok` / `x-admin-token` |
| **Guru** | corpo, exames, nutricao, receitas, suporte | `GET·POST /api/webhook/guru` | `api_token` no body |
| **FirePay** | admin | `GET·POST /api/webhook/firepay` · `POST /api/firepay/{check,import}` | público / `adminSession` |

## Knowledge Base / RAG — convenção

Tipos de item armazenados em `KnowledgeBase` (com embeddings OpenAI):

- `meal_plan` — exemplos de planos alimentares para few-shot.
- `body_reference` — referências de composição corporal.
- `exam_reference` — referências para análise de exames.
- `supplement_reference` — referências de suplementação.
- `report_reference` — referências de relatórios de evolução.
- `recipe_reference` — base do chat `receitas`.
- `support_reference` — base do chat `suporte`.
- `nutrition_reference` — base de `nutricao`.

A atualização de `content` regenera o embedding automaticamente
(`PUT /api/admin/knowledge-base`).

---

## Como executar localmente

Cada app é um workspace independente do Turbo. Para subir tudo na ordem padrão
de portas (sem conflitos):

```bash
# admin   → 3005   ← ajustar suporte para outra porta no dev local
# exames  → 3002
# nutricao→ 3003
# corpo   → 3004
# receitas→ 3006
# portal  → 3008

pnpm -F admin dev      # ou: cd apps/admin && pnpm dev
```

A UI do Swagger de cada app fica em `/api-docs` (Swagger UI servido pelo
próprio Next.js via `@fourmed3/swagger`). A spec bruta em
`/api/swagger`.
