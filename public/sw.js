/* global self, clients */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data.json();
    } catch {
      payload = { title: "Martu OS", body: event.data.text(), deepLink: "/day" };
    }
    const quickActions = Array.isArray(payload.actions) ? payload.actions : [];
    const actions = [];
    if (quickActions.includes("do_now")) actions.push({ action: "do_now", title: "Lo hago ahora" });
    if (quickActions.includes("reschedule")) actions.push({ action: "reschedule", title: "Pasalo a…" });
    if (quickActions.includes("complete")) actions.push({ action: "complete", title: "Ya está" });
    if (quickActions.includes("reduce_insistence")) actions.push({ action: "reduce_insistence", title: "No me jodas con esto" });
    else if (quickActions.includes("dismiss")) actions.push({ action: "dismiss", title: "Descartar" });
    await self.registration.showNotification(payload.title || "Martu OS", {
      body: payload.body || "Tenés un pendiente que necesita decisión.",
      icon: payload.icon || "/icon.svg",
      badge: payload.badge || "/icon.svg",
      tag: payload.tag || "martu-os",
      renotify: true,
      vibrate: [120, 60, 120],
      actions,
      data: {
        ...(payload.data || {}),
        deepLink: safePath(payload.deepLink),
      },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data || {};
    if (event.action && event.action !== "reschedule" && data.nudgeId) {
      try {
        await fetch("/api/agent-actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ nudgeId: data.nudgeId, action: event.action }),
        });
      } catch {
        // Opening the app still lets Martu resolve the action manually.
      }
    }
    const targetUrl = new URL(safePath(data.deepLink), self.location.origin);
    if (event.action === "reschedule") {
      targetUrl.searchParams.set("assistantAction", "reschedule");
      if (data.nudgeId) targetUrl.searchParams.set("nudgeId", String(data.nudgeId));
    }
    const target = targetUrl.href;
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});

function safePath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/day";
  return value;
}
