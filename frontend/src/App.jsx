import { useState, useMemo, useEffect, useRef, useCallback } from "react";

import { ThemeCtx, CurrencyCtx, DARK_THEME, LIGHT_THEME, SUPPORTED_CURRENCIES, FX_DEFAULTS } from "./contexts";
import { DEFAULT_TRADES, CURRENCY_KEY, FX_RATE_KEY, BANNERS, MONTH_NAMES } from "./constants";
import { saveToStorage, loadFromStorage, exportJournal, loadAccounts, saveAccounts, loadAccDetails, saveAccDetails, loadCustomOpts, saveCustomOpts, loadFolders, saveFolders } from "./utils/storage";

import ImportChoiceModal  from "./components/modals/ImportChoiceModal";
import ImportAccountModal from "./components/modals/ImportAccountModal";
import ImportModal        from "./components/modals/ImportModal";
import AddModal           from "./components/modals/AddModal";
import FolderSuggestToast from "./components/FolderSuggestToast";
import Toast              from "./components/Toast";
import { Logo }           from "./components/common";

import DashboardPage  from "./pages/DashboardPage";
import TradesPage     from "./pages/TradesPage";
import AnalyticsPage  from "./pages/AnalyticsPage";
import TimePage       from "./pages/TimePage";
import RiskPage       from "./pages/RiskPage";
import DisciplinePage from "./pages/DisciplinePage";
import CalendarPage   from "./pages/CalendarPage";
import AccountsPage   from "./pages/AccountsPage";
import SettingsPage   from "./pages/SettingsPage";

// ── Mutable theme vars ────────────────────────────────────────────────────────
// Updated every render in App; read by pages/components as module-scope vars.
let BG="#0e0e0e",CARD="#181818",CARD2="#1e1e1e",BORDER="#2a2a2a",
    GREEN="#2ecc71",RED="#ff6b6b",CYAN="#00d4ff",YELLOW="#f5c842",
    WHITE="#f0f0f0",MUTED="#666",SUBBG="#161616",BLUE="#4a90d9";

