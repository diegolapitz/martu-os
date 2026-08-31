export async function registerActivePushServiceWorker(
  serviceWorker: ServiceWorkerContainer,
): Promise<ServiceWorkerRegistration> {
  const registration = await serviceWorker.register("/sw.js");
  if (registration.active) return registration;

  // `register()` resolves as soon as the worker is registered, which can be
  // before its first install/activate cycle finishes. PushManager rejects a
  // subscription during that gap, so wait for the active registration.
  const activeRegistration = await serviceWorker.ready;
  if (!activeRegistration.active) {
    throw new Error("El service worker no llegó a activarse.");
  }

  return activeRegistration;
}
