// Константы ключей для хранилища Chrome
const STORE_PROXY = "proxySites";
const STORE_BYPASS = "bypassListProxySites";

// Ссылки на элементы DOM
const domElements = {
  siteInput: document.getElementById("siteInput"),
  siteInputBypass: document.getElementById("siteInputBypassSite"),
  siteList: document.getElementById("siteList"),
  siteBypassList: document.getElementById("siteBypassList"),
  siteListContainer: document.getElementById("siteListContainer"),
  wrapperSiteBypassList: document.getElementById("wrapper-siteBypassList"),
  addSiteButton: document.getElementById("addSite"),
  addBypassSiteButton: document.getElementById("addBypassSite"),
  toggleProxyCheckbox: document.getElementById("toggleProxy"),
  toggleBypassListCheckbox: document.getElementById("toggleBypassList"),
  proxyInput: document.getElementById("proxyInput"),
  saveProxyConfigButton: document.getElementById("saveProxyConfig"),
  IdTitleUseProxy: document.getElementById("title-use-proxy"),
  IdTitleNoProxy: document.getElementById("title-no-proxy"),
  idListProxyTitle: document.getElementById("listProxyTitle"),
  idlistProxyBypassTitle: document.getElementById("listProxyBypassTitle"),
  idSaveSites: document.getElementById("saveSites"),
};

let isProxyEnabled = false;
let isToggleBypassEnabled = false;

// Утилиты
function isValidUrl(site) {
  const pattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
  return pattern.test(site.trim());
}

function isValidProxy(proxy) {
  const match = /^(https?|socks(?:4|5)?):\/\/([^/:]+):(\d{1,5})$/i.exec(proxy.trim());
  if (!match) return false;

  const [, , host, rawPort] = match;
  const port = Number(rawPort);
  if (port < 1 || port > 65535) return false;

  const ipv4Parts = host.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every(part => /^\d{1,3}$/.test(part))) {
    return ipv4Parts.every(part => Number(part) <= 255);
  }

  if (host.toLowerCase() === "localhost") return true;
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host);
}

function showInfoText(str = "", element = document.body, setClass = "js-alert") {
  const div = document.createElement("div");
  div.className = setClass;
  div.textContent = str;
  element.append(div);
  setTimeout(() => div.remove(), 4000);
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, data => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(data);
    });
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function showActionError(action, error) {
  showInfoText(`${action}: ${error.message}`, document.body, "js-alertError");
}

function toggleOpacityDisplay() {
  if (isToggleBypassEnabled) {
    domElements.wrapperSiteBypassList.classList.remove("js-opacityDisplay");
    domElements.siteListContainer.classList.add("js-opacityDisplay");
  } else {
    domElements.wrapperSiteBypassList.classList.add("js-opacityDisplay");
    domElements.siteListContainer.classList.remove("js-opacityDisplay");
  }
}

function updateBypassToggleAvailability() {
  domElements.toggleBypassListCheckbox.disabled = !isProxyEnabled;
  domElements.toggleBypassListCheckbox.title = isProxyEnabled
      ? ""
      : "Сначала включите активацию прокси";
}

function updateCounter(storeKey, count) {
  const el = storeKey === STORE_BYPASS ? domElements.idlistProxyBypassTitle : domElements.idListProxyTitle;
  el.textContent = count;
}

// Отображение списка сайтов
function renderSites(sites, listEl, storeKey) {
  listEl.innerHTML = "";
  sites.forEach((site, i) => {
    const li = document.createElement("li");
    const siteName = document.createElement("span");
    siteName.className = "site-name";
    siteName.textContent = site;
    siteName.title = site;

    const btn = document.createElement("button");
    btn.textContent = "Удалить";
    btn.onclick = () => removeSite(storeKey, listEl, i);

    li.append(siteName, btn);
    listEl.appendChild(li);
  });
  updateCounter(storeKey, sites.length);
}

async function addSite(inputEl, storeKey, listEl, errorTitle) {
  const site = inputEl.value.trim().toLowerCase();
  if (!isValidUrl(site)) {
    return showInfoText("Введите домен, например example.com или www.example.com", errorTitle);
  }

  try {
    const data = await storageGet(storeKey);
    const storedSites = Array.isArray(data[storeKey]) ? data[storeKey] : [];
    const sites = new Set(storedSites.map(value => value.toLowerCase()));
    sites.add(site);
    const arr = [...sites];
    await storageSet({[storeKey]: arr});
    renderSites(arr, listEl, storeKey);
    inputEl.value = "";
  } catch (error) {
    showActionError("Не удалось сохранить список сайтов", error);
  }
}

async function removeSite(storeKey, listEl, idx) {
  try {
    const data = await storageGet(storeKey);
    const sites = Array.isArray(data[storeKey]) ? data[storeKey] : [];
    sites.splice(idx, 1);
    await storageSet({[storeKey]: sites});
    renderSites(sites, listEl, storeKey);
  } catch (error) {
    showActionError("Не удалось удалить сайт", error);
  }
}

