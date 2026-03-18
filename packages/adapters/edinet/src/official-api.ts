import { AuthenticationError, NotFoundError, UpstreamError } from "../../../core/src";

type FetchLike = typeof fetch;

export interface EdinetDocumentListEntry {
  docID?: string;
  edinetCode?: string | null;
  secCode?: string | null;
  filerName?: string | null;
  ordinanceCode?: string | null;
  formCode?: string | null;
  docTypeCode?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  submitDateTime?: string | null;
  docDescription?: string | null;
  xbrlFlag?: string | null;
  pdfFlag?: string | null;
  csvFlag?: string | null;
  legalStatus?: string | null;
  disclosureStatus?: string | null;
}

export interface EdinetDocumentsResponse {
  metadata?: Record<string, unknown>;
  results?: EdinetDocumentListEntry[];
}

export interface EdinetResolvedCompany {
  identifier: string;
  edinetCode: string;
  filerName?: string;
}

export interface EdinetOfficialApiOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
}

function normalizeEdinetCode(value: string): string {
  return value.trim().toUpperCase();
}

export function selectLatestAnnualSecuritiesReport(
  entries: EdinetDocumentListEntry[],
  edinetCode: string
): EdinetDocumentListEntry | null {
  return [...entries]
    .filter((entry) =>
      entry.edinetCode?.toUpperCase() === edinetCode.toUpperCase() &&
      entry.docDescription?.includes("有価証券報告書") &&
      entry.xbrlFlag === "1" &&
      entry.disclosureStatus === "0" &&
      typeof entry.docID === "string"
    )
    .sort((left, right) => (right.submitDateTime ?? "").localeCompare(left.submitDateTime ?? ""))[0] ?? null;
}

export function createEdinetOfficialApi(options: EdinetOfficialApiOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(url: string): Promise<Response> {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError("EDINET API key was rejected.");
    }

    if (response.status === 404) {
      throw new NotFoundError(`EDINET resource was not found at ${url}.`);
    }

    if (!response.ok) {
      throw new UpstreamError("EDINET request failed.", {
        url,
        status: response.status,
        body: await response.text()
      });
    }

    return response;
  }

  function withApiKey(url: URL): string {
    url.searchParams.set("Subscription-Key", options.apiKey);
    return url.toString();
  }

  return {
    async getDocumentsForDate(date: string, type = "2"): Promise<EdinetDocumentListEntry[]> {
      const url = new URL("https://api.edinet-fsa.go.jp/api/v2/documents.json");
      url.searchParams.set("date", date);
      url.searchParams.set("type", type);
      const response = await request(withApiKey(url));
      const json = (await response.json()) as EdinetDocumentsResponse;
      return json.results ?? [];
    },

    async downloadDocument(docId: string, type = "1"): Promise<Buffer> {
      const url = new URL(`https://api.edinet-fsa.go.jp/api/v2/documents/${docId}`);
      url.searchParams.set("type", type);
      const response = await request(withApiKey(url));
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },

    resolveCompany(identifier: string, aliases: Record<string, string> = {}): EdinetResolvedCompany {
      const normalized = identifier.trim().toUpperCase();
      const aliased = aliases[normalized];

      if (aliased) {
        return {
          identifier: normalized,
          edinetCode: normalizeEdinetCode(aliased)
        };
      }

      if (/^E\d{5}$/i.test(normalized)) {
        return {
          identifier: normalized,
          edinetCode: normalizeEdinetCode(normalized)
        };
      }

      throw new NotFoundError(
        `No EDINET company mapping could be resolved for identifier ${identifier}.`,
        { regime: "edinet", identifier }
      );
    }
  };
}
