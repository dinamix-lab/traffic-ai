import { meta } from "@/meta/server";
import { requireAdmin, sessionToken } from "@/auth/server";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { WorkspaceList } from "@/features/workspaces/workspace-list";
import { workspaces, type Search } from "@/workspaces/server";
export const metadata = { title: "Workspaces" };
export default async function Page({ searchParams }: { searchParams: Search }) {
  await requireAdmin();
  const token = await sessionToken();
  const items = workspaces()
    .list(token)
    .map((w) => ({
      ...w,
      integrationCount: meta().snapshot(token, w.id).connection?.connected
        ? 1
        : 0,
    }));
  return (
    <WorkspaceFrame administrative searchParams={searchParams}>
      <WorkspaceList items={items} />
    </WorkspaceFrame>
  );
}
