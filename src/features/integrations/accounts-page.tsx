"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/workspace-link";
import { PageTitle, Panel, Badge, Empty } from "@/components/ui";
import { Modal } from "@/components/modal";
import type { AdAccount, Workspace, WorkspaceMember } from "@/workspaces/types";
import { apiRequest } from "../auth/client";
export function AccountsPage({
  workspace,
  accounts,
  isAdmin,
  targets,
}: {
  workspace: Workspace;
  accounts: AdAccount[];
  isAdmin: boolean;
  targets: { workspace: Workspace; members: WorkspaceMember[] }[];
}) {
  const [edit, setEdit] = useState<AdAccount | null>(null);
  const router = useRouter();
  return (
    <>
      <Link className="back-link" href="/integracoes">
        ← Integrações
      </Link>
      <PageTitle
        title="Contas conectadas"
        description={`Contas Meta Ads vinculadas a ${workspace.name}.`}
      >
        <Badge tone="purple">Dados simulados</Badge>
      </PageTitle>
      <Panel
        title="Contas de anúncios"
        description="O acesso atual é por workspace. Atribuições por conta preparam uma restrição futura."
      >
        {!accounts.length ? (
          <Empty
            title="Nenhuma conta vinculada"
            description="Simule a conexão com Meta Ads em Integrações para disponibilizar as contas."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Conta",
                    "Status",
                    "Sincronização",
                    "Workspace",
                    "Gestores atribuídos",
                    "Última sincronização",
                    ...(isAdmin ? ["Ações"] : []),
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name}</strong>
                      <small className="account-external">{a.externalId}</small>
                    </td>
                    <td>
                      <Badge tone={a.active ? "good" : "neutral"}>
                        {a.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={a.syncEnabled ? "good" : "neutral"}>
                        {a.syncEnabled ? "Ativada" : "Desativada"}
                      </Badge>
                    </td>
                    <td>{workspace.name}</td>
                    <td>
                      {a.managerIds.length
                        ? `${a.managerIds.length} gestor(es)`
                        : "Nenhum gestor"}
                    </td>
                    <td>
                      {a.lastSyncAt
                        ? new Date(a.lastSyncAt).toLocaleString("pt-BR", {
                            timeZone: workspace.timezone,
                          })
                        : "Não sincronizada"}
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="button" onClick={() => setEdit(a)}>
                          Gerenciar conta
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {edit && (
        <AccountForm
          account={edit}
          targets={targets}
          onClose={() => setEdit(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
function AccountForm({
  account,
  targets,
  onClose,
  onSaved,
}: {
  account: AdAccount;
  targets: { workspace: Workspace; members: WorkspaceMember[] }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState(account.workspaceId);
  const [managers, setManagers] = useState(account.managerIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const members = targets.find((t) => t.workspace.id === target)?.members || [];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await apiRequest(
        `/api/workspaces/${account.workspaceId}/accounts/${account.id}`,
        "PATCH",
        {
          workspaceId: target,
          syncEnabled: f.get("sync") === "on",
          managerIds: managers,
        },
      );
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Gerenciar ${account.name}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label className="auth-field">
            Workspace
            <select
              className="select"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setManagers([]);
              }}
            >
              {targets.map((t) => (
                <option key={t.workspace.id} value={t.workspace.id}>
                  {t.workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label className="workspace-check">
            <input
              name="sync"
              type="checkbox"
              defaultChecked={account.syncEnabled}
              disabled={!account.active}
            />
            Ativar sincronização simulada
          </label>
          <h3 className="workspace-team-title">Gestores atribuídos</h3>
          <div className="workspace-members">
            {members
              .filter((m) => m.active)
              .map((m) => (
                <label key={m.userId}>
                  <input
                    type="checkbox"
                    checked={managers.includes(m.userId)}
                    onChange={(e) =>
                      setManagers(
                        e.target.checked
                          ? [...managers, m.userId]
                          : managers.filter((id) => id !== m.userId),
                      )
                    }
                  />
                  {m.name}
                </label>
              ))}
            {!members.some((m) => m.active) && (
              <p>Vincule gestores ativos à equipe deste workspace primeiro.</p>
            )}
          </div>
          <p className="user-form-note">
            O destino precisa ter conexão Meta simulada. Mover a conta transfere
            seu vínculo; as campanhas de demonstração existentes não são
            importadas nem movidas.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="user-dialog-actions">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando..." : "Salvar conta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
