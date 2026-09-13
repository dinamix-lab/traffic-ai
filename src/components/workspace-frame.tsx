import { intelligence } from "../intelligence/server";
import { IntelligenceView } from "../features/intelligence-engine/view";
import { crm } from "../crm/server";
import { BusinessContent } from "../features/business/funnel";
import { meta } from "../meta/server";
import { sessionToken } from "../auth/server";
import { RealContent } from "../features/integrations/meta-data";
import type { ReactNode } from "react";
import { DemoProvider } from "./providers";
import { Shell } from "./shell";
import { Empty } from "./ui";
import { workspaceContext, type Search } from "../workspaces/server";
import { mockRepository } from "../data/mock-repository";
import { defaultGoals } from "../domain/preferences";
export async function WorkspaceFrame({
  children,
  searchParams,
  context,
  administrative = false,
}: {
  children: ReactNode;
  searchParams?: Search;
  context?: Awaited<ReturnType<typeof workspaceContext>>;
  administrative?: boolean;
}) {
  const ctx = context || (await workspaceContext(searchParams));
  const snapshot = ctx.workspace
    ? meta().snapshot(await sessionToken(), ctx.workspace.id)
    : null;
  const business = ctx.workspace
    ? crm().snapshot(await sessionToken(), ctx.workspace.id)
    : null;
  const intelligenceData = ctx.workspace?.active
    ? intelligence().snapshot(await sessionToken(), ctx.workspace.id)
    : null;
  const crmReal =
    !!business &&
    (business.state.lastSuccessAt !== null || business.state.totalEvents > 0);
  const isReal = !!snapshot?.connection || crmReal;
  const data =
    ctx.workspace && !isReal
      ? await mockRepository.getDataset(ctx.workspace)
      : {
          workspaceId: ctx.workspace?.id || "",
          journal: [],
          campaigns: [],
          daily: [],
          creatives: [],
          leads: [],
          recommendations: [],
        };
  return (
    <DemoProvider
      key={`${ctx.user.id}:${ctx.workspace?.id || "none"}`}
      data={data}
      userId={ctx.user.id}
      workspace={ctx.workspace}
      workspaces={ctx.workspaces}
      initialGoals={ctx.goals || defaultGoals}
      source={
        crmReal
          ? snapshot?.connection
            ? "meta-crm"
            : "crm"
          : isReal
            ? "meta"
            : "demo"
      }
      lastSyncAt={
        Math.max(
          snapshot?.connection?.lastSyncAt || 0,
          business?.state.lastSuccessAt || 0,
        ) || null
      }
    >
      <Shell user={ctx.user}>
        {ctx.workspace || administrative ? (
          business ? (
            <IntelligenceViewBoundary data={intelligenceData}>
              <BusinessContent data={business} media={snapshot}>
                {isReal && snapshot ? (
                  <RealContent snapshot={snapshot}>{children}</RealContent>
                ) : (
                  children
                )}
              </BusinessContent>
            </IntelligenceViewBoundary>
          ) : (
            children
          )
        ) : (
          <section className="panel">
            <Empty
              title="Nenhum workspace disponível"
              description="Solicite ao administrador a vinculação a um workspace ativo para começar."
            />
          </section>
        )}
      </Shell>
    </DemoProvider>
  );
}

function IntelligenceViewBoundary({
  data,
  children,
}: {
  data: ReturnType<ReturnType<typeof intelligence>["snapshot"]> | null;
  children: ReactNode;
}) {
  return data ? (
    <IntelligenceView initial={data}>{children}</IntelligenceView>
  ) : (
    children
  );
}
