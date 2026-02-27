# EyZonCharts — Project Structure

Refactored from a single 5,667-line `App.jsx` into a proper module structure.

```
src/
├── main.jsx                    ← entry point (unchanged)
├── index.css                   ← global styles (unchanged)
├── App.jsx                     ← root component, routing, global state
│
├── contexts/
│   └── index.jsx               ← ThemeCtx, CurrencyCtx, useTheme, useCurrency
│
├── constants/
│   └── index.js                ← all keys, DEFAULT_TRADES, BANNERS, MONTH_NAMES
│
├── utils/
│   ├── storage.js              ← localStorage helpers (save/load all entities)
│   └── mcEngine.js             ← entire Monte Carlo simulation engine
│
├── components/
│   ├── common.jsx              ← Logo, CT tooltip, Breadcrumb, StatRow, MiniStat, ManageableSelect
│   ├── Toast.jsx               ← toast notification
│   ├── SessionTimePicker.jsx   ← time/session selector used in AddModal
│   ├── AccountFilterBar.jsx    ← account switcher used across analytics pages
│   ├── FolderSuggestToast.jsx  ← post-trade folder suggestion popup
│   └── modals/
│       ├── index.js            ← barrel export for all modals
│       ├── ImportChoiceModal.jsx
│       ├── ImportAccountModal.jsx
│       ├── ImportModal.jsx
│       ├── AddModal.jsx        ← add/edit trade form
│       ├── AccountDetailModal.jsx
│       ├── CreateFolderModal.jsx
│       └── DeleteConfirm.jsx
│
└── pages/
    ├── index.js                ← barrel export for all pages
    ├── DashboardPage.jsx
    ├── TradesPage.jsx
    ├── AnalyticsPage.jsx
    ├── TimePage.jsx
    ├── RiskPage.jsx            ← largest page; contains MC UI + Kelly sweep
    ├── DisciplinePage.jsx
    ├── CalendarPage.jsx        ← includes DayView + CandlestickChart helpers
    ├── AccountsPage.jsx
    └── SettingsPage.jsx
```

## What changed vs the original file

| Before | After |
|--------|-------|
| 1 file, 5,667 lines | 28 files, largest is ~1,300 lines (RiskPage) |
| No imports | Each file imports only what it needs |
| Global mutable vars (`BG`, `CARD`...) | Passed via `ThemeCtx` context |
| Everything in one scope | Clear separation: contexts / utils / components / pages |

## Next steps (when you add the Python backend)

```
eyzoncharts/
├── frontend/   ← this src/ folder
└── backend/
    ├── main.py              ← FastAPI app
    ├── mc_interpreter.py    ← your existing file (unchanged)
    └── routers/
        └── simulation.py    ← POST /api/simulate endpoint
```

The `RiskPage.jsx` currently runs Monte Carlo in the browser.
When you're ready, replace `runMonteCarloAsync()` calls in `RiskPage.jsx`
with a `fetch("/api/simulate", { method:"POST", body: JSON.stringify(cfg) })`
call and your Python backend takes over the heavy lifting.
