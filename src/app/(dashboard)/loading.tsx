export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando indicadores"
      className="loading-state"
    >
      <div className="skeleton skeleton-title" />
      <div className="metrics-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <p>Carregando seus resultados...</p>
    </div>
  );
}
