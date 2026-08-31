export default function WorkspaceLoading() {
  return (
    <div className="route-skeleton" role="status" aria-live="polite" aria-label="Cargando la vista">
      <div className="route-skeleton__header" aria-hidden="true"><i /><i /></div>
      <div className="route-skeleton__toolbar" aria-hidden="true"><i /><i /><i /></div>
      <div className="route-skeleton__body" aria-hidden="true">
        <div><i /><i /><i /><i /></div>
        <aside><i /><i /></aside>
      </div>
      <span className="sr-only">Cargando la vista</span>
    </div>
  );
}
