"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/workspace-link";
import { PageTitle, Panel, Badge } from "@/components/ui";
import type { WorkspaceService } from "@/workspaces/service";
import { WorkspaceForm } from "./workspace-form";
import { apiRequest } from "../auth/client";
export function WorkspaceDetail({
  detail,
}: {
  detail: ReturnType<WorkspaceService["detail"]>;
}) {
  const {
    workspace: w,
    members,
    eligibleManagers,
    integrations,
    accounts,
  } = detail;
  const [selected, setSelected] = useState(members.map((m) => m.userId));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(false);
  const router = useRouter();
  return (
    <>
      <Link className="back-link" href="/workspaces">
        ← Todos os workspaces
      </Link>
      <PageTitle
        title={w.name}
        description={w.description || "Configurações e equipe desta operação."}
      >
        <Badge tone={w.active ? "good" : "neutral"}>
          {w.active ? "Ativo" : "Inativo"}
        </Badge>
        <button className="button" onClick={() => setEdit(true)}>
          Editar workspace
        </button>
      </PageTitle>
      <Panel title="Detalhes do workspace">
        <dl className="workspace-facts">
          <div>
            <dt>Slug</dt>
            <dd>{w.slug}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>{w.timezone}</dd>
          </div>
          <div>
            <dt>Moeda</dt>
            <dd>{w.currency}</dd>
          </div>
          <div>
            <dt>Criado em</dt>
            <dd>
              {new Date(w.createdAt).toLocaleString("pt-BR", {
                timeZone: w.timezone,
              })}
            </dd>
          </div>
          <div>
            <dt>Integrações conectadas</dt>
            <dd>{integrations.filter((i) => i.connected).length}</dd>
          </div>
          <div>
            <dt>Contas vinculadas</dt>
            <dd>{accounts.length}</dd>
          </div>
        </dl>
      </Panel>
      <Panel
        title="Equipe"
        description="Administradores têm acesso global. Selecione os gestores desta operação."
        className="workspace-team"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await apiRequest(`/api/workspaces/${w.id}/members`, "PUT", {
                userIds: selected,
              });
              setNotice("Equipe atualizada. As permissões já estão em vigor.");
              router.refresh();
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Não foi possível salvar a equipe.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="workspace-members">
            {!eligibleManagers.length ? (
              <p>
                Crie um gestor na área{" "}
                <Link className="text-link" href="/usuarios">
                  Usuários
                </Link>{" "}
                para vinculá-lo aqui.
              </p>
            ) : (
              eligibleManagers.map((m) => (
                <label key={m.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, m.id]
                          : selected.filter((id) => id !== m.id),
                      )
                    }
                  />
                  <span>{m.name}</span>
                  {!m.active && <Badge>Inativo</Badge>}
                </label>
              ))
            )}
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
          <div className="form-footer">
            <p className="small">
              Remover um gestor bloqueia o acesso e remove as atribuições de
              contas deste workspace.
            </p>
            <button
              className="button primary"
              disabled={busy || !eligibleManagers.length}
            >
              {busy ? "Salvando..." : "Salvar equipe"}
            </button>
          </div>
        </form>
      </Panel>
      <div className="workspace-detail-links">
        <Link className="button" href={`/integracoes?workspace=${w.id}`}>
          Ver integrações
        </Link>
        <Link
          className="button"
          href={`/integracoes/meta/contas?workspace=${w.id}`}
        >
          Contas de anúncios
        </Link>
        <Link className="button" href={`/metas?workspace=${w.id}`}>
          Metas do workspace
        </Link>
      </div>
      {edit && (
        <WorkspaceForm
          workspace={w}
          onClose={() => setEdit(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
