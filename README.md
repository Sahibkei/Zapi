# Zapi

Zapi is a live-pull, zero-persistence fundamentals API. It fetches filing-derived data on demand, normalizes it into a stable contract, and returns either machine-first JSON or a Morningstar-style matrix response.

## MVP scope

- SEC-first adapter using official EDGAR JSON endpoints
- Annual and quarterly statements for `income_statement`, `balance_sheet`, and `cash_flow`
- Optional TTM assembly for duration statements
- `restated` and `as_reported` filing views
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

Optional environment variables:

- `PORT`: API port, default `3000`
- `HOST`: bind host, default `0.0.0.0`
- `SEC_USER_AGENT`: contact string for SEC requests. Replace the placeholder before production use.

## Example requests

```bash
curl "http://localhost:3000/v1/statements/AAPL?statement=income_statement&format=normalized"
curl "http://localhost:3000/v1/statements/AAPL?statement=income_statement&format=normalized&view=as_reported"
curl "http://localhost:3000/v1/statements/AAPL?statement=balance_sheet&format=matrix"
curl "http://localhost:3000/v1/statements/AAPL?statement=income_statement&format=normalized&debug=true"
curl "http://localhost:3000/v1/statements/JPM?statement=income_statement&frequency=quarterly&format=normalized&periods=4&includeTtm=true"
```

Normalized responses are compact by default. Source trace data is returned only when `debug=true`.
`view=restated` picks the latest filed fact for a period. `view=as_reported` picks the earliest filed fact for that same period.

## What still needs to be provided

- A production-quality `SEC_USER_AGENT` contact string
- Your GitHub auth so the local commits can be pushed to `origin`
- A deployment target later if you want this hosted independently from the main site
