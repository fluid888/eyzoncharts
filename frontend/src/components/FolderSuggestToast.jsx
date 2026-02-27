import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme, useCurrency } from "../contexts";

function FolderSuggestToast({ trade, folders, onAddToFolder, onDismiss }) {
  const th = useTheme();
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = th;
  const DURATION = 10000;
  const [visible, setVisible] = useState(false);
  const [paused,  setPaused]  = useState(false);
  const [adding,  setAdding]  = useState(null);
  const [added,   setAdded]   = useState(new Set());
  const [showAll, setShowAll] = useState(false);
  const timerRef  = useRef(null);
  const remainRef = useRef(DURATION);
  const startRef  = useRef(null);
  const dismissRef = useRef(null);

  // Keep dismissRef fresh so the setTimeout always calls the latest dismiss
  const dismiss = useCallback(()=>{
    clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(onDismiss, 320);
  },[onDismiss]);
  dismissRef.current = dismiss;

  const startTimer = useCallback((ms)=>{
    clearTimeout(timerRef.current);
    startRef.current = Date.now();
    timerRef.current = setTimeout(()=>dismissRef.current(), ms);
  },[]);

  useEffect(()=>{
    requestAnimationFrame(()=>setVisible(true));
    startTimer(DURATION);
    return()=>clearTimeout(timerRef.current);
  },[]);

  const pauseTimer = ()=>{
    if(paused) return;
    clearTimeout(timerRef.current);
    remainRef.current = Math.max(0, remainRef.current - (Date.now() - startRef.current));
    setPaused(true);
  };
  const resumeTimer = ()=>{
    if(!paused) return;
    setPaused(false);
    startTimer(remainRef.current);
  };

  // Smart folder matching — by symbol or tags overlap
  const tradeTags = (trade.tags||[]).map(t=>t.toLowerCase());
  const tradeSymbol = (trade.symbol||"").toLowerCase();
  const matchingFolders = folders.filter(f=>{
    const ftags = (f.tags||[]).map(t=>t.toLowerCase());
    const fname = f.name.toLowerCase();
    const symbolMatch = ftags.includes(tradeSymbol)||fname.includes(tradeSymbol)||tradeTags.includes(tradeSymbol);
    const tagMatch = tradeTags.some(t=>ftags.includes(t))||ftags.some(t=>tradeTags.includes(t));
    return symbolMatch||tagMatch;
  });
  const otherFolders = folders.filter(f=>!matchingFolders.find(m=>m.id===f.id));

  const displayed = showAll ? folders : matchingFolders.length ? matchingFolders : folders.slice(0,3);

  const handleAdd = (folder) => {
    if(added.has(folder.id)||adding===folder.id) return;
    onAddToFolder(folder.id, trade.id);
    setAdded(s=>new Set([...s,folder.id]));
  };

  if(!folders.length) return null;

  return (
    <div
      style={{
        position:"fixed",top:60,right:16,zIndex:600,
        width:320,
        transform:visible?"translateX(0)":"translateX(340px)",
        opacity:visible?1:0,
        transition:"transform 0.35s cubic-bezier(0.34,1.4,0.64,1), opacity 0.3s ease",
      }}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      <div style={{
        background:th.CARD,border:`1px solid ${th.BORDER}`,borderRadius:16,
        boxShadow:"0 20px 60px rgba(0,0,0,0.6)",
        overflow:"hidden",
      }}>
        {/* 10s progress bar — CSS animation, no RAF/state overhead */}
        <div style={{height:3,background:th.BORDER,position:"relative",overflow:"hidden"}}>
          <div style={{
            position:"absolute",left:0,top:0,height:"100%",width:"100%",
            background:`linear-gradient(90deg,${th.YELLOW},${th.GREEN})`,
            transformOrigin:"left center",
            animation:`folderToastShrink ${DURATION}ms linear forwards`,
            animationPlayState: paused ? "paused" : "running",
          }}/>
        </div>

        {/* Header */}
        <div style={{padding:"14px 16px 10px",display:"flex",alignItems:"flex-start",gap:10}}>
          <div style={{width:32,height:32,borderRadius:9,background:th.YELLOW+"15",border:`1px solid ${th.YELLOW}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>📁</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:800,color:th.WHITE,marginBottom:2}}>Add to a folder?</div>
            <div style={{fontSize:11,color:th.MUTED,lineHeight:1.4}}>
              {matchingFolders.length>0
                ? <><span style={{color:th.YELLOW,fontWeight:600}}>{matchingFolders.length} folder{matchingFolders.length>1?"s":""}</span> match this trade's tags</>
                : "Categorize your new trade"}
            </div>
          </div>
          <button onClick={dismiss} style={{background:"none",border:"none",color:th.MUTED,fontSize:16,cursor:"pointer",lineHeight:1,padding:2,borderRadius:5,flexShrink:0,transition:"color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.color=th.WHITE}
            onMouseLeave={e=>e.currentTarget.style.color=th.MUTED}>✕</button>
        </div>

        {/* Trade preview chip */}
        <div style={{margin:"0 14px 10px",padding:"7px 11px",background:th.CARD2,border:`1px solid ${th.BORDER}`,borderRadius:9,display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,
            background:trade.status==="WIN"?"#0d2a14":"#2a0d0d",
            color:trade.status==="WIN"?th.GREEN:th.RED,
            border:`1px solid ${trade.status==="WIN"?"#1a5a24":"#5a1a1a"}`,
          }}>{trade.status}</span>
          <span style={{fontSize:11,color:th.CYAN,fontWeight:700}}>#{trade.symbol}</span>
          <span style={{fontSize:11,color:th.MUTED}}>{trade.date}</span>
          <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,color:trade.pnl>=0?th.GREEN:th.RED}}>{trade.pnl>=0?"+":""}{(+trade.pnl||0).toFixed(0)}</span>
        </div>

        {/* Folder list */}
        <div style={{maxHeight:220,overflowY:"auto",padding:"0 14px"}}>
          {displayed.map(folder=>{
            const isAdded = added.has(folder.id);
            const isAdding = adding===folder.id;
            const isMatch = !!matchingFolders.find(m=>m.id===folder.id);
            return (
              <div key={folder.id} style={{
                display:"flex",alignItems:"center",gap:8,padding:"8px 0",
                borderBottom:`1px solid ${th.BORDER}`,
              }}>
                <span style={{fontSize:14}}>📁</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontSize:12,fontWeight:600,color:th.WHITE,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{folder.name}</span>
                    {isMatch&&<span style={{fontSize:9,color:th.YELLOW,background:th.YELLOW+"15",border:`1px solid ${th.YELLOW}33`,borderRadius:8,padding:"1px 5px",flexShrink:0}}>match</span>}
                  </div>
                  {folder.tags?.length>0&&(
                    <div style={{display:"flex",gap:3,marginTop:2,flexWrap:"wrap"}}>
                      {folder.tags.slice(0,3).map(t=><span key={t} style={{fontSize:9,color:th.MUTED}}>#{t}</span>)}
                    </div>
                  )}
                </div>
                <button
                  onClick={()=>!isAdded&&!isAdding&&handleAdd(folder)}
                  style={{
                    padding:"5px 12px",borderRadius:7,cursor:isAdded?"default":"pointer",
                    border:`1px solid ${isAdded?th.GREEN+"44":th.YELLOW+"55"}`,
                    background:isAdded?th.GREEN+"10":isAdding?th.YELLOW+"20":th.YELLOW+"10",
                    color:isAdded?th.GREEN:th.YELLOW,
                    fontSize:11,fontWeight:700,fontFamily:"inherit",
                    transition:"all 0.2s",flexShrink:0,minWidth:58,textAlign:"center",
                  }}
                  onMouseEnter={e=>{if(!isAdded)e.currentTarget.style.background=th.YELLOW+"25";}}
                  onMouseLeave={e=>{if(!isAdded)e.currentTarget.style.background=th.YELLOW+"10";}}
                >
                  {isAdded?"✓ Added":isAdding?"…":"+ Add"}
                </button>
              </div>
            );
          })}
          {!showAll&&otherFolders.length>0&&matchingFolders.length>0&&(
            <button onClick={()=>setShowAll(true)} style={{
              width:"100%",padding:"7px 0",background:"transparent",border:"none",
              color:th.MUTED,fontSize:11,cursor:"pointer",fontFamily:"inherit",
              borderBottom:`1px solid ${th.BORDER}`,
            }}>Show {otherFolders.length} more folder{otherFolders.length>1?"s":""} ▼</button>
          )}
        </div>

        {/* Skip */}
        <div style={{padding:"10px 14px 14px",display:"flex",justifyContent:"flex-end"}}>
          <button onClick={dismiss} style={{
            background:"transparent",border:`1px solid ${th.BORDER}`,borderRadius:8,
            padding:"6px 14px",color:th.MUTED,fontSize:11,cursor:"pointer",fontFamily:"inherit",
            transition:"all 0.15s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=th.WHITE;e.currentTarget.style.color=th.WHITE;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=th.BORDER;e.currentTarget.style.color=th.MUTED;}}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DELETE CONFIRM ────────────────────────────────────────────────────────────

export default FolderSuggestToast;
