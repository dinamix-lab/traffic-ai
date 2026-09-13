"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/workspace-link";
import { Plus, Pencil, ArrowUpRight, Power, Search } from "lucide-react";
import { PageTitle, Panel, Badge, Empty } from "@/components/ui";
import type { Workspace, WorkspaceSummary } from "@/workspaces/types";
import { WorkspaceForm } from "./workspace-form";
import { apiRequest } from "../auth/client";
export function WorkspaceList({ items }: { items: WorkspaceSummary[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Workspace | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const visible = items.filter((w) =>
    `${w.name} ${w.slug}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        title="Workspaces"
        description="Uma empresa, um espaço. Equipes e resultados separados."
      >
        <button className="button primary" onClick={() => setForm(null)}>
          <Plus size={16} />
          Novo workspace
        </button>
      </PageTitle>
      <div className="summary-cards">
        <div>
          <span>Workspaces</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <span>Ativos</span>
          <strong>{items.filter((w) => w.active).length}</strong>
        </div>
        <div>
          <span>Conexões Meta</span>
          <strong>{items.reduce((n, w) => n + w.integrationCount, 0)}</strong>
        </div>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <Panel
        title="Empresas e operações"
        description="Acesso global de administrador."
      >
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Buscar workspace"
              placeholder="Buscar nome ou slug..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {!visible.length ? (
          <Empty />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Workspace",
                    "Status",
                    "Gestores vinculados",
                    "Integrações conectadas",
                    "Criado em",
                    "Ações",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <Link
                        href={`/workspaces/${w.id}?workspace=${w.id}`}
                        className="campaign-name"
                      >
                        {w.name}
                        <ArrowUpRight size={14} />
                      </Link>
                      <small className="muted">{w.slug}</small>
                    </td>
                    <td>
                      <Badge tone={w.active ? "good" : "neutral"}>
                        {w.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td>
                      {w.managers.length
                        ? w.managers.map((m) => m.name).join(", ")
                        : "Nenhum gestor"}
                    </td>
                    <td>{w.integrationCount}</td>
                    <td>
                      {new Date(w.createdAt).toLocaleDateString("pt-BR", {
                        timeZone: w.timezone,
                      })}
                    </td>
                    <td>
                      <div className="user-row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Editar ${w.name}`}
                          onClick={() => setForm(w)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${w.active ? "Desativar" : "Ativar"} ${w.name}`}
                          disabled={!!busy}
                          onClick={async () => {
                            setBusy(w.id);
                            setError("");
                            try {
                              await apiRequest(
                                `/api/workspaces/${w.id}`,
                                "PATCH",
                                { ...w, active: !w.active },
                              );
                              router.refresh();
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Não foi possível alterar o status.",
                              );
                            } finally {
                              setBusy("");
                            }
                          }}
                        >
                          <Power size={16} />
                        </button>
                        <Link
                          className="icon-button"
                          href={`/workspaces/${w.id}?workspace=${w.id}`}
                          aria-label={`Detalhes de ${w.name}`}
                        >
                          <ArrowUpRight size={16} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {form !== undefined && (
        <WorkspaceForm
          workspace={form || undefined}
          onClose={() => setForm(undefined)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
