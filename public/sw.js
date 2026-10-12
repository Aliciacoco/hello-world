self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let message = { title: '消费积分提醒', body: '买之前看一眼积分，花完记一笔。', url: '/points?redeem=1' }
  try { message = { ...message, ...event.data.json() } } catch {}
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    icon: '/app-icon-192.png',
    tag: message.tag || 'points-reminder',
    data: { url: message.url },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/points?redeem=1', self.location.origin)
  if (target.origin !== self.location.origin) return
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin !== target.origin) continue
      const navigated = await client.navigate(target.href)
      if (navigated) return navigated.focus()
    }
    return self.clients.openWindow(target.href)
  })())
})
