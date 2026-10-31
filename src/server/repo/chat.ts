import { z } from "zod";
import type { ChatMessage } from "@/types/domain";
import { getChatProvider } from "../chat/answer";
import type { Db } from "../db/client";
import { badRequest } from "../errors";
import type { Viewer } from "../viewer";
import { getAnalysisBundle } from "./analyses";
import { getChecklist } from "./diligence";
import { camelizeAll } from "./mappers";

export const chatInputSchema = z.object({
  message: z.string().trim().min(1, "질문을 입력하세요").max(2000),
});

export async function listChat(db: Db, viewer: Viewer, analysisId: string): Promise<ChatMessage[]> {
  await getAnalysisBundle(db, viewer, analysisId);
  const rows = await db.query(
    `select * from chat_messages where analysis_id = $1 and user_id = $2 order by created_at, role desc`,
    [analysisId, viewer.id],
  );
  return camelizeAll<ChatMessage>(rows);
}

export async function askQuestion(db: Db, viewer: Viewer, analysisId: string, message: string): Promise<ChatMessage[]> {
  const bundle = await getAnalysisBundle(db, viewer, analysisId);
  if (bundle.analysis.status !== "completed") throw badRequest("완료된 분석에 대해서만 상담할 수 있습니다.");
  const checklist = await getChecklist(db, bundle.store);
  const answer = await getChatProvider().answer(bundle, checklist, message);
  return db.transaction(async (tx) => {
    const rows = await tx.query(
      `insert into chat_messages (analysis_id, store_id, user_id, role, content, cited_sources)
       values ($1, $2, $3, 'user', $4, '[]'),
              ($1, $2, $3, 'assistant', $5, $6)
       returning *`,
      [analysisId, bundle.store.id, viewer.id, message, answer.content, JSON.stringify(answer.citedSources)],
    );
    return camelizeAll<ChatMessage>(rows);
  });
}
