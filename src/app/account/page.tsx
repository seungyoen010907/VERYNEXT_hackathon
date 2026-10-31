import { AccountForm } from "@/components/client/account-form";
import { DefinitionList, Notice, Panel } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requestContext } from "@/server/http";
import { getAccount } from "@/server/repo/account";

export default async function AccountPage() {
  const { db, viewer } = await requestContext();
  const account = await getAccount(db, viewer);
  return (
    <div className="max-w-3xl space-y-4">
      <Panel title="프로필">
        <DefinitionList
          columns={3}
          items={[
            ["이메일", account.email],
            ["역할", account.role === "seller" ? "양도인" : account.role === "buyer" ? "양수인" : "관리자"],
            ["가입일", dateTime(account.createdAt)],
          ]}
        />
      </Panel>
      <AccountForm account={account} />
      <Notice>현재는 데모 계정입니다 (Supabase Auth 연동 전). 오른쪽 위 사용자 메뉴에서 양도인·양수인 계정을 전환할 수 있습니다.</Notice>
    </div>
  );
}
