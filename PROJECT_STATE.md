# Martu OS — estado canónico de Alpha

Actualizado: 2026-09-05 (America/Argentina/Buenos_Aires)  
Responsable: Tech lead / integrador

## Candidato integrado

- Código canónico integrado: `06908b9cb69d6c3920034773e2d0b8f6f433e678` (`fix(onboarding): retain long brief imports`), incorporado por fast-forward desde `codex/onboarding/brief-import-resilience`.
- La historia integrada incluye `3dfeea2`, `3100fbd`, `ed4d261` y `66dd907` de `codex/onboarding/first-run-auth`, más `a1bf1dac1a389d85e1cbed44deb7f9176cc60068`, que corrige el `ON CONFLICT` del índice parcial de `auth_user_id`.
- `06908b9` conserva el texto fuente completo de briefs en `briefs.source_text`, limita a 8.000 caracteres el extracto editable, comunica claramente el recorte y aplica el color de acento sugerido al crear el primer cliente. No incluye trabajo nuevo de Supervisora ni Instagram.
- Base confirmada: `13d1175`; no hubo conflictos ni cambios locales descartados.
- El push posterior a esta actualización debe dejar `origin/main` alineado con el commit de documentación que registra esta integración. No se autoriza un deploy como parte de esta entrega.

## Infraestructura aplicada

- Supabase remoto: migración `202609040001_multi_user_auth.sql` aplicada y confirmada.
- Supabase remoto: migración `202609050001_brief_source_text.sql` aplicada y confirmada; agrega `briefs.source_text` con valor por defecto seguro para filas existentes.
- Supabase Auth: Site URL `https://martu-os.vercel.app`; redirects permitidos: `https://martu-os.vercel.app/auth/callback` y `http://localhost:3000/**`.
- Vercel Production: configuradas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `MARTU_ALLOW_LEGACY_AUTH=false`. No se registran secretos.
- Producción verificada en `https://martu-os.vercel.app`: HTTP 200 servido por Vercel, formulario Supabase presente y formulario legacy ausente.

## Regresión de release

| Verificación | Resultado |
| --- | --- |
| `pnpm lint` | 0 errores; 3 warnings preexistentes |
| `pnpm typecheck` | Correcto |
| `pnpm vitest run --no-file-parallelism` | 48 archivos, 234 tests correctos |
| Aislamiento de datos | 2 usuarios correctos en `data-isolation.integration.test.ts` |
| Build con env real de Vercel | Correcto; 38 rutas generadas |
| Fix de índice parcial | `database.integration.test.ts`: 8 tests correctos; typecheck correcto |
| Resiliencia de brief/PDF largo | 7 tests focalizados correctos (`brief-import`, contrato y dominio); typecheck correcto |
| Lint posterior a la integración de briefs | 0 errores; 3 warnings preexistentes |

El E2E histórico espera el login legacy por código y aún no es compatible con el formulario Supabase. Además, `next dev` agotó el timeout de inicio en este filesystem lento. Al probar contra el build, el formulario Supabase se mostró correctamente. No se modificó producto ni se forzó la suite. La validación manual entregada por la rama congelada cubrió login, perfil, servicios, reanudación, cliente y workspace.

## Riesgos abiertos

1. Actualizar el harness E2E para dos cuentas Supabase de prueba y first-run real.
2. Rotar credenciales expuestas históricamente en conversaciones anteriores.
3. La discrepancia histórica `gavilan`/Metauro sigue siendo una decisión de datos separada.

No hay trabajo de auth multiusuario pendiente de integración en esta entrega.

## GitHub y producción

El fix `a1bf1da` fue desplegado y verificado en Vercel mediante
`dpl_EeS1ebjoLV5RAga5xVzazhdCN2qx`, alias
`https://martu-os.vercel.app`, construido desde `6cb3bfe20df28a54971788130663a8407d97799b`.
La producción responde HTTP 200 y presenta el acceso Supabase.

El código y la migración de briefs de `06908b9` están integrados y aplicados en
Supabase, respectivamente, pero **no fueron desplegados a Vercel** por alcance
explícito. Hasta el próximo release verificado, producción permanece en
`6cb3bfe`; esta diferencia es intencional.
