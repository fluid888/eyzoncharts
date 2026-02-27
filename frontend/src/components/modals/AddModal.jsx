import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTheme, useCurrency } from "../../contexts";
import { ManageableSelect } from "../common";
import SessionTimePicker from "../SessionTimePicker";

function AddModal({ onClose, onAdd, accounts, setAccounts, timezone, hourFormat, trades }) {
  const th = useTheme();
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = th;
  const today = new Date().toISOString().split("T")[0];
  const defaultAccount = accounts && accounts.length ? accounts[0] : "Demo Account";
  const [f,setF]=useState({date:today,closeDate:today,account:defaultAccount,symbol:"XAU/USD",side:"Long",model:"REVERSAL",session:"London",entry:"",exit:"",size:"0.5",pnl:"",rr:"",followed:"true",mistake:"",tags:"",hour:""});
  const [accDropOpen, setAccDropOpen] = useState(false);
  const [accHovered, setAccHovered]   = useState(null);
  const accRef = useRef();
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  const inp={
    background:th.CARD2,border:`1px solid ${th.BORDER}`,borderRadius:8,
    color:th.WHITE,padding:"9px 11px",fontSize:12,width:"100%",
    boxSizing:"border-box",outline:"none",fontFamily:"inherit",
    transition:"border-color 0.15s",
  };
  const lbl={fontSize:10,color:th.MUTED,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600};

  useEffect(()=>{
    const h = e=>{ if(accRef.current&&!accRef.current.contains(e.target)) setAccDropOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  // Pretty date display
  const formatDate = (d) => {
    if(!d) return "";
    try {
      return new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});
    } catch{ return d; }
  };

  const submit=()=>{
    const pnl=parseFloat(f.pnl||0),rr=parseFloat(f.rr||0),entry=parseFloat(f.entry||0),exit=parseFloat(f.exit||0),size=parseFloat(f.size||1);
    const cost=entry*size, pnlPct=cost?((pnl/cost)*100):0, status=pnl>=0?"WIN":"LOSS";
    onAdd({date:f.date,closeDate:f.closeDate,account:f.account,symbol:f.symbol,side:f.side,model:f.model,session:f.session,entry,exit,size,cost,pnl,pnlPct,rr,followed:f.followed==="true",status,mistake:f.mistake,tags:f.tags?f.tags.split(",").map(t=>t.trim()).filter(Boolean):[],hour:f.hour});
    onClose();
  };

  // Tag suggestions from existing trades
  const allExistingTags = useMemo(()=>{
    const set = new Set();
    (trades||[]).forEach(t=>(t.tags||[]).forEach(tag=>set.add(tag)));
    return [...set].sort();
  },[trades]);

  const [tagSuggestOpen, setTagSuggestOpen] = useState(false);
  const tagRef = useRef();

  useEffect(()=>{
    const h = e=>{ if(tagRef.current&&!tagRef.current.contains(e.target)) setTagSuggestOpen(false); };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  const currentTags = f.tags ? f.tags.split(",").map(t=>t.trim()).filter(Boolean) : [];
  const tagBeingTyped = f.tags ? f.tags.split(",").pop().trim().toLowerCase() : "";
  const filteredSuggestions = allExistingTags.filter(t=>
    t.toLowerCase().includes(tagBeingTyped) && !currentTags.map(x=>x.toLowerCase()).includes(t.toLowerCase())
  );

  const addTagSuggestion = (tag) => {
    const existing = f.tags ? f.tags.split(",").map(t=>t.trim()).filter(Boolean) : [];
    const withoutLast = existing.slice(0,-1);
    set("tags",[...withoutLast,tag].join(", ")+", ");
    setTagSuggestOpen(false);
  };

  // Section divider
  const Section = ({label})=>(
    <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:10,margin:"4px 0"}}>
      <span style={{fontSize:10,color:th.MUTED,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>{label}</span>
      <div style={{flex:1,height:1,background:th.BORDER}}/>
    </div>
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{
        background:th.CARD,border:`1px solid ${th.BORDER}`,borderRadius:18,
        width:600,maxWidth:"96vw",maxHeight:"92vh",
        display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,0.6)",
        position:"relative",overflow:"hidden",
      }}>
        {/* Top accent line */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${th.GREEN},${th.CYAN})`,borderRadius:"18px 18px 0 0"}}/>

        {/* Header */}
        <div style={{padding:"22px 24px 16px",borderBottom:`1px solid ${th.BORDER}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:38,height:38,borderRadius:11,background:th.GREEN+"15",border:`1px solid ${th.GREEN}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📝</div>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:th.WHITE,letterSpacing:"-0.01em"}}>Log New Trade</div>
                <div style={{fontSize:11,color:th.MUTED,marginTop:1}}>Record your trade details</div>
              </div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",color:th.MUTED,fontSize:20,cursor:"pointer",lineHeight:1,padding:4,borderRadius:6,transition:"color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color=th.WHITE}
              onMouseLeave={e=>e.currentTarget.style.color=th.MUTED}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

          {/* Account */}
          <div ref={accRef} style={{marginBottom:16,position:"relative"}}>
            <label style={lbl}>Account</label>
            <div onClick={()=>setAccDropOpen(o=>!o)} style={{
              background:th.CARD2,border:`1px solid ${th.GREEN}55`,borderRadius:10,
              padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",
              justifyContent:"space-between",transition:"border-color 0.15s",
            }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=th.GREEN}
            onMouseLeave={e=>e.currentTarget.style.borderColor=th.GREEN+"55"}>
              <div style={{display:"flex",alignItems:"center",gap:9}}>
                <span style={{width:9,height:9,borderRadius:"50%",background:th.GREEN,display:"inline-block",flexShrink:0,boxShadow:`0 0 6px ${th.GREEN}66`}}/>
                <span style={{fontSize:13,fontWeight:700,color:th.WHITE}}>{f.account}</span>
              </div>
              <span style={{fontSize:10,color:th.MUTED,transition:"transform 0.2s",display:"inline-block",transform:accDropOpen?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
            </div>
            {accDropOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:9999,background:th.CARD,border:`1px solid ${th.BORDER}`,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.5)",overflow:"hidden"}}>
                {(accounts||[]).map((a)=>(
                  <div key={a} onMouseEnter={()=>setAccHovered(a)} onMouseLeave={()=>setAccHovered(null)}
                    onClick={()=>{set("account",a);setAccDropOpen(false);}}
                    style={{padding:"11px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:9,
                      background:a===f.account?th.GREEN+"12":accHovered===a?th.CARD2:"transparent",transition:"background 0.1s"}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:a===f.account?th.GREEN:th.MUTED,display:"inline-block",flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:600,color:a===f.account?th.GREEN:th.WHITE}}>{a}</span>
                    {a===f.account&&<span style={{marginLeft:"auto",fontSize:10,color:th.GREEN}}>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>

            {/* Dates — pretty with embedded Today button */}
            {[["date","📅 Open Date"],["closeDate","📅 Close Date"]].map(([k,l])=>{
              const dateInputRef = { current: null };
              return (
                <div key={k}>
                  <label style={lbl}>{l}</label>
                  <div style={{position:"relative"}}>
                    <input
                      type="date"
                      value={f[k]}
                      onChange={e=>set(k,e.target.value)}
                      ref={el=>{ dateInputRef.current=el; }}
                      style={{...inp,colorScheme:"dark",paddingRight:12,opacity:0,position:"absolute",inset:0,cursor:"pointer",zIndex:2}}
                    />
                    <div style={{...inp,display:"flex",alignItems:"center",gap:8,background:th.CARD2,border:`1px solid ${f[k]?th.CYAN+"88":th.BORDER}`,pointerEvents:"none",position:"relative",zIndex:1,minHeight:40,paddingRight:8}}>
                      <span style={{fontSize:14}}>📅</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:f[k]?th.WHITE:th.MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {f[k]?formatDate(f[k]):"Pick date…"}
                        </div>
                      </div>
                      {/* Today chip inside the field */}
                      <span style={{
                        pointerEvents:"none",
                        fontSize:10,fontWeight:700,
                        padding:"2px 8px",borderRadius:20,
                        background:f[k]===today?th.GREEN+"28":"transparent",
                        color:f[k]===today?th.GREEN:th.MUTED,
                        border:`1px solid ${f[k]===today?th.GREEN+"55":"transparent"}`,
                        flexShrink:0,transition:"all 0.15s",
                      }}>Today</span>
                      <span style={{fontSize:10,color:th.MUTED,marginLeft:2}}>▼</span>
                    </div>
                    {/* Invisible Today-button positioned over the chip */}
                    <button type="button"
                      onClick={e=>{e.stopPropagation();set(k,today);}}
                      style={{
                        position:"absolute",right:34,top:0,bottom:0,
                        width:60,zIndex:10,
                        background:"transparent",border:"none",cursor:"pointer",
                        outline:"none",WebkitTapHighlightColor:"transparent",
                      }}
                      onMouseDown={e=>e.preventDefault()}
                      title="Set to today"
                    />
                  </div>
                </div>
              );
            })}

            {/* Trade Time - full width */}
            <SessionTimePicker
              hourValue={f.hour} onHourChange={v=>set("hour",v)}
              sessionValue={f.session} onSessionChange={v=>set("session",v)}
              timezone={timezone} hourFormat={hourFormat}
            />

            {/* Divider */}
            <Section label="Price & Size"/>

            {[["entry","Entry"],["exit","Exit"],["size","Size (Lots)"],["pnl","P&L ($)"],["rr","R:R"]].map(([k,l])=>(
              <div key={k}>
                <label style={lbl}>{l}</label>
                <input style={{...inp,borderColor:f[k]?th.GREEN+"66":th.BORDER}} type="number" value={f[k]} onChange={e=>set(k,e.target.value)} placeholder="0"/>
              </div>
            ))}

            <Section label="Setup & Details"/>

            {[["symbol","Symbol",["XAU/USD","USDJPY","EURUSD","BTCUSDT","ETHUSDT","NQ","ES","GC","CL"]],
              ["side","Direction",["Long","Short"]],
              ["model","Setup",["REVERSAL","BREAKOUT","FOMO","RSI CROSS","VWAP","ORB"]],
              ["followed","Followed Plan",["true","false"]]
            ].map(([k,l,opts])=>(
              <div key={k}>
                <label style={lbl}>{l}</label>
                <ManageableSelect fieldKey={k} value={f[k]} onChange={v=>set(k,v)} defaultOptions={opts} style={{...inp,borderColor:th.BORDER}}/>
              </div>
            ))}

            {/* Mistake & Tags full width */}
            <div style={{gridColumn:"1/-1"}}>
              <label style={lbl}>Mistake</label>
              <input style={inp} placeholder="fomo, no stop loss, greed…" value={f.mistake} onChange={e=>set("mistake",e.target.value)}/>
            </div>
            <div style={{gridColumn:"1/-1"}} ref={tagRef}>
              <label style={lbl}>Tags (comma-separated)</label>
              <div style={{position:"relative"}}>
                <input
                  style={inp}
                  placeholder="well-managed, perfect-entry"
                  value={f.tags}
                  onChange={e=>{set("tags",e.target.value);setTagSuggestOpen(true);}}
                  onFocus={()=>setTagSuggestOpen(true)}
                  autoComplete="off"
                />
                {tagSuggestOpen && filteredSuggestions.length>0 && tagBeingTyped && (
                  <div style={{
                    position:"absolute",top:"100%",left:0,right:0,zIndex:9999,
                    background:th.CARD,border:`1px solid ${th.BORDER}`,borderRadius:10,
                    boxShadow:"0 10px 30px rgba(0,0,0,0.4)",overflow:"hidden",marginTop:4,
                  }}>
                    <div style={{padding:"6px 8px",borderBottom:`1px solid ${th.BORDER}`,fontSize:10,color:th.MUTED,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                      Suggestions
                    </div>
                    {filteredSuggestions.slice(0,6).map(tag=>(
                      <div key={tag} onClick={()=>addTagSuggestion(tag)}
                        style={{padding:"8px 12px",cursor:"pointer",fontSize:11,color:th.WHITE,display:"flex",alignItems:"center",gap:7,transition:"background 0.1s"}}
                        onMouseEnter={e=>e.currentTarget.style.background=th.CARD2}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <span style={{fontSize:13,color:th.CYAN}}>🏷</span>
                        <span>{tag}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {currentTags.filter(Boolean).length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
                  {currentTags.filter(Boolean).map(tag=>(
                    <span key={tag} style={{display:"inline-flex",alignItems:"center",gap:4,background:th.CYAN+"12",border:`1px solid ${th.CYAN}30`,color:th.CYAN,borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:500}}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:"16px 24px",borderTop:`1px solid ${th.BORDER}`,flexShrink:0,display:"flex",gap:10}}>
          <button onClick={onClose} style={{
            padding:"10px 20px",background:"transparent",border:`1px solid ${th.BORDER}`,
            borderRadius:10,color:th.MUTED,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=th.WHITE;e.currentTarget.style.color=th.WHITE;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=th.BORDER;e.currentTarget.style.color=th.MUTED;}}>
            Cancel
          </button>
          <button onClick={submit} style={{
            flex:1,padding:"10px",
            background:`linear-gradient(135deg,${th.GREEN},#27ae60)`,
            border:"none",borderRadius:10,
            color:"#061306",fontSize:13,fontWeight:800,
            cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.01em",
            boxShadow:`0 4px 18px ${th.GREEN}40`,transition:"opacity 0.15s",
          }}
          onMouseEnter={e=>e.currentTarget.style.opacity="0.9"}
          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            ✓ Add Trade
          </button>
        </div>
      </div>
    </div>
  );
}

// ── FOLDER SUGGEST TOAST ─────────────────────────────────────────────────────

export default AddModal;
