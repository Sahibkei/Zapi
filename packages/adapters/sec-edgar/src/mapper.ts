import {
  NotFoundError,
  type CanonicalFact,
  type NormalizedStatementResponse,
  type SectorProfile,
  type StatementFrequency,
  type StatementRow,
  type StatementType
} from "../../../core/src";
import type { SecCompanyFacts, SecFactUnit, SecSubmissions } from "./types";

interface StatementMetricDefinition {
  metricCode: string;
  label: string;
  hierarchyPath: string[];
  unit: string;
  concepts: string[];
  statement: StatementType;
  kind: "instant" | "duration" | "derived";
  ttmStrategy?: "sum" | "average" | "none";
  derive?: (values: Record<string, number | null>) => number | null;
  deriveDependencies?: string[];
}

interface SourcedFact {
  concept: string;
  fact: SecFactUnit;
}

interface PeriodCell {
  label: string;
  periodType: "annual" | "quarterly" | "ttm";
  end: string;
  value: number;
  concept: string;
  filing: string;
  accession: string;
}

function isBaseDefinition(
  definition: StatementMetricDefinition
): definition is StatementMetricDefinition & { kind: "instant" | "duration" } {
  return definition.kind === "instant" || definition.kind === "duration";
}

function isDurationStatement(statement: StatementType): boolean {
  return statement === "income_statement" || statement === "cash_flow";
}

