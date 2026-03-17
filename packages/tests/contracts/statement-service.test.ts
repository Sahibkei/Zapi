import companyFacts from "../fixtures/sec/aapl-companyfacts.json";
import submissions from "../fixtures/sec/aapl-submissions.json";
import syntheticQuarterlyCompanyFacts from "../fixtures/sec/synthetic-quarterly-companyfacts.json";
import syntheticQuarterlySubmissions from "../fixtures/sec/synthetic-quarterly-submissions.json";
import {
  createStatementService,
  formatMatrixStatement,
  formatNormalizedStatement
} from "../../core/src";
import { mapStatement } from "../../adapters/sec-edgar/src/mapper";

describe("statement service", () => {
  it("maps annual income statements into the normalized contract", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getStatement: async ({ ticker, statement, frequency, periods, includeTtm }) =>
          mapStatement({
            ticker,
            requestedStatement: statement,
            frequency,
            periods,
            includeTtm,
            companyFacts,
            submissions
          })
      }
    });

    const result = await service.getStatement({
      ticker: "AAPL",
      statement: "income_statement",
      frequency: "annual",
      view: "restated",
      format: "normalized",
      periods: 3,
      includeTtm: false,
      debug: false
    });

    expect(result.meta.titleSlug).toBe("AAPL_income-statement_Annual_Restated");
    expect(result.columns).toEqual(["2023", "2024", "2025"]);
    expect(result.periods["2025"].revenue_total).toBe(416161000000);
    expect(result.periods["2024"].eps_diluted).toBe(6.08);
    expect(result.meta.currency).toBe("USD");
  });

  it("formats matrix output with deterministic footer metadata", () => {
    const statement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 2,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    const matrix = formatMatrixStatement(statement);
    expect(matrix.columns).toEqual(["2024", "2025", "TTM"]);
    expect(matrix.rows[0]?.row_kind).toBe("section");
    expect(matrix.rows.find((row) => row.metric_code === "revenue_total")?.values).toEqual([
      500,
      540,
      540
    ]);
    expect(matrix.footer).toBe("Fiscal year ends in Sep 30 | USD");
  });

  it("rejects unsupported as-reported requests in the MVP", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getStatement: async () => {
          throw new Error("should not be called");
        }
      }
    });

    await expect(() =>
      service.getStatement({
        ticker: "AAPL",
        statement: "income_statement",
        frequency: "annual",
        view: "as_reported",
        format: "normalized",
        periods: 3,
        includeTtm: false,
        debug: false
      })
    ).rejects.toThrow("The SEC-first MVP currently supports only restated output.");
  });

  it("returns a compact normalized payload by default and exposes facts only in debug mode", () => {
    const statement = mapStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 3,
      includeTtm: false,
      companyFacts,
      submissions
    });

    const compact = formatNormalizedStatement(statement);
    expect("facts" in compact).toBe(false);
    expect(compact.debug).toBeUndefined();

    const debug = formatNormalizedStatement(statement, { debug: true });
    expect(debug.debug?.facts).toHaveLength(statement.facts.length);
    expect(debug.debug?.facts[0]?.metricCode).toBe("revenue_total");
  });

  it("builds quarterly statements with TTM and section rows", () => {
    const statement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "quarterly",
      periods: 4,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    expect(statement.columns).toEqual(["2024-Q4", "2025-Q1", "2025-Q2", "2025-Q3", "TTM"]);
    expect(statement.rows[0]).toMatchObject({
      label: "Revenue",
      rowKind: "section",
      depth: 0
    });
    expect(statement.periods.TTM.revenue_total).toBe(540);
    expect(statement.periods.TTM.shares_diluted).toBe(11.75);
    expect(statement.periods["2025-Q3"].net_income).toBe(30);
  });

  it("adds TTM to annual duration statements without polluting balance sheet output", () => {
    const incomeStatement = mapStatement({
      ticker: "SYN",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 2,
      includeTtm: true,
      companyFacts: syntheticQuarterlyCompanyFacts,
      submissions: syntheticQuarterlySubmissions
    });

    expect(incomeStatement.columns).toEqual(["2024", "2025", "TTM"]);
    expect(incomeStatement.periods.TTM.revenue_total).toBe(540);
    expect(incomeStatement.periods.TTM.shares_diluted).toBe(11.75);
  });

  it("uses annual proxies for per-share TTM metrics when quarter subtraction is invalid", () => {
    const statement = mapStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      frequency: "annual",
      periods: 1,
      includeTtm: true,
      companyFacts,
      submissions
    });

    expect(statement.periods.TTM.eps_diluted).toBe(7.46);
    expect(statement.periods.TTM.shares_diluted).toBe(15004697000);
  });
});
