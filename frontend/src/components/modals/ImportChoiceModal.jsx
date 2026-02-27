import { useState } from "react";
import { useTheme, useCurrency } from "../../contexts";

function ImportChoiceModal({ onImportSettings, onImportAccount, onClose }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.75)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
      <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(46,204,113,0.1) 0%,transparent 70%)",top:"10%",left:"20%",pointerEvents:"none"}}/>
      <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(0,212,255,0.07) 0%,transparent 70%)",bottom:"15%",right:"25%",pointerEvents:"none"}}/>
      <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:24,padding:"40px 44px",width:460,maxWidth:"92vw",position:"relative",boxShadow:"0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",backdropFilter:"blur(40px)",WebkitBackdropFilter:"blur(40px)"}}>
        <div style={{position:"absolute",top:0,left:24,right:24,height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)"}}/>
        {/* Close */}
        <button onClick={onClose} style={{position:"absolute",top:16,right:18,background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:18,cursor:"pointer",lineHeight:1,padding:4}} onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.3)"}>✕</button>
        {/* Header */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:52,height:52,borderRadius:14,background:"rgba(0,212,255,0.1)",border:"1px solid rgba(0,212,255,0.25)",marginBottom:14,boxShadow:"0 0 20px rgba(0,212,255,0.12)"}}>
            <span style={{fontSize:24}}>📂</span>
          </div>
          <h2 style={{margin:0,fontSize:20,fontWeight:800,color:"#f0f0f0",letterSpacing:"-0.02em"}}>What would you like to import?</h2>
          <p style={{margin:"8px 0 0",fontSize:12,color:"rgba(255,255,255,0.35)"}}>You already have trades & settings loaded</p>
        </div>
        {/* Options */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <button onClick={onImportAccount} style={{
            width:"100%",padding:"18px 20px",border:"1px solid rgba(46,204,113,0.3)",background:"rgba(46,204,113,0.06)",
            borderRadius:14,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",textAlign:"left",
          }}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(46,204,113,0.12)";e.currentTarget.style.borderColor="rgba(46,204,113,0.55)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(46,204,113,0.06)";e.currentTarget.style.borderColor="rgba(46,204,113,0.3)";}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:26}}>🏦</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#f0f0f0",marginBottom:3}}>Import New Account</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",lineHeight:1.5}}>Merge trades from another .eyzon file into your journal. New trades will be grouped in a folder named after the file.</div>
              </div>
              <span style={{marginLeft:"auto",fontSize:18,color:"rgba(46,204,113,0.7)",flexShrink:0}}>→</span>
            </div>
          </button>
          <button onClick={onImportSettings} style={{
            width:"100%",padding:"18px 20px",border:"1px solid rgba(0,212,255,0.25)",background:"rgba(0,212,255,0.04)",
            borderRadius:14,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s",textAlign:"left",
          }}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(0,212,255,0.10)";e.currentTarget.style.borderColor="rgba(0,212,255,0.5)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(0,212,255,0.04)";e.currentTarget.style.borderColor="rgba(0,212,255,0.25)";}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:26}}>⚙️</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#f0f0f0",marginBottom:3}}>Replace / Re-import Settings</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",lineHeight:1.5}}>Start over with a new .eyzon file — replaces all current trades, accounts and settings.</div>
              </div>
              <span style={{marginLeft:"auto",fontSize:18,color:"rgba(0,212,255,0.6)",flexShrink:0}}>→</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportChoiceModal;
