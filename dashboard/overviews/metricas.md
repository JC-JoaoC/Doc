# 15 — Cálculo das Métricas

> Referência técnica de **como cada indicador do painel é calculado**: a fonte
> de dados, a fórmula exata e o arquivo onde vive a lógica. Serve de fonte de
> verdade para produto, engenharia e validação dos números.

---

## 0. Conceitos transversais

### 0.1 Período e "período anterior"
Todo overview recebe um intervalo `{from, to}` (datas `YYYY-MM-DD`). As variações
(deltas) comparam o período atual com o **período imediatamente anterior de mesma
duração em dias**.

`server/src/periodo.js`:
```
dias       = (to - from) em dias + 1
prevTo     = from - 1 dia
prevFrom   = prevTo - (dias - 1)
```
Ex.: `01/06–07/06` (7 dias) → anterior = `25/05–31/05`.

### 0.2 Tipos de variação (delta)
| Função | Fórmula | Uso | Unidade |
|---|---|---|---|
| `pctDelta(a,b)` | `round(1000·(a−b)/b)/10` | valores absolutos (qtd, valor, volume, tempo) | **%** (1 casa); `null` se `b=0` |
| `ppDelta(a,b)` | `round((a−b)·10)/10` | taxas/percentuais e pontos de NPS | **pontos** (p.p.), 1 casa |

Definidas em `server/src/queries.js`, `server/src/dc.js`, `server/src/nps.js`.

**Exemplos** (separador decimal por ponto; na tela aparece com vírgula):
- `pctDelta(120, 100)` = `round(1000·(120−100)/100)/10` = **+20.0 %**
- `pctDelta(90, 100)` = `round(1000·(−10)/100)/10` = **−10.0 %**
- `pctDelta(33, 0)` = **null** (sem base de comparação)
- `ppDelta(8.4, 9.1)` = `round((8.4−9.1)·10)/10` = **−0.7 p.p.**

### 0.3 Fontes de dados por aba
| Aba / indicador | Fonte primária | Caminho |
|---|---|---|
| Reembolsos & Retenção | Guru → MySQL (`orders`) | `/api/reembolsos/overview` |
| Atendimentos — SLA/Tempo/Volume | DataCrazy → MySQL (`dc_atendimentos`) | `/api/atendimentos/overview` |
| Atendimentos — CSAT | Supabase (`atendimentos`) | agregado no front |
| NPS | MySQL externo (`npsResponses`) | `/api/nps/overview` |
| CSAT Plano Alimentar | Postgres externo (`public."Response"`) | `/api/csat/plano/overview` |
| Prescrições | Supabase (RPC) ou mock | front |
| Análise Semântica (IA) | OpenRouter (proxy) | `/api/ai/insights` |

---

## 1. Reembolsos & Retenção
Fonte: `orders` (Guru). Lógica: `server/src/queries.js`. Mapeamento da Guru: `server/src/map.js`.

### 1.1 O que conta como venda e reembolso (`map.js`)
- **Venda aprovada** (`is_approved=1`): `status ∈ {approved, completed, paid}`. Data de referência: `approved_at` (`confirmed_at`, com fallback `ordered_at`).
- **Reembolso** (`is_refund=1`): `status ∈ {refunded, chargeback}`. Data de referência: `refunded_at` (`updated_at`, fallback `canceled_at`).
- **Valor do reembolso** (`refund_value`): o `payment.gross` da transação.
- **Motivo** (`refund_reason_code/text`): a Guru manda `payment.refund_reason` como código (1–34) ou texto livre. Texto livre é mapeado a um código por palavras‑chave (`codigoDeTextoLivre`); chargeback sem motivo recebe o código sintético **100**.

### 1.2 KPIs do período — Total e Ajustado
Calculados em `kpisPeriodo()`:

