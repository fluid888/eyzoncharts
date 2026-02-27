
export const STORAGE_KEY    = "eyzoncharts_journal_v1";
export const ACCOUNTS_KEY   = "eyzoncharts_accounts_v1";
export const ACC_DETAILS_KEY = "eyzoncharts_acc_details_v1";
export const CUSTOM_OPTS_KEY = "eyzoncharts_custom_opts_v1";
export const FOLDERS_KEY    = "eyzoncharts_folders_v1";
export const CURRENCY_KEY   = "eyzon_currency";
export const FX_RATE_KEY    = "eyzon_fxrate";
export const FILE_EXT       = ".eyzon";
export const MONTH_NAMES    = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export const BANNERS = {
  analytics: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/The_Great_Wave_off_Kanagawa.jpg/1200px-The_Great_Wave_off_Kanagawa.jpg",
  time:      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Fuji_from_Hokusai_album.jpg/1200px-Fuji_from_Hokusai_album.jpg",
};

export const DEFAULT_TRADES = [
  { id:1,  account:"Demo Account",  date:"2026-01-08", closeDate:"2026-01-08", symbol:"XAU/USD", side:"Long",  model:"REVERSAL",  session:"London",   entry:2890.00, exit:2921.00, size:0.5, cost:1445.00, pnl:310,  pnlPct:0.36,  rr:2.4,  followed:true,  mistake:"",             tags:["well-managed","perfect-entry"], hour:"7-8am",   status:"WIN"  },
  { id:2,  account:"Demo Account",  date:"2026-01-08", closeDate:"2026-01-08", symbol:"USDJPY",  side:"Short", model:"BREAKOUT",  session:"New York",  entry:155.20,  exit:155.82, size:2.0, cost:310.40,  pnl:-120, pnlPct:-0.48, rr:-1.0, followed:false, mistake:"fomo",         tags:["overtraded"],                   hour:"1-2am",   status:"LOSS" },
  { id:3,  account:"Demo Account",  date:"2026-01-13", closeDate:"2026-01-13", symbol:"XAU/USD", side:"Long",  model:"REVERSAL",  session:"London",   entry:2870.00, exit:2918.00, size:0.5, cost:1435.00, pnl:470,  pnlPct:1.33,  rr:3.1,  followed:true,  mistake:"",             tags:["well-managed"],                 hour:"7-8am",   status:"WIN"  },
  { id:4,  account:"Demo Account",  date:"2026-01-14", closeDate:"2026-01-14", symbol:"EURUSD",  side:"Long",  model:"REVERSAL",  session:"London",   entry:1.0410,  exit:1.0480, size:3.0, cost:3123.00, pnl:420,  pnlPct:2.42,  rr:2.8,  followed:true,  mistake:"",             tags:["perfect-entry"],                hour:"2-3am",   status:"WIN"  },
  { id:5,  account:"Live Account",  date:"2026-01-14", closeDate:"2026-01-14", symbol:"XAU/USD", side:"Short", model:"FOMO",      session:"New York",  entry:2930.00, exit:2905.00, size:0.5, cost:1465.00, pnl:250,  pnlPct:0.83,  rr:1.8,  followed:true,  mistake:"",             tags:["well-managed","perfect-entry"], hour:"11-12pm", status:"WIN"  },
  { id:6,  account:"Live Account",  date:"2026-01-15", closeDate:"2026-01-15", symbol:"USDJPY",  side:"Long",  model:"RSI CROSS", session:"New York",  entry:154.80,  exit:154.48, size:2.0, cost:309.60,  pnl:-80,  pnlPct:-0.16, rr:-0.6, followed:false, mistake:"no stop loss", tags:["overtraded"],                   hour:"4-5am",   status:"LOSS" },
  { id:7,  account:"Live Account",  date:"2026-01-15", closeDate:"2026-01-15", symbol:"XAU/USD", side:"Long",  model:"REVERSAL",  session:"London",   entry:2895.00, exit:2940.00, size:0.5, cost:1447.50, pnl:450,  pnlPct:1.68,  rr:2.9,  followed:true,  mistake:"",             tags:["perfect-entry"],                hour:"8-9am",   status:"WIN"  },
  { id:8,  account:"Demo Account",  date:"2026-01-16", closeDate:"2026-01-16", symbol:"EURUSD",  side:"Short", model:"REVERSAL",  session:"London",   entry:1.0490,  exit:1.0420, size:3.0, cost:3147.00, pnl:420,  pnlPct:0.94,  rr:2.5,  followed:true,  mistake:"",             tags:["well-managed"],                 hour:"7-8am",   status:"WIN"  },
  { id:9,  account:"Demo Account",  date:"2026-01-16", closeDate:"2026-01-16", symbol:"XAU/USD", side:"Long",  model:"REVERSAL",  session:"New York",  entry:2910.00, exit:2955.00, size:0.5, cost:1455.00, pnl:450,  pnlPct:3.00,  rr:3.0,  followed:true,  mistake:"",             tags:["well-managed","perfect-entry"], hour:"2-3am",   status:"WIN"  },
  { id:10, account:"Live Account",  date:"2026-01-19", closeDate:"2026-01-19", symbol:"USDJPY",  side:"Short", model:"BREAKOUT",  session:"London",   entry:156.10,  exit:156.38, size:2.0, cost:312.20,  pnl:-50,  pnlPct:-0.55, rr:-0.5, followed:false, mistake:"greed",        tags:["overtraded"],                   hour:"1-2am",   status:"LOSS" },
  { id:11, account:"Live Account",  date:"2026-01-19", closeDate:"2026-01-19", symbol:"XAU/USD", side:"Long",  model:"REVERSAL",  session:"London",   entry:2880.00, exit:2945.00, size:0.5, cost:1440.00, pnl:650,  pnlPct:4.60,  rr:4.1,  followed:true,  mistake:"",             tags:["perfect-entry"],                hour:"7-8am",   status:"WIN"  },
  { id:12, account:"Demo Account",  date:"2026-02-14", closeDate:"2026-02-14", symbol:"XAU/USD", side:"Long",  model:"REVERSAL",  session:"London",   entry:2960.00, exit:3010.00, size:0.5, cost:1480.00, pnl:500,  pnlPct:3.38,  rr:3.5,  followed:true,  mistake:"",             tags:["well-managed","perfect-entry"], hour:"7-8am",   status:"WIN"  },
  { id:13, account:"Live Account",  date:"2026-02-18", closeDate:"2026-02-18", symbol:"EURUSD",  side:"Long",  model:"REVERSAL",  session:"London",   entry:1.0450,  exit:1.0510, size:3.0, cost:3135.00, pnl:480,  pnlPct:1.53,  rr:2.8,  followed:true,  mistake:"",             tags:["perfect-entry"],                hour:"2-3am",   status:"WIN"  },
];

