import {
  NotFoundError,
  type CanonicalFact,
  type NormalizedStatementResponse,
  type SectorProfile,
  type StatementRow,
  type StatementType
} from "../../../core/src";
import type { SecCompanyFacts, SecFactUnit, SecSubmissions } from "./types";

interface StatementMetricDefinition {
  metricCode: string;
  label: string;
  depth: number;
  unit: string;
  concepts: string[];
  statement: StatementType;
  kind: "instant" | "duration" | "derived";
  derive?: (values: Record<string, number | null>) => number | null;
  deriveDependencies?: string[];
}

function isBaseDefinition(
  definition: StatementMetricDefinition
): definition is StatementMetricDefinition & { kind: "instant" | "duration" } {
  return definition.kind === "instant" || definition.kind === "duration";
}

const STATEMENT_DEFINITIONS: Record<StatementType, StatementMetricDefinition[]> = {
  income_statement: [
    {
      metricCode: "revenue_total",
      label: "Total Revenue",
      depth: 0,
      unit: "USD",
      concepts: [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet"
      ],
      statement: "income_statement",
      kind: "duration"
    },
    {
      metricCode: "gross_profit",
      label: "Gross Profit",
      depth: 0,
      unit: "USD",
      concepts: ["GrossProfit"],
      statement: "income_statement",
      kind: "duration"
    },
    {
      metricCode: "operating_income",
      label: "Operating Income",
      depth: 0,
      unit: "USD",
      concepts: ["OperatingIncomeLoss"],
      statement: "income_statement",
      kind: "duration"
    },
    {
      metricCode: "net_income",
      label: "Net Income",
      depth: 0,
      unit: "USD",
      concepts: ["NetIncomeLoss"],
      statement: "income_statement",
      kind: "duration"
    },
    {
      metricCode: "eps_diluted",
      label: "Diluted EPS",
      depth: 0,
      unit: "USD/shares",
      concepts: ["EarningsPerShareDiluted"],
      statement: "income_statement",
      kind: "duration"
    },
    {
      metricCode: "shares_diluted",
      label: "Weighted Avg. Diluted Shares",
      depth: 0,
      unit: "shares",
      concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
      statement: "income_statement",
      kind: "duration"
    }
  ],
  balance_sheet: [
    {
      metricCode: "cash_and_equivalents",
      label: "Cash and Equivalents",
      depth: 0,
      unit: "USD",
      concepts: ["CashAndCashEquivalentsAtCarryingValue"],
      statement: "balance_sheet",
      kind: "instant"
    },
    {
      metricCode: "total_assets",
      label: "Total Assets",
      depth: 0,
      unit: "USD",
      concepts: ["Assets"],
      statement: "balance_sheet",
      kind: "instant"
    },
    {
      metricCode: "total_liabilities",
      label: "Total Liabilities",
      depth: 0,
      unit: "USD",
      concepts: ["Liabilities"],
      statement: "balance_sheet",
      kind: "instant"
    },
    {
      metricCode: "shareholders_equity",
      label: "Shareholders' Equity",
      depth: 0,
      unit: "USD",
      concepts: ["StockholdersEquity"],
      statement: "balance_sheet",
      kind: "instant"
    }
  ],
  cash_flow: [
    {
      metricCode: "operating_cash_flow",
      label: "Operating Cash Flow",
      depth: 0,
      unit: "USD",
      concepts: ["NetCashProvidedByUsedInOperatingActivities"],
      statement: "cash_flow",
      kind: "duration"
    },
    {
      metricCode: "capital_expenditures",
      label: "Capital Expenditures",
      depth: 0,
      unit: "USD",
      concepts: ["PaymentsToAcquirePropertyPlantAndEquipment"],
      statement: "cash_flow",
      kind: "duration"
    },
    {
      metricCode: "free_cash_flow",
      label: "Free Cash Flow",
      depth: 0,
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      deriveDependencies: ["operating_cash_flow", "capital_expenditures"],
      derive: (values) => {
        const operatingCashFlow = values.operating_cash_flow;
        const capex = values.capital_expenditures;
        if (operatingCashFlow === null || capex === null) {
          return null;
        }

        return operatingCashFlow - Math.abs(capex);
      }
    }
  ]
};

