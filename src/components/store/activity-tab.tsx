import { ACTIVITY_TYPE_LABELS, type ActivityType } from "@/types/domain";
import { dateTime } from "@/lib/format";
import type { ActivityRow } from "@/server/repo/activities";
import { Dot, Panel, type Tone } from "../ui";

const TONE: Partial<Record<ActivityType, Tone>> = {
  risk_detected: "negative",
  document_failed: "negative",
  documents_requested: "caution",
  analysis_completed: "positive",
  report_generated: "positive",
  document_analyzed: "info",
};

export function ActivityTimeline({ activities, showStore }: { activities: ActivityRow[]; showStore?: boolean }) {
  if (activities.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-neutral-500">활동 기록이 없습니다.</p>;
  return (
    <ol className="divide-y divide-neutral-100">
      {activities.map((a) => (
        <li key={a.id} className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 px-4 py-2 text-[13px]">
          <time className="whitespace-nowrap text-[12px] tabular-nums text-neutral-500">{dateTime(a.createdAt)}</time>
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <Dot tone={TONE[a.type] ?? "neutral"} />
              <span className="text-[11px] text-neutral-500">{ACTIVITY_TYPE_LABELS[a.type]}</span>
              {showStore && <span className="truncate text-[11px] text-neutral-500">· {a.storeName}</span>}
            </p>
            <p className="mt-0.5 text-neutral-900">{a.title}</p>
            {a.actorName && <p className="text-[11px] text-neutral-500">{a.actorName}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ActivityTab({ activities }: { activities: ActivityRow[] }) {
  return (
    <Panel title={`실사 활동 기록 (${activities.length})`} description="점포 등록부터 보고서 생성까지 시간 역순으로 표시합니다. 기록은 수정할 수 없습니다." flush>
      <ActivityTimeline activities={activities} />
    </Panel>
  );
}
