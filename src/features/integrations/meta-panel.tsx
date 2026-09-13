"use client";
import type { CrmSnapshot } from "@/crm/types";
import { CrmCard } from "./crm-card";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "@/components/workspace-link";
import { PageTitle, Panel, Badge } from "@/components/ui";
import { apiRequest } from "../auth/client";
import type { MetaSnapshot } from "@/meta/types";
import { integrationCatalog } from "@/integrations/mock-provider";
const statusLabel: Record<string, string> = {
  running: "Em andamento",
  success: "Concluída",
  partial: "Parcial",
  failed: "Falhou",
};
export function MetaPanel({
  snapshot,
  workspaceId,
  isAdmin,
  details = false,
  businessSnapshot,
}: {
  snapshot: MetaSnapshot;
  businessSnapshot?: CrmSnapshot;
  workspaceId: string;
  isAdmin: boolean;
  details?: boolean;
}) {
  const router = useRouter(),
    search = useSearchParams();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(
    snapshot.accounts.filter((a) => a.selected).map((a) => a.id),
  );
  const c = snapshot.connection;
  const stamp = (n: number | null | undefined) =>
    n ? new Date(n).toLocaleString("pt-BR") : "Ainda não sincronizado";
  async function act(action: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{
        url?: string;
        run?: { status: string };
      }>(`/api/workspaces/${workspaceId}/meta`, "POST", {
        action,
        accountIds: selected,
      });
      if (result.url) {
        const url = new URL(result.url);
        if (url.origin !== "https://www.facebook.com")
          throw new Error("Destino OAuth inválido.");
        window.location.assign(url.toString());
        return;
      }
      setNotice(
        result.run
          ? `Sincronização: ${statusLabel[result.run.status] || result.run.status}. Consulte o histórico.`
          : action === "disconnect"
            ? "Credencial local removida. Histórico Meta preservado."
            : "Seleção salva.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title={details ? "Detalhes da integração Meta" : "Integrações"}
        description="Conecte fontes autorizadas e acompanhe a saúde dos dados."
      />
      {search.get("meta") === "oauth_failed" && (
        <p className="error-message" role="alert">
          Não foi possível concluir o OAuth. Confira a configuração, sua sessão
          e as permissões no Meta Developers; depois reconecte.
        </p>
      )}
      {!snapshot.configured && (
        <p className="info-note">{snapshot.configurationMessage}</p>
      )}
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
      <Panel className="integration-card">
        <div className="integration-heading">
          <span className="integration-logo meta">∞</span>
          <Badge tone={c?.connected ? "good" : "neutral"}>
            {!snapshot.configured
              ? "Aguardando configuração"
              : c?.connected
                ? "Autorizado pela Meta"
                : "Não conectado"}
          </Badge>
        </div>
        <h2>Meta Ads</h2>
        <p>
          Conexão oficial para importar contas, campanhas, conjuntos, anúncios,
          criativos e resultados. Somente leitura.
        </p>
        {c && (
          <dl className="integration-facts">
            <div>
              <dt>Usuário autorizado</dt>
              <dd>{c.userName || "Não informado"}</dd>
            </div>
            <div>
              <dt>Business</dt>
              <dd>
                {[
                  ...new Set(
                    snapshot.accounts
                      .filter((a) => a.selected)
                      .map((a) => a.business?.name)
                      .filter(Boolean),
                  ),
                ].join(", ") ||
                  "Não disponibilizado / nenhuma conta selecionada"}
              </dd>
            </div>
            <div>
              <dt>Contas conectadas</dt>
              <dd>{snapshot.accounts.filter((a) => a.selected).length}</dd>
            </div>
            <div>
              <dt>Última sincronização</dt>
              <dd>{stamp(c.lastSyncAt)}</dd>
            </div>
            <div>
              <dt>Saúde</dt>
              <dd>{c.health}</dd>
            </div>
            <div>
              <dt>Validade da autorização</dt>
              <dd>{stamp(c.expiresAt)}</dd>
            </div>
          </dl>
        )}
        <div className="integration-actions">
          {isAdmin && (
            <>
              <button
                className="button primary"
                disabled={busy || !snapshot.configured}
                onClick={() => act("connect")}
              >
                {c ? "Reconectar" : "Conectar Meta"}
              </button>
              {c?.connected && (
                <>
                  <button
                    className="button"
                    disabled={busy || !snapshot.configured}
                    onClick={() => act("sync")}
                  >
                    {busy ? "Processando…" : "Sincronizar agora"}
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => act("disconnect")}
                  >
                    Desconectar
                  </button>
                </>
              )}
            </>
          )}
          <Link className="text-link" href="/integracoes/meta/contas">
            {isAdmin
              ? "Gerenciar contas e histórico"
              : "Ver contas autorizadas"}
          </Link>
        </div>
      </Panel>
      {!details && businessSnapshot && (
        <CrmCard
          key={workspaceId}
          initial={businessSnapshot}
          workspaceId={workspaceId}
          isAdmin={isAdmin}
        />
      )}
      {details && (
        <>
          <Panel
            title={
              isAdmin
                ? "Selecione as contas que deseja conectar ao Traffic AI"
                : "Contas autorizadas"
            }
            description="A seleção pertence exclusivamente a este workspace."
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Selecionada</th>
                    <th>Conta</th>
                    <th>ID</th>
                    <th>Status Meta</th>
                    <th>Business</th>
                    <th>Moeda</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.accounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <input
                          aria-label={`Selecionar ${a.name}`}
                          type="checkbox"
                          checked={selected.includes(a.id)}
                          disabled={!isAdmin || busy || !c?.connected}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, a.id]
                                : selected.filter((id) => id !== a.id),
                            )
                          }
                        />
                      </td>
                      <td>{a.name}</td>
                      <td>{a.id}</td>
                      <td>
                        {a.status === 1
                          ? "Ativa"
                          : a.status === 2
                            ? "Desativada"
                            : a.status === null
                              ? "Não informado"
                              : `Código ${a.status}`}
                      </td>
                      <td>{a.business?.name || "Não disponível"}</td>
                      <td>{a.currency || "Não disponível"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!snapshot.accounts.length && (
              <p className="info-note">
                {c?.connected
                  ? "Nenhuma conta disponibilizada pela Meta. Confira suas permissões e o acesso aos ativos."
                  : "Autorize a Meta para descobrir as contas disponíveis."}
              </p>
            )}
            {isAdmin && c?.connected && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => act("select")}
              >
                Salvar seleção
              </button>
            )}
          </Panel>
          <Panel title="Recursos disponibilizados">
            <p>
              Businesses, páginas, Instagram profissional e pixels dependem de
              permissões e ativos autorizados. A descoberta adicional ocorre
              durante a sincronização.
            </p>
            {snapshot.resources
              .filter((r) =>
                ["businesses", "pages", "instagram", "pixels"].includes(r.kind),
              )
              .map((r) => (
                <p key={`${r.kind}:${r.accountId}:${r.id}`}>
                  {r.kind} · {String(r.payload.name || r.id)}
                  {r.kind === "instagram"
                    ? ` · ${JSON.stringify(r.payload.instagram_business_account || "Não vinculado")}`
                    : ""}
                </p>
              ))}
          </Panel>
          {isAdmin && (
            <Panel title="Histórico de sincronização">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Início</th>
                      <th>Término</th>
                      <th>Duração</th>
                      <th>Status</th>
                      <th>Registros</th>
                      <th>Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.runs.map((r) => (
                      <tr key={r.id}>
                        <td>{stamp(r.startedAt)}</td>
                        <td>{stamp(r.finishedAt)}</td>
                        <td>
                          {r.finishedAt
                            ? `${Math.round((r.finishedAt - r.startedAt) / 1000)}s`
                            : "Em andamento"}
                        </td>
                        <td>{statusLabel[r.status]}</td>
                        <td>{r.imported}</td>
                        <td>{r.errors.join("; ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!snapshot.runs.length && <p>Nenhuma sincronização executada.</p>}
              <h3>Eventos da integração</h3>
              {snapshot.events.map((e, i) => (
                <p key={i}>
                  {stamp(e.at)} · {e.event}
                </p>
              ))}
            </Panel>
          )}
        </>
      )}
      {!details && (
        <div className="integration-grid">
          {integrationCatalog
            .filter((i) => i.provider !== "meta" && i.provider !== "crm")
            .map((i) => (
              <Panel key={i.provider} className="integration-card">
                <h2>{i.name}</h2>
                <p>{i.description}</p>
                <Badge tone="neutral">Em breve</Badge>
              </Panel>
            ))}
        </div>
      )}
    </>
  );
}
