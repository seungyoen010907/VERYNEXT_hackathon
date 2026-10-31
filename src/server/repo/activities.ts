import type { Activity, ActivityType } from "@/types/domain";
import { pgArray, type Db } from "../db/client";
import { camelizeAll } from "./mappers";

export interface NewActivity {
  storeId: string;
  actorId: string | null;
  type: ActivityType;
  title: string;
  detail?: Record<string, unknown>;
  documentId?: string | null;
  analysisId?: string | null;
}

export async function recordActivity(db: Db, a: NewActivity): Promise<void> {
  await db.query(
    `insert into activities (store_id, actor_id, type, title, detail, document_id, analysis_id)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [a.storeId, a.actorId, a.type, a.title, JSON.stringify(a.detail ?? {}), a.documentId ?? null, a.analysisId ?? null],
  );
}

export interface ActivityRow extends Activity {
  storeName: string;
  actorName: string | null;
}

export async function listActivities(
  db: Db,
  opts: { storeIds: string[]; limit?: number },
): Promise<ActivityRow[]> {
  if (opts.storeIds.length === 0) return [];
  const rows = await db.query(
    `select a.*, s.name as store_name, u.display_name as actor_name
       from activities a
       join stores s on s.id = a.store_id
       left join users u on u.id = a.actor_id
      where a.store_id = any($1::uuid[])
      order by a.created_at desc, a.id desc
      limit $2`,
    [pgArray(opts.storeIds), opts.limit ?? 50],
  );
  return camelizeAll<ActivityRow>(rows);
}