export default function App() {
  const [trades,        setTrades]        = useState(()=>loadFromStorage()||null);
  const [accounts,      setAccounts]      = useState(()=>loadAccounts());
  const [accDetails,    setAccDetails]    = useState(()=>loadAccDetails());
  const [activeAccount, setActiveAccount] = useState("All accounts");
  const [analyticsAccount, setAnalyticsAccount] = useState("All accounts");
  const [page,          setPage]          = useState("dashboard");
  const [showModal,     setShowModal]     = useState(false);
  // importMode: null | "choice" | "settings" | "account"
  const [importMode,    setImportMode]    = useState(()=>loadFromStorage()===null?"settings":null);
  const [toast,         setToast]         = useState(null);
  const [filters,       setFilters]       = useState({symbol:"All",setup:"All",side:"All",status:"All",session:"All",dateFrom:"",dateTo:""});
  const [themeMode,     setThemeMode]     = useState(()=>{ try{return localStorage.getItem("eyzon_theme")||"dark";}catch{return "dark";} });
  const [timezone,      setTimezone]      = useState(()=>{ try{return localStorage.getItem("eyzon_tz")||"UTC";}catch{return "UTC";} });
  const [hourFormat,    setHourFormat]    = useState(()=>{ try{return localStorage.getItem("eyzon_hf")||"24";}catch{return "24";} });
  const [globalCurrency,setGlobalCurrency]= useState(()=>{ try{return localStorage.getItem(CURRENCY_KEY)||"USD";}catch{return "USD";} });
  const [globalFxRate,  setGlobalFxRate]  = useState(()=>{ try{return parseFloat(localStorage.getItem(FX_RATE_KEY))||1;}catch{return 1;} });
  const [folderSuggestTrade, setFolderSuggestTrade] = useState(null);
  const [folders, setFolders] = useState(()=>loadFolders());
  const [accModalOpen, setAccModalOpen] = useState(false);

  // Keep folders in sync when TradesPage updates them
  const handleFoldersChange = useCallback((updated) => {
    setFolders(updated);
    saveFolders(updated);
  }, []);

  const _th = themeMode==="light" ? LIGHT_THEME : DARK_THEME;
  BG=_th.BG; CARD=_th.CARD; CARD2=_th.CARD2; BORDER=_th.BORDER;
  GREEN=_th.GREEN; RED=_th.RED; CYAN=_th.CYAN; YELLOW=_th.YELLOW;
  WHITE=_th.WHITE; MUTED=_th.MUTED; SUBBG=_th.SUBBG; BLUE=_th.BLUE;

  // Currency context value — memoised so children don't re-render on unrelated state
  const currencyInfo = SUPPORTED_CURRENCIES.find(c=>c.code===globalCurrency)||SUPPORTED_CURRENCIES[0];
  const currencyCtxValue = useMemo(()=>{
    const sym   = currencyInfo.symbol;
    const rate  = globalFxRate;
    const fmt   = (usdVal, decimals=2) => {
      const local = usdVal * rate;
      return `${sym}${local.toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals})}`;
    };
    const fmtN  = (usdVal, decimals=2) => (usdVal * rate).toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
    const toLocal = (usdVal) => usdVal * rate;
    return { currency:globalCurrency, symbol:sym, fxRate:rate, fmt, fmtN, toLocal, isNonUSD: globalCurrency!=="USD" };
  },[globalCurrency, globalFxRate]);

  useEffect(()=>{ if(trades!==null) saveToStorage(trades); },[trades]);
  useEffect(()=>{ saveAccounts(accounts); },[accounts]);

  const handleImport = useCallback((preview)=>{
    setTrades(preview.trades);
    if (preview.accounts && preview.accounts.length) {
      setAccounts(preview.accounts);
      saveAccounts(preview.accounts);
    }
    if (preview.customOpts && Object.keys(preview.customOpts).length) {
      saveCustomOpts(preview.customOpts);
    }
    setImportMode(null);
    const hasSettings = preview.accounts || preview.customOpts;
    setToast(`✅ Imported ${preview.trades.length} trades${hasSettings ? " + settings" : ""}`);
  },[]);

  // Merge an imported file as a new account — adds trades, creates folder
  const handleMergeAccount = useCallback((preview, folderName)=>{
    const baseId = Date.now();
    const newTrades = preview.trades.map((t,i)=>({...t, id: baseId+i}));
    // Add any new accounts that don't already exist
    if(preview.accounts && preview.accounts.length) {
      setAccounts(prev=>{
        const merged = [...prev];
        preview.accounts.forEach(a=>{ if(!merged.includes(a)) merged.push(a); });
        saveAccounts(merged);
        return merged;
      });
    }
    // Merge trades
    setTrades(prev=>[...(prev||[]), ...newTrades]);
    // Create folder with imported trades
    const newFolder = { id: baseId+"_folder", name: folderName, tradeIds: newTrades.map(t=>t.id) };
    setFolders(prev=>{
      const updated = [...prev, newFolder];
      saveFolders(updated);
      return updated;
    });
    setImportMode(null);
    setToast(`✅ Merged ${newTrades.length} trades → folder "${folderName}"`);
  },[]);

  const handleFresh = useCallback(()=>{
    setTrades(DEFAULT_TRADES);
    setImportMode(null);
  },[]);

  const handleSave = ()=>{
    exportJournal(trades||[], accounts, loadCustomOpts());
    setToast("💾 Journal saved — trades & settings included");
  };

  // filter by active account then by field-filters
  const accountFiltered = useMemo(()=>(trades||[]).filter(t=>activeAccount==="All accounts"||t.account===activeAccount),[trades,activeAccount]);
  const filteredTrades   = useMemo(()=>accountFiltered.filter(t=>
    (filters.symbol==="All"||t.symbol===filters.symbol)&&
    (filters.setup==="All"||t.model===filters.setup)&&
    (filters.side==="All"||t.side===filters.side)&&
    (filters.status==="All"||t.status===filters.status)&&
    (filters.session==="All"||t.session===filters.session)
  ),[accountFiltered,filters]);

  const banner = page==="analytics"?BANNERS.analytics:page==="time"?BANNERS.time:null;

  const NAV = [
    ["dashboard","🏠 Dashboard"],["trades","📋 Trades"],["analytics","📊 Analytics"],
    ["accounts","🏦 Accounts"],["settings","⚙️ Settings"],
  ];

  if (importMode==="settings") return <ImportModal onImport={handleImport} onFresh={handleFresh}/>;
  if (importMode==="choice")  return (
    <ThemeCtx.Provider value={_th}><CurrencyCtx.Provider value={currencyCtxValue}>
      <ImportChoiceModal
        onImportSettings={()=>setImportMode("settings")}
        onImportAccount={()=>setImportMode("account")}
        onClose={()=>setImportMode(null)}
      />
    </CurrencyCtx.Provider></ThemeCtx.Provider>
  );
  if (importMode==="account") return (
    <ThemeCtx.Provider value={_th}><CurrencyCtx.Provider value={currencyCtxValue}>
      <ImportAccountModal
        onMerge={handleMergeAccount}
        onClose={()=>setImportMode(null)}
      />
    </CurrencyCtx.Provider></ThemeCtx.Provider>
  );
  return (
    <ThemeCtx.Provider value={_th}>
    <CurrencyCtx.Provider value={currencyCtxValue}>
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${BG};color:${WHITE};font-family:'Inter',sans-serif;width:100%}
        html,#root{width:100%;min-height:100vh}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:${BG}}
        ::-webkit-scrollbar-thumb{background:${BORDER};border-radius:2px}
        select option{background:${CARD}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes folderToastShrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
        .fade{animation:fadeIn 0.2s ease}
        input[type=checkbox]{cursor:pointer}
      `}</style>

      <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column"}}>
        {/* Nav */}
        <div {...((showModal||accModalOpen) ? {inert:""} : {})} style={{padding:"0 14px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:_th.NAV_BG,position:"sticky",top:0,zIndex:50,height:44,flexShrink:0,boxShadow:themeMode==="light"?"0 1px 6px rgba(0,0,0,0.07)":"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",marginRight:10}} onClick={()=>setPage("dashboard")}>
            <Logo size={22}/>
            <span style={{fontSize:12,fontWeight:700,color:WHITE,letterSpacing:"0.04em"}}>EyZonCharts</span>
          </div>
          <div style={{display:"flex",gap:1,alignItems:"center",flex:1}}>
            {NAV.map(([p,l])=>(
              <button key={p} onClick={()=>setPage(p)} style={{background:page===p?themeMode==="light"?"rgba(0,0,0,0.05)":"#1a1a1a":"transparent",border:"none",cursor:"pointer",padding:"4px 9px",borderRadius:5,fontSize:11,fontWeight:500,color:page===p?GREEN:MUTED,borderBottom:page===p?`2px solid ${GREEN}`:"2px solid transparent",transition:"all 0.15s"}}>{l}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {Object.values(filters).some(v=>v!=="All"&&v!=="")&&(
              <span style={{fontSize:10,color:GREEN,background:GREEN+"14",border:`1px solid ${GREEN}33`,borderRadius:10,padding:"2px 9px",cursor:"pointer"}} onClick={()=>setFilters({symbol:"All",setup:"All",side:"All",status:"All",session:"All",dateFrom:"",dateTo:""})}>
                🔍 {Object.values(filters).filter(v=>v!=="All"&&v!=="").length} filter{Object.values(filters).filter(v=>v!=="All"&&v!=="").length>1?"s":""} ✕
              </span>
            )}
            <button onClick={()=>setImportMode(trades&&trades.length>0?"choice":"settings")} style={{background:"transparent",border:`1px solid ${BORDER}`,borderRadius:6,padding:"4px 10px",color:MUTED,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=MUTED;e.currentTarget.style.color=WHITE;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.color=MUTED;}}>
              📂 Import
            </button>
            <button onClick={handleSave} style={{background:"transparent",border:`1px solid ${GREEN}55`,borderRadius:6,padding:"4px 10px",color:GREEN,fontSize:11,cursor:"pointer",fontFamily:"inherit",fontWeight:600,transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=GREEN+"14";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
              💾 Save Journal
            </button>
            <button onClick={()=>setShowModal(true)} style={{background:GREEN,border:"none",borderRadius:6,padding:"5px 11px",color:themeMode==="light"?"#fff":"#061306",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Add Trade</button>
          </div>
        </div>

        <div className="fade" key={page} style={{flex:1,width:"100%",overflow:"auto"}} {...((showModal||accModalOpen) ? {inert:""} : {})}>
          {page==="dashboard"  && <DashboardPage  trades={trades||[]} accounts={accounts} activeAccount={activeAccount} setActiveAccount={setActiveAccount} setPage={setPage} accDetails={accDetails}/>}
          {page==="trades"     && <TradesPage     trades={accountFiltered} setTrades={setTrades} filters={filters} setFilters={setFilters} setShowModal={setShowModal} folders={folders} onFoldersChange={handleFoldersChange} hourFormat={hourFormat} accDetails={accDetails}/>}
          {page==="analytics"  && <AnalyticsPage  trades={filteredTrades} setPage={setPage} accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount} accDetails={accDetails}/>}
          {page==="time"       && <TimePage       trades={filteredTrades} setPage={setPage} accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount} hourFormat={hourFormat}/>}
          {page==="risk"       && <RiskPage       trades={filteredTrades} setPage={setPage} accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount} accDetails={accDetails}/>}
          {page==="discipline" && <DisciplinePage trades={filteredTrades} setPage={setPage} accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount}/>}
          {page==="calendar"   && <CalendarPage   trades={filteredTrades} setPage={setPage} accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount} hourFormat={hourFormat}/>}
          {page==="accounts"   && <AccountsPage   trades={trades||[]} accounts={accounts} setAccounts={setAccounts} accDetails={accDetails} setAccDetails={setAccDetails} onModalOpen={()=>setAccModalOpen(true)} onModalClose={()=>setAccModalOpen(false)}/>}
          {page==="settings"   && <SettingsPage   themeMode={themeMode} setThemeMode={setThemeMode} timezone={timezone} setTimezone={setTimezone} hourFormat={hourFormat} setHourFormat={setHourFormat} globalCurrency={globalCurrency} setGlobalCurrency={setGlobalCurrency} globalFxRate={globalFxRate} setGlobalFxRate={setGlobalFxRate}/>}
        </div>
      </div>

      {showModal&&<AddModal
        onClose={()=>setShowModal(false)}
        accounts={accounts}
        setAccounts={setAccounts}
        timezone={timezone}
        hourFormat={hourFormat}
        trades={trades||[]}
        onAdd={t=>{
          const newTrade = {...t,id:Date.now()};
          setTrades(ts=>[...ts,newTrade]);
          if(folders.length>0) setFolderSuggestTrade(newTrade);
        }}
      />}
      {folderSuggestTrade&&(
        <FolderSuggestToast
          trade={folderSuggestTrade}
          folders={folders}
          onAddToFolder={(folderId, tradeId)=>{
            const updated = folders.map(f=>
              f.id===folderId
                ? {...f, tradeIds:[...(f.tradeIds||[]).filter(id=>id!==tradeId), tradeId]}
                : f
            );
            handleFoldersChange(updated);
          }}
          onDismiss={()=>setFolderSuggestTrade(null)}
        />
      )}
      {toast&&<Toast message={toast} onDone={()=>setToast(null)}/>}
    </>
    </CurrencyCtx.Provider>
    </ThemeCtx.Provider>
  );
}