- **Vendas aprovadas** = `COUNT(orders WHERE is_approved=1 AND approved_at ∈ período)`.
- **Reembolsos Totais**: `qtd = COUNT`, `valor = SUM(refund_value)` sobre `is_refund=1 AND refunded_at ∈ período`.
- **Reembolsos Ajustados**: idem, **excluindo** motivos marcados como fora do controle da operação (`refund_reasons.excluded_in_adjusted = 1`). Ou seja, remove financeiro/remorso, saúde, administrativo e duplicidade.
- **Taxa de reembolso** (Total ou Ajustada):
  ```
  taxa = round(1000 · qtd_reembolsos / vendas_aprovadas) / 10   → % com 1 casa
  ```
  **Exemplo:** `2865` reembolsos sobre `25105` vendas aprovadas → `round(1000·2865/25105)/10 = round(114.1)/10` = **11.4 %**. Visão Ajustada com `1600` reembolsos → `round(1000·1600/25105)/10` = **6.4 %**.

> **Total vs. Ajustado**: a visão **Total** conta todos os reembolsos; a **Ajustada** desconta os motivos "não acionáveis" (flag `excluded_in_adjusted`), refletindo apenas o que a operação poderia ter evitado.

### 1.3 Variações (deltas)
Para cada bloco (Total/Ajustado), comparando com o período anterior:
- `deltaQtd` = `pctDelta(qtd)`, `deltaValor` = `pctDelta(valor)` → em %.
- `deltaTaxa` = `ppDelta(taxa)` → em pontos percentuais.

**Exemplo:** qtd atual `2865`, anterior `2600` → `deltaQtd = pctDelta(2865, 2600)` = `round(1000·265/2600)/10` = **+10.2 %**. Taxa atual `11.4 %`, anterior `10.8 %` → `deltaTaxa = ppDelta(11.4, 10.8)` = **+0.6 p.p.**

### 1.4 Principais Motivos (participação)
Agrupa reembolsos do período por código (ou texto livre quando não há código):
```
participação_do_motivo = round(1000 · qtd_motivo / total_reembolsos_do_período) / 10   → %
```
**Exemplo:** motivo "pessoais" (cód. 23) com `1055` ocorrências sobre `2865` reembolsos do período → `round(1000·1055/2865)/10` = **36.8 %**.

Cada motivo carrega `label`, `grupo` (categoria), `acao` (recomendada) e a flag
`excl` (excluído no Ajustado), vindos do dicionário `refund_reasons`.

### 1.5 Evolução das Taxas (12 meses)
Série mensal dos últimos 12 meses a partir de `to`. Para cada mês:
```
taxa_total(mês)    = round(100 · reembolsos_do_mês        / vendas_aprovadas_do_mês, 1)
taxa_ajustada(mês) = round(100 · reembolsos_ajustados_mês / vendas_aprovadas_do_mês, 1)
```
**Exemplo:** mês com `240` reembolsos e `2100` vendas aprovadas → `round(100·240/2100, 1)` = **11.4 %**.

Meses sem dado entram como `0`.

---

## 2. Atendimentos — Operação (SLA / Tempo / Volume)
Fonte: `dc_atendimentos` (DataCrazy). Coleta: `server/src/ingest-dc.js`. KPIs: `server/src/dc.js`.

> **Regra geral:** todas as métricas operacionais consideram **apenas conversas
> com atendente humano atribuído** (`attendant_name IS NOT NULL`). Atendimentos
> automáticos (sem atendente) são ignorados — incluí‑los distorceria o tempo e a
> taxa de SLA para ~0.

### 2.1 Campos derivados na coleta (`ingest-dc.js → derivarMensagens`)
Para cada conversa, sobre as mensagens não internas ordenadas por data:
- **1º contato** (`first_contact_at`): primeira mensagem **recebida** (do cliente).
- **1ª resposta humana** (`first_reply_at`): primeira mensagem **enviada** após o 1º contato.
- **Tempo de 1ª resposta** (`first_reply_minutes`):
  ```
  minutos = (first_reply_at − first_contact_at) / 60000   (2 casas)
  ```
- **Dentro do SLA** (`responded_within_sla`): `1` se `minutos ≤ SLA`, senão `0`. O SLA padrão é **15 min** (`DATACRAZY_SLA_MINUTES`).

**Exemplo:** 1º contato às `10:00:00` e 1ª resposta às `10:07:30` → `minutos = 450000/60000` = **7.5 min**; como `7.5 ≤ 15` → `responded_within_sla = 1`. Se a resposta fosse às `10:22:00` → **22 min**, `22 > 15` → `0`.

### 2.2 Volume
```
volume = COUNT(conversas com attendant_name no período)
```
Geral, por atendente e por departamento.

