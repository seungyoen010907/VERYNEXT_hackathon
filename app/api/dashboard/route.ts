// GET: 통합 대시보드 (PRD 9번 화면 1). 역할에 따라 다른 숫자를 돌려준다.

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { handleError } from "@/lib/http";
import { getSupabase } from "@/lib/supabase";
import { getBuyerProfile } from "@/lib/visible";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    const supabase = getSupabase();

    if (user.roles.includes("seller")) {
      const { data: listings, error } = await supabase.from("deals").select("id, business_name, address, status, is_sample").eq("seller_id", user.id).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (listings ?? []).map((l) => l.id);
      const [docs, grants, questions] = ids.length
        ? await Promise.all([
            supabase.from("documents").select("deal_id, verification_status, kind").in("deal_id", ids).neq("kind", "report"),
            supabase.from("access_grants").select("listing_id, status").in("listing_id", ids),
            supabase.from("agent_messages").select("listing_id, status").in("listing_id", ids),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];
      const count = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) =>
        (rows ?? []).reduce<Record<string, number>>((acc, r) => ((acc[String(r[key])] = (acc[String(r[key])] ?? 0) + 1), acc), {});
      return NextResponse.json({
        role: "seller",
        listings: (listings ?? []).map((l) => ({
          ...l,
          documents: count((docs.data ?? []).filter((d) => d.deal_id === l.id), "verification_status"),
          grants: count((grants.data ?? []).filter((g) => g.listing_id === l.id), "status"),
          questions: count((questions.data ?? []).filter((q) => q.listing_id === l.id), "status"),
        })),
      });
    }

    const [profile, tasks, messages, summaries] = await Promise.all([
      getBuyerProfile(user.id),
      supabase.from("agent_tasks").select("id, created_at, listing_ids").eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("agent_messages").select("status, answer_type").eq("buyer_id", user.id),
      supabase.from("comparison_reports").select("created_at, listing_ids, result").eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(3),
    ]);
    for (const r of [tasks, messages, summaries]) if (r.error) throw r.error;
    const msgs = messages.data ?? [];
    return NextResponse.json({
      role: "buyer",
      profile,
      tasks: tasks.data,
      questions: {
        total: msgs.length,
        answered: msgs.filter((m) => m.status === "answered" && m.answer_type === "auto").length,
        pending_approval: msgs.filter((m) => m.status === "pending_approval").length,
        needs_documents: msgs.filter((m) => m.status === "needs_documents").length,
        denied: msgs.filter((m) => m.answer_type === "denied").length,
      },
      summaries: summaries.data,
    });
  } catch (e) {
    return handleError(e);
  }
}
