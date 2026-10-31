"use client";

// 매물 데이터룸 (PRD 9번 화면 3). 양도인 본인은 전부 보고 고칠 수 있고,
// 다른 사용자는 서버가 공개 등급으로 걸러서 준 것만 본다.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import InputsTab from "@/components/InputsTab";
import AgentIcon from "@/components/viz/AgentIcon";
import { AGENTS } from "@/lib/agent-registry";
import ReportView from "@/components/ReportView";
import { useUser } from "@/components/RoleSwitch";
import Tag from "@/components/Tag";
import { apiFetch } from "@/lib/api-client";
import { formatDate, formatTime, won } from "@/lib/format";
import { ACCESS_LABEL, CATEGORY_LABEL, DOC_TYPE_LABEL, TRUST_LABEL, VERIFICATION_LABEL, dataPointLabel, formatPointValue } from "@/lib/labels";
import { NDA_TEXT, NDA_VERSION } from "@/lib/nda";
import {
  ACCESS_LEVELS,
  type AccessLevel,
  type DataPoint,
  type DataRoom,
  type DocCategory,
  type Listing,
  type ListingDocument,
  type LockedItem,
  type PublicListing,
} from "@/lib/types";

// 탭 4개 (docs/DESIGN.md 10.2): 개요 / 자료 / 비용·시설 / 공개 범위. 양수인에게는 개요·자료만.
type TabKey = "overview" | "docs" | "inputs" | "access";

const TABS: { key: TabKey; label: string; ownerOnly?: boolean }[] = [
  { key: "overview", label: "한눈에" },
  { key: "docs", label: "자료" },
  { key: "inputs", label: "비용·시설", ownerOnly: true },
  { key: "access", label: "공개 범위", ownerOnly: true },
];
const CATEGORIES: DocCategory[] = ["sales", "cost", "contract", "facility", "other"];

const ACCESS_TONE: Record<AccessLevel, "outline" | "caution" | "warn" | "muted"> = {
  L0: "outline",
  L1: "caution",
  L2: "caution",
  L3: "muted",
};

export default function DataRoomView({ id }: { id: string }) {
  const user = useUser();
  const [room, setRoom] = useState<DataRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [category, setCategory] = useState<DocCategory>("sales");

  const load = useCallback(() => {
    apiFetch<DataRoom>(`/api/listings/${id}`)
      .then((r) => (setRoom(r), setError(null)))
      .catch((e: Error) => (setRoom(null), setError(e.message)));
  }, [id]);

  useEffect(load, [load, user.id]);

  if (error) return <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>;
  if (!room) return <p className="text-sm text-muted">불러오는 중...</p>;

  const owner = room.is_owner;
  const listing = room.listing;
  const full = owner ? (listing as Listing) : null;
  const tabs = owner ? TABS : TABS.filter((t) => !t.ownerOnly);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Header room={room} onChanged={load} />
      {!owner && <BuyerAccessPanel room={room} onChanged={load} />}

      <nav className="flex gap-1 overflow-x-auto rounded-xl bg-card p-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "shrink-0 rounded-lg px-3 py-1.5 " + (tab === t.key ? "bg-accent font-medium text-white" : "text-muted hover:text-text")
            }
          >
            {t.label}
            {t.key === "docs" && <span className="ml-1 opacity-70">{room.documents.length}</span>}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-5">
          {owner && <SellerAgentScope room={room} onTab={setTab} />}
          <InfoTab listing={listing} full={full} />
          <AiTab room={room} onChanged={load} />
        </div>
      )}
      {tab === "docs" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="자료 종류">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={"rounded-full px-3 py-1.5 text-sm transition-colors " + (category === c ? "bg-accent text-white" : "bg-card text-muted hover:text-text")}
              >
                {CATEGORY_LABEL[c]} <span className="opacity-70">{room.documents.filter((d) => d.category === c).length}</span>
              </button>
            ))}
          </div>
          <DocumentsTab room={room} category={category} onChanged={load} />
        </div>
      )}
      {tab === "inputs" && full && <InputsTab listing={full} onChanged={load} />}
      {tab === "access" && owner && <AccessTab room={room} onChanged={load} />}
    </div>
  );
}

// ---- 상단 ----

