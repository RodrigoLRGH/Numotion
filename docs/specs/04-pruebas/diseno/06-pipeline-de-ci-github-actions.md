# Pipeline de CI/CD (GitHub Actions)

## 1. Workflows

| Workflow | Disparador | Jobs |
|---|---|---|
| `ci.yml` | PR y push a `main` | secretos → lint/typecheck → unit → db → api → e2e → build |
| `perf-smoke.yml` | PR con cambios en `apps/api/src/modules/alumno/**`, `core/adaptive/**` | k6 corto contra entorno efímero |
| `deploy.yml` | push a `main` (dev), tag `v*` (staging → prod con aprobación manual) | migraciones → API → SPA → smoke |
| `nightly.yml` | cron diario | k6 completo en staging, axe completo, `npm audit`/osv-scanner |

## 2. `ci.yml`
```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  secretos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} }

  calidad:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint          # incluye eslint-plugin-boundaries (docente ↮ alumno)
      - run: pnpm typecheck
      - run: pnpm test --coverage   # P-UNIT-*, P-COMP-*, P-ROUTE-*, P-INT-*
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage }

  db:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get update && sudo apt-get install -y postgresql-client libtap-parser-sourcehandler-pgtap-perl
      - run: ./db/scripts/install-pgtap.sh        # instala extensión pgtap en el contenedor
      - run: ./db/scripts/migrate.sh && psql "$URL" -f db/seed/test_fixture.sql
      - run: pg_prove -d "$URL" db/tests/*.sql    # P-DB-*
    env: { URL: postgres://postgres:postgres@localhost:5432/postgres }

  api:
    needs: [calidad, db]
    runs-on: ubuntu-latest
    services: { postgres: { image: postgres:16, env: { POSTGRES_PASSWORD: postgres }, ports: ['5432:5432'] } }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: ./db/scripts/migrate.sh
      - run: pnpm --filter api test:integration   # P-API-*, P-SEC-*
        env: { REKOGNITION_MODE: mock, OPENAI_MODE: mock }

  e2e:
    needs: [api]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: docker compose -f docker-compose.test.yml up -d --wait   # db + api(mock IA) + web
      - run: pnpm test:e2e      # P-E2E-*, P-A11Y-01 (Chromium con cámara falsa)
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: playwright-report }

  build:
    needs: [calidad]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile && pnpm build
      - run: pnpm --filter web size-limit     # bundle alumno ≤ 250 KB gzip
```

## 3. Reglas de protección de `main`
- Requeridos: `secretos`, `calidad`, `db`, `api`, `e2e`, `build`.
- 1 aprobación; sin push directo; historial lineal.
- Cobertura mínima (`core/**` 90 %) como umbral en `vitest.config.ts` (falla el job).

## 4. Despliegue (`deploy.yml`, RC-02)
1. Autenticación a AWS por OIDC (`aws-actions/configure-aws-credentials`, sin claves estáticas).
2. Migraciones con el rol `numotion_owner` (job aislado, bloqueante).
3. API: imagen a ECR → App Runner / ECS.
4. SPA: `aws s3 sync dist/ s3://…` + invalidación de CloudFront.
5. Smoke: `GET /api/v1/health`, login de docente de prueba, cabeceras HSTS/CSP (P-SEC-05).
6. Producción requiere aprobación manual en el *environment* `prod`.
