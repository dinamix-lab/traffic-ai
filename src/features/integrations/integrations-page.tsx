"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/workspace-link";
import { Plug, RefreshCw, Unplug, Settings2, ArrowUpRight } from "lucide-react";
import { PageTitle, Panel, Badge } from "@/components/ui";
import { Modal } from "@/components/modal";
import { integrationCatalog } from "@/integrations/mock-provider";
import type { WorkspaceService } from "@/workspaces/service";
import { apiRequest } from "../auth/client";
export function IntegrationsPage({
  snapshot,
  isAdmin,
}: {
  snapshot: ReturnType<WorkspaceService["integrations"]>;
  isAdmin: boolean;
}) {
  const { workspace, integrations, accounts } = snapshot;
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const meta = integrations.find((i) => i.provider === "meta")!;
  async function act(action: string) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/workspaces/${workspace.id}/integrations`, "POST", {
        action,
      });
      setNotice(
        action === "connect"
          ? "Conexão simulada criada. Nenhum acesso à Meta foi realizado."
          : action === "sync"
            ? "Sincronização simulada concluída."
            : "Conexão simulada desativada. As contas foram preservadas com sincronização desligada.",
      );
      setModal(false);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir a simulação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Integrações"
        description={`Conexões e fontes de dados de ${workspace.name}.`}
      >
        <Badge tone="purple">Ambiente simulado</Badge>
      </PageTitle>
      <div className="info-note">
        <Plug size={18} />
        <span>
          {isAdmin
            ? "Configure e teste os estados de conexão. Nenhuma API externa será chamada."
            : "Você pode consultar as integrações. Conexões e permissões são gerenciadas pelo administrador."}
        </span>
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
      <div className="integration-grid">
        {integrationCatalog.map((item) => {
          const connected = item.provider === "meta" && meta.connected;
          return (
            <Panel key={item.provider} className="integration-card">
              <div className="integration-heading">
                <span className={`integration-logo ${item.provider}`}>
                  {item.provider === "meta" ? "∞" : <Plug size={24} />}
                </span>
                <Badge tone={connected ? "good" : "neutral"}>
                  {connected ? "Conectado · simulado" : "Não conectado"}
                </Badge>
              </div>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
              {connected && (
                <dl className="integration-facts">
                  <div>
                    <dt>Usuário conectado</dt>
                    <dd>{meta.connectedBy}</dd>
                  </div>
                  <div>
                    <dt>Business Manager</dt>
                    <dd>{meta.businessManager}</dd>
                  </div>
                  <div>
                    <dt>Última sincronização</dt>
                    <dd>
                      {meta.lastSyncAt
                        ? new Date(meta.lastSyncAt).toLocaleString("pt-BR", {
                            timeZone: workspace.timezone,
                          })
                        : "Ainda não sincronizado"}
                    </dd>
                  </div>
                  <div>
                    <dt>Contas disponíveis</dt>
                    <dd>{accounts.length}</dd>
                  </div>
                </dl>
              )}
              {item.available ? (
                <div className="integration-actions">
                  {connected ? (
                    <>
                      {isAdmin && (
                        <>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => setModal(true)}
                          >
                            <Settings2 size={15} />
                            Gerenciar conexão
                          </button>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => act("sync")}
                          >
                            <RefreshCw size={15} />
                            {busy ? "Processando..." : "Sincronizar agora"}
                          </button>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => act("disconnect")}
                          >
                            <Unplug size={15} />
                            Desconectar
                          </button>
                        </>
                      )}
                      <Link
                        className="text-link"
                        href="/integracoes/meta/contas"
                      >
                        Contas conectadas
                        <ArrowUpRight size={15} />
                      </Link>
                    </>
                  ) : isAdmin ? (
                    <button
                      className="button primary"
                      disabled={!workspace.active}
                      onClick={() => setModal(true)}
                    >
                      Conectar Meta
                    </button>
                  ) : (
                    <span className="muted small">
                      Aguardando conexão do administrador
                    </span>
                  )}
                </div>
              ) : (
                <span className="badge purple">Em breve</span>
              )}
            </Panel>
          );
        })}
      </div>
      {modal && (
        <Modal
          title={
            meta.connected ? "Gerenciar conexão Meta Ads" : "Conectar Meta Ads"
          }
          onClose={() => setModal(false)}
          busy={busy}
        >
          <p className="integration-modal-copy">
            Conexão com Meta Ads será habilitada na próxima etapa. Você pode
            simular uma conexão para validar o fluxo e gerenciar contas
            fictícias.
          </p>
          <div className="info-note">
            Nenhuma credencial, token ou autorização será solicitada.
          </div>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <div className="user-dialog-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setModal(false)}
            >
              Fechar
            </button>
            {!meta.connected && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => act("connect")}
              >
                {busy ? "Simulando..." : "Simular conexão"}
              </button>
            )}
            {meta.connected && (
              <Link className="button primary" href="/integracoes/meta/contas">
                Gerenciar contas
              </Link>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
