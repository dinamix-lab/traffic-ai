"use client";
import Link from "@/components/workspace-link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpRight as External,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
import { change, decimal } from "@/domain/metrics";
export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Panel({
  title,
  description,
  children,
  action,
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "good" | "warn" | "bad" | "purple" | "neutral";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Score({ value }: { value: number }) {
  return (
    <span
      className={`score ${value >= 80 ? "good" : value >= 65 ? "warn" : "bad"}`}
    >
      <span className="score-track">
        <span style={{ width: `${value}%` }} />
      </span>
      {value}
    </span>
  );
}
export function Delta({
  current,
  previous,
  inverse = false,
}: {
  current: number;
  previous: number;
  inverse?: boolean;
}) {
  const diff = change(current, previous);
  if (diff === null)
    return <span className="muted small">Sem base anterior</span>;
  const positive = diff >= 0;
  const good = inverse ? !positive : positive;
  return (
    <span className={`delta ${good ? "positive" : "negative"}`}>
      {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {decimal(Math.abs(diff))}% <span>vs. anterior</span>
    </span>
  );
}
export function Empty({
  title = "Nenhum resultado encontrado",
  description = "Tente outro termo ou altere os filtros.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <SearchX size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" href={href}>
      {children}
      <External size={15} />
    </Link>
  );
}