### 2.3 Taxa de SLA
Percentual de conversas (que tiveram 1ª resposta) respondidas dentro do SLA:
```
taxa_SLA = round(100 · SUM(responded_within_sla) / COUNT(responded_within_sla NÃO nulo), 1)
```
**Exemplo:** `180` conversas dentro do SLA de `230` que tiveram 1ª resposta → `round(100·180/230, 1)` = **78.3 %**.

Geral, por atendente e por departamento. Variação: `ppDelta` (pontos).

### 2.4 Tempo de 1ª resposta — MEDIANA
Usa-se a **mediana** (robusta a outliers), não a média. Implementada em SQL com
`ROW_NUMBER()`: ordena `first_reply_minutes` e tira a média dos elementos centrais.
```
mediana = AVG( valores nas posições FLOOR((n+1)/2) e FLOOR((n+2)/2) )
```
(n par → média dos 2 centrais; n ímpar → o central). Geral, por atendente e por
departamento. Variação: `pctDelta` (%).

**Exemplo:** tempos `[3, 5, 8, 12, 40]` (n=5, ímpar) → posições `FLOOR(6/2)=3` e `FLOOR(7/2)=3` → o 3º valor → **8.0 min** (a média seria `13.6`, distorcida pelo outlier `40`). Com `[3, 5, 8, 12]` (n=4, par) → posições 2 e 3 → `AVG(5, 8)` = **6.5 min**.

---

## 3. Atendimentos — CSAT
Fonte: tabela `atendimentos` do **Supabase**. Agregação no cliente: `app/src/features/atendimentos/api.ts`.

### 3.1 Conversão da nota
O CSAT vem como **texto** e é mapeado para 1–5:
| Texto | Nota |
|---|---|
| excelente | 5 |
| bom | 4 |
| regular | 3 |
| ruim | 2 |
| muito ruim | 1 |

### 3.2 CSAT geral e por atendente
```
CSAT_geral = média das notas (1–5) das respostas com CSAT no período
```
**Exemplo:** respostas `excelente, bom, excelente, regular, bom` → notas `[5, 4, 5, 3, 4]` → `21/5` = **4.2**.
Por atendente: um registro pode listar **vários atendentes** (`ultimo_atendente`
separado por vírgula); cada um é contado individualmente, agrupando por nome
normalizado (sem acento/maiúsculas/espaços duplicados). A nota do atendente é a
média das notas das conversas em que ele aparece.

### 3.3 Evolução
Média diária do CSAT (`avg(nota)` por dia, rótulo `DD/MM`).

### 3.4 Variação
`pctDelta` do CSAT geral vs. período anterior (mesma duração).

---

## 4. Atendimentos — KPIs combinadas do topo
Definidas em `app/src/pages/Atendimentos.tsx`:
- **Média por Atendente** = `volume_humano_total / nº de atendentes selecionados` (inteiro). **Ex.:** `480` atendimentos ÷ `6` atendentes = **80**.
- **CSAT Nutricionista** = **CSAT geral do Plano Alimentar** (reaproveita `csat.geral` da aba Prescrições — ver §6).

---

## 5. NPS
Fonte: `npsResponses` (MySQL externo). Lógica: `server/src/nps.js`.

### 5.1 Classificação por nota (0–10)
| Faixa | Classe |
|---|---|
| 9–10 | Promotor |
| 7–8 | Neutro |
| 0–6 | Detrator |

### 5.2 Índice NPS
```
NPS = round( 100 · promotores/total − 100 · detratores/total )
```
**Exemplo:** `total=200`, `promotores=120`, `detratores=30` → `100·120/200 − 100·30/200 = 60 − 15` = **45**.

Resultado de −100 a +100. **Meta** = `NPS_META` (padrão **70**).

### 5.3 Distribuição e respostas
- `% promotores / neutros / detratores` = `round(100 · classe / total)`. **Ex.:** `120` promotores de `200` → **60 %**.
- `respostas` = total de respostas no período.
- **Taxa de resposta** = `0` na base atual (não há denominador de envios disponível).

### 5.4 Evolução e variação
- **Evolução**: NPS por mês (`MM/AAAA`), com a linha de meta.
- **Variação** (`deltaGeral`): diferença em **pontos de NPS** vs. período anterior (`NPS_atual − NPS_anterior`). **Ex.:** `45 − 38` = **+7 pontos**.

