"use client";
import { useMoney } from "@/components/providers";
import { useState } from "react";
import Link from "@/components/workspace-link";
import { Search, Check, Minus } from "lucide-react";
import { useDemo } from "@/components/providers";
import { PageTitle, Panel, Badge, Empty } from "@/components/ui";
function Flag({ yes }: { yes: boolean }) {
  return (
    <span
      className={yes ? "positive" : "muted"}
      aria-label={yes ? "Sim" : "Não"}
    >
      {yes ? <Check size={17} /> : <Minus size={15} />}
    </span>
  );
}
export function Leads() {
  const money = useMoney();
  const { data } = useDemo();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("Todos");
  const filtered = data.leads.filter(
    (l) =>
      `${l.name} ${l.company}`.toLowerCase().includes(query.toLowerCase()) &&
      (stage === "Todos" || l.status === stage),
  );
  return (
    <>
      <PageTitle
        title="Leads / CRM"
        description="Do primeiro clique à receita. Veja o que realmente gera valor."
      >
        <Badge tone="purple">
          Amostra · {data.leads.length} leads fictícios
        </Badge>
      </PageTitle>
      <div className="summary-cards four">
        <div>
          <span>Leads na amostra</span>
          <strong>{data.leads.length}</strong>
        </div>
        <div>
          <span>Qualificados</span>
          <strong>{data.leads.filter((l) => l.qualified).length}</strong>
        </div>
        <div>
          <span>Vendas</span>
          <strong>{data.leads.filter((l) => l.sale).length}</strong>
        </div>
        <div>
          <span>Receita da amostra</span>
          <strong>{money(data.leads.reduce((s, l) => s + l.value, 0))}</strong>
        </div>
      </div>
      <Panel
        title="Jornada dos leads"
        description="Amostra fixa para validar atribuição. Independente do período dos indicadores."
      >
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="Buscar nome ou empresa..."
              aria-label="Buscar lead"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            className="select"
            aria-label="Filtrar etapa do lead"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {[
              "Todos",
              "Novo",
              "Qualificado",
              "Reunião",
              "Proposta",
              "Venda",
              "Perdido",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <span className="muted small">{filtered.length} leads</span>
        </div>
        {!filtered.length ? (
          <Empty />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Lead",
                    "Campanha",
                    "Conjunto",
                    "Anúncio",
                    "Criativo",
                    "Status",
                    "Qualificado",
                    "Reunião",
                    "Proposta",
                    "Venda",
                    "Valor vendido",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const c = data.campaigns.find((c) => c.id === l.campaignId)!;
                  const cr = data.creatives.find((c) => c.id === l.creativeId)!;
                  return (
                    <tr key={l.id}>
                      <td>
                        <div className="lead-name">
                          <span className="lead-avatar">
                            {l.name
                              .split(" ")
                              .map((s) => s[0])
                              .join("")}
                          </span>
                          <span>
                            {l.name}
                            <small>{l.company}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <Link href={`/campanhas/${c.id}`}>{c.name}</Link>
                      </td>
                      <td>{cr.adSet}</td>
                      <td>{cr.ad}</td>
                      <td>{cr.name}</td>
                      <td>
                        <Badge
                          tone={
                            l.sale
                              ? "good"
                              : l.status === "Perdido"
                                ? "neutral"
                                : "purple"
                          }
                        >
                          {l.status}
                        </Badge>
                      </td>
                      <td>
                        <Flag yes={l.qualified} />
                      </td>
                      <td>
                        <Flag yes={l.meeting} />
                      </td>
                      <td>
                        <Flag yes={l.proposal} />
                      </td>
                      <td>
                        <Flag yes={l.sale} />
                      </td>
                      <td>{money(l.value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
