chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error))
})

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url) return
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id === tabId) broadcastUrl(changeInfo.url, tabId)
  })
})