const STATEMENT_DEFINITIONS: Record<StatementType, StatementMetricDefinition[]> = {
  income_statement: [
    {
      metricCode: "revenue_total",
      label: "Total Revenue",
      hierarchyPath: ["Revenue", "Total Revenue"],
      unit: "USD",
      concepts: [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "Revenues",
        "RevenueNet"
      ],
      statement: "income_statement",
      kind: "duration",
      ttmStrategy: "sum"
    },
    {
      metricCode: "gross_profit",
      label: "Gross Profit",
      hierarchyPath: ["Profitability", "Gross Profit"],
      unit: "USD",
      concepts: ["GrossProfit"],
      statement: "income_statement",
      kind: "duration",
      ttmStrategy: "sum"
    },
    {
      metricCode: "operating_income",
      label: "Operating Income",
      hierarchyPath: ["Profitability", "Operating Income"],
      unit: "USD",
      concepts: ["OperatingIncomeLoss"],
      statement: "income_statement",
      kind: "duration",
      ttmStrategy: "sum"
    },
    {
      metricCode: "net_income",
      label: "Net Income",
      hierarchyPath: ["Profitability", "Net Income"],
      unit: "USD",
      concepts: ["NetIncomeLoss"],
      statement: "income_statement",
      kind: "duration",
      ttmStrategy: "sum"
    },
    {
      metricCode: "eps_diluted",
      label: "Diluted EPS",
      hierarchyPath: ["Per Share", "Diluted EPS"],
      unit: "USD/shares",
      concepts: ["EarningsPerShareDiluted"],
      statement: "income_statement",
      kind: "duration",
      ttmStrategy: "sum"
    },
    {
      metricCode: "shares_diluted",
      label: "Weighted Avg. Diluted Shares",
      hierarchyPath: ["Per Share", "Weighted Avg. Diluted Shares"],
      unit: "shares",
      concepts: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
      statement: "income_statement",
      kind: "duration",
      ttmStrategy: "average"
    }
  ],
  balance_sheet: [
    {
      metricCode: "cash_and_equivalents",
      label: "Cash and Equivalents",
      hierarchyPath: ["Liquidity", "Cash and Equivalents"],
      unit: "USD",
      concepts: ["CashAndCashEquivalentsAtCarryingValue"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_assets",
      label: "Total Assets",
      hierarchyPath: ["Resources", "Total Assets"],
      unit: "USD",
      concepts: ["Assets"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "total_liabilities",
      label: "Total Liabilities",
      hierarchyPath: ["Claims", "Total Liabilities"],
      unit: "USD",
      concepts: ["Liabilities"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    },
    {
      metricCode: "shareholders_equity",
      label: "Shareholders' Equity",
      hierarchyPath: ["Claims", "Shareholders' Equity"],
      unit: "USD",
      concepts: ["StockholdersEquity"],
      statement: "balance_sheet",
      kind: "instant",
      ttmStrategy: "none"
    }
  ],
  cash_flow: [
    {
      metricCode: "operating_cash_flow",
      label: "Operating Cash Flow",
      hierarchyPath: ["Operations", "Operating Cash Flow"],
      unit: "USD",
      concepts: ["NetCashProvidedByUsedInOperatingActivities"],
      statement: "cash_flow",
      kind: "duration",
      ttmStrategy: "sum"
    },
    {
      metricCode: "capital_expenditures",
      label: "Capital Expenditures",
      hierarchyPath: ["Investing", "Capital Expenditures"],
      unit: "USD",
      concepts: ["PaymentsToAcquirePropertyPlantAndEquipment"],
      statement: "cash_flow",
      kind: "duration",
      ttmStrategy: "sum"
    },
    {
      metricCode: "free_cash_flow",
      label: "Free Cash Flow",
      hierarchyPath: ["Returns", "Free Cash Flow"],
      unit: "USD",
      concepts: [],
      statement: "cash_flow",
      kind: "derived",
      ttmStrategy: "sum",
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

function getDurationDays(fact: SecFactUnit): number {
  if (!fact.start || !fact.end) {
    return 0;
  }

  return Math.round(
    (Date.parse(fact.end) - Date.parse(fact.start)) / (1000 * 60 * 60 * 24)
  );
}

function getYearLabel(end: string | undefined): string {
  return String(new Date(end ?? "").getUTCFullYear());
}

function getQuarterLabel(end: string | undefined): string {
  const date = new Date(end ?? "");
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function chooseBestFact(facts: SecFactUnit[]): SecFactUnit | undefined {
  return [...facts].sort((left, right) => {
    const rightEnd = Date.parse(right.end ?? "");
    const leftEnd = Date.parse(left.end ?? "");
    if (rightEnd !== leftEnd) {
      return rightEnd - leftEnd;
    }

    const rightFiled = Date.parse(right.filed ?? right.end ?? "");
    const leftFiled = Date.parse(left.filed ?? left.end ?? "");
    return rightFiled - leftFiled;
  })[0];
}

function collectSourcedFacts(
  companyFacts: SecCompanyFacts,
  definition: StatementMetricDefinition
): SourcedFact[] {
  return definition.concepts.flatMap((concept) =>
    Object.values(getConceptNode(companyFacts, concept)?.units ?? {})
      .flat()
      .map((fact) => ({ concept, fact }))
  );
}

function selectAnnualSourcedFacts(
  facts: SourcedFact[],
  kind: "instant" | "duration"
): SourcedFact[] {
  return facts.filter(({ fact }) => {
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

    return fact.fp === "FY" || getDurationDays(fact) >= 300;
  });
}

function buildAnnualSeries(
  sourcedFacts: SourcedFact[],
  periods: number
): PeriodCell[] {
  const grouped = new Map<string, SourcedFact[]>();
  for (const sourcedFact of sourcedFacts) {
    const year = getYearLabel(sourcedFact.fact.end);
    grouped.set(year, [...(grouped.get(year) ?? []), sourcedFact]);
  }

  const cells: PeriodCell[] = [];
  for (const [label, candidates] of grouped.entries()) {
    const best = chooseBestFact(candidates.map((candidate) => candidate.fact));
    const source = candidates.find((candidate) => candidate.fact === best);
    if (!best || !source) {
      continue;
    }

    cells.push({
      label,
      periodType: "annual",
      end: best.end ?? "",
      value: best.val,
      concept: source.concept,
      filing: best.form ?? "10-K",
      accession: best.accn
    });
  }

  return cells
    .sort((left, right) => Number(left.label) - Number(right.label))
    .slice(-periods);
}

function buildInstantQuarterlySeries(
  sourcedFacts: SourcedFact[],
  periods: number
): PeriodCell[] {
  const filtered = sourcedFacts.filter(({ fact }) => {
    if (!fact.end || !fact.form) {
      return false;
    }

    return ["10-Q", "10-Q/A", "10-K", "10-K/A", "20-F", "40-F"].includes(fact.form);
  });

  const grouped = new Map<string, SourcedFact[]>();
  for (const sourcedFact of filtered) {
    const step = sourcedFact.fact.fp === "FY" ? "Q4" : sourcedFact.fact.fp;
    if (!step || !["Q1", "Q2", "Q3", "Q4"].includes(step)) {
      continue;
    }

    const label = getQuarterLabel(sourcedFact.fact.end);
    grouped.set(label, [...(grouped.get(label) ?? []), sourcedFact]);
  }

  const cells: PeriodCell[] = [];
  for (const [label, candidates] of grouped.entries()) {
    const best = chooseBestFact(candidates.map((candidate) => candidate.fact));
    const source = candidates.find((candidate) => candidate.fact === best);
    if (!best || !source) {
      continue;
    }

    cells.push({
      label,
      periodType: "quarterly",
      end: best.end ?? "",
      value: best.val,
      concept: source.concept,
      filing: best.form ?? "10-Q",
      accession: best.accn
    });
  }

  return cells
    .sort((left, right) => Date.parse(left.end) - Date.parse(right.end))
    .slice(-periods);
}

function buildDurationQuarterlySeries(
  sourcedFacts: SourcedFact[],
  periods: number
): PeriodCell[] {
  const groupedByYear = new Map<string, Record<string, SourcedFact[]>>();

  for (const sourcedFact of sourcedFacts) {
    const { fact } = sourcedFact;
    if (!fact.end || !fact.form || !fact.fp) {
      continue;
    }

    if (!["10-Q", "10-Q/A", "10-K", "10-K/A", "20-F", "40-F"].includes(fact.form)) {
      continue;
    }

    if (!["Q1", "Q2", "Q3", "Q4", "FY"].includes(fact.fp)) {
      continue;
    }

    const year = getYearLabel(fact.end);
    const bucket = groupedByYear.get(year) ?? {};
    bucket[fact.fp] = [...(bucket[fact.fp] ?? []), sourcedFact];
    groupedByYear.set(year, bucket);
  }

  const quarterlyCells: PeriodCell[] = [];

  for (const [year, bucket] of groupedByYear.entries()) {
    const q1Candidates = bucket.Q1 ?? [];
    const q2Candidates = bucket.Q2 ?? [];
    const q3Candidates = bucket.Q3 ?? [];
    const q4Candidates = bucket.Q4 ?? [];
    const fyCandidates = bucket.FY ?? [];

    const directQ1 = chooseBestFact(
      q1Candidates
        .filter(({ fact }) => {
          const durationDays = getDurationDays(fact);
          return durationDays === 0 || durationDays <= 120;
        })
        .map(({ fact }) => fact)
    );
    const directQ2 = chooseBestFact(
      q2Candidates
        .filter(({ fact }) => getDurationDays(fact) > 0 && getDurationDays(fact) <= 120)
        .map(({ fact }) => fact)
    );
    const directQ3 = chooseBestFact(
      q3Candidates
        .filter(({ fact }) => getDurationDays(fact) > 0 && getDurationDays(fact) <= 120)
        .map(({ fact }) => fact)
    );
    const directQ4 = chooseBestFact(
      q4Candidates
        .filter(({ fact }) => getDurationDays(fact) > 0 && getDurationDays(fact) <= 120)
        .map(({ fact }) => fact)
    );

    const ytdQ1 = chooseBestFact(q1Candidates.map(({ fact }) => fact));
    const ytdQ2 = chooseBestFact(q2Candidates.map(({ fact }) => fact));
    const ytdQ3 = chooseBestFact(q3Candidates.map(({ fact }) => fact));
    const annual = chooseBestFact(fyCandidates.map(({ fact }) => fact));

    const sourceFor = (target: SecFactUnit | undefined, candidates: SourcedFact[]) =>
      candidates.find((candidate) => candidate.fact === target);

    const q1Value = directQ1?.val ?? ytdQ1?.val ?? null;
    const q1Source = sourceFor(directQ1 ?? ytdQ1, q1Candidates);
    if (q1Value !== null && q1Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ1 ?? ytdQ1)?.end),
        periodType: "quarterly",
        end: (directQ1 ?? ytdQ1)?.end ?? "",
        value: q1Value,
        concept: q1Source.concept,
        filing: (directQ1 ?? ytdQ1)?.form ?? "10-Q",
        accession: (directQ1 ?? ytdQ1)?.accn ?? ""
      });
    }

    const q2Value = directQ2?.val ?? (
      ytdQ2 && q1Value !== null ? ytdQ2.val - q1Value : null
    );
    const q2Source = sourceFor(directQ2 ?? ytdQ2, q2Candidates);
    if (q2Value !== null && q2Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ2 ?? ytdQ2)?.end),
        periodType: "quarterly",
        end: (directQ2 ?? ytdQ2)?.end ?? "",
        value: q2Value,
        concept: q2Source.concept,
        filing: (directQ2 ?? ytdQ2)?.form ?? "10-Q",
        accession: (directQ2 ?? ytdQ2)?.accn ?? ""
      });
    }

    const q3Value = directQ3?.val ?? (
      ytdQ3 && q1Value !== null && q2Value !== null ? ytdQ3.val - q1Value - q2Value : null
    );
    const q3Source = sourceFor(directQ3 ?? ytdQ3, q3Candidates);
    if (q3Value !== null && q3Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ3 ?? ytdQ3)?.end),
        periodType: "quarterly",
        end: (directQ3 ?? ytdQ3)?.end ?? "",
        value: q3Value,
        concept: q3Source.concept,
        filing: (directQ3 ?? ytdQ3)?.form ?? "10-Q",
        accession: (directQ3 ?? ytdQ3)?.accn ?? ""
      });
    }

    const q4Value = directQ4?.val ?? (
      annual && q1Value !== null && q2Value !== null && q3Value !== null
        ? annual.val - q1Value - q2Value - q3Value
        : null
    );
    const q4Source = sourceFor(directQ4, q4Candidates) ?? sourceFor(annual, fyCandidates);
    if (q4Value !== null && q4Source) {
      quarterlyCells.push({
        label: getQuarterLabel((directQ4 ?? annual)?.end),
        periodType: "quarterly",
        end: (directQ4 ?? annual)?.end ?? "",
        value: q4Value,
        concept: q4Source.concept,
        filing: (directQ4 ?? annual)?.form ?? "10-K",
        accession: (directQ4 ?? annual)?.accn ?? ""
      });
    }
  }

  return quarterlyCells
    .sort((left, right) => Date.parse(left.end) - Date.parse(right.end))
    .slice(-periods);
}

