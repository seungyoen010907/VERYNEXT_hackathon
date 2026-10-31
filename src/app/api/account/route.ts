import type { NextRequest } from "next/server";
import { handle, ok, readJson } from "@/server/http";
import { accountPatchSchema, getAccount, updateAccount } from "@/server/repo/account";

export async function GET(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => ok(await getAccount(db, viewer)));
}

export async function PATCH(request: NextRequest) {
  return handle(request, async ({ db, viewer }) => ok(await updateAccount(db, viewer, await readJson(request, accountPatchSchema))));
}
