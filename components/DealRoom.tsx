"use client";

// 거래방 한 화면: 거래 정보, 로드맵, 체크리스트, 자료 목록, 메시지.
// Step 1은 lib/mock.ts의 가짜 데이터를 쓰고, 업로드는 화면에만 반영한다.

import Link from "next/link";
import { useState } from "react";
import Checklist from "@/components/Checklist";
import Messages from "@/components/Messages";
import Roadmap from "@/components/Roadmap";
import { ROLE_LABEL, useRole } from "@/components/RoleSwitch";
import { formatDate, won } from "@/lib/format";
import { mockChecklist, mockDeal, mockDocuments, mockMessages } from "@/lib/mock";
import { getRoadmap, stageTitle } from "@/lib/roadmap";
import type { ChecklistItem, DealDocument } from "@/lib/types";

export default function DealRoom({ id }: { id: string }) {
  const role = useRole();
  const deal = { ...mockDeal, id };
  const [checklist, setChecklist] = useState(mockChecklist);
  const [documents, setDocuments] = useState(mockDocuments);

  // 양수인은 양도인이 동의하기 전에는 자료를 볼 수 없다 (API.md 4번)
  const canSeeDocuments = role === "seller" || deal.seller_consent;

  function handleUpload(item: ChecklistItem, file: File) {
    const doc: DealDocument = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      checklist_key: item.key,
      file_name: file.name,
      size: file.size,
    };
    setDocuments((prev) => [...prev, doc]);
    setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "done" } : i)));
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs text-muted">
          {deal.business_type} · {formatDate(deal.created_at)} · 지금 {ROLE_LABEL[role]} 화면
        </p>
        <h1 className="mt-1 text-xl font-bold">{deal.address}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3">
          <Info label="권리금" value={won(deal.premium)} />
          <Info label="보증금" value={won(deal.deposit)} />
          <Info label="월세" value={won(deal.monthly_rent)} />
          <Info label="주장 월매출" value={won(deal.claimed_monthly_sales)} />
          <Info label="주장 월 순수익" value={won(deal.claimed_monthly_profit)} />
          <Info label="자료 공개 동의" value={deal.consent_at ? `동의함 (${formatDate(deal.consent_at)})` : "아직 안 함"} />
        </dl>
      </section>

      <Card title="계약 로드맵">
        <Roadmap steps={getRoadmap(deal.stage)} />
      </Card>

      <Card title={`내 체크리스트 (${ROLE_LABEL[role]})`}>
        <Checklist items={checklist} role={role} currentStage={deal.stage} onUpload={handleUpload} />
      </Card>

      <Card title="제출된 자료">
        {!canSeeDocuments ? (
          <p className="rounded-lg bg-bg p-3 text-sm text-muted">양도인이 자료 공개에 동의하면 볼 수 있어요.</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-muted">아직 올린 자료가 없어요.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">{d.file_name}</span>
                <span className="shrink-0 text-xs text-muted">{Math.max(1, Math.ceil(d.size / 1024))}KB</span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/deals/${deal.id}/report`}
          className="mt-4 block rounded-lg bg-accent py-2.5 text-center font-medium text-white"
        >
          검증 리포트 보기
        </Link>
        <p className="mt-2 text-center text-xs text-muted">현재 단계: {stageTitle(deal.stage)}</p>
      </Card>

      <Card title="메시지">
        <Messages initial={mockMessages} role={role} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