function buildTtmCell(
  definition: StatementMetricDefinition,
  quarterlyCells: PeriodCell[]
): PeriodCell | null {
  if (definition.ttmStrategy === "none" || quarterlyCells.length < 4) {
    return null;
  }

  const lastFour = quarterlyCells.slice(-4);
  if (lastFour.length < 4) {
    return null;
  }

  let value: number;
  if (definition.ttmStrategy === "average") {
    value =
      lastFour.reduce((sum, cell) => sum + cell.value, 0) / lastFour.length;
  } else {
    value = lastFour.reduce((sum, cell) => sum + cell.value, 0);
  }

  return {
    label: "TTM",
    periodType: "ttm",
    end: lastFour[lastFour.length - 1]?.end ?? "",
    value,
    concept: lastFour.map((cell) => cell.concept).join("|"),
    filing: "TTM",
    accession: lastFour.map((cell) => cell.accession).join("|")
  };
}

function buildMetricSeries(
  definition: StatementMetricDefinition & { kind: "instant" | "duration" },
  companyFacts: SecCompanyFacts,
  frequency: StatementFrequency,
  periods: number
): {
  displayCells: PeriodCell[];
  quarterlyCells: PeriodCell[];
  currency: string;
} {
  const sourcedFacts = collectSourcedFacts(companyFacts, definition);
  const baseFacts = selectAnnualSourcedFacts(sourcedFacts, definition.kind);
  const annualCells = buildAnnualSeries(baseFacts, periods);

  let quarterlyCells: PeriodCell[] = [];
  if (definition.kind === "instant") {
    quarterlyCells = buildInstantQuarterlySeries(sourcedFacts, periods + 4);
  } else {
    quarterlyCells = buildDurationQuarterlySeries(sourcedFacts, periods + 4);
  }

  const displayCells = frequency === "annual"
    ? annualCells
    : quarterlyCells.slice(-periods);

  const currency = definition.unit.startsWith("USD") ? "USD" : "USD";

  return {
    displayCells,
    quarterlyCells,
    currency
  };
}

