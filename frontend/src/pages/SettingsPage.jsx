import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency, SUPPORTED_CURRENCIES, FX_DEFAULTS } from "../contexts";
import { CURRENCY_KEY, FX_RATE_KEY, TIMEZONES_MAIN } from "../constants";
import { saveCustomOpts, loadCustomOpts } from "../utils/storage";

function SettingsSection({ title, icon, children, th }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{background:th.CARD,border:`1px solid ${th.BORDER}`,borderRadius:14,marginBottom:10,overflow:"hidden",transition:"all 0.2s"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",cursor:"pointer",userSelect:"none"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:16}}>{icon}</span>
          <span style={{fontSize:13,fontWeight:700,color:th.WHITE}}>{title}</span>
        </div>
        <span style={{fontSize:11,color:th.MUTED,transition:"transform 0.2s",display:"inline-block",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
      </div>
      {open && (
        <div style={{padding:"0 20px 20px",borderTop:`1px solid ${th.BORDER}`}}>
          <div style={{height:16}}/>
          {children}
        </div>
      )}
    </div>
  );
}

function SettingsPage({ themeMode, setThemeMode, timezone, setTimezone, hourFormat, setHourFormat, globalCurrency, setGlobalCurrency, globalFxRate, setGlobalFxRate }) {
  const th = useTheme();
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = th;
  const saveTZ  = tz => { setTimezone(tz);  try{localStorage.setItem("eyzon_tz",tz);}catch(e){} };
  const saveThm = tm => { setThemeMode(tm); try{localStorage.setItem("eyzon_theme",tm);}catch(e){} };
  const saveHF  = hf => { setHourFormat(hf);try{localStorage.setItem("eyzon_hf",hf);}catch(e){} };
  const saveCur = (code) => {
    setGlobalCurrency(code);
    try{localStorage.setItem(CURRENCY_KEY,code);}catch(e){}
    // Auto-set default rate when switching currency
    const defRate = FX_DEFAULTS[code]||1;
    setGlobalFxRate(defRate);
    try{localStorage.setItem(FX_RATE_KEY, String(defRate));}catch(e){}
  };
  const saveFxRate = (r) => {
    const v = parseFloat(r)||1;
    setGlobalFxRate(v);
    try{localStorage.setItem(FX_RATE_KEY,String(v));}catch(e){}
  };

  const liveTime = tz => {
    try { return new Date().toLocaleTimeString("en-US",{timeZone:tz,hour:"2-digit",minute:"2-digit",hour12:hourFormat==="12"}); }
    catch{ return ""; }
  };

  // Timezone custom entries stored in localStorage
  const [customTZs, setCustomTZs] = useState(()=>{
    try{ const r=localStorage.getItem("eyzon_custom_tzs"); return r?JSON.parse(r):[]; }catch{return [];}
  });
  const [addingTZ,  setAddingTZ]  = useState(false);
  const [newTZName, setNewTZName] = useState("");
  const [newTZIana, setNewTZIana] = useState("");
  const [tzError,   setTZError]   = useState("");

  const saveCustomTZs = list => {
    setCustomTZs(list);
    try{localStorage.setItem("eyzon_custom_tzs",JSON.stringify(list));}catch(e){}
  };

  const addCustomTZ = () => {
    const name = newTZName.trim();
    const iana = newTZIana.trim();
    if(!name){setTZError("Name is required");return;}
    if(!iana){setTZError("Timezone identifier is required");return;}
    try{ new Date().toLocaleTimeString("en-US",{timeZone:iana}); }
    catch{ setTZError("Invalid IANA timezone (e.g. Asia/Dubai)"); return; }
    const entry = {tz:iana,label:name,flag:"🕐",offset:"",city:"custom"};
    saveCustomTZs([...customTZs,entry]);
    setNewTZName(""); setNewTZIana(""); setAddingTZ(false); setTZError("");
    saveTZ(iana);
  };

  const removeCustomTZ = (tz) => {
    const updated = customTZs.filter(t=>t.tz!==tz);
    saveCustomTZs(updated);
    if(timezone===tz) saveTZ("UTC");
  };

  const allTZs = [...TIMEZONES_MAIN, ...customTZs];

  const inp = {
    background: th.CARD2,
    border:`1px solid ${th.BORDER}`,
    borderRadius:7,
    color:th.WHITE,
    padding:"8px 11px",
    fontSize:12,
    outline:"none",
    fontFamily:"inherit",
    width:"100%",
    boxSizing:"border-box",
  };

  return (
    <div style={{padding:"28px 22px 60px",maxWidth:560,margin:"0 auto"}}>
      <h1 style={{margin:"0 0 20px",fontSize:17,fontWeight:800,color:th.WHITE}}>⚙️ Settings</h1>
      <p style={{fontSize:11,color:th.MUTED,marginBottom:20}}>Click a section to expand its settings.</p>

      {/* ── Appearance ── */}
      <SettingsSection title="Appearance" icon="🎨" th={th}>
        <div style={{fontSize:11,color:th.MUTED,marginBottom:12}}>Switch between dark and light interface themes</div>
        <div style={{display:"flex",gap:8}}>
          {[
            {mode:"dark", icon:"🌙",label:"Dark",  preview:["#0e0e0e","#181818","#2ecc71"]},
            {mode:"light",icon:"🌸",label:"Light", preview:["#f0f3f8","#ffffff","#ff2d78"]},
          ].map(({mode,icon,label,preview})=>{
            const active=themeMode===mode;
            return (
              <div key={mode} onClick={()=>saveThm(mode)} style={{
                flex:1,border:`2px solid ${active?th.GREEN:th.BORDER}`,borderRadius:10,padding:"12px 14px",
                cursor:"pointer",background:active?th.GREEN+"10":th.CARD2,transition:"all 0.16s",position:"relative",
                display:"flex",alignItems:"center",gap:10}}>
                {active&&<span style={{position:"absolute",top:6,right:8,fontSize:9,color:th.GREEN,fontWeight:700,background:th.GREEN+"18",borderRadius:20,padding:"1px 6px"}}>✓</span>}
                <span style={{fontSize:18}}>{icon}</span>
                <div>
                  <div style={{display:"flex",gap:3,marginBottom:5}}>
                    {preview.map((c,i)=><div key={i} style={{width:i===0?20:i===1?14:10,height:10,borderRadius:3,background:c,border:"1px solid rgba(0,0,0,0.1)"}}/>)}
                  </div>
                  <div style={{fontSize:12,fontWeight:700,color:active?th.GREEN:th.WHITE}}>{label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* ── Currency ── */}
      <SettingsSection title="Currency & FX Rate" icon="💱" th={th}>
        <div style={{fontSize:11,color:th.MUTED,marginBottom:14}}>
          Sets the display currency for all charts, stats and P&L values across the entire app.<br/>
          <span style={{color:th.YELLOW}}>All trades are stored in USD — this converts for display only.</span>
        </div>
        {/* Currency grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
          {SUPPORTED_CURRENCIES.map(({code,symbol,flag,name})=>{
            const active = globalCurrency===code;
            return (
              <div key={code} onClick={()=>saveCur(code)} style={{
                border:`2px solid ${active?th.CYAN:th.BORDER}`,borderRadius:10,padding:"10px 12px",
                cursor:"pointer",background:active?th.CYAN+"10":th.CARD2,transition:"all 0.15s",
                display:"flex",alignItems:"center",gap:9,position:"relative"
              }}>
                {active&&<span style={{position:"absolute",top:5,right:7,fontSize:9,color:th.CYAN,fontWeight:700,background:th.CYAN+"18",borderRadius:20,padding:"1px 5px"}}>✓ active</span>}
                <span style={{fontSize:20,flexShrink:0}}>{flag}</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:active?th.CYAN:th.WHITE}}>{code} <span style={{color:th.MUTED,fontWeight:400}}>({symbol})</span></div>
                  <div style={{fontSize:10,color:th.MUTED}}>{name}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* FX Rate input — shown for non-USD */}
        {globalCurrency!=="USD"&&(
          <div style={{background:th.CARD2,border:`1px solid ${th.CYAN}33`,borderRadius:10,padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:14}}>💱</span>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:th.WHITE}}>Exchange Rate: USD → {globalCurrency}</div>
                <div style={{fontSize:10,color:th.MUTED}}>1 USD = ? {globalCurrency} · update to match live market rate</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <input
                type="number" step="0.0001" min="0.0001"
                value={globalFxRate}
                onChange={e=>saveFxRate(e.target.value)}
                style={{...inp, flex:1, borderColor:th.CYAN+"55", fontFamily:"monospace", fontSize:14, fontWeight:700}}
              />
              <button onClick={()=>saveFxRate(FX_DEFAULTS[globalCurrency]||1)}
                style={{padding:"8px 12px",background:"transparent",border:`1px solid ${th.BORDER}`,borderRadius:7,color:th.MUTED,fontSize:11,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=th.CYAN;e.currentTarget.style.color=th.CYAN;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=th.BORDER;e.currentTarget.style.color=th.MUTED;}}>
                Reset default
              </button>
            </div>
            <div style={{marginTop:8,padding:"7px 10px",background:th.CARD,border:`1px solid ${th.BORDER}`,borderRadius:7,fontSize:11,color:th.WHITE,display:"flex",gap:14}}>
              <span style={{color:th.MUTED}}>Preview:</span>
              <span><span style={{color:th.MUTED}}>$1,000 USD</span> → <span style={{color:th.CYAN,fontWeight:700}}>{(1000*globalFxRate).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} {globalCurrency}</span></span>
              <span><span style={{color:th.MUTED}}>$10,000 USD</span> → <span style={{color:th.CYAN,fontWeight:700}}>{(10000*globalFxRate).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})} {globalCurrency}</span></span>
            </div>
          </div>
        )}
        {globalCurrency==="USD"&&(
          <div style={{padding:"10px 14px",background:th.CARD2,border:`1px solid ${th.BORDER}`,borderRadius:9,fontSize:11,color:th.MUTED}}>
            ✓ Displaying in USD — no conversion needed. Select another currency above to enable FX rate conversion.
          </div>
        )}
      </SettingsSection>

      {/* ── Time Format ── */}
      <SettingsSection title="Time Format" icon="🕐" th={th}>
        <div style={{fontSize:11,color:th.MUTED,marginBottom:12}}>Choose how times are displayed across the app</div>
        <div style={{display:"flex",gap:8}}>
          {[
            {hf:"24",label:"24-hour",example:"13:45"},
            {hf:"12",label:"12-hour",example:"1:45 PM"},
          ].map(({hf,label,example})=>{
            const active=hourFormat===hf;
            return (
              <div key={hf} onClick={()=>saveHF(hf)} style={{
                flex:1,border:`2px solid ${active?th.CYAN:th.BORDER}`,borderRadius:10,padding:"12px 16px",
                cursor:"pointer",background:active?th.CYAN+"10":th.CARD2,transition:"all 0.16s",position:"relative"}}>
                {active&&<span style={{position:"absolute",top:6,right:8,fontSize:9,color:th.CYAN,fontWeight:700,background:th.CYAN+"18",borderRadius:20,padding:"1px 6px"}}>✓</span>}
                <div style={{fontSize:16,fontWeight:800,color:active?th.CYAN:th.MUTED,marginBottom:3}}>{label}</div>
                <div style={{fontSize:11,color:th.WHITE,fontFamily:"monospace"}}>{example}</div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* ── Timezone ── */}
      <SettingsSection title="Timezone" icon="🌍" th={th}>
        <div style={{fontSize:11,color:th.MUTED,marginBottom:12}}>Used for displaying trade times and calendar sessions</div>

        {/* 4 main + custom */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>
          {allTZs.map(({tz,label,flag,offset,city})=>{
            const active=timezone===tz;
            const isCustom=!TIMEZONES_MAIN.find(t=>t.tz===tz);
            return (
              <div key={tz} style={{border:`1px solid ${active?th.GREEN:th.BORDER}`,borderRadius:9,padding:"9px 11px",
                cursor:"pointer",background:active?th.GREEN+"0a":th.CARD2,transition:"all 0.12s",display:"flex",alignItems:"center",gap:7,position:"relative"}}
                onClick={()=>saveTZ(tz)}>
                <span style={{fontSize:16,flexShrink:0}}>{flag}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:active?700:500,color:active?th.GREEN:th.WHITE,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
                  <div style={{display:"flex",gap:4,marginTop:1,flexWrap:"wrap",alignItems:"center"}}>
                    {offset&&<span style={{fontSize:9,fontWeight:600,color:active?th.GREEN:th.CYAN,background:active?th.GREEN+"15":th.CYAN+"12",borderRadius:3,padding:"1px 4px"}}>{offset}</span>}
                    <span style={{fontSize:9,color:th.MUTED}}>{city}</span>
                  </div>
                </div>
                {active&&<span style={{fontSize:12,color:th.GREEN}}>✓</span>}
                {isCustom&&(
                  <span onClick={e=>{e.stopPropagation();removeCustomTZ(tz);}} style={{position:"absolute",top:4,right:6,fontSize:10,color:th.MUTED,cursor:"pointer",lineHeight:1}}
                    title="Remove">✕</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Add custom */}
        {!addingTZ ? (
          <button onClick={()=>{setAddingTZ(true);setTZError("");}} style={{
            width:"100%",padding:"8px",border:`1px dashed ${th.BORDER}`,borderRadius:9,
            background:"transparent",color:th.MUTED,fontSize:12,cursor:"pointer",fontFamily:"inherit",
            transition:"all 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=th.GREEN;e.currentTarget.style.color=th.GREEN;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=th.BORDER;e.currentTarget.style.color=th.MUTED;}}>
            + Add Custom Timezone
          </button>
        ) : (
          <div style={{border:`1px solid ${th.BORDER}`,borderRadius:10,padding:14,background:th.CARD2}}>
            <div style={{fontSize:11,fontWeight:700,color:th.WHITE,marginBottom:10}}>Add Custom Timezone</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div>
                <div style={{fontSize:10,color:th.MUTED,marginBottom:4}}>Display Name</div>
                <input value={newTZName} onChange={e=>setNewTZName(e.target.value)} placeholder="e.g. Dubai" style={inp}/>
              </div>
              <div>
                <div style={{fontSize:10,color:th.MUTED,marginBottom:4}}>IANA Timezone</div>
                <input value={newTZIana} onChange={e=>setNewTZIana(e.target.value)} placeholder="e.g. Asia/Dubai" style={inp}/>
              </div>
            </div>
            {tzError&&<div style={{fontSize:11,color:th.RED,marginBottom:8}}>{tzError}</div>}
            <div style={{display:"flex",gap:7}}>
              <button onClick={addCustomTZ} style={{flex:1,padding:"7px",background:th.GREEN,border:"none",borderRadius:7,color:"#061306",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Add</button>
              <button onClick={()=>{setAddingTZ(false);setTZError("");setNewTZName("");setNewTZIana("");}} style={{flex:1,padding:"7px",background:"transparent",border:`1px solid ${th.BORDER}`,borderRadius:7,color:th.MUTED,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
            </div>
          </div>
        )}

        {/* Live clock */}
        <div style={{marginTop:12,padding:"9px 14px",background:th.CARD2,border:`1px solid ${th.BORDER}`,borderRadius:9,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:th.MUTED}}>Now in</span>
          <span style={{fontSize:11,fontWeight:700,color:th.GREEN}}>{allTZs.find(t=>t.tz===timezone)?.label||timezone}</span>
          <span style={{fontSize:14,fontWeight:800,color:th.WHITE,letterSpacing:"0.06em",fontFamily:"monospace"}}>{liveTime(timezone)}</span>
        </div>
      </SettingsSection>
    </div>
  );
}

export default SettingsPage;
