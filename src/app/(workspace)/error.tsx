"use client";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="standard-page" role="alert">
      <div className="state-eyebrow">Algo se trabó</div>
      <h1 className="state-title">No pude cargar este espacio.</h1>
      <p className="state-copy">Tus datos siguen guardados. Probemos de nuevo antes de hacer drama.</p>
      <button className="button button--primary" type="button" onClick={reset}>Reintentar</button>
    </div>
  );
}
