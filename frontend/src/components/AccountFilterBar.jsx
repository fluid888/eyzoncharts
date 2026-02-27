import { useState, useEffect, useRef } from "react";
import { useTheme, useCurrency } from "../contexts";

function AccountFilterBar({ accounts, analyticsAccount, setAnalyticsAccount }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const colors = ["#00d4ff","#2ecc71","#f5c842","#e07be0","#ff6b6b","#4a90d9","#ff9f43","#a29bfe"];

  useEffect(()=>{
    const h = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{background:CARD2,border:`1px solid ${analyticsAccount!=="All accounts"?GREEN+"55":BORDER}`,borderRadius:8,padding:"6px 13px",color:WHITE,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:7,fontFamily:"inherit",fontWeight:500,transition:"border-color 0.15s"}}>
        <span style={{width:7,height:7,borderRadius:"50%",background:analyticsAccount==="All accounts"?CYAN:GREEN,display:"inline-block",flexShrink:0}}/>
        {analyticsAccount}
        <span style={{fontSize:10,color:MUTED,marginLeft:2}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,minWidth:190,background:"#1c1c1c",border:`1px solid ${BORDER}`,borderRadius:10,boxShadow:"0 8px 28px rgba(0,0,0,0.7)",zIndex:300,overflow:"hidden"}}>
          <div style={{padding:"8px 12px 4px",fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:`1px solid ${BORDER}`}}>Filter by account</div>
          {["All accounts",...(accounts||[])].map((a,i)=>(
            <div key={a} onClick={()=>{setAnalyticsAccount(a);setOpen(false);}}
              style={{padding:"9px 14px",fontSize:12,cursor:"pointer",background:analyticsAccount===a?"#0d2a1e":"transparent",color:analyticsAccount===a?GREEN:WHITE,display:"flex",alignItems:"center",gap:8,transition:"background 0.1s"}}
              onMouseEnter={e=>{if(analyticsAccount!==a)e.currentTarget.style.background="#252525";}}
              onMouseLeave={e=>{if(analyticsAccount!==a)e.currentTarget.style.background="transparent";}}>
              <span style={{width:7,height:7,borderRadius:"50%",background:a==="All accounts"?CYAN:colors[i%colors.length],display:"inline-block",flexShrink:0}}/>
              {a}
              {analyticsAccount===a&&<span style={{marginLeft:"auto",fontSize:10}}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────

export default AccountFilterBar;
