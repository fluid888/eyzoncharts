import { useState, useEffect, useRef } from "react";
import { useTheme, useCurrency } from "../contexts";
import { loadCustomOpts, saveCustomOpts } from "../utils/storage";

function Logo({ size=24 }) {
  const {BG,GREEN} = useTheme();
  return (
    <svg width={size} height={size} viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15" fill="none" stroke={GREEN} strokeWidth="3"/>
      <path d="M18 18 L18 5 A13 13 0 0 1 29 22 Z" fill={GREEN}/>
      <circle cx="18" cy="18" r="5" fill={BG}/>
    </svg>
  );
}

function CT({ active, payload, label }) {
  const {BORDER,MUTED,GREEN,RED} = useTheme();
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 12px",fontSize:11}}>
      <p style={{margin:0,color:MUTED,marginBottom:3}}>{label}</p>
      {payload.map((p,i)=>(
        <p key={i} style={{margin:0,color:p.value>=0?GREEN:RED,fontWeight:600}}>
          {p.name}: ${typeof p.value==="number"?p.value.toFixed(2):p.value}
        </p>
      ))}
    </div>
  );
}

function Breadcrumb({ current, setPage }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const pages=[["analytics","Analytics"],["calendar","Calendar"],["time","Time Analysis"],["risk","Risk Analysis"],["discipline","Discipline Analysis"]];
  return (
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:"9px 14px",display:"flex",alignItems:"center",marginBottom:22,flexWrap:"wrap"}}>
      <span style={{fontSize:12,marginRight:8}}>🏷</span>
      {pages.map(([p,l],i)=>(
        <span key={p} style={{display:"flex",alignItems:"center"}}>
          {i>0&&<span style={{color:"#333",fontSize:12,margin:"0 8px"}}>|</span>}
          <button onClick={()=>setPage(p)} style={{background:"none",border:"none",cursor:"pointer",padding:0,fontSize:12,color:current===p?GREEN:MUTED,fontWeight:current===p?600:400,textDecoration:current===p?"underline":"none",textUnderlineOffset:3}}>{l}</button>
        </span>
      ))}
    </div>
  );
}

function StatRow({ items }) {
  const {BORDER,CARD,MUTED,GREEN,RED,WHITE} = useTheme();
  return (
    <div style={{display:"grid",gridTemplateColumns:`repeat(${items.length},1fr)`,gap:1,background:BORDER,borderRadius:8,overflow:"hidden",marginBottom:22}}>
      {items.map((c,i)=>(
        <div key={i} style={{background:CARD,padding:"15px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:11,color:MUTED}}>{c.label}</span>
            <span style={{fontSize:13,color:c.positive?GREEN:c.positive===false?RED:MUTED}}>{c.icon}</span>
          </div>
          <div style={{fontSize:20,fontWeight:700,color:c.positive?GREEN:c.positive===false?RED:WHITE,letterSpacing:"-0.02em"}}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function MiniStat({ label, value, positive, icon }) {
  const {CARD,BORDER,MUTED,GREEN,RED} = useTheme();
  return (
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:"11px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontSize:10,color:MUTED,marginBottom:4}}>{label}</div><div style={{fontSize:17,fontWeight:700,color:positive?GREEN:RED}}>{value}</div></div>
      <span style={{fontSize:13,color:positive?GREEN:RED}}>{icon}</span>
    </div>
  );
}

// ── MANAGEABLE SELECT ─────────────────────────────────────────────────────────
function ManageableSelect({ fieldKey, value, onChange, defaultOptions, style }) {
  const {CARD2,BORDER,MUTED,GREEN,RED,WHITE,CYAN} = useTheme();
  const [open, setOpen] = useState(false);
  const [customOpts, setCustomOpts] = useState(() => {
    const stored = loadCustomOpts();
    return stored[fieldKey] || defaultOptions;
  });
  const [hovered, setHovered] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newVal, setNewVal] = useState("");
  const ref = useRef();

  useEffect(() => {
    const handler = (e) => { if(ref.current && !ref.current.contains(e.target)) { setOpen(false); setAddingNew(false); setNewVal(""); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const persistOpts = (opts) => {
    setCustomOpts(opts);
    const all = loadCustomOpts();
    all[fieldKey] = opts;
    saveCustomOpts(all);
  };

  const addOption = () => {
    const v = newVal.trim();
    if(v && !customOpts.includes(v)) { persistOpts([...customOpts, v]); onChange(v); }
    setNewVal(""); setAddingNew(false); setOpen(false);
  };

  const deleteOption = (opt, e) => {
    e.stopPropagation();
    const updated = customOpts.filter(o => o !== opt);
    persistOpts(updated);
    if(value === opt && updated.length) onChange(updated[0]);
  };

  return (
    <div ref={ref} style={{position:"relative"}}>
      <div onClick={() => setOpen(o => !o)} style={{...style, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", userSelect:"none"}}>
        <span>{value}</span>
        <span style={{color:MUTED, fontSize:9, marginLeft:6}}>{open?"▲":"▼"}</span>
      </div>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:9999,background:"#1c1c1c",border:`1px solid ${BORDER}`,borderRadius:8,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.6)",maxHeight:220,overflowY:"auto"}}>
          {customOpts.map(opt => (
            <div key={opt} onMouseEnter={()=>setHovered(opt)} onMouseLeave={()=>setHovered(null)} onClick={()=>{onChange(opt);setOpen(false);}}
              style={{padding:"8px 11px",fontSize:12,cursor:"pointer",background:opt===value?GREEN+"12":hovered===opt?CARD2:"transparent",color:opt===value?GREEN:WHITE,display:"flex",justifyContent:"space-between",alignItems:"center",transition:"background 0.1s"}}>
              <span>{opt}</span>
              {hovered===opt && <span onClick={(e)=>deleteOption(opt,e)} style={{color:RED,fontSize:13,fontWeight:700,padding:"1px 5px",borderRadius:4,background:"rgba(255,107,107,0.15)",cursor:"pointer",flexShrink:0,marginLeft:8}} title="Delete">×</span>}
            </div>
          ))}
          {addingNew ? (
            <div style={{padding:"6px 8px",borderTop:`1px solid ${BORDER}`,display:"flex",gap:5}}>
              <input autoFocus value={newVal} onChange={e=>setNewVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addOption();if(e.key==="Escape"){setAddingNew(false);setNewVal("");}}} placeholder="New option..." style={{flex:1,background:CARD2,border:`1px solid ${BORDER}`,borderRadius:4,color:WHITE,padding:"5px 8px",fontSize:11,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={addOption} style={{background:GREEN,border:"none",borderRadius:4,color:"#061306",fontWeight:700,fontSize:11,padding:"4px 8px",cursor:"pointer"}}>+</button>
              <button onClick={()=>{setAddingNew(false);setNewVal("");}} style={{background:"#333",border:"none",borderRadius:4,color:MUTED,fontSize:11,padding:"4px 7px",cursor:"pointer"}}>✕</button>
            </div>
          ) : (
            <div onClick={e=>{e.stopPropagation();setAddingNew(true);}} style={{padding:"7px 11px",fontSize:11,color:CYAN,cursor:"pointer",borderTop:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:5}}
              onMouseEnter={e=>e.currentTarget.style.background="#1a2a2a"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{fontSize:14,lineHeight:1}}>+</span> Add option
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── DASHBOARD PAGE ────────────────────────────────────────────────────────────


export { Logo, CT, Breadcrumb, StatRow, MiniStat, ManageableSelect };