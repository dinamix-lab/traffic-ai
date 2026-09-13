import { Overview } from "@/features/overview";
import { WorkspaceFrame } from "@/components/workspace-frame";
import type { Search } from "@/workspaces/server";
export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <WorkspaceFrame searchParams={searchParams}>
      <Overview />
    </WorkspaceFrame>
  );
}
