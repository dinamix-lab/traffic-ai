"use client";
import { useMoney } from "./providers";
import { useId, useState } from "react";
import { decimal, shortDate, type Metrics } from "@/domain/metrics";
export function EvolutionChart({
  points,
}: {
  points: (Metrics & { date: string })[];
}) {
  const money = useMoney();
  const [metric, setMetric] = useState<"leads" | "spend">("leads");
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replaceAll(":", "");
  const values = points.map((p) => p[metric]);
  const max = Math.max(...values, 1) * 1.2;
  const coordinates = values.map((v, i) => [
    54 + (i / Math.max(values.length - 1, 1)) * 720,
    206 - (v / max) * 160,
  ]);
  const path = coordinates
    .map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`)
    .join(" ");
  const selected = hover === null ? null : points[hover];
  return (
    <div className="chart-block">
      <div className="chart-toolbar">
        <div className="chart-legend">
          <span />
          {metric === "leads" ? "Leads gerados" : "Investimento diário"}
          <span className="muted">· {points.length} dias</span>
        </div>
        <div className="segmented" aria-label="Métrica do gráfico">
          {(["leads", "spend"] as const).map((m) => (
            <button
              key={m}
              aria-pressed={m === metric}
              className={m === metric ? "selected" : ""}
              onClick={() => {
                setMetric(m);
                setHover(null);
              }}
            >
              {m === "leads" ? "Leads" : "Investimento"}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox="0 0 800 245"
        role="img"
        aria-label={`Evolução diária de ${metric === "leads" ? "leads" : "investimento"}`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7664e5" stopOpacity=".22" />
            <stop offset="100%" stopColor="#7664e5" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={t}>
            <line
              x1="54"
              x2="774"
              y1={46 + t * 40}
              y2={46 + t * 40}
              stroke="#e9ebf2"
              strokeDasharray="4 5"
            />
            <text
              x="40"
              y={50 + t * 40}
              textAnchor="end"
              fill="#8590a3"
              fontSize="11"
            >
              {Math.round(max * (1 - t / 4))}
            </text>
          </g>
        ))}
        <path d={`${path} L774 206 L54 206 Z`} fill={`url(#${id})`} />
        <path
          d={path}
          fill="none"
          stroke="#7664e5"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        {points.map((point, i) => (
          <g key={point.date}>
            {(i === 0 ||
              i === points.length - 1 ||
              i % Math.ceil(points.length / 6) === 0) && (
              <text
                x={coordinates[i]![0]}
                y="233"
                fill="#8590a3"
                fontSize="11"
                textAnchor="middle"
              >
                {shortDate(point.date)}
              </text>
            )}
            <circle
              cx={coordinates[i]![0]}
              cy={coordinates[i]![1]}
              r={hover === i ? 5 : 3}
              fill="#7664e5"
              stroke="white"
              strokeWidth="2"
            />
            <rect
              x={coordinates[i]![0]! - 10}
              y="35"
              width="20"
              height="175"
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>
                {shortDate(point.date)}:{" "}
                {metric === "spend"
                  ? money(point.spend)
                  : point.leads + " leads"}
              </title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="chart-caption" aria-live="polite">
        {selected
          ? `${shortDate(selected.date)} · ${selected.leads} leads · ${money(selected.spend)} investidos · CPL ${money(selected.cpl)}`
          : "Passe o mouse sobre o gráfico para explorar os resultados diários."}
      </div>
      <details className="chart-data">
        <summary>Ver dados do gráfico em tabela</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Leads</th>
                <th>Investimento</th>
                <th>CPL</th>
                <th>CTR</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td>{shortDate(p.date)}</td>
                  <td>{p.leads}</td>
                  <td>{money(p.spend)}</td>
                  <td>{money(p.cpl)}</td>
                  <td>{decimal(p.ctr)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
