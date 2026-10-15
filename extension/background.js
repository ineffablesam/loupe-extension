chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error))
})

// Opened from the in-page banner. sidePanel.open must run before any await to keep the click's user gesture.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'LOUPE_OPEN_PANEL' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch((error) => console.error(error))
  }
  if (message?.type === 'LOUPE_REMIND' && Array.isArray(message.reminders)) {
    scheduleReminders(message.reminders, message.url).catch((error) => console.error(error))
  }
})

// ── Reminders for return windows and trials ─────────────────────────────

const REMINDERS_KEY = 'loupe-reminders'
const DAY = 24 * 60 * 60 * 1000
const LEAD_DAYS = 2

async function scheduleReminders(incoming, url) {
  const stored = (await chrome.storage.local.get(REMINDERS_KEY))[REMINDERS_KEY] ?? []
  const fresh = incoming.filter((r) => !stored.some((s) => s.id === r.id))
  if (!fresh.length) return

  for (const reminder of fresh) {
    const remindAt = new Date(reminder.date - LEAD_DAYS * DAY)
    remindAt.setHours(9, 0, 0, 0)
    // Deadlines closer than two days get their reminder in a minute instead.
    const when = Math.max(remindAt.getTime(), Date.now() + 60 * 1000)
    await chrome.alarms.create(`loupe:${reminder.id}`, { when })
    reminder.url = ordersPage(url)
    reminder.remindAt = when
  }
  await chrome.storage.local.set({ [REMINDERS_KEY]: [...stored, ...fresh] })

  chrome.notifications.create(`loupe-set:${Date.now()}`, {
    type: 'list',
    iconUrl: 'icons/icon128.png',
    title: 'Loupe will remind you',
    message: `${fresh.length} date${fresh.length === 1 ? '' : 's'} saved`,
    items: fresh.map((r) => ({ title: shortDate(r.remindAt), message: r.body })),
  })
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('loupe:')) return
  const id = alarm.name.slice('loupe:'.length)
  const stored = (await chrome.storage.local.get(REMINDERS_KEY))[REMINDERS_KEY] ?? []
  const reminder = stored.find((r) => r.id === id)
  if (!reminder) return
  const daysLeft = Math.max(0, Math.round((reminder.date - Date.now()) / DAY))
  chrome.notifications.create(`loupe:${id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: daysLeft <= 0 ? 'Today is the last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`,
    message: reminder.body,
    priority: 2,
    requireInteraction: true,
  })
  // Keep it a day past the deadline so the same date isn't offered again right away.
  const keep = stored.filter((r) => r.date > Date.now() - DAY)
  if (keep.length !== stored.length) await chrome.storage.local.set({ [REMINDERS_KEY]: keep })
})

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith('loupe:')) return
  const id = notificationId.slice('loupe:'.length)
  const stored = (await chrome.storage.local.get(REMINDERS_KEY))[REMINDERS_KEY] ?? []
  const reminder = stored.find((r) => r.id === id)
  if (reminder?.url) chrome.tabs.create({ url: reminder.url })
  chrome.notifications.clear(notificationId)
})

/** Where returns and subscriptions are managed; checkout pages expire. */
function ordersPage(url) {
  try {
    const { origin, hostname } = new URL(url)
    return /(^|\.)amazon\./.test(hostname) ? `${origin}/gp/css/order-history` : origin
  } catch {
    return undefined
  }
}

function shortDate(at) {
  return new Date(at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function broadcastUrl(url, tabId) {
  chrome.runtime
    .sendMessage({ type: 'TAB_URL_CHANGED', url, tabId })
    .catch(() => {
      // Side panel may not be open yet — ignore the error
    })
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab?.url) broadcastUrl(tab.url, tabId)
  })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') return
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id === tabId && tab.url) broadcastUrl(tab.url, tabId)
  })
})