### 5.5 Comentários (para IA)
Junta `comment` + `additionalFeedback` (descarta vazios), ordena pelos mais
recentes, prefixa a nota — entrada da análise semântica.

---

## 6. CSAT — Plano Alimentar (por Nutricionista)
Fonte: `public."Response"` (Postgres externo, Prisma). Lógica: `server/src/csat.js`.

### 6.1 Nota de cada resposta
A coluna `ratings` (jsonb) tem 5 dimensões 1–5: `clarity`, `routine`, `variety`,
`preferences`, `satisfaction`. A nota da resposta é a **média das dimensões**:
```
nota5 = AVG( valores numéricos de ratings )    (escala 1–5)
```
**Exemplo:** `ratings = {clarity:5, routine:4, variety:4, preferences:5, satisfaction:4}` → `(5+4+4+5+4)/5` = **4.4**.

### 6.2 Indicadores
- **CSAT geral** = `round(AVG(nota5), 2)` no período. **Ex.:** `nota5` de três respostas `[4.4, 4.0, 4.6]` → `round(13.0/3, 2)` = **4.33**.
- **Por nutricionista** = `AVG(nota5)` agrupado por `approvedBy.name` (o nutricionista que aprovou o plano; respostas sem nutricionista entram só no geral).
- **Recommend** = `AVG(recommend)` (0–10, estilo NPS) — indicador auxiliar. **Ex.:** `[9, 8, 10]` → **9.0**.
- **Por dimensão** = média de cada uma das 5 dimensões.
- **Evolução** = média semanal (`date_trunc('week', createdAt)`).
- **Variação** (`deltaGeral`) = `nota_atual − nota_anterior`, em **pontos da escala 1–5**. **Ex.:** `4.28 − 4.20` = **+0.08**.

### 6.3 Comentários (para IA)
Junta `liked` + `improve` (descarta vazios), ordena pelos mais recentes, prefixa
a nota — entrada da análise semântica do plano.

---

## 7. Prescrições
Fonte: RPC `rpc_prescricoes_overview` (Supabase, quando `VITE_PRESCRICOES_LIVE=true`)
ou **mock** (modo demo). O bloco **CSAT** vem sempre da API (§6). Lógica:
`app/src/features/prescricoes/api.ts`.

| Indicador | Cálculo |
|---|---|
| **Fases (preench./não preench./não abertos)** | contagens por fase (RPC) |
| **Evolução Temporal** | preenchimentos por semana (`fase1`/`fase2`) |
| **Subcategorias** | volume por subcategoria |
| **Produtividade** | por profissional: planos, suplementos, exames, tempo médio até agendamento |
| **CSAT (geral e por nutricionista)** | reaproveita `/api/csat/plano/overview` (§6) |

> Em modo demo os conjuntos são vazios — os gráficos só populam com a fonte real ligada.

---

## 8. Análise Semântica de Feedback (IA)
Não é uma métrica numérica, mas processa os comentários (NPS §5.5, CSAT plano §6.3,
CSAT atendimento §3) via OpenRouter (proxy `/api/ai/insights`). Saída: resumo
executivo + listas de elogios, críticas e sugestões. Detalhes do prompt em
`app/src/features/ai/api.ts` e `server/src/ai.js`.

---

## Rastreabilidade (onde cada cálculo vive)
| Métrica | Arquivo |
|---|---|
| Reembolsos (KPIs, motivos, evolução, deltas) | `server/src/queries.js` |
| Reembolso: o que é venda/refund/valor/motivo | `server/src/map.js` |
| Atendimentos: SLA/tempo/volume (agregação) | `server/src/dc.js` |
| Atendimentos: derivação 1º contato/1ª resposta/SLA | `server/src/ingest-dc.js` |
| CSAT atendimento (mapa texto→nota, médias) | `app/src/features/atendimentos/api.ts` |
| NPS | `server/src/nps.js` |
| CSAT plano alimentar | `server/src/csat.js` |
| Prescrições | `app/src/features/prescricoes/api.ts` |
| Período anterior / deltas | `server/src/periodo.js` (+ helpers em cada módulo) |
