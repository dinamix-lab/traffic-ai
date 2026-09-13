"use client";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useDemo } from "@/components/providers";
import { PageTitle, Panel, Empty } from "@/components/ui";
import { businessMetrics, formatMoney, type FunnelFilter } from "@/crm/metrics";
import { attribution, dimension } from "@/crm/attribution";
import type { CrmSnapshot } from "@/crm/types";
import type { MetaSnapshot } from "@/meta/types";
export function BusinessContent({
  data,
  media,
  children,
}: {
  data: CrmSnapshot;
  media: MetaSnapshot | null;
  children: ReactNode;
}) {
  const path = usePathname(),
    { days, workspace } = useDemo();
  const timezone = workspace?.timezone || "UTC";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const start = new Date(`${today}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const [custom, setCustom] = useState<Partial<FunnelFilter>>({});
  const filter: FunnelFilter = {
    from: start.toISOString().slice(0, 10),
    to: today,
    timezone,
    ...custom,
  };
  const real = data.state.lastSuccessAt !== null || data.state.totalEvents > 0;
  const funnel = path === "/funil";
  const show = ["/", "/campanhas", "/criativos", "/leads"].includes(path);
  if (!funnel && !show) return children;
  if (!real) {
    return funnel ? (
      <>
        <PageTitle
          title="Funil de Receita"
          description="CRM → resultado de negócio"
        />
        <Panel>
          <Empty
            title="Aguardando eventos do Dinamix Vendas"
            description="Configure a integração e sincronize. Nenhuma informação comercial será simulada."
          />
        </Panel>
      </>
    ) : (
      children
    );
  }
  const metrics = businessMetrics(data, media, filter);
  const cash = (n: string | null) => formatMoney(n, data.currency),
    pct = (n: string | null) => (n === null ? "Não disponível" : `${n}%`);
  const figures: [string, string | number][] = [
    ["Leads", metrics.leads],
    ["Qualificados", metrics.qualified],
    ["Calls agendadas", metrics.scheduled],
    ["Calls realizadas", metrics.completed],
    ["Show rate", pct(metrics.showRate)],
    ["Propostas", metrics.proposals],
    ["Vendas", metrics.sales],
    ["Receita", cash(metrics.revenue)],
    ["CAC por lead comprador", cash(metrics.cac)],
    [
      "ROAS atribuído",
      metrics.roas === null ? "Não disponível" : `${metrics.roas}×`,
    ],
  ];
  const groupKind = path === "/criativos" ? "creative" : "campaign";
  const groups = [
    ...new Set(
      data.leads
        .map((l) => dimension(l, groupKind))
        .filter((v) => v && (media?.connection || !v.startsWith("meta:"))),
    ),
  ].filter((g) => !filter[groupKind] || g === filter[groupKind]) as string[];
  const groupView = path === "/campanhas" || path === "/criativos";
  return (
    <>
      {(funnel || !media?.connection || path === "/leads") && (
        <PageTitle
          title={
            funnel
              ? "Funil de Receita"
              : path === "/leads"
                ? "Leads / CRM"
                : groupView
                  ? path === "/criativos"
                    ? "Criativos · resultado comercial"
                    : "Campanhas · resultado comercial"
                  : "Visão geral"
          }
          description="Dinamix Vendas é a fonte oficial da verdade comercial."
        />
      )}
      <Panel
        title={
          funnel
            ? "Do investimento à receita"
            : "Resultado comercial · Dinamix Vendas"
        }
        description={`Períodos em ${timezone}. Valores de negócio sem estimativa.`}
      >
        <div className="goals-grid">
          <label>
            De
            <input
              aria-label="Período comercial de"
              type="date"
              value={filter.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
            />
          </label>
          <label>
            Até
            <input
              aria-label="Período comercial até"
              type="date"
              value={filter.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
            />
          </label>
          {(["campaign", "adset", "ad", "creative"] as const).map((kind, i) => (
            <label key={kind}>
              {["Campanha", "Conjunto", "Anúncio", "Criativo"][i]}
              <select
                aria-label={`Filtro comercial ${kind}`}
                value={filter[kind] || ""}
                onChange={(e) =>
                  setCustom({ ...custom, [kind]: e.target.value })
                }
              >
                <option value="">Todos</option>
                {[
                  ...new Set(
                    data.leads
                      .map((l) => dimension(l, kind))
                      .filter(
                        (v) =>
                          v && (media?.connection || !v.startsWith("meta:")),
                      ),
                  ),
                ]
                  .sort()
                  .map((v) => (
                    <option key={v!} value={v!}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <label>
            Vendedor
            <select
              aria-label="Vendedor comercial"
              value={filter.seller || ""}
              onChange={(e) => setCustom({ ...custom, seller: e.target.value })}
            >
              <option value="">Todos</option>
              {[
                ...new Map(
                  [
                    ...data.leads,
                    ...data.calls,
                    ...data.proposals,
                    ...data.sales,
                  ]
                    .filter((l) => l.fields.seller_id)
                    .map((l) => [
                      l.fields.seller_id!,
                      l.fields.seller_name || l.fields.seller_id!,
                    ]),
                ).entries(),
              ].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!filter.from || !filter.to || filter.from > filter.to ? (
          <p className="error-message">
            Informe as duas datas, com início anterior ou igual ao fim do
            período.
          </p>
        ) : (
          <>
            {funnel && (
              <ol className="revenue-funnel" aria-label="Etapas do funil">
                {[
                  ["Investimento Meta", cash(metrics.investment)],
                  ...figures.filter(
                    ([label]) =>
                      ![
                        "Show rate",
                        "CAC por lead comprador",
                        "ROAS atribuído",
                      ].includes(label),
                  ),
                ].map(([label, val]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <strong>{val}</strong>
                    <span aria-hidden="true">↓</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="workspace-stats business-stats">
              {figures.map(([label, val]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{val}</strong>
                </div>
              ))}
            </div>
            <p>{metrics.mediaNote}</p>
            <p className="muted small">
              Qualificação da coorte: {pct(metrics.qualificationRate)} ·
              Fechamento da coorte: {pct(metrics.closeRate)} · Ticket médio:{" "}
              {cash(metrics.averageTicket)} · No-shows: {metrics.noShows} ·
              Leads sem atribuição: {metrics.unattributed}
            </p>
            {metrics.missingValues > 0 && (
              <p className="info-note">
                {metrics.missingValues} venda(s) sem valor informado. Receita
                conhecida: {cash(metrics.knownRevenue)}; receita total
                indisponível.
              </p>
            )}
            {funnel && (
              <p>
                CPL atribuído: {cash(metrics.cpl)} · Custo por qualificado:{" "}
                {cash(metrics.costQualified)} · Custo por call agendada:{" "}
                {cash(metrics.costScheduled)} · Custo por call realizada:{" "}
                {cash(metrics.costCompleted)} · Custo por proposta:{" "}
                {cash(metrics.costProposal)} · Receita atribuída:{" "}
                {cash(metrics.attributedRevenue)} · Receita atribuída por R$
                investido: {metrics.roas ?? "Não disponível"}
              </p>
            )}
          </>
        )}
        <details>
          <summary>Como interpretar este funil</summary>
          <p>
            Volumes por data de cada etapa; não representam necessariamente a
            mesma coorte. Qualificação e fechamento usam os leads cuja primeira
            observação ocorreu no período, com evolução conhecida até o fim
            selecionado. Show rate = realizadas ÷ (realizadas + no-shows),
            excluindo canceladas. Reagendar não cria outra call. Vendas são
            negócios distintos; CAC usa leads compradores distintos, como
            aproximação de clientes. Atribuição por UTM é evidência parcial, sem
            associação automática por nome.
          </p>
        </details>
        {(data.state.status === "error" ||
          data.state.lastSyncStatus === "error") && (
          <p className="info-note">
            A sincronização está com erro. Os dados abaixo refletem apenas
            páginas confirmadas; a importação pode estar incompleta.
          </p>
        )}
      </Panel>
      {groupView && (
        <Panel
          title={
            groupKind === "creative"
              ? "Resultado por criativo"
              : "Resultado por campanha"
          }
          description="IDs Traffic AI, IDs Meta e UTMs permanecem identificados. Business Score ainda não definido."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Atribuição</th>
                  <th>Leads</th>
                  <th>Qualificados</th>
                  <th>Calls realizadas</th>
                  <th>Propostas</th>
                  <th>Vendas</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const m = businessMetrics(data, media, {
                    ...filter,
                    [groupKind]: group,
                  });
                  return (
                    <tr key={group}>
                      <td>{group}</td>
                      <td>{m.leads}</td>
                      <td>{m.qualified}</td>
                      <td>{m.completed}</td>
                      <td>{m.proposals}</td>
                      <td>{m.sales}</td>
                      <td>{cash(m.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!groups.length && (
            <p>
              Não há evidência de atribuição a{" "}
              {groupKind === "creative" ? "criativos" : "campanhas"}.
            </p>
          )}
        </Panel>
      )}
      {(funnel || path === "/leads") && (
        <Panel
          title="Leads comerciais"
          description="Somente identificadores e dados permitidos pela API; sem nome, e-mail ou telefone do lead."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID CRM</th>
                  <th>Vendedor</th>
                  <th>Status</th>
                  <th>Qualificação</th>
                  <th>Atribuição</th>
                  <th>Método</th>
                </tr>
              </thead>
              <tbody>
                {metrics.leadRows.map((l) => {
                  const a = attribution(l);
                  return (
                    <tr key={l.id}>
                      <td>{l.id}</td>
                      <td>
                        {l.fields.seller_name ||
                          l.fields.seller_id ||
                          "Não informado"}
                      </td>
                      <td>{l.fields.status || "Não informado"}</td>
                      <td>
                        {l.fields.qualification_status || "Não informado"}
                      </td>
                      <td>{a.status}</td>
                      <td>{a.method}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {!funnel &&
        path !== "/leads" &&
        (media?.connection ? (
          children
        ) : (
          <Panel title="Mídia">
            <Empty
              title="Meta ainda não conectada"
              description="Os resultados comerciais acima são reais. Não há investimento ou métricas de mídia disponíveis para cruzamento."
            />
          </Panel>
        ))}
    </>
  );
}
