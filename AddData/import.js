const fileInput = document.getElementById("file");
const importStatus = document.getElementById("importStatus");
const maxFileSize = 32 * 1024;
const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function validateDomains(domains) {
    if (!Array.isArray(domains) || domains.length > 500) {
        throw new Error("Формат списка доменов некорректен или превышен лимит в 500 записей.");
    }

    const normalized = [...new Set(domains.map((domain) => {
        if (typeof domain !== "string") {
            throw new Error("Список должен содержать только домены.");
        }

        const value = domain.trim().toLowerCase();
        if (!domainPattern.test(value)) {
            throw new Error(`Некорректный домен: ${value || "пустое значение"}`);
        }
        return value;
    }))];

    if (new TextEncoder().encode(JSON.stringify(normalized)).length > 7000) {
        throw new Error("Список слишком велик для синхронизируемого хранилища.");
    }
    return normalized;
}

function sendImportMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
            } else {
                resolve(response);
            }
        });
    });
}

if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    fileInput.disabled = true;
    importStatus.textContent = "Откройте страницу импорта по ссылке в меню расширения Proxy Manager.";
} else {
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        try {
            if (file.size > maxFileSize) {
                throw new Error("Размер файла превышает 32 КБ.");
            }

            const imported = JSON.parse(await file.text());
            if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
                throw new Error("Ожидается JSON-объект с полями sites и sitesBypass.");
            }

            const sites = validateDomains(imported.sites);
            const sitesBypass = validateDomains(imported.sitesBypass);
            const result = await sendImportMessage({
                type: "importSites",
                sites,
                sitesBypass,
            });

            if (!result?.ok) {
                throw new Error(result?.error || "Расширение не подтвердило импорт.");
            }
            importStatus.textContent = `Импорт завершён: ${sites.length} сайтов через прокси, ${sitesBypass.length} в списке исключений.`;
        } catch (error) {
            importStatus.textContent = `Импорт не выполнен: ${error.message}`;
        } finally {
            fileInput.value = "";
        }
    });
}