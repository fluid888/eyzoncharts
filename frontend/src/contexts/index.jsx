import { createContext, useContext } from "react";

// ── THEMES ───────────────────────────────────────────────────────────────────
export const DARK_THEME  = { BG:"#0e0e0e",CARD:"#181818",CARD2:"#1e1e1e",BORDER:"#2a2a2a",GREEN:"#2ecc71",RED:"#ff6b6b",CYAN:"#00d4ff",YELLOW:"#f5c842",WHITE:"#f0f0f0",MUTED:"#666",SUBBG:"#161616",BLUE:"#4a90d9",NAV_BG:"#0e0e0e" };
export const LIGHT_THEME = { BG:"#f0f3f8",CARD:"#ffffff",CARD2:"#f5f7fa",BORDER:"#dde3ed",GREEN:"#16a34a",RED:"#e63946",CYAN:"#7c3aed",YELLOW:"#f59e0b",WHITE:"#0f172a",MUTED:"#64748b",SUBBG:"#f8f9fb",BLUE:"#3b82f6",NAV_BG:"#ffffff" };

export const ThemeCtx = createContext(DARK_THEME);
export const useTheme = () => useContext(ThemeCtx);

// ── CURRENCY ─────────────────────────────────────────────────────────────────
export const SUPPORTED_CURRENCIES = [
  { code:"USD", symbol:"$",  flag:"🇺🇸", name:"US Dollar"        },
  { code:"EUR", symbol:"€",  flag:"🇪🇺", name:"Euro"              },
  { code:"GBP", symbol:"£",  flag:"🇬🇧", name:"British Pound"     },
  { code:"JPY", symbol:"¥",  flag:"🇯🇵", name:"Japanese Yen"      },
  { code:"CHF", symbol:"Fr", flag:"🇨🇭", name:"Swiss Franc"       },
  { code:"AUD", symbol:"A$", flag:"🇦🇺", name:"Australian Dollar" },
  { code:"CAD", symbol:"C$", flag:"🇨🇦", name:"Canadian Dollar"   },
  { code:"PLN", symbol:"zł", flag:"🇵🇱", name:"Polish Złoty"      },
];
export const FX_DEFAULTS = { USD:1, EUR:0.92, GBP:0.79, JPY:149.5, CHF:0.90, AUD:1.53, CAD:1.36, PLN:4.02 };

export const CurrencyCtx = createContext({ currency:"USD", symbol:"$", fxRate:1, fmt:(v,d=2)=>`$${v.toFixed(d)}` });
export const useCurrency = () => useContext(CurrencyCtx);
