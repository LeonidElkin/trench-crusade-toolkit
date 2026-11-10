// Deliberately unbundled: a cached index must recover even if its entry bundle is gone.
;(function () {
  const script = document.currentScript
  const assets = new URL('assets/', script.src).href
  const key = 'trench-toolkit.chunk-recovery-at'
  function refresh(force) {
    if (!force && (!navigator.onLine || document.querySelector('[data-unsaved-warband="true"]')))
      return false
    const now = Date.now()
    try {
      if (!force && now - Number(sessionStorage.getItem(key) || 0) < 300_000) return false
      sessionStorage.setItem(key, String(now))
    } catch {
      if (!force) return false
    }
    const url = new URL(window.location.href)
    url.searchParams.set('_tc_refresh', String(now))
    window.location.replace(url.href)
    return true
  }
  window.addEventListener('vite:preloadError', (event) => {
    if (refresh(false)) event.preventDefault()
  })
  window.addEventListener(
    'error',
    (event) => {
      if (event.target instanceof HTMLScriptElement && event.target.src.startsWith(assets))
        refresh(false)
    },
    true,
  )
  window.addEventListener('tc:reload-app', () => refresh(true))
})()
