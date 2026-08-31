import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { Response as PlaywrightResponse } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3000";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

async function enterMartuOs(page: Page) {
  await page.goto("/");
  const login = page.getByRole("heading", { name: "Entrá a Martu OS." });
  if (await login.isVisible()) {
    const code = process.env.E2E_ACCESS_CODE ?? "";
    if (code) await page.getByLabel("Código de acceso").fill(code);
    await page.getByRole("button", { name: "Entrar a laburar" }).click();
  }

  await expect(page).toHaveURL(/\/day$/);
  await expect(
    page.getByRole("heading", { name: /Buen día, Martu\./ }),
  ).toBeVisible();
}

function inputDateTime(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function cleanup(
  context: BrowserContext,
  paths: Array<string | undefined>,
) {
  for (const path of paths) {
    if (!path) continue;
    await context.request.delete(`${BASE_URL}${path}`).catch(() => undefined);
  }
}

async function responseJson<T extends Record<string, unknown>>(
  pending: Promise<PlaywrightResponse>,
  label: string,
): Promise<T> {
  const response = await pending;
  const payload = (await response.json()) as T & { message?: string };
  expect(
    response.ok(),
    `${label} falló (${response.status()}): ${payload.message ?? JSON.stringify(payload)}`,
  ).toBeTruthy();
  return payload;
}

test("login de desarrollo y shell principal funcionan también en móvil", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Entrá a Martu OS." }),
  ).toBeVisible();
  await expect(page.getByLabel("Código de acceso")).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "Entrar a laburar" }).click();

  await expect(page).toHaveURL(/\/day$/);
  await expect(
    page.getByRole("heading", { name: /Buen día, Martu\./ }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegación principal" }).first(),
  ).toContainText("Trabajo");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
  await expect(
    page.locator(".mobile-bottom-nav").getByRole("link", { name: "Trabajo" }),
  ).toBeVisible();
  await expect(page.getByTestId("notification-center")).toBeVisible();
});

