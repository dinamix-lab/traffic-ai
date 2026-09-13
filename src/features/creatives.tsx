"use client";
import { useMoney } from "@/components/providers";
import { useState } from "react";
import { Play, ArrowUpRight } from "lucide-react";
import Link from "@/components/workspace-link";
import { useDemo } from "@/components/providers";
import { Badge, Empty, PageTitle, Score } from "@/components/ui";
import { aggregate, windowRows, integer, decimal } from "@/domain/metrics";
export function CreativeGrid({
  campaignId,
  fatigueOnly = false,
}: {
  campaignId?: string;
  fatigueOnly?: boolean;
}) {
  const money = useMoney();
  const { data, days, workspace } = useDemo();
  const creatives = data.creatives.filter(
    (c) =>
      (!campaignId || c.campaignId === campaignId) &&
      (!fatigueOnly || c.fatigue),
  );
  if (!creatives.length) return <Empty title="Nenhum criativo neste filtro" />;
  return (
    <div className="creative-grid">
      {creatives.map((cr) => {
        const campaign = data.campaigns.find((c) => c.id === cr.campaignId)!;
        const m = aggregate(
          windowRows(
            data.daily.filter((r) => r.campaignId === cr.campaignId),
            days,
          ),
        );
        return (
          <article className="creative-card" key={cr.id}>
            <div
              className={`creative-art ${cr.format.startsWith("Vídeo") ? "video-art" : ""}`}
              style={{ "--creative-color": cr.color } as React.CSSProperties}
            >
              <span className="creative-brand">
                {workspace?.name.toUpperCase()}
              </span>
              <strong>{cr.headline}</strong>
              {cr.format.startsWith("Vídeo") ? (
                <span className="play-art">
                  <Play size={23} fill="currentColor" />
                </span>
              ) : (
                <span className="creative-cta">
                  Conheça o programa <ArrowUpRight size={13} />
                </span>
              )}
              <span className="creative-art-label">PEÇA CONCEITUAL · DEMO</span>
            </div>
            <div className="creative-body">
              <div className="creative-heading">
                <div>
                  <h3>{cr.name}</h3>
                  <span className="muted small">{cr.format}</span>
                </div>
                <Score value={cr.score} />
              </div>
              <Link
                className="creative-campaign"
                href={`/campanhas/${campaign.id}`}
              >
                {campaign.name} <ArrowUpRight size={13} />
              </Link>
              <div className="creative-metrics">
                <div>
                  <span>Investimento</span>
                  <strong>{money(m.spend * cr.share)}</strong>
                </div>
                <div>
                  <span>Impressões</span>
                  <strong>
                    {integer(Math.round(m.impressions * cr.share))}
                  </strong>
                </div>
                <div>
                  <span>CTR</span>
                  <strong>{decimal(m.ctr)}%</strong>
                </div>
                <div>
                  <span>CPL</span>
                  <strong>{money(m.cpl)}</strong>
                </div>
                <div>
                  <span>Frequência¹</span>
                  <strong>{decimal(m.frequency)}×</strong>
                </div>
                <div>
                  <span>Leads</span>
                  <strong>{integer(Math.round(m.leads * cr.share))}</strong>
                </div>
              </div>
              <Badge tone={cr.fatigue ? "warn" : "good"}>
                {cr.fatigue ? "Sinais de fadiga" : "Sem sinais de fadiga"}
              </Badge>
            </div>
          </article>
        );
      })}
    </div>
  );
}
export function Creatives() {
  const [fatigue, setFatigue] = useState(false);
  return (
    <>
      <PageTitle
        title="Criativos"
        description="Mensagens que conectam. Resultados que comprovam."
      />
      <div className="table-toolbar standalone">
        <div className="segmented">
          <button
            className={!fatigue ? "selected" : ""}
            aria-pressed={!fatigue}
            onClick={() => setFatigue(false)}
          >
            Todos os criativos
          </button>
          <button
            className={fatigue ? "selected" : ""}
            aria-pressed={fatigue}
            onClick={() => setFatigue(true)}
          >
            Com sinais de fadiga
          </button>
        </div>
        <span className="muted small">Peças conceituais de demonstração</span>
      </div>
      <CreativeGrid fatigueOnly={fatigue} />
      <p className="footnote">
        Resultados distribuídos proporcionalmente por criativo; CTR e CPL
        refletem a campanha nesta V1. ¹ Frequência diária ponderada.
      </p>
    </>
  );
}
