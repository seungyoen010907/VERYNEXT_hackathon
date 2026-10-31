/**
 * AI 문서 분석 어댑터
 *
 * 다른 팀원이 개발하는 문서 분석 모듈을 이 인터페이스 뒤에 연결한다.
 *  - HttpDocumentAnalysisProvider: DOCUMENT_ANALYSIS_API_URL 이 설정되면 파일을 보내고 추출 JSON(v1)을 받는다.
 *  - SampleFixtureProvider: 외부 모듈이 없을 때 테스트 매물에 한해 미리 준비한 샘플 JSON을 돌려준다.
 * 둘 다 없으면 분석하지 않는다. 사용자는 분석 결과 JSON을 직접 가져올 수 있다 (POST /api/analysis/import).
 */
import type { DocumentType } from "@/types/domain";
import { AppError } from "../errors";
import { SCENARIOS, type ScenarioDocument } from "../seed/scenarios";
import { PENDING_UPLOADS } from "../seed/pending-uploads";

export interface AnalyzeRequest {
  storeName: string;
  /** 이 매물에 이미 반영된 샘플 분석 결과의 문서 종류 (같은 샘플을 두 번 넣지 않기 위함) */
  sampleTypesAlreadyImported?: DocumentType[];
  storeIsTestData: boolean;
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface DocumentAnalysisProvider {
  readonly name: string;
  /** 추출 스키마 v1 형식의 JSON을 돌려준다. 형식 검사는 정규화 단계에서 한다. */
  analyze(req: AnalyzeRequest): Promise<unknown>;
}

export class HttpDocumentAnalysisProvider implements DocumentAnalysisProvider {
  readonly name = "external-api";
  constructor(
    private readonly url: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs = 60_000,
  ) {}

  async analyze(req: AnalyzeRequest): Promise<unknown> {
    const form = new FormData();
    form.set("document_type", req.documentType);
    form.set("file", new Blob([new Uint8Array(req.bytes)], { type: req.mimeType }), req.fileName);
    const res = await fetch(this.url, {
      method: "POST",
      body: form,
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new AppError(502, "ANALYSIS_PROVIDER_ERROR", `문서 분석 모듈 오류 (HTTP ${res.status})`);
    }
    return res.json();
  }
}

export class SampleFixtureProvider implements DocumentAnalysisProvider {
  readonly name = "sample-fixture";

  async analyze(req: AnalyzeRequest): Promise<unknown> {
    if (req.sampleTypesAlreadyImported?.includes(req.documentType)) {
      throw new AppError(
        422,
        "SAMPLE_ALREADY_IMPORTED",
        "이 문서 종류의 샘플 분석 결과는 이미 반영되어 있어 다시 넣지 않았습니다 (같은 수치가 두 번 합산되는 것을 막기 위함).",
      );
    }
    const fixture = findFixture(req.storeName, req.documentType);
    if (!fixture) {
      throw new AppError(
        422,
        "NO_SAMPLE",
        "이 문서 종류에 준비된 샘플 분석 결과가 없습니다. 분석 결과 JSON을 직접 가져오세요.",
      );
    }
    return fixture.extraction;
  }
}

function findFixture(storeName: string, documentType: DocumentType): ScenarioDocument | undefined {
  const scenario = SCENARIOS.find((s) => s.store.name === storeName);
  if (!scenario) return undefined;
  return (
    PENDING_UPLOADS[scenario.key]?.find((d) => d.documentType === documentType) ??
    scenario.documents.find((d) => d.documentType === documentType)
  );
}

/** 사용할 분석 모듈. 없으면 null (분석 결과 JSON 가져오기만 가능). */
export function getDocumentAnalysisProvider(storeIsTestData: boolean): DocumentAnalysisProvider | null {
  const url = process.env.DOCUMENT_ANALYSIS_API_URL;
  if (url) return new HttpDocumentAnalysisProvider(url, process.env.DOCUMENT_ANALYSIS_API_KEY);
  if (storeIsTestData) return new SampleFixtureProvider();
  return null;
}

export function analysisProviderStatus(): { mode: "external" | "sample"; label: string } {
  return process.env.DOCUMENT_ANALYSIS_API_URL
    ? { mode: "external", label: "외부 문서 분석 모듈 연결됨" }
    : { mode: "sample", label: "외부 분석 모듈 미연결: 테스트 매물만 샘플 분석 결과 사용" };
}