// Прокси
async function saveProxyConfig() {
  const proxy = domElements.proxyInput.value.trim();

  if (isValidProxy(proxy)) {
    const [scheme, hostPort] = proxy.split("://");
    const [host, port] = hostPort.split(":");

    try {
      await storageSet({
        proxyConfig: {scheme: scheme.toLowerCase(), host: host.toLowerCase(), port: parseInt(port, 10)},
      });
      showInfoText("Настройки прокси сохранены!");
    } catch (error) {
      showActionError("Не удалось сохранить настройки прокси", error);
    }
  } else {
    showInfoText("Введите корректный прокси в формате схема://хост:порт с портом от 1 до 65535");
  }
}

// Экспорт
async function exportToFile() {
  try {
    const data = await storageGet([STORE_PROXY, STORE_BYPASS]);
    const allSites = {
      sites: data[STORE_PROXY] || [],
      sitesBypass: data[STORE_BYPASS] || [],
    };

    const fileContent = JSON.stringify(allSites);
    const bb = new Blob([fileContent], {type: "text/plain"});
    const a = document.createElement("a");
    a.download = "listSitesAll.txt";
    a.href = window.URL.createObjectURL(bb);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  } catch (error) {
    showActionError("Не удалось экспортировать списки", error);
  }
}

// Загрузка дефолтных данных
async function loadDefaults() {
  try {
    const data = await storageGet(
        ["proxyConfig", STORE_PROXY, "isProxyEnabled", "isToggleBypassEnabled", STORE_BYPASS]
    );
    const defaultProxy = data.proxyConfig || {
      scheme: "http",
      host: "127.0.0.1",
      port: 8080,
    };
    domElements.proxyInput.value = `${defaultProxy.scheme}://${defaultProxy.host}:${defaultProxy.port}`;

    const defaultSites = Array.isArray(data[STORE_PROXY]) ? data[STORE_PROXY] : ["2ip.ru", "youtube.com"];
    const defaultBypassList = Array.isArray(data[STORE_BYPASS]) ? data[STORE_BYPASS] : ["afisha.ru"];
    const defaultsToSave = {};
    if (!Array.isArray(data[STORE_PROXY])) defaultsToSave[STORE_PROXY] = defaultSites;
    if (!Array.isArray(data[STORE_BYPASS])) defaultsToSave[STORE_BYPASS] = defaultBypassList;
    if (Object.keys(defaultsToSave).length) await storageSet(defaultsToSave);

    renderSites(defaultSites, domElements.siteList, STORE_PROXY);
    renderSites(defaultBypassList, domElements.siteBypassList, STORE_BYPASS);

    isProxyEnabled = Boolean(data.isProxyEnabled);
    domElements.toggleProxyCheckbox.checked = isProxyEnabled;
    updateBypassToggleAvailability();

    isToggleBypassEnabled = Boolean(data.isToggleBypassEnabled);
    domElements.toggleBypassListCheckbox.checked = isToggleBypassEnabled;
    toggleOpacityDisplay();
  } catch (error) {
    showActionError("Не удалось загрузить настройки", error);
  }
}

// Слушатели
domElements.addSiteButton.onclick = () =>
    addSite(domElements.siteInput, STORE_PROXY, domElements.siteList, domElements.IdTitleUseProxy);

domElements.addBypassSiteButton.onclick = () =>
    addSite(domElements.siteInputBypass, STORE_BYPASS, domElements.siteBypassList, domElements.IdTitleNoProxy);

domElements.saveProxyConfigButton.onclick = saveProxyConfig;
domElements.idSaveSites.onclick = exportToFile;

domElements.siteInput.addEventListener("keypress", e => {
  if (e.key === "Enter") addSite(domElements.siteInput, STORE_PROXY, domElements.siteList, domElements.IdTitleUseProxy);
});

domElements.toggleProxyCheckbox.addEventListener("change", () => {
  isProxyEnabled = domElements.toggleProxyCheckbox.checked;
  updateBypassToggleAvailability();
  storageSet({ isProxyEnabled }).then(() => {
    showInfoText(
        `Прокси ${isProxyEnabled ? "включен" : "выключен"}`,
        document.getElementById("js-activator-proxy"),
        isProxyEnabled ? "js-alert" : "js-alertError"
    );
  }).catch(error => {
    domElements.toggleProxyCheckbox.checked = !isProxyEnabled;
    isProxyEnabled = !isProxyEnabled;
    updateBypassToggleAvailability();
    showActionError("Не удалось изменить состояние прокси", error);
  });
});

domElements.toggleBypassListCheckbox.addEventListener("change", () => {
  if (!isProxyEnabled) {
    domElements.toggleBypassListCheckbox.checked = false;
    return;
  }

  isToggleBypassEnabled = domElements.toggleBypassListCheckbox.checked;
  storageSet({ isToggleBypassEnabled }).then(() => {
    toggleOpacityDisplay();
    showInfoText(
        `Исключение ${isToggleBypassEnabled ? "включено" : "выключено"}`,
        document.getElementById("js-bypassList-proxy"),
        isToggleBypassEnabled ? "js-alert" : "js-alertError"
    );
  }).catch(error => {
    domElements.toggleBypassListCheckbox.checked = !isToggleBypassEnabled;
    isToggleBypassEnabled = !isToggleBypassEnabled;
    showActionError("Не удалось изменить режим исключений", error);
  });
});

// Старт
loadDefaults();
