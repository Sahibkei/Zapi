import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    args[key] = value;
    index += 1;
  }
  return args;
}

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

function buildNormalizedCsv(statement) {
  const header = ["metric_code", "label", "unit", "depth", ...statement.columns];
  const lines = [header.map(csvEscape).join(",")];

  for (const row of statement.rows) {
    if (row.rowKind !== "metric") {
      continue;
    }

    lines.push(
      [
        row.metricCode,
        row.label,
        row.unit,
        row.depth,
        ...row.values
      ].map(csvEscape).join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildMatrixCsv(statement) {
  const lines = [];
  lines.push([statement.meta.titleSlug, ...statement.columns].map(csvEscape).join(","));

  for (const row of statement.rows) {
    const label = `${"    ".repeat(row.depth)}${row.label}`;
    lines.push([label, ...row.values].map(csvEscape).join(","));
  }

  lines.push(
    [statement.footer, ...statement.columns.map(() => "")]
      .map(csvEscape)
      .join(",")
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args["base-url"] ?? "http://127.0.0.1:3000";
  const identifier = args.identifier ?? "AAPL";
  const regime = args.regime ?? "sec_edgar";
  const statement = args.statement ?? "income_statement";
  const frequency = args.frequency ?? "annual";
  const view = args.view ?? "restated";
  const periods = args.periods ?? "5";
  const format = args.format ?? "matrix";
  const apiKey = args["api-key"];
  const output = resolve(
    args.output ?? `artifacts/${regime}-${identifier}-${statement}-${frequency}.csv`
  );

  const params = new URLSearchParams({
    regime,
    statement,
    frequency,
    view,
    format,
    periods
  });
  const url = `${baseUrl}/v1/statements/${encodeURIComponent(identifier)}?${params.toString()}`;
  const headers = apiKey ? { "x-zapi-api-key": apiKey } : {};
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Could not reach ${baseUrl}. Start the API in your VS Code terminal first with "npm run dev:test" or "npm run dev".`
      );
    }
    throw error;
  }

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Export failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const csv = format === "matrix"
    ? buildMatrixCsv(body)
    : buildNormalizedCsv(body);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, csv, "utf8");

  console.log(JSON.stringify({
    url,
    output,
    plan: response.headers.get("x-zapi-plan"),
    remaining: response.headers.get("x-ratelimit-remaining"),
    columns: body.columns
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
