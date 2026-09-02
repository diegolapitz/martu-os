# Martu OS 3a — sistema visual

Referencia completa: [`../DESIGN.md`](../DESIGN.md).

## Tokens

```css
:root {
  --bg-canvas: #eef0ed;
  --bg-surface: #ffffff;
  --bg-subtle: #f6f8f5;
  --bg-active: #e7ece6;
  --border: #e2e6e1;
  --text: #16181a;
  --text-2: #565e62;
  --text-3: #5f686d;
  --danger: #da3b12;
  --sv-lime: #c9f24e;
  --sv-lime-soft: #dcef9b;
}
```

Tipografía de interfaz: Schibsted Grotesk. IBM Plex Mono queda reservada para
fechas, horas, números, contadores y etiquetas categóricas. Estructura sin
sombras; radio habitual de 6–10 px; píldoras sólo para filtros/estados reales.

## Componentes compartidos

- `Brand`: wordmark `martu / os`.
- `ClientMark` / `ClientIdentity`: logo real o tile canónico + nombre.
- `ObjectTypeIcon`: icono Lucide consistente por tipo de entidad.
- `OperationalRow`: acción, trabajo, cliente, estado, vencimiento y deep link.
- `SectionTitle`: overline mono, sólo para categorías reales.
- `SupervisorDock`: entrada persistente, contextual y no obstructiva.

Los estilos 3a viven en `src/app/direction-3a.css` y se cargan después del
sistema anterior para mantener compatibilidad mientras la UI existente conserva
sus contratos funcionales.
