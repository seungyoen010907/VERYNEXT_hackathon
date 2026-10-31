import type { ActorKind, DealEventType } from "@/types/domain";
import type { Db } from "../db/client";

export async function recordDealEvent(
  db: Db,
  e: { dealId: string; actorKind: ActorKind; actorId: string | null; type: DealEventType; title: string; detail?: Record<string, unknown> },
): Promise<void> {
  await db.query(
    `insert into deal_events (deal_id, actor_kind, actor_id, type, title, detail) values ($1,$2,$3,$4,$5,$6)`,
    [e.dealId, e.actorKind, e.actorId, e.type, e.title.slice(0, 300), JSON.stringify(e.detail ?? {})],
  );
}
