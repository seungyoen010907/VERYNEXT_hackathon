import { redirect } from "next/navigation";

// 대시보드는 역할별 홈(/)으로 합쳤다 (docs/DESIGN.md 10.2)
export default function DashboardPage() {
  redirect("/");
}
