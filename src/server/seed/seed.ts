/**
 * 로컬 DB 초기 데이터
 * 데모 계정 2개와 테스트 시나리오 매물 6개를 만든다.
 * 시나리오 매물도 실제 기능과 같은 경로(업로드 → 분석 결과 가져오기 → 종합 분석)로 만든다.
 */
import type { Db } from "../db/client";
import { importExtraction } from "../ingest/service";
import { createAndRunFullAnalysis } from "../repo/analyses";
import { createDocumentRequest } from "../repo/diligence";
import { uploadDocument } from "../repo/documents";
import { generateReport } from "../repo/reports";
import { createStore } from "../repo/stores";
import { DEMO_USERS } from "../viewer";
import { SCENARIOS } from "./scenarios";

/** 텍스트 한 줄짜리 최소 PDF. 테스트 자료임을 파일 안에도 표시한다. */
export function placeholderPdf(lines: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, "?");
  const text = lines.map((l, i) => `BT /F1 12 Tf 50 ${780 - i * 18} Td (${esc(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

export async function seedDemoUsers(db: Db): Promise<void> {
  for (const u of Object.values(DEMO_USERS)) {
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3) on conflict (id) do nothing`,
      [u.id, u.email, JSON.stringify({ role: u.role, display_name: u.displayName })],
    );
  }
}

export async function seedScenarios(db: Db): Promise<void> {
  const seller = DEMO_USERS.seller;
  for (const sc of SCENARIOS) {
    const store = await createStore(db, seller, { ...sc.store, isPublished: true }, { isTestData: true });
    for (const doc of sc.documents) {
      const bytes = placeholderPdf([
        "TEST DATA - SAMPLE DOCUMENT (NOT A REAL STORE)",
        `scenario: ${sc.key}`,
        `document_type: ${doc.documentType}`,
      ]);
      const { document } = await uploadDocument(db, seller, {
        storeId: store.id,
        documentType: doc.documentType,
        fileName: doc.fileName,
        bytes,
      });
      await importExtraction(db, seller, { storeId: store.id, documentId: document.id, raw: doc.extraction });
    }
    if (sc.runAnalysis) {
      const bundle = await createAndRunFullAnalysis(db, seller, store.id);
      if (sc.key === "normal") await generateReport(db, seller, bundle.analysis.id);
    }
    if (sc.requestChecklistKeys) {
      await createDocumentRequest(db, DEMO_USERS.buyer, store.id, { checklistKeys: sc.requestChecklistKeys });
    }
  }
}

export async function seedIfEmpty(db: Db): Promise<void> {
  const rows = await db.query<{ n: number }>(`select count(*)::int as n from public.users`);
  if (rows[0].n > 0) return;
  await seedDemoUsers(db);
  await seedScenarios(db);
}

/** 테스트 매물만 지우고 다시 만든다. 사용자가 등록한 매물은 유지한다. */
export async function resetTestData(db: Db): Promise<void> {
  await db.query(`delete from stores where is_test_data`);
  await seedDemoUsers(db);
  await seedScenarios(db);
}
