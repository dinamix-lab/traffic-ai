import Link from "next/link";
export default function NotFound() {
  return (
    <div className="not-found">
      <span className="eyebrow">TRAFFIC AI · 404</span>
      <h1>Não encontramos esta página.</h1>
      <p>A campanha ou o endereço solicitado não está disponível.</p>
      <Link href="/" className="button primary">
        Voltar à visão geral
      </Link>
    </div>
  );
}
