"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, Save, LoaderCircle } from "lucide-react";
import type { PublicUser } from "@/auth/types";
import { apiRequest } from "../auth/client";
export type UserDialogState =
  { mode: "create" } | { mode: "edit" | "password"; user: PublicUser };
export function UserDialog({
  state,
  onClose,
  onSaved,
}: {
  state: UserDialogState;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const user = state.mode === "create" ? undefined : state.user;
  const passwordOnly = state.mode === "password";
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (passwordOnly)
        await apiRequest(`/api/users/${user!.id}/password`, "POST", {
          password: form.get("password"),
        });
      else
        await apiRequest(
          user ? `/api/users/${user.id}` : "/api/users",
          user ? "PATCH" : "POST",
          {
            name: form.get("name"),
            email: form.get("email"),
            role: form.get("role"),
            active: form.get("active") === "active",
            ...(user ? {} : { password: form.get("password") }),
          },
        );
      await onSaved(
        passwordOnly
          ? "Senha redefinida. Todas as sessões desse usuário foram encerradas."
          : user
            ? "Usuário atualizado."
            : "Usuário criado. Compartilhe a senha inicial por um canal seguro.",
      );
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="user-dialog"
      aria-labelledby="user-dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="user-dialog-heading">
        <div>
          <h2 id="user-dialog-title">
            {passwordOnly
              ? "Redefinir senha"
              : user
                ? "Editar usuário"
                : "Novo usuário"}
          </h2>
          <p>
            {passwordOnly ? user?.email : "Configure o acesso à plataforma."}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Fechar formulário"
        >
          <X size={19} />
        </button>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {!passwordOnly && (
            <>
              <label className="auth-field">
                Nome
                <input
                  className="user-input"
                  name="name"
                  defaultValue={user?.name}
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="off"
                />
              </label>
              <label className="auth-field">
                E-mail
                <input
                  className="user-input"
                  name="email"
                  type="email"
                  defaultValue={user?.email}
                  required
                  maxLength={254}
                  autoComplete="off"
                />
              </label>
              <div className="user-form-row">
                <label className="auth-field">
                  Perfil
                  <select
                    name="role"
                    className="select"
                    defaultValue={user?.role || "manager"}
                  >
                    <option value="manager">Gestor de tráfego</option>
                    <option value="admin">Administrador</option>
                  </select>
                </label>
                <label className="auth-field">
                  Status
                  <select
                    name="active"
                    className="select"
                    defaultValue={
                      user?.active === false ? "inactive" : "active"
                    }
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {(!user || passwordOnly) && (
            <label className="auth-field">
              {passwordOnly ? "Nova senha" : "Senha inicial"}
              <input
                className="user-input"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
              <small>
                Use de 12 a 128 caracteres. Prefira uma frase longa e exclusiva.
              </small>
            </label>
          )}
          {user && !passwordOnly && (
            <p className="user-form-note">
              Alterar e-mail, perfil ou status encerra as sessões desse usuário.
            </p>
          )}
          {passwordOnly && (
            <p className="user-form-note">
              A nova senha substitui a anterior e encerra todos os acessos
              atuais, inclusive o seu se estiver editando sua conta.
            </p>
          )}
        </fieldset>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="user-dialog-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="auth-spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            {busy
              ? "Salvando..."
              : passwordOnly
                ? "Redefinir senha"
                : "Salvar usuário"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
