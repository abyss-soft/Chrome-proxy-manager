function applyProxyConfig() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(
      ["proxyConfig", "proxySites", "isProxyEnabled", "isToggleBypassEnabled", "bypassListProxySites"],
      data => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        const config = data.proxyConfig || { scheme: "http", host: "127.0.0.1", port: 8080 };
        const proxyDomains = JSON.stringify((data.proxySites || []).map(domain => domain.toLowerCase()));
        const bypassDomains = JSON.stringify((data.bypassListProxySites || []).map(domain => domain.toLowerCase()));
        const proxyTypes = {
          http: "PROXY",
          https: "HTTPS",
          socks: "SOCKS",
          socks4: "SOCKS4",
          socks5: "SOCKS5"
        };
        const proxyDirective = JSON.stringify(
          `${proxyTypes[config.scheme] || "PROXY"} ${config.host}:${config.port}`
        );
        const useBypass = Boolean(data.isToggleBypassEnabled);
        const pacScript = `
            var proxyDomains = ${proxyDomains};
            var bypassDomains = ${bypassDomains};
            var proxyDirective = ${proxyDirective};

            function matchesDomain(host, domains) {
              for (var index = 0; index < domains.length; index++) {
                var domain = domains[index];
                if (host === domain || dnsDomainIs(host, "." + domain)) {
                  return true;
                }
              }
              return false;
            }

            function FindProxyForURL(url, host) {
              host = host.toLowerCase();
              if (${useBypass}) {
                return matchesDomain(host, bypassDomains) ? "DIRECT" : proxyDirective;
              }
              return matchesDomain(host, proxyDomains) ? proxyDirective : "DIRECT";
            }
          `;

        resolve({ mode: "pac_script", pacScript: { data: pacScript } });
      }
    );
  });
}

let applyRevision = 0;

function logChromeError(action) {
  const error = chrome.runtime.lastError;
  if (error) console.error(`${action}: ${error.message}`);
}

function clearProxy() {
  chrome.proxy.settings.set(
    { value: { mode: "direct" }, scope: "regular" },
    () => logChromeError("Не удалось отключить прокси")
  );
}

async function startProxy(revision) {
  try {
    const proxyConfig = await applyProxyConfig();
    if (revision !== applyRevision) return;
    chrome.proxy.settings.set(
      { value: proxyConfig, scope: "regular" },
      () => logChromeError("Не удалось применить настройки прокси")
    );
  } catch (error) {
    console.error(`Не удалось загрузить настройки прокси: ${error.message}`);
  }
}

async function checkAndApplyProxy() {
  const revision = ++applyRevision;
  chrome.storage.sync.get(["isProxyEnabled"], data => {
    const error = chrome.runtime.lastError;
    if (error) {
      console.error(`Не удалось прочитать состояние прокси: ${error.message}`);
      return;
    }
    if (revision !== applyRevision) return;

    if (data.isProxyEnabled) {
      startProxy(revision);
      chrome.action.setIcon(
        { path: "/icon-128-enabled.png" },
        () => logChromeError("Не удалось обновить значок расширения")
      );
    } else {
      clearProxy();
      chrome.action.setIcon(
        { path: "/icon-128-disabled.png" },
        () => logChromeError("Не удалось обновить значок расширения")
      );
    }
  });
}

// Слушатели
const proxyStorageKeys = new Set([
  "proxyConfig",
  "proxySites",
  "isProxyEnabled",
  "isToggleBypassEnabled",
  "bypassListProxySites",
]);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && Object.keys(changes).some(key => proxyStorageKeys.has(key))) {
    checkAndApplyProxy();
  }
});

function validateImportedDomains(domains) {
  const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  if (!Array.isArray(domains) || domains.length > 500) return null;

  const normalized = [...new Set(domains.map(domain => {
    if (typeof domain !== "string") return null;
    const value = domain.trim().toLowerCase();
    return domainPattern.test(value) ? value : null;
  }))];

  if (normalized.includes(null)) return null;
  if (new TextEncoder().encode(JSON.stringify(normalized)).length > 7000) return null;
  return normalized;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.type !== "importSites") return false;

  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("AddData/index.html")) {
    sendResponse({ ok: false, error: "Импорт разрешён только со страницы расширения." });
    return false;
  }

  const sites = validateImportedDomains(request.sites);
  const bypassSites = validateImportedDomains(request.sitesBypass);
  if (!sites || !bypassSites) {
    sendResponse({ ok: false, error: "Файл содержит некорректные или слишком большие списки доменов." });
    return false;
  }

  chrome.storage.sync.set(
    { proxySites: sites, bypassListProxySites: bypassSites },
    () => {
      const error = chrome.runtime.lastError;
      sendResponse(error
        ? { ok: false, error: "Не удалось сохранить списки в синхронизируемое хранилище." }
        : { ok: true }
      );
    }
  );
  return true;
});

// Старт
checkAndApplyProxy();
