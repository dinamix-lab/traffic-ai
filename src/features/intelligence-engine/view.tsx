/* eslint-disable @next/next/no-img-element -- Optional user-supplied thumbnail, no server proxy or optimization fetch. */
"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/workspace-link";
import { PageTitle, Panel, Badge, Empty } from "@/components/ui";
import { apiRequest } from "@/features/auth/client";
import type { IntelligenceSnapshot } from "@/intelligence/service";
import type {
  Creative,
  Metric,
  MetricKey,
  Recommendation,
  WindowKey,
} from "@/intelligence/types";
import { organicKeys } from "@/intelligence/types";
import { configLabels, type IntelligenceConfig } from "@/intelligence/config";
import { taxonomy } from "@/intelligence/creative";
import { compare } from "@/intelligence/math";
import { formatMoney } from "@/crm/metrics";
const labels: Partial<Record<MetricKey, string>> = {
  spend: "Investimento",
  leads: "Leads",
  qualified: "Qualificados",
  qualificationRate: "Qualificação",
  completed: "Calls realizadas",
  scheduled: "Calls agendadas",
  noShows: "No-shows",
  showRate: "Show rate",
  proposals: "Propostas",
  sales: "Vendas",
  revenue: "Receita",
  cac: "CAC",
  roas: "ROAS",
  ctr: "CTR",
  cpl: "CPL",
  cpm: "CPM",
  frequency: "Frequência",
  callProposalRate: "Call → proposta",
  callSaleRate: "Call → venda",
  clickLeadRate: "Clique → lead",
};
const actionLabels: Record<string, string> = {
  SCALE: "Avaliar escala",
  MAINTAIN: "Manter",
  REDUCE_BUDGET: "Avaliar redução",
  PAUSE: "Avaliar pausa",
  TEST_NEW_CREATIVE: "Testar novo criativo",
  REPLACE_CREATIVE: "Substituir criativo",
  WAIT_FOR_DATA: "Aguardar mais dados",
  INVESTIGATE_LEAD_QUALITY: "Investigar qualidade",
  INVESTIGATE_SALES_PROCESS: "Investigar processo comercial",
  INVESTIGATE_LANDING_PAGE: "Investigar landing page",
};
const stateLabels: Record<string, string> = {
  published: "Cadastrado / publicado",
  organic_observation: "Observação orgânica",
  organic_evaluated: "Avaliado",
  test_proposed: "Teste proposto",
  test_approved: "Teste aprovado",
  paid_test_pending: "Teste pago pendente",
  paid_testing: "Teste pago em andamento",
  scale_candidate: "Candidato a escala",
  maintain_candidate: "Candidato a manutenção",
  pause_candidate: "Candidato a pausa",
  completed: "Concluído",
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  expired: "Expirada",
  superseded: "Substituída",
};
const date = (at: number | string) => new Date(at).toLocaleString("pt-BR");
const score = (v: number | null) => (v === null ? "—" : String(v));
const money = (v: string | null) => formatMoney(v, "");
function value(m: Metric | undefined) {
  return !m || m.value === null
    ? "Não disponível"
    : m.unit === "money"
      ? money(m.value)
      : m.unit === "percent"
        ? `${m.value}%`
        : m.unit === "ratio"
          ? `${m.value}×`
          : m.value;
}
type Mutate = (action: Record<string, unknown>) => Promise<void>;
export function IntelligenceView({
  initial,
  children,
}: {
  initial: IntelligenceSnapshot;
  children: ReactNode;
}) {
  const path = usePathname(),
    [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const relevant = [
    "/traffic-ai",
    "/recomendacoes",
    "/aprovacoes",
    "/creative-intelligence",
    "/reels",
    "/intelligence-settings",
    "/diario",
  ].includes(path);
  const base = `/api/workspaces/${data.workspaceId}/intelligence`;
  async function refresh(mode = data.mode, window = data.window) {
    setBusy(true);
    setError("");
    try {
      setData(
        await apiRequest<IntelligenceSnapshot>(
          `${base}?mode=${mode}&window=${window}`,
          "GET",
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na leitura.");
    } finally {
      setBusy(false);
    }
  }
  const mutate: Mutate = async (body) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await apiRequest(base, "POST", {
        mode: data.mode,
        window: data.window,
        ...body,
      });
      setData(
        await apiRequest<IntelligenceSnapshot>(
          `${base}?mode=${data.mode}&window=${data.window}`,
          "GET",
        ),
      );
      setMessage("Registro atualizado. Nenhuma ação externa foi executada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      setBusy(false);
    }
  };
  if (!relevant)
    return ["/", "/funil"].includes(path) ? (
      <>
        <Panel
          title="Inteligência de aquisição"
          action={
            <Link className="button" href="/traffic-ai">
              Ver análise
            </Link>
          }
        >
          <p>{data.briefing}</p>
          <p className="muted small">
            Traffic Health: {score(data.health?.score ?? null)} / 100 · índice
            parcial, não é ROAS.{" "}
            {data.recommendations.filter((r) => r.status === "pending").length}{" "}
            decisões pendentes.
          </p>
        </Panel>
        {children}
      </>
    ) : (
      children
    );
  if (path === "/intelligence-settings" && data.role !== "admin")
    return (
      <Empty
        title="Acesso restrito"
        description="Configurações exigem administrador."
      />
    );
  const pending = data.recommendations.filter((r) => r.status === "pending"),
    current = data.recommendations.length ? pending : data.preview;
  return (
    <div className="intelligence-workspace">
      <PageTitle
        title={
          path === "/traffic-ai"
            ? "Seu gestor de tráfego inteligente"
            : path === "/reels"
              ? "Laboratório de Reels"
              : path === "/creative-intelligence"
                ? "Creative Intelligence"
                : path === "/intelligence-settings"
                  ? "Configurações de Inteligência"
                  : path === "/diario"
                    ? "Diário da IA"
                    : "Central de Aprovações"
        }
        description="Semiautomático · evidência, decisão humana e resultado de negócio."
      />
      <div className="intel-toolbar">
        <label>
          Fonte de análise
          <select
            aria-label="Fonte da inteligência"
            value={data.mode}
            disabled={busy}
            onChange={(e) => void refresh(e.target.value as "real" | "demo")}
          >
            <option value="real">Dados disponíveis do workspace</option>
            <option value="demo">Demonstração isolada</option>
          </select>
        </label>
        <label>
          Janela de análise
          <select
            aria-label="Janela da inteligência"
            value={data.window}
            disabled={busy || data.mode === "demo"}
            onChange={(e) =>
              void refresh(data.mode, e.target.value as WindowKey)
            }
          >
            {[
              ["today", "Hoje"],
              ["yesterday", "Ontem"],
              ["3", "Últimos 3 dias"],
              ["7", "Últimos 7 dias"],
              ["14", "Últimos 14 dias"],
              ["30", "Últimos 30 dias"],
            ].map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void mutate({ action: "analyze" })}
        >
          {busy ? "Processando…" : "Atualizar análise"}
        </button>
        <Link className="button" href="/aprovacoes">
          Aprovações ({pending.length})
        </Link>
        <Link className="button" href="/creative-intelligence">
          Creative Intelligence
        </Link>
        <Link className="button" href="/reels">
          Reels
        </Link>
      </div>
      {data.mode === "demo" && (
        <p className="info-note">
          <strong>DEMONSTRAÇÃO ISOLADA.</strong> Mídia e resultados comerciais
          desta análise são simulados. Não utilizam vendas reais do CRM. Janela
          demonstrativa fixa de 7 dias.
        </p>
      )}
      <p className="small muted">
        Valores monetários em {data.currency}. Aprovações não executam ações
        externas.
      </p>
      <div aria-live="polite">
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {message && <p className="info-note">{message}</p>}
      </div>
      {path === "/intelligence-settings" ? (
        <ConfigForm config={data.config!} mutate={mutate} busy={busy} />
      ) : path === "/reels" || path === "/creative-intelligence" ? (
        <CreativeWorkspace
          data={data}
          mutate={mutate}
          busy={busy}
          lab={path === "/reels"}
        />
      ) : path === "/diario" ? (
        <DecisionJournal data={data} mutate={mutate} />
      ) : (
        <>
          {path === "/traffic-ai" && (
            <>
              <Panel
                className="intel-brief"
                title="Briefing operacional do dia"
              >
                <Badge tone="purple">
                  Narrador local · regras determinísticas
                </Badge>
                <p>{data.briefing}</p>
                <div className="intel-metrics">
                  {(
                    [
                      "spend",
                      "leads",
                      "qualified",
                      "completed",
                      "proposals",
                      "sales",
                      "revenue",
                      "cac",
                      "roas",
                    ] as MetricKey[]
                  ).map((k) => (
                    <div key={k}>
                      <span>{labels[k]}</span>
                      <strong>{value(data.metrics?.[k])}</strong>
                    </div>
                  ))}
                </div>
                <p className="small muted">
                  {data.role === "admin"
                    ? "Visão executiva: resultado comercial, riscos, oportunidades e decisões."
                    : "Visão operacional: investigar evidências, aprovar intenções e acompanhar tarefas."}
                </p>
              </Panel>
              <Panel title="Saúde e cobertura dos dados">
                <div className="intel-metrics">
                  <div>
                    <span>Traffic Health parcial</span>
                    <strong>{score(data.health?.score ?? null)} / 100</strong>
                  </div>
                  {data.health?.components.map((c) => (
                    <div key={c.name}>
                      <span>{c.name}</span>
                      <strong>
                        {score(c.score)}
                        {c.score !== null ? "%" : ""}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="small muted">{data.health?.note}</p>
                {data.sourceLimitations.map((l) => (
                  <p className="small muted" key={l}>
                    {l}
                  </p>
                ))}
              </Panel>
              {[
                [
                  "O que precisa da sua atenção hoje",
                  current.filter(
                    (r) => r.priority === "HIGH" || r.priority === "CRITICAL",
                  ),
                ],
                ["Oportunidades", current.filter((r) => r.type === "SCALE")],
                [
                  "Riscos e investigações",
                  current.filter(
                    (r) => r.bottleneck && r.type !== "WAIT_FOR_DATA",
                  ),
                ],
                [
                  "Aguardando mais dados",
                  current.filter((r) => r.type === "WAIT_FOR_DATA"),
                ],
                [
                  "Manter sob observação",
                  current.filter((r) => r.type === "MAINTAIN"),
                ],
              ].map(([title, rows]) => (
                <Panel key={String(title)} title={String(title)}>
                  {(rows as Recommendation[]).length ? (
                    <div className="intel-card-grid">
                      {(rows as Recommendation[]).map((r) => (
                        <RecommendationCard
                          key={r.id || r.entityId}
                          r={r}
                          mutate={mutate}
                          busy={busy}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      Nenhum sinal sustentado nesta categoria.
                    </p>
                  )}
                </Panel>
              ))}
            </>
          )}
          {path !== "/traffic-ai" && (
            <>
              <Panel
                title="Decisões aguardando análise"
                description="Aprovação registra concordância. Não pausa, escala ou cria campanhas."
              >
                {pending.length ? (
                  <div className="intel-card-grid">
                    {pending.map((r) => (
                      <RecommendationCard
                        key={r.id}
                        r={r}
                        mutate={mutate}
                        busy={busy}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="Nenhuma recomendação pendente"
                    description="Use Atualizar análise para registrar recomendações com os dados disponíveis."
                  />
                )}
              </Panel>
              <TestApprovals data={data} mutate={mutate} busy={busy} />
            </>
          )}
          <DecisionJournal data={data} mutate={mutate} compact />
        </>
      )}
      <Panel title="Notificações internas">
        <div className="intel-notifications">
          {data.notifications
            .filter((n) => !n.readBy.includes(data.userId))
            .slice(0, 12)
            .map((n) => (
              <div key={n.id}>
                <p>
                  {n.message}
                  <small>{date(n.at)}</small>
                </p>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate({
                      action: "mark",
                      kind: "notification",
                      id: n.id,
                    })
                  }
                >
                  Marcar como lida
                </button>
              </div>
            ))}
        </div>
        {!data.notifications.some((n) => !n.readBy.includes(data.userId)) && (
          <p className="muted">Nenhuma notificação nova.</p>
        )}
      </Panel>
    </div>
  );
}
function RecommendationCard({
  r,
  mutate,
  busy,
}: {
  r: Recommendation;
  mutate: Mutate;
  busy: boolean;
}) {
  const [reject, setReject] = useState(false);
  const canDecide = !!r.id && r.status === "pending";
  return (
    <article className={`intel-card ${r.priority.toLowerCase()}`}>
      <div className="intel-card-top">
        <span>{r.entityName}</span>
        <Badge
          tone={
            r.priority === "HIGH"
              ? "warn"
              : r.type === "SCALE"
                ? "good"
                : "neutral"
          }
        >
          {r.priority}
        </Badge>
      </div>
      <h3>{r.title}</h3>
      <p>{r.probableCause}</p>
      <div className="intel-signal">
        <strong>{actionLabels[r.type]}</strong>
        <span>
          {r.confidenceScore}% · confiança {r.confidenceLevel}
        </span>
      </div>
      <p className="small">
        Suficiência: {r.dataSufficiency} · {r.period.from} a {r.period.to}
      </p>
      <p>{r.businessImpact}</p>
      <details>
        <summary>Por que o Traffic AI está dizendo isso?</summary>
        <p>{r.suggestedAction}</p>
        <ul>
          {r.evidence.map((e) => (
            <li key={e.metric}>
              {labels[e.metric] || e.metric}: <strong>{e.current}</strong> vs{" "}
              {e.previous ?? "não disponível"}
              {e.change !== null
                ? ` (${e.change > 0 ? "+" : ""}${e.change}%)`
                : ""}{" "}
              · {e.source}
            </li>
          ))}
        </ul>
        <p>
          Regra: {r.rule} · {r.ruleVersion}
        </p>
        <p>
          Comparação: {r.period.days} dias, fuso {r.period.timezone}. Expira:{" "}
          {date(r.expiresAt)}.
        </p>
        {r.conflicts.map((x) => (
          <p className="info-note" key={x}>
            {x}
          </p>
        ))}
        {r.blockedBy.map((x) => (
          <p className="info-note" key={x}>
            {x}
          </p>
        ))}
        {r.limitations.map((x) => (
          <p className="small muted" key={x}>
            {x}
          </p>
        ))}
        <p>
          Impacto financeiro estimado: não disponível. Nenhuma projeção
          garantida.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Métrica</th>
                <th>Atual</th>
                <th>Anterior</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(r.before).map(([k, m]) => (
                <tr key={k}>
                  <td>{labels[k as MetricKey] || k}</td>
                  <td>{value(m)}</td>
                  <td>{value(r.previous[k as MetricKey])}</td>
                  <td>{m.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {canDecide ? (
        <>
          <div className="integration-actions">
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void mutate({
                  action: "decide",
                  id: r.id,
                  decision: "approved",
                })
              }
            >
              Aprovar
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => setReject(!reject)}
            >
              Rejeitar
            </button>
          </div>
          {reject && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void mutate({
                  action: "decide",
                  id: r.id,
                  decision: "rejected",
                  reason: f.get("reason"),
                  note: f.get("note"),
                });
              }}
            >
              <label>
                Motivo opcional
                <select name="reason">
                  {[
                    "",
                    "estratégia comercial",
                    "campanha ainda em teste",
                    "informação que a IA não possui",
                    "recomendação incorreta",
                    "outro",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v || "Não informar"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Observação
                <textarea name="note" maxLength={1000} />
              </label>
              <button className="button" disabled={busy}>
                Registrar rejeição
              </button>
            </form>
          )}
        </>
      ) : (
        <p className="small muted">
          {r.id
            ? stateLabels[r.status]
            : "Prévia: clique Atualizar análise para registrar esta recomendação."}
        </p>
      )}
    </article>
  );
}
function DecisionJournal({
  data,
  mutate,
  compact = false,
}: {
  data: IntelligenceSnapshot;
  mutate: Mutate;
  compact?: boolean;
}) {
  return (
    <>
      {!compact && (
        <Panel title="Diário cronológico">
          <div className="intel-timeline">
            {data.journal.map((j) => (
              <article key={j.id}>
                <time>{j.day}</time>
                <h3>
                  {j.risks} riscos · {j.opportunities} oportunidades
                </h3>
                <p>{j.summary}</p>
                <p className="small">
                  {j.recommendations.length} recomendações · {j.decisions}{" "}
                  decisões · {j.observing} criativos em observação ·{" "}
                  {j.testsActive} testes ativos · {j.testsCompleted} concluídos
                </p>
                <p>
                  Gargalos: {j.bottlenecks.join(", ") || "Nenhum sustentado"}
                </p>
                <p>
                  Receita observada: {value(j.metrics.revenue)} · Vendas:{" "}
                  {value(j.metrics.sales)}
                </p>
              </article>
            ))}
          </div>
          {!data.journal.length && (
            <p>
              O diário é registrado pelo worker local ou ao atualizar a análise.
            </p>
          )}
        </Panel>
      )}
      <Panel title="Decisões recentes e resultados">
        <div className="intel-timeline">
          {data.decisions.slice(0, compact ? 5 : 100).map((d) => (
            <article key={d.id}>
              <time>
                {date(d.at)} · {d.actorName}
              </time>
              <h3>{d.recommendation.title}</h3>
              <Badge tone={d.decision === "approved" ? "good" : "neutral"}>
                {stateLabels[d.decision]}
              </Badge>
              <p>
                {d.reason} {d.note}
              </p>
              <p>
                Resultado:{" "}
                <strong>
                  {
                    {
                      positive: "positivo",
                      neutral: "neutro",
                      negative: "negativo",
                      inconclusive: "inconclusivo",
                    }[d.outcome.status]
                  }
                </strong>{" "}
                · {d.outcome.note}
              </p>
              <details>
                <summary>Métricas e evidências no momento da decisão</summary>
                <ul>
                  {d.recommendation.evidence.map((e) => (
                    <li key={e.metric}>{e.statement}</li>
                  ))}
                </ul>
                {d.outcome.after && (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Métrica</th>
                          <th>Antes</th>
                          <th>Depois</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(d.outcome.changes).map((k) => (
                          <tr key={k}>
                            <td>{labels[k as MetricKey] || k}</td>
                            <td>{value(d.before[k as MetricKey])}</td>
                            <td>{value(d.outcome.after![k as MetricKey])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>
              {d.decision === "approved" && (
                <p>
                  Tarefa de acompanhamento:{" "}
                  {d.taskStatus === "done" ? (
                    "registrada como concluída localmente"
                  ) : (
                    <button
                      className="button"
                      onClick={() =>
                        void mutate({ action: "mark", kind: "task", id: d.id })
                      }
                    >
                      Concluir acompanhamento
                    </button>
                  )}
                </p>
              )}
            </article>
          ))}
        </div>
        {!data.decisions.length && (
          <p className="muted">
            As decisões aprovadas ou rejeitadas aparecerão aqui com usuário,
            data, evidências e resultado posterior.
          </p>
        )}
      </Panel>
      {!compact && data.recommendations.some((r) => r.status !== "pending") && (
        <Panel title="Histórico de recomendações">
          {data.recommendations
            .filter((r) => r.status !== "pending")
            .map((r) => (
              <p key={r.id}>
                {date(r.createdAt)} · {r.entityName} · {r.title} ·{" "}
                {stateLabels[r.status]}
              </p>
            ))}
        </Panel>
      )}
      {!compact && data.role === "admin" && (
        <Panel title="Auditoria administrativa">
          {data.audit.map((a) => (
            <p className="small" key={a.id}>
              {date(a.at)} · {a.action} · usuário {a.actorId} · entidade{" "}
              {a.entityId}
            </p>
          ))}
        </Panel>
      )}
    </>
  );
}
function ConfigForm({
  config,
  mutate,
  busy,
}: {
  config: IntelligenceConfig;
  mutate: Mutate;
  busy: boolean;
}) {
  return (
    <Panel
      title="Parâmetros por workspace"
      description="Valores iniciais são hipóteses operacionais ajustáveis, não benchmarks universais. Alvos vazios não são inventados."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutate({
            action: "config",
            values: Object.fromEntries(new FormData(e.currentTarget)),
          });
        }}
      >
        <div className="intel-form-grid">
          {(Object.keys(configLabels) as (keyof IntelligenceConfig)[]).map(
            (k) => (
              <label key={k}>
                {configLabels[k]}
                <input
                  name={k}
                  defaultValue={config[k]}
                  type={typeof config[k] === "number" ? "number" : "text"}
                  step="any"
                  maxLength={1000}
                />
              </label>
            ),
          )}
        </div>
        <p className="info-note">
          Aprovar não executa na Meta. Teto por Reel soma os testes de
          crescimento e conversão; orçamentos são totais do teste, não diários.
        </p>
        <button className="button primary" disabled={busy}>
          Salvar configurações
        </button>
      </form>
    </Panel>
  );
}
const orgLabels: Record<string, string> = {
  views: "Visualizações",
  reach: "Alcance",
  plays: "Plays",
  watchTime: "Tempo assistido (s)",
  averageWatchTime: "Tempo médio (s)",
  retention: "Retenção (%)",
  likes: "Curtidas",
  comments: "Comentários",
  shares: "Compartilhamentos",
  saves: "Salvamentos",
  profileVisits: "Visitas ao perfil",
  followers: "Seguidores gerados",
};
function CreativeWorkspace({
  data,
  mutate,
  busy,
  lab,
}: {
  data: IntelligenceSnapshot;
  mutate: Mutate;
  busy: boolean;
  lab: boolean;
}) {
  const [editing, setEditing] = useState<Creative | null>(null),
    [sort, setSort] = useState("organic");
  const sorted = [...data.creatives].sort((a, b) => {
    if (sort === "organic" || sort === "business")
      return (
        (b[sort === "organic" ? "organicScore" : "businessScore"].value ?? -1) -
        (a[sort === "organic" ? "organicScore" : "businessScore"].value ?? -1)
      );
    const av = a.business?.[sort as MetricKey].value,
      bv = b.business?.[sort as MetricKey].value;
    return av === null || av === undefined
      ? 1
      : bv === null || bv === undefined
        ? -1
        : compare(bv, av);
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const organic = Object.fromEntries(
      organicKeys.map((k) => [k, f[`organic_${k}`]]),
    );
    const values = { ...f, organic, ...(editing ? { id: editing.id } : {}) };
    for (const k of organicKeys)
      delete values[`organic_${k}` as keyof typeof values];
    void mutate({ action: "creative", values });
  }
  return (
    <>
      <Panel
        title={
          lab
            ? "Da observação ao teste aprovado"
            : "Conteúdo e resultado comercial"
        }
        description="Organic Score e Business Score medem coisas diferentes. Um criativo com CPL maior pode gerar mais calls, vendas ou receita."
      >
        <div className="reel-flow">
          {[
            "Publicado",
            "Observação",
            "Avaliação",
            "Proposta",
            "Aprovação",
            "Teste pago pendente",
            "Monitoramento futuro",
          ].map((s, i) => (
            <span key={s}>
              <b>{i + 1}</b>
              {s}
            </span>
          ))}
        </div>
        <p className="small muted">
          Métricas orgânicas são informadas manualmente com data da observação.
          Campos em branco permanecem desconhecidos. A integração orgânica Meta
          e a execução paga ainda não estão disponíveis.
        </p>
        {data.mode === "demo" && (
          <button
            className="button"
            disabled={busy}
            onClick={() => void mutate({ action: "seedDemo" })}
          >
            Carregar exemplos isolados de Reels
          </button>
        )}
      </Panel>
      <Panel
        title={
          editing ? `Editar ${editing.title}` : "Cadastrar Reel / criativo"
        }
      >
        <details open={!!editing}>
          <summary>
            {editing
              ? "Formulário de edição"
              : "Adicionar conteúdo publicado e métricas conhecidas"}
          </summary>
          <form key={editing?.id || "new"} onSubmit={submit}>
            <div className="intel-form-grid">
              {[
                ["title", "Identificação", true],
                ["profileId", "Identificador do perfil", true],
                ["platform", "Plataforma", false],
                ["mediaType", "Tipo de mídia", false],
                ["publicationId", "ID da publicação", false],
                ["publishedAt", "Data da publicação (ISO UTC)", false],
                ["organicAsOf", "Data da medição (ISO UTC)", false],
                ["duration", "Duração (segundos)", false],
                ["thumbnail", "Thumbnail HTTPS (opcional)", false],
                ["trafficCreativeId", "Creative ID Traffic conhecido", false],
                ["metaCreativeId", "Creative ID Meta conhecido", false],
                ["theme", "Tema", false],
                ["presenter", "Apresentador", false],
                ["tags", "Tags separadas por vírgulas", false],
              ].map(([key, label, required]) => (
                <label key={String(key)}>
                  {label}
                  <input
                    name={String(key)}
                    required={Boolean(required)}
                    maxLength={1000}
                    defaultValue={
                      key === "tags"
                        ? editing?.tags.join(", ")
                        : String(
                            editing?.[key as keyof Creative] ??
                              (key === "platform"
                                ? "instagram"
                                : key === "mediaType"
                                  ? "reel"
                                  : ""),
                          )
                    }
                  />
                </label>
              ))}
              {(Object.keys(taxonomy) as (keyof typeof taxonomy)[]).map((k) => (
                <label key={k}>
                  {k}
                  <select name={k} defaultValue={editing?.[k] || "outro"}>
                    {taxonomy[k].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label>
              Legenda
              <textarea
                name="caption"
                defaultValue={editing?.caption}
                maxLength={1500}
              />
            </label>
            <h3>Métricas orgânicas observadas</h3>
            <div className="intel-form-grid">
              {organicKeys.map((k) => (
                <label key={k}>
                  {orgLabels[k]}
                  <input
                    name={`organic_${k}`}
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={editing?.organic[k] ?? ""}
                    placeholder="Não disponível"
                  />
                </label>
              ))}
            </div>
            <div className="integration-actions">
              <button disabled={busy} className="button primary">
                Salvar criativo
              </button>
              {editing && (
                <button
                  type="button"
                  className="button"
                  onClick={() => setEditing(null)}
                >
                  Novo cadastro
                </button>
              )}
            </div>
          </form>
        </details>
      </Panel>
      {!sorted.length ? (
        <Panel>
          <Empty
            title="Nenhum Reel cadastrado"
            description="Cadastre um conteúdo publicado. Não criamos Reels, métricas orgânicas ou pontuações fictícias no modo real."
          />
        </Panel>
      ) : (
        <>
          <label className="intel-sort">
            Ordenar por
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {[
                ["organic", "Organic Score"],
                ["business", "Business Score"],
                ["sales", "Vendas"],
                ["revenue", "Receita"],
                ["completed", "Calls realizadas"],
                ["roas", "Eficiência / ROAS"],
              ].map(([k, l]) => (
                <option value={k} key={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="reel-grid">
            {sorted.map((c) => (
              <article className="reel-card" key={c.id}>
                <div className="reel-thumbnail">
                  {c.thumbnail ? (
                    <img
                      src={c.thumbnail}
                      alt={c.title}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>
                      ▶<small>Sem thumbnail</small>
                    </span>
                  )}
                  <Badge tone="purple">
                    {c.source === "demo" ? "Demonstração" : "Cadastro manual"}
                  </Badge>
                </div>
                <div className="reel-body">
                  <span className="small muted">
                    {c.platform} · {c.profileId}
                  </span>
                  <h3>{c.title}</h3>
                  <p className="small">
                    {c.publishedAt
                      ? date(c.publishedAt)
                      : "Publicação não informada"}{" "}
                    ·{" "}
                    {c.publishedAt
                      ? `${Math.max(0, Math.floor((data.generatedAt - Date.parse(c.publishedAt)) / 3600000))}h desde publicação`
                      : ""}
                  </p>
                  <div className="reel-scores">
                    <div>
                      <span>Organic Score</span>
                      <strong>{score(c.organicScore.value)}</strong>
                    </div>
                    <div>
                      <span>Business Score</span>
                      <strong>{score(c.businessScore.value)}</strong>
                    </div>
                  </div>
                  <Badge>{stateLabels[c.status]}</Badge>
                  <p>{c.recommendation}</p>
                  <p className="small">
                    Confiança: {c.confidence}% · {c.tags.join(" · ")}
                  </p>
                  <div className="integration-actions">
                    <button
                      className="button"
                      disabled={
                        busy ||
                        ![
                          "published",
                          "organic_observation",
                          "organic_evaluated",
                        ].includes(c.status)
                      }
                      onClick={() =>
                        void mutate({ action: "evaluate", id: c.id })
                      }
                    >
                      Avaliar
                    </button>
                    <button className="button" onClick={() => setEditing(c)}>
                      Editar
                    </button>
                  </div>
                  {["organic_evaluated", "test_proposed"].includes(
                    c.status,
                  ) && (
                    <div className="integration-actions">
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            action: "propose",
                            id: c.id,
                            type: "GROWTH",
                          })
                        }
                      >
                        Propor crescimento
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          void mutate({
                            action: "propose",
                            id: c.id,
                            type: "CONVERSION",
                          })
                        }
                      >
                        Propor conversão
                      </button>
                    </div>
                  )}
                  <details>
                    <summary>Scores, evidências e timeline</summary>
                    {[c.organicScore, c.businessScore].map((s, i) => (
                      <div key={i}>
                        <h4>{i ? "Business Score" : "Organic Score"}</h4>
                        <p>{s.explanation}</p>
                        {s.components.map((x) => (
                          <p className="small" key={x.name}>
                            {x.name}: {Math.round(x.value)} · peso {x.weight} ·
                            mediana {x.baseline}
                          </p>
                        ))}
                      </div>
                    ))}
                    <ol className="intel-timeline">
                      {c.timeline.map((t, i) => (
                        <li key={i}>
                          <time>{date(t.at)}</time>
                          <strong>{stateLabels[t.state]}</strong>
                          <p>{t.text}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                </div>
              </article>
            ))}
          </div>
          <Panel title="Comparação de Reels">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Reel",
                      "Organic",
                      "Business",
                      "Investimento",
                      "Leads",
                      "Qualificados",
                      "Calls",
                      "Propostas",
                      "Vendas",
                      "Receita",
                      "Status",
                      "Recomendação",
                    ].map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr key={c.id}>
                      <td>{c.title}</td>
                      <td>{score(c.organicScore.value)}</td>
                      <td>{score(c.businessScore.value)}</td>
                      {(
                        [
                          "spend",
                          "leads",
                          "qualified",
                          "completed",
                          "proposals",
                          "sales",
                          "revenue",
                        ] as MetricKey[]
                      ).map((k) => (
                        <td key={k}>{value(c.business?.[k])}</td>
                      ))}
                      <td>{stateLabels[c.status]}</td>
                      <td>{c.recommendation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
      <TestApprovals data={data} mutate={mutate} busy={busy} />
      <Panel
        title="Padrões criativos"
        description="Associações descritivas dentro do workspace; nenhuma causalidade presumida."
      >
        {data.patterns.length ? (
          data.patterns.map((p) => (
            <div className="intel-pattern" key={p.id}>
              <Badge>{p.status}</Badge>
              <h3>{p.feature}</h3>
              <p>
                {p.creatives} criativos · {p.leads} leads · qualificação{" "}
                {p.qualificationRate.toFixed(1)}% vs {p.baselineRate.toFixed(1)}
                % · confiança {p.confidence}%
              </p>
              <p className="small muted">{p.note}</p>
            </div>
          ))
        ) : (
          <p className="muted">
            Sem amostra comparável suficiente para descobrir padrões. Cadastre a
            taxonomia e vincule IDs com evidência comercial.
          </p>
        )}
      </Panel>
    </>
  );
}
function TestApprovals({
  data,
  mutate,
  busy,
}: {
  data: IntelligenceSnapshot;
  mutate: Mutate;
  busy: boolean;
}) {
  return (
    <Panel
      title="Propostas de teste de Reels"
      description="GROWTH e CONVERSION são intenções internas, sem presumir objetivos específicos disponíveis na Meta."
    >
      {data.tests.length ? (
        data.tests.map((t) => (
          <article className="intel-card" key={t.id}>
            <h3>
              {data.creatives.find((c) => c.id === t.creativeId)?.title} ·{" "}
              {t.type}
            </h3>
            <p>
              Orçamento total: {money(t.budget)} · {t.days} dias ·{" "}
              {t.status === "paid_test_pending"
                ? "APROVADO — execução Meta pendente"
                : t.status === "rejected"
                  ? "Rejeitado"
                  : "Aguardando aprovação"}
            </p>
            <p>Resultado: inconclusivo · sem teste pago executado.</p>
            <details>
              <summary>Tracking planejado e análise</summary>
              <p className="small">
                IDs planejados, não são IDs de campanha Meta executada. A URL
                usa o serviço de atribuição existente.
              </p>
              <code className="intel-url">{t.trackingUrl}</code>
              <p>
                Métricas antes:{" "}
                {t.before
                  ? `leads ${value(t.before.leads)}; receita ${value(t.before.revenue)}`
                  : "não disponíveis"}
                . Durante/depois: não disponíveis.
              </p>
            </details>
            {t.status === "proposed" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void mutate({
                    action: "decideTest",
                    id: t.id,
                    approved: false,
                    reason: f.get("reason"),
                  });
                }}
              >
                <label>
                  Motivo de rejeição (opcional)
                  <input name="reason" maxLength={1000} />
                </label>
                <div className="integration-actions">
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      void mutate({
                        action: "decideTest",
                        id: t.id,
                        approved: true,
                      })
                    }
                  >
                    Aprovar teste
                  </button>
                  <button className="button" disabled={busy}>
                    Rejeitar teste
                  </button>
                </div>
              </form>
            )}
          </article>
        ))
      ) : (
        <p className="muted">Nenhuma proposta neste workspace e modo.</p>
      )}
    </Panel>
  );
}
