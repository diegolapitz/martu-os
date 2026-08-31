import { addDays, setHours, setMinutes, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { transactionRaw, type DatabaseRow, type DbExecutor } from "./client";

const TIMEZONE = "America/Argentina/Buenos_Aires";

type DbId = string | number | bigint;

interface IdRow extends DatabaseRow {
  id: DbId;
}

interface CountRow extends DatabaseRow {
  count: string;
}

export interface SeedOptions {
  now?: Date;
  reset?: boolean;
}

export interface SeedResult {
  seeded: boolean;
  reset: boolean;
  clients: number;
  ideas: number;
  scripts: number;
  contentItems: number;
  tasks: number;
  timezone: string;
  relativeTo: string;
}

async function one<T extends DatabaseRow>(
  tx: DbExecutor,
  sql: string,
  params: readonly unknown[] = [],
): Promise<T> {
  const rows = await tx.query<T>(sql, params);
  if (!rows[0])
    throw new Error(`Seed query returned no row: ${sql.slice(0, 80)}`);
  return rows[0];
}

function seedClock(now: Date) {
  const localStart = startOfDay(toZonedTime(now, TIMEZONE));

  const at = (dayOffset: number, hour = 10, minute = 0) => {
    const local = setMinutes(
      setHours(addDays(localStart, dayOffset), hour),
      minute,
    );
    return fromZonedTime(local, TIMEZONE).toISOString();
  };

  const date = (dayOffset: number) => at(dayOffset, 12).slice(0, 10);
  return { at, date };
}

const serviceDefinitions = [
  ["strategy", "Estrategia", "Estrategia", "estrategia", 10, "compass"],
  ["community-management", "Community Management", "CM", "contenido", 20, "messages-square"],
  ["content-creation", "Creación de contenido", "Contenido", "contenido", 30, "clapperboard"],
  ["ideas-planning", "Ideas / planificación", "Ideas", "ideas", 40, "lightbulb"],
  ["scripts", "Guiones", "Guiones", "guiones", 50, "scroll-text"],
  ["recording", "Grabación", "Grabación", "contenido", 60, "video"],
  ["editing", "Edición", "Edición", "contenido", 70, "scissors"],
  ["publishing", "Publicación", "Publicación", "contenido", 80, "send"],
  ["stories", "Historias", "Historias", "contenido", 90, "circle-play"],
  ["metrics-reporting", "Métricas / reporting", "Métricas", "metricas", 100, "chart-no-axes-combined"],
  ["meta-ads", "Meta Ads / pauta", "Pauta", "pauta", 110, "megaphone"],
  ["google-ads", "Google Ads", "Google Ads", "pauta", 120, "badge-dollar-sign"],
  [
    "meetings-account-management",
    "Reuniones / account management",
    "Reuniones",
    "reuniones-notas",
    130,
    "handshake",
  ],
] as const;

const clientDefinitions = [
  {
    slug: "gavilan",
    name: "Gavilán",
    description: "Turismo de cercanía · servicio integral",
    summary: "Escapadas simples para cortar con la rutina sin irse lejos.",
    accent: "#4f7157",
    services: [
      "strategy",
      "community-management",
      "content-creation",
      "ideas-planning",
      "scripts",
      "recording",
      "editing",
      "publishing",
      "stories",
      "metrics-reporting",
      "meta-ads",
      "meetings-account-management",
    ],
  },
  {
    slug: "luma-estudio",
    name: "Luma Estudio",
    description: "Arquitectura sensible · producción de contenido",
    summary: "Martu idea, guiona, graba y edita; Luma publica por su cuenta.",
    accent: "#9a755f",
    services: ["ideas-planning", "scripts", "recording", "editing"],
  },
  {
    slug: "casa-norte",
    name: "Casa Norte",
    description: "Objetos y hogar · comunidad y publicación",
    summary:
      "Calendario cotidiano, historias cercanas y respuesta activa a la comunidad.",
    accent: "#a16947",
    services: [
      "community-management",
      "stories",
      "publishing",
      "ideas-planning",
      "meetings-account-management",
    ],
  },
  {
    slug: "brava-fit",
    name: "Brava Fit",
    description: "Entrenamiento real · contenido y performance orgánico",
    summary: "Contenido útil que baja el fitness a una vida normal, sin pauta.",
    accent: "#a54936",
    services: [
      "strategy",
      "ideas-planning",
      "scripts",
      "recording",
      "editing",
      "publishing",
      "metrics-reporting",
      "meetings-account-management",
    ],
  },
  {
    slug: "nido",
    name: "Nido",
    description: "Desarrollo inmobiliario · estrategia y pauta",
    summary:
      "Captación de consultas calificadas con foco en campaña, no en volumen orgánico.",
    accent: "#6d6a85",
    services: [
      "strategy",
      "meta-ads",
      "metrics-reporting",
      "meetings-account-management",
    ],
  },
] as const;

const ideasByClient: Record<string, string[]> = {
  gavilan: [
    "Escapada sin organizar de más",
    "Un día en la Laguna de los Patos",
    "Tres señales de que necesitás cortar",
    "Un fin de semana, cero planeamiento",
    "Naturaleza cerca, mente lejos",
    "Escapadas que te recargan",
    "Viajar cerca también es viajar",
    "Caminatas, aves y un atardecer",
    "Qué entra en una mochila de finde",
    "Quiénes hacen posible Gavilán",
    "La escapada contada por una pareja",
    "¿Campo, laguna o sobremesa larga?",
  ],
  "luma-estudio": [
    "La luz cambia antes que el plano",
    "Una reforma contada en tres decisiones",
    "Materiales que envejecen bien",
    "Antes y después sin truco de cámara",
    "Cómo se habita un pasillo angosto",
    "El detalle que ordenó toda la cocina",
    "Moodboard versus obra terminada",
    "Lo que el render no muestra",
    "Casa Patio: recorrido en silencio",
    "Preguntas que hacemos antes de dibujar",
  ],
  "casa-norte": [
    "Una mesa, tres sobremesas",
    "Objetos que hacen casa",
    "Domingo de ventana abierta",
    "Cómo combinar madera sin uniformar",
    "La taza que siempre queda afuera",
    "Historias: elegí el próximo color",
    "Detrás del embalaje de cada pedido",
    "Guía corta para cuidar lino",
    "Clientes que armaron su rincón",
  ],
  "brava-fit": [
    "Entrenar aunque el día venga torcido",
    "Tres ejercicios, veinte minutos",
    "La fuerza también se construye despacio",
    "Qué comer antes de entrenar sin complicarse",
    "Volver después de una semana difícil",
    "Errores de técnica que sí importan",
    "Una clase real, sin montaje épico",
    "Progreso que no entra en una balanza",
    "Desafío de movilidad de siete días",
    "Cómo elegir tu primera carga",
  ],
};

const scriptsByClient: Record<string, string[]> = {
  gavilan: [
    "Escapadas que te recargan",
    "Naturaleza cerca, mente lejos",
    "Escapada sin organizar de más",
    "Un fin de semana, cero planeamiento",
    "Pequeñas escapadas, grandes recuerdos",
    "Por qué viajar cerca también es viajar",
    "Un día en la Laguna de los Patos",
    "Tres señales de que necesitás cortar",
    "Qué entra en una mochila de finde",
    "La escapada contada por quienes fueron",
  ],
  "luma-estudio": [
    "La luz cambia antes que el plano",
    "Casa Patio en cuatro movimientos",
    "El detalle que ordenó toda la cocina",
    "Materiales que envejecen con la casa",
    "Antes y después sin esconder el proceso",
    "Lo que el render no alcanza a contar",
    "Tres preguntas antes de tirar una pared",
    "Una reforma contada en decisiones",
  ],
  "brava-fit": [
    "Entrenar aunque el día venga torcido",
    "Tres ejercicios, veinte minutos",
    "Volver después de una semana difícil",
    "La fuerza también se construye despacio",
    "Progreso que no entra en una balanza",
    "Errores de técnica que sí importan",
    "Cómo elegir tu primera carga",
    "Una clase real, sin montaje épico",
  ],
};

const contentByClient: Record<string, string[]> = {
  gavilan: [
    "Reel · Un día en la Laguna de los Patos",
    "Reel · Escapada sin organizar de más",
    "Carrusel · Qué llevar a una escapada corta",
    "Historias · Elegí tu paisaje",
    "Reel · Tres señales de que necesitás cortar",
    "Video institucional · La experiencia Gavilán",
    "Video institucional · Quiénes somos",
    "Reel · Un fin de semana, cero planeamiento",
    "Carrusel · Viajar cerca también es viajar",
    "Historias · Preguntas sobre Laguna de los Patos",
    "Reel · Naturaleza cerca, mente lejos",
    "Testimonio · Sofi y Nico se escaparon",
    "Historias · Agenda de septiembre",
    "Reel · Pequeñas escapadas, grandes recuerdos",
  ],
  "luma-estudio": [
    "Reel · La luz cambia antes que el plano",
    "Reel · Casa Patio en cuatro movimientos",
    "Reel · El detalle que ordenó la cocina",
    "Carrusel · Materiales que envejecen bien",
    "Reel · Antes y después sin truco",
    "Reel · Lo que el render no muestra",
    "Carrusel · Tres preguntas antes de reformar",
    "Reel · Una reforma en decisiones",
    "Clip · Texturas de Casa Patio",
    "Clip · Recorrido final sin voz",
  ],
  "casa-norte": [
    "Carrusel · Una mesa, tres sobremesas",
    "Historias · Elegí el próximo color",
    "Reel · Objetos que hacen casa",
    "Historias · Domingo de ventana abierta",
    "Carrusel · Combinar madera sin uniformar",
    "Reel · Detrás del embalaje",
    "Historias · Preguntas sobre lino",
    "Carrusel · Guía corta para cuidar lino",
    "Reel · El rincón de Clara",
    "Historias · Reposición de tazas",
    "Post · La pieza de la semana",
    "Historias · Encuesta de sobremesa",
  ],
  "brava-fit": [
    "Reel · Tres ejercicios, veinte minutos",
    "Reel · Entrenar con un día torcido",
    "Carrusel · Progreso fuera de la balanza",
    "Reel · Volver después de una semana",
    "Reel · Técnica: bisagra de cadera",
    "Carrusel · Qué comer antes de entrenar",
    "Reel · Cómo elegir tu primera carga",
    "Historias · Desafío de movilidad",
    "Reel · Una clase real",
    "Carrusel · Fuerza construida despacio",
  ],
};

const contentLinkIndexes: Record<
  string,
  { ideas: Array<number | null>; scripts: Array<number | null> }
> = {
  gavilan: {
    ideas: [1, 0, 8, 11, 2, 9, 9, 3, 6, 1, 4, 10, 11, 5],
    scripts: [6, 2, null, null, 7, null, null, 3, 5, null, 1, 9, null, 4],
  },
  "luma-estudio": {
    ideas: [0, 8, 5, 2, 3, 7, 9, 1, 8, 8],
    scripts: [0, 1, 2, 3, 4, 5, 6, 7, null, null],
  },
  "casa-norte": {
    ideas: [0, 5, 1, 2, 3, 6, 7, 7, 8, 4, 1, 0],
    scripts: Array.from({ length: 12 }, () => null),
  },
  "brava-fit": {
    ideas: [1, 0, 7, 4, 5, 3, 9, 8, 6, 2],
    scripts: [1, 0, 4, 2, 5, null, 6, null, 7, 3],
  },
};

export async function seedDatabase(
  options: SeedOptions = {},
): Promise<SeedResult> {
  const now = options.now ?? new Date();
  const reset = options.reset ?? false;
  const { at, date } = seedClock(now);

  return transactionRaw(async (tx) => {
    const existing = await tx.query<IdRow>(
      "select id from public.users where slug = $1",
      ["martu"],
    );
    if (existing.length > 0 && !reset) {
      const counts = await Promise.all([
        tx.query<CountRow>(
          "select count(*)::text as count from public.clients",
        ),
        tx.query<CountRow>("select count(*)::text as count from public.ideas"),
        tx.query<CountRow>(
          "select count(*)::text as count from public.scripts",
        ),
        tx.query<CountRow>(
          "select count(*)::text as count from public.content_items",
        ),
        tx.query<CountRow>("select count(*)::text as count from public.tasks"),
      ]);
      return {
        seeded: false,
        reset: false,
        clients: Number(counts[0][0]?.count ?? 0),
        ideas: Number(counts[1][0]?.count ?? 0),
        scripts: Number(counts[2][0]?.count ?? 0),
        contentItems: Number(counts[3][0]?.count ?? 0),
        tasks: Number(counts[4][0]?.count ?? 0),
        timezone: TIMEZONE,
        relativeTo: now.toISOString(),
      };
    }

    if (existing.length > 0) {
      await tx.query("delete from public.users where slug = $1", ["martu"]);
    }

    const user = await one<IdRow>(
      tx,
      `insert into public.users (slug, name, email, timezone, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $5)
       returning id`,
      ["martu", "Martu", "martu@demo.local", TIMEZONE, at(-120, 9)],
    );

    for (const [
      slug,
      name,
      shortName,
      tabKey,
      sortOrder,
      icon,
    ] of serviceDefinitions) {
      await tx.query(
        `insert into public.services
          (user_id, slug, name, short_name, tab_key, sort_order, icon)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (user_id, slug) do update set
           name = excluded.name,
           short_name = excluded.short_name,
           tab_key = excluded.tab_key,
           sort_order = excluded.sort_order,
           icon = excluded.icon,
           archived_at = null`,
        [user.id, slug, name, shortName, tabKey, sortOrder, icon],
      );
    }

    await tx.query(
      `insert into public.communication_profiles (
         user_id, language, formality, preferred_length, humor, insistence_level,
         quiet_hours_start, quiet_hours_end, morning_briefing_at, midday_check_at,
         end_of_day_at, expressions, minor_task_lead_hours, explicit_preferences
       ) values ($1, 'es-AR', 2, 'short', 3, 4, '22:30', '08:30', '09:00', '13:30', '18:30', $2, 24, $3)`,
      [
        user.id,
        ["che", "dale", "lo cerramos", "qué hacemos"],
        [
          "No usar tono de coach motivacional",
          "Insistir con compromisos reales, no con tareas decorativas",
          "No avisar durante las horas de silencio salvo urgencias",
        ],
      ],
    );

    const clientIds = new Map<string, DbId>();
    for (const [index, client] of clientDefinitions.entries()) {
      const row = await one<IdRow>(
        tx,
        `insert into public.clients (
           user_id, slug, name, description, summary, status, accent, avatar_initial, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9)
         returning id`,
        [
          user.id,
          client.slug,
          client.name,
          client.description,
          client.summary,
          client.accent,
          client.name.slice(0, 1),
          at(-105 + index * 4, 9),
          at(-index, 11),
        ],
      );
      clientIds.set(client.slug, row.id);

      for (const serviceSlug of client.services) {
        await tx.query(
          `insert into public.client_services (client_id, service_id)
           select $1, id from public.services where user_id = $2 and slug = $3`,
          [row.id, user.id, serviceSlug],
        );
      }
    }

    // V1 migrations can run before the first demo seed. Provision workflows
    // after clients and services exist so a pristine install is immediately
    // usable and non-publishing clients stop at Entregado by default.
    await tx.query(
      `insert into public.content_workflows (client_id,name,slug,is_default)
      select c.id,'Flujo principal','principal',true from public.clients c
      where c.user_id = $1 on conflict (client_id,slug) do nothing`,
      [user.id],
    );
    await tx.query(
      `insert into public.content_workflow_states
      (workflow_id,slug,label,color,position,is_visible,terminal_kind)
      select w.id, seed.slug, seed.label, seed.color, seed.position,
        case
          when seed.slug = 'delivered' then not has_publish.enabled
          when seed.slug in ('scheduled','published') then has_publish.enabled
          else true
        end,
        seed.terminal_kind
      from public.content_workflows w
      join public.clients c on c.id = w.client_id
      cross join (values
        ('idea','Idea','#94a3b8',10,null),
        ('script','Guion','#8b5cf6',20,null),
        ('to_record','Para grabar','#f59e0b',30,null),
        ('recorded','Grabado','#f97316',40,null),
        ('editing','Editando','#0ea5e9',50,null),
        ('ready','Listo','#14b8a6',60,null),
        ('approval','En aprobación','#eab308',70,null),
        ('approved','Aprobado','#22c55e',80,null),
        ('scheduled','Programado','#3b82f6',90,null),
        ('published','Publicado','#16a34a',100,'published'),
        ('delivered','Entregado','#475569',110,'delivered')
      ) as seed(slug,label,color,position,terminal_kind)
      cross join lateral (
        select exists (
          select 1 from public.client_services cs
          join public.services s on s.id = cs.service_id
          where cs.client_id = c.id and cs.is_active and s.slug = 'publishing'
        ) as enabled
      ) has_publish
      where c.user_id = $1 and w.is_default
      on conflict (workflow_id,slug) do nothing`,
      [user.id],
    );

    const gavilanId = clientIds.get("gavilan")!;
    const lumaId = clientIds.get("luma-estudio")!;
    const casaId = clientIds.get("casa-norte")!;
    const bravaId = clientIds.get("brava-fit")!;
    const nidoId = clientIds.get("nido")!;

    const briefs = [
      [
        gavilanId,
        "complete",
        ["Aumentar consultas por escapadas", "Instalar el turismo de cercanía"],
        "Personas de 28 a 45 que necesitan cortar la rutina sin planear un viaje largo.",
        "Cercano, sereno y concreto; mostrar experiencias antes que instalaciones.",
        "La pausa que necesitás puede estar mucho más cerca de lo que pensás.",
        ["Laguna de los Patos", "Anfitriones presentes", "Planes simples"],
        [
          "Evitar promesas grandilocuentes",
          "No convertir todo en institucional",
        ],
      ],
      [
        lumaId,
        "draft",
        [
          "Mostrar criterio de diseño",
          "Conseguir consultas de reformas integrales",
        ],
        "Parejas profesionales que valoran diseño habitable y procesos claros.",
        "Preciso, sensible y sin solemnidad.",
        "Arquitectura que se entiende cuando se vive.",
        ["Luz natural", "Materialidad", "Decisiones explicadas"],
        ["Falta validar objeciones comerciales con Luma"],
      ],
      [
        casaId,
        "draft",
        ["Sostener comunidad", "Mover productos de baja rotación"],
        "Personas que arman una casa vivida, no un catálogo perfecto.",
        "Cálido, cotidiano, con humor seco.",
        "Objetos simples para rituales de todos los días.",
        ["Producción chica", "Materiales honestos", "Atención cercana"],
        ["Brief comercial incompleto: falta ticket y margen por línea"],
      ],
      [
        bravaId,
        "complete",
        ["Aumentar guardados", "Convertir consultas a clases de prueba"],
        "Mujeres de 25 a 42 que quieren fuerza sin cultura fitness extrema.",
        "Directo, alentador y realista.",
        "Entrenar fuerte también puede entrar en una vida normal.",
        ["Coaches presentes", "Grupos chicos", "Progreso medible"],
        ["No prometer cambios físicos rápidos"],
      ],
      [
        nidoId,
        "complete",
        ["Generar consultas calificadas", "Bajar el costo por visita agendada"],
        "Familias jóvenes e inversores que evalúan su primera propiedad en pozo.",
        "Claro, sobrio y sin presión artificial.",
        "Una decisión grande explicada con información concreta.",
        ["Financiación", "Ubicación", "Avance visible"],
        ["No comunicar rentabilidad garantizada"],
      ],
    ] as const;

    for (const brief of briefs) {
      await tx.query(
        `insert into public.briefs (
           client_id, status, objectives, audience, tone, positioning, differentiators,
           constraints, source, created_at, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,'demo',$9,$10)`,
        [...brief, at(-90, 10), at(-6, 16)],
      );
    }

    const strategies = [
      [
        gavilanId,
        "Estrategia de cercanía — primavera",
        [
          "Convertir deseo de pausa en consulta",
          "Subir guardados de escapadas",
        ],
        "Adultos con poco tiempo de planificación",
        "Natural, observacional, rioplatense",
        "La escapada posible, cerca y sin logística pesada",
        [
          "Microescapadas",
          "Naturaleza observable",
          "Personas reales",
          "Datos útiles",
        ],
        [
          "Los reels de 18–25 segundos con una experiencia concreta retendrán mejor que los institucionales largos",
        ],
        [
          "Probar videos cortos y verticales primero",
          "Usar Laguna de los Patos como puerta de entrada",
          "Reservar institucionales para remarketing",
        ],
      ],
      [
        bravaId,
        "Estrategia orgánica — fuerza posible",
        ["Aumentar intención de prueba", "Construir autoridad sin intimidar"],
        "Mujeres con experiencia fitness baja o intermitente",
        "Directo y humano",
        "Fuerza para una vida real",
        [
          "Técnica útil",
          "Rutinas posibles",
          "Historias de progreso",
          "Vida del box",
        ],
        [
          "Las piezas guardables de menos de 30 segundos elevarán consultas asistidas",
        ],
        ["No usar transformaciones físicas como eje", "Mostrar clases reales"],
      ],
      [
        nidoId,
        "Estrategia de captación — etapa 2",
        ["Bajar CPA", "Priorizar leads con intención de visita"],
        "Familias e inversores con ahorro inicial",
        "Claro y confiable",
        "Comprar en pozo sin navegar a ciegas",
        ["Avance de obra", "Financiación explicada", "Barrio", "Prueba social"],
        [
          "Los anuncios que explican cuota inicial filtrarán mejor que los aspiracionales",
        ],
        [
          "Separar familias de inversores",
          "Medir visita agendada, no sólo formulario",
        ],
      ],
    ] as const;

    for (const strategy of strategies) {
      await tx.query(
        `insert into public.strategies (
           client_id, title, status, version, objectives, audience, tone, positioning,
           pillars, hypotheses, decisions, valid_from, created_at, updated_at
         ) values ($1,$2,'active',2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [...strategy, at(-35, 9), at(-70, 9), at(-2, 17)],
      );
    }

    const ideaIds = new Map<string, DbId[]>();
    for (const [slug, titles] of Object.entries(ideasByClient)) {
      const ids: DbId[] = [];
      const clientId = clientIds.get(slug)!;
      for (const [index, title] of titles.entries()) {
        const status =
          index < 4
            ? "produced"
            : index < 7
              ? "selected"
              : index < 10
                ? "developing"
                : "new";
        const origin =
          index % 4 === 0 ? "meeting" : index % 3 === 0 ? "ai" : "Martu";
        const description =
          slug === "gavilan"
            ? `Una pieza que vuelve tangible “${title}” desde una escena real, sin vender una escapada como folleto turístico.`
            : slug === "luma-estudio"
              ? `Mostrar “${title}” a través de una decisión espacial concreta y la razón detrás, no sólo con un recorrido lindo.`
              : slug === "casa-norte"
                ? `Llevar “${title}” a una escena cotidiana que invite conversación y permita etiquetar producto sin forzar venta.`
                : `Bajar “${title}” a una acción realizable y técnicamente segura que la audiencia quiera guardar.`;
        const row = await one<IdRow>(
          tx,
          `insert into public.ideas (
             client_id, seed_key, title, description, origin, status, tags, created_at, updated_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [
            clientId,
            `${slug}-idea-${index + 1}`,
            title,
            description,
            origin,
            status,
            index % 2 === 0 ? ["reel", "evergreen"] : ["serie", "comunidad"],
            at(-70 + index * 4, 10),
            at(-12 + Math.min(index, 10), 15),
          ],
        );
        ids.push(row.id);
      }
      ideaIds.set(slug, ids);
    }

    const scriptIds = new Map<string, DbId[]>();
    for (const [slug, titles] of Object.entries(scriptsByClient)) {
      const ids: DbId[] = [];
      const clientId = clientIds.get(slug)!;
      const linkedIdeas = ideaIds.get(slug)!;
      for (const [index, title] of titles.entries()) {
        const scriptNumber = index + 1;
        let status =
          index % 4 === 0 ? "draft" : index % 3 === 0 ? "review" : "approved";
        let dueAt: string | null = index < 3 ? at(-14 + index * 5, 18) : null;
        let version = (index % 3) + 1;
        let hook = `No hace falta empezar de cero para que ${title.toLowerCase()} tenga lugar.`;
        let body = `Abrimos con una escena concreta y dejamos que el detalle sostenga la idea. El desarrollo evita enumerar beneficios: muestra una decisión, qué cambia y por qué importa. Cerramos antes de explicar de más.`;
        let cta = "Guardalo para cuando necesites volver a esta idea.";
        let notes =
          "Mantener ritmo conversado, planos honestos y una sola idea por pieza.";

        if (slug === "gavilan" && scriptNumber === 3) {
          status = "review";
          dueAt = at(1, 18);
          version = 3;
          hook =
            "No necesitás quince días ni un Excel eterno para cortar con la rutina.";
          body =
            "A veces, lo único que necesitamos es un cambio de aire.\n\nMuy cerca hay lugares que te devuelven el ritmo: naturaleza, tranquilidad y planes simples que se disfrutan sin apuro.\n\nUn finde en la Laguna de los Patos te desconecta sin desconectarte de todo: caminatas, aves, buena comida y atardeceres que se quedan con vos.\n\nNo tenés que organizar cada detalle. Solo elegir ir.";
          cta = "Guardalo para cuando necesites irte sin irte tan lejos.";
          notes =
            "Tono cercano y relajado. Hablarle a quien necesita una pausa pero no quiere complicarse. Probar un CTA más breve.";
        }

        const row = await one<IdRow>(
          tx,
          `insert into public.scripts (
             client_id, idea_id, seed_key, script_number, title, format, objective, hook,
             body, cta, status, notes, version, due_at, approved_at, created_at, updated_at
           ) values ($1,$2,$3,$4,$5,'Reel',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           returning id`,
          [
            clientId,
            linkedIdeas[index % linkedIdeas.length],
            `${slug}-script-${scriptNumber}`,
            scriptNumber,
            title,
            index % 2 === 0 ? "Conversión" : "Consideración",
            hook,
            body,
            cta,
            status,
            notes,
            version,
            dueAt,
            status === "approved" ? at(-9 + index, 16) : null,
            at(-65 + index * 5, 11),
            at(-10 + Math.min(index, 9), 18),
          ],
        );
        ids.push(row.id);
      }
      scriptIds.set(slug, ids);
    }

    const contentIds = new Map<string, DbId[]>();
    const defaultStatuses = [
      "published",
      "editing",
      "approval",
      "approved",
      "scheduled",
      "published",
      "published",
      "ready",
      "script",
      "to_record",
    ] as const;
    for (const [slug, titles] of Object.entries(contentByClient)) {
      const ids: DbId[] = [];
      const clientId = clientIds.get(slug)!;
      const linkedIdeas = ideaIds.get(slug)!;
      const linkedScripts = scriptIds.get(slug) ?? [];
      const links = contentLinkIndexes[slug];
      for (const [index, title] of titles.entries()) {
        let status: string = defaultStatuses[index % defaultStatuses.length];
        if (slug === "luma-estudio") {
          status = [
            "delivered",
            "editing",
            "recorded",
            "ready",
            "delivered",
            "editing",
            "to_record",
            "script",
            "recorded",
            "ready",
          ][index]!;
        } else if (slug === "casa-norte") {
          status = [
            "published",
            "approval",
            "published",
            "scheduled",
            "approved",
            "editing",
            "scheduled",
            "published",
            "published",
            "approval",
            "ready",
            "idea",
          ][index]!;
        } else if (slug === "brava-fit") {
          status = [
            "published",
            "published",
            "published",
            "editing",
            "published",
            "scheduled",
            "approval",
            "to_record",
            "recorded",
            "script",
          ][index]!;
        }

        const isPublished = status === "published";
        const dueAt = isPublished
          ? null
          : at((index % 6) - 2, 12 + (index % 5));
        const publishedAt = isPublished ? at(-7 - index * 3, 19) : null;
        const row = await one<IdRow>(
          tx,
          `insert into public.content_items (
             client_id, idea_id, script_id, seed_key, title, format, channel, status,
             pipeline_position, caption, due_at, scheduled_at, published_at, delivered_at,
             status_changed_at, created_at, updated_at
           ) values ($1,$2,$3,$4,$5,$6,'Instagram',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           returning id`,
          [
            clientId,
            links?.ideas[index] == null
              ? linkedIdeas[index % linkedIdeas.length]
              : linkedIdeas[links.ideas[index]!],
            links?.scripts[index] == null
              ? null
              : linkedScripts[links.scripts[index]!],
            `${slug}-content-${index + 1}`,
            title,
            title.startsWith("Historias")
              ? "Historias"
              : title.startsWith("Carrusel")
                ? "Carrusel"
                : "Reel",
            status,
            index,
            `Una pieza sobre ${title.replace(/^\w+ · /, "")} con una idea clara y un cierre que invita a responder.`,
            dueAt,
            status === "scheduled" ? dueAt : null,
            publishedAt,
            status === "delivered" ? at(-4 - index, 17) : null,
            isPublished ? publishedAt : at(-Math.min(index + 1, 8), 15),
            at(-58 + index * 3, 10),
            isPublished ? publishedAt : at(-Math.min(index + 1, 8), 15),
          ],
        );
        ids.push(row.id);
      }
      contentIds.set(slug, ids);
    }

    const noteTexts: Record<string, string[]> = {
      gavilan: [
        "Volvió a pedir videos institucionales, pero prefiere empezar por piezas más cortas para redes. Quiero mostrar el detrás de escena de las experiencias.",
        "La Laguna de los Patos funciona mejor cuando se ve movimiento: aves, caminata y llegada. Evitar abrir con dron largo.",
        "En la próxima reunión validar el guion 3 y pedir una opción de CTA más breve.",
        "El cliente se quedó con la frase ‘irte sin irte tan lejos’. Puede ordenar la campaña de primavera.",
        "Los dos institucionales largos retuvieron peor que los reels de experiencia. Es señal para experimentar, no prueba causal.",
        "Falta confirmar disponibilidad para grabar testimonios de una pareja real en septiembre.",
      ],
      "luma-estudio": [
        "Luma quiere que los videos expliquen decisiones, no que parezcan recorridos inmobiliarios.",
        "No publicar ni prometer métricas: Martu entrega los archivos finales y el cliente maneja sus canales.",
        "La arquitecta habla muy bien cuando le preguntamos por un problema concreto; grabar respuestas cortas.",
        "Casa Patio tiene luz fuerte entre 10:30 y 11:15. Reservar ese bloque para el recorrido.",
        "Evitar palabras como ‘soñado’ y ‘transformación total’; prefieren lenguaje preciso.",
      ],
      "casa-norte": [
        "Las historias con encuestas generan más respuestas que las placas de producto. Sostener dos por semana.",
        "Hay reposición de tazas el jueves; no anunciar antes de confirmar stock.",
        "La dueña responde mejor los comentarios por la mañana. Dejar lista la bandeja a las 10.",
        "Pedir fotos de clientes usando la mesa baja, con autorización para compartir.",
        "Falta cerrar ticket promedio y productos prioritarios en el brief.",
      ],
      "brava-fit": [
        "Los videos de técnica consiguen guardados; los testimonios largos, menos retención. Probar testimonios en cortes de 20 segundos.",
        "No usar lenguaje de culpa ni ‘quemar calorías’. El eje es fuerza y continuidad.",
        "La coach Ana tiene mejor disponibilidad los martes después de las 14.",
        "Preguntar en historias qué ejercicio intimida más antes de escribir la próxima serie.",
        "La consulta que más se repite es si hace falta experiencia previa. Responderla en el próximo reel.",
      ],
      nido: [
        "El equipo comercial necesita que diferenciemos consulta curiosa de visita agendada.",
        "El anuncio de cuota inicial trae menos formularios pero mejores conversaciones. No optimizar sólo por CPL.",
        "Falta material actualizado del avance de obra del bloque B.",
        "Separar copies para familias e inversores; hoy la campaña mezcla objeciones distintas.",
        "Nunca afirmar rentabilidad garantizada. Usar escenarios y condiciones concretas.",
      ],
    };

    for (const [slug, texts] of Object.entries(noteTexts)) {
      for (const [index, text] of texts.entries()) {
        await tx.query(
          `insert into public.notes (user_id, client_id, seed_key, text, tags, source, created_at, updated_at)
           values ($1,$2,$3,$4,$5,'demo',$6,$6)`,
          [
            user.id,
            clientIds.get(slug)!,
            `${slug}-note-${index + 1}`,
            text,
            index % 2 ? ["reunión", "decisión"] : ["insight", "contenido"],
            at(-18 + index * 3, 12 + index),
          ],
        );
      }
    }

    const meetingDefinitions = [
      [
        "gavilan",
        "Reunión con Gavilán",
        -1,
        "Decidimos probar videos más cortos y verticales primero. Los institucionales se mantienen como material de apoyo, no como eje del feed.",
        [
          "Validar guion 3 mañana",
          "Usar Laguna de los Patos como primer experimento",
        ],
        ["Martu cierra CTA del guion 3", "Gavilán confirma testimonios"],
      ],
      [
        "gavilan",
        "Revisión de videos institucionales",
        4,
        "Revisión de cortes largos y selección de escenas reutilizables para piezas breves.",
        ["Comparar retención sin afirmar causalidad"],
        ["Preparar dos aperturas de menos de tres segundos"],
      ],
      [
        "gavilan",
        "Plan de pauta septiembre",
        11,
        "Definir audiencias y materiales de la campaña de escapadas de primavera.",
        ["Separar prospecting y remarketing"],
        ["Confirmar presupuesto semanal"],
      ],
      [
        "luma-estudio",
        "Preproducción Casa Patio",
        -8,
        "Ordenamos recorrido, momentos de luz y respuestas de la arquitecta.",
        ["Grabar decisiones antes que ambientes"],
        ["Martu entrega primer corte el viernes"],
      ],
      [
        "luma-estudio",
        "Revisión de cortes Luma",
        3,
        "Revisar tres reels y elegir qué fragmentos quedan como clips.",
        ["No agregar placas de cierre"],
        ["Enviar links de revisión"],
      ],
      [
        "casa-norte",
        "Calendario de septiembre",
        -5,
        "Priorizamos reposición de tazas y contenidos de sobremesa.",
        ["Dos encuestas semanales"],
        ["Confirmar stock antes de historias"],
      ],
      [
        "casa-norte",
        "Check-in comunidad",
        6,
        "Revisar preguntas frecuentes y respuesta de comentarios.",
        ["Armar guía de lino"],
        ["Pedir fotos de clientes"],
      ],
      [
        "brava-fit",
        "Revisión de performance orgánica",
        -4,
        "Los guardados subieron en técnica. Acordamos cortar testimonios largos y probar respuestas concretas.",
        ["Mantener técnica como pilar", "Probar testimonio de 20 segundos"],
        ["Martu propone dos hooks"],
      ],
      [
        "brava-fit",
        "Grabación con coaches",
        2,
        "Bloque para cuatro reels de técnica y una clase real.",
        ["Grabar audio limpio de Ana"],
        ["Confirmar lista de ejercicios"],
      ],
      [
        "nido",
        "Optimización semanal de pauta",
        -2,
        "El conjunto ‘cuota inicial’ trae menos volumen pero mayor tasa de visita. Mantenerlo y separar familias de inversores.",
        ["Optimizar a visita agendada", "Duplicar audiencia por intención"],
        ["Comercial etiqueta calidad de leads"],
      ],
      [
        "nido",
        "Revisión comercial",
        5,
        "Cruzar formularios con conversaciones y visitas del equipo.",
        ["No leer CPL aislado"],
        ["Exportar estado de leads"],
      ],
    ] as const;
    const meetingIds = new Map<string, DbId[]>();
    for (const [
      slug,
      title,
      dayOffset,
      summary,
      decisions,
      nextSteps,
    ] of meetingDefinitions) {
      const rows = meetingIds.get(slug) ?? [];
      const row = await one<IdRow>(
        tx,
        `insert into public.meetings (
           client_id, seed_key, title, starts_at, duration_minutes, summary, decisions,
           next_steps, created_at, updated_at
         ) values ($1,$2,$3,$4,45,$5,$6,$7,$8,$8) returning id`,
        [
          clientIds.get(slug)!,
          `${slug}-meeting-${rows.length + 1}`,
          title,
          at(dayOffset, 11),
          summary,
          [...decisions],
          [...nextSteps],
          dayOffset <= 0 ? at(dayOffset, 12) : at(-3, 11),
        ],
      );
      rows.push(row.id);
      meetingIds.set(slug, rows);
    }

    const filesByClient: Record<string, Array<[string, string]>> = {
      gavilan: [
        ["Brief Gavilán v2.pdf", "brief"],
        ["Borrador guion 3.pdf", "script"],
        ["Plan de rodaje Laguna.xlsx", "production"],
        ["Referencias primavera", "folder"],
      ],
      "luma-estudio": [
        ["Brief Luma — borrador.pdf", "brief"],
        ["Planos Casa Patio.pdf", "reference"],
        ["Selección de tomas", "folder"],
      ],
      "casa-norte": [
        ["Calendario septiembre.xlsx", "calendar"],
        ["Catálogo temporada.pdf", "catalog"],
        ["Fotos clientes autorizadas", "folder"],
      ],
      "brava-fit": [
        ["Estrategia orgánica v2.pdf", "strategy"],
        ["Rutinas validadas.pdf", "reference"],
        ["Plan de grabación.xlsx", "production"],
      ],
      nido: [
        ["Estrategia de captación.pdf", "strategy"],
        ["Avance bloque B.pdf", "reference"],
        ["Matriz de anuncios.xlsx", "ads"],
      ],
    };
    for (const [slug, files] of Object.entries(filesByClient)) {
      for (const [index, [name, kind]] of files.entries()) {
        await tx.query(
          `insert into public.file_links (
             client_id, seed_key, name, kind, url, provider, size_label, created_at, updated_at
           ) values ($1,$2,$3,$4,$5,'demo',$6,$7,$7)`,
          [
            clientIds.get(slug)!,
            `${slug}-file-${index + 1}`,
            name,
            kind,
            `https://example.com/martu-os/${slug}/archivo-${index + 1}`,
            `${420 + index * 330} KB`,
            at(-20 + index * 4, 16),
          ],
        );
      }
    }

    const taskDefinitions = [
      [
        "gavilan",
        "Cerrar tercer guion de Gavilán",
        "urgent",
        "in_progress",
        at(1, 18),
        "script",
        scriptIds.get("gavilan")![2],
      ],
      [
        "gavilan",
        "Editar reel Laguna de los Patos — detrás de escena",
        "high",
        "in_progress",
        at(0, 17),
        "content",
        contentIds.get("gavilan")![10],
      ],
      [
        "gavilan",
        "Aprobar agenda de historias",
        "high",
        "pending",
        at(0, 15),
        "content",
        contentIds.get("gavilan")![12],
      ],
      [
        "gavilan",
        "Subir referencias para testimonios",
        "medium",
        "completed",
        at(-3, 12),
        "file",
        null,
      ],
      [
        "luma-estudio",
        "Terminar tercer reel de Luma",
        "urgent",
        "in_progress",
        at(-1, 18),
        "content",
        contentIds.get("luma-estudio")![2],
      ],
      [
        "luma-estudio",
        "Enviar primer corte Casa Patio",
        "high",
        "pending",
        at(2, 17),
        "content",
        contentIds.get("luma-estudio")![1],
      ],
      [
        "luma-estudio",
        "Exportar clips verticales",
        "medium",
        "pending",
        at(4, 16),
        "content",
        contentIds.get("luma-estudio")![8],
      ],
      [
        "luma-estudio",
        "Confirmar horario de luz",
        "medium",
        "completed",
        at(-6, 11),
        "meeting",
        null,
      ],
      [
        "casa-norte",
        "Confirmar stock de tazas",
        "high",
        "pending",
        at(0, 13),
        "content",
        contentIds.get("casa-norte")![9],
      ],
      [
        "casa-norte",
        "Responder comentarios pendientes",
        "medium",
        "pending",
        at(0, 10),
        "community",
        null,
      ],
      [
        "casa-norte",
        "Cerrar brief comercial",
        "high",
        "blocked",
        at(-2, 17),
        "brief",
        null,
      ],
      [
        "casa-norte",
        "Programar guía de lino",
        "medium",
        "completed",
        at(-1, 14),
        "content",
        contentIds.get("casa-norte")![7],
      ],
      [
        "brava-fit",
        "Escribir dos hooks de técnica",
        "high",
        "pending",
        at(1, 12),
        "script",
        scriptIds.get("brava-fit")![5],
      ],
      [
        "brava-fit",
        "Preparar lista de grabación",
        "high",
        "pending",
        at(2, 10),
        "meeting",
        null,
      ],
      [
        "brava-fit",
        "Revisar retención de testimonios",
        "medium",
        "completed",
        at(-3, 16),
        "metric",
        null,
      ],
      [
        "brava-fit",
        "Editar reel vuelta al entrenamiento",
        "medium",
        "in_progress",
        at(3, 17),
        "content",
        contentIds.get("brava-fit")![3],
      ],
      [
        "nido",
        "Separar copies para familias e inversores",
        "high",
        "pending",
        at(1, 16),
        "campaign",
        null,
      ],
      [
        "nido",
        "Pedir avance de obra bloque B",
        "urgent",
        "pending",
        at(-1, 14),
        "file",
        null,
      ],
      [
        "nido",
        "Cruzar formularios con visitas",
        "high",
        "in_progress",
        at(2, 18),
        "metric",
        null,
      ],
      [
        "nido",
        "Pausar creativo con fatiga",
        "medium",
        "completed",
        at(-2, 11),
        "campaign",
        null,
      ],
    ] as const;
    const taskIds = new Map<string, DbId>();
    for (const [
      index,
      [slug, title, priority, status, dueAt, entityType, entityId],
    ] of taskDefinitions.entries()) {
      const row = await one<IdRow>(
        tx,
        `insert into public.tasks (
           user_id, client_id, seed_key, title, description, status, priority, due_at,
           started_at, completed_at, source, entity_type, entity_id, created_at, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'demo',$11,$12,$13,$14) returning id`,
        [
          user.id,
          clientIds.get(slug)!,
          `${slug}-task-${index + 1}`,
          title,
          `Seguimiento operativo de ${title.toLowerCase()}.`,
          status,
          priority,
          dueAt,
          status === "in_progress" ? at(-2, 10) : null,
          status === "completed" ? at(-1, 17) : null,
          entityType,
          entityId,
          at(-16 + (index % 8), 9),
          status === "completed" ? at(-1, 17) : at(-2 + (index % 3), 13),
        ],
      );
      taskIds.set(`${slug}:${title}`, row.id);
    }

    // Only clients that sell reporting receive metric rows.
    for (const [slug, reachBase, followers] of [
      ["gavilan", 12800, 6840],
      ["brava-fit", 18400, 9230],
      ["nido", 8100, 3110],
    ] as const) {
      for (let period = 0; period < 3; period += 1) {
        await tx.query(
          `insert into public.metric_snapshots (
             client_id, seed_key, period_start, period_end, followers, reach, views, saves,
             shares, comments, clicks, inquiries, conversions, source, created_at
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'demo',$14)`,
          [
            clientIds.get(slug)!,
            `${slug}-metrics-week-${period}`,
            date(-27 + period * 7),
            date(-21 + period * 7),
            followers + period * 74,
            reachBase + period * 910,
            Math.round((reachBase + period * 910) * 1.34),
            180 + period * 32,
            62 + period * 11,
            44 + period * 5,
            130 + period * 19,
            28 + period * 4,
            7 + period * 2,
            at(-20 + period * 7, 8),
          ],
        );
      }

      const items = contentIds.get(slug) ?? [];
      const metricItemCount = slug === "gavilan" ? 7 : 6;
      for (const [index, contentId] of items
        .slice(0, Math.min(items.length, metricItemCount))
        .entries()) {
        const isGavilanLaguna = slug === "gavilan" && index === 0;
        const isLongInstitutional =
          slug === "gavilan" && (index === 5 || index === 6);
        const views = isGavilanLaguna
          ? 16240
          : isLongInstitutional
            ? 4380 + index * 140
            : 7200 + index * 970;
        const retention = isGavilanLaguna
          ? 0.71
          : isLongInstitutional
            ? 0.29
            : 0.43 + index * 0.025;
        await tx.query(
          `insert into public.content_metrics (
             content_item_id, captured_at, reach, views, avg_watch_seconds, retention_rate,
             saves, shares, comments, clicks, inquiries, conversions, source
           ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'demo')`,
          [
            contentId,
            at(-2, 9),
            Math.round(views * 0.81),
            views,
            isGavilanLaguna ? 13.8 : isLongInstitutional ? 8.4 : 10.2 + index,
            retention,
            95 + index * 21,
            30 + index * 8,
            18 + index * 4,
            42 + index * 9,
            8 + index * 2,
            2 + (index % 3),
          ],
        );
      }
    }

    const campaignDefinitions = [
      [
        gavilanId,
        "Escapadas primavera",
        "Mensajes",
        "active",
        184320,
        2410,
        0.01307,
        76.48,
        612.36,
        3.42,
        "El reel Laguna aporta la mejor apertura; sostenerlo y probar una variante de CTA.",
      ],
      [
        gavilanId,
        "Remarketing institucional",
        "Reproducciones",
        "paused",
        92750,
        804,
        0.00867,
        115.36,
        1030.55,
        1.61,
        "Pausada: los cortes largos muestran fatiga y menor retención.",
      ],
      [
        nidoId,
        "Consultas familias — etapa 2",
        "Leads",
        "active",
        312400,
        3840,
        0.01229,
        81.35,
        824.27,
        2.76,
        "La mención de cuota inicial reduce volumen pero sube visitas agendadas.",
      ],
      [
        nidoId,
        "Inversores — avance de obra",
        "Leads",
        "active",
        221800,
        2975,
        0.01341,
        74.55,
        739.33,
        3.18,
        "Actualizar el material del bloque B antes de escalar presupuesto.",
      ],
    ] as const;
    for (const [index, campaign] of campaignDefinitions.entries()) {
      const [
        clientId,
        name,
        objective,
        status,
        impressions,
        clicks,
        ctr,
        cpc,
        cpa,
        roas,
        observations,
      ] = campaign;
      const row = await one<IdRow>(
        tx,
        `insert into public.ad_campaigns (
           client_id, seed_key, name, objective, status, starts_at, ends_at, spend,
           impressions, clicks, ctr, cpc, cpa, roas, observations, source, created_at, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'demo',$16,$17) returning id`,
        [
          clientId,
          `campaign-${index + 1}`,
          name,
          objective,
          status,
          at(-25, 0),
          at(20, 23),
          Number(cpc) * Number(clicks),
          impressions,
          clicks,
          ctr,
          cpc,
          cpa,
          roas,
          observations,
          at(-28, 10),
          at(-1, 9),
        ],
      );
      for (let creative = 1; creative <= 2; creative += 1) {
        await tx.query(
          `insert into public.ad_creatives (
             campaign_id, seed_key, name, format, status, hook, spend, impressions,
             clicks, ctr, cpc, conversions, observations, created_at, updated_at
           ) values ($1,$2,$3,'video',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            row.id,
            `creative-${creative}`,
            creative === 1 ? "Experiencia concreta" : "Beneficio explicado",
            status === "paused" ? "paused" : "active",
            creative === 1
              ? "Una pausa posible, sin irte lejos."
              : "Todo lo que incluye tu próxima escapada.",
            Number(cpc) * Number(clicks) * (creative === 1 ? 0.58 : 0.42),
            Math.round(Number(impressions) * (creative === 1 ? 0.56 : 0.44)),
            Math.round(Number(clicks) * (creative === 1 ? 0.61 : 0.39)),
            Number(ctr) * (creative === 1 ? 1.08 : 0.9),
            Number(cpc) * (creative === 1 ? 0.91 : 1.13),
            9 + creative * 3,
            creative === 1
              ? "Hook más rápido; mantener como control."
              : "Segunda variante para aprender, no escalar todavía.",
            at(-20, 10),
            at(-1, 10),
          ],
        );
      }
    }

    const globalThread = await one<IdRow>(
      tx,
      `insert into public.chat_threads (user_id, scope, title, source, last_message_at, created_at, updated_at)
       values ($1,'global','Supervisora','demo',$2,$3,$2) returning id`,
      [user.id, at(-1, 18), at(-20, 9)],
    );
    await tx.query(
      `insert into public.chat_messages (thread_id, role, content, mode, created_at) values
       ($1,'assistant',$2,'supervisor',$3),
       ($1,'user',$4,'supervisor',$5),
       ($1,'assistant',$6,'supervisor',$7)`,
      [
        globalThread.id,
        "Martu, hoy hay tres cosas que yo no patearía: la agenda de historias, el reel de Luma y pedirle a Nido el avance de obra.",
        at(-2, 9),
        "El reel de Luma lo termino mañana. Recordámelo a las diez.",
        at(-2, 17),
        "Listo. Mañana a las 10 te voy a recordar el tercer reel de Luma; quedó como compromiso real, no perdido en el chat.",
        at(-2, 17, 1),
      ],
    );

    const gavilanThread = await one<IdRow>(
      tx,
      `insert into public.chat_threads (user_id, client_id, scope, title, source, last_message_at, created_at, updated_at)
       values ($1,$2,'client','Gavilán con la supervisora','demo',$3,$4,$3) returning id`,
      [user.id, gavilanId, at(-1, 19), at(-15, 10)],
    );
    await tx.query(
      `insert into public.chat_messages (thread_id, role, content, mode, created_at) values
       ($1,'user','¿Por qué habíamos decidido hacer videos más cortos?','strategist',$2),
       ($1,'assistant',$3,'strategist',$4)`,
      [
        gavilanThread.id,
        at(-1, 18, 58),
        "Porque en la última reunión acordaron probar experiencias concretas en vertical antes que otro institucional largo. Los dos largos retuvieron menos y el reel de Laguna quedó 38% arriba del promedio reciente. Es una hipótesis de formato, no causalidad probada.",
        at(-1, 18, 59),
      ],
    );

    const memories = [
      [
        null,
        "global",
        "communication",
        "Martu prefiere mensajes cortos, directos y en español rioplatense; no quiere tono de coach.",
        5,
      ],
      [
        gavilanId,
        "client",
        "decision",
        "Gavilán decidió probar videos cortos y verticales antes que nuevos institucionales largos.",
        5,
      ],
      [
        gavilanId,
        "client",
        "learning",
        "El reel de Laguna de los Patos rindió 38% arriba del promedio reciente; tratarlo como señal para experimentar, no como causalidad.",
        4,
      ],
      [
        lumaId,
        "client",
        "scope",
        "Para Luma Martu entrega contenido: no publica, no reporta métricas y no gestiona pauta.",
        5,
      ],
      [
        bravaId,
        "client",
        "brand",
        "Brava evita lenguaje de culpa, transformaciones rápidas y cultura fitness extrema.",
        5,
      ],
      [
        nidoId,
        "client",
        "measurement",
        "Nido prioriza visita agendada y calidad del lead por encima del CPL aislado.",
        5,
      ],
    ] as const;
    for (const [clientId, scope, category, fact, importance] of memories) {
      await tx.query(
        `insert into public.memories (
           user_id, client_id, scope, category, fact, importance, source, created_at, updated_at
         ) values ($1,$2,$3,$4,$5,$6,'demo',$7,$7)`,
        [user.id, clientId, scope, category, fact, importance, at(-12, 14)],
      );
    }

    const lumaTaskId = taskIds.get(
      "luma-estudio:Terminar tercer reel de Luma",
    )!;
    const commitment = await one<IdRow>(
      tx,
      `insert into public.commitments (
         user_id, client_id, task_id, content_item_id, seed_key, title, intention,
         status, due_at, source, created_at, updated_at
       ) values ($1,$2,$3,$4,'demo-luma-third-reel','Terminar tercer reel de Luma',
         'Martu dijo que iba a terminar el tercer reel de Luma','open',$5,'chat',$6,$6)
       returning id`,
      [
        user.id,
        lumaId,
        lumaTaskId,
        contentIds.get("luma-estudio")![2],
        at(-1, 18),
        at(-2, 17),
      ],
    );
    const reminder = await one<IdRow>(
      tx,
      `insert into public.reminders (
         user_id, client_id, task_id, commitment_id, seed_key, title, status, remind_at,
         next_followup_at, channel, target_path, cooldown_key, created_at, updated_at
       ) values ($1,$2,$3,$4,'demo-luma-third-reel-reminder','Tercer reel de Luma','pending',$5,$6,
         'web_push','/clients/luma-estudio/contenido','commitment:luma-third-reel',$7,$7)
       returning id`,
      [
        user.id,
        lumaId,
        lumaTaskId,
        commitment.id,
        at(0, 10),
        at(0, 14),
        at(-2, 17),
      ],
    );

    const nudgeRows = [
      [
        lumaId,
        lumaTaskId,
        commitment.id,
        reminder.id,
        "commitment_overdue",
        "urgent",
        "El reel que prometiste sigue abierto",
        "Martu, dijiste que cerrabas el tercer reel de Luma y sigue en Grabado. ¿Lo hacés ahora o lo pasamos conscientemente?",
        "commitment:luma-third-reel:due",
        at(0, 10),
        "/clients/luma-estudio/contenido",
      ],
      [
        casaId,
        taskIds.get("casa-norte:Cerrar brief comercial")!,
        null,
        null,
        "missing_brief",
        "high",
        "Casa Norte sigue con brief incompleto",
        "Faltan ticket y productos prioritarios. Sin eso, el calendario de venta se está decidiendo medio a ciegas.",
        "brief:casa-norte:incomplete",
        at(-1, 9),
        "/clients/casa-norte/estrategia",
      ],
      [
        nidoId,
        taskIds.get("nido:Pedir avance de obra bloque B")!,
        null,
        null,
        "task_overdue",
        "high",
        "Nido necesita el avance de obra",
        "El creativo del bloque B no se puede actualizar hasta que llegue ese material. ¿Lo pedís hoy?",
        "task:nido:block-b",
        at(0, 9),
        "/clients/nido/pauta",
      ],
    ] as const;
    for (const nudge of nudgeRows) {
      await tx.query(
        `insert into public.ai_nudges (
           user_id, client_id, task_id, commitment_id, reminder_id, kind, severity, title,
           message, status, dedupe_key, deliver_after, cooldown_until, target_path,
           quick_actions, metadata, created_at, updated_at
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$16)`,
        [
          user.id,
          ...nudge.slice(0, 10),
          at(1, 10),
          nudge[10],
          JSON.stringify([
            { id: "now", label: "Lo hago ahora" },
            { id: "reschedule", label: "Pasalo a…" },
            { id: "done", label: "Ya está" },
            { id: "dismiss", label: "No me jodas con esto" },
          ]),
          JSON.stringify({ seeded: true }),
          at(-1, 9),
        ],
      );
    }

    const activityDefinitions = [
      [
        gavilanId,
        "meeting.completed",
        "Martu completó la reunión",
        "Reunión con Gavilán",
        "meeting",
        meetingIds.get("gavilan")![0],
        at(-1, 12),
      ],
      [
        gavilanId,
        "script.updated",
        "Martu actualizó el guion",
        "Guion 3 · Escapada sin organizar de más",
        "script",
        scriptIds.get("gavilan")![2],
        at(-1, 18, 42),
      ],
      [
        gavilanId,
        "file.created",
        "Martu subió un archivo",
        "Borrador guion 3.pdf",
        "file",
        null,
        at(-1, 16, 15),
      ],
      [
        gavilanId,
        "content.published",
        "Martu publicó el reel",
        "Un día en la Laguna de los Patos",
        "content",
        contentIds.get("gavilan")![0],
        at(-7, 19),
      ],
      [
        lumaId,
        "content.status_changed",
        "El tercer reel pasó a Grabado",
        "Quedó pendiente la edición que Martu prometió",
        "content",
        contentIds.get("luma-estudio")![2],
        at(-3, 18),
      ],
      [
        casaId,
        "content.scheduled",
        "Martu programó la guía de lino",
        "Publicación lista para salir",
        "content",
        contentIds.get("casa-norte")![7],
        at(-1, 14),
      ],
      [
        bravaId,
        "metric.reviewed",
        "Martu revisó la retención",
        "Los cortes técnicos sostienen más guardados",
        "metric",
        null,
        at(-3, 16),
      ],
      [
        nidoId,
        "campaign.updated",
        "Martu pausó un creativo",
        "Fatiga en remarketing institucional",
        "campaign",
        null,
        at(-2, 11),
      ],
    ] as const;
    for (const [
      clientId,
      type,
      title,
      description,
      entityType,
      entityId,
      occurredAt,
    ] of activityDefinitions) {
      await tx.query(
        `insert into public.activity_events (
           user_id, client_id, actor, type, title, description, entity_type, entity_id,
           target_path, metadata, occurred_at, created_at
         ) values ($1,$2,'Martu',$3,$4,$5,$6,$7,$8,'{}'::jsonb,$9,$9)`,
        [
          user.id,
          clientId,
          type,
          title,
          description,
          entityType,
          entityId,
          `/clients/${clientDefinitions.find((client) => clientIds.get(client.slug) === clientId)?.slug ?? "gavilan"}`,
          occurredAt,
        ],
      );
    }

    await tx.query(`update public.content_items ci set
      workflow_id = w.id, workflow_state_id = ws.id
      from public.content_workflows w
      join public.content_workflow_states ws on ws.workflow_id = w.id
      where w.client_id = ci.client_id and w.is_default and ws.slug = ci.status
        and (ci.workflow_id is null or ci.workflow_state_id is null)`);

    const counts = await Promise.all([
      tx.query<CountRow>("select count(*)::text as count from public.clients"),
      tx.query<CountRow>("select count(*)::text as count from public.ideas"),
      tx.query<CountRow>("select count(*)::text as count from public.scripts"),
      tx.query<CountRow>(
        "select count(*)::text as count from public.content_items",
      ),
      tx.query<CountRow>("select count(*)::text as count from public.tasks"),
    ]);

    return {
      seeded: true,
      reset,
      clients: Number(counts[0][0]?.count ?? 0),
      ideas: Number(counts[1][0]?.count ?? 0),
      scripts: Number(counts[2][0]?.count ?? 0),
      contentItems: Number(counts[3][0]?.count ?? 0),
      tasks: Number(counts[4][0]?.count ?? 0),
      timezone: TIMEZONE,
      relativeTo: now.toISOString(),
    };
  });
}
