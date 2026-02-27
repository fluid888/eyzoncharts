import { useState } from "react";
import { useTheme, useCurrency } from "../contexts";
import { SESSION_DEF, TIMEZONES_MAIN } from "../constants";

function SessionTimePicker({ hourValue, onHourChange, sessionValue, onSessionChange, timezone, hourFormat }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const [activeSession, setActiveSession] = useState(sessionValue||"London");
  // hourValue is stored as "HH:MM" 24h string internally
  const [rawTime, setRawTime] = useState(hourValue||"");

  const pickSession = name => { setActiveSession(name); onSessionChange(name); };
  const sd = SESSION_DEF[activeSession];

  // Format time for display respecting hourFormat setting
  const formatDisplayTime = (raw) => {
    if(!raw) return null;
    try {
      const [hh,mm] = raw.split(":").map(Number);
      if(isNaN(hh)||isNaN(mm)) return raw;
      if(hourFormat==="12") {
        const period = hh>=12?"PM":"AM";
        const h12 = hh%12||12;
        return `${h12}:${String(mm).padStart(2,"0")} ${period}`;
      }
      return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
    } catch{ return raw; }
  };

  // Current local time in the user's chosen timezone
  const nowInTZ = () => {
    try {
      return new Date().toLocaleTimeString("en-US",{
        timeZone:timezone||"UTC",
        hour:"2-digit",minute:"2-digit",
        hour12:hourFormat==="12"
      });
    } catch{ return ""; }
  };

  const detectSession = (timeVal) => {
    if(!timeVal) return null;
    try {
      const [hh] = timeVal.split(":").map(Number);
      if(hh>=0&&hh<=6)   return "Asia";
      if(hh>=7&&hh<=12)  return "London";
      if(hh>=13&&hh<=21) return "New York";
      return "Asia"; // 22-23
    } catch{ return null; }
  };

  const handleTimeChange = (val) => {
    setRawTime(val);
    onHourChange(val);
    const detected = detectSession(val);
    if(detected && detected !== activeSession) {
      setActiveSession(detected);
      onSessionChange(detected);
    }
  };

  const fillNow = () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-GB",{
        timeZone:timezone||"UTC",hour:"2-digit",minute:"2-digit",hour12:false
      }).formatToParts(now);
      const h = parts.find(p=>p.type==="hour")?.value||"00";
      const m = parts.find(p=>p.type==="minute")?.value||"00";
      const val = `${h.padStart(2,"0")}:${m.padStart(2,"0")}`;
      handleTimeChange(val);
    } catch{}
  };

  const lbl = {fontSize:10,color:MUTED,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:"0.08em"};

  return (
    <div style={{gridColumn:"1/-1"}}>
      <label style={lbl}>Trade Time</label>
      <div style={{display:"flex",gap:6,marginBottom:8}}>
        {Object.entries(SESSION_DEF).map(([name,s])=>(
          <button key={name} type="button" onClick={()=>pickSession(name)}
            style={{flex:1,padding:"8px 6px",borderRadius:8,cursor:"pointer",
              border:`1px solid ${activeSession===name?s.color:BORDER}`,
              background:activeSession===name?s.color+"22":"transparent",
              color:activeSession===name?s.color:MUTED,
              fontSize:11,fontWeight:activeSession===name?700:400,
              fontFamily:"inherit",transition:"all 0.14s",
              display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
            <span style={{fontSize:14}}>{s.icon}</span>{name}
          </button>
        ))}
      </div>

      {/* Clean time input row */}
      <div style={{display:"flex",gap:7,alignItems:"stretch"}}>
        <div style={{flex:1,position:"relative"}}>
          <input
            type="time"
            value={rawTime}
            onChange={e=>handleTimeChange(e.target.value)}
            style={{
              width:"100%",background:CARD2,border:`1px solid ${rawTime?sd.color:BORDER}`,
              borderRadius:8,color:WHITE,padding:"10px 12px",fontSize:13,outline:"none",
              fontFamily:"inherit",cursor:"pointer",boxSizing:"border-box",
              colorScheme:"dark",
            }}
          />
        </div>
        <button
          type="button"
          onClick={fillNow}
          title="Fill current time"
          style={{
            padding:"10px 12px",borderRadius:8,cursor:"pointer",
            border:`1px solid ${BORDER}`,background:"transparent",
            color:CYAN,fontSize:11,fontFamily:"inherit",
            whiteSpace:"nowrap",transition:"all 0.15s",flexShrink:0,
          }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=CYAN;e.currentTarget.style.background=CYAN+"12";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.background="transparent";}}>
          ⏱ Now
        </button>
      </div>

      {/* Display row */}
      <div style={{marginTop:7,padding:"8px 12px",background:CARD2,border:`1px solid ${rawTime?sd.color:BORDER}`,
        borderRadius:8,display:"flex",alignItems:"center",gap:8,transition:"border-color 0.2s"}}>
        <span style={{fontSize:14}}>{sd.icon}</span>
        <span style={{fontSize:12,fontWeight:rawTime?700:400,color:rawTime?sd.color:MUTED,letterSpacing:"0.02em"}}>
          {rawTime?formatDisplayTime(rawTime):"No time selected"}
        </span>
        <span style={{marginLeft:"auto",fontSize:10,color:MUTED}}>{activeSession}</span>
        <span style={{fontSize:10,color:MUTED}}>·</span>
        <span style={{fontSize:10,color:MUTED}}>Now: {nowInTZ()}</span>
      </div>
    </div>
  );
}


export default SessionTimePicker;
