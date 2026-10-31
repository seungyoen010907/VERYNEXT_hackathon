import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, ok, readJson } from "@/server/http";
import { DEMO_USER_COOKIE, demoViewer } from "@/server/viewer";

const schema = z.object({ user: z.enum(["seller", "buyer"]) });

/** 데모 계정 전환 (Supabase Auth 연동 전 임시) */
export async function POST(request: NextRequest) {
  return handle(request, async () => {
    const { user } = await readJson(request, schema);
    const store = await cookies();
    store.set(DEMO_USER_COOKIE, user, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return ok(demoViewer(user));
  });
}

export async function GET(request: NextRequest) {
  return handle(request, async ({ viewer }) => ok(viewer));
}