function buildDisplayRows(
  definitions: StatementMetricDefinition[],
  columns: string[],
  metricValues: Record<string, Record<string, number | null>>
): StatementRow[] {
  const rows: StatementRow[] = [];
  const seenSections = new Set<string>();

  for (const definition of definitions) {
    const sectionParts = definition.hierarchyPath.slice(0, -1);
    for (let index = 0; index < sectionParts.length; index += 1) {
      const sectionKey = sectionParts.slice(0, index + 1).join(" > ");
      if (seenSections.has(sectionKey)) {
        continue;
      }

      seenSections.add(sectionKey);
      rows.push({
        metricCode: `section_${sectionKey.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        label: sectionParts[index] ?? sectionKey,
        depth: index,
        unit: "",
        rowKind: "section",
        values: columns.map(() => null),
        qualityFlags: []
      });
    }

    rows.push({
      metricCode: definition.metricCode,
      label: definition.label,
      depth: definition.hierarchyPath.length - 1,
      unit: definition.unit,
      rowKind: "metric",
      values: columns.map((column) => metricValues[definition.metricCode]?.[column] ?? null),
      qualityFlags: columns.every(
        (column) => metricValues[definition.metricCode]?.[column] === null
      )
        ? ["missing_metric"]
        : []
    });
  }

  return rows;
}

export function mapStatement(input: {
  ticker: string;
  requestedStatement: StatementType;
  frequency: StatementFrequency;
  periods: number;
  includeTtm: boolean;
  companyFacts: SecCompanyFacts;
  submissions: SecSubmissions;
}): NormalizedStatementResponse {
  const definitions = STATEMENT_DEFINITIONS[input.requestedStatement];
  const baseDefinitions = definitions.filter(isBaseDefinition);
  if (baseDefinitions.length === 0) {
    throw new NotFoundError(
      `No base metric definitions were found for ${input.requestedStatement}.`
    );
  }

  const metricValues: Record<string, Record<string, number | null>> = {};
  const facts: CanonicalFact[] = [];
  let outputColumns: string[] = [];
  let currency = "USD";
  const preparedSeries = baseDefinitions.map((definition) => ({
    definition,
    ...buildMetricSeries(
      definition,
      input.companyFacts,
      input.frequency,
      input.periods
    )
  }));

  const referenceSeries = preparedSeries
    .filter((series) => series.displayCells.length > 0)
    .sort((left, right) => {
      const rightEnd = Date.parse(right.displayCells.at(-1)?.end ?? "");
      const leftEnd = Date.parse(left.displayCells.at(-1)?.end ?? "");
      if (rightEnd !== leftEnd) {
        return rightEnd - leftEnd;
      }

      return right.displayCells.length - left.displayCells.length;
    })[0];

  if (!referenceSeries) {
    throw new NotFoundError(
      `No ${input.frequency} ${input.requestedStatement} data was found for ${input.ticker}.`
    );
  }

  outputColumns = referenceSeries.displayCells.map((cell) => cell.label);
  const referenceTtm =
    input.includeTtm && isDurationStatement(input.requestedStatement)
      ? buildTtmCell(referenceSeries.definition, referenceSeries.quarterlyCells)
      : null;
  if (referenceTtm) {
    outputColumns.push("TTM");
  }

  for (const series of preparedSeries) {
    const { definition, displayCells, quarterlyCells, currency: metricCurrency } = series;

    metricValues[definition.metricCode] = Object.fromEntries(
      displayCells.map((cell) => [cell.label, cell.value])
    );

    for (const cell of displayCells) {
      facts.push({
        metricCode: definition.metricCode,
        displayLabel: definition.label,
        statement: definition.statement,
        periodType: cell.periodType,
        periodEnd: cell.end,
        periodLabel: cell.label,
        view: "restated",
        value: cell.value,
        unit: definition.unit,
        signPolicy: "natural_source_sign",
        hierarchyPath: definition.hierarchyPath,
        depth: definition.hierarchyPath.length - 1,
        sourceRegime: "sec_edgar",
        sourceConcept: cell.concept,
        sourceFiling: cell.filing,
        sourceAccession: cell.accession,
        qualityFlags: []
      });
    }

    if (input.includeTtm && isDurationStatement(input.requestedStatement)) {
      const ttmCell = buildTtmCell(definition, quarterlyCells);
      if (ttmCell) {
        metricValues[definition.metricCode].TTM = ttmCell.value;
        facts.push({
          metricCode: definition.metricCode,
          displayLabel: definition.label,
          statement: definition.statement,
          periodType: "ttm",
          periodEnd: ttmCell.end,
          periodLabel: "TTM",
          view: "restated",
          value: ttmCell.value,
          unit: definition.unit,
          signPolicy: "natural_source_sign",
          hierarchyPath: definition.hierarchyPath,
          depth: definition.hierarchyPath.length - 1,
          sourceRegime: "sec_edgar",
          sourceConcept: ttmCell.concept,
          sourceFiling: ttmCell.filing,
          sourceAccession: ttmCell.accession,
          qualityFlags: []
        });
      }
    }

    currency = metricCurrency;
  }

  for (const definition of definitions.filter((item) => item.kind === "derived")) {
    metricValues[definition.metricCode] = Object.fromEntries(
      outputColumns.map((column) => {
        const inputs = Object.fromEntries(
          (definition.deriveDependencies ?? []).map((dependency) => [
            dependency,
            metricValues[dependency]?.[column] ?? null
          ])
        );
        return [column, definition.derive?.(inputs) ?? null];
      })
    );

    for (const column of outputColumns) {
      const value = metricValues[definition.metricCode]?.[column] ?? null;
      if (value === null) {
        continue;
      }

      facts.push({
        metricCode: definition.metricCode,
        displayLabel: definition.label,
        statement: definition.statement,
        periodType: column === "TTM" ? "ttm" : input.frequency,
        periodEnd: column === "TTM" ? facts.at(-1)?.periodEnd ?? "" : "",
        periodLabel: column,
        view: "restated",
        value,
        unit: definition.unit,
        signPolicy: "natural_source_sign",
        hierarchyPath: definition.hierarchyPath,
        depth: definition.hierarchyPath.length - 1,
        sourceRegime: "sec_edgar",
        sourceConcept: "derived",
        sourceFiling: column === "TTM" ? "TTM" : "derived",
        sourceAccession: "derived",
        qualityFlags: []
      });
    }
  }

  const rows = buildDisplayRows(definitions, outputColumns, metricValues);
  const sectorProfile = detectSectorProfile(input.submissions.sic);
  const fiscalYearEnd = formatFiscalYearEnd(input.submissions.fiscalYearEnd);
  const frequencyLabel = input.frequency === "annual" ? "Annual" : "Quarterly";

  return {
    meta: {
      ticker: input.ticker,
      companyName: input.submissions.name,
      statement: input.requestedStatement,
      frequency: input.frequency,
      view: "restated",
      currency,
      fiscalYearEnd,
      titleSlug: `${input.ticker}_${input.requestedStatement.replaceAll("_", "-")}_${frequencyLabel}_Restated`,
      sourceRegime: "sec_edgar",
      sectorProfile,
      qualityFlags: rows.some(
        (row) => row.rowKind === "metric" && row.qualityFlags.length > 0
      )
        ? ["partial_statement"]
        : []
    },
    columns: outputColumns,
    rows,
    periods: Object.fromEntries(
      outputColumns.map((column) => [
        column,
        Object.fromEntries(
          rows
            .filter((row) => row.rowKind === "metric")
            .map((row) => [row.metricCode, metricValues[row.metricCode]?.[column] ?? null])
        )
      ])
    ),
    facts
  };
}