function Header({ room, onChanged }: { room: DataRoom; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l = room.listing;
  const full = room.is_owner ? (l as Listing) : null;
  const title = full ? (full.business_name ?? full.address) : `${(l as PublicListing).area} ${l.business_type}`;

  async function toggle() {
    if (!full) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/listings/${l.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: full.status === "published" ? "draft" : "published" }),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "바꾸지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            자료실 · {l.business_type} · 등록 {formatDate(l.created_at)}
          </p>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold">
            {title}
            {l.is_sample && <Tag>샘플</Tag>}
            {l.status === "published" ? <Tag tone="outline">공개 중</Tag> : <Tag>아직 나만 보여요</Tag>}
          </h1>
          <p className="mt-1 text-sm text-muted">{full ? full.address : `${(l as PublicListing).area} (자세한 주소는 비공개)`}</p>
        </div>
        {full && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className={
              "shrink-0 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 " +
              (full.status === "published" ? "bg-bg text-text" : "bg-accent text-white")
            }
          >
            {busy ? "바꾸는 중..." : full.status === "published" ? "다시 나만 보기" : "매물 공개하기"}
          </button>
        )}
      </div>
      {!room.is_owner && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={`/listings/${l.id}/report`} className="text-accent">
            리포트 보기
          </Link>
          <Link href={`/deals/${l.id}`} className="text-accent">
            양도인과 이야기하기
          </Link>
        </div>
      )}
      {room.is_owner && (
        <Link href={`/listings/${l.id}/requests`} className="mt-3 inline-flex items-center gap-2 text-sm text-accent">
          받은 요청
          {room.pending_requests > 0 && <Tag tone="warn">{`처리할 요청 ${room.pending_requests}`}</Tag>}
        </Link>
      )}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}
    </section>
  );
}

// ---- 개요: 양도인 AI가 답할 수 있는 범위 (주제별 가장 열린 공개 등급) ----

const TOPICS: { label: string; cats: DocCategory[]; input?: "input_cost" | "input_facility" }[] = [
  { label: "매출", cats: ["sales"] },
  { label: "비용", cats: ["cost"], input: "input_cost" },
  { label: "임대차·계약", cats: ["contract"] },
  { label: "시설", cats: ["facility"], input: "input_facility" },
];
const LEVEL_STEP: Record<AccessLevel, number> = { L0: 4, L1: 3, L2: 2, L3: 1 };

