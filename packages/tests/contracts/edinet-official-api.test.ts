import { describe, expect, it, vi } from "vitest";
import {
  createEdinetOfficialApi,
  selectLatestAnnualSecuritiesReport
} from "../../adapters/edinet/src/official-api";

describe("EDINET official API helpers", () => {
  it("selects the latest annual securities report for a filer", () => {
    const report = selectLatestAnnualSecuritiesReport(
      [
        {
          docID: "old",
          edinetCode: "E02144",
          docDescription: "有価証券報告書",
          xbrlFlag: "1",
          disclosureStatus: "0",
          submitDateTime: "2024-06-21T00:00:00+09:00"
        },
        {
          docID: "new",
          edinetCode: "E02144",
          docDescription: "有価証券報告書",
          xbrlFlag: "1",
          disclosureStatus: "0",
          submitDateTime: "2025-06-20T00:00:00+09:00"
        }
      ],
      "E02144"
    );

    expect(report?.docID).toBe("new");
  });

  it("resolves a company via alias to an EDINET code", () => {
    const api = createEdinetOfficialApi({
      apiKey: "test-key",
      fetchImpl: vi.fn() as unknown as typeof fetch
    });

    expect(api.resolveCompany("TOYOTA", { TOYOTA: "E02144" })).toEqual({
      identifier: "TOYOTA",
      edinetCode: "E02144"
    });
  });

  it("calls the official documents endpoint with the subscription key", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      expect(url).toContain("https://api.edinet-fsa.go.jp/api/v2/documents.json");
      expect(url).toContain("Subscription-Key=test-key");
      return new Response(
        JSON.stringify({
          results: [
            {
              docID: "doc-1",
              edinetCode: "E02144",
              docDescription: "有価証券報告書",
              xbrlFlag: "1",
              disclosureStatus: "0",
              submitDateTime: "2025-06-20T00:00:00+09:00"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    });

    const api = createEdinetOfficialApi({
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch
    });

    await expect(api.getDocumentsForDate("2025-06-20")).resolves.toHaveLength(1);
  });
});
