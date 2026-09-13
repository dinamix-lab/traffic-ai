import { WorkspaceFrame } from "@/components/workspace-frame";
import type { Search } from "@/workspaces/server";
import { auth, requireAdmin, sessionToken } from "@/auth/server";
import { UsersPage } from "@/features/users/users-page";
export const metadata = { title: "Usuários" };
export default async function Page({ searchParams }: { searchParams: Search }) {
  const user = await requireAdmin();
  const users = auth().listUsers(await sessionToken());
  return (
    <WorkspaceFrame searchParams={searchParams} administrative>
      <UsersPage initialUsers={users} currentUserId={user.id} />
    </WorkspaceFrame>
  );
}