function SellerAgentScope({ room, onTab }: { room: DataRoom; onTab: (t: TabKey) => void }) {
  const analyzed = room.documents.filter((d) => d.verification_status === "analyzed").length;
  const failed = room.documents.filter((d) => d.verification_status === "ai_failed").length;
  const rows = TOPICS.map((t) => {
    const levels = [
      ...room.documents.filter((d) => t.cats.includes(d.category)).map((d) => d.summary_access_level),
      ...room.input_access.filter((i) => i.key === t.input).map((i) => i.level),
    ];
    const best = levels.length ? levels.reduce((a, b) => (LEVEL_STEP[b] > LEVEL_STEP[a] ? b : a)) : null;
    return { ...t, best, count: levels.length };
  });
  return (
    <section className="grid gap-4 rounded-xl bg-card p-5 lg:grid-cols-[1fr_16rem]">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
            <AgentIcon agent="seller" />
          </span>
          <div>
            <p className="font-bold">
              이 매물의 {AGENTS.seller.name}
            </p>
            <p className="text-xs text-muted">양수인이 물어보면 공개한 만큼만 대신 답해요.</p>
          </div>
        </div>
        <ul className="mt-4 space-y-2.5">
          {rows.map((r, i) => (
            <li key={r.label} className="grid grid-cols-[5.5rem_1fr_6.5rem] items-center gap-3 text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="flex h-2 gap-0.5" role="img" aria-label={`${r.label}: ${r.best ? ACCESS_LABEL[r.best] : "자료 없음"}`}>
                {[1, 2, 3, 4].map((n) => (
                  <span
                    key={n}
                    className={"viz-grow-x flex-1 rounded-full " + (r.best && n <= LEVEL_STEP[r.best] ? (LEVEL_STEP[r.best] >= 3 ? "bg-accent" : "bg-caution/70") : "bg-border")}
                    style={{ animationDelay: `${i * 80 + n * 40}ms` }}
                  />
                ))}
              </span>
              <span className="text-right text-xs text-muted">{r.best ? ACCESS_LABEL[r.best] : "자료 없음"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted">막대가 길수록 더 많이 공개한 거예요. (나만 보기 → 승인 후 → NDA 후 → 모두 공개)</p>
      </div>
      <div className="space-y-2 text-sm">
        <div className="rounded-lg bg-bg p-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <AgentIcon agent="document" className="size-4" /> {AGENTS.document.name}
          </p>
          <p className="mt-1 font-bold tabular-nums">
            자료 {analyzed}/{room.documents.length}개 읽음
          </p>
          {failed > 0 && <p className="text-xs text-warn">읽지 못한 자료 {failed}개 — 자료 탭에서 다시 읽기</p>}
        </div>
        <button type="button" onClick={() => onTab("docs")} className="w-full rounded-lg bg-bg px-3 py-2 text-left text-sm hover:text-accent">
          자료 올리기 →
        </button>
        <button type="button" onClick={() => onTab("access")} className="w-full rounded-lg bg-bg px-3 py-2 text-left text-sm hover:text-accent">
          누구에게 보일지 정하기 →
        </button>
      </div>
    </section>
  );
}

// ---- 기본정보 ----

function InfoTab({ listing, full }: { listing: Listing | PublicListing; full: Listing | null }) {
  const n = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "미입력" : `${v}${unit}`);
  const rows: [string, React.ReactNode][] = [
    ["업종", listing.business_type],
    ["희망 권리금", won(listing.premium)],
    ["보증금", won(listing.deposit)],
    ["월세", won(listing.monthly_rent)],
    ["층", full ? `${n(full.floor, "층")} / 전체 ${n(full.total_floors, "층")}` : n(listing.floor, "층")],
    ["면적", n(listing.area_pyeong, "평")],
    ["매물 테마", listing.themes.length ? listing.themes.join(", ") : "없음"],
  ];
  if (full) {
    const pb = full.premium_breakdown;
    rows.push(
      ["상호명", full.business_name ?? "미입력"],
      ["건물명", full.building_name ?? "미입력"],
      ["브랜드", full.is_franchise === null ? "미입력" : full.is_franchise ? "프랜차이즈" : "개인 매장"],
      ["권리금 구성", pb ? `영업 ${won(pb.business)} · 시설 ${won(pb.facility)} · 바닥 ${won(pb.floor)}` : "미입력"],
      ["권리금 산정 근거", pb?.basis ?? "미입력"],
      ["주차", full.parking ? `건물 전체 ${n(full.parking.building_total, "대")} · 점포 ${n(full.parking.for_store, "대")}` : "미입력"],
      ["양도인이 말한 월매출", <span key="c">{won(full.claimed_monthly_sales)} <Tag>양도인 입력</Tag></span>],
      ["양도인이 말한 월 순수익", <span key="p">{won(full.claimed_monthly_profit)} <Tag>양도인 입력</Tag></span>],
    );
  }
  return (
    <section className="rounded-xl bg-card p-5">
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-bg pb-2">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="min-w-0 text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {!full && <p className="mt-4 text-xs text-muted">상호명, 자세한 주소, 양도인이 말한 매출은 NDA 전에는 보이지 않아요.</p>}
    </section>
  );
}

// ---- 자료 탭 (매출·비용·계약·시설·기타) ----

function DocumentsTab({ room, category, onChanged }: { room: DataRoom; category: DocCategory; onChanged: () => void }) {
  const docs = room.documents.filter((d) => d.category === category);
  return (
    <section className="space-y-4">
      {room.is_owner && <UploadBox listingId={room.listing.id} category={category} onUploaded={onChanged} />}
      {docs.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">
          {room.is_owner ? `아직 올린 ${CATEGORY_LABEL[category]} 자료가 없어요.` : `볼 수 있는 ${CATEGORY_LABEL[category]} 자료가 없어요.`}
        </p>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <DocumentCard
              key={d.id}
              doc={d}
              points={room.data_points.filter((p) => p.document_id === d.id)}
              owner={room.is_owner}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function UploadBox({ listingId, category, onUploaded }: { listingId: string; category: DocCategory; onUploaded: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const failed: string[] = [];
    for (const [i, file] of files.entries()) {
      setProgress(`${i + 1}/${files.length} 올리고 AI가 읽는 중... (파일당 10~30초)`);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("category", category);
        await apiFetch(`/api/listings/${listingId}/documents`, { method: "POST", body });
      } catch (err) {
        failed.push(err instanceof Error ? err.message : `${file.name}: 올리지 못했어요.`);
      }
    }
    setProgress(null);
    setFiles([]);
    if (failed.length) setError(failed.join(" / "));
    onUploaded();
  }

  return (
    <form onSubmit={upload} className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4">
      <input
        key={progress ?? "idle"}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        disabled={!!progress}
        className="min-w-0 flex-1 text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-bg file:px-3 file:py-2 file:text-sm file:text-text"
      />
      <button
        type="submit"
        disabled={!!progress || files.length === 0}
        className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {progress ? "올리는 중..." : `${CATEGORY_LABEL[category]} 자료 올리기${files.length ? ` (${files.length})` : ""}`}
      </button>
      <p className="w-full text-xs text-muted">
        {progress ?? "PDF·엑셀·CSV·이미지를 10MB까지 올릴 수 있어요. 처음엔 나만 보이고, 공개 범위는 자료마다 정해요."}
      </p>
      {error && <p className="w-full rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
    </form>
  );
}

function DocumentCard({
  doc,
  points,
  owner,
  onChanged,
}: {
  doc: ListingDocument;
  points: DataPoint[];
  owner: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ex = doc.extraction;

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요. 잠시 후 다시 해 주세요.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    await run("download", async () => {
      const { url } = await apiFetch<{ url: string }>(`/api/documents/${doc.id}/download`);
      window.open(url, "_blank", "noopener");
    });
  }

  return (
    <article className="rounded-xl bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium break-all">{doc.file_name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {ex && <Tag tone="outline">{DOC_TYPE_LABEL[ex.doc_type]}</Tag>}
            {ex?.period_start && <Tag>{`${ex.period_start} ~ ${ex.period_end ?? "?"}`}</Tag>}
            <Tag tone={doc.verification_status === "ai_failed" ? "warn" : doc.verification_status === "analyzed" ? "outline" : "muted"}>
              {VERIFICATION_LABEL[doc.verification_status]}
            </Tag>
            <Tag tone={ACCESS_TONE[doc.access_level]}>원본 {ACCESS_LABEL[doc.access_level]}</Tag>
            <Tag tone={ACCESS_TONE[doc.summary_access_level]}>요약 {ACCESS_LABEL[doc.summary_access_level]}</Tag>
            <span className="text-xs text-muted">{formatTime(doc.updated_at)} 수정</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-sm">
          {owner && doc.verification_status === "ai_failed" && (
            <button type="button" disabled={!!busy} onClick={() => run("analyze", () => apiFetch(`/api/documents/${doc.id}/analyze`, { method: "POST" }))} className="text-accent disabled:opacity-50">
              {busy === "analyze" ? "읽는 중..." : "AI로 다시 읽기"}
            </button>
          )}
          {owner && (
            <button type="button" disabled={!!busy} onClick={download} className="text-accent disabled:opacity-50">
              {busy === "download" ? "여는 중..." : "원본 보기"}
            </button>
          )}
          {(ex || points.length > 0) && (
            <button type="button" onClick={() => setOpen(!open)} className="text-accent">
              {open ? "숫자 접기" : `AI가 뽑은 숫자 ${points.length}개`}
            </button>
          )}
        </div>
      </div>

      {ex && ex.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-caution/10 p-3 text-xs text-caution">
          {ex.warnings.map((w) => (
            <li key={w}>AI가 본 점: {w}</li>
          ))}
        </ul>
      )}
      {doc.verification_status === "ai_failed" && (
        <p className="mt-3 rounded-lg bg-bg p-3 text-xs text-muted">AI가 이 자료를 읽지 못했어요. 파일은 저장돼 있으니 다시 읽어 보세요.</p>
      )}
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}

      {open && <PointsTable points={points} owner={owner} onChanged={onChanged} />}
    </article>
  );
}

function PointsTable({ points, owner, onChanged }: { points: DataPoint[]; owner: boolean; onChanged: () => void }) {
  if (points.length === 0) return <p className="mt-3 text-sm text-muted">AI가 뽑은 숫자가 없어요.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-2 font-medium">항목</th>
            <th className="py-2 font-medium">기간</th>
            <th className="py-2 text-right font-medium">값</th>
            <th className="py-2 pl-4 font-medium">믿을 수 있는 정도</th>
            <th className="py-2 font-medium">출처</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <PointRow key={p.id} point={p} owner={owner} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
      {owner && <p className="mt-2 text-xs text-muted">값을 고치면 &quot;양도인 입력&quot;으로 표시되고, 원래 값은 출처에 남아요.</p>}
    </div>
  );
}

function PointRow({ point, owner, onChanged }: { point: DataPoint; owner: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(point.value ?? ""));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await apiFetch(`/api/data-points/${point.id}`, { method: "PATCH", body: JSON.stringify({ value }) });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    }
  }

  return (
    <tr className="border-t border-bg align-top">
      <td className="py-2">{dataPointLabel(point.key)}</td>
      <td className="py-2 text-muted">{point.period ?? "-"}</td>
      <td className="py-2 text-right tabular-nums">
        {editing ? (
          <span className="flex justify-end gap-2">
            <input value={value} onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="w-32 rounded-md bg-bg px-2 py-1 text-right" />
            <button type="button" onClick={save} className="text-accent">
              저장
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-muted">
              취소
            </button>
          </span>
        ) : (
          <span>
            {formatPointValue(point)}
            {owner && (
              <button type="button" onClick={() => setEditing(true)} className="ml-2 text-xs text-accent">
                수정
              </button>
            )}
          </span>
        )}
        {error && <span className="block text-xs text-warn">{error}</span>}
      </td>
      <td className="py-2 pl-4">
        <Tag tone={point.trust_level === "owner_stated" ? "caution" : "outline"}>{TRUST_LABEL[point.trust_level]}</Tag>
      </td>
      <td className="py-2 text-xs text-muted">{point.source_note ?? "-"}</td>
    </tr>
  );
}

// ---- AI 분석 ----

function AiTab({ room, onChanged }: { room: DataRoom; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const analyzed = room.documents.filter((d) => d.verification_status === "analyzed").length;
  const missing = (["sales", "cost", "contract", "facility"] as DocCategory[]).filter((c) => !room.documents.some((d) => d.category === c));

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/listings/${room.listing.id}/verify`, { method: "POST" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "검증하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  if (!room.is_owner) {
    return room.report ? (
      <section className="space-y-3">
        <p className="text-xs text-muted">양도인이 공개한 매출 검증 결과예요. {formatTime(room.report.created_at)} 기준</p>
        <ReportView report={room.report.result} />
      </section>
    ) : (
      <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">
        양도인이 매출 검증 결과를 아직 공개하지 않았어요. 위 &quot;잠긴 자료&quot;에 있다면 열람을 요청해 보세요.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">매출 검증</p>
            <p className="text-sm text-muted">
              AI가 읽은 자료 {analyzed}개의 숫자끼리 맞는지 확인해요.
            </p>
          </div>
          <button type="button" onClick={verify} disabled={busy || analyzed === 0} className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "확인하는 중... (10~30초)" : room.report ? "다시 확인하기" : "매출 확인하기"}
          </button>
        </div>
        {missing.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted">더 올리면 좋은 자료:</span>
            {missing.map((c) => (
              <Tag key={c} tone="caution">
                {CATEGORY_LABEL[c]}
              </Tag>
            ))}
          </div>
        )}
        {error && <p className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      </div>

      {room.report ? (
        <>
          <p className="text-xs text-muted">{formatTime(room.report.created_at)} 기준</p>
          <ReportView report={room.report.result} />
        </>
      ) : (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">아직 매출 검증 전이에요. 자료를 올리고 &quot;매출 확인하기&quot;를 눌러 보세요.</p>
      )}
    </section>
  );
}

// ---- 공개 관리 ----

function AccessTab({ room, onChanged }: { room: DataRoom; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function change(doc: ListingDocument, field: "access_level" | "summary_access_level", level: AccessLevel) {
    setError(null);
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "PATCH", body: JSON.stringify({ [field]: level }) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "바꾸지 못했어요.");
    }
  }

  return (
    <section className="space-y-3">
      <div className="rounded-xl bg-card p-4 text-sm text-muted">
        <p>
          자료마다 <b className="text-text">원본 파일</b>과 <b className="text-text">AI가 뽑은 숫자</b>를 따로 공개할 수 있어요. 예: POS 원본은 나만 보고, 월별 매출 숫자만 모두에게 공개.
        </p>
        <p className="mt-1">모두 공개 · NDA 후 공개(NDA에 동의한 양수인) · 승인 후 공개(내가 승인한 양수인) · 나만 보기. 양도인 AI도 이 범위 안에서만 답해요.</p>
      </div>
      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{error}</p>}
      {room.documents.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-center text-sm text-muted">아직 올린 자료가 없어요.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">자료</th>
                <th className="px-4 py-3 font-medium">분류</th>
                <th className="px-4 py-3 font-medium">원본 파일</th>
                <th className="px-4 py-3 font-medium">AI가 뽑은 숫자</th>
                <th className="px-4 py-3 font-medium">수정 시각</th>
              </tr>
            </thead>
            <tbody>
              {room.report_access && (
                <tr className="border-t border-bg bg-accent/5">
                  <td className="px-4 py-3">매출 검증 결과</td>
                  <td className="px-4 py-3 whitespace-nowrap">AI 결과</td>
                  <td className="px-4 py-3 text-xs text-caution">파일은 없어요. 월별 매출 숫자가 들어 있어서, 공개하면 그 숫자도 함께 보여요.</td>
                  <td className="px-4 py-3">
                    <select
                      value={room.report_access.level}
                      onChange={(e) =>
                        change({ id: room.report_access!.document_id } as ListingDocument, "summary_access_level", e.target.value as AccessLevel)
                      }
                      className="rounded-md bg-bg px-2 py-1"
                    >
                      {ACCESS_LEVELS.map((lv) => (
                        <option key={lv} value={lv}>
                          {ACCESS_LABEL[lv]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-muted">-</td>
                </tr>
              )}
              {room.documents.map((d) => (
                <tr key={d.id} className="border-t border-bg">
                  <td className="px-4 py-3 break-all">{d.file_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{CATEGORY_LABEL[d.category]}</td>
                  {(["access_level", "summary_access_level"] as const).map((field) => (
                    <td key={field} className="px-4 py-3">
                      <select value={d[field]} onChange={(e) => change(d, field, e.target.value as AccessLevel)} className="rounded-md bg-bg px-2 py-1">
                        {ACCESS_LEVELS.map((lv) => (
                          <option key={lv} value={lv}>
                            {ACCESS_LABEL[lv]}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{formatTime(d.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---- 양수인: NDA 테스트 동의 + 잠긴 자료 열람 요청 ----

function BuyerAccessPanel({ room, onChanged }: { room: DataRoom; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const agreed = room.nda?.status === "test_agreed";

  async function run(key: string, path: string, body: object) {
    setBusy(key);
    setError(null);
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "실패했어요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="grid gap-4 rounded-xl bg-card p-5 lg:grid-cols-2">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">비밀유지 동의 (NDA)</p>
          {agreed ? <Tag tone="outline">동의함 · 시연용</Tag> : <Tag>동의 전</Tag>}
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {NDA_TEXT.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          문서 버전 {NDA_VERSION}
          {room.nda?.agreed_at && agreed && ` · 동의 시각 ${formatTime(room.nda.agreed_at)}`}
        </p>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run("nda", `/api/listings/${room.listing.id}/nda`, { agree: !agreed })}
          className={"mt-3 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 " + (agreed ? "bg-bg text-text" : "bg-accent text-white")}
        >
          {busy === "nda" ? "처리 중..." : agreed ? "동의 철회" : "NDA 동의하기 (시연용 · 법적 효력 없음)"}
        </button>
      </div>

      <div>
        <p className="font-medium">잠긴 자료 {room.locked.length}개</p>
        {room.locked.length === 0 ? (
          <p className="mt-2 text-sm text-muted">지금 더 열 수 있는 자료는 없어요.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {room.locked.map((item) => (
              <LockedRow key={`${item.target_type}:${item.target_id}`} item={item} agreed={agreed} busy={busy} onRequest={() => run(item.target_id + item.target_type, `/api/listings/${room.listing.id}/requests`, { target_type: item.target_type, target_id: item.target_id, reason: "인수 검토" })} />
            ))}
          </ul>
        )}
      </div>
      {error && <p className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn lg:col-span-2">{error}</p>}
    </section>
  );
}

function LockedRow({ item, agreed, busy, onRequest }: { item: LockedItem; agreed: boolean; busy: string | null; onRequest: () => void }) {
  const status = item.request_status;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
      <span className="min-w-0">
        {item.label} <Tag tone={ACCESS_TONE[item.level]}>{ACCESS_LABEL[item.level]}</Tag>
      </span>
      {item.level === "L1" ? (
        <span className="text-xs text-muted">NDA에 동의하면 열려요</span>
      ) : status === "requested" ? (
        <Tag tone="caution">승인 기다리는 중</Tag>
      ) : status === "approved" ? (
        <Tag tone="outline">승인됨</Tag>
      ) : !agreed ? (
        <span className="text-xs text-muted">NDA 동의 후 요청할 수 있어요</span>
      ) : (
        <button type="button" disabled={!!busy} onClick={onRequest} className="text-xs font-medium text-accent disabled:opacity-50">
          {status === "rejected" || status === "revoked" ? "다시 요청하기" : "보여 달라고 요청"}
        </button>
      )}
    </li>
  );
}
