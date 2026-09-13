"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Link from "@/components/workspace-link";
import { useDemo } from "@/components/providers";
import { PageTitle, Panel, Empty } from "@/components/ui";
import type { MetaSnapshot, MetaRow } from "@/meta/types";
export const number = (value: unknown): number | null =>
  value === null ||
  value === undefined ||
  value === "" ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
const value = (v: unknown) =>
  v === null || v === undefined
    ? "Não disponível"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
export function RealContent({
  snapshot,
  children,
}: {
  snapshot: MetaSnapshot;
  children: ReactNode;
}) {
  const path = usePathname();
  const { days } = useDemo();
  if (
    path === "/metas" ||
    path.startsWith("/integracoes") ||
    path.startsWith("/workspaces") ||
    path === "/usuarios" ||
    path === "/acesso-negado"
  )
    return children;
  const campaigns = snapshot.resources.filter((r) => r.kind === "campaigns");
  const campaignId = path.startsWith("/campanhas/")
    ? decodeURIComponent(path.split("/").at(-1)!)
    : null;
  if (["/traffic-ai", "/recomendacoes", "/leads", "/diario"].includes(path))
    return (
      <>
        <PageTitle
          title={
            path === "/leads"
              ? "Leads / CRM"
              : path === "/diario"
                ? "Diário da IA"
                : path === "/recomendacoes"
                  ? "Recomendações"
                  : "Traffic AI"
          }
          description="Workspace com dados Meta"
        />
        <Panel>
          <Empty
            title={
              path === "/leads"
                ? "CRM ainda não conectado"
                : "Análise de negócio ainda não habilitada"
            }
            description="Campanhas e resultados Meta estão disponíveis. Leads individuais, calls, vendas confirmadas e recomendações de IA exigem fontes e análises adicionais; nenhum resultado foi estimado."
          />
        </Panel>
      </>
    );
  if (path === "/criativos")
    return (
      <>
        <PageTitle
          title="Criativos"
          description="Referências importadas da Meta, sem scores ou diagnósticos simulados."
        />
        <ResourceTable
          rows={snapshot.resources
            .filter((r) => r.kind === "creatives")
            .map((r) => ({ ...r.payload, account_id: r.accountId }))}
          columns={[
            "account_id",
            "id",
            "name",
            "object_type",
            "video_id",
            "effective_object_story_id",
            "image_url",
            "thumbnail_url",
          ]}
        />
      </>
    );
  return (
    <>
      <PageTitle
        title={
          campaignId
            ? "Detalhes da campanha"
            : path === "/campanhas"
              ? "Campanhas"
              : "Visão geral"
        }
        description="Dados importados da Meta. Métricas ausentes não são estimadas."
      />
      {!snapshot.connection?.connected && (
        <p className="info-note">
          Conexão removida. Exibindo somente o histórico Meta armazenado;
          reconecte para atualizar.
        </p>
      )}
      {!snapshot.resources.some((r) => r.kind === "insights") && (
        <p className="info-note">
          Ainda não há insights importados. Selecione contas e sincronize.
          Contas novas podem não ter campanhas ou resultados.
        </p>
      )}
      {snapshot.accounts
        .filter((a) => a.selected)
        .map((a) => {
          let today: string;
          try {
            today = new Intl.DateTimeFormat("en-CA", {
              timeZone: a.timezone || "UTC",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date());
          } catch {
            today = new Date().toISOString().slice(0, 10);
          }
          const end = new Date(`${today}T12:00:00Z`);
          end.setUTCDate(end.getUTCDate() - 1);
          const start = new Date(end);
          start.setUTCDate(start.getUTCDate() - days + 1);
          const previous = new Date(start);
          previous.setUTCDate(previous.getUTCDate() - days);
          const date = (d: Date) => d.toISOString().slice(0, 10);
          const rows = snapshot.resources.filter(
            (r) =>
              r.kind === "insights" &&
              r.accountId === a.id &&
              (!campaignId || r.payload.campaign_id === campaignId),
          );
          const current = rows.filter(
            (r) => r.date >= date(start) && r.date <= date(end),
          );
          const before = rows.filter(
            (r) => r.date >= date(previous) && r.date < date(start),
          );
          const sum = (list: typeof rows, key: string) =>
            !list.length || list.some((r) => number(r.payload[key]) === null)
              ? null
              : list.reduce((total, r) => total + number(r.payload[key])!, 0);
          const money = (n: number | null) =>
            n === null
              ? "Não disponível"
              : a.currency
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: a.currency,
                  }).format(n)
                : `${n} (moeda não informada)`;
          const spend = sum(current, "spend"),
            clicks = sum(current, "clicks"),
            impressions = sum(current, "impressions");
          return (
            <Panel
              key={a.id}
              title={`${a.name} · ${a.currency || "moeda não informada"}`}
              description={`${date(start)} a ${date(end)} · comparação ${date(previous)} a ${date(new Date(start.getTime() - 86400000))} · fuso ${a.timezone || "UTC (não informado)"}`}
            >
              <div className="workspace-stats">
                <div>
                  <span>Investimento</span>
                  <strong>{money(spend)}</strong>
                  <small>Anterior: {money(sum(before, "spend"))}</small>
                </div>
                <div>
                  <span>Impressões</span>
                  <strong>{value(impressions)}</strong>
                  <small>Anterior: {value(sum(before, "impressions"))}</small>
                </div>
                <div>
                  <span>Cliques</span>
                  <strong>{value(clicks)}</strong>
                  <small>Anterior: {value(sum(before, "clicks"))}</small>
                </div>
              </div>
              <p>
                CTR:{" "}
                {clicks !== null && impressions
                  ? `${((clicks / impressions) * 100).toFixed(2)}%`
                  : "Não disponível"}{" "}
                · CPC:{" "}
                {spend !== null && clicks
                  ? money(spend / clicks)
                  : "Não disponível"}{" "}
                · CPM:{" "}
                {spend !== null && impressions
                  ? money((spend / impressions) * 1000)
                  : "Não disponível"}
              </p>
              <p className="muted small">
                Alcance e frequência são exibidos por anúncio/dia abaixo: não
                são somados entre públicos ou dias. Conversões da Meta não
                equivalem a vendas confirmadas no CRM. Não somamos moedas
                distintas.
              </p>
              <details>
                <summary>Evolução diária e resultados por anúncio</summary>
                <ResourceTable
                  rows={current.map((r) => r.payload)}
                  columns={[
                    "date_start",
                    "ad_id",
                    "spend",
                    "impressions",
                    "reach",
                    "frequency",
                    "clicks",
                    "ctr",
                    "cpc",
                    "cpm",
                    "actions",
                    "cost_per_action_type",
                  ]}
                />
              </details>
            </Panel>
          );
        })}
      <Panel title="Campanhas importadas">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>ID</th>
                <th>Conta</th>
                <th>Status</th>
                <th>Objetivo</th>
                <th>Orçamento diário / total</th>
                <th>Início / fim</th>
              </tr>
            </thead>
            <tbody>
              {campaigns
                .filter((r) => !campaignId || r.id === campaignId)
                .map((r) => {
                  const a = snapshot.accounts.find((a) => a.id === r.accountId);
                  const budget = (raw: unknown) => {
                    const n = number(raw);
                    if (n === null) return "Não disponível";
                    if (!a?.currency)
                      return `${n} (unidades mínimas; moeda não informada)`;
                    const formatter = new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: a.currency,
                    });
                    return formatter.format(
                      n /
                        10 **
                          (formatter.resolvedOptions().maximumFractionDigits ??
                            2),
                    );
                  };
                  return (
                    <tr key={`${r.accountId}:${r.id}`}>
                      <td>
                        <Link href={`/campanhas/${r.id}`}>
                          {value(r.payload.name)}
                        </Link>
                      </td>
                      <td>{r.id}</td>
                      <td>{a?.name || r.accountId}</td>
                      <td>
                        {value(r.payload.effective_status || r.payload.status)}
                      </td>
                      <td>{value(r.payload.objective)}</td>
                      <td>
                        {budget(r.payload.daily_budget)} /{" "}
                        {budget(r.payload.lifetime_budget)}
                      </td>
                      <td>
                        {value(r.payload.start_time)} /{" "}
                        {value(r.payload.stop_time)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!campaigns.length && <p>Nenhuma campanha importada.</p>}
      </Panel>
      {campaignId && (
        <>
          <Panel title="Conjuntos">
            <ResourceTable
              rows={snapshot.resources
                .filter(
                  (r) =>
                    r.kind === "adsets" && r.payload.campaign_id === campaignId,
                )
                .map((r) => r.payload)}
              columns={[
                "id",
                "name",
                "status",
                "daily_budget",
                "lifetime_budget",
                "optimization_goal",
                "start_time",
                "end_time",
              ]}
            />
            <p className="muted small">
              Orçamentos de conjuntos são os valores brutos da API, em unidades
              monetárias mínimas da conta.
            </p>
          </Panel>
          <Panel title="Anúncios">
            <ResourceTable
              rows={snapshot.resources
                .filter(
                  (r) =>
                    r.kind === "ads" && r.payload.campaign_id === campaignId,
                )
                .map((r) => r.payload)}
              columns={["id", "adset_id", "name", "status", "creative"]}
            />
          </Panel>
        </>
      )}
    </>
  );
}
const columnLabel: Record<string, string> = {
  account_id: "Conta",
  id: "ID Meta",
  name: "Nome",
  object_type: "Tipo",
  video_id: "Vídeo",
  effective_object_story_id: "Publicação",
  image_url: "Imagem (referência)",
  thumbnail_url: "Miniatura (referência)",
  date_start: "Data",
  ad_id: "Anúncio",
  adset_id: "Conjunto",
  spend: "Investimento",
  impressions: "Impressões",
  reach: "Alcance",
  frequency: "Frequência",
  clicks: "Cliques",
  ctr: "CTR (%)",
  cpc: "CPC",
  cpm: "CPM",
  actions: "Resultados por tipo (Meta)",
  cost_per_action_type: "Custo por resultado (Meta)",
  status: "Status",
  daily_budget: "Orçamento diário bruto",
  lifetime_budget: "Orçamento total bruto",
  optimization_goal: "Otimização",
  start_time: "Início",
  end_time: "Fim",
  creative: "Criativo",
};
function ResourceTable({
  rows,
  columns,
}: {
  rows: MetaRow[];
  columns: string[];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{columnLabel[c] || c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} style={{ maxWidth: 340, overflowWrap: "anywhere" }}>
                  {value(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>Nenhum registro disponibilizado neste período.</p>}
    </div>
  );
}
