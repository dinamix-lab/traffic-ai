import { meta } from "@/meta/server";
import { sessionToken } from "@/auth/server";
import { notFound } from "next/navigation";
import { mockRepository } from "@/data/mock-repository";
import { CampaignDetail } from "@/features/campaigns";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { workspaceContext, type Search } from "@/workspaces/server";
export const metadata = { title: "Detalhes da campanha" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Search;
}) {
  const context = await workspaceContext(searchParams);
  const { id } = await params;
  if (context.workspace) {
    const snapshot = meta().snapshot(
      await sessionToken(),
      context.workspace.id,
    );
    if (snapshot.connection) {
      if (
        !snapshot.resources.some((r) => r.kind === "campaigns" && r.id === id)
      )
        notFound();
    } else {
      const data = await mockRepository.getDataset(context.workspace);
      if (!data.campaigns.some((c) => c.id === id)) notFound();
    }
  }
  return (
    <WorkspaceFrame context={context}>
      <CampaignDetail id={id} />
    </WorkspaceFrame>
  );
}