test("Trabajo permite crear, editar, completar, buscar y eliminar", async ({
  page,
  context,
}) => {
  await enterMartuOs(page);
  await page.goto("/work");
  await expect(page.getByRole("heading", { name: "Trabajo" })).toBeVisible();

  const suffix = Date.now().toString(36);
  const title = `Trabajo E2E ${suffix}`;
  let workId: string | undefined;

  try {
    await page.getByRole("button", { name: "Nuevo trabajo" }).click();
    const createEditor = page.getByRole("complementary", {
      name: "Nuevo trabajo",
    });
    await expect(createEditor).toBeVisible();
    await createEditor.getByLabel("Título").fill(title);
    await createEditor
      .getByLabel("Descripción")
      .fill("Contexto creado desde la suite V1.");
    await createEditor
      .getByRole("combobox", { name: /^Cliente/ })
      .selectOption({ label: "Gavilán" });
    await createEditor.getByLabel("Prioridad").selectOption("high");
    await createEditor.getByLabel("Lista").selectOption("today");
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 1);
    dueAt.setHours(10, 30, 0, 0);
    await createEditor.getByLabel("Fecha y hora").fill(inputDateTime(dueAt));

    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/work") &&
        response.request().method() === "POST",
    );
    await createEditor.getByRole("button", { name: "Crear trabajo" }).click();
    const created = await responseJson<{
      item?: { id?: string | number };
    }>(createResponse, "Crear trabajo");
    workId =
      created.item?.id != null
        ? String(created.item.id)
        : (new URL(page.url()).searchParams.get("item") ?? undefined);

    await expect(page.getByText("Trabajo creado.").first()).toBeVisible();
    await expect(page).toHaveURL(/\/work\?item=\d+/);
    await page.reload();

    const editEditor = page.getByRole("complementary", {
      name: "Editar trabajo",
    });
    await expect(editEditor).toBeVisible();
    await editEditor
      .getByLabel("Descripción")
      .fill("Contexto editado y persistido desde E2E.");
    await editEditor.getByLabel("Estado").selectOption("in_progress");
    await editEditor.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cambios guardados.").first()).toBeVisible();
    await editEditor.getByRole("button", { name: "Cerrar editor" }).click();

    await page.getByLabel("Buscar trabajo o cliente").fill(title);
    const row = page.getByRole("article").filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: `Completar ${title}` }).click();
    await expect(row).toContainText("Completado");

    await row.getByRole("button", { name: `Editar ${title}` }).click();
    const deleteEditor = page.getByRole("complementary", {
      name: "Editar trabajo",
    });
    await deleteEditor.getByRole("button", { name: "Eliminar" }).click();
    await deleteEditor.getByRole("button", { name: "Sí, eliminar" }).click();
    await expect(page.getByText("Trabajo eliminado.").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Editar ${title}` }),
    ).toHaveCount(0);
  } finally {
    await cleanup(context, [workId ? `/api/work/${workId}` : undefined]);
  }
});

test("el cliente y su estrategia se editan de forma directa y persisten", async ({
  page,
  context,
}) => {
  await enterMartuOs(page);
  await page.goto("/clients/gavilan/estrategia");
  await expect(page.getByRole("heading", { name: "Gavilán" })).toBeVisible();

  let originalDescription: string | undefined;
  let originalNotes: string | undefined;
  const marker = `Validación E2E ${Date.now().toString(36)}`;

  try {
    await page.getByRole("button", { name: "Editar cliente" }).click();
    const clientDialog = page.getByRole("dialog", { name: "Editar identidad" });
    originalDescription = await clientDialog
      .getByLabel("Descripción breve")
      .inputValue();
    await clientDialog
      .getByLabel("Descripción breve")
      .fill(`${originalDescription} · ${marker}`);
    await clientDialog.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cliente actualizado.").first()).toBeVisible();
    await page.reload();
    await expect(page.locator(".client-header__identity")).toContainText(
      marker,
    );

    const notes = page.getByLabel("Notas internas");
    originalNotes = await notes.inputValue();
    await notes.fill(`${originalNotes}${originalNotes ? "\n" : ""}${marker}`);
    await page.getByRole("button", { name: "Guardar versión" }).click();
    await expect(
      page.getByText("Estrategia actualizada.").first(),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Notas internas")).toHaveValue(
      new RegExp(marker),
    );
  } finally {
    if (originalDescription !== undefined) {
      await context.request
        .patch(`${BASE_URL}/api/clients/gavilan`, {
          data: { description: originalDescription },
        })
        .catch(() => undefined);
    }
    if (originalNotes !== undefined) {
      await context.request
        .patch(`${BASE_URL}/api/clients/gavilan/strategy`, {
          data: { notes: originalNotes, createVersion: false },
        })
        .catch(() => undefined);
    }
  }
});

test("Idea → Guion → Contenido conserva edición, vínculos y deep links", async ({
  page,
  context,
}) => {
  await enterMartuOs(page);
  await page.goto("/clients/gavilan/ideas");
  const title = `Escapada E2E ${Date.now().toString(36)}`;
  let ideaId: string | undefined;
  let scriptId: string | undefined;
  let contentId: string | undefined;

  try {
    await page.getByRole("button", { name: "Nueva idea" }).click();
    const ideaDialog = page.getByRole("dialog", {
      name: "Capturá lo que apareció",
    });
    await ideaDialog.getByLabel("Título").fill(title);
    await ideaDialog
      .getByLabel("Desarrollo")
      .fill("Abrir con la escapadita y después sumar contexto.");
    const ideaResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/ideas") &&
        response.request().method() === "POST",
    );
    await ideaDialog.getByRole("button", { name: "Crear idea" }).click();
    const ideaPayload = await responseJson<{
      idea: { id: string | number };
    }>(ideaResponse, "Crear idea");
    ideaId = String(ideaPayload.idea.id);
    await expect(page).toHaveURL(
      new RegExp(`/clients/gavilan/ideas/${ideaId}$`),
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const ideaDetail = page.locator(".entity-detail");
    await ideaDetail.getByLabel("Formato").fill("Reel");
    await ideaDetail
      .getByLabel("Notas internas")
      .fill("Probar una apertura breve y concreta.");
    await ideaDetail.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(ideaDetail.getByText("Idea guardada.")).toBeVisible();

    const scriptResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/ideas/${ideaId}/convert`) &&
        response.request().method() === "POST",
    );
    await ideaDetail
      .getByRole("button", { name: /Guion.*Crear desde esta idea/ })
      .click();
    const scriptPayload = await responseJson<{
      script: { id: string | number };
    }>(scriptResponse, "Convertir idea en guion");
    scriptId = String(scriptPayload.script.id);
    await expect(page).toHaveURL(
      new RegExp(`/clients/gavilan/guiones/${scriptId}$`),
    );

    const scriptDetail = page.locator(".entity-detail");
    await expect(
      scriptDetail.getByRole("heading", { name: title }),
    ).toBeVisible();
    await scriptDetail
      .getByLabel("Hook")
      .fill("Una escapadita puede cambiarte el finde.");
    await scriptDetail
      .getByLabel("Cuerpo")
      .fill("Primero la experiencia; después, la información útil.");
    await scriptDetail.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(scriptDetail.getByText(/Guion guardado/)).toBeVisible();

    const contentResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/content") &&
        response.request().method() === "POST",
    );
    await scriptDetail
      .getByRole("button", { name: /Convertir en contenido|Crear contenido/ })
      .click();
    const contentPayload = await responseJson<{
      content: { id: string | number };
    }>(contentResponse, "Convertir guion en contenido");
    contentId = String(contentPayload.content.id);
    await expect(page).toHaveURL(
      new RegExp(`/clients/gavilan/contenido/${contentId}$`),
    );

    const contentDetail = page.locator(".entity-detail");
    await expect(
      contentDetail.getByRole("heading", { name: title }),
    ).toBeVisible();
    await contentDetail
      .getByLabel("Caption")
      .fill("Una salida cerca para cortar la semana.");
    await contentDetail
      .getByRole("button", { name: "Guardar cambios" })
      .click();
    await expect(
      contentDetail.getByText("Contenido actualizado."),
    ).toBeVisible();

    await contentDetail
      .getByRole("button", { name: /Guion.*Abrir vinculado/ })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/clients/gavilan/guiones/${scriptId}$`),
    );
    await page
      .locator(".entity-detail")
      .getByRole("button", { name: /Idea.*Abrir vinculada/ })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/clients/gavilan/ideas/${ideaId}$`),
    );

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Archivar idea" }).click();
    await expect(page.getByText("Idea archivada.").first()).toBeVisible();
  } finally {
    await cleanup(context, [
      contentId ? `/api/content/${contentId}` : undefined,
      scriptId ? `/api/scripts/${scriptId}` : undefined,
      ideaId ? `/api/ideas/${ideaId}` : undefined,
    ]);
  }
});

