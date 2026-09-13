"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Pencil,
  KeyRound,
  UserCheck,
  UserX,
  ShieldCheck,
} from "lucide-react";
import { roleLabel, type PublicUser } from "@/auth/types";
import { PageTitle, Panel, Badge, Empty } from "@/components/ui";
import { apiRequest } from "../auth/client";
import { UserDialog, type UserDialogState } from "./user-dialog";
const formatDate = (value: number | null) =>
  value === null
    ? "Ainda não acessou"
    : new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      });
export function UsersPage({
  initialUsers,
  currentUserId,
}: {
  initialUsers: PublicUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [dialog, setDialog] = useState<UserDialogState | null>(null);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const visible = users.filter(
    (user) =>
      `${user.name} ${user.email}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "all" || user.active === (status === "active")),
  );
  async function refresh(message: string) {
    const result = await apiRequest<{ users: PublicUser[] }>(
      "/api/users",
      "GET",
    );
    setUsers(result.users);
    setNotice(message);
    setError("");
    router.refresh();
  }
  async function toggle(user: PublicUser) {
    if (busyId) return;
    setBusyId(user.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/users/${user.id}`, "PATCH", {
        name: user.name,
        email: user.email,
        role: user.role,
        active: !user.active,
      });
      await refresh(
        user.active
          ? "Usuário desativado e sessões encerradas."
          : "Usuário ativado.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o status.",
      );
    } finally {
      setBusyId("");
    }
  }
  return (
    <>
      <PageTitle
        title="Usuários"
        description="Gerencie quem tem acesso ao seu workspace."
      >
        <button
          className="button primary"
          onClick={() => {
            setNotice("");
            setDialog({ mode: "create" });
          }}
        >
          <Plus size={17} />
          Novo usuário
        </button>
      </PageTitle>
      <div className="summary-cards">
        <div>
          <span>Usuários ativos</span>
          <strong>{users.filter((u) => u.active).length}</strong>
        </div>
        <div>
          <span>Administradores</span>
          <strong>{users.filter((u) => u.role === "admin").length}</strong>
        </div>
        <div>
          <span>Gestores de tráfego</span>
          <strong>{users.filter((u) => u.role === "manager").length}</strong>
        </div>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      <Panel
        title="Equipe e permissões"
        description="Somente administradores podem gerenciar acessos."
        action={
          <Badge tone="purple">
            <ShieldCheck size={13} />
            Administração
          </Badge>
        }
      >
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Buscar usuário"
              placeholder="Buscar nome ou e-mail..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            className="select"
            aria-label="Filtrar status dos usuários"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          <span className="muted small">{visible.length} usuários</span>
        </div>
        {visible.length ? (
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  {[
                    "Nome",
                    "E-mail",
                    "Perfil",
                    "Status",
                    "Criado em",
                    "Último acesso",
                    "Ações",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      {user.id === currentUserId && (
                        <span className="user-self">Você</span>
                      )}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <Badge
                        tone={user.role === "admin" ? "purple" : "neutral"}
                      >
                        {roleLabel(user.role)}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={user.active ? "good" : "neutral"}>
                        {user.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>
                      <div className="user-row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Editar ${user.name}`}
                          title="Editar usuário"
                          disabled={!!busyId}
                          onClick={() => setDialog({ mode: "edit", user })}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Redefinir senha de ${user.name}`}
                          title="Redefinir senha"
                          disabled={!!busyId}
                          onClick={() => setDialog({ mode: "password", user })}
                        >
                          <KeyRound size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${user.active ? "Desativar" : "Ativar"} ${user.name}`}
                          title={
                            user.active ? "Desativar usuário" : "Ativar usuário"
                          }
                          disabled={!!busyId}
                          onClick={() => toggle(user)}
                        >
                          {user.active ? (
                            <UserX size={17} />
                          ) : (
                            <UserCheck size={17} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
      <p className="footnote">
        Datas no horário de Brasília. A plataforma sempre mantém pelo menos um
        administrador ativo.
      </p>
      {dialog && (
        <UserDialog
          state={dialog}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
