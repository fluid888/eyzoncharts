import { useState, useRef, useMemo } from "react";
import { useTheme, useCurrency } from "../../contexts";

function CreateFolderModal({ trades, preSelected, onClose, onSave }) {
  const th = useTheme();
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = th;
  const [name,      setName]      = useState("");
  const [tagInput,  setTagInput]  = useState("");
  const [tags,      setTags]      = useState([]);
  const [tradesOpen,setTradesOpen]= useState(true);
  const [chosen,    setChosen]    = useState(new Set(preSelected));
  const [nameErr,   setNameErr]   = useState(false);

  const addTag = () => {
    const v = tagInput.trim().toLowerCase().replace(/\s+/g,"-");
    if(v && !tags.includes(v)) setTags(t=>[...t,v]);
    setTagInput("");
  };
  const removeTag = (t) => setTags(ts=>ts.filter(x=>x!==t));

  const toggleTrade = (id) => setChosen(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  const allChosen = trades.length>0 && trades.every(t=>chosen.has(t.id));

  const handleSave = () => {
    if(!name.trim()){setNameErr(true);return;}
    onSave({
      id: Date.now(),
      name: name.trim(),
      tags,
      tradeIds: [...chosen],
      createdAt: new Date().toISOString(),
    });
  };

  const overlayStyle = {
    position:"fixed",inset:0,zIndex:500,
    background:"rgba(0,0,0,0.75)",
    backdropFilter:"blur(10px)",
    WebkitBackdropFilter:"blur(10px)",
    display:"flex",alignItems:"center",justifyContent:"center",
    padding:"16px",
  };

  const inp = {
    background:th.CARD2,border:`1px solid ${th.BORDER}`,borderRadius:8,
    color:th.WHITE,padding:"9px 12px",fontSize:12,outline:"none",
    fontFamily:"inherit",width:"100%",boxSizing:"border-box",
    transition:"border-color 0.15s",
  };

  return (
    <div style={overlayStyle} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{
        background:th.CARD,border:`1px solid ${th.BORDER}`,borderRadius:18,
        width:"100%",maxWidth:520,maxHeight:"90vh",display:"flex",flexDirection:"column",
        boxShadow:"0 32px 80px rgba(0,0,0,0.6)",overflow:"hidden",
        position:"relative",
      }}>
        {/* Top shimmer */}
        <div style={{position:"absolute",top:0,left:24,right:24,height:1,background:`linear-gradient(90deg,transparent,${th.YELLOW}55,transparent)`}}/>

        {/* Header */}
        <div style={{padding:"22px 24px 16px",borderBottom:`1px solid ${th.BORDER}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:10,background:th.YELLOW+"15",border:`1px solid ${th.YELLOW}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>📁</div>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:th.WHITE,letterSpacing:"-0.01em"}}>Create Folder</div>
                <div style={{fontSize:11,color:th.MUTED,marginTop:1}}>Group & bookmark your trades</div>
              </div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",color:th.MUTED,fontSize:18,cursor:"pointer",lineHeight:1,padding:4,borderRadius:6,transition:"color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color=th.WHITE}
              onMouseLeave={e=>e.currentTarget.style.color=th.MUTED}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

          {/* Folder name */}
          <div style={{marginBottom:18}}>
            <label style={{fontSize:10,color:th.MUTED,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Folder Name *</label>
            <input
              value={name}
              onChange={e=>{setName(e.target.value);setNameErr(false);}}
              placeholder="e.g. Best London Setups"
              style={{...inp,borderColor:nameErr?th.RED:name?th.GREEN:th.BORDER}}
              autoFocus
            />
            {nameErr&&<div style={{fontSize:10,color:th.RED,marginTop:4}}>Please enter a folder name.</div>}
          </div>

          {/* Tags */}
          <div style={{marginBottom:18}}>
            <label style={{fontSize:10,color:th.MUTED,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:600}}>Tags</label>
            <div style={{display:"flex",gap:7,marginBottom:8}}>
              <input
                value={tagInput}
                onChange={e=>setTagInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===","){e.preventDefault();addTag();}}}
                placeholder="Type tag and press Enter"
                style={{...inp,flex:1}}
              />
              <button onClick={addTag} style={{
                padding:"9px 16px",background:th.YELLOW+"18",border:`1px solid ${th.YELLOW}44`,
                color:th.YELLOW,borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600,
                whiteSpace:"nowrap",transition:"all 0.15s",flexShrink:0,
              }}
              onMouseEnter={e=>e.currentTarget.style.background=th.YELLOW+"30"}
              onMouseLeave={e=>e.currentTarget.style.background=th.YELLOW+"18"}>+ Add</button>
            </div>
            {tags.length>0&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {tags.map(t=>(
                  <span key={t} style={{
                    display:"inline-flex",alignItems:"center",gap:5,
                    background:th.YELLOW+"12",border:`1px solid ${th.YELLOW}33`,
                    color:th.YELLOW,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:500,
                  }}>
                    #{t}
                    <span onClick={()=>removeTag(t)} style={{cursor:"pointer",opacity:0.6,fontSize:13,lineHeight:1}} title="Remove">×</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Trades toggle section */}
          <div style={{border:`1px solid ${th.BORDER}`,borderRadius:12,overflow:"hidden"}}>
            <div
              onClick={()=>setTradesOpen(o=>!o)}
              style={{
                display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"12px 16px",cursor:"pointer",
                background:th.CARD2,userSelect:"none",
              }}
            >
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13}}>📋</span>
                <span style={{fontSize:12,fontWeight:700,color:th.WHITE}}>Trades to Include</span>
                <span style={{
                  fontSize:10,fontWeight:700,
                  background:chosen.size>0?th.GREEN+"18":th.MUTED+"18",
                  color:chosen.size>0?th.GREEN:th.MUTED,
                  border:`1px solid ${chosen.size>0?th.GREEN+"33":th.MUTED+"33"}`,
                  borderRadius:20,padding:"1px 8px",
                }}>{chosen.size} selected</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <button
                  onClick={e=>{
                    e.stopPropagation();
                    allChosen
                      ? setChosen(new Set())
                      : setChosen(new Set(trades.map(t=>t.id)));
                  }}
                  style={{
                    fontSize:10,padding:"3px 9px",borderRadius:6,cursor:"pointer",
                    background:"transparent",border:`1px solid ${th.BORDER}`,color:th.MUTED,
                    fontFamily:"inherit",transition:"all 0.15s",
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=th.GREEN;e.currentTarget.style.color=th.GREEN;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=th.BORDER;e.currentTarget.style.color=th.MUTED;}}
                >{allChosen?"Deselect All":"Select All"}</button>
                <span style={{color:th.MUTED,fontSize:11,transition:"transform 0.2s",display:"inline-block",transform:tradesOpen?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
              </div>
            </div>

            {tradesOpen&&(
              <div style={{maxHeight:240,overflowY:"auto"}}>
                {trades.length===0&&(
                  <div style={{padding:"16px",textAlign:"center",fontSize:12,color:th.MUTED}}>No trades available</div>
                )}
                {trades.map((t,i)=>{
                  const sel = chosen.has(t.id);
                  return (
                    <div
                      key={t.id}
                      onClick={()=>toggleTrade(t.id)}
                      style={{
                        display:"flex",alignItems:"center",gap:10,padding:"9px 16px",
                        cursor:"pointer",transition:"background 0.1s",
                        background:sel?th.GREEN+"08":"transparent",
                        borderTop:i>0?`1px solid ${th.BORDER}`:"none",
                      }}
                      onMouseEnter={e=>{if(!sel)e.currentTarget.style.background=th.CARD2;}}
                      onMouseLeave={e=>{if(!sel)e.currentTarget.style.background="transparent";}}
                    >
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={()=>toggleTrade(t.id)}
                        onClick={e=>e.stopPropagation()}
                        style={{accentColor:th.GREEN,cursor:"pointer",flexShrink:0}}
                      />
                      <span style={{
                        fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4,flexShrink:0,
                        background:t.status==="WIN"?"#0d2a14":"#2a0d0d",
                        color:t.status==="WIN"?th.GREEN:th.RED,
                        border:`1px solid ${t.status==="WIN"?"#1a5a24":"#5a1a1a"}`,
                      }}>{t.status}</span>
                      <span style={{fontSize:11,color:th.CYAN,fontWeight:600,flexShrink:0}}>#{t.symbol}</span>
                      <span style={{fontSize:11,color:th.MUTED,flexShrink:0}}>{t.date}</span>
                      <span style={{
                        fontSize:11,fontWeight:700,marginLeft:"auto",flexShrink:0,
                        color:t.pnl>=0?th.GREEN:th.RED,
                      }}>{t.pnl>=0?"+":""}{t.pnl.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:"16px 24px",borderTop:`1px solid ${th.BORDER}`,flexShrink:0,display:"flex",gap:10}}>
          <button onClick={onClose} style={{
            flex:1,padding:"10px",background:"transparent",
            border:`1px solid ${th.BORDER}`,borderRadius:10,color:th.MUTED,
            fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=th.WHITE;e.currentTarget.style.color=th.WHITE;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=th.BORDER;e.currentTarget.style.color=th.MUTED;}}>
            Cancel
          </button>
          <button onClick={handleSave} style={{
            flex:2,padding:"10px",
            background:`linear-gradient(135deg,${th.YELLOW},#e6a800)`,
            border:"none",borderRadius:10,
            color:"#1a1000",fontSize:12,fontWeight:800,
            cursor:"pointer",fontFamily:"inherit",
            boxShadow:`0 4px 18px ${th.YELLOW}40`,
            transition:"all 0.15s",
          }}
          onMouseEnter={e=>e.currentTarget.style.opacity="0.9"}
          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            📁 Create Folder {chosen.size>0?`(${chosen.size} trade${chosen.size>1?"s":""})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TRADES PAGE ───────────────────────────────────────────────────────────────

export default CreateFolderModal;
