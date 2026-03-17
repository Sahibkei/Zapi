import companyFacts from "../fixtures/sec/aapl-companyfacts.json";
import submissions from "../fixtures/sec/aapl-submissions.json";
import {
  createStatementService,
  formatMatrixStatement,
  formatNormalizedStatement
} from "../../core/src";
import { mapAnnualStatement } from "../../adapters/sec-edgar/src/mapper";

describe("statement service", () => {
  it("maps annual income statements into the normalized contract", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getAnnualStatement: async ({ ticker, statement, periods }) =>
          mapAnnualStatement({
            ticker,
            requestedStatement: statement,
            periods,
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
      periods: 3
    });

    expect(result.meta.titleSlug).toBe("AAPL_income-statement_Annual_Restated");
    expect(result.columns).toEqual(["2023", "2024", "2025"]);
    expect(result.periods["2025"].revenue_total).toBe(416161000000);
    expect(result.periods["2024"].eps_diluted).toBe(6.08);
    expect(result.meta.currency).toBe("USD");
  });

  it("formats matrix output with deterministic footer metadata", () => {
    const statement = mapAnnualStatement({
      ticker: "AAPL",
      requestedStatement: "cash_flow",
      periods: 2,
      companyFacts,
      submissions
    });

    const matrix = formatMatrixStatement(statement);
    expect(matrix.columns).toEqual(["2024", "2025"]);
    expect(matrix.rows.find((row) => row.metric_code === "free_cash_flow")?.values).toEqual([
      108807000000,
      98767000000
    ]);
    expect(matrix.footer).toBe("Fiscal year ends in Sep 26 | USD");
  });

  it("rejects unsupported as-reported requests in the MVP", async () => {
    const service = createStatementService({
      secEdgarClient: {
        getAnnualStatement: async () => {
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
        periods: 3
      })
    ).rejects.toThrow("The SEC-first MVP currently supports only restated output.");
  });

  it("returns a compact normalized payload by default and exposes facts only in debug mode", () => {
    const statement = mapAnnualStatement({
      ticker: "AAPL",
      requestedStatement: "income_statement",
      periods: 3,
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
});
