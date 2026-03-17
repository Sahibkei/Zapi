import { z } from "zod";

export const StatementTypeSchema = z.enum([
  "income_statement",
  "balance_sheet",
  "cash_flow"
]);

export const FrequencySchema = z.enum(["annual"]);
export const StatementViewSchema = z.enum(["restated", "as_reported"]);
export const OutputFormatSchema = z.enum(["normalized", "matrix"]);
export const SectorProfileSchema = z.enum(["industrial", "bank", "insurer", "unknown"]);

export const StatementRequestSchema = z.object({
  ticker: z.string().trim().toUpperCase().min(1).max(10),
  statement: StatementTypeSchema.default("income_statement"),
  frequency: FrequencySchema.default("annual"),
  view: StatementViewSchema.default("restated"),
  format: OutputFormatSchema.default("normalized"),
  periods: z.coerce.number().int().min(1).max(10).default(5)
});

export type StatementQueryInput = z.input<typeof StatementRequestSchema>;
export type StatementRequest = z.infer<typeof StatementRequestSchema>;
export type StatementType = z.infer<typeof StatementTypeSchema>;
export type SectorProfile = z.infer<typeof SectorProfileSchema>;

export interface CanonicalFact {
  metricCode: string;
  displayLabel: string;
  statement: StatementType;
  periodType: "annual";
  periodEnd: string;
  periodLabel: string;
  view: "restated";
  value: number | null;
  unit: string;
  signPolicy: "natural_source_sign";
  hierarchyPath: string[];
  depth: number;
  sourceRegime: "sec_edgar";
  sourceConcept: string;
  sourceFiling: string;
  sourceAccession: string;
  qualityFlags: string[];
}

export interface StatementMeta {
  ticker: string;
  companyName: string;
  statement: StatementType;
  frequency: "annual";
  view: "restated";
  currency: string;
  fiscalYearEnd: string;
  titleSlug: string;
  sourceRegime: "sec_edgar";
  sectorProfile: SectorProfile;
  qualityFlags: string[];
}

export interface StatementRow {
  metricCode: string;
  label: string;
  depth: number;
  unit: string;
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

export interface MatrixStatementResponse {
  meta: Omit<StatementMeta, "companyName" | "qualityFlags" | "sectorProfile" | "sourceRegime">;
  columns: string[];
  rows: Array<{
    metric_code: string;
    label: string;
    depth: number;
    values: Array<number | null>;
  }>;
  footer: string;
}
