/* Church-app service worker: receives web push and opens the app on tap. */

self.addEventListener("push", (event) => {
  let data = { title: "Your church", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* non-JSON payload: show defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (win.url.includes(url) && "focus" in win) return win.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
