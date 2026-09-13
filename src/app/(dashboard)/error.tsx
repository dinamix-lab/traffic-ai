"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="panel empty" role="alert">
      <h1>Não foi possível carregar esta área.</h1>
      <p>Tente novamente para recuperar seus dados de demonstração.</p>
      <button className="button primary" onClick={reset}>
        Tentar novamente
      </button>
    </section>
  );
}
