"use client";
import { useMoney } from "@/components/providers";
import {
  ArrowUpRight,
  Sparkles,
  Wallet,
  Users,
  MousePointer2,
  TrendingUp,
  ScanLine,
  Repeat2,
  ShoppingBag,
  Receipt,
  CircleAlert,
} from "lucide-react";
import Link from "@/components/workspace-link";
import { useDemo, useDecisions } from "@/components/providers";
import {
  PageTitle,
  Panel,
  Delta,
  TextLink,
  Score,
  Badge,
} from "@/components/ui";
import { EvolutionChart } from "@/components/chart";
import {
  aggregate,
  windowRows,
  series,
  integer,
  decimal,
  dateOffset,
  shortDate,
  type Metrics,
} from "@/domain/metrics";
export function MetricCards({
  current,
  previous,
}: {
  current: Metrics;
  previous: Metrics;
}) {
  const money = useMoney();
  const cards = [
    {
      label: "Investimento",
      key: "spend",
      icon: Wallet,
      format: money,
      inverse: false,
    },
    {
      label: "Leads gerados",
      key: "leads",
      icon: Users,
      format: integer,
      inverse: false,
    },
    {
      label: "Custo por lead",
      key: "cpl",
      icon: MousePointer2,
      format: money,
      inverse: true,
    },
    {
      label: "Taxa de cliques",
      key: "ctr",
      icon: TrendingUp,
      format: (v: number) => decimal(v) + "%",
      inverse: false,
    },
    { label: "CPM", key: "cpm", icon: ScanLine, format: money, inverse: true },
    {
      label: "Frequência média¹",
      key: "frequency",
      icon: Repeat2,
      format: (v: number) => decimal(v) + "×",
      inverse: true,
    },
    {
      label: "Conversões · vendas",
      key: "sales",
      icon: ShoppingBag,
      format: integer,
      inverse: false,
    },
    {
      label: "Custo por venda",
      key: "cpa",
      icon: Receipt,
      format: money,
      inverse: true,
    },
  ] as const;
  return (
    <div className="metrics-grid">
      {cards.map(({ label, key, icon: Icon, format, inverse }) => (
        <div className="metric-card" key={key}>
          <div className="metric-label">
            {label}
            <Icon size={17} />
          </div>
          <strong className="metric-value">{format(current[key])}</strong>
          <Delta
            current={current[key]}
            previous={previous[key]}
            inverse={inverse}
          />
        </div>
      ))}
    </div>
  );
}
export function Overview() {
  const money = useMoney();
  const { data, days } = useDemo();
  const { value } = useDecisions();
  const rows = windowRows(data.daily, days);
  const current = aggregate(rows);
  const previous = aggregate(windowRows(data.daily, days, true));
  const pending = data.recommendations.filter((r) => !value[r.id]);
  return (
    <>
      <PageTitle
        title="Visão geral"
        description="Cada número, uma oportunidade de crescer."
      >
        <span className="date-caption">
          {shortDate(dateOffset(-days + 1))} — {shortDate(dateOffset(0))}, 2026
        </span>
      </PageTitle>
      <div className="intelligence-banner">
        <div className="banner-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <strong>Seu próximo resultado começa com uma boa decisão.</strong>
          <p>
            {pending.length
              ? `A Traffic AI identificou ${pending.length} recomendações para suas campanhas.`
              : "Todas as recomendações foram revisadas. Suas decisões estão salvas neste navegador."}
          </p>
        </div>
        <Link href="/recomendacoes">
          Ver recomendações <ArrowUpRight size={17} />
        </Link>
      </div>
      <MetricCards current={current} previous={previous} />
      <div className="overview-middle">
        <Panel
          title="Evolução de performance"
          description="O ritmo dos seus resultados, dia após dia."
        >
          <EvolutionChart points={series(rows)} />
        </Panel>
        <Panel
          title="Radar da IA"
          action={
            <span className="radar-icon">
              <Sparkles size={17} />
            </span>
          }
          className="radar-panel"
        >
          <span className="eyebrow">DESTAQUES DA CONTA</span>
          <Link href="/campanhas/camp-03" className="radar-item">
            <span className="radar-dot orange" />
            <div>
              <strong>Atenção à fadiga criativa</strong>
              <p>
                Masterclass: queda de CTR e aumento de frequência nos últimos 5
                dias.
              </p>
              <Badge tone="warn">Requer atenção</Badge>
            </div>
            <ArrowUpRight size={16} />
          </Link>
          <Link href="/campanhas/camp-01" className="radar-item">
            <span className="radar-dot green" />
            <div>
              <strong>Espaço para crescer</strong>
              <p>
                Mentoria Scale tem o melhor score entre as campanhas da conta.
              </p>
              <Badge tone="good">Oportunidade</Badge>
            </div>
            <ArrowUpRight size={16} />
          </Link>
          <div className="radar-footer">
            <CircleAlert size={14} />
            Análise demonstrativa, sem IA conectada.
          </div>
          <TextLink href="/traffic-ai">Abrir central de inteligência</TextLink>
        </Panel>
      </div>
      <Panel
        title="Suas campanhas em destaque"
        description={`${data.campaigns.filter((c) => c.status !== "Pausada").length} campanhas em veiculação neste workspace`}
        action={<TextLink href="/campanhas">Ver todas as campanhas</TextLink>}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Campanha</th>
                <th>Status</th>
                <th>Investimento</th>
                <th>Leads</th>
                <th>CPL</th>
                <th>Score Traffic AI</th>
                <th>
                  <span className="sr-only">Detalhes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.slice(0, 4).map((c) => {
                const m = aggregate(rows.filter((r) => r.campaignId === c.id));
                return (
                  <tr key={c.id}>
                    <td>
                      <Link
                        className="campaign-name"
                        href={`/campanhas/${c.id}`}
                      >
                        <span
                          className="campaign-icon"
                          style={{ color: c.color, background: c.color + "12" }}
                        >
                          <TrendingUp size={17} />
                        </span>
                        <span>
                          {c.name}
                          <small>{c.objective}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Badge tone="good">{c.status}</Badge>
                    </td>
                    <td>{money(m.spend)}</td>
                    <td>{integer(m.leads)}</td>
                    <td>{money(m.cpl)}</td>
                    <td>
                      <Score value={c.score} />
                    </td>
                    <td>
                      <Link
                        className="icon-button"
                        aria-label={`Ver ${c.name}`}
                        href={`/campanhas/${c.id}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="footnote">
        ¹ Média ponderada de frequência diária. O alcance não é deduplicado
        entre dias. Comparação com os {days} dias anteriores.
      </p>
    </>
  );
}
