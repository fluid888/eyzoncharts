import { STORAGE_KEY, ACCOUNTS_KEY, ACC_DETAILS_KEY, CUSTOM_OPTS_KEY, FOLDERS_KEY, FILE_EXT } from "../constants";

function saveToStorage(trades) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); } catch(e) {}
}
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { const d = JSON.parse(raw); if (Array.isArray(d)) return d; }
  } catch(e) {}
  return null;
}
function exportJournal(trades, accounts, customOpts) {
  const payload = {
    version: 2,
    exported: new Date().toISOString(),
    trades,
    settings: {
      accounts:   accounts   || [],
      customOpts: customOpts || {},
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const date = new Date().toISOString().slice(0,10);
  a.href     = url;
  a.download = `EyZonCharts_${date}${FILE_EXT}`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadAccounts() {
  try { const r = localStorage.getItem(ACCOUNTS_KEY); if(r) return JSON.parse(r); } catch(e) {}
  return ["Demo Account","Live Account"];
}
function saveAccounts(accounts) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); } catch(e) {}
}
function loadAccDetails() {
  try { const r = localStorage.getItem(ACC_DETAILS_KEY); if(r) return JSON.parse(r); } catch(e) {}
  return {
    "Demo Account": { balance: 10000, broker: "MetaTrader 5", currency: "USD", type: "Demo", color: "#4a90d9", note: "" },
    "Live Account": { balance: 5000,  broker: "cTrader",      currency: "USD", type: "Live", color: "#2ecc71", note: "" },
  };
}
function saveAccDetails(details) {
  try { localStorage.setItem(ACC_DETAILS_KEY, JSON.stringify(details)); } catch(e) {}
}
function loadCustomOpts() {
  try { const r = localStorage.getItem(CUSTOM_OPTS_KEY); if(r) return JSON.parse(r); } catch(e) {}
  return {};
}
function saveCustomOpts(opts) {
  try { localStorage.setItem(CUSTOM_OPTS_KEY, JSON.stringify(opts)); } catch(e) {}
}
function loadFolders() {
  try { const r = localStorage.getItem(FOLDERS_KEY); if(r) return JSON.parse(r); } catch(e) {}
  return [];
}
function saveFolders(folders) {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders)); } catch(e) {}
}



export { saveToStorage, loadFromStorage, exportJournal, loadAccounts, saveAccounts, loadAccDetails, saveAccDetails, loadCustomOpts, saveCustomOpts, loadFolders, saveFolders };
