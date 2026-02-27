import { useState, useEffect } from "react";
import { useTheme, useCurrency } from "../contexts";

function Toast({ message, onDone }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  useEffect(()=>{
    const t = setTimeout(onDone, 2200);
    return ()=>clearTimeout(t);
  },[onDone]);
  return (
    <div style={{
      position:"fixed", bottom:24, right:24, zIndex:500,
      background:"rgba(46,204,113,0.15)", border:"1px solid rgba(46,204,113,0.4)",
      backdropFilter:"blur(12px)", borderRadius:10,
      padding:"10px 18px", fontSize:13, color:GREEN, fontWeight:600,
      boxShadow:"0 8px 32px rgba(0,0,0,0.4)",
      animation:"slideIn 0.25s ease",
    }}>
      {message}
    </div>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

export default Toast;
