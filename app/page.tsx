import Link from "next/link";

const STEPS = [
  ["거래방 만들기", "점포 주소, 권리금, 양도인이 말한 매출을 입력해요."],
  ["자료 제출", "양도인이 카드·배달·POS·부가세 자료를 올려요. 어디서 떼는지 안내해 드려요."],
  ["매출 검증", "AI가 자료에서 숫자를 읽고, 자료끼리 맞지 않는 달을 찾아요."],
  ["계약까지", "로드맵을 따라 조건 합의, 권리금 계약, 신고, 인수인계를 챙겨요."],
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">점포 양도양수, 매출 확인부터 계약까지</h1>
        <p className="mt-2 text-muted">
          양도인이 말한 매출이 자료와 맞는지 확인하고, 필요한 서류와 절차를 단계별로 안내해요.
        </p>
      </section>

      <ol className="space-y-3">
        {STEPS.map(([title, desc], i) => (
          <li key={title} className="flex gap-3 rounded-xl border border-border bg-card p-4">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{title}</p>
              <p className="text-sm text-muted">{desc}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-2">
        <Link href="/deals/new" className="block rounded-lg bg-accent py-3 text-center font-medium text-white">
          거래 시작하기
        </Link>
        <Link href="/deals" className="block py-2 text-center text-sm text-muted hover:text-text">
          내 거래방 목록 보기
        </Link>
      </div>
    </div>
  );
}
