// GET/PUT: 양수인 인수 조건 (BuyerProfile). 양수인 AI가 추천·질문·비교에 쓴다.

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { handleError, HttpError } from "@/lib/http";
import { getSupabase } from "@/lib/supabase";
import { getBuyerProfile } from "@/lib/visible";

const MAX_AMOUNT = 10_000_000_000;

function num(v: unknown, label: string, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(400, `${label} 값을 확인해주세요.`);
  return Math.round(n);
}

function list(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    return NextResponse.json({ profile: await getBuyerProfile(user.id) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getUser(request);
    if (!user.roles.includes("buyer")) throw new HttpError(403, "양수인만 인수 조건을 저장할 수 있어요.");
    const b = await request.json().catch(() => {
      throw new HttpError(400, "요청 형식이 올바르지 않아요.");
    });
    const profile = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
      budget_total: num(b.budget_total, "총예산", MAX_AMOUNT),
      regions: list(b.regions),
      business_types: list(b.business_types),
      target_monthly_profit: num(b.target_monthly_profit, "목표 월 순수익", MAX_AMOUNT),
      weekly_hours: num(b.weekly_hours, "주당 근무 가능 시간", 168),
      experience: typeof b.experience === "string" ? b.experience.trim().slice(0, 300) || null : null,
      payback_months: num(b.payback_months, "목표 회수 기간", 600),
      notes: typeof b.notes === "string" ? b.notes.trim().slice(0, 500) || null : null,
    };
    const { data, error } = await getSupabase().from("buyer_profiles").upsert(profile).select("*").single();
    if (error) throw error;
    return NextResponse.json({ profile: data });
  } catch (e) {
    return handleError(e);
  }
}
