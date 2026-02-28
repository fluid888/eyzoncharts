import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency } from "../contexts";
import { fmtHour } from "../utils/helpers";
import CreateFolderModal from "../components/modals/CreateFolderModal";
import DeleteConfirm from "../components/modals/DeleteConfirm";
import { SESSION_COLORS } from "../constants";

function TradesPage({ trades, setTrades, filters, setFilters, setShowModal, folders, onFoldersChange, hourFormat="12", accDetails }) {
  const th = useTheme();
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = th;
  const { fmt, symbol, toLocal } = useCurrency();
  const [sortKey,  setSortKey]  = useState("date");
  const [sortDir,  setSortDir]  = useState(-1);
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showDel,  setShowDel]  = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [activeFolderView, setActiveFolderView] = useState(null);

  const filtered = useMemo(()=>trades.filter(t=>
    (filters.symbol==="All"||t.symbol===filters.symbol)&&
    (filters.setup==="All"||t.model===filters.setup)&&
    (filters.side==="All"||t.side===filters.side)&&
    (filters.status==="All"||t.status===filters.status)&&
    (filters.session==="All"||t.session===filters.session)&&
    (!filters.dateFrom||t.closeDate>=filters.dateFrom)&&
    (!filters.dateTo||t.closeDate<=filters.dateTo)
  ),[trades,filters]);

  const sorted = useMemo(()=>[...filtered].sort((a,b)=>{
    const av=a[sortKey],bv=b[sortKey];
    if(typeof av==="string") return sortDir*(av.localeCompare(bv));
    return sortDir*(av-bv);
  }),[filtered,sortKey,sortDir]);

  const ts=(k)=>{if(sortKey===k)setSortDir(d=>-d);else{setSortKey(k);setSortDir(-1);}};
  const si=(id)=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});

  // Build close-date order index for each trade
  const closeDateIndex = useMemo(()=>{
    const sorted = [...trades].sort((a,b)=>(a.closeDate||a.date).localeCompare(b.closeDate||b.date));
    const map = {};
    sorted.forEach((t,i)=>{ map[t.id]=i+1; });
    return map;
  },[trades]);
  const wins=filtered.filter(t=>t.pnl>0),losses=filtered.filter(t=>t.pnl<0);
  const winRate=filtered.length?(wins.length/filtered.length*100):0;
  const grossWin=wins.reduce((s,t)=>s+t.pnl,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.pnl,0));
  const plRatio=grossLoss>0?(grossWin/grossLoss).toFixed(2):"∞";

  const byDate={};[...filtered].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{byDate[t.date]=(byDate[t.date]||0)+t.pnl;});
  // Equity sparkline starting from initial balance of the filtered account(s)
  const initBalUSD = useMemo(()=>{
    if(!accDetails) return 0;
    const accs = [...new Set(filtered.map(t=>t.account))];
    return accs.reduce((s,acc)=>s+(accDetails[acc]?.balance||0),0);
  },[accDetails, filtered]);
  let cum=toLocal(initBalUSD);
  const startV=parseFloat(cum.toFixed(2));
  const accData=[{d:"Start",v:startV},...Object.entries(byDate).map(([d,p])=>{cum+=toLocal(p);return{d:d.slice(5),v:parseFloat(cum.toFixed(2))};})];
  const totalPnl=filtered.reduce((s,t)=>s+t.pnl,0);

  const setupMap={};filtered.forEach(t=>{if(!setupMap[t.model])setupMap[t.model]={pnl:0,count:0};setupMap[t.model].pnl+=t.pnl;setupMap[t.model].count++;});
  const setupBreak=Object.entries(setupMap).sort((a,b)=>b[1].pnl-a[1].pnl);
  const maxSP=Math.max(...setupBreak.map(([,v])=>Math.abs(v.pnl)),1);
  const mistakeMap={};filtered.filter(t=>t.mistake).forEach(t=>{if(!mistakeMap[t.mistake])mistakeMap[t.mistake]=0;mistakeMap[t.mistake]+=t.pnl;});
  const mistakeBreak=Object.entries(mistakeMap).sort((a,b)=>a[1]-b[1]);
  const maxMP=Math.max(...mistakeBreak.map(([,v])=>Math.abs(v)),1);

  const delSelected=()=>{setTrades(ts=>ts.filter(t=>!selected.has(t.id)));setSelected(new Set());setShowDel(false);};
  const delOne=(id,e)=>{e.stopPropagation();setTrades(ts=>ts.filter(t=>t.id!==id));setSelected(s=>{const n=new Set(s);n.delete(id);return n;});};
  const setF=(k,v)=>setFilters(f=>({...f,[k]:v}));

  // ── Folder suggestions: detect 4+ trades sharing session + model + status ──
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());

  const folderSuggestions = useMemo(() => {
    const groups = {};
    trades.forEach(t => {
      const key = `${t.session||"?"}|${t.model||"?"}|${t.status||"?"}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return Object.entries(groups)
      .filter(([key, ts]) => {
        if (ts.length < 4) return false;
        if (dismissedSuggestions.has(key)) return false;
        // skip if an existing folder already covers this exact combo
        const name = key.replace(/\|/g, " · ");
        if (folders.some(f => f.name === name)) return false;
        return true;
      })
      .map(([key, ts]) => {
        const [session, model, status] = key.split("|");
        return {
          key,
          name: `${session} · ${model} · ${status}`,
          tradeIds: ts.map(t => t.id),
          count: ts.length,
          totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
          winRate: Math.round(ts.filter(t => t.pnl > 0).length / ts.length * 100),
          tags: [session, model, status].filter(Boolean),
        };
      });
  }, [trades, folders, dismissedSuggestions]);

  const acceptSuggestion = (s) => {
    const newFolder = { id: Date.now(), name: s.name, tradeIds: s.tradeIds, tags: s.tags };
    handleCreateFolder(newFolder);
    setDismissedSuggestions(d => new Set([...d, s.key]));
  };

  const handleCreateFolder = (folder) => {
    const updated = [...folders, folder];
    onFoldersChange(updated);
    setSelected(new Set());
    setShowFolderModal(false);
  };

  const handleDeleteFolder = (id) => {
    const updated = folders.filter(f=>f.id!==id);
    onFoldersChange(updated);
    if(activeFolderView===id) setActiveFolderView(null);
  };

  // If viewing a specific folder, filter the sorted list to only those trades
  const folderFilteredSorted = activeFolderView
    ? sorted.filter(t=>folders.find(f=>f.id===activeFolderView)?.tradeIds?.includes(t.id))
    : sorted;

  const allSel = folderFilteredSorted.length>0 && folderFilteredSorted.every(t=>selected.has(t.id));
  const activeFolder = folders.find(f=>f.id===activeFolderView);

  const thS={fontSize:10,color:MUTED,padding:"7px 9px",textAlign:"left",userSelect:"none",cursor:"pointer",whiteSpace:"nowrap",borderBottom:`1px solid ${BORDER}`,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase"};
  const tdS={fontSize:11,color:"#bbb",padding:"8px 9px",borderBottom:`1px solid #1a1a1a`,whiteSpace:"nowrap",verticalAlign:"middle"};
  const selS={background:CARD2,border:`1px solid ${BORDER}`,borderRadius:6,color:"#bbb",padding:"4px 9px",fontSize:11,cursor:"pointer",outline:"none",fontFamily:"inherit"};

  return (
    <div style={{display:"flex",minHeight:"calc(100vh - 44px)"}}>
      <div style={{flex:1,minWidth:0,padding:"14px 14px 60px"}}>
        {/* Summary */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:BORDER,borderRadius:8,overflow:"hidden",marginBottom:12}}>
          {[{l:"Accumulative Return Net",v:fmt(totalPnl),c:true},{l:"Profit/Loss Ratio",v:`${plRatio}:1`,c:true},{l:"Win %",v:`${winRate.toFixed(2)}%`,c:false}].map((x,i)=>(
            <div key={i} style={{background:CARD,padding:"11px 14px"}}>
              <div style={{fontSize:9,color:MUTED,marginBottom:2,letterSpacing:"0.06em",textTransform:"uppercase"}}>{x.l}</div>
              <div style={{fontSize:17,fontWeight:700,color:WHITE}}>{x.v}</div>
              {x.c&&accData.length>1&&<div style={{height:22,marginTop:3}}><ResponsiveContainer width="100%" height={22}><LineChart data={accData}><Line type="monotone" dataKey="v" stroke={CYAN} strokeWidth={1.5} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>}
            </div>
          ))}
        </div>
        {/* Filters */}
        <div style={{display:"flex",gap:7,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
          {[{l:"Symbol",k:"symbol",opts:["All",...new Set(trades.map(t=>t.symbol))]},{l:"Setup",k:"setup",opts:["All",...new Set(trades.map(t=>t.model))]},{l:"Side",k:"side",opts:["All","Long","Short"]},{l:"Status",k:"status",opts:["All","WIN","LOSS"]},{l:"Session",k:"session",opts:["All","London","New York","Asia"]}].map(f=>(
            <select key={f.k} style={selS} value={filters[f.k]} onChange={e=>setF(f.k,e.target.value)}>
              {f.opts.map(o=><option key={o} value={o}>{o==="All"?`${f.l}: All`:o}</option>)}
            </select>
          ))}
          {/* Date range filter */}
          <div style={{display:"flex",alignItems:"center",gap:4,background:CARD2,border:`1px solid ${(filters.dateFrom||filters.dateTo)?CYAN+"88":BORDER}`,borderRadius:6,padding:"2px 8px",fontSize:11,color:MUTED}}>
            <span style={{fontSize:10,color:MUTED,marginRight:2}}>Close:</span>
            <input type="date" value={filters.dateFrom||""} onChange={e=>setF("dateFrom",e.target.value)}
              style={{background:"transparent",border:"none",color:(filters.dateFrom)?CYAN:MUTED,fontSize:11,outline:"none",cursor:"pointer",colorScheme:"dark",width:112,fontFamily:"inherit"}}
              title="From close date"/>
            <span style={{color:MUTED,fontSize:10}}>→</span>
            <input type="date" value={filters.dateTo||""} onChange={e=>setF("dateTo",e.target.value)}
              style={{background:"transparent",border:"none",color:(filters.dateTo)?CYAN:MUTED,fontSize:11,outline:"none",cursor:"pointer",colorScheme:"dark",width:112,fontFamily:"inherit"}}
              title="To close date"/>
            {(filters.dateFrom||filters.dateTo)&&<span onClick={()=>{setF("dateFrom","");setF("dateTo","");}} style={{cursor:"pointer",color:RED,fontSize:12,marginLeft:2,lineHeight:1}} title="Clear dates">×</span>}
          </div>
          {Object.values(filters).some(v=>v!=="All"&&v!=="")&&<button onClick={()=>setFilters({symbol:"All",setup:"All",side:"All",status:"All",session:"All",dateFrom:"",dateTo:""})} style={{background:"#2a1a00",border:`1px solid #5a3a00`,color:YELLOW,borderRadius:6,padding:"4px 9px",fontSize:11,cursor:"pointer"}}>✕ Reset</button>}
          <span style={{marginLeft:"auto",fontSize:11,color:MUTED}}>{filtered.length}/{trades.length} trades</span>
          <span style={{fontSize:11,color:totalPnl>=0?GREEN:RED,fontWeight:600}}>Return: {fmt(totalPnl)}</span>
          {selected.size>0&&<button onClick={()=>setShowDel(true)} style={{background:`${RED}22`,border:`1px solid ${RED}55`,color:RED,borderRadius:6,padding:"4px 11px",fontSize:11,cursor:"pointer",fontWeight:600}}>🗑 Delete {selected.size}</button>}
          {selected.size>0&&<button onClick={()=>setShowFolderModal(true)} style={{background:`${YELLOW}18`,border:`1px solid ${YELLOW}44`,color:YELLOW,borderRadius:6,padding:"4px 11px",fontSize:11,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>📁 Add to Folder</button>}
        </div>
        {/* Table */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#111"}}>
                <th style={{...thS,cursor:"default"}}><input type="checkbox" checked={allSel} onChange={()=>allSel?setSelected(new Set()):setSelected(new Set(folderFilteredSorted.map(t=>t.id)))} style={{accentColor:GREEN,cursor:"pointer"}}/></th>
                <th style={{...thS,cursor:"default",color:MUTED,fontSize:9}}>#</th>
                <th style={{...thS,cursor:"default"}}/>
                {[["status","STATUS"],["side","SIDE"],["symbol","SYMBOL"],["date","OPEN DATE"],["entry","ENTRY"],["size","SIZE"],["closeDate","CLOSE DATE"],["exit","EXIT"],["cost","COST"],["pnl","NET RETURN"],["pnlPct","NET %"],["model","SETUP"],["session","SESSION"]].map(([k,l])=>(
                  <th key={k} style={thS} onClick={()=>ts(k)}>{l}{sortKey===k?(sortDir===-1?" ↓":" ↑"):""}</th>
                ))}
                <th style={{...thS,cursor:"default"}}>MISTAKE</th>
                <th style={{...thS,cursor:"default",width:30}}/>
              </tr>
            </thead>
            <tbody>
              {folderFilteredSorted.length===0&&<tr><td colSpan={19} style={{...tdS,textAlign:"center",padding:28,color:MUTED}}>{activeFolderView?"No trades in this folder":"No trades match current filters"}</td></tr>}
              {folderFilteredSorted.map(t=>(
                <>
                  <tr key={t.id} style={{cursor:"pointer",background:selected.has(t.id)?GREEN+"12":"transparent",transition:"background 0.1s"}}
                    onMouseEnter={e=>{if(!selected.has(t.id))e.currentTarget.style.background=CARD2}}
                    onMouseLeave={e=>{if(!selected.has(t.id))e.currentTarget.style.background="transparent"}}
                    onClick={()=>setExpanded(expanded===t.id?null:t.id)}>
                    <td style={tdS} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.has(t.id)} onChange={()=>si(t.id)} style={{accentColor:GREEN}}/></td>
                    <td style={{...tdS,color:MUTED,fontSize:9,textAlign:"center",fontVariantNumeric:"tabular-nums"}}>{closeDateIndex[t.id]||""}</td>
                    <td style={{...tdS,color:MUTED,fontSize:10}}>{expanded===t.id?"▼":"▶"}</td>
                    <td style={tdS}><span style={{background:t.status==="WIN"?"#0d2a14":"#2a0d0d",color:t.status==="WIN"?GREEN:RED,border:`1px solid ${t.status==="WIN"?"#1a5a24":"#5a1a1a"}`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{t.status}</span></td>
                    <td style={tdS}><span style={{background:t.side==="Long"?"#0a1e2a":"#2a0a1e",color:t.side==="Long"?CYAN:RED,border:`1px solid ${t.side==="Long"?"#1a4a6a":"#6a1a4a"}`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{t.side.toUpperCase()}</span></td>
                    <td style={{...tdS,color:CYAN,fontWeight:600}}>#{t.symbol}</td>
                    <td style={{...tdS,color:"#aaa"}}>{t.date}</td>
                    <td style={tdS}>{t.entry.toFixed(t.entry<10?4:2)}</td>
                    <td style={tdS}>{t.size}</td>
                    <td style={{...tdS,color:"#aaa"}}>{t.closeDate}</td>
                    <td style={tdS}>{t.exit.toFixed(t.exit<10?4:2)}</td>
                    <td style={{...tdS,color:MUTED}}>${t.cost.toFixed(2)}</td>
                    <td style={{...tdS,fontWeight:700,color:t.pnl>=0?GREEN:RED}}>{t.pnl>=0?"+":""}{t.pnl.toFixed(2)}</td>
                    <td style={{...tdS,color:t.pnlPct>=0?GREEN:RED}}>{t.pnlPct>=0?"+":""}{t.pnlPct.toFixed(2)}%</td>
                    <td style={tdS}>{t.model&&<span style={{background:"#0d2a1e",color:GREEN,border:`1px solid #1a4a2a`,borderRadius:4,padding:"2px 6px",fontSize:10}}>{t.model}</span>}</td>
                    <td style={tdS}>
                      {t.session&&<div style={{display:"flex",flexDirection:"column",gap:1}}>
                        <span style={{fontSize:10,fontWeight:600,color:SESSION_COLORS[t.session]||MUTED}}>● {t.session}</span>
                        {t.hour&&<span style={{fontSize:9,color:MUTED}}>{fmtHour(t.hour,hourFormat)}</span>}
                      </div>}
                    </td>
                    <td style={tdS}>{t.mistake&&<span style={{background:"#2a1a00",color:YELLOW,border:`1px solid #5a3a00`,borderRadius:4,padding:"2px 6px",fontSize:10}}>{t.mistake}</span>}</td>
                    <td style={tdS} onClick={e=>delOne(t.id,e)}><span style={{color:"#444",fontSize:13,cursor:"pointer",transition:"color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.color=RED} onMouseLeave={e=>e.currentTarget.style.color="#444"}>🗑</span></td>
                  </tr>
                  {expanded===t.id&&(
                    <tr key={`e${t.id}`}>
                      <td colSpan={19} style={{background:SUBBG,padding:"12px 22px",borderBottom:`1px solid ${BORDER}`}}>
                        <div style={{display:"flex",gap:24,flexWrap:"wrap",alignItems:"flex-start"}}>
                          {t.account&&<div><div style={{fontSize:9,color:MUTED,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.08em"}}>Account</div><div style={{fontSize:12,color:CYAN,fontWeight:600,background:"#0a1e2a",border:`1px solid #1a3a5a`,borderRadius:4,padding:"2px 8px",display:"inline-block"}}>{t.account}</div></div>}
                          {[["Session",t.session,WHITE],["R:R",`${t.rr}R`,t.rr>=0?GREEN:RED],["Followed Plan",t.followed?"✓ Yes":"✗ No",t.followed?GREEN:RED],["Entry Time",fmtHour(t.hour,hourFormat)||"—",WHITE]].map(([l,v,c])=>(
                            <div key={l}><div style={{fontSize:9,color:MUTED,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.08em"}}>{l}</div><div style={{fontSize:12,color:c,fontWeight:600}}>{v}</div></div>
                          ))}
                          {(t.tags||[]).length>0&&<div><div style={{fontSize:9,color:MUTED,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.08em"}}>Tags</div><div style={{display:"flex",gap:4}}>{t.tags.map((tg,i)=><span key={i} style={{background:"#0d1e2a",color:CYAN,border:`1px solid #1a3a5a`,borderRadius:4,padding:"2px 6px",fontSize:10}}>{tg}</span>)}</div></div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sidebar */}
      <div style={{width:230,flexShrink:0,borderLeft:`1px solid ${BORDER}`,background:CARD,padding:"14px 12px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
        
        {/* ── Folder suggestions ── */}
        {folderSuggestions.length > 0 && (
          <div>
            <div style={{fontSize:11,color:YELLOW,fontWeight:600,marginBottom:7,display:"flex",alignItems:"center",gap:5}}>
              <span>💡</span><span>Suggested Folders</span>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {folderSuggestions.map(s => (
                <div key={s.key} style={{
                  background:YELLOW+"08",border:`1px solid ${YELLOW}33`,
                  borderRadius:8,padding:"8px 10px",
                }}>
                  <div style={{fontSize:10,fontWeight:600,color:YELLOW,marginBottom:4,lineHeight:1.3}}>{s.name}</div>
                  <div style={{fontSize:9,color:MUTED,marginBottom:7,lineHeight:1.4}}>
                    {s.count} trades · <span style={{color:s.totalPnl>=0?GREEN:RED,fontWeight:600}}>
                      {s.totalPnl>=0?"+":""}{s.totalPnl.toFixed(0)}
                    </span> · {s.winRate}% WR
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button
                      onClick={() => acceptSuggestion(s)}
                      style={{flex:1,background:YELLOW+"22",border:`1px solid ${YELLOW}55`,color:YELLOW,borderRadius:5,padding:"4px 0",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                      Create
                    </button>
                    <button
                      onClick={() => setDismissedSuggestions(d => new Set([...d, s.key]))}
                      style={{background:"transparent",border:`1px solid ${BORDER}`,color:MUTED,borderRadius:5,padding:"4px 7px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{borderTop:`1px solid ${BORDER}`,marginTop:10}}/>
          </div>
        )}

        {/* Folders section */}
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:11,color:WHITE,fontWeight:600}}>📁 Folders</div>
            {folders.length>0&&activeFolderView&&(
              <button onClick={()=>{setActiveFolderView(null);setSelected(new Set());}} style={{fontSize:10,color:CYAN,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit"}}>← All Trades</button>
            )}
          </div>
          {folders.length===0 ? (
            <div style={{fontSize:10,color:MUTED,padding:"10px 0",textAlign:"center",border:`1px dashed ${BORDER}`,borderRadius:7,lineHeight:1.5}}>
              No folders yet.<br/>Select trades &amp; click<br/>📁 Add to Folder
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <div
                onClick={()=>{setActiveFolderView(null);setSelected(new Set());}}
                style={{
                  padding:"7px 10px",borderRadius:7,cursor:"pointer",fontSize:11,
                  background:activeFolderView===null?GREEN+"12":"transparent",
                  border:`1px solid ${activeFolderView===null?GREEN+"44":BORDER}`,
                  color:activeFolderView===null?GREEN:MUTED,
                  fontWeight:activeFolderView===null?700:400,
                  transition:"all 0.12s",display:"flex",alignItems:"center",gap:6,
                }}
              >
                <span>🗂</span><span>All Trades</span>
                <span style={{marginLeft:"auto",fontSize:10,background:BORDER,borderRadius:10,padding:"1px 6px"}}>{sorted.length}</span>
              </div>
              {folders.map(folder=>{
                const count = folder.tradeIds?.length||0;
                const isActive = activeFolderView===folder.id;
                return (
                  <div key={folder.id} style={{
                    padding:"7px 10px",borderRadius:7,cursor:"pointer",
                    background:isActive?YELLOW+"10":"transparent",
                    border:`1px solid ${isActive?YELLOW+"55":BORDER}`,
                    transition:"all 0.12s",position:"relative",
                  }}
                  onClick={()=>{
                    const next = isActive?null:folder.id;
                    setActiveFolderView(next);
                    if(next) setSelected(new Set(folder.tradeIds||[]));
                    else setSelected(new Set());
                  }}
                  onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=CARD2;}}
                  onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="transparent";}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:folder.tags?.length?3:0}}>
                      <span style={{fontSize:12}}>📁</span>
                      <span style={{fontSize:11,fontWeight:isActive?700:500,color:isActive?YELLOW:WHITE,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{folder.name}</span>
                      <span style={{fontSize:10,background:isActive?YELLOW+"20":BORDER,color:isActive?YELLOW:MUTED,borderRadius:10,padding:"1px 5px",flexShrink:0}}>{count}</span>
                    </div>
                    {folder.tags?.length>0&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:3,marginLeft:17}}>
                        {folder.tags.slice(0,3).map(t=>(
                          <span key={t} style={{fontSize:9,color:YELLOW,background:YELLOW+"10",borderRadius:8,padding:"1px 5px"}}>#{t}</span>
                        ))}
                        {folder.tags.length>3&&<span style={{fontSize:9,color:MUTED}}>+{folder.tags.length-3}</span>}
                      </div>
                    )}
                    <button
                      onClick={e=>{e.stopPropagation();handleDeleteFolder(folder.id);}}
                      style={{
                        position:"absolute",top:4,right:4,background:"none",border:"none",
                        color:"transparent",fontSize:11,cursor:"pointer",lineHeight:1,padding:"1px 3px",
                        borderRadius:3,transition:"all 0.15s",
                      }}
                      onMouseEnter={e=>{e.currentTarget.style.color=RED;e.currentTarget.style.background=RED+"15";}}
                      onMouseLeave={e=>{e.currentTarget.style.color="transparent";e.currentTarget.style.background="none";}}
                      title="Delete folder"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{borderTop:`1px solid ${BORDER}`}}/>

        <div>
          <div style={{fontSize:11,color:WHITE,fontWeight:600,marginBottom:8}}>Account Performance</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <div><div style={{fontSize:9,color:MUTED,marginBottom:2,textTransform:"uppercase"}}>AVG RETURN</div><div style={{fontSize:12,fontWeight:700,color:GREEN}}>{fmt(totalPnl/Math.max(filtered.length,1))}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:9,color:MUTED,marginBottom:2,textTransform:"uppercase"}}>AVG %</div><div style={{fontSize:12,fontWeight:700,color:GREEN}}>{(filtered.reduce((s,t)=>s+t.pnlPct,0)/Math.max(filtered.length,1)).toFixed(2)}%</div></div>
          </div>
          {accData.length>1&&<ResponsiveContainer width="100%" height={55}><AreaChart data={accData}><defs><linearGradient id="aG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CYAN} stopOpacity={0.3}/><stop offset="100%" stopColor={CYAN} stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="v" stroke={CYAN} strokeWidth={1.5} fill="url(#aG)" dot={false} isAnimationActive={false}/></AreaChart></ResponsiveContainer>}
        </div>
        <div style={{borderTop:`1px solid ${BORDER}`}}/>
        <div>
          <div style={{fontSize:11,color:WHITE,fontWeight:600,marginBottom:7}}>Setups</div>
          {setupBreak.length===0?<div style={{fontSize:11,color:MUTED}}>No data</div>:<div style={{display:"flex",flexDirection:"column",gap:5}}>{setupBreak.map(([s,d])=>(<div key={s}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10,color:"#aaa"}}>{s}</span><span style={{fontSize:10,fontWeight:600,color:d.pnl>=0?GREEN:RED}}>${d.pnl.toFixed(0)}</span></div><div style={{background:CARD2,borderRadius:3,height:4,overflow:"hidden"}}><div style={{width:`${Math.abs(d.pnl)/maxSP*100}%`,height:"100%",background:d.pnl>=0?GREEN:RED,borderRadius:3}}/></div></div>))}</div>}
        </div>
        <div style={{borderTop:`1px solid ${BORDER}`}}/>
        <div>
          <div style={{fontSize:11,color:WHITE,fontWeight:600,marginBottom:7}}>Mistakes</div>
          {mistakeBreak.length===0?<div style={{fontSize:11,color:MUTED}}>No mistakes ✓</div>:<div style={{display:"flex",flexDirection:"column",gap:5}}>{mistakeBreak.map(([m,p])=>(<div key={m}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span style={{fontSize:10,color:"#aaa"}}>{m}</span><span style={{fontSize:10,fontWeight:600,color:RED}}>${p.toFixed(0)}</span></div><div style={{background:CARD2,borderRadius:3,height:4,overflow:"hidden"}}><div style={{width:`${Math.abs(p)/maxMP*100}%`,height:"100%",background:RED,borderRadius:3}}/></div></div>))}</div>}
        </div>
        <div style={{borderTop:`1px solid ${BORDER}`}}/>
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {[["Trades",filtered.length,null],["Wins",wins.length,GREEN],["Losses",losses.length,RED],["Win Rate",`${winRate.toFixed(1)}%`,winRate>=50?GREEN:RED]].map(([l,v,c])=>(<div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:MUTED}}>{l}</span><span style={{color:c||WHITE,fontWeight:600}}>{v}</span></div>))}
        </div>
      </div>

      {showDel&&<DeleteConfirm count={selected.size} onConfirm={delSelected} onCancel={()=>setShowDel(false)}/>}
      {showFolderModal&&(
        <CreateFolderModal
          trades={sorted}
          preSelected={[...selected]}
          onClose={()=>setShowFolderModal(false)}
          onSave={handleCreateFolder}
        />
      )}
    </div>
  );
}

// ── SHARED ACCOUNT FILTER BAR ────────────────────────────────────────────────

export default TradesPage;
