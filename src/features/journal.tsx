"use client";
import { useMoney } from "@/components/providers";
import { Sparkles, ArrowUpRight, CalendarDays } from "lucide-react";
import Link from "@/components/workspace-link";
import { useDemo } from "@/components/providers";
import { PageTitle, Badge } from "@/components/ui";
import { aggregate, dateOffset, shortDate, change } from "@/domain/metrics";
export function Journal() {
  const money = useMoney();
  const { data } = useDemo();
  return (
    <>
      <PageTitle
        title="Diário da IA"
        description="Seu briefing de performance. Uma leitura, o essencial do dia."
      >
        <Badge tone="purple">Briefings simulados</Badge>
      </PageTitle>
      <div className="journal-layout">
        <div className="journal-timeline">
          {data.journal.map(({date: day}, index) => {
            const offset = -index;
            const m = aggregate(data.daily.filter((r) => r.date === day));
            const previous = aggregate(
              data.daily.filter((r) => r.date === dateOffset(offset - 1)),
            );
            const diff = change(m.cpl, previous.cpl) ?? 0;
            return (
              <article className="journal-entry" key={day}>
                <div className="timeline-icon">
                  <Sparkles size={17} />
                </div>
                <div className="journal-date">
                  <CalendarDays size={14} />
                  {shortDate(dateOffset(offset + 1))} de 2026 · 08:00{" "}
                  {index === 0 && <Badge tone="purple">Mais recente</Badge>}
                </div>
                <div className="panel journal-content">
                  <span className="eyebrow">
                    BRIEFING · RESULTADOS DE {shortDate(day).toUpperCase()}
                  </span>
                  <h2>
                    {index === 0
                      ? "Um olhar sobre os resultados de ontem."
                      : "Os sinais que merecem sua atenção."}
                  </h2>
                  <p>
                    Em {shortDate(day)}, foram investidos{" "}
                    <strong>{money(m.spend)}</strong>. As campanhas geraram{" "}
                    <strong>{m.leads} leads</strong>, com CPL médio de{" "}
                    <strong>{money(m.cpl)}</strong>. Foram registradas {m.sales}{" "}
                    vendas, somando {money(m.revenue)} em receita simulada.
                  </p>
                  <div className="journal-highlight">
                    <Sparkles size={18} />
                    <p>
                      O CPL {diff >= 0 ? "subiu" : "caiu"}{" "}
                      {Math.abs(diff).toFixed(1).replace(".", ",")}% em relação
                      ao dia anterior. A Masterclass merece uma revisão dos
                      criativos antes de ampliar o investimento.
                    </p>
                  </div>
                  <h3>Seu foco para o próximo dia</h3>
                  <ul>
                    <li>
                      Revisar a frequência e a mensagem da campanha Masterclass.
                    </li>
                    <li>
                      Acompanhar a qualidade dos leads, além do custo de
                      aquisição.
                    </li>
                    <li>
                      Revisar as recomendações antes de qualquer ajuste de
                      orçamento.
                    </li>
                  </ul>
                  <Link href="/recomendacoes" className="text-link">
                    Revisar recomendações <ArrowUpRight size={15} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
        <aside className="journal-aside panel">
          <Sparkles size={23} />
          <h2>Comece pelo que importa.</h2>
          <p>
            O diário reúne investimento, captação e vendas em uma visão
            objetiva.
          </p>
          <hr />
          <span className="eyebrow">SOBRE ESTE DIÁRIO</span>
          <p>
            Os briefings são calculados a partir dos dados fictícios de cada
            dia. A geração automática e o envio de notificações ficam para uma
            próxima etapa.
          </p>
          <span className="muted small">
            O seletor de período não altera o histórico diário.
          </span>
        </aside>
      </div>
    </>
  );
}
