import { WorkspaceFrame } from "@/components/workspace-frame";
import type { Search } from "@/workspaces/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Campaigns } from "@/features/campaigns";
import { Creatives } from "@/features/creatives";
import { Intelligence, Recommendations } from "@/features/intelligence";
import { GoalsPage } from "@/features/goals";
import { Leads } from "@/features/leads";
import { Journal } from "@/features/journal";
import { requireUser, requireAdmin } from "@/auth/server";
const pages = {
  "creative-intelligence": {
    title: "Creative Intelligence",
    component: () => null,
  },
  reels: { title: "Laboratório de Reels", component: () => null },
  aprovacoes: { title: "Central de Aprovações", component: () => null },
  "intelligence-settings": {
    title: "Configurações de Inteligência",
    component: () => null,
  },
  funil: { title: "Funil de Receita", component: () => null },
  campanhas: { title: "Campanhas", component: Campaigns },
  "traffic-ai": { title: "Traffic AI", component: Intelligence },
  recomendacoes: { title: "Recomendações", component: Recommendations },
  criativos: { title: "Criativos", component: Creatives },
  metas: { title: "Metas", component: GoalsPage },
  leads: { title: "Leads / CRM", component: Leads },
  diario: { title: "Diário da IA", component: Journal },
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  await requireUser();
  const { section } = await params;
  return {
    title:
      pages[section as keyof typeof pages]?.title ?? "Página não encontrada",
  };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Search;
}) {
  await requireUser();
  const { section } = await params;
  if (section === "intelligence-settings") await requireAdmin();
  if (!Object.hasOwn(pages, section)) notFound();
  const Component = pages[section as keyof typeof pages].component;
  return (
    <WorkspaceFrame searchParams={searchParams}>
      <Component />
    </WorkspaceFrame>
  );
}
