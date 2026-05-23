# CSAT Plano Alimentar — API

API de coleta e administração de respostas de pesquisa de satisfação (CSAT) sobre planos alimentares.

- **Versão:** `1.0.0`
- **OpenAPI:** `3.0.3`
- **Spec crua (JSON):** `GET /api/docs.json`

---

## Sumário

- [Visão geral](#visão-geral)
- [Autenticação](#autenticação)
- [Convenções](#convenções)
- [Endpoints](#endpoints)
  - [`GET /api/health`](#get-apihealth)
  - [`POST /api/auth/login`](#post-apiauthlogin)
  - [`POST /api/responses`](#post-apiresponses)
  - [`GET /api/responses`](#get-apiresponses)
  - [`DELETE /api/responses/{id}`](#delete-apiresponsesid)
- [Schemas](#schemas)
- [Códigos de erro](#códigos-de-erro)
- [Enriquecimento assíncrono](#enriquecimento-assíncrono)
- [Variáveis de ambiente](#variáveis-de-ambiente)

---

## Visão geral

Dois fluxos principais:

- **Público** — envio de respostas via `POST /api/responses` (sem autenticação). Usado pelo formulário web.
- **Administrativo** — login via `POST /api/auth/login` que retorna um JWT; o token é enviado no header `Authorization: Bearer <token>` para os endpoints protegidos (`GET /api/responses`, `DELETE /api/responses/{id}`).

Após o registro de uma resposta, o backend dispara em background o enriquecimento via API externa Nutrição 360 para vincular o nutricionista aprovador e os planos alimentares ao e-mail informado.

### Servidores

| URL                     | Descrição                                     |
| ----------------------- | --------------------------------------------- |
| `http://localhost:3001` | Desenvolvimento local                         |
| `/`                     | Mesma origem (atrás de reverse proxy / nginx) |

---

## Autenticação

Esquema único: **`bearerAuth`** (`http` / `bearer` / `JWT`).

1. `POST /api/auth/login` com `{ email, password }`.
2. Use o `token` retornado no header `Authorization`:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

Validade padrão do token: **24h** (configurável via `JWT_EXPIRES_IN`).

---

## Convenções

- **Content-Type:** `application/json` em request e response, exceto quando explicitado.
- **Datas:** strings ISO-8601 UTC (`2026-05-14T13:45:21.000Z`).
- **IDs:** UUID v4.
- **Limite de payload:** `100kb`.
- **E-mails:** normalizados para lowercase no servidor.
- **Erros:** sempre no formato `{ "error": "mensagem legível" }`.

---

## Endpoints

### `GET /api/health`

**Tag:** Health · **Auth:** não

Healthcheck simples — retorna `{ ok: true }` quando a API está em execução.

#### Respostas

| Código | Descrição        | Schema            |
| ------ | ---------------- | ----------------- |
| `200`  | API operacional. | `HealthResponse`  |

```json
{ "ok": true }
```

#### Exemplo

```bash
curl http://localhost:3001/api/health
```

---

### `POST /api/auth/login`

**Tag:** Auth · **Auth:** não

Autentica o administrador configurado em `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` e retorna um JWT assinado com `JWT_SECRET`.

#### Request body — `LoginRequest`

| Campo      | Tipo   | Obrigatório | Descrição                                                          |
| ---------- | ------ | ----------- | ------------------------------------------------------------------ |
| `email`    | string | sim         | E-mail do administrador (case-insensitive).                        |
| `password` | string | sim         | Senha em texto puro; o backend valida contra um hash bcrypt.       |

#### Respostas

| Código | Descrição                       | Schema/Exemplo                              |
| ------ | ------------------------------- | ------------------------------------------- |
| `200`  | Credenciais válidas.            | `LoginResponse`                             |
| `400`  | E-mail ou senha não enviados.   | `{ "error": "email and password required" }` |
| `401`  | Credenciais inválidas.          | `{ "error": "invalid credentials" }`         |
| `500`  | Erro interno.                   | `{ "error": "internal error" }`              |

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "email": "admin@example.com"
}
```

#### Exemplo

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"minha-senha"}'
```

---

### `POST /api/responses`

**Tag:** Responses · **Auth:** não (público)

Endpoint usado pelo formulário web. Persiste a resposta e dispara em background a tentativa de enriquecimento via Nutrição 360.

A resposta é gravada com `enrichmentStatus = PENDING`. O job assíncrono atualiza para `DONE`, `NOT_FOUND` ou `FAILED` conforme o resultado.

#### Request body — `CreateResponseRequest`

| Campo       | Tipo                 | Obrigatório | Regras                                          |
| ----------- | -------------------- | ----------- | ----------------------------------------------- |
| `name`      | string \| null       | não         | Nome do respondente.                            |
| `email`     | string (email)       | sim         | Usado como chave para enriquecimento.           |
| `contact`   | string \| null       | não         | Telefone ou outro contato.                      |
| `ratings`   | `Ratings`            | sim         | Avaliações 1–5 nas 5 dimensões (ver schema).    |
| `liked`     | string \| null       | não         | Texto livre.                                    |
| `improve`   | string \| null       | não         | Texto livre.                                    |
| `recommend` | integer              | sim         | Nota NPS de 1 a 10.                             |

`Ratings` — todas obrigatórias, inteiros de **1 a 5**:

```
satisfaction · clarity · routine · variety · preferences
```

#### Exemplo de payload

```json
{
  "name": "Maria Silva",
  "email": "maria@example.com",
  "contact": "+55 11 99999-0000",
  "ratings": {
    "satisfaction": 5,
    "clarity": 4,
    "routine": 4,
    "variety": 5,
    "preferences": 5
  },
  "liked": "Variedade nas refeições.",
  "improve": "Mais opções de lanches.",
  "recommend": 9
}
```

#### Respostas

| Código | Descrição              | Exemplo                                           |
| ------ | ---------------------- | ------------------------------------------------- |
| `201`  | Resposta registrada.   | `{ "id": "c5b1f6e2-..." }`                        |
| `400`  | Payload inválido.      | `{ "error": "rating satisfaction invalid" }` etc. |
| `500`  | Erro interno.          | `{ "error": "internal error" }`                   |

Possíveis mensagens de `400`:

- `invalid body`
- `email required`
- `ratings required`
- `rating <campo> invalid` (`satisfaction`, `clarity`, `routine`, `variety` ou `preferences`)
- `recommend invalid`

#### Exemplo

```bash
curl -X POST http://localhost:3001/api/responses \
  -H "Content-Type: application/json" \
  -d @payload.json
```

---

### `GET /api/responses`

**Tag:** Responses · **Auth:** `bearerAuth` (admin)

Retorna até **500** respostas mais recentes, ordenadas por `createdAt` desc. Inclui dados de enriquecimento quando disponíveis.

#### Respostas

| Código | Descrição                  | Schema                  |
| ------ | -------------------------- | ----------------------- |
| `200`  | Lista de respostas.        | `Response[]`            |
| `401`  | Token ausente/inválido.    | `{ "error": "missing token" }` ou `"invalid or expired token"` |
| `500`  | Erro interno.              | `{ "error": "internal error" }` |

#### Exemplo

```bash
curl http://localhost:3001/api/responses \
  -H "Authorization: Bearer $TOKEN"
```

---

### `DELETE /api/responses/{id}`

**Tag:** Responses · **Auth:** `bearerAuth` (admin)

Exclui permanentemente uma resposta pelo seu identificador.

#### Parâmetros

| Nome | Local | Tipo          | Obrigatório | Descrição        |
| ---- | ----- | ------------- | ----------- | ---------------- |
| `id` | path  | string (uuid) | sim         | UUID da resposta. |

#### Respostas

| Código | Descrição                       | Exemplo                          |
| ------ | ------------------------------- | -------------------------------- |
| `204`  | Removida (sem corpo).           | —                                |
| `400`  | ID inválido.                    | `{ "error": "invalid id" }`      |
| `401`  | Token ausente/inválido.         | `{ "error": "missing token" }`   |
| `404`  | Resposta não encontrada.        | `{ "error": "not found" }`       |
| `500`  | Erro interno.                   | `{ "error": "internal error" }`  |

#### Exemplo

```bash
curl -X DELETE "http://localhost:3001/api/responses/c5b1f6e2-3d1f-4e9f-9f9e-3a8a6c3b2a1d" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Schemas

### `HealthResponse`

| Campo | Tipo    | Obrigatório |
| ----- | ------- | ----------- |
| `ok`  | boolean | sim         |

### `LoginRequest`

| Campo      | Tipo   | Obrigatório |
| ---------- | ------ | ----------- |
| `email`    | string | sim         |
| `password` | string | sim         |

### `LoginResponse`

| Campo   | Tipo   | Obrigatório |
| ------- | ------ | ----------- |
| `token` | string | sim         |
| `email` | string | sim         |

### `Ratings`

Todas as propriedades são `integer` entre `1` e `5`, **obrigatórias**:

| Campo          | Descrição                                    |
| -------------- | -------------------------------------------- |
| `satisfaction` | Satisfação geral com o plano.                |
| `clarity`      | Clareza das orientações do plano.            |
| `routine`      | Adequação à rotina do paciente.              |
| `variety`      | Variedade de alimentos.                      |
| `preferences`  | Aderência às preferências alimentares.       |

### `CreateResponseRequest`

| Campo       | Tipo                 | Obrigatório | Restrições       |
| ----------- | -------------------- | ----------- | ---------------- |
| `name`      | string \| null       | não         |                  |
| `email`     | string (email)       | sim         |                  |
| `contact`   | string \| null       | não         |                  |
| `ratings`   | `Ratings`            | sim         |                  |
| `liked`     | string \| null       | não         |                  |
| `improve`   | string \| null       | não         |                  |
| `recommend` | integer              | sim         | `1 ≤ x ≤ 10`     |

### `CreateResponseResult`

| Campo | Tipo          | Obrigatório |
| ----- | ------------- | ----------- |
| `id`  | string (uuid) | sim         |

### `EnrichmentStatus` (enum)

| Valor       | Significado                                                 |
| ----------- | ----------------------------------------------------------- |
| `PENDING`   | Ainda não processado.                                       |
| `DONE`      | Enriquecido com sucesso.                                    |
| `NOT_FOUND` | E-mail não localizado na base externa.                      |
| `FAILED`    | Falha de integração (timeout, erro 5xx, etc).               |

### `ApprovedBy`

Espelho dos dados do nutricionista aprovador retornados pela Nutrição 360. Formato aberto (`additionalProperties: true`); campos típicos:

| Campo   | Tipo           |
| ------- | -------------- |
| `id`    | string         |
| `name`  | string         |
| `email` | string (email) |

### `MealPlan`

Objeto aberto retornado pela Nutrição 360. Campos típicos:

| Campo        | Tipo                 |
| ------------ | -------------------- |
| `id`         | string               |
| `createdAt`  | string (date-time)   |
| `approvedBy` | `ApprovedBy` \| null |

### `Response`

| Campo              | Tipo                       | Obrigatório |
| ------------------ | -------------------------- | ----------- |
| `id`               | string (uuid)              | sim         |
| `name`             | string \| null             | não         |
| `email`            | string (email)             | sim         |
| `contact`          | string \| null             | não         |
| `ratings`          | `Ratings`                  | sim         |
| `liked`            | string \| null             | não         |
| `improve`          | string \| null             | não         |
| `recommend`        | integer (`1–10`)           | sim         |
| `createdAt`        | string (date-time)         | sim         |
| `enrichmentStatus` | `EnrichmentStatus`         | sim         |
| `enrichedAt`       | string (date-time) \| null | não         |
| `approvedBy`       | `ApprovedBy` \| null       | não         |
| `mealPlans`        | `MealPlan[]` \| null       | não         |

### `Error`

| Campo   | Tipo   | Obrigatório |
| ------- | ------ | ----------- |
| `error` | string | sim         |

---

## Códigos de erro

| Status | Quando ocorre                                                                 |
| ------ | ----------------------------------------------------------------------------- |
| `400`  | Payload inválido (campos ausentes, fora de faixa, ID malformado).             |
| `401`  | Token ausente, mal formatado ou expirado em endpoints administrativos.        |
| `404`  | Recurso não existe (ex.: `DELETE` em ID inexistente).                         |
| `500`  | Exceção não tratada — verificar logs do container.                            |

---

## Enriquecimento assíncrono

Ao criar uma resposta, o backend executa em background:

1. `GET {NUTRICAO_API_BASE_URL}/api/external/meal-plans/by-email?email=<email>` (header `x-api-key`).
2. Em **sucesso (2xx)** — grava `enrichmentStatus = DONE`, `enrichedAt`, `approvedBy` (do primeiro plano) e `mealPlans`.
3. Em **`404`** — grava `enrichmentStatus = NOT_FOUND` e `enrichedAt`.
4. Em **`429`** — aguarda `Retry-After` segundos (default `5`) e tenta novamente **uma** vez.
5. Em outras falhas — grava `enrichmentStatus = FAILED` e reagenda **uma** retentativa após `5 minutos`.

Timeout HTTP: `8s`.

---

## Variáveis de ambiente

| Variável                | Obrigatória | Default | Descrição                                        |
| ----------------------- | ----------- | ------- | ------------------------------------------------ |
| `PORT`                  | não         | `3001`  | Porta de escuta do Express.                      |
| `DATABASE_URL`          | sim         | —       | Connection string do Postgres (Prisma).          |
| `NUTRICAO_API_BASE_URL` | sim         | —       | Base URL da API externa Nutrição 360.            |
| `NUTRICAO_API_KEY`      | sim         | —       | Enviada no header `x-api-key`.                   |
| `ADMIN_EMAIL`           | sim         | —       | E-mail do administrador (case-insensitive).      |
| `ADMIN_PASSWORD_HASH`   | sim         | —       | Hash bcrypt da senha do administrador.           |
| `JWT_SECRET`            | sim         | —       | Segredo HMAC para assinar/validar JWTs.          |
| `JWT_EXPIRES_IN`        | não         | `24h`   | Validade do JWT (formato aceito por `jsonwebtoken`). |
