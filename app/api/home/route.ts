// GET: 역할별 홈 (PRD 9번 화면 1, docs/DESIGN.md 10.5). 여정 단계와 에이전트 4종 활동을 실제 DB 기록으로 계산한다.

import { NextResponse } from "next/server";
import type { AgentActivity } from "@/lib/agent-registry";
import { getUser } from "@/lib/auth";
import { handleError } from "@/lib/http";
import { roughArea, VIRTUAL_KINDS_FILTER } from "@/lib/listings";
import { getSupabase } from "@/lib/supabase";
import { getBuyerProfile } from "@/lib/visible";

type Status = "done" | "current" | "todo";

// 처음으로 끝나지 않은 단계를 current로
function withCurrent(done: boolean[]): Status[] {
  const first = done.findIndex((d) => !d);
  return done.map((d, i) => (d ? "done" : i === first ? "current" : "todo"));
}

const latest = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;
const WAITING = ["created", "queued", "answering"];
const BLOCKED = ["rejected", "needs_documents", "error"];

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    const supabase = getSupabase();

    if (user.roles.includes("seller")) {
      const { data: listings, error } = await supabase
        .from("deals")
        .select("id, business_name, address, business_type, status, is_sample, created_at")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (listings ?? []).map((l) => l.id);
      const empty = { data: [], error: null };
      const [docs, inputs, grants, questions, rooms] = ids.length
        ? await Promise.all([
            supabase.from("documents").select("deal_id, verification_status, access_level, summary_access_level, updated_at").in("deal_id", ids).not("kind", "in", VIRTUAL_KINDS_FILTER),
            supabase.from("data_points").select("listing_id").in("listing_id", ids).like("key", "input.%"),
            supabase.from("access_grants").select("listing_id, status, buyer_id").in("listing_id", ids),
            supabase.from("agent_messages").select("listing_id, status, buyer_id, updated_at").in("listing_id", ids),
            supabase.from("checklist_items").select("deal_id, buyer_id").in("deal_id", ids).not("buyer_id", "is", null),
          ])
        : [empty, empty, empty, empty, empty];
      for (const r of [docs, inputs, grants, questions, rooms]) if (r.error) throw r.error;
      const D = docs.data ?? [];
      const G = grants.data ?? [];
      const Q = questions.data ?? [];

      const items = (listings ?? []).map((l) => {
        const d = D.filter((x) => x.deal_id === l.id);
        const g = G.filter((x) => x.listing_id === l.id);
        const q = Q.filter((x) => x.listing_id === l.id);
        const analyzed = d.filter((x) => x.verification_status === "analyzed").length;
        const hasInputs = (inputs.data ?? []).some((x) => x.listing_id === l.id);
        const shared = d.some((x) => x.access_level !== "L3" || x.summary_access_level !== "L3");
        const pending = g.filter((x) => x.status === "requested").length;
        const roomCount = new Set((rooms.data ?? []).filter((x) => x.deal_id === l.id).map((x) => x.buyer_id)).size;
        const steps = withCurrent([true, analyzed > 0 || hasInputs, shared, l.status === "published", (g.length > 0 || q.length > 0) && pending === 0, false]);
        if (roomCount > 0) steps[5] = "current";
        return {
          id: l.id,
          name: l.business_name ?? l.address,
          business_type: l.business_type,
          status: l.status,
          is_sample: l.is_sample,
          steps,
          documents: d.length,
          analyzed,
          failed: d.filter((x) => x.verification_status === "ai_failed").length,
          pending_requests: pending,
          answered: q.filter((x) => x.status === "answered").length,
          questions: q.length,
          buyers: new Set([...q.map((x) => x.buyer_id), ...g.map((x) => x.buyer_id)]).size,
          deal_rooms: roomCount,
        };
      });

      const agents: AgentActivity[] = [
        {
          key: "seller",
          stat: `매물 ${items.length}곳 · 답변 ${items.reduce((a, i) => a + i.answered, 0)}건`,
          detail: `승인 대기 ${items.reduce((a, i) => a + i.pending_requests, 0)}건`,
          last_at: latest(Q.map((x) => x.updated_at)),
          active: Q.some((x) => WAITING.includes(x.status)),
        },
        {
          key: "document",
          stat: `자료 ${items.reduce((a, i) => a + i.analyzed, 0)}개 읽음`,
          detail: items.some((i) => i.failed) ? `읽지 못한 자료 ${items.reduce((a, i) => a + i.failed, 0)}개 — 다시 읽을 수 있어요` : "매출 검증에 반영돼요",
          last_at: latest(D.map((x) => x.updated_at)),
          active: false,
        },
        {
          key: "buyer",
          stat: `양수인 ${new Set(Q.map((x) => x.buyer_id)).size}명의 AI가 질문`,
          detail: `질문 ${Q.length}건`,
          last_at: latest(Q.map((x) => x.updated_at)),
          active: false,
        },
      ];
      return NextResponse.json({ role: "seller", listings: items, agents, pending_total: items.reduce((a, i) => a + i.pending_requests, 0) });
    }

    // ---- 양수인 ----
    const [profile, tasks, messages, summaries, rooms] = await Promise.all([
      getBuyerProfile(user.id),
      supabase.from("agent_tasks").select("id, created_at, listing_ids").eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("agent_messages").select("listing_id, status, answer_type, created_at, updated_at, task_id").eq("buyer_id", user.id),
      supabase.from("comparison_reports").select("created_at, listing_ids").eq("buyer_id", user.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("checklist_items").select("deal_id").eq("buyer_id", user.id),
    ]);
    for (const r of [tasks, messages, summaries, rooms]) if (r.error) throw r.error;
    const M = messages.data ?? [];
    const task = tasks.data?.[0] ?? null;
    const taskIds = task?.listing_ids ?? [];
    const { data: names, error: nameError } = taskIds.length
      ? await supabase.from("deals").select("id, address, business_type, is_sample").in("id", taskIds)
      : { data: [], error: null };
    if (nameError) throw nameError;
    const { data: docs, error: docError } = taskIds.length
      ? await supabase.from("documents").select("verification_status, updated_at").in("deal_id", taskIds).not("kind", "in", VIRTUAL_KINDS_FILTER)
      : { data: [], error: null };
    if (docError) throw docError;

    // 최근 실사의 매물별 질문 상태 (연결도)
    const nodes = taskIds.map((id: string) => {
      const l = (names ?? []).find((x) => x.id === id);
      const q = M.filter((m) => m.listing_id === id);
      return {
        id,
        name: l ? `${roughArea(l.address)} ${l.business_type}` : "매물",
        is_sample: !!l?.is_sample,
        answered: q.filter((m) => m.status === "answered").length,
        waiting: q.filter((m) => WAITING.includes(m.status)).length,
        pending: q.filter((m) => m.status === "pending_approval").length,
        blocked: q.filter((m) => BLOCKED.includes(m.status)).length,
        total: q.length,
      };
    });
    const waiting = M.filter((m) => WAITING.includes(m.status) || m.status === "pending_approval").length;
    const dealRooms = new Set((rooms.data ?? []).map((r) => r.deal_id)).size;
    const summaryCount = (summaries.data ?? []).length;

    const steps = withCurrent([!!profile, !!task, !!task && waiting === 0, summaryCount > 0, false]);
    if (dealRooms > 0) steps[4] = "current";
    const next =
      !profile
        ? { label: "내 조건 넣기", href: "/buyer/profile", hint: "예산·지역·목표 수익을 알려주면 맞는 매물을 추천해 드려요" }
        : !task
          ? { label: "매물 고르기", href: "/listings", hint: "마음에 드는 매물을 최대 3개 담아 AI 실사를 시작해요" }
          : waiting > 0
            ? { label: "AI 실사 확인하기", href: "/diligence", hint: `답을 기다리는 질문이 ${waiting}개 있어요. NDA 동의나 양도인 승인이 필요할 수 있어요` }
            : summaryCount === 0
              ? { label: "비교하고 고르기", href: "/compare", hint: "같은 기준으로 비교하고, 매물별 리포트로 자세히 봐요" }
              : { label: "거래방 열기", href: "/deals", hint: "고른 매물의 양도인과 직접 이야기해요" };

    const agents: AgentActivity[] = [
      { key: "buyer", stat: `질문 ${M.length}건 보냄`, detail: task ? `최근 실사 매물 ${taskIds.length}곳` : "실사를 시작하면 대신 물어봐요", last_at: latest(M.map((m) => m.created_at)), active: M.some((m) => WAITING.includes(m.status)) },
      { key: "seller", stat: `답변 ${M.filter((m) => m.status === "answered").length}건 받음`, detail: `승인 대기 ${M.filter((m) => m.status === "pending_approval").length}건`, last_at: latest(M.filter((m) => m.status !== "created").map((m) => m.updated_at)), active: M.some((m) => m.status === "answering") },
      { key: "document", stat: `실사 매물 자료 ${(docs ?? []).filter((d) => d.verification_status === "analyzed").length}개 읽음`, detail: "숫자를 뽑고 자료끼리 맞춰봐요", last_at: latest((docs ?? []).map((d) => d.updated_at)), active: false },
      { key: "diligence", stat: `통합 분석 ${summaryCount}건`, detail: summaryCount ? "비교와 리포트에 반영했어요" : "답이 모이면 비교와 리포트를 만들어요", last_at: latest((summaries.data ?? []).map((s) => s.created_at)), active: false },
    ];

    return NextResponse.json({ role: "buyer", profile, steps, next, nodes, task_id: task?.id ?? null, agents, deal_rooms: dealRooms });
  } catch (e) {
    return handleError(e);
  }
}