test("Calendario navega por vistas y completa CRUD de un evento manual", async ({
  page,
  context,
}) => {
  await enterMartuOs(page);
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendario" })).toBeVisible();

  const view = page.getByRole("group", { name: "Vista del calendario" });
  await view.getByRole("button", { name: "Semana" }).click();
  await expect(view.getByRole("button", { name: "Semana" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const currentPeriod = await page
    .locator(".calendar-v1-nav > strong")
    .innerText();
  await page.getByRole("button", { name: "Período siguiente" }).click();
  await expect(page.locator(".calendar-v1-nav > strong")).not.toHaveText(
    currentPeriod,
  );
  await page.getByRole("button", { name: "Hoy" }).click();
  await view.getByRole("button", { name: "Agenda" }).click();
  await expect(view.getByRole("button", { name: "Agenda" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const title = `Reunión E2E ${Date.now().toString(36)}`;
  const editedTitle = `${title} editada`;
  let eventId: string | undefined;
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(10, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(11, 0, 0, 0);

  try {
    await page.getByRole("button", { name: "Nuevo evento" }).click();
    const createDialog = page.getByRole("dialog", { name: "Agendar algo" });
    await createDialog.getByLabel("Título").fill(title);
    await createDialog.getByLabel("Empieza").fill(inputDateTime(startsAt));
    await createDialog.getByLabel("Termina").fill(inputDateTime(endsAt));
    await createDialog.getByLabel("Tipo").selectOption({ label: "Reunión" });
    await createDialog.getByLabel("Cliente").selectOption("gavilan");
    await createDialog
      .getByLabel("Detalle")
      .fill("Revisión manual del calendario V1.");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/calendar/events") &&
        response.request().method() === "POST",
    );
    await createDialog.getByRole("button", { name: "Guardar evento" }).click();
    const created = await responseJson<{
      event?: { id?: string | number };
    }>(createResponse, "Crear evento");
    eventId = created.event?.id != null ? String(created.event.id) : undefined;
    await expect(page.getByText("Evento creado.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(title) }),
    ).toBeVisible();

    const filters = page.locator("#calendar-filters");
    if (!(await filters.isVisible())) {
      await page.getByRole("button", { name: "Filtros" }).click();
    }
    await filters.getByLabel("Tipo").selectOption("meeting");
    await filters.getByLabel("Cliente").selectOption("gavilan");
    await expect(
      page.getByRole("button", { name: new RegExp(title) }),
    ).toBeVisible();

    await page.getByRole("button", { name: new RegExp(title) }).click();
    const editDialog = page.getByRole("dialog", { name: "Editar evento" });
    await editDialog.getByLabel("Título").fill(editedTitle);
    await editDialog.getByRole("button", { name: "Guardar evento" }).click();
    await expect(page.getByText("Evento actualizado.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(editedTitle) }),
    ).toBeVisible();

    await page.getByRole("button", { name: new RegExp(editedTitle) }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("dialog", { name: "Editar evento" })
      .getByRole("button", { name: "Eliminar" })
      .click();
    await expect(page.getByText("Evento eliminado.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(editedTitle) }),
    ).toHaveCount(0);
  } finally {
    await cleanup(context, [
      eventId ? `/api/calendar/events/${eventId}` : undefined,
    ]);
  }
});

test("Notificaciones permite leer y posponer un mismo issue sin duplicarlo", async ({
  page,
}) => {
  const lifecycleCalls: Array<{
    url: string;
    method: string;
    body: Record<string, unknown>;
  }> = [];
  const notification = {
    id: "e2e-nudge",
    title: "Guion E2E necesita decisión",
    body: "Un único aviso, con acciones claras y contexto exacto.",
    createdAt: new Date().toISOString(),
    status: "delivered",
    targetPath: "/clients/gavilan/guiones/3",
    quickActions: ["complete", "snooze", "dismiss", "reduce_insistence"],
  };

  await page.route("**/api/nudges*", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      lifecycleCalls.push({
        url: request.url(),
        method: request.method(),
        body: request.postDataJSON() as Record<string, unknown>,
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ nudges: [notification], unread: 1, ok: true }),
    });
  });
  await page.route("**/api/agent-actions", async (route) => {
    const request = route.request();
    lifecycleCalls.push({
      url: request.url(),
      method: request.method(),
      body: request.postDataJSON() as Record<string, unknown>,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await enterMartuOs(page);
  await page.getByTestId("notification-center").click();
  const panel = page.getByTestId("notification-panel");
  const item = panel
    .getByRole("article")
    .filter({ hasText: notification.title });
  await expect(item).toHaveCount(1);
  await item.getByRole("button", { name: "Leído" }).click();
  await expect(panel.getByText("Aviso marcado como leído.")).toBeVisible();
  await expect(panel).toContainText("0 sin leer");

  await item.getByRole("button", { name: "Posponer 2 h" }).click();
  await expect(
    panel.getByText("Lo vuelvo a mostrar en dos horas."),
  ).toBeVisible();
  await expect(panel.getByText(notification.title)).toHaveCount(0);
  expect(lifecycleCalls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        method: "PATCH",
        body: { id: "e2e-nudge", status: "read" },
      }),
      expect.objectContaining({
        method: "PATCH",
        body: expect.objectContaining({
          action: "snooze",
          id: "e2e-nudge",
          snoozedUntil: expect.any(String),
        }),
      }),
    ]),
  );
});

test("Web Push espera un Service Worker activo antes de suscribirse", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"], { origin: BASE_URL });
  await page.addInitScript(() => {
    if (typeof PushManager === "undefined") return;
    Object.defineProperty(PushManager.prototype, "subscribe", {
      configurable: true,
      value: async () => ({
        endpoint: "https://push.example.test/martu-e2e",
        expirationTime: null,
        toJSON: () => ({
          endpoint: "https://push.example.test/martu-e2e",
          expirationTime: null,
          keys: { p256dh: "e2e-public-key", auth: "e2e-auth" },
        }),
      }),
    });
  });

  let subscriptionBody: Record<string, unknown> | undefined;
  await page.route("**/api/push/subscribe", async (route) => {
    subscriptionBody = route.request().postDataJSON() as Record<
      string,
      unknown
    >;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, subscriptionId: "e2e" }),
    });
  });

  await enterMartuOs(page);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Configuración" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Activar avisos|Reconfigurar/ })
    .click();
  await expect(
    page.getByText(
      "Listo. Martu OS puede avisarte aunque la web esté cerrada.",
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/no active Service Worker/i)).toHaveCount(0);

  const serviceWorker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      active: registration.active?.state,
      scope: registration.scope,
      controlled: Boolean(navigator.serviceWorker.controller),
    };
  });
  expect(serviceWorker.active).toBe("activated");
  expect(serviceWorker.scope).toBe(`${BASE_URL}/`);
  expect(subscriptionBody).toMatchObject({
    endpoint: "https://push.example.test/martu-e2e",
  });

  await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  });
});
