import { useState, useRef } from "react";
import { useTheme, useCurrency } from "../../contexts";

function ImportAccountModal({ onMerge, onClose }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState("");
  const [fileName, setFileName] = useState("");
  const [rawName,  setRawName]  = useState("");
  const [preview,  setPreview]  = useState(null);
  const fileRef = useRef();

  const parseFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const trades = data.trades || (Array.isArray(data) ? data : null);
        if (!trades || !Array.isArray(trades)) throw new Error("Invalid format");
        const settings = data.settings || {};
        const name = file.name.replace(/\.eyzon$/i,"").replace(/EyZonCharts_/i,"");
        setFileName(file.name);
        setRawName(name);
        setPreview({ count:trades.length, trades, accounts: settings.accounts||[], exported: data.exported });
        setError("");
      } catch {
        setError("❌ Invalid file. Please use a .eyzon file exported from EyZonCharts.");
        setPreview(null); setFileName(""); setRawName("");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.75)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)"}}>
      <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(46,204,113,0.1) 0%,transparent 70%)",top:"10%",left:"20%",pointerEvents:"none"}}/>
      <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:24,padding:"40px 44px",width:500,maxWidth:"92vw",position:"relative",boxShadow:"0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",backdropFilter:"blur(40px)",WebkitBackdropFilter:"blur(40px)"}}>
        <div style={{position:"absolute",top:0,left:24,right:24,height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)"}}/>
        <button onClick={onClose} style={{position:"absolute",top:16,right:18,background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:18,cursor:"pointer",lineHeight:1,padding:4}} onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.3)"}>✕</button>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:52,height:52,borderRadius:14,background:"rgba(46,204,113,0.1)",border:"1px solid rgba(46,204,113,0.25)",marginBottom:14}}>
            <span style={{fontSize:24}}>🏦</span>
          </div>
          <h2 style={{margin:0,fontSize:19,fontWeight:800,color:"#f0f0f0"}}>Import New Account</h2>
          <p style={{margin:"6px 0 0",fontSize:12,color:"rgba(255,255,255,0.35)"}}>Trades will be merged and grouped in a folder</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);parseFile(e.dataTransfer.files[0]);}}
          onClick={()=>fileRef.current.click()}
          style={{border:`2px dashed ${dragging?"rgba(46,204,113,0.6)":preview?"rgba(46,204,113,0.4)":"rgba(255,255,255,0.1)"}`,borderRadius:14,padding:"24px 20px",textAlign:"center",cursor:"pointer",transition:"all 0.2s",background:dragging?"rgba(46,204,113,0.05)":preview?"rgba(46,204,113,0.03)":"rgba(255,255,255,0.02)",marginBottom:14}}>
          <input ref={fileRef} type="file" accept=".eyzon,.json" onChange={e=>parseFile(e.target.files[0])} style={{display:"none"}}/>
          {preview ? (
            <>
              <div style={{fontSize:26,marginBottom:6}}>✅</div>
              <div style={{fontSize:13,color:"#2ecc71",fontWeight:600,marginBottom:3}}>{fileName}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>
                {preview.count} trades · will create folder <b style={{color:"rgba(255,255,255,0.7)"}}>"{rawName}"</b>
                {preview.exported&&<> · {new Date(preview.exported).toLocaleDateString()}</>}
              </div>
            </>
          ) : (
            <>
              <div style={{fontSize:30,marginBottom:8}}>📂</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",fontWeight:500,marginBottom:3}}>{dragging?"Drop it here!":"Drop your .eyzon file here"}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.25)"}}>or click to browse</div>
            </>
          )}
        </div>

        {error&&<div style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:8,padding:"8px 14px",fontSize:12,color:"#ff6b6b",marginBottom:12,textAlign:"center"}}>{error}</div>}

        {preview&&(
          <div style={{background:"rgba(46,204,113,0.06)",border:"1px solid rgba(46,204,113,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:11,color:"rgba(255,255,255,0.5)",lineHeight:1.6}}>
            📁 A new folder <b style={{color:"#2ecc71"}}>"{rawName}"</b> will be created containing all {preview.count} imported trades.
            {preview.accounts&&preview.accounts.length>0&&<><br/>🏦 Account(s): <b style={{color:"rgba(0,212,255,0.8)"}}>{preview.accounts.join(", ")}</b> will be added if not already present.</>}
          </div>
        )}

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"11px 0",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,color:"rgba(255,255,255,0.5)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.color="#fff";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color="rgba(255,255,255,0.5)";}}>
            Cancel
          </button>
          <button onClick={()=>preview&&onMerge(preview,rawName)} disabled={!preview} style={{
            flex:2,padding:"11px 0",border:"none",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:preview?"pointer":"default",borderRadius:10,transition:"all 0.2s",
            background:preview?"linear-gradient(135deg,#2ecc71,#27ae60)":"rgba(46,204,113,0.15)",
            color:preview?"#061306":"rgba(46,204,113,0.3)",
            boxShadow:preview?"0 4px 20px rgba(46,204,113,0.3)":"none",
          }}>
            {preview?`Merge ${preview.count} Trades →`:"Select a File First"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ImportAccountModal;
