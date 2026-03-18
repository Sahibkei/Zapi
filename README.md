# Zapi

Zapi is a live-pull, zero-persistence fundamentals API. It fetches filing-derived data on demand, normalizes it into a stable contract, and returns either machine-first JSON or a Morningstar-style matrix response.

## MVP scope

- SEC EDGAR live adapter using official EDGAR JSON endpoints
- Beta non-US adapters for UK, Japan, and India via public market-statement fallback
- Annual and quarterly statements for `income_statement`, `balance_sheet`, and `cash_flow`
- Optional TTM assembly for duration statements
- `restated` and `as_reported` filing views
- Plan-aware auth and in-memory rate limiting
- Normalized JSON and matrix output formats
- API landing page, OpenAPI docs, and health endpoint
- Deterministic contract tests with SEC fixtures

## Project phases

1. Foundation: repo bootstrap, canonical schema, SEC adapter, HTTP API, docs page
2. Contract hardening: broader metric coverage, statement detection, validation, regression fixtures
3. Expansion: quarterly, TTM, sector-aware row trees, as-reported support
4. Federation: Companies House, EDINET, India placeholder, auth, rate limits, observability
5. Site integration: connect your main site to the normalized JSON and matrix endpoints

## Run locally

```bash
npm install
npm run dev
```

Server defaults:

- Base URL: `http://localhost:3000`
- OpenAPI docs: `http://localhost:3000/docs`
- Landing page: `http://localhost:3000/`
- Auth and plans page: `http://localhost:3000/auth`
- Regime status: `http://localhost:3000/v1/regimes`
- Auth status: `http://localhost:3000/v1/auth/status`

Optional environment variables:

- `PORT`: API port, default `3000`
- `HOST`: bind host, default `0.0.0.0`
- `SEC_USER_AGENT`: contact string for SEC requests. Replace the placeholder before production use.
- `COMPANIES_HOUSE_API_KEY`: optional for now; will be required when the official UK filing parser is added
- `EDINET_API_KEY`: optional for now; will be required when the official Japan filing parser is added
- `ZAPI_JWT_SECRET`: shared secret for verifying site JWTs
- `ZAPI_JWT_ISSUER`: expected issuer for site JWTs, default `your-site`
- `ZAPI_JWT_AUDIENCE`: expected audience for site JWTs, default `zapi-api`
- `ZAPI_SERVICE_KEYS`: JSON object of backend service keys and assigned plans

## Example requests

```bash
curl "http://localhost:3000/v1/statements/AAPL?regime=sec_edgar&statement=income_statement&format=normalized"
curl "http://localhost:3000/v1/statements/AAPL?regime=sec_edgar&statement=income_statement&format=normalized&view=as_reported"
curl "http://localhost:3000/v1/statements/AAPL?regime=sec_edgar&statement=balance_sheet&format=matrix"
curl "http://localhost:3000/v1/statements/JPM?regime=sec_edgar&statement=income_statement&frequency=quarterly&format=normalized&periods=4&includeTtm=true"
curl "http://localhost:3000/v1/statements/00001995?regime=companies_house&statement=income_statement&format=normalized"
curl "http://localhost:3000/v1/statements/E00001?regime=edinet&statement=income_statement&format=normalized"
curl "http://localhost:3000/v1/regimes"
curl "http://localhost:3000/v1/auth/status"
```

Normalized responses are compact by default. Source trace data is returned only when `debug=true`.
`view=restated` picks the latest filed fact for a period. `view=as_reported` picks the earliest filed fact for that same period.
`regime=sec_edgar` is live with official SEC data.
`companies_house`, `edinet`, and `india_placeholder` now return beta non-US statement data via a public fallback source while official filing-parser integrations are still pending.

## Auth and plans

- `public`: anonymous access, SEC only, `60` requests/hour
- `free`: signed site user, SEC only, `250` requests/hour
- `pro`: paid plan, SEC plus UK and Japan access, `2500` requests/hour
- `scale`: highest plan, all configured regimes, `10000` requests/hour

Bearer tokens should be HS256 JWTs minted by your site backend. Required claims are `sub`, `plan`, `iss`, `aud`, and `exp`.

Statement responses include:

- `x-zapi-plan`
- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset`

## What still needs to be provided

- A production-quality `SEC_USER_AGENT` contact string
- Your GitHub auth so the local commits can be pushed to `origin`
- A deployment target later if you want this hosted independently from the main site
