import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <div className="standard-page">
      <div className="state-eyebrow">No está por acá</div>
      <h1 className="state-title">Ese cliente o espacio no existe.</h1>
      <p className="state-copy">Volvé al directorio y elegí uno de los cinco clientes de Martu.</p>
      <Link className="button button--primary" href="/clients">Ver clientes</Link>
    </div>
  );
}
