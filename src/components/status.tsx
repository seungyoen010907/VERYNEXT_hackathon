/**
 * 도메인 상태 → 일관된 색상 배지
 * 같은 의미는 모든 화면에서 같은 색을 쓴다:
 *   확인·일치·LOW = positive, 주의·MEDIUM = caution, 불일치·HIGH = negative,
 *   CRITICAL = critical, 확인 불가·자료 부족·UNKNOWN = muted
 */
import {
  ANALYSIS_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  PAYBACK_STATUS_LABELS,
  STORE_STATUS_LABELS,
  VERIFICATION_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
  type AnalysisStatus,
  type DocumentStatus,
  type PaybackStatus,
  type RiskLevel,
  type StoreStatus,
  type VerificationLevel,
  type VerificationStatus,
} from "@/types/domain";
import { Badge, type Tone } from "./ui";

export const RISK_TONE: Record<RiskLevel, Tone> = {
  CRITICAL: "critical",
  HIGH: "negative",
  MEDIUM: "caution",
  LOW: "positive",
  UNKNOWN: "muted",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  UNKNOWN: "UNKNOWN",
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  return <Badge tone={RISK_TONE[level]}>{RISK_LABEL[level]}</Badge>;
}

const VERIFICATION_TONE: Record<VerificationStatus, Tone> = {
  verified: "positive",
  mismatch: "negative",
  unverifiable: "muted",
  insufficient_data: "muted",
};

export function VerificationBadge({ status, label }: { status: VerificationStatus; label?: string }) {
  return <Badge tone={VERIFICATION_TONE[status]}>{label ?? VERIFICATION_STATUS_LABELS[status]}</Badge>;
}

const STORE_TONE: Record<StoreStatus, Tone> = {
  draft: "neutral",
  pending_verification: "info",
  verifying: "info",
  verified: "positive",
  needs_more_documents: "caution",
};

export function StoreStatusBadge({ status }: { status: StoreStatus }) {
  return <Badge tone={STORE_TONE[status]}>{STORE_STATUS_LABELS[status]}</Badge>;
}

const DOC_TONE: Record<DocumentStatus, Tone> = {
  uploaded: "neutral",
  analyzing: "info",
  analyzed: "positive",
  failed: "negative",
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  return <Badge tone={DOC_TONE[status]}>{DOCUMENT_STATUS_LABELS[status]}</Badge>;
}

const LEVEL_TONE: Record<VerificationLevel, Tone> = { verified: "positive", partial: "caution", unverified: "muted" };

export function VerificationLevelBadge({ level }: { level: VerificationLevel | null }) {
  if (!level) return <Badge tone="muted">분석 전</Badge>;
  return <Badge tone={LEVEL_TONE[level]}>{VERIFICATION_LEVEL_LABELS[level]}</Badge>;
}

const PAYBACK_TONE: Record<PaybackStatus, Tone> = { calculable: "neutral", not_recoverable: "negative", not_calculable: "muted" };

export function PaybackBadge({ status }: { status: PaybackStatus }) {
  return <Badge tone={PAYBACK_TONE[status]}>{PAYBACK_STATUS_LABELS[status]}</Badge>;
}

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  const tone: Record<AnalysisStatus, Tone> = { pending: "neutral", running: "info", completed: "positive", failed: "negative" };
  return <Badge tone={tone[status]}>{ANALYSIS_STATUS_LABELS[status]}</Badge>;
}

export function ChecklistStateBadge({ state, required }: { state: "complete" | "submitted" | "failed" | "missing"; required: boolean }) {
  if (state === "complete") return <Badge tone="positive">제출 완료</Badge>;
  if (state === "submitted") return <Badge tone="info">제출 · 분석 대기</Badge>;
  if (state === "failed") return <Badge tone="negative">분석 실패</Badge>;
  return required ? <Badge tone="negative">미제출</Badge> : <Badge tone="muted">선택 · 미제출</Badge>;
}
