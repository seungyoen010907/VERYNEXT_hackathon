/**
 * 현재 사용자(Viewer)와 권한 규칙
 *
 * Supabase Auth 연동 전까지는 데모 계정 2개(양도인·양수인)로 동작한다.
 * 화면 상단의 사용자 메뉴에서 계정을 바꿀 수 있고, 선택은 쿠키에 저장한다.
 */
import type { UserRole } from "@/types/domain";
import { forbidden } from "./errors";

export interface Viewer {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export const DEMO_USERS = {
  seller: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "seller@demo.local",
    displayName: "김양도 (데모 양도인)",
    role: "seller",
  },
  buyer: {
    id: "00000000-0000-4000-8000-000000000002",
    email: "buyer@demo.local",
    displayName: "이인수 (데모 양수인)",
    role: "buyer",
  },
} as const satisfies Record<string, Viewer>;

export type DemoUserKey = keyof typeof DEMO_USERS;
export const DEMO_USER_COOKIE = "demo_user";

export function demoViewer(key: string | undefined): Viewer {
  return key === "buyer" ? DEMO_USERS.buyer : DEMO_USERS.seller;
}

export interface StoreAccess {
  ownerId: string;
  isPublished: boolean;
}

export function canView(viewer: Viewer, store: StoreAccess): boolean {
  return viewer.role === "admin" || store.ownerId === viewer.id || store.isPublished;
}

export function canEdit(viewer: Viewer, store: StoreAccess): boolean {
  return viewer.role === "admin" || store.ownerId === viewer.id;
}

export function assertCanEdit(viewer: Viewer, store: StoreAccess): void {
  if (!canEdit(viewer, store)) throw forbidden("매물 소유자만 할 수 있는 작업입니다.");
}
