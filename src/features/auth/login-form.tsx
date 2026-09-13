"use client";
import { useState, type FormEvent } from "react";
import {
  Zap,
  Mail,
  LockKeyhole,
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { apiRequest } from "./client";
import { navigateAfterSessionChange } from "./navigation";
export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/auth/login", "POST", {
        email: form.get("email"),
        password: form.get("password"),
      });
      navigateAfterSessionChange("/");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível entrar. Tente novamente.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-brand-panel">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={22} fill="currentColor" />
          </span>
          traffic<span className="brand-ai">AI</span>
        </div>
        <div className="auth-brand-copy">
          <span className="eyebrow">INTELIGÊNCIA EM CADA DECISÃO</span>
          <h1>
            Clareza para decidir.
            <br />
            Inteligência para crescer.
          </h1>
          <p>Seu workspace de performance, campanhas e oportunidades.</p>
        </div>
        <span className="auth-brand-footer">
          Traffic AI · Gestão de performance
        </span>
      </aside>
      <main className="auth-main">
        <div className="auth-login">
          <span className="auth-lock">
            <LockKeyhole size={25} />
          </span>
          <h1>Bem-vindo de volta.</h1>
          <p>Entre com seu e-mail e senha para continuar.</p>
          <form onSubmit={submit}>
            <label className="auth-field">
              E-mail
              <div className="auth-input">
                <Mail size={17} />
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="voce@empresa.com.br"
                  required
                  maxLength={254}
                  disabled={busy}
                />
              </div>
            </label>
            <label className="auth-field">
              Senha
              <div className="auth-input">
                <LockKeyhole size={17} />
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  required
                  maxLength={128}
                  disabled={busy}
                />
              </div>
            </label>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="auth-spin" size={17} />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <p className="auth-recovery">
            Precisa recuperar o acesso? Solicite a redefinição de senha ao
            administrador.
          </p>
          <div className="auth-security">
            <ShieldCheck size={15} />
            Acesso restrito à sua equipe
          </div>
        </div>
      </main>
    </div>
  );
}
