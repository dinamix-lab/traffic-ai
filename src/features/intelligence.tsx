"use client";
import { useState } from "react";
import Link from "@/components/workspace-link";
import {
  Sparkles,
  Check,
  X,
  RotateCcw,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { useDemo, useDecisions } from "@/components/providers";
import { Badge, Empty, PageTitle, Panel } from "@/components/ui";
export function Intelligence() {
  const { data } = useDemo();
  return (
    <>
      <PageTitle
        title="Traffic AI"
        description="Transforme sinais de performance em decisões mais claras."
      >
        <Badge tone="purple">
          <Sparkles size={13} />
          Inteligência simulada
        </Badge>
      </PageTitle>
      <div className="ai-intro">
        <span className="ai-orb">
          <Sparkles size={28} />
        </span>
        <div>
          <span className="eyebrow">SUA CENTRAL DE INTELIGÊNCIA</span>
          <h2>Mais contexto. Melhores decisões.</h2>
          <p>
            Diagnósticos com causa provável, impacto e uma próxima ação para
            revisar.
          </p>
        </div>
        <div className="ai-intro-stat">
          <strong>{data.recommendations.length}</strong>
          <span>análises disponíveis</span>
        </div>
      </div>
      <div className="diagnosis-grid">
        {data.recommendations.map((rec) => (
          <Panel key={rec.id} className="diagnosis-card">
            <div className="rec-top">
              <Badge tone={rec.priority === "Alta" ? "warn" : "purple"}>
                Prioridade {rec.priority.toLowerCase()}
              </Badge>
              <span className="confidence">
                <ShieldCheck size={15} />
                {rec.confidence}% confiança*
              </span>
            </div>
            <h2>{rec.title}</h2>
            <Link
              className="creative-campaign"
              href={`/campanhas/${rec.campaignId}`}
            >
              {data.campaigns.find((c) => c.id === rec.campaignId)?.name}
              <ArrowUpRight size={13} />
            </Link>
            <p>{rec.diagnosis}</p>
            <dl className="diagnosis-list">
              <div>
                <dt>Causa provável</dt>
                <dd>{rec.cause}</dd>
              </div>
              <div>
                <dt>Impacto</dt>
                <dd>{rec.impact}</dd>
              </div>
              <div>
                <dt>Recomendação</dt>
                <dd>{rec.action}</dd>
              </div>
            </dl>
            <Link className="text-link" href="/recomendacoes">
              Revisar na central <ArrowUpRight size={15} />
            </Link>
          </Panel>
        ))}
      </div>
      <p className="footnote">
        * Confiança ilustrativa. Diagnósticos fixos de demonstração, referentes
        ao recorte recente de 5 dias; não mudam com o seletor de período.
      </p>
    </>
  );
}
export function Recommendations() {
  const { data } = useDemo();
  const { value, save, error } = useDecisions();
  const [filter, setFilter] = useState("pending");
  const [notice, setNotice] = useState("");
  const counts = {
    pending: data.recommendations.filter((r) => !value[r.id]).length,
    approved: data.recommendations.filter((r) => value[r.id] === "approved")
      .length,
    ignored: data.recommendations.filter((r) => value[r.id] === "ignored")
      .length,
  };
  const filtered = data.recommendations.filter(
    (r) =>
      filter === "all" ||
      (filter === "pending" ? !value[r.id] : value[r.id] === filter),
  );
  function decide(id: string, decision?: "approved" | "ignored") {
    const next = { ...value };
    if (decision) next[id] = decision;
    else delete next[id];
    if (save(next))
      setNotice(
        decision === "approved"
          ? "Aprovação salva localmente. Nenhuma alteração foi executada no Meta Ads."
          : decision === "ignored"
            ? "Recomendação ignorada. Você pode reabrir a decisão a qualquer momento."
            : "Recomendação devolvida para revisão.",
      );
  }
  return (
    <>
      <PageTitle
        title="Recomendações"
        description="A inteligência sugere. Você decide."
      />
      <div className="summary-cards">
        <div>
          <span>Pendentes de revisão</span>
          <strong>{counts.pending.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Aprovadas localmente</span>
          <strong>{counts.approved.toString().padStart(2, "0")}</strong>
        </div>
        <div>
          <span>Ignoradas</span>
          <strong>{counts.ignored.toString().padStart(2, "0")}</strong>
        </div>
      </div>
      <div className="info-note">
        <ShieldCheck size={18} />
        <span>
          Modo de validação: decisões ficam neste navegador. Aprovações não
          executam ações no Meta Ads.
        </span>
      </div>
      <div className="tabs">
        {[
          ["pending", "Pendentes"],
          ["approved", "Aprovadas"],
          ["ignored", "Ignoradas"],
          ["all", "Todas"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? "active" : ""}
            aria-pressed={filter === key}
            onClick={() => setFilter(key!)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {!filtered.length ? (
        <Panel>
          <Empty
            title="Nenhuma recomendação nesta lista"
            description="As decisões revisadas aparecem nas abas Aprovadas ou Ignoradas."
          />
        </Panel>
      ) : (
        <div className="recommendation-list">
          {filtered.map((rec) => (
            <Panel key={rec.id} className="recommendation-card">
              <div className="rec-main">
                <span className="recommendation-icon">
                  <Sparkles size={21} />
                </span>
                <div>
                  <div className="rec-top">
                    <Badge tone={rec.priority === "Alta" ? "warn" : "purple"}>
                      {rec.priority}
                    </Badge>
                    <span className="muted small">
                      {rec.kind} · {rec.confidence}% confiança ilustrativa
                    </span>
                  </div>
                  <h2>{rec.title}</h2>
                  <Link
                    className="creative-campaign"
                    href={`/campanhas/${rec.campaignId}`}
                  >
                    {data.campaigns.find((c) => c.id === rec.campaignId)?.name}
                  </Link>
                  <p>{rec.action}</p>
                  <details>
                    <summary>Ver evidências e impacto</summary>
                    <p>{rec.diagnosis}</p>
                    <p>
                      <strong>Causa provável: </strong>
                      {rec.cause}
                    </p>
                    <p>
                      <strong>Impacto: </strong>
                      {rec.impact}
                    </p>
                  </details>
                </div>
              </div>
              <div className="rec-actions">
                {!value[rec.id] ? (
                  <>
                    <button
                      className="button primary"
                      onClick={() => decide(rec.id, "approved")}
                    >
                      <Check size={16} />
                      Aprovar
                    </button>
                    <button
                      className="button"
                      onClick={() => decide(rec.id, "ignored")}
                    >
                      <X size={16} />
                      Ignorar
                    </button>
                  </>
                ) : (
                  <>
                    <Badge
                      tone={value[rec.id] === "approved" ? "good" : "neutral"}
                    >
                      {value[rec.id] === "approved"
                        ? "Aprovada localmente"
                        : "Ignorada"}
                    </Badge>
                    <button className="button" onClick={() => decide(rec.id)}>
                      <RotateCcw size={15} />
                      Reabrir decisão
                    </button>
                  </>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
