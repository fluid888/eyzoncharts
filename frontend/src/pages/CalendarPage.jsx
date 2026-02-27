import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency } from "../contexts";
import { fmtHour, getDaysInMonth, getFirstDay } from "../utils/helpers";
import { MONTH_NAMES, SESSION_COLORS } from "../constants";
import AccountFilterBar from "../components/AccountFilterBar";
import { Breadcrumb } from "../components/common";




function DayView({ trades, date, todayStr, allTrades, hourFormat="12" }) {
  const { fmt, toLocal, symbol } = useCurrency();
  const isToday = date === todayStr;
  const dayTrades = trades.filter(t=>t.date===date);
  const totalPnl  = dayTrades.reduce((s,t)=>s+t.pnl,0);
  const wins      = dayTrades.filter(t=>t.pnl>0);
  const losses    = dayTrades.filter(t=>t.pnl<0);

  // All-time averages across all days for comparison
  const allDayWinRates = useMemo(()=>{
    const byDate={};
    (allTrades||[]).forEach(t=>{ if(!byDate[t.date]) byDate[t.date]=[]; byDate[t.date].push(t); });
    return Object.values(byDate).map(ts=>ts.filter(t=>t.pnl>0).length/ts.length*100);
  },[allTrades]);
  const allTimeAvgWinRate = allDayWinRates.length ? allDayWinRates.reduce((s,v)=>s+v,0)/allDayWinRates.length : 0;
  const allTimeAvgRR = (allTrades||[]).length ? (allTrades||[]).reduce((s,t)=>s+(t.rr||0),0)/(allTrades||[]).length : 0;

  // Build running PNL candlestick data — one candle per trade in time order
  const HOUR_ORDER = [
    "12-1am","1-2am","2-3am","3-4am","4-5am","5-6am","6-7am","7-8am",
    "8-9am","9-10am","10-11am","11-12am","12-1pm","1-2pm","2-3pm","3-4pm",
    "4-5pm","5-6pm","6-7pm","7-8pm","8-9pm","9-10pm","10-11pm","11-12pm",
  ];
  // Sort newest → oldest for display list (reverse hour order)
  const sortedTradesAsc  = [...dayTrades].sort((a,b)=>HOUR_ORDER.indexOf(a.hour)-HOUR_ORDER.indexOf(b.hour));
  const sortedTradesDesc = [...sortedTradesAsc].reverse();

  // One candlestick per individual trade in chronological order
  let cumBefore = 0;
  const candleData = sortedTradesAsc.map(t=>{
    const open  = cumBefore;
    const close = cumBefore + t.pnl;
    const high  = Math.max(open, close);
    const low   = Math.min(open, close);
    const candle = { hour: t.hour||"—", open, close, high, low, symbol: t.symbol, pnl: t.pnl };
    cumBefore = close;
    return candle;
  });

  // Group by hour for timeline slots (still ascending for timeline)
  const byHour = {};
  sortedTradesAsc.forEach(t=>{ if(!byHour[t.hour]) byHour[t.hour]=[]; byHour[t.hour].push(t); });
  const usedSlots = HOUR_ORDER.filter(h=>byHour[h]);

  if (dayTrades.length===0) {
    return (
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"40px 24px",textAlign:"center",marginTop:8}}>
        <div style={{fontSize:36,marginBottom:12}}>📭</div>
        <div style={{fontSize:14,color:MUTED,fontWeight:500}}>No trades on {isToday?"today":date}</div>
        <div style={{fontSize:11,color:"#444",marginTop:6}}>Trades added for this date will appear here.</div>
      </div>
    );
  }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:8}}>
      {/* Stat row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        {[
          {label:"Net P&L",value:fmt(totalPnl),color:totalPnl>=0?GREEN:RED},
          {label:"Trades",value:dayTrades.length,color:WHITE},
          {label:"Win Rate",value:`${dayTrades.length?(wins.length/dayTrades.length*100).toFixed(0):0}%`,color:wins.length>losses.length?GREEN:RED,
           sub:`Avg all time: ${allTimeAvgWinRate.toFixed(0)}%`,subColor:MUTED},
          {label:"Avg R:R",value:`${dayTrades.length?(dayTrades.reduce((s,t)=>s+(t.rr||0),0)/dayTrades.length).toFixed(1):"-"}R`,color:CYAN,
           sub:`Avg all time: ${allTimeAvgRR.toFixed(1)}R`,subColor:MUTED},
        ].map(s=>(
          <div key={s.label} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:"14px 16px"}}>
            <div style={{fontSize:10,color:MUTED,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.label}</div>
            <div style={{fontSize:24,fontWeight:800,color:s.color,letterSpacing:"-0.02em"}}>{s.value}</div>
            {s.sub&&<div style={{fontSize:10,color:s.subColor,marginTop:4}}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Main 2-column layout */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

        {/* LEFT — Running P&L Candlestick */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px 14px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.07em",display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:14}}>📊</span> Running P&L {isToday&&<span style={{color:GREEN,fontSize:10,fontWeight:700,background:"rgba(46,204,113,0.12)",border:`1px solid rgba(46,204,113,0.3)`,borderRadius:4,padding:"1px 6px"}}>LIVE</span>}
          </div>
          {/* Custom SVG candlestick */}
          <CandlestickChart data={candleData} totalPnl={totalPnl} hourFormat={hourFormat}/>
        </div>

        {/* RIGHT — Time-of-day boxes */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px 14px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:14,textTransform:"uppercase",letterSpacing:"0.07em",display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:14}}>🕐</span> Trade Timeline
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:300,overflowY:"auto"}}>
            {usedSlots.map(hour=>{
              const ts = byHour[hour]||[];
              const slotPnl = ts.reduce((s,t)=>s+t.pnl,0);
              return (
                <div key={hour} style={{border:`1px solid ${slotPnl>=0?"#1a4a24":"#4a1a1a"}`,borderRadius:8,padding:"10px 12px",background:slotPnl>=0?"#0a2416":"#2a0a0a"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:11,fontWeight:700,color:WHITE}}>{fmtHour(hour,hourFormat)}</span>
                    <span style={{fontSize:13,fontWeight:800,color:slotPnl>=0?GREEN:RED}}>{slotPnl>=0?"+":""}${slotPnl.toFixed(0)}</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {ts.map((t,i)=>(
                      <div key={i} style={{background:t.pnl>=0?"rgba(46,204,113,0.15)":"rgba(255,107,107,0.15)",border:`1px solid ${t.pnl>=0?"#2ecc7155":"#ff6b6b55"}`,borderRadius:6,padding:"5px 8px",fontSize:10}}>
                        <div style={{color:t.pnl>=0?GREEN:RED,fontWeight:700}}>{t.symbol}</div>
                        <div style={{color:MUTED,marginTop:1}}>{t.side} · {t.model}</div>
                        <div style={{color:t.pnl>=0?GREEN:RED,fontWeight:600,marginTop:2}}>{t.pnl>=0?"+":""}${t.pnl}</div>
                        {t.session&&<div style={{color:SESSION_COLORS[t.session]||MUTED,fontSize:9,marginTop:1}}>● {t.session}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom trade list - newest first */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"16px 18px"}}>
        <div style={{fontSize:11,color:MUTED,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.07em"}}>All Trades</div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {sortedTradesDesc.map((t,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"90px 90px 70px 60px 60px 1fr auto",gap:10,alignItems:"center",padding:"8px 10px",background:CARD2,borderRadius:8,border:`1px solid ${BORDER}`}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:WHITE}}>{t.symbol}</div>
                {t.hour&&<div style={{fontSize:9,color:MUTED,marginTop:1}}>{fmtHour(t.hour,hourFormat)}</div>}
              </div>
              <span style={{fontSize:10,color:SESSION_COLORS[t.session]||MUTED}}>● {t.session||"—"}</span>
              <span style={{fontSize:10,color:t.side==="Long"?GREEN:RED,fontWeight:600}}>{t.side}</span>
              <span style={{fontSize:10,color:CYAN}}>RR {t.rr?.toFixed(1)||"—"}</span>
              <span style={{fontSize:10,color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.model}</span>
              <span/>
              <span style={{fontSize:12,fontWeight:800,color:t.pnl>=0?GREEN:RED,textAlign:"right"}}>{t.pnl>=0?"+":""}${t.pnl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Candlestick SVG chart - one candle per individual trade
function CandlestickChart({ data, totalPnl=0, hourFormat="12" }) {
  if(!data||data.length===0) return <div style={{color:MUTED,fontSize:12,textAlign:"center",paddingTop:60}}>No data</div>;
  const W=420,H=200,PAD={top:16,right:20,bottom:36,left:52};
  const innerW = W-PAD.left-PAD.right, innerH = H-PAD.top-PAD.bottom;

  const allVals = data.flatMap(d=>[d.open,d.close,d.high,d.low,0]);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const range = maxV-minV || 1;
  const toY = v=>PAD.top+((maxV-v)/range)*innerH;

  const barW = Math.max(12, Math.floor(innerW/Math.max(data.length,1)*0.55));
  const gap  = innerW/Math.max(data.length,1);

  const zero = toY(0);
  const nTicks = 5;
  const ticks  = Array.from({length:nTicks},(_,i)=>minV+(range/(nTicks-1))*i);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible"}}>
      {/* Grid lines */}
      {ticks.map((v,i)=>(
        <g key={i}>
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(v)} y2={toY(v)} stroke="#252525" strokeWidth={1}/>
          <text x={PAD.left-6} y={toY(v)+4} textAnchor="end" fill="#555" fontSize={9}>{v>=0?`+${v.toFixed(0)}`:v.toFixed(0)}</text>
        </g>
      ))}
      {/* Zero line */}
      <line x1={PAD.left} x2={W-PAD.right} y1={zero} y2={zero} stroke="#404040" strokeWidth={1} strokeDasharray="3,3"/>

      {/* Candles - one per trade */}
      {data.map((d,i)=>{
        const cx = PAD.left + i*gap + gap/2;
        const isGreen = d.close >= d.open;
        const isDoji  = Math.abs(d.close - d.open) < 0.01;
        const color   = isDoji ? "#888" : isGreen ? GREEN : RED;
        const bodyTop = isDoji ? toY(d.close)-1 : Math.min(toY(d.open),toY(d.close));
        const bodyBot = isDoji ? toY(d.close)+1 : Math.max(toY(d.open),toY(d.close));
        const bodyH   = Math.max(bodyBot-bodyTop, isDoji?2:2);
        return (
          <g key={i}>
            {/* Wick */}
            <line x1={cx} x2={cx} y1={toY(d.high)} y2={toY(d.low)} stroke={color} strokeWidth={1.5} opacity={0.6}/>
            {/* Body */}
            <rect x={cx-barW/2} y={bodyTop} width={barW} height={bodyH} fill={isDoji?"transparent":color} stroke={color} strokeWidth={isDoji?1.5:0} opacity={0.88} rx={2}/>
            {/* Symbol label */}
            <text x={cx} y={H-18} textAnchor="middle" fill="#555" fontSize={7.5}>{d.symbol?.replace("/","")?.slice(0,6)||""}</text>
            {/* Hour label */}
            <text x={cx} y={H-8} textAnchor="middle" fill="#444" fontSize={7}>{hourFormat==="24"?fmtHour(d.hour,"24"):d.hour?.replace("am","a").replace("pm","p")}</text>
          </g>
        );
      })}

      {/* Running PNL close line */}
      {data.length>1&&(
        <polyline
          points={data.map((d,i)=>`${PAD.left+i*gap+gap/2},${toY(d.close)}`).join(" ")}
          fill="none" stroke={totalPnl>=0?GREEN:RED} strokeWidth={1.5} opacity={0.35} strokeDasharray="4,3"
        />
      )}
    </svg>
  );
}

function CalendarPage({ trades: allTrades, setPage, accounts, analyticsAccount, setAnalyticsAccount, hourFormat="12" }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const { fmt, toLocal, symbol } = useCurrency();
  const today    = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // view: "month" | "week" | "year" | "day"
  const [view,         setView]         = useState("month");
  const [calYear,      setCalYear]      = useState(today.getFullYear());
  const [calMonth,     setCalMonth]     = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  // weekOffset: 0 = current week, -1 = last week, +1 = next week, etc.
  const [weekOffset, setWeekOffset] = useState(0);
  const [todayMenuOpen, setTodayMenuOpen] = useState(false);
  const todayRef = useRef();

  // Account filtering
  const trades = useMemo(()=>analyticsAccount==="All accounts"?allTrades:allTrades.filter(t=>t.account===analyticsAccount),[allTrades,analyticsAccount]);

  useEffect(()=>{
    const h = e=>{ if(todayRef.current&&!todayRef.current.contains(e.target)) setTodayMenuOpen(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  // ── Derived week bounds based on weekOffset ──
  const viewWeekStart = useMemo(()=>{
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + weekOffset*7);
    return d;
  },[weekOffset]);
  const viewWeekEnd = useMemo(()=>{
    const d = new Date(viewWeekStart);
    d.setDate(viewWeekStart.getDate()+6);
    return d;
  },[viewWeekStart]);
  const viewWeekStartStr = viewWeekStart.toISOString().split("T")[0];
  const viewWeekEndStr   = viewWeekEnd.toISOString().split("T")[0];

  // For "current week" highlighting in month view
  const realWeekStart = new Date(today); realWeekStart.setDate(today.getDate()-today.getDay());
  const realWeekEnd   = new Date(today); realWeekEnd.setDate(today.getDate()+(6-today.getDay()));
  const realWeekStartStr = realWeekStart.toISOString().split("T")[0];
  const realWeekEndStr   = realWeekEnd.toISOString().split("T")[0];

  const pnlByDate = useMemo(()=>{const m={};trades.forEach(t=>{m[t.date]=(m[t.date]||0)+t.pnl;});return m;},[trades]);

  // Month view data
  const daysInMonth = getDaysInMonth(calYear,calMonth), firstDay = getFirstDay(calYear,calMonth);
  const cells = []; for(let i=0;i<firstDay;i++) cells.push(null); for(let d=1;d<=daysInMonth;d++) cells.push(d);
  const monthTrades = trades.filter(t=>{ const d=new Date(t.date); return d.getFullYear()===calYear&&d.getMonth()===calMonth; });
  const monthPnl  = monthTrades.reduce((s,t)=>s+t.pnl,0);
  const monthWins = monthTrades.filter(t=>t.pnl>0).length;

  // Week view data
  const weekDays = Array.from({length:7},(_,i)=>{
    const d = new Date(viewWeekStart); d.setDate(viewWeekStart.getDate()+i);
    return d.toISOString().split("T")[0];
  });
  const weekTrades = trades.filter(t=>t.date>=viewWeekStartStr&&t.date<=viewWeekEndStr);
  const weekPnl    = weekTrades.reduce((s,t)=>s+t.pnl,0);
  const weekWins   = weekTrades.filter(t=>t.pnl>0).length;
  const isCurrentWeek = weekOffset===0;

  // Year view data
  const yearMonthData = Array.from({length:12},(_,mi)=>{
    const mTrades = trades.filter(t=>{ const d=new Date(t.date); return d.getFullYear()===calYear&&d.getMonth()===mi; });
    const pnl = mTrades.reduce((s,t)=>s+t.pnl,0);
    return { month: MONTH_NAMES[mi].slice(0,3), fullMonth: MONTH_NAMES[mi], pnl, count: mTrades.length, wins: mTrades.filter(t=>t.pnl>0).length };
  });
  const yearPnl = yearMonthData.reduce((s,m)=>s+m.pnl,0);

  // ── Arrow navigation ──
  const handlePrev = ()=>{
    if(view==="day") {
      const d = new Date(selectedDate); d.setDate(d.getDate()-1);
      const ds = d.toISOString().split("T")[0];
      setSelectedDate(ds); setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
    } else if(view==="year")  { setCalYear(y=>y-1); }
    else if(view==="week") { setWeekOffset(o=>o-1); }
    else { if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1); }
  };
  const handleNext = ()=>{
    if(view==="day") {
      const d = new Date(selectedDate); d.setDate(d.getDate()+1);
      const ds = d.toISOString().split("T")[0];
      setSelectedDate(ds); setCalYear(d.getFullYear()); setCalMonth(d.getMonth());
    } else if(view==="year")  { setCalYear(y=>y+1); }
    else if(view==="week") { setWeekOffset(o=>o+1); }
    else { if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1); }
  };

  // ── Quick-jump ──
  const jumpToday     = ()=>{ setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); if(view==="day"){setSelectedDate(todayStr);setView("day");}else{setView("month");} setWeekOffset(0); setTodayMenuOpen(false); };
  const jumpThisWeek  = ()=>{ setWeekOffset(0); setView("week"); setTodayMenuOpen(false); };
  const jumpThisMonth = ()=>{ setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); setView("month"); setTodayMenuOpen(false); };
  const jumpThisYear  = ()=>{ setCalYear(today.getFullYear()); setView("year"); setTodayMenuOpen(false); };
  const backToMonth   = ()=>{ setCalYear(new Date(selectedDate+"T12:00:00").getFullYear()); setCalMonth(new Date(selectedDate+"T12:00:00").getMonth()); setView("month"); };

  const selS = { background:CARD2, border:`1px solid ${BORDER}`, borderRadius:6, color:WHITE, padding:"4px 8px", fontSize:12, cursor:"pointer", outline:"none", fontFamily:"inherit" };
  const years = []; for(let y=2020;y<=2030;y++) years.push(y);
  const isCurrentMonth = calYear===today.getFullYear()&&calMonth===today.getMonth();
  const isCurrentYear  = calYear===today.getFullYear();

  // ── Dynamic "Today" button label ──
  const jumpBtnLabel = view==="year" ? `Year ${calYear}` : view==="week" ? "This Week" : view==="day" ? "← Month" : "Month";
  const jumpBtnActive = view==="year" ? isCurrentYear : view==="week" ? isCurrentWeek : view==="day" ? false : isCurrentMonth;

  // ── PNL to show in controls row ──
  let ctrlTrades=0, ctrlWins=0, ctrlPnl=0;
  if(view==="day")   { const dt=trades.filter(t=>t.date===selectedDate); ctrlTrades=dt.length; ctrlPnl=dt.reduce((s,t)=>s+t.pnl,0); ctrlWins=dt.filter(t=>t.pnl>0).length; }
  else if(view==="year")  { ctrlTrades=trades.filter(t=>new Date(t.date).getFullYear()===calYear).length; ctrlPnl=yearPnl; ctrlWins=yearMonthData.reduce((s,m)=>s+m.wins,0); }
  else if(view==="week") { ctrlTrades=weekTrades.length; ctrlPnl=weekPnl; ctrlWins=weekWins; }
  else { ctrlTrades=monthTrades.length; ctrlPnl=monthPnl; ctrlWins=monthWins; }

  return (
    <div style={{padding:"22px 22px 60px"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h1 style={{margin:0,fontSize:18,fontWeight:800,color:WHITE}}>Calendar</h1>
        <AccountFilterBar accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount}/>
      </div>
      <Breadcrumb current="calendar" setPage={setPage}/>

      {/* Controls row */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Prev arrow */}
          <button onClick={handlePrev} style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:6,color:WHITE,padding:"4px 11px",cursor:"pointer",fontSize:14}}>‹</button>

          {/* Center label / selects */}
          {view==="day" && (
            <span style={{fontSize:14,fontWeight:700,color:WHITE,padding:"4px 10px",minWidth:140,textAlign:"center"}}>
              {selectedDate===todayStr ? <span style={{color:GREEN}}>Today · </span> : ""}
              {new Date(selectedDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}
            </span>
          )}
          {view==="year" && (
            <span style={{fontSize:15,fontWeight:700,color:WHITE,padding:"4px 10px",minWidth:52,textAlign:"center"}}>{calYear}</span>
          )}
          {view==="week" && (
            <span style={{fontSize:12,fontWeight:600,color:WHITE,padding:"4px 8px",whiteSpace:"nowrap"}}>
              {viewWeekStartStr.slice(5).replace("-","/")} – {viewWeekEndStr.slice(5).replace("-","/")}
            </span>
          )}
          {view==="month" && (
            <>
              <select style={selS} value={calMonth} onChange={e=>{setCalMonth(parseInt(e.target.value));}}>{MONTH_NAMES.map((m,i)=><option key={i} value={i}>{m}</option>)}</select>
              <select style={selS} value={calYear}  onChange={e=>{setCalYear(parseInt(e.target.value));}}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select>
            </>
          )}

          {/* Next arrow */}
          <button onClick={handleNext} style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:6,color:WHITE,padding:"4px 11px",cursor:"pointer",fontSize:14}}>›</button>

          {/* Dynamic Today/ThisWeek/ThisYear button with dropdown */}
          <div ref={todayRef} style={{position:"relative"}}>
            <button
              onClick={()=>{ if(view==="day"){backToMonth();} else setTodayMenuOpen(o=>!o); }}
              style={{background:jumpBtnActive?"rgba(46,204,113,0.12)":"#1a2a1a",border:`1px solid ${jumpBtnActive?GREEN+"66":"#2a4a2a"}`,borderRadius:6,color:GREEN,padding:"4px 11px 4px 10px",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",gap:5,fontFamily:"inherit",fontWeight:600,whiteSpace:"nowrap"}}>
              {jumpBtnLabel}
              <span style={{fontSize:9,opacity:0.7,marginLeft:1}}>{todayMenuOpen?"▲":"▼"}</span>
            </button>
            {todayMenuOpen&&(
              <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,minWidth:165,background:"#1c1c1c",border:`1px solid ${BORDER}`,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.7)",zIndex:200,overflow:"hidden"}}>
                <div style={{padding:"7px 12px 4px",fontSize:10,color:MUTED,textTransform:"uppercase",letterSpacing:"0.07em",borderBottom:`1px solid #222`}}>Jump to</div>
                {[
                  ["Today",           jumpToday,     "Current day"],
                  ["This Week",       jumpThisWeek,  realWeekStartStr.slice(5)+" – "+realWeekEndStr.slice(5)],
                  ["This Month",      jumpThisMonth, MONTH_NAMES[today.getMonth()]+" "+today.getFullYear()],
                  ["This Year",       jumpThisYear,  "Jan – Dec "+today.getFullYear()],
                ].map(([label, fn, sub])=>(
                  <div key={label} onClick={fn} style={{padding:"9px 14px",cursor:"pointer",transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#252525"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{fontSize:12,color:WHITE,fontWeight:500}}>{label}</div>
                    <div style={{fontSize:10,color:MUTED,marginTop:1}}>{sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PNL stats — bigger */}
        <div style={{display:"flex",gap:16,alignItems:"center"}}>
          <span style={{fontSize:12,color:MUTED}}>{ctrlTrades} trade{ctrlTrades!==1?"s":""}</span>
          {view!=="year"&&<span style={{fontSize:12,color:MUTED}}>{ctrlWins}W / {ctrlTrades-ctrlWins}L</span>}
          <span style={{color:ctrlPnl>=0?GREEN:RED,fontWeight:800,fontSize:24,letterSpacing:"-0.02em",minWidth:100,textAlign:"right"}}>
            {ctrlPnl>=0?"+":""}{fmt(ctrlPnl)}
          </span>
        </div>
      </div>

      {/* Monthly year-bar (month view only) */}
      {view==="month"&&(
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:"10px 14px",marginBottom:14}}>
          <div style={{fontSize:10,color:MUTED,marginBottom:40,letterSpacing:"0.06em",textTransform:"uppercase"}}>
            {calYear} Overview · <span style={{color:yearPnl>=0?GREEN:RED,fontWeight:600}}>{yearPnl>=0?"+":""}{fmt(yearPnl)} total</span>
          </div>
          <div style={{display:"flex",gap:4,alignItems:"flex-end",height:36}}>
            {yearMonthData.map((m,i)=>{
              const max = Math.max(...yearMonthData.map(x=>Math.abs(x.pnl)),1);
              const h   = m.pnl===0?2:Math.max((Math.abs(m.pnl)/max)*36,3);
              const isActive = i===calMonth;
              return (
                <div key={m.month} onClick={()=>setCalMonth(i)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",gap:2}}>
                  <div style={{width:"100%",borderRadius:"2px 2px 0 0",height:h,background:m.pnl>=0?GREEN:RED,opacity:isActive?1:0.4,transition:"opacity 0.15s",minHeight:2}}/>
                  <div style={{fontSize:9,color:isActive?WHITE:MUTED,fontWeight:isActive?700:400}}>{m.month}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── YEAR VIEW ── */}
      {view==="year"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {yearMonthData.map((m,i)=>{
            const isCurrentMo = calYear===today.getFullYear()&&i===today.getMonth();
            return (
              <div key={m.fullMonth} onClick={()=>{setCalMonth(i);setView("month");}}
                style={{background:m.pnl>0?"#0a2416":m.pnl<0?"#2a0a0a":CARD,border:`1px solid ${isCurrentMo?GREEN:m.pnl>0?"#1a4a24":m.pnl<0?"#4a1a1a":BORDER}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.opacity="0.85";}} onMouseLeave={e=>{e.currentTarget.style.opacity="1";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:isCurrentMo?GREEN:WHITE}}>{m.fullMonth}</span>
                  {isCurrentMo&&<span style={{width:7,height:7,borderRadius:"50%",background:GREEN,display:"inline-block"}}/>}
                </div>
                <div style={{fontSize:22,fontWeight:800,color:m.pnl>=0?GREEN:RED,letterSpacing:"-0.02em",marginBottom:4}}>
                  {m.pnl===0?"—":`${m.pnl>=0?"+":""}${fmt(m.pnl)}`}
                </div>
                <div style={{fontSize:10,color:MUTED}}>{m.count} trade{m.count!==1?"s":""} · {m.wins}W / {m.count-m.wins}L</div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── WEEK VIEW ── */}
      {view==="week"&&(
        <>
          {/* Day headers */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:6}}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
              <div key={d} style={{padding:"5px 4px",textAlign:"center",fontSize:10,color:MUTED,fontWeight:600,letterSpacing:"0.05em"}}>{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
            {weekDays.map((ds)=>{
              const pnl    = pnlByDate[ds], has = pnl!==undefined;
              const isToday = ds===todayStr;
              const dayTrades = trades.filter(t=>t.date===ds);
              const bg = has?(pnl>=0?"#0a2416":"#2a0a0a"):isCurrentWeek&&ds<=todayStr?"#0e1a0e":CARD;
              const br = has?(pnl>=0?"#1a4a24":"#4a1a1a"):isToday?GREEN:BORDER;
              return (
                <div key={ds} onClick={()=>{setSelectedDate(ds);setView("day");}} style={{
                  background:bg, borderRadius:10, padding:"12px 14px", minHeight:110,
                  border:`1px solid ${br}`,
                  boxShadow: isToday?`0 0 0 1px ${GREEN}55`:"none",
                  transition:"opacity 0.15s", cursor:"pointer",
                }}
                  onMouseEnter={e=>e.currentTarget.style.opacity="0.85"}
                  onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                  <div style={{fontSize:11,fontWeight:700,marginBottom:6,color:isToday?GREEN:has?WHITE:MUTED,display:"flex",alignItems:"center",gap:5}}>
                    {ds.slice(5).replace("-","/")}
                    {isToday&&<span style={{width:6,height:6,borderRadius:"50%",background:GREEN,display:"inline-block"}}/>}
                  </div>
                  {has&&<div style={{fontSize:20,fontWeight:800,color:pnl>=0?GREEN:RED,letterSpacing:"-0.02em",marginBottom:5}}>{pnl>=0?"+":""}{fmt(pnl,0)}</div>}
                  {has&&<div style={{fontSize:10,color:MUTED}}>{dayTrades.length} trade{dayTrades.length!==1?"s":""}</div>}
                  {has&&<div style={{fontSize:10,color:MUTED,marginTop:2}}>{dayTrades.filter(t=>t.pnl>0).length}W / {dayTrades.filter(t=>t.pnl<0).length}L</div>}
                  {!has&&<div style={{fontSize:13,color:"#333",marginTop:4}}>—</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── MONTH CALENDAR GRID ── */}
      {view==="month"&&(
        <>
          {/* Day headers */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:6}}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
              <div key={d} style={{padding:"5px 4px",textAlign:"center",fontSize:10,color:MUTED,fontWeight:600,letterSpacing:"0.05em"}}>{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
            {cells.map((d,i)=>{
              if(!d) return <div key={`e${i}`} style={{minHeight:70}}/>;
              const ds  = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
              const pnl = pnlByDate[ds], has = pnl!==undefined;
              const isToday = ds===todayStr;
              const inWeek  = isCurrentMonth&&ds>=realWeekStartStr&&ds<=realWeekEndStr;
              const bg = has?(pnl>=0?"#0a2416":"#2a0a0a"):inWeek?"#0e1a0e":CARD;
              const br = has?(pnl>=0?"#1a4a24":"#4a1a1a"):isToday?GREEN:inWeek?"rgba(46,204,113,0.25)":BORDER;
              return (
                <div key={d} onClick={()=>{setSelectedDate(ds);setView("day");}} style={{
                  background:bg, borderRadius:10, padding:"10px 12px", minHeight:70,
                  border:`1px solid ${br}`,
                  boxShadow: isToday?`0 0 0 1px ${GREEN}55`:"none",
                  transition:"opacity 0.15s", cursor:"pointer",
                }}
                  onMouseEnter={e=>e.currentTarget.style.opacity="0.85"}
                  onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                  <div style={{fontSize:11,fontWeight:has?700:400,marginBottom:4,color:isToday?GREEN:has?WHITE:inWeek?"#667766":MUTED,display:"flex",alignItems:"center",gap:4}}>
                    {d}
                    {isToday&&<span style={{width:5,height:5,borderRadius:"50%",background:GREEN,display:"inline-block"}}/>}
                  </div>
                  {has&&<div style={{fontSize:14,fontWeight:800,color:pnl>=0?GREEN:RED,letterSpacing:"-0.01em",marginBottom:2}}>{pnl>=0?"+":""}{fmt(pnl,0)}</div>}
                  {has&&<div style={{fontSize:9,color:MUTED}}>{trades.filter(t=>t.date===ds).length} trade{trades.filter(t=>t.date===ds).length!==1?"s":""}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}
      {/* ── DAY VIEW ── */}
      {view==="day"&&<DayView trades={trades} date={selectedDate} todayStr={todayStr} allTrades={allTrades} hourFormat={hourFormat}/>}

    </div>
  );
}

export default CalendarPage;
