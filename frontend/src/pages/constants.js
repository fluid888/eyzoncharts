// constants.js
// ─────────────────────────────────────────────────────────────────────────────
// All magic strings, localStorage keys, default data, and lookup tables
// previously scattered across App.jsx, storage.js, CalendarPage.jsx etc.
// Centralised here so they can be changed or tested in one place.
// ─────────────────────────────────────────────────────────────────────────────


// ── localStorage keys ────────────────────────────────────────────────────────
export const STORAGE_KEY      = "eyzon_trades";
export const ACCOUNTS_KEY     = "eyzon_accounts";
export const ACC_DETAILS_KEY  = "eyzon_acc_details";
export const CUSTOM_OPTS_KEY  = "eyzon_custom_opts";
export const FOLDERS_KEY      = "eyzon_folders";
export const CURRENCY_KEY     = "eyzon_currency";
export const FX_RATE_KEY      = "eyzon_fx_rate";

// ── Export file extension ─────────────────────────────────────────────────────
export const FILE_EXT = ".eyzon";

// ── Calendar / date helpers ───────────────────────────────────────────────────
export const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ── Session colours (used by CalendarPage heatmap) ───────────────────────────
export const SESSION_COLORS = {
  London:  "#4a90d9",
  NY:      "#2ecc71",
  Asian:   "#f5c842",
  London_NY: "#00d4ff",
  Unknown: "#666666",
};

// ── Analytics page banner text ────────────────────────────────────────────────
export const BANNERS = {
  analytics: "📊 Deep-dive into your edge. Stats update live as you filter.",
  time:      "🕐 Discover when your edge is strongest.",
};

// ── Demo / default trades (shown on first launch, before import) ──────────────
export const DEFAULT_TRADES = [
  { id:1,  date:"2024-01-03", symbol:"EUR/USD", side:"Long",  pnl: 120,  model:"BOS",     session:"London",    account:"Demo Account", status:"Win",  risk_dollars:100 },
  { id:2,  date:"2024-01-04", symbol:"GBP/USD", side:"Short", pnl:-80,   model:"OB",      session:"NY",        account:"Demo Account", status:"Loss", risk_dollars:100 },
  { id:3,  date:"2024-01-05", symbol:"EUR/USD", side:"Long",  pnl: 200,  model:"BOS",     session:"London",    account:"Demo Account", status:"Win",  risk_dollars:100 },
  { id:4,  date:"2024-01-08", symbol:"USD/JPY", side:"Short", pnl:-100,  model:"FVG",     session:"Asian",     account:"Demo Account", status:"Loss", risk_dollars:100 },
  { id:5,  date:"2024-01-09", symbol:"EUR/USD", side:"Long",  pnl: 150,  model:"OB",      session:"London",    account:"Demo Account", status:"Win",  risk_dollars:100 },
  { id:6,  date:"2024-01-10", symbol:"GBP/USD", side:"Long",  pnl: 300,  model:"BOS",     session:"London_NY", account:"Demo Account", status:"Win",  risk_dollars:100 },
  { id:7,  date:"2024-01-11", symbol:"NAS100",  side:"Long",  pnl:-150,  model:"FVG",     session:"NY",        account:"Demo Account", status:"Loss", risk_dollars:150 },
  { id:8,  date:"2024-01-12", symbol:"NAS100",  side:"Short", pnl: 450,  model:"BOS",     session:"NY",        account:"Demo Account", status:"Win",  risk_dollars:150 },
  { id:9,  date:"2024-01-15", symbol:"EUR/USD", side:"Short", pnl:-120,  model:"OB",      session:"London",    account:"Demo Account", status:"Loss", risk_dollars:100 },
  { id:10, date:"2024-01-16", symbol:"GBP/JPY", side:"Long",  pnl: 180,  model:"BOS",     session:"London",    account:"Demo Account", status:"Win",  risk_dollars:100 },
  { id:11, date:"2024-01-17", symbol:"EUR/USD", side:"Long",  pnl: 90,   model:"FVG",     session:"London_NY", account:"Demo Account", status:"Win",  risk_dollars:100 },
  { id:12, date:"2024-01-18", symbol:"USD/JPY", side:"Long",  pnl:-200,  model:"OB",      session:"Asian",     account:"Demo Account", status:"Loss", risk_dollars:200 },
];
