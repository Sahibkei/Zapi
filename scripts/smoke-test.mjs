import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SAMPLE_CASES = {
  sec_edgar: [
    {
      identifier: "AAPL",
      statement: "income_statement",
      frequency: "annual",
      periods: "3",
      filename: "sec-edgar-aapl-income-annual.csv"
    },
    {
      identifier: "JPM",
      statement: "income_statement",
      frequency: "quarterly",
      periods: "4",
      filename: "sec-edgar-jpm-income-quarterly.csv"
    }
  ],
  companies_house: [
    {
      identifier: "00001995",
      statement: "income_statement",
      frequency: "annual",
      periods: "3",
      filename: "companies-house-sample.csv"
    }
  ],
  edinet: [
    {
      identifier: "E00001",
      statement: "income_statement",
      frequency: "annual",
      periods: "3",
      filename: "edinet-sample.csv"
    }
  ]
};

function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildCsv(statement) {
  const header = ["metric_code", "label", "unit", "depth", ...statement.columns];
  const lines = [header.map(csvEscape).join(",")];

  for (const row of statement.rows) {
    if (row.rowKind !== "metric") {
      continue;
    }
    lines.push(
      [row.metricCode, row.label, row.unit, row.depth, ...row.values]
        .map(csvEscape)
        .join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  const json = await response.json();
  return { response, json };
}

async function main() {
  const baseUrl = process.env.ZAPI_BASE_URL ?? "http://127.0.0.1:3000";
  const apiKey = process.env.ZAPI_TEST_API_KEY ?? "zapi-local-test";
  const outputDir = resolve(process.env.ZAPI_SMOKE_OUTPUT_DIR ?? "artifacts/smoke");
  const headers = apiKey ? { "x-zapi-api-key": apiKey } : {};

  await mkdir(outputDir, { recursive: true });

  const { response: regimeResponse, json: regimeJson } = await fetchJson(
    `${baseUrl}/v1/regimes`,
    headers
  );
  if (!regimeResponse.ok) {
    throw new Error(`Could not load /v1/regimes: ${JSON.stringify(regimeJson)}`);
  }

  const report = [];
  for (const regime of regimeJson.regimes) {
    const sampleCases = SAMPLE_CASES[regime.regime] ?? [];
    const sample = sampleCases[0];
    if (!sample) {
      report.push({
        regime: regime.regime,
        status: "skipped",
        reason: "no_sample_case"
      });
      continue;
    }

    const params = new URLSearchParams({
      regime: regime.regime,
      statement: sample.statement,
      frequency: sample.frequency,
      format: "normalized",
      periods: sample.periods
    });
    const url = `${baseUrl}/v1/statements/${encodeURIComponent(sample.identifier)}?${params.toString()}`;
    const { response, json } = await fetchJson(url, headers);

    if (response.ok) {
      const csv = buildCsv(json);
      const outputPath = resolve(outputDir, sample.filename);
      await writeFile(outputPath, csv, "utf8");
      report.push({
        regime: regime.regime,
        adapterStatus: regime.status,
        requestStatus: response.status,
        identifier: sample.identifier,
        output: outputPath
      });
      continue;
    }

    report.push({
      regime: regime.regime,
      adapterStatus: regime.status,
      requestStatus: response.status,
      identifier: sample.identifier,
      error: json.error,
      message: json.message
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
