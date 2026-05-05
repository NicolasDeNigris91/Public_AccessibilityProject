# Euthus — Auditoria de Qualidade

> **Status:** proposta para revisão. Nenhuma alteração de código foi feita nesta sessão.
> **Data:** 2026-05-04
> **Escopo:** monorepo `web-accessibility-tool` em `master` (commit `601b5a2`).

## Sumário executivo

| #   | Dimensão                      | Nota    | Tendência                                                                                    |
| --- | ----------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| 1   | Testes                        | 2.5     | Núcleo puro bem testado; worker e e2e ausentes.                                              |
| 2   | Observabilidade               | 1.5     | Logs estruturados ok; sem métricas, sem tracing, sem SLO.                                    |
| 3   | Confiabilidade                | 3.0     | Worker resiliente; API sem graceful shutdown; sem DLQ explícita.                             |
| 4   | Segurança                     | 3.0     | SSRF defesa em 3 camadas; CSP desligado global; sem SCA/secret-scan.                         |
| 5   | Performance                   | 2.5     | Browser reusado; sem context isolation; sem Lighthouse; sem CWV.                             |
| 6   | Acessibilidade do próprio app | 2.0     | Estrutura ok, mas axe/pa11y não rodam no CI da própria ferramenta.                           |
| 7   | DX / qualidade de código      | 2.0     | TS strict; `noUncheckedIndexedAccess` off; sem hooks, sem commitlint, lint backend quebrado. |
| 8   | Documentação / onboarding     | 3.0     | README/ARCHITECTURE/SECURITY sólidos; sem ADRs nem runbooks.                                 |
| 9   | Release / deploy              | 2.0     | Sem preview envs; sem migration framework; sem rollback documentado.                         |
|     | **Média ponderada**           | **2.4** | Base arquitetural acima da média de portfolio; falta camada de produção.                     |

**Leitura geral.** Este projeto já fez o trabalho difícil que a maioria dos projetos pula: arquitetura limpa com `domain/` puro, propagação de `requestId` HTTP→fila→worker, idempotência via `jobId = publicId`, três camadas de defesa anti-SSRF, contêineres não-root, `helmet`, `rate-limit`, `mongodb-memory-server` para integração com Mongo real (não mock), CodeQL e Dependabot. Isso é raro num projeto de portfolio.

O que falta é a **camada de produção endurecida**: métricas e tracing, e2e do fluxo crítico, mutation testing no scoring, secret-scanning, runbooks, axe rodando no próprio frontend, e endurecimento incremental de SSRF (DNS-rebinding) e CSP (escopada por rota). Essas lacunas são individualmente pequenas; juntas separam um projeto "bom" de um "classe-mundial".

---

## 1. Testes — 2.5/5

### Estado atual

| Camada   | Tipo              | Arquivos | Observação                                                  |
| -------- | ----------------- | -------- | ----------------------------------------------------------- |
| Backend  | Unit (puro)       | 4        | scoring, axeResult, urlSafety, assertSafeUrl                |
| Backend  | Unit middlewares  | 2        | requestId, clientId                                         |
| Backend  | Unit rota (mocks) | 1        | audits.test.ts                                              |
| Backend  | Integration       | 1        | audits.integration.test.ts (mongo in-memory, queue mockada) |
| Frontend | Unit (RTL)        | 11       | UI primitivos + lib + report cards + error boundary         |
| Worker   | —                 | **0**    | nenhum teste                                                |
| E2E      | —                 | **0**    | nenhum                                                      |
| Mutation | —                 | **0**    | nenhum                                                      |
| Contract | —                 | **0**    | OpenAPI existe mas não é validado                           |

Cobertura real não é medida (`collectCoverageFrom` está no jest config mas `--coverage` não roda no CI; sem threshold).

### Top-3 lacunas

1. **Worker sem cobertura.** [auditWorker.ts](backend/src/workers/auditWorker.ts) é o coração do produto e não tem nenhum teste. Falhas reais de Puppeteer (crash, hang, redirect malicioso, axe injection) só aparecem em produção. **(M)**
2. **Sem e2e do golden path** "submeter URL → polling → ver score". O fluxo que o usuário paga para ter funcionando é o único sem teste automatizado. **(M)**
3. **Sem mutation testing no scoring.** [scoring.ts](backend/src/domain/scoring.ts) é uma fórmula de penalidade — exatamente o tipo de código onde `>` vs `>=` ou `Math.max(0, ...)` invertido passa por testes verdes. Stryker ≥80% mutation score é o gate certo. **(S)**

