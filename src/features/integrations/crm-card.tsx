"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Badge } from "@/components/ui";
import { apiRequest } from "../auth/client";
import type { CrmSnapshot } from "@/crm/types";
const status = {
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro",
  syncing: "Sincronizando",
};
export function CrmCard({
  initial,
  workspaceId,
  isAdmin,
}: {
  initial: CrmSnapshot;
  workspaceId: string;
  isAdmin: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const router = useRouter();
  const s = snapshot.state;
  const date = (n: number | null) =>
    n ? new Date(n).toLocaleString("pt-BR") : "Ainda não realizado";
  useEffect(() => {
    if (!busy && s.status !== "syncing") return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void fetch(`/api/workspaces/${workspaceId}/crm`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setSnapshot(data);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [busy, s.status, workspaceId]);
  async function action(action: "health" | "sync") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{
        busy: boolean;
        run?: { status: string; events: number };
      }>(`/api/workspaces/${workspaceId}/crm`, "POST", { action });
      setNotice(
        result.busy
          ? "Já existe uma execução em andamento."
          : result.run?.status === "success"
            ? action === "health"
              ? "Conexão verificada."
              : `${result.run.events} eventos processados.`
            : "Execução interrompida. Consulte o erro sanitizado e o histórico.",
      );
      setSnapshot(
        await apiRequest<CrmSnapshot>(
          `/api/workspaces/${workspaceId}/crm`,
          "GET",
        ),
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível concluir a ação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel className="integration-card">
      <div className="integration-heading">
        <span className="integration-logo crm">DV</span>
        <Badge
          tone={
            s.status === "connected"
              ? "good"
              : s.status === "error"
                ? "bad"
                : "neutral"
          }
        >
          {busy ? "Sincronizando / verificando…" : status[s.status]}
        </Badge>
      </div>
      <h2>Dinamix Vendas / CRM</h2>
      <p>
        Fonte oficial dos eventos comerciais. Integração exclusivamente de
        leitura.
      </p>
      {!snapshot.bound ? (
        <p className="info-note">
          A credencial está vinculada a outro workspace. A configuração é feita
          no servidor.
        </p>
      ) : !snapshot.configured ? (
        <p className="info-note">
          Aguardando DINAMIX_TRAFFIC_AI_API_KEY no ambiente privado do servidor.
        </p>
      ) : null}
      <dl className="integration-facts">
        <div>
          <dt>Último health</dt>
          <dd>{date(s.lastHealthAt)}</dd>
        </div>
        <div>
          <dt>Última tentativa</dt>
          <dd>{date(s.lastAttemptAt)}</dd>
        </div>
        <div>
          <dt>Última sincronização com sucesso</dt>
          <dd>{date(s.lastSuccessAt)}</dd>
        </div>
        <div>
          <dt>Versão da API</dt>
          <dd>{s.apiVersion || "Não verificada"}</dd>
        </div>
        <div>
          <dt>Cursor</dt>
          <dd>
            {s.hasCursor
              ? "Checkpoint persistido"
              : "Primeira leitura por data inicial"}
          </dd>
        </div>
        <div>
          <dt>Eventos importados / última sync</dt>
          <dd>
            {s.totalEvents} / {s.lastEvents}
          </dd>
        </div>
      </dl>
      {s.lastError && <p className="error-message">{s.lastError}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
      {isAdmin && (
        <div className="integration-actions">
          <button
            className="button"
            disabled={busy || !snapshot.bound || !snapshot.configured}
            onClick={() => action("health")}
          >
            Verificar conexão
          </button>
          <button
            className="button primary"
            disabled={busy || !snapshot.bound || !snapshot.configured}
            onClick={() => action("sync")}
          >
            Sincronizar agora
          </button>
        </div>
      )}
      {isAdmin && (
        <details>
          <summary>Histórico de sincronização e verificações</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Duração</th>
                  <th>Eventos</th>
                  <th>Páginas</th>
                  <th>Status</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.runs.map((r) => (
                  <tr key={r.id}>
                    <td>{date(r.startedAt)}</td>
                    <td>{date(r.finishedAt)}</td>
                    <td>
                      {r.finishedAt
                        ? `${Math.round((r.finishedAt - r.startedAt) / 1000)}s`
                        : "Em andamento"}
                    </td>
                    <td>{r.events}</td>
                    <td>{r.pages}</td>
                    <td>
                      {r.status === "success"
                        ? "Concluído"
                        : r.status === "error"
                          ? "Erro"
                          : "Em andamento"}
                    </td>
                    <td>{r.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </Panel>
  );
}
