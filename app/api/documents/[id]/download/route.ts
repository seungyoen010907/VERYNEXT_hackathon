// GET: 원본 파일 다운로드 링크 (60초짜리 signed URL). 원본 공개 등급으로 권한을 확인한다.

import { NextResponse } from "next/server";
import { canSee, loadAccess } from "@/lib/access";
import { audit } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { getListing, isVirtual } from "@/lib/listings";
import { BUCKET, getSupabase } from "@/lib/supabase";

export async function GET(request: Request, ctx: RouteContext<"/api/documents/[id]/download">) {
  try {
    const user = await getUser(request);
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "자료를 찾을 수 없어요.");
    const supabase = getSupabase();
    const { data: doc, error } = await supabase.from("documents").select("deal_id, storage_path, access_level, file_name, kind").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!doc || isVirtual(doc.kind)) throw new HttpError(404, "자료를 찾을 수 없어요.");

    const listing = await getListing(doc.deal_id);
    const access = await loadAccess(user, listing);
    if (!canSee(access, doc.access_level, { type: "document", id })) throw new HttpError(403, "이 자료의 원본을 볼 권한이 없어요.");

    const { data, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
    if (signError) throw signError;
    if (!access.isOwner) await audit(user.id, "download", doc.deal_id, doc.file_name);
    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    return handleError(e);
  }
}
