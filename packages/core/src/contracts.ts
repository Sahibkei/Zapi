import { z } from "zod";

export const StatementTypeSchema = z.enum([
  "income_statement",
  "balance_sheet",
  "cash_flow"
]);

export const FrequencySchema = z.enum(["annual", "quarterly"]);
export const StatementViewSchema = z.enum(["restated", "as_reported"]);
export const OutputFormatSchema = z.enum(["normalized", "matrix"]);
export const SectorProfileSchema = z.enum(["industrial", "bank", "insurer", "unknown"]);
export const SourceRegimeSchema = z.enum([
  "sec_edgar",
  "companies_house",
  "edinet",
  "india_placeholder"
]);

export const StatementRequestSchema = z.object({
  ticker: z.string().trim().toUpperCase().min(1).max(32),
  regime: SourceRegimeSchema.default("sec_edgar"),
  statement: StatementTypeSchema.default("income_statement"),
  frequency: FrequencySchema.default("annual"),
  view: StatementViewSchema.default("restated"),
  format: OutputFormatSchema.default("matrix"),
  periods: z.coerce.number().int().min(1).max(20).default(5),
  includeTtm: z.coerce.boolean().default(true),
  debug: z.coerce.boolean().default(false)
});

export type StatementQueryInput = z.input<typeof StatementRequestSchema>;
export type StatementRequest = z.infer<typeof StatementRequestSchema>;
export type StatementType = z.infer<typeof StatementTypeSchema>;
export type StatementFrequency = z.infer<typeof FrequencySchema>;
export type StatementView = z.infer<typeof StatementViewSchema>;
export type SectorProfile = z.infer<typeof SectorProfileSchema>;
export type StatementSourceRegime = z.infer<typeof SourceRegimeSchema>;

export interface CanonicalFact {
  metricCode: string;
  displayLabel: string;
  statement: StatementType;
  periodType: "annual" | "quarterly" | "ttm";
  periodEnd: string;
  periodLabel: string;
  view: "restated" | "as_reported";
  value: number | null;
  unit: string;
  signPolicy: "natural_source_sign";
  hierarchyPath: string[];
  depth: number;
  sourceRegime: StatementSourceRegime;
  sourceConcept: string;
  sourceFiling: string;
  sourceAccession: string;
  qualityFlags: string[];
}

export interface StatementMeta {
  ticker: string;
  companyName: string;
  statement: StatementType;
  frequency: StatementFrequency;
  view: "restated" | "as_reported";
  currency: string;
  fiscalYearEnd: string;
  titleSlug: string;
  sourceRegime: StatementSourceRegime;
  sectorProfile: SectorProfile;
  requestedPeriods: number;
  returnedPeriods: number;
  historyCoverage: "full" | "partial";
  historyNote?: string;
  qualityFlags: string[];
}

export interface StatementRow {
  metricCode: string;
  label: string;
  depth: number;
  unit: string;
  rowKind: "section" | "metric";
  values: Array<number | null>;
  qualityFlags: string[];
}

export interface NormalizedStatementResponse {
  meta: StatementMeta;
  columns: string[];
  rows: StatementRow[];
  periods: Record<string, Record<string, number | null>>;
  facts: CanonicalFact[];
}

export interface PublicNormalizedStatementResponse {
  meta: StatementMeta;
  columns: string[];
  rows: StatementRow[];
  periods: Record<string, Record<string, number | null>>;
  debug?: {
    facts: CanonicalFact[];
  };
}

export interface MatrixStatementResponse {
  meta: Omit<StatementMeta, "companyName" | "qualityFlags" | "sectorProfile" | "sourceRegime"> & {
    displayScale: "thousands_when_large";
    negativeStyle: "parentheses";
  };
  columns: string[];
  rows: Array<{
    metric_code: string;
    label: string;
    depth: number;
    row_kind: "section" | "metric";
    unit: string;
    values: Array<number | null>;
    display_values: Array<string>;
  }>;
  footer: string;
}
