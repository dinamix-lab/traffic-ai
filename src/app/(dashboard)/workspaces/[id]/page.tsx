import { requireAdmin, sessionToken } from "@/auth/server";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { WorkspaceDetail } from "@/features/workspaces/workspace-detail";
import { workspaces, workspaceContext } from "@/workspaces/server";
export const metadata = { title: "Detalhes do workspace" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const context = await workspaceContext(Promise.resolve({ workspace: id }));
  const detail = workspaces().detail(await sessionToken(), id);
  return (
    <WorkspaceFrame administrative context={context}>
      <WorkspaceDetail key={JSON.stringify(detail.members)} detail={detail} />
    </WorkspaceFrame>
  );
}
