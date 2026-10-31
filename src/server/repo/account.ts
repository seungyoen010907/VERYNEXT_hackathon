import { z } from "zod";
import type { Db } from "../db/client";
import type { Viewer } from "../viewer";

export const accountPatchSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  notificationPrefs: z.object({ messages: z.boolean(), ai: z.boolean(), requests: z.boolean() }).partial().optional(),
});

export interface Account {
  id: string;
  email: string;
  displayName: string;
  role: string;
  notificationPrefs: { messages: boolean; ai: boolean; requests: boolean };
  createdAt: string;
}

export async function getAccount(db: Db, viewer: Viewer): Promise<Account> {
  const rows = await db.query<Record<string, unknown>>(`select id, email, display_name, role, notification_prefs, created_at from users where id = $1`, [viewer.id]);
  const r = rows[0];
  return {
    id: r.id as string,
    email: r.email as string,
    displayName: r.display_name as string,
    role: r.role as string,
    notificationPrefs: { messages: true, ai: true, requests: true, ...(r.notification_prefs as object) },
    createdAt: r.created_at as string,
  };
}

/** 이름과 알림 설정만 바꿀 수 있다 (역할은 바꿀 수 없음, RLS 컬럼 권한과 동일) */
export async function updateAccount(db: Db, viewer: Viewer, patch: z.infer<typeof accountPatchSchema>): Promise<Account> {
  if (patch.displayName) await db.query(`update users set display_name = $2 where id = $1`, [viewer.id, patch.displayName]);
  if (patch.notificationPrefs) {
    await db.query(`update users set notification_prefs = notification_prefs || $2::jsonb where id = $1`, [viewer.id, JSON.stringify(patch.notificationPrefs)]);
  }
  return getAccount(db, viewer);
}
