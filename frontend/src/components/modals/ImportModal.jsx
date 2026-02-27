import { useState, useRef } from "react";
import { useTheme, useCurrency } from "../../contexts";

function ImportModal({ onImport, onFresh }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const [dragging, setDragging] = useState(false);
  const [error,    setError]    = useState("");
  const [fileName, setFileName] = useState("");
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
        setFileName(file.name);
        setPreview({
          count:      trades.length,
          trades,
          exported:   data.exported,
          accounts:   settings.accounts   || null,
          customOpts: settings.customOpts || null,
        });
        setError("");
      } catch {
        setError("❌ Invalid file. Please use a .eyzon file exported from EyZonCharts.");
        setPreview(null);
        setFileName("");
      }
    };
    reader.readAsText(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    parseFile(e.dataTransfer.files[0]);
  };

  const onFileChange = (e) => parseFile(e.target.files[0]);

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.7)",
      backdropFilter:"blur(20px)",
      WebkitBackdropFilter:"blur(20px)",
    }}>
      {/* Ambient glow blobs */}
      <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(46,204,113,0.12) 0%,transparent 70%)",top:"10%",left:"20%",pointerEvents:"none"}}/>
      <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(0,212,255,0.08) 0%,transparent 70%)",bottom:"15%",right:"25%",pointerEvents:"none"}}/>

      {/* Glass card */}
      <div style={{
        background:"rgba(255,255,255,0.04)",
        border:"1px solid rgba(255,255,255,0.12)",
        borderRadius:24,
        padding:"40px 44px",
        width:480,
        maxWidth:"92vw",
        position:"relative",
        boxShadow:"0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
        backdropFilter:"blur(40px)",
        WebkitBackdropFilter:"blur(40px)",
      }}>
        {/* Top shimmer line */}
        <div style={{position:"absolute",top:0,left:24,right:24,height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)",borderRadius:1}}/>

        {/* Logo + Title */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:56,height:56,borderRadius:16,background:"rgba(46,204,113,0.12)",border:"1px solid rgba(46,204,113,0.25)",marginBottom:16,boxShadow:"0 0 24px rgba(46,204,113,0.15)"}}>
            <svg width="28" height="28" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke={GREEN} strokeWidth="3"/>
              <path d="M18 18 L18 5 A13 13 0 0 1 29 22 Z" fill={GREEN}/>
              <circle cx="18" cy="18" r="5" fill="rgba(0,0,0,0.5)"/>
            </svg>
          </div>
          <h1 style={{margin:0,fontSize:22,fontWeight:800,color:WHITE,letterSpacing:"-0.02em"}}>EyZonCharts</h1>
          <p style={{margin:"6px 0 0",fontSize:13,color:"rgba(255,255,255,0.4)"}}>Import your journal or start fresh</p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault();setDragging(true);}}
          onDragLeave={()=>setDragging(false)}
          onDrop={onDrop}
          onClick={()=>fileRef.current.click()}
          style={{
            border:`2px dashed ${dragging?"rgba(46,204,113,0.6)":preview?"rgba(46,204,113,0.4)":"rgba(255,255,255,0.1)"}`,
            borderRadius:14,
            padding:"28px 20px",
            textAlign:"center",
            cursor:"pointer",
            transition:"all 0.2s",
            background: dragging?"rgba(46,204,113,0.05)":preview?"rgba(46,204,113,0.03)":"rgba(255,255,255,0.02)",
            marginBottom:14,
          }}>
          <input ref={fileRef} type="file" accept=".eyzon,.json" onChange={onFileChange} style={{display:"none"}}/>

          {preview ? (
            <>
              <div style={{fontSize:28,marginBottom:8}}>✅</div>
              <div style={{fontSize:13,color:GREEN,fontWeight:600,marginBottom:4}}>{fileName}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>
                {preview.count} trades found
                {preview.exported && <> · Exported {new Date(preview.exported).toLocaleDateString()}</>}
                {preview.accounts && <> · <span style={{color:"rgba(46,204,113,0.6)"}}>⚙ settings included</span></>}
              </div>
            </>
          ) : (
            <>
              <div style={{fontSize:32,marginBottom:10}}>📂</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",fontWeight:500,marginBottom:4}}>
                {dragging ? "Drop it here!" : "Drop your .eyzon file here"}
              </div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.25)"}}>or click to browse</div>
            </>
          )}
        </div>

        {error && (
          <div style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",borderRadius:8,padding:"8px 14px",fontSize:12,color:RED,marginBottom:12,textAlign:"center"}}>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{display:"flex",gap:10,marginBottom:8}}>
          <button
            onClick={onFresh}
            style={{
              flex:1, border:"1px solid rgba(255,255,255,0.1)",
              background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.5)",
              borderRadius:10, padding:"11px 0", fontSize:13, cursor:"pointer",
              fontFamily:"inherit", transition:"all 0.2s",
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.color=WHITE;}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color="rgba(255,255,255,0.5)";}}>
            Start Fresh
          </button>
          <button
            onClick={()=>{ try{ window.open("/CSV_to_EyZon_Converter.html","_blank"); }catch(e){} }}
            style={{
              flex:1, border:"1px solid rgba(0,212,255,0.2)",
              background:"rgba(0,212,255,0.05)", color:"rgba(0,212,255,0.7)",
              borderRadius:10, padding:"11px 0", fontSize:12, cursor:"pointer",
              fontFamily:"inherit", transition:"all 0.2s", display:"flex",
              alignItems:"center", justifyContent:"center", gap:5,
            }}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(0,212,255,0.12)";e.currentTarget.style.color="#00d4ff";e.currentTarget.style.borderColor="rgba(0,212,255,0.45)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(0,212,255,0.05)";e.currentTarget.style.color="rgba(0,212,255,0.7)";e.currentTarget.style.borderColor="rgba(0,212,255,0.2)";}}>
            <span style={{fontSize:15}}>🔄</span> CSV Converter
          </button>
          <button
            onClick={()=>preview&&onImport(preview)}
            disabled={!preview}
            style={{
              flex:1.5, border:"none",
              background: preview
                ? "linear-gradient(135deg,#2ecc71,#27ae60)"
                : "rgba(46,204,113,0.15)",
              color: preview ? "#061306" : "rgba(46,204,113,0.3)",
              borderRadius:10, padding:"11px 0", fontSize:13,
              fontWeight:700, cursor: preview?"pointer":"default",
              fontFamily:"inherit", transition:"all 0.2s",
              boxShadow: preview?"0 4px 20px rgba(46,204,113,0.3)":"none",
            }}>
            {preview ? `Import ${preview.count} Trades →` : "Select a File First"}
          </button>
        </div>

        <p style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.2)",marginTop:16,marginBottom:0}}>
          Files are stored locally · Nothing is uploaded anywhere
        </p>
      </div>
    </div>
  );
}

// ── SAVE TOAST ─────────────────────────────────────────────────────────────────

export default ImportModal;