### Lacunas secundárias (já observadas, vão para Fase 1/2)

- Integration tests cobrem só Mongo; Redis/BullMQ ainda mockados. Subir Redis com testcontainers fecha o gap.
- Sem contract tests do OpenAPI vs frontend `apiFetch`.
- `coverage threshold` não falha o CI se cair.
- `audits.test.ts` mocka `AuditModel` e duplica cenários do integration test — manter um, eliminar o outro.

---

## 2. Observabilidade — 1.5/5

### Estado atual

- ✅ Logs estruturados pino com `requestId` propagado HTTP → BullMQ job → worker.
- ✅ `/health` (liveness) e `/ready` (Mongo + Redis ping em paralelo).
- ❌ **Sem `/metrics`.** Nenhuma série temporal de latência HTTP, profundidade da fila, duração de auditoria, taxa de falha do Puppeteer.
- ❌ **Sem OpenTelemetry.** Não dá para seguir uma submissão de URL pelo grafo.
- ❌ **Sem dashboard nem SLO.** "p95 da auditoria" e "uptime da API" não são números observáveis hoje.
- ⚠️ `durationMs` é gravado por documento, não exposto como métrica.

### Top-3 lacunas

1. **Métricas Prometheus em `/metrics`** com: `http_request_duration_seconds`, `audit_queue_depth`, `audit_duration_seconds` (histogram), `audit_failure_total{reason}`, `puppeteer_browser_relaunch_total`. Um `prom-client` no api e no worker fecha o gap. **(M)**
2. **OpenTelemetry ponta-a-ponta** (auto-instrumentation em express + ioredis + mongoose, manual span no `runAudit`). Hoje o `requestId` resolve correlação, mas não é um trace OTLP. **(M)**
3. **SLOs definidos por escrito** com error budget: ex. _p95 audit duration ≤ 30 s_ sobre URLs ≤ 2 MB; _API availability ≥ 99,5%_; _queue lag p95 ≤ 60 s_. Sem SLO, "está bom" é vibe. **(S)**

---

## 3. Confiabilidade — 3.0/5

### Estado atual

- ✅ BullMQ: `attempts: 2`, backoff exponencial 5 s, `removeOnComplete`/`removeOnFail` configurados.
- ✅ Idempotência: `jobId = publicId`.
- ✅ `page.goto(...)` com `AUDIT_TIMEOUT_MS`.
- ✅ Worker: graceful shutdown com `drainWithTimeout(25s)` + force close + browser close + mongoose disconnect.
- ✅ Browser disconnect listener relança no próximo job.
- ✅ `/ready` reflete Mongo + Redis.
- ❌ **API sem graceful shutdown.** [server.ts](backend/src/server.ts) não escuta SIGTERM; em deploy o Express é morto sem `server.close()` nem disconnect, e a `pingMongo` no `/ready` continua passando até o último ms.
- ❌ **Sem DLQ explícita.** Jobs falhados ficam 24 h em `failed` e somem; ninguém é alertado nem replaya.
- ❌ **Sem circuit breaker** no Puppeteer. Se Chromium ficar pinning CPU em 5 jobs seguidos, o worker continua aceitando.
- ⚠️ `/ready` não considera a fila (Redis OK ≠ fila funcional; `auditQueue.client.ping()` seria mais honesto).

### Top-3 lacunas

1. **Graceful shutdown na API** (SIGTERM → parar de aceitar conexões → drenar in-flight → fechar Mongo). Hoje deploys derrubam requests no meio. **(S)**
2. **DLQ + alerta**: mover jobs após N falhas para `audits-dead` (queue separada) + métrica `audit_dead_letter_total` + endpoint `/admin/queues/dead` (Bull-Board protegido). **(M)**
3. **Circuit breaker no `getBrowser()`**: se ≥3 falhas consecutivas em 60 s, marcar worker `not-ready` por 30 s e relançar browser. **(S)**