export const SESSION_COLORS = { London:"#6eb5ff", "New York":"#e07be0", Asia:"#f5c842" };

export const SESSION_DEF = {
  Asia:       { icon:"🌏", color:"#f5c842", abbr:"AS" },
  London:     { icon:"🇬🇧", color:"#6eb5ff", abbr:"LN" },
  "New York": { icon:"🗽", color:"#e07be0", abbr:"NY" },
};

export const ACC_COLORS = ["#4a90d9","#2ecc71","#f5c842","#e07be0","#ff6b6b","#00d4ff","#ff9f43","#a29bfe"];
export const ACC_TYPES  = ["Demo","Live","Prop Firm","Paper"];
export const FX_BASE_RATES = { USD:1, EUR:0.92, GBP:0.79, JPY:149.5, CHF:0.90, AUD:1.53, CAD:1.36, PLN:4.02 };

export const TIMEZONES_MAIN = [
  { tz:"UTC",               label:"UTC",      flag:"🌐", offset:"UTC ±0",  city:"Universal"  },
  { tz:"America/New_York",  label:"New York", flag:"🗽", offset:"UTC −5",  city:"EST / EDT"  },
  { tz:"Europe/London",     label:"London",   flag:"🇬🇧", offset:"UTC ±0",  city:"GMT / BST"  },
  { tz:"Asia/Tokyo",        label:"Tokyo",    flag:"🇯🇵", offset:"UTC +9",  city:"JST"        },
];
