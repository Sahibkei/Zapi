# Zapi MVP Roadmap

## Current slice

This repository now targets the first executable slice from the architecture paper:

- Stateless HTTP API
- SEC EDGAR live adapter
- Canonical statement contract
- Matrix formatter
- Landing page and OpenAPI docs
- Contract fixtures and tests
- Compact normalized responses with optional debug trace data
- Quarterly and TTM support for SEC-first statement assembly
- Regime-aware federation layer with Companies House, EDINET, and India adapter slots
- Plan-aware auth status, region gating, and in-memory request limits

## Immediate next steps

1. Add a UK filing parser behind the Companies House adapter
2. Add an EDINET filing parser and taxonomy mappings
3. Introduce stronger statement-family detection from source facts
4. Expand row trees and sector-specific mappings
5. Add structured observability and persistent usage metering