---

## 4. Segurança — 3.0/5

### Estado atual

- ✅ **SSRF em 3 camadas** ([assertSafeUrl.ts](backend/src/application/assertSafeUrl.ts), [urlSafety.ts](backend/src/domain/urlSafety.ts), [auditWorker.ts:54-66](backend/src/workers/auditWorker.ts#L54-L66)): protocolo http(s), DNS resolve no intake bloqueando ranges não-unicast (`ipaddr.js`), re-check antes do `page.goto`, `setRequestInterception` aborta subrequests para IP literal privado.
- ✅ Body limit 32 KB, `helmet`, rate-limit 30/min, `trust proxy` configurável.
- ✅ Contêineres rodam como não-root (worker = `pptruser`; api = `app`).
- ✅ `ViolationCard` **não renderiza** o `node.html` capturado da página auditada — XSS armazenado evitado.
- ✅ CodeQL com `security-and-quality` + Dependabot semanal.
- ❌ **DNS rebinding**: o intake DNS check e o re-check do worker não pinam o IP usado na conexão TCP. Janela TOCTOU permanece — resolver → conectar é por hostname. Mitigação parcial (interceptor de subrequest), mas a primeira navegação é vulnerável. **(M)**
- ❌ **CSP global desligado** em [server.ts:34-37](backend/src/server.ts#L34-L37) (`contentSecurityPolicy: false`) só para o Swagger funcionar. Isso desliga CSP para `/api/audits` também. Solução: CSP apertada em todas as rotas, override só para `/docs`. **(S)**
- ❌ **Sem secret scanning** (gitleaks/trufflehog) no CI nem no commit hook.
- ❌ **Sem SCA** (`npm audit --production` ou OSV-Scanner) gating no PR.
- ⚠️ Rate limit por IP é facilmente burlado por X-Client-Id rotativo + IPs partilhados (NAT). Falta rate-limit por `clientId` na fila.
- ⚠️ Frontend Next.js sem `headers()` em `next.config` para CSP/HSTS/Referrer-Policy.
- ⚠️ Endpoint `GET /api/audits/:publicId` é público por design (URLs compartilháveis), mas isso vaza a URL auditada para qualquer um que adivinhe o UUID v4 — risco baixo, mas vale documentar como decisão consciente.

### Top-3 lacunas

1. **DNS rebinding hardening**: resolver, validar IP, conectar pelo IP (`lookup` custom no agent HTTP/Puppeteer) com `Host` header preservado. Ou: re-resolver no worker e abortar se IP mudou em < 60 s. **(M)**
2. **CSP escopada por rota**: helmet com CSP estrita default, `app.use("/docs", helmet({contentSecurityPolicy:false}))` antes do swagger. **(S)**
3. **Pipeline de segurança no PR**: gitleaks + OSV-Scanner + `npm audit --production --audit-level=high` como steps que falham o PR. **(S)**

---

## 5. Performance — 2.5/5

### Estado atual

- ✅ Browser singleton reusado entre jobs ([auditWorker.ts:19-41](backend/src/workers/auditWorker.ts#L19-L41)).
- ✅ Page é fechada após cada job (sem leak de memória por página).
- ✅ Índice Mongo `{ clientId: 1, createdAt: -1 }` cobre `GET /api/audits`.
- ❌ **Sem isolation por job**: páginas compartilham `BrowserContext` default → cookies, localStorage, service workers persistem entre auditorias. Use `browser.createBrowserContext()` por job e descarte ao final.
- ❌ **Sem Lighthouse CI** no PR. Core Web Vitals do próprio Euthus não são medidos.
- ❌ **Sem bundle analyzer**. `next build` produz output, mas regressões de tamanho passam despercebidas.
- ⚠️ `concurrency: env.MAX_CONCURRENT_AUDITS` (default 2) abre N pages no mesmo Browser; não há cap de memória por audit.
- ⚠️ Cold start: `puppeteer.launch` no primeiro job pode levar 2-3 s e é cobrado pelo cliente.

### Top-3 lacunas

1. **Isolation por job via `BrowserContext`** + warmup do browser no boot. Fecha leak de estado e elimina cold start do primeiro job. **(S)**
2. **Lighthouse CI** rodando contra `frontend` no PR, com budget para Performance ≥ 90, A11y ≥ 95, BP ≥ 90, SEO ≥ 90. **(S)**
3. **Bundle analyzer** + budget no `next.config.js` (warn se rota client-side > 200 KB gzipped). **(S)**

---

## 6. Acessibilidade do próprio Euthus — 2.0/5

### Estado atual

- ✅ `lang="pt-BR"`, `SkipLink`, focus management em navegação ([page.tsx:27-29](frontend/src/app/audits/%5Bid%5D/page.tsx#L27-L29)), `ColorBlindToggle`, `ThemeToggle`.
- ✅ `AxeDev` carrega `@axe-core/react` em dev — útil em desenvolvimento local.
- ❌ **Não roda axe nem pa11y no CI.** É a maior ironia do produto: a ferramenta que vende auditoria de a11y não bloqueia PR com violações novas no próprio frontend.
- ❌ **Sem teste automatizado de contraste** nos componentes (Badge, Button) — apenas presença de tokens Tailwind.
- ❌ **`@axe-core/react` é optional dep** com `import("@axe-core/react" as string)` — onboarding silenciosamente sem axe se alguém esquecer de instalar.

### Top-3 lacunas

1. **`pa11y-ci` ou `@axe-core/playwright` no CI** rodando contra preview build do Next, com baseline. PR que introduzir violação nova falha. **(M)**
2. **Auditoria manual de WCAG 2.2 AA** completa, com checklist em `docs/A11Y-AUDIT.md`. Para uma ferramenta de a11y, não é razoável estar abaixo de AA. AAA é objetivo, mas declare o atual. **(M)**
3. **`@axe-core/react` como devDependency normal** (não optional), e adicionar teste RTL com `jest-axe` em pelo menos os componentes com interação (Button, Input, Badge, Logo). **(S)**

---

## 7. DX / qualidade de código — 2.0/5

### Estado atual

- ✅ TS `strict: true` em backend e frontend.
- ✅ Workspaces npm; CI com cache de deps.
- ✅ PR template detalhado.
- ❌ **`noUncheckedIndexedAccess: false`** em ambos. `arr[0]` sempre tipado como `T` mesmo quando `undefined` é possível. Liga isso e o TS encontra bugs reais.
- ❌ **Lint do backend quebrado**: [package.json:11](backend/package.json#L11) tem `"lint": "eslint src --ext .ts"` mas ESLint não está nas devDependencies e não há `.eslintrc`. `npm run lint --workspace backend` falha.
- ❌ **Sem Husky / lint-staged / commitlint.** Conventional Commits está em CONTRIBUTING.md mas ninguém valida.
- ❌ **Sem Prettier** (nem config, nem step de CI).
- ❌ **CI não roda lint**, só typecheck + test.
- ❌ **Sem changesets** (versionamento manual).
- ⚠️ Há duplicação entre [audits.test.ts](backend/src/interfaces/http/routes/audits.test.ts) (mocks) e [audits.integration.test.ts](backend/src/interfaces/http/routes/audits.integration.test.ts) (in-memory). Mantenha o integration; remova o mock-pesado.
- ⚠️ Tempo de CI: backend baixa mongod ~780 MB no primeiro run; cache mitiga, mas é por OS e expira.

### Top-3 lacunas

1. **Husky + lint-staged + commitlint + Prettier**, e `eslint --max-warnings=0` como step do CI. **(S)**
2. **Consertar lint do backend**: instalar `eslint`, `@typescript-eslint/{parser,eslint-plugin}`, criar `.eslintrc.cjs` com extends `eslint:recommended` + `plugin:@typescript-eslint/recommended-type-checked`. **(S)**
3. **Endurecer `tsconfig`**: `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `noImplicitOverride: true` em ambos os workspaces. Espere 5-15 erros novos para corrigir. **(M)**

---

## 8. Documentação / onboarding — 3.0/5

### Estado atual

- ✅ README, ARCHITECTURE.md, ROADMAP.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, ISSUE_TEMPLATEs, PR_TEMPLATE.
- ✅ Swagger em `/docs` + `/openapi.json`.
- ✅ ARCHITECTURE.md descreve fluxo, processos e modos de falha.
- ❌ **Sem ADRs.** Decisões como "clean architecture", "BullMQ vs SQS", "Mongo vs Postgres", "publicId UUID público" não estão registradas como ADRs.
- ❌ **Sem runbooks**. "Worker travado", "fila cheia", "Puppeteer crashloop", "Mongo migration", "Railway deploy travou" precisam ser passos numerados em `docs/runbooks/`.
- ❌ ARCHITECTURE.md tem diagrama ASCII; não há Mermaid renderizado no GitHub.
- ⚠️ Onboarding de contribuidor é bom; falta checklist "subi o ambiente em < 10 min" para validar que README está correto.

### Top-3 lacunas

1. **`docs/runbooks/`** com 4 runbooks iniciais: `worker-stuck.md`, `queue-overflow.md`, `puppeteer-crashloop.md`, `mongo-migration.md`. **(M)**
2. **ADRs em `docs/adr/`** — 5 iniciais cobrindo: clean arch, BullMQ, MongoDB, publicId público, SSRF policy. Formato Nygard. **(M)**
3. **Mermaid no ARCHITECTURE.md** substituindo o ASCII (renderiza no GitHub). **(S)**

---

## 9. Release / deploy — 2.0/5

### Estado atual

- ✅ Railway: 5 serviços documentados (api, worker, frontend, mongo, redis).
- ✅ docker-compose para dev local.
- ✅ Dockerfile multi-stage; worker usa imagem oficial `puppeteer/puppeteer`.
- ✅ `autoIndex: false` em produção; `syncIndexes()` no boot da API.
- ❌ **Sem preview environments por PR** no Railway.
- ❌ **Sem framework de migração**: mudança de schema do Mongo é "deploy e reza". `migrate-mongo` ou similar ausente.
- ❌ **Sem rollback documentado**. "Subiu uma regressão, e agora?" não está escrito.
- ⚠️ Sem changelog automático nem tag de release.
- ⚠️ `ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` no Dockerfile da api é dead code (api não usa Puppeteer); limpar reduz superfície.

### Top-3 lacunas

1. **PR preview env no Railway** (`railway.json` + GitHub Action que cria/destrói env por PR). **(M)**
2. **`migrate-mongo`** (ou similar) com migrations versionadas em `backend/migrations/` + step de CI/deploy. **(M)**
3. **`docs/runbooks/rollback.md`** com passos exatos (Railway revert, Mongo restore point, queue drain). **(S)**

---

## Plano em fases (proposta)

> Cada fase é um marco aprovável independentemente. Quando você aprovar uma fase, eu uso `superpowers:writing-plans` para gerar o plano tático bite-sized (TDD, 1 commit por sub-tarefa).

### Fase 0 — Quick wins (2 dias, opcional antes da Fase 1)

**Objetivo:** parar a sangria. Coisas pequenas que estão quebradas ou inconsistentes hoje.

**Escopo:**

- Consertar `npm run lint --workspace backend` (instalar ESLint, criar `.eslintrc`).
- Escopar `helmet` CSP só ao `/docs`, ligar CSP padrão no resto.
- Remover dead code do Dockerfile da api (Puppeteer envs).
- API: SIGTERM → `server.close()` + `mongoose.disconnect()` + `redisConnection.quit()`.
- Frontend: `headers()` no `next.config.js` com CSP, HSTS, Referrer-Policy, X-Content-Type-Options.

**Critérios de saída (mensuráveis):**

- [ ] `npm run lint` passa em ambos os workspaces, zero warnings.
- [ ] `curl -s -I https://accessibility.nicolaspilegidenigris.dev | grep -i 'content-security-policy'` retorna header.
- [ ] `kill -TERM $apiPid` faz API drenar em ≤ 10 s e sair com código 0 (medido por log).
- [ ] `securityheaders.com` para o frontend dá nota A ou superior.

---

### Fase 1 — Fundação (1-2 semanas)

**Objetivo:** elevar o piso de qualidade de código e cobertura. Tudo que protege a equipe de regressões silenciosas, sem ainda mexer em arquitetura.

**Escopo:**

1. **DX**: Husky, lint-staged, commitlint (Conventional Commits), Prettier, `eslint --max-warnings=0` no CI, lint step no CI.
2. **TS apertado**: `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` em ambos os workspaces. Corrigir os erros que aparecerem.
3. **Worker testado**: extrair função pura `runAudit(page, axeSource)` (já está parcialmente puro via `buildAuditResult`), criar fixture HTML com violações conhecidas, teste integração com Puppeteer headless contra `file://` ou static server local. Cobrir crash, timeout, redirect malicioso, axe-injection.
4. **E2E golden path** com Playwright: subir docker-compose em CI service, submeter URL, esperar `done`, ver score na UI.
5. **Mutation testing** com Stryker em `backend/src/domain/scoring.ts` e `backend/src/domain/urlSafety.ts`. Threshold inicial 75%, alvo 85%.
6. **Coverage gate** no Jest: backend ≥ 80% lines / 75% branches; frontend ≥ 70% lines.
7. **Contract tests**: openapi-typescript gera tipos do `/openapi.json`; frontend `apiFetch` consome esses tipos; teste verifica conformidade do response shape.
8. **A11y do próprio app**: `@axe-core/playwright` no e2e do golden path, falha no CI se violações `serious`/`critical` aparecerem.
9. **SCA + secret scan no PR**: gitleaks-action + osv-scanner-action.
10. **Lighthouse CI** com budget contra build de preview do frontend.

**Critérios de saída:**

- [ ] CI roda em ≤ 6 min (com cache quente).
- [ ] `npm run lint && npm test` passa com cobertura ≥ thresholds em ambos.
- [ ] `npx stryker run` no backend dá mutation score ≥ 75% em `domain/`.
- [ ] Playwright e2e do golden path verde no CI.
- [ ] CI inclui steps `gitleaks`, `osv-scanner`, `lighthouse-ci`, `axe-playwright` — todos como required checks no branch protection.
- [ ] `tsc --noEmit` passa com `noUncheckedIndexedAccess: true`.
- [ ] Worker tem ≥ 5 testes cobrindo: happy path, timeout, crash, SSRF runtime, redirect malicioso.
- [ ] PR aberto sem `feat:` ou similar é rejeitado pelo commitlint.

---

### Fase 2 — Observabilidade + segurança (1-2 semanas)

**Objetivo:** tornar o sistema legível em produção e fechar os vetores de segurança restantes.

**Escopo:**

1. **`/metrics`** com `prom-client` em api + worker. Métricas:
   - api: `http_request_duration_seconds{route,method,status}`, `audits_enqueued_total`.
   - worker: `audit_duration_seconds` (histogram, buckets 1,5,10,30,60), `audit_failure_total{reason}`, `puppeteer_browser_relaunch_total`, `audit_in_flight`, `audit_queue_depth` (lido de `auditQueue.getJobCounts()`).
2. **OpenTelemetry**: auto-instrumentation Node SDK; manual span `audit.run` no worker; OTLP exporter (configurável). Trace de uma submissão atravessa api → bull → worker.
3. **`/ready` queue-aware**: incluir `await auditQueue.getJobCounts()` (rejeita se `wait+active` > N).
4. **DLQ**: `audits-dead` queue separada; `worker.on('failed')` move job após N tentativas; `audit_dead_letter_total` métrica.
5. **Bull-Board** em `/admin/queues` protegido por basic auth.
6. **SLOs documentados** em `docs/SLO.md`: 3 SLOs com error budget e janelas, alinhados com métricas que existem.
7. **Dashboard Grafana** versionado em `docs/grafana/euthus.json`.
8. **DNS rebinding hardening**: HTTP/HTTPS agent custom no axios/undici que faz `dns.lookup` e abre socket pelo IP, mantendo Host header. Aplicado também ao Puppeteer via `--host-resolver-rules` ou pré-resolve.
9. **Per-clientId rate limit**: além do rate-limit por IP, contar submissões por `clientId` em Redis (sliding window).
10. **Rate-limit do `POST /api/audits` mais apertado** (default 30/min é generoso para uma operação que custa um Chromium): 10/min por IP, 30/h por clientId.
11. **Runbooks** em `docs/runbooks/`: worker-stuck, queue-overflow, puppeteer-crashloop, dlq-replay, dns-rebinding-incident.

**Critérios de saída:**

- [ ] `curl /metrics` no api e worker retorna ≥ 8 métricas custom úteis.
- [ ] Trace OTLP visível em Jaeger local cobrindo api → fila → worker numa submissão.
- [ ] DLQ tem replay manual via Bull-Board e contagem em métrica.
- [ ] `docs/SLO.md` define ≥ 3 SLOs com janelas e budget.
- [ ] Teste anti-rebinding: com servidor de teste que retorna `1.2.3.4` no primeiro DNS e `127.0.0.1` no segundo, intake aceita mas conexão é abortada.
- [ ] 5 runbooks em `docs/runbooks/`, cada um com "Sintomas / Diagnóstico / Mitigação / Postmortem".
- [ ] CodeQL queries customizadas para SSRF + path traversal habilitadas.

---

### Fase 3 — Performance + polish (1 semana)

**Objetivo:** terminar de polir. A maioria já é hygiene factors.

**Escopo:**

1. **`BrowserContext` por job** com warmup do browser no boot.
2. **`migrate-mongo`** com 1 migration baseline.
3. **PR preview environments** no Railway via GitHub Action.
4. **ADRs** em `docs/adr/` — 5 iniciais (clean arch, BullMQ, MongoDB, publicId público, SSRF policy).
5. **Mermaid** no ARCHITECTURE.md (substituindo ASCII), com 2 diagramas (deployment + sequência de uma audit).
6. **Bundle budget**: `next.config.js` warn quando rota client > 200 KB gzipped; CI verifica.
7. **Mutation testing expandido**: Stryker em `axeResult.ts`, `assertSafeUrl.ts`. Threshold ≥ 80%.
8. **Auditoria manual WCAG 2.2 AA** documentada em `docs/A11Y-AUDIT.md` com lista de itens passados/falhados/N/A; meta de fechar gaps AA.
9. **Changesets** para versionamento (mesmo em monorepo privado, força changelog).
10. **`docs/runbooks/rollback.md`** com passos Railway + Mongo + drenagem de fila.

**Critérios de saída:**

- [ ] Cada job de auditoria roda em `BrowserContext` próprio; teste valida que cookie setado no job 1 não é visto pelo job 2.
- [ ] `npm run migrate:up` aplica migrations baseline em CI; falha no PR se migration faltar.
- [ ] PR aberto cria preview env no Railway acessível via comentário do bot; merge/close destrói.
- [ ] 5 ADRs em `docs/adr/`, cada um ≤ 1 página, formato Nygard.
- [ ] ARCHITECTURE.md tem ≥ 2 diagramas Mermaid renderizando no GitHub.
- [ ] Stryker mutation score ≥ 80% no `domain/` inteiro.
- [ ] `docs/A11Y-AUDIT.md` cobre todas as 50 success criteria do WCAG 2.2 AA com status.
- [ ] Cada PR tem changelog entry via `changeset add` (validado por CI).

---

## Próximos passos para você

1. **Ler este documento e marcar:** o que concorda, o que tira, o que adiciona, o que repriora.
2. **Decidir Fase 0:** quer fazer ou pular direto pra Fase 1? Fase 0 são correções de coisas quebradas (lint do backend, CSP global, SIGTERM da API). Recomendo fazer.
3. **Aprovar uma fase de cada vez.** Quando aprovar, eu chamo `superpowers:writing-plans` para gerar o plano tático bite-sized dela, com TDD e commits frequentes, em `docs/superpowers/plans/<fase>.md` (ou outro caminho que você prefira).

### Decisões que preciso de você antes de Fase 1

- **Coverage thresholds** finais (sugestão: backend 80/75, frontend 70). OK?
- **Mutation score threshold** inicial (sugestão: 75%, alvo 85%). OK?
- **Stack do dashboard de obs.**: Grafana Cloud free? self-hosted? Skip e ficar só com `/metrics` cru? (Afeta Fase 2.)
- **Tracing destination**: Honeycomb / Tempo / Jaeger local? (Afeta Fase 2.)
- **WCAG target oficial:** AA é o realista. Você quer prometer AAA ou ficar honesto em AA? (Afeta copy/marketing além da Fase 3.)
