"use client";
import { useMoney } from "@/components/providers";
import { useState } from "react";
import Link from "@/components/workspace-link";
import { Search, ArrowLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import { useDemo } from "@/components/providers";
import {
  Badge,
  Empty,
  PageTitle,
  Panel,
  Score,
  TextLink,
} from "@/components/ui";
import {
  aggregate,
  windowRows,
  series,
  integer,
  decimal,
} from "@/domain/metrics";
import { MetricCards } from "./overview";
import { EvolutionChart } from "@/components/chart";
import { CreativeGrid } from "./creatives";
export function Campaigns() {
  const money = useMoney();
  const { data, days } = useDemo();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Todos");
  const rows = windowRows(data.daily, days);
  const campaigns = data.campaigns.filter(
    (c) =>
      c.name
        .toLocaleLowerCase("pt-BR")
        .includes(query.toLocaleLowerCase("pt-BR")) &&
      (status === "Todos" || c.status === status),
  );
  return (
    <>
      <PageTitle
        title="Campanhas"
        description="Acompanhe a performance e encontre seu próximo movimento."
      >
        <Badge tone="purple">{data.campaigns.length} campanhas</Badge>
      </PageTitle>
      <Panel>
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="Buscar campanha..."
              aria-label="Buscar campanha"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            className="select"
            aria-label="Filtrar por status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["Todos", "Ativa", "Pausada", "Em aprendizado"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="muted small">{campaigns.length} resultados</span>
        </div>
        {!campaigns.length ? (
          <Empty />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Campanha",
                    "Status",
                    "Orçamento / dia",
                    "Investimento",
                    "Leads",
                    "CPL",
                    "CTR",
                    "CPM",
                    "Frequência¹",
                    "Vendas",
                    "Score",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const m = aggregate(
                    rows.filter((r) => r.campaignId === c.id),
                  );
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link
                          className="campaign-name"
                          href={`/campanhas/${c.id}`}
                        >
                          <span
                            className="campaign-icon"
                            style={{
                              color: c.color,
                              background: c.color + "12",
                            }}
                          >
                            <TrendingUp size={18} />
                          </span>
                          <span>
                            {c.name}
                            <small>
                              {c.objective} <ArrowUpRight size={12} />
                            </small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <Badge
                          tone={
                            c.status === "Ativa"
                              ? "good"
                              : c.status === "Pausada"
                                ? "neutral"
                                : "warn"
                          }
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td>{money(c.budget)}</td>
                      <td>{money(m.spend)}</td>
                      <td>{integer(m.leads)}</td>
                      <td>{money(m.cpl)}</td>
                      <td>{decimal(m.ctr)}%</td>
                      <td>{money(m.cpm)}</td>
                      <td>{decimal(m.frequency)}×</td>
                      <td>{m.sales}</td>
                      <td>
                        <Score value={c.score} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="footnote">
        Orçamentos ilustram a configuração atual. Indicadores correspondem ao
        período selecionado. ¹ Frequência diária ponderada.
      </p>
    </>
  );
}
export function CampaignDetail({ id }: { id: string }) {
  const money = useMoney();
  const { data, days } = useDemo();
  const [tab, setTab] = useState("Evolução");
  const c = data.campaigns.find((c) => c.id === id)!;
  const all = data.daily.filter((r) => r.campaignId === id);
  const rows = windowRows(all, days);
  const m = aggregate(rows);
  const creatives = data.creatives.filter((c) => c.campaignId === id);
  const rec = data.recommendations.find((r) => r.campaignId === id);
  return (
    <>
      <Link className="back-link" href="/campanhas">
        <ArrowLeft size={16} />
        Todas as campanhas
      </Link>
      <PageTitle
        title={c.name}
        description={`${c.objective} · Orçamento diário: ${money(c.budget)}`}
      >
        <Badge tone={c.status === "Ativa" ? "good" : "neutral"}>
          {c.status}
        </Badge>
        <Score value={c.score} />
      </PageTitle>
      <MetricCards
        current={m}
        previous={aggregate(windowRows(all, days, true))}
      />
      <div className="tabs" role="tablist" aria-label="Detalhes da campanha">
        {["Evolução", "Conjuntos", "Anúncios", "Criativos"].map((t) => (
          <button
            role="tab"
            id={`tab-${t}`}
            aria-controls="campaign-panel"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            onKeyDown={(event) => {
              const tabs = ["Evolução", "Conjuntos", "Anúncios", "Criativos"];
              const index = tabs.indexOf(t);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % 4
                  : event.key === "ArrowLeft"
                    ? (index + 3) % 4
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 3
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(tabs[next]!);
              const buttons =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              buttons?.[next]?.focus();
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        id="campaign-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
      >
        {tab === "Evolução" ? (
          <Panel
            title="Evolução da campanha"
            description={`Resultados nos últimos ${days} dias`}
          >
            <EvolutionChart points={series(rows)} />
          </Panel>
        ) : tab === "Criativos" ? (
          <CreativeGrid campaignId={id} />
        ) : (
          <Panel
            title={tab === "Conjuntos" ? "Conjuntos de anúncios" : "Anúncios"}
            description="Distribuição simulada proporcional dos resultados da campanha."
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Criativo</th>
                    <th>Investimento</th>
                    <th>Impressões</th>
                    <th>Leads</th>
                    <th>CTR</th>
                    <th>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {creatives.map((cr) => (
                    <tr key={cr.id}>
                      <td>{tab === "Conjuntos" ? cr.adSet : cr.ad}</td>
                      <td>{cr.name}</td>
                      <td>{money(m.spend * cr.share)}</td>
                      <td>{integer(Math.round(m.impressions * cr.share))}</td>
                      <td>{integer(Math.round(m.leads * cr.share))}</td>
                      <td>{decimal(m.ctr)}%</td>
                      <td>{money(m.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
      <Panel
        className="diagnostic-panel"
        title="Diagnóstico Traffic AI"
        action={<Badge tone="purple">Simulado</Badge>}
      >
        {rec ? (
          <>
            <p>{rec.diagnosis}</p>
            <div className="diagnostic-columns">
              <div>
                <span className="eyebrow">CAUSA PROVÁVEL</span>
                <p>{rec.cause}</p>
              </div>
              <div>
                <span className="eyebrow">PRÓXIMA AÇÃO</span>
                <p>{rec.action}</p>
              </div>
            </div>
            <TextLink href="/recomendacoes">Revisar recomendações</TextLink>
          </>
        ) : (
          <p>
            A campanha está pausada. Revise o histórico de captação antes de
            considerar a reativação.
          </p>
        )}
      </Panel>
    </>
  );
}
