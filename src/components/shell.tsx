"use client";
import { useState, type ReactNode } from "react";
import Link from "@/components/workspace-link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  Sparkles,
  CheckCheck,
  Images,
  Target,
  Users,
  Building2,
  Plug,
  BookOpen,
  CalendarDays,
  Menu,
  X,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { useDemo } from "./providers";
import { roleLabel, type PublicUser } from "@/auth/types";
import { WorkspaceSelector } from "./workspace-selector";
import { LogoutButton } from "@/features/auth/logout-button";
const navigation = [
  ["/", "Visão geral", LayoutDashboard],
  ["/campanhas", "Campanhas", Megaphone],
  ["/traffic-ai", "Traffic AI", Sparkles],
  ["/recomendacoes", "Recomendações", CheckCheck],
  ["/criativos", "Criativos", Images],
  ["/creative-intelligence", "Creative Intelligence", Sparkles],
  ["/reels", "Laboratório de Reels", Images],
  ["/aprovacoes", "Aprovações", CheckCheck],
  ["/intelligence-settings", "Config. de Inteligência", Target],
  ["/metas", "Metas", Target],
  ["/leads", "Leads / CRM", Users],
  ["/funil", "Funil de Receita", Target],
  ["/diario", "Diário da IA", BookOpen],
  ["/usuarios", "Usuários", Users],
  ["/workspaces", "Workspaces", Building2],
  ["/integracoes", "Integrações", Plug],
] as const;
export function Shell({
  children,
  user,
}: {
  children: ReactNode;
  user: PublicUser;
}) {
  const pathname = usePathname();
  const { days, setDays, workspace, source, lastSyncAt } = useDemo();
  const [open, setOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Pular para o conteúdo
      </a>
      {open && (
        <button
          className="sidebar-overlay"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Zap size={22} fill="currentColor" />
          </span>
          traffic<span className="brand-ai">AI</span>
        </Link>
        <button
          className="mobile-close icon-button"
          onClick={() => setOpen(false)}
          aria-label="Fechar menu"
        >
          <X />
        </button>
        <WorkspaceSelector />
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Navegação principal">
          {navigation
            .filter(
              ([href]) =>
                ![
                  "/usuarios",
                  "/workspaces",
                  "/intelligence-settings",
                ].includes(href) || user.role === "admin",
            )
            .map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`nav-link ${pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)) ? "active" : ""}`}
                aria-current={pathname === href ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{label}</span>
                {href === "/traffic-ai" && <span className="ai-label">IA</span>}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <Sparkles size={20} />
            <strong>Inteligência em cada decisão.</strong>
            <p>Explore o potencial dos seus dados com o Traffic AI.</p>
            <Link href="/traffic-ai">
              Explorar inteligência <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="profile">
            <span className="profile-avatar">{initials}</span>
            <div>
              <strong>{user.name}</strong>
              <span>{roleLabel(user.role)}</span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menu"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {navigation.find(([href]) => href === pathname)?.[1] ??
                (pathname.startsWith("/workspaces/")
                  ? "Detalhes do workspace"
                  : pathname.startsWith("/integracoes/")
                    ? "Contas conectadas"
                    : pathname.startsWith("/campanhas/")
                      ? "Detalhes da campanha"
                      : "Acesso restrito")}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="demo-label">
              <span />
              {source === "meta-crm"
                ? "Dados Meta + CRM"
                : source === "crm"
                  ? "Dados CRM"
                  : source === "meta"
                    ? "Dados Meta"
                    : "Dados simulados"}
            </span>
            <span className="header-divider" />
            <span className="account-avatar" title={user.name}>
              {initials}
            </span>
          </div>
        </header>
        <main id="main">
          <div className="context-row">
            <span>
              <span className="meta-symbol">∞</span>{" "}
              {source === "meta-crm"
                ? "Meta + CRM ·"
                : source === "crm"
                  ? "CRM ·"
                  : source === "meta"
                    ? "Dados Meta ·"
                    : "Conta demo ·"}{" "}
              {workspace?.name || "Sem workspace"}
            </span>
            <label className="period-select">
              <CalendarDays size={16} />
              <select
                aria-label="Período dos indicadores"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={14}>Últimos 14 dias</option>
                <option value={30}>Últimos 30 dias</option>
              </select>
            </label>
          </div>
          {children}
          <footer className="page-footer">
            <span>
              Traffic AI <span className="footer-dot">·</span> Clareza para
              decidir. Inteligência para crescer.
            </span>
            <span>
              {source !== "demo"
                ? `Última sincronização: ${lastSyncAt ? new Date(lastSyncAt).toLocaleString("pt-BR") : "Ainda não realizada"}`
                : "Ambiente de demonstração · 12 set 2026"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
