import {  } from "react";
import { useTheme, useCurrency } from "../../contexts";

function DeleteConfirm({ count, onConfirm, onCancel }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:CARD,border:`1px solid ${RED}44`,borderRadius:12,padding:28,width:340,textAlign:"center"}}>
        <div style={{fontSize:30,marginBottom:10}}>🗑️</div>
        <h3 style={{margin:"0 0 8px",color:WHITE,fontSize:15}}>Delete {count} trade{count>1?"s":""}</h3>
        <p style={{color:MUTED,fontSize:12,margin:"0 0 20px"}}>This cannot be undone.</p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={onCancel} style={{background:CARD2,border:`1px solid ${BORDER}`,color:MUTED,borderRadius:6,padding:"8px 18px",cursor:"pointer",fontSize:12}}>Cancel</button>
          <button onClick={onConfirm} style={{background:RED,border:"none",color:WHITE,borderRadius:6,padding:"8px 18px",fontWeight:700,cursor:"pointer",fontSize:12}}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ── CREATE FOLDER MODAL ───────────────────────────────────────────────────────

export default DeleteConfirm;
