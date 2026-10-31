import type { NextRequest } from "next/server";
import type { StoreStatus } from "@/types/domain";
import { handle, ok, readJson } from "@/server/http";
import { createStore, listStores, storeInputSchema } from "@/server/repo/stores";

export async function GET(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => {
    const p = request.nextUrl.searchParams;
    const stores = await listStores(db, viewer, {
      q: p.get("q") ?? undefined,
      industry: p.get("industry") ?? undefined,
      region: p.get("region") ?? undefined,
      status: (p.get("status") as StoreStatus | null) ?? undefined,
    });
    return ok(stores);
  });
}

export async function POST(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => {
    const input = await readJson(request, storeInputSchema);
    return ok(await createStore(db, viewer, input), 201);
  });
}
