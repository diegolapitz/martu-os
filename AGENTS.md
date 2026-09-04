<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project-local design skills

- `$frontend-design`: `.agents/skills/frontend-design/SKILL.md`
  - Source: `anthropics/claude-plugins-official/plugins/frontend-design/skills/frontend-design`
- `$ui-ux-pro-max`: `.agents/skills/ui-ux-pro-max/SKILL.md`
  - Source: `nextlevelbuilder/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max`

For Martu OS product-design work, read both skills before changing UI. Use
`$frontend-design` to establish the visual direction and `$ui-ux-pro-max` to
query design-system guidance and run the final UI/UX checklist.

## Política de desarrollo multiagente

### Roles y ramas

- `main` es la versión integrada del producto y la única rama desde la que se
  autoriza una liberación.
- El integrador/tech lead es el único responsable de integrar cambios en
  `main`, ejecutar la regresión completa y desplegar a producción.
- Cada especialista trabaja en una rama y worktree propios; no trabaja
  directamente sobre el worktree de `main` ni despliega producción.
- Usar el prefijo `codex/` para las ramas de trabajo, con un alcance explícito
  (por ejemplo, `codex/design/<tema>`, `codex/supervisora/<tema>` o
  `codex/instagram/<tema>`).

### Reglas de coordinación

- Antes de empezar, actualizarse desde `main`, declarar los archivos o
  subsistemas que se tocarán y revisar `PROJECT_STATE.md`.
- No mezclar cambios no relacionados en una misma rama. Los cambios de esquema
  incluyen migración, compatibilidad y pruebas en la misma entrega.
- Para archivos compartidos, coordinar antes de editar: en particular
  `src/server/agent/**`, contratos de datos, rutas API, componentes de cliente
  y `package.json`.
- Entregar commits pequeños, descriptivos y verificables. Informar al
  integrador el commit base, los commits a revisar, las pruebas ejecutadas,
  migraciones, variables de entorno y riesgos de regresión.
- El integrador revisa los diffs, resuelve conflictos, ejecuta las pruebas
  acordadas y actualiza `PROJECT_STATE.md` después de cada integración.

### Seguridad del working tree y despliegues

- Nunca descartar, sobrescribir, limpiar ni restablecer cambios no reconocidos.
  Primero inspeccionar `git status`, el diff, el último autor/commit del archivo
  y el worktree de origen; escalar al integrador si la procedencia sigue siendo
  ambigua.
- No hacer `push` a producción, migraciones cloud ni deploy desde una rama de
  especialista. Esas acciones las realiza únicamente el integrador desde un
  `main` limpio y verificado.
- Un worktree sucio bloquea merges, rebases destructivos y despliegues hasta que
  su propietario y alcance estén identificados.
