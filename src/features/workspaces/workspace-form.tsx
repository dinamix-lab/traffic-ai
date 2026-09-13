"use client";
import { useState, type FormEvent } from "react";
import type { Workspace } from "@/workspaces/types";
import { Modal } from "@/components/modal";
import { apiRequest } from "../auth/client";
export function WorkspaceForm({
  workspace,
  onClose,
  onSaved,
}: {
  workspace?: Workspace;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(workspace?.slug || "");
  const [edited, setEdited] = useState(!!workspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await apiRequest(
        workspace ? `/api/workspaces/${workspace.id}` : "/api/workspaces",
        workspace ? "PATCH" : "POST",
        {
          name: f.get("name"),
          slug,
          timezone: f.get("timezone"),
          currency: f.get("currency"),
          description: f.get("description"),
          active: f.get("active") === "true",
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
    <Modal
      title={workspace ? "Editar workspace" : "Novo workspace"}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <label className="auth-field">
            Nome
            <input
              name="name"
              className="user-input"
              defaultValue={workspace?.name}
              required
              minLength={2}
              maxLength={100}
              onChange={(e) => {
                if (!edited)
                  setSlug(
                    e.target.value
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  );
              }}
            />
          </label>
          <label className="auth-field">
            Slug
            <input
              name="slug"
              className="user-input"
              value={slug}
              onChange={(e) => {
                setEdited(true);
                setSlug(e.target.value);
              }}
              required
              maxLength={80}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </label>
          <label className="auth-field">
            Timezone
            <input
              name="timezone"
              className="user-input"
              defaultValue={workspace?.timezone || "America/Sao_Paulo"}
              required
            />
          </label>
          <div className="user-form-row">
            <label className="auth-field">
              Moeda
              <select
                name="currency"
                className="select"
                defaultValue={workspace?.currency || "BRL"}
              >
                {["BRL", "USD", "EUR"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="auth-field">
              Status
              <select
                name="active"
                className="select"
                defaultValue={String(workspace?.active ?? true)}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
          </div>
          <label className="auth-field">
            Descrição (opcional)
            <textarea
              name="description"
              className="user-input"
              defaultValue={workspace?.description}
              maxLength={500}
              rows={3}
            />
          </label>
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
            {busy ? "Salvando..." : "Salvar workspace"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