function detectSectorProfile(sic: string | undefined): SectorProfile {
  if (!sic) {
    return "unknown";
  }

  if (sic.startsWith("6")) {
    return "bank";
  }

  if (sic.startsWith("63") || sic.startsWith("64")) {
    return "insurer";
  }

  return "industrial";
}

function formatFiscalYearEnd(rawValue: string | undefined): string {
  if (!rawValue || rawValue.length !== 4) {
    return "Unknown";
  }

  const month = Number(rawValue.slice(0, 2));
  const day = Number(rawValue.slice(2, 4));
  const date = new Date(Date.UTC(2025, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function getConceptNode(companyFacts: SecCompanyFacts, concept: string) {
  return companyFacts.facts["us-gaap"]?.[concept] ?? companyFacts.facts["dei"]?.[concept];
}

function selectAnnualFacts(
  node: SecCompanyFacts["facts"][string][string] | undefined,
  kind: "instant" | "duration"
): SecFactUnit[] {
  if (!node) {
    return [];
  }

  const facts = Object.values(node.units).flat();
  return facts.filter((fact) => {
    if (!fact.end || !fact.form) {
      return false;
    }

    const annualForm = ["10-K", "10-K/A", "20-F", "40-F"].includes(fact.form);
    if (!annualForm) {
      return false;
    }

    if (kind === "instant") {
      return fact.fp === "FY" || !fact.start;
    }

    const durationDays = fact.start
      ? Math.round((Date.parse(fact.end) - Date.parse(fact.start)) / (1000 * 60 * 60 * 24))
      : 0;
    return fact.fp === "FY" || durationDays >= 300;
  });
}

function buildPeriodMap(facts: SecFactUnit[], periods: number): Map<string, SecFactUnit> {
  const grouped = new Map<string, SecFactUnit[]>();
  for (const fact of facts) {
    const label = String(fact.fy ?? new Date(fact.end ?? "").getUTCFullYear());
    grouped.set(label, [...(grouped.get(label) ?? []), fact]);
  }

  const selected = [...grouped.entries()]
    .map(([label, candidates]) => {
      const bestFact = [...candidates].sort((left, right) => {
        const rightEnd = Date.parse(right.end ?? "");
        const leftEnd = Date.parse(left.end ?? "");
        if (rightEnd !== leftEnd) {
          return rightEnd - leftEnd;
        }

        const rightFiled = Date.parse(right.filed ?? right.end ?? "");
        const leftFiled = Date.parse(left.filed ?? left.end ?? "");
        return rightFiled - leftFiled;
      })[0];

      return [label, bestFact] as const;
    })
    .sort((left, right) => Number(right[0]) - Number(left[0]))
    .slice(0, periods)
    .sort((left, right) => Number(left[0]) - Number(right[0]));

  const map = new Map<string, SecFactUnit>();
  for (const [label, fact] of selected) {
    map.set(label, fact);
  }

  return new Map(
    [...map.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))
  );
}

function buildRows(
  definitions: StatementMetricDefinition[],
  companyFacts: SecCompanyFacts,
  columns: string[]
): {
  rows: StatementRow[];
  facts: CanonicalFact[];
  currency: string;
} {
  const rows: StatementRow[] = [];
  const facts: CanonicalFact[] = [];
  const valueMatrix: Record<string, Record<string, number | null>> = {};
  let currency = "USD";

  for (const definition of definitions) {
    if (!isBaseDefinition(definition)) {
      continue;
    }

    const seriesFacts = definition.concepts.flatMap((concept) =>
      selectAnnualFacts(getConceptNode(companyFacts, concept), definition.kind).map((fact) => ({
        concept,
        fact
      }))
    );

    const periodMap = buildPeriodMap(
      seriesFacts.map(({ fact }) => fact),
      columns.length
    );

    const values = columns.map((column) => {
      const periodFact = periodMap.get(column);
      if (!periodFact) {
        return null;
      }

      const source = seriesFacts.find(
        ({ fact }) => fact.accn === periodFact.accn && fact.end === periodFact.end
      );
      const concept = source?.concept ?? definition.concepts[0] ?? "derived";
      const unitKey = Object.keys(getConceptNode(companyFacts, concept)?.units ?? {})[0];
      const baseUnit = unitKey?.split("/")[0];
      if (baseUnit && /^[A-Z]{3}$/.test(baseUnit)) {
        currency = baseUnit;
      }

      facts.push({
        metricCode: definition.metricCode,
        displayLabel: definition.label,
        statement: definition.statement,
        periodType: "annual",
        periodEnd: periodFact.end ?? "",
        periodLabel: column,
        view: "restated",
        value: periodFact.val,
        unit: definition.unit,
        signPolicy: "natural_source_sign",
        hierarchyPath: [definition.label],
        depth: definition.depth,
        sourceRegime: "sec_edgar",
        sourceConcept: concept,
        sourceFiling: periodFact.form ?? "10-K",
        sourceAccession: periodFact.accn,
        qualityFlags: []
      });

      return periodFact.val;
    });

    rows.push({
      metricCode: definition.metricCode,
      label: definition.label,
      depth: definition.depth,
      unit: definition.unit,
      values,
      qualityFlags: values.every((value) => value === null) ? ["missing_metric"] : []
    });

    valueMatrix[definition.metricCode] = Object.fromEntries(
      columns.map((column, index) => [column, values[index]])
    );
  }

  for (const definition of definitions.filter((item) => item.kind === "derived")) {
    const values = columns.map((column) => {
      const inputs = Object.fromEntries(
        (definition.deriveDependencies ?? []).map((dependency) => [
          dependency,
          valueMatrix[dependency]?.[column] ?? null
        ])
      );
      return definition.derive?.(inputs) ?? null;
    });

    rows.push({
      metricCode: definition.metricCode,
      label: definition.label,
      depth: definition.depth,
      unit: definition.unit,
      values,
      qualityFlags: values.every((value) => value === null) ? ["missing_metric"] : []
    });
  }

  return {
    rows,
    facts,
    currency
  };
}

export function mapAnnualStatement(input: {
  ticker: string;
  requestedStatement: StatementType;
  periods: number;
  companyFacts: SecCompanyFacts;
  submissions: SecSubmissions;
}): NormalizedStatementResponse {
  const definitions = STATEMENT_DEFINITIONS[input.requestedStatement];
  const referenceDefinition = definitions.find(isBaseDefinition);
  const referenceConcept = referenceDefinition?.concepts[0];
  const referenceFacts = referenceConcept
    ? selectAnnualFacts(
        getConceptNode(input.companyFacts, referenceConcept),
        referenceDefinition?.kind ?? "duration"
      )
    : [];

  const columns = [...buildPeriodMap(referenceFacts, input.periods).keys()];
  if (columns.length === 0) {
    throw new NotFoundError(
      `No annual ${input.requestedStatement} data was found for ${input.ticker}.`
    );
  }

  const { rows, facts, currency } = buildRows(definitions, input.companyFacts, columns);
  const sectorProfile = detectSectorProfile(input.submissions.sic);
  const fiscalYearEnd = formatFiscalYearEnd(input.submissions.fiscalYearEnd);

  return {
    meta: {
      ticker: input.ticker,
      companyName: input.submissions.name,
      statement: input.requestedStatement,
      frequency: "annual",
      view: "restated",
      currency,
      fiscalYearEnd,
      titleSlug: `${input.ticker}_${input.requestedStatement.replaceAll("_", "-")}_Annual_Restated`,
      sourceRegime: "sec_edgar",
      sectorProfile,
      qualityFlags: rows.some((row) => row.qualityFlags.length > 0)
        ? ["partial_statement"]
        : []
    },
    columns,
    rows,
    periods: Object.fromEntries(
      columns.map((column, index) => [
        column,
        Object.fromEntries(rows.map((row) => [row.metricCode, row.values[index] ?? null]))
      ])
    ),
    facts
  };
}
