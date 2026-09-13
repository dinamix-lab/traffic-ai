import { sessionToken } from "@/auth/server";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { MetaPanel } from "@/features/integrations/meta-panel";
import { meta } from "@/meta/server";
import { workspaceContext, type Search } from "@/workspaces/server";
export const metadata = { title: "Detalhes da integração Meta" };
export default async function Page({ searchParams }: { searchParams: Search }) {
  const context = await workspaceContext(searchParams);
  const snapshot = context.workspace
    ? meta().snapshot(await sessionToken(), context.workspace.id)
    : null;
  return (
    <WorkspaceFrame context={context}>
      {snapshot && (
        <MetaPanel
          key={context.workspace!.id + JSON.stringify(snapshot.accounts)}
          snapshot={snapshot}
          workspaceId={context.workspace!.id}
          isAdmin={context.user.role === "admin"}
          details={true}
        />
      )}
    </WorkspaceFrame>
  );
}
