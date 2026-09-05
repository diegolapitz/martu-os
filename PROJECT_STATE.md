# Martu OS — estado canónico de Alpha

Actualizado: 2026-09-05 (America/Argentina/Buenos_Aires)  
Responsable: Tech lead / integrador

## Candidato integrado

- Código de Alpha integrado por fast-forward: `66dd907c2321fe4bbc107003ec6e4b79e3815eef` (`fix(first-run): bind alpha scheduler to personal workspace`).
- La integración incorpora `3dfeea2`, `3100fbd`, `ed4d261` y `66dd907` de `codex/onboarding/first-run-auth`. No incluye trabajo nuevo de Supervisora ni Instagram.
- Corrección posterior de alta inicial: `a1bf1dac1a389d85e1cbed44deb7f9176cc60068` aplica el predicado del índice parcial de `auth_user_id` al `ON CONFLICT` y agrega cobertura de integración.
- Base confirmada: `13d1175`; no hubo conflictos ni cambios locales descartados.
- Antes de publicar, `origin/main` estaba 7 commits detrás de este `main`; el push y deploy final establecerán la única referencia canónica.

## Infraestructura aplicada

- Supabase remoto: migración `202609040001_multi_user_auth.sql` aplicada y confirmada.
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

El E2E histórico espera el login legacy por código y aún no es compatible con el formulario Supabase. Además, `next dev` agotó el timeout de inicio en este filesystem lento. Al probar contra el build, el formulario Supabase se mostró correctamente. No se modificó producto ni se forzó la suite. La validación manual entregada por la rama congelada cubrió login, perfil, servicios, reanudación, cliente y workspace.

## Riesgos abiertos

1. Actualizar el harness E2E para dos cuentas Supabase de prueba y first-run real.
2. Rotar credenciales expuestas históricamente en conversaciones anteriores.
3. La discrepancia histórica `gavilan`/Metauro sigue siendo una decisión de datos separada.

No hay trabajo de auth multiusuario pendiente de integración en esta entrega.

## Estado posterior al fix de login

El fix `a1bf1da` fue integrado en `main` y se sincroniza a GitHub sin deploy ni
cambios de Vercel. Hasta una liberación posterior, producción permanece en el
commit Alpha previamente desplegado; esta diferencia es intencional y queda
pendiente de la próxima regresión/release del integrador.
