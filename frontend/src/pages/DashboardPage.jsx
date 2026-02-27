import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency } from "../contexts";

function DashboardPage({ trades, accounts, activeAccount, setActiveAccount, setPage, accDetails }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const { fmt, fmtN, toLocal, currency, symbol } = useCurrency();
  const [timeRange, setTimeRange] = useState("All time");
  const [accDropOpen, setAccDropOpen] = useState(false);
  const [timeDropOpen, setTimeDropOpen] = useState(false);
  const accRef  = useRef(); const timeRef = useRef();

  useEffect(()=>{
    const h = (e) => {
      if(accRef.current && !accRef.current.contains(e.target)) setAccDropOpen(false);
      if(timeRef.current && !timeRef.current.contains(e.target)) setTimeDropOpen(false);
    };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  const now = new Date();
  const filtered = useMemo(()=>{
    let t = activeAccount==="All accounts" ? trades : trades.filter(x=>x.account===activeAccount);
    if(timeRange==="This week") { const d=new Date(); d.setDate(d.getDate()-7); t=t.filter(x=>new Date(x.date)>=d); }
    else if(timeRange==="This month") { t=t.filter(x=>{ const d=new Date(x.date); return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth(); }); }
    else if(timeRange==="This year") { t=t.filter(x=>new Date(x.date).getFullYear()===now.getFullYear()); }
    return t;
  },[trades,activeAccount,timeRange]);

  const wins = filtered.filter(t=>t.pnl>0), losses = filtered.filter(t=>t.pnl<0);
  const netPnl = filtered.reduce((s,t)=>s+t.pnl,0);
  const avgWin = wins.length ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s,t)=>s+t.pnl,0)/losses.length : 0;
  const avgLotSize = filtered.length ? (filtered.reduce((s,t)=>s+t.size,0)/filtered.length).toFixed(2) : "0.00";

  // trades by day avg
  const uniqueDays = [...new Set(filtered.map(t=>t.date))].length || 1;
  const tradesByDayAvg = Math.round(filtered.length / uniqueDays);
  const dayCount = {}; filtered.forEach(t=>{ dayCount[t.date]=(dayCount[t.date]||0)+1; });
  const dayCounts = Object.values(dayCount);
  const maxDayBar = Math.max(...dayCounts, 1);
  const last7DayDates = [...new Set(filtered.map(t=>t.date))].sort().slice(-7);
  const last7Avgs = last7DayDates.map(d=>{ const dt=filtered.filter(t=>t.date===d); return dt.length; });

  // P&L by day avg
  const pnlByDayMap={}; filtered.forEach(t=>{pnlByDayMap[t.date]=(pnlByDayMap[t.date]||0)+t.pnl;});
  const pnlByDayAvg = Object.values(pnlByDayMap).length ? (Object.values(pnlByDayMap).reduce((s,v)=>s+v,0)/Object.values(pnlByDayMap).length) : 0;

  // current day streak
  const sortedDates = [...new Set(filtered.map(t=>t.date))].sort();
  let streak=0, lastWin=true;
  for(let i=sortedDates.length-1;i>=0;i--){
    const dayPnl=filtered.filter(t=>t.date===sortedDates[i]).reduce((s,t)=>s+t.pnl,0);
    if(i===sortedDates.length-1){ lastWin=dayPnl>=0; streak=1; }
    else if((dayPnl>=0)===lastWin) streak++;
    else break;
  }

  // cumulative P&L chart per account — memoized for performance
  const accountList = useMemo(()=>
    activeAccount==="All accounts" ? accounts : [activeAccount]
  ,[activeAccount, accounts]);

  const chartDataBuilt = useMemo(()=>{
    const allDates = [...new Set(filtered.map(t=>t.date))].sort();
    const cumByAcc = {};
    // Start each account at its initial balance (converted to local currency)
    accountList.forEach(acc=>{
      const initBal = toLocal((accDetails?.[acc]?.balance)||0);
      cumByAcc[acc] = initBal;
    });
    // Prepend a "Start" point with just balances
    const startPoint = {date:"Start"};
    accountList.forEach(acc=>{ startPoint[acc]=parseFloat(cumByAcc[acc].toFixed(2)); });
    const points = allDates.map(d=>{
      const point = {date:d.slice(5)};
      accountList.forEach(acc=>{
        const dayPnl = filtered.filter(t=>t.date===d&&t.account===acc).reduce((s,t)=>s+t.pnl,0);
        cumByAcc[acc] = cumByAcc[acc] + toLocal(dayPnl);
        point[acc] = parseFloat(cumByAcc[acc].toFixed(2));
      });
      return point;
    });
    return [startPoint, ...points];
  },[filtered, accountList, accDetails, toLocal]);

  // bar chart for "Trades by Day"
  const barHeights = dayCounts.slice(-7).map(c=>(c/maxDayBar)*100);
  const accColors = ["#4a90d9","#2ecc71","#f5c842","#e07be0","#ff6b6b","#00d4ff"];

  const dropStyle = {position:"relative"};
  const dropBtn = {background:CARD2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"7px 14px",color:WHITE,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"inherit",fontWeight:500};
  const dropMenu = {position:"absolute",top:"calc(100%+6px)",right:0,minWidth:160,background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.6)",zIndex:200,overflow:"hidden",marginTop:4};
  const dropItem = {padding:"9px 14px",fontSize:12,color:WHITE,cursor:"pointer"};

  return (
    <div style={{padding:"22px 22px 60px",background:BG,minHeight:"calc(100vh - 44px)"}}>
      {/* Header row */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <h1 style={{margin:0,fontSize:20,fontWeight:800,color:WHITE,letterSpacing:"-0.02em"}}>Dashboard</h1>
        <div style={{display:"flex",gap:10}}>
          {/* Account filter */}
          <div ref={accRef} style={dropStyle}>
            <button style={dropBtn} onClick={()=>{setAccDropOpen(o=>!o);setTimeDropOpen(false);}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:activeAccount==="All accounts"?CYAN:GREEN,display:"inline-block"}}/>
              {activeAccount}
              <span style={{fontSize:10,color:MUTED}}>⌄</span>
            </button>
            {accDropOpen&&(
              <div style={dropMenu}>
                {["All accounts",...accounts].map(a=>(
                  <div key={a} style={{...dropItem,background:activeAccount===a?GREEN+"15":"transparent",color:activeAccount===a?GREEN:WHITE}}
                    onMouseEnter={e=>e.currentTarget.style.background=CARD2} onMouseLeave={e=>e.currentTarget.style.background=activeAccount===a?GREEN+"15":"transparent"}
                    onClick={()=>{setActiveAccount(a);setAccDropOpen(false);}}>
                    {a}
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Time range filter */}
          <div ref={timeRef} style={dropStyle}>
            <button style={dropBtn} onClick={()=>{setTimeDropOpen(o=>!o);setAccDropOpen(false);}}>
              {timeRange}
              <span style={{fontSize:10,color:MUTED}}>⌄</span>
            </button>
            {timeDropOpen&&(
              <div style={dropMenu}>
                {["All time","This year","This month","This week"].map(r=>(
                  <div key={r} style={{...dropItem,background:timeRange===r?GREEN+"15":"transparent",color:timeRange===r?GREEN:WHITE}}
                    onMouseEnter={e=>e.currentTarget.style.background=CARD2} onMouseLeave={e=>e.currentTarget.style.background=timeRange===r?GREEN+"15":"transparent"}
                    onClick={()=>{setTimeRange(r);setTimeDropOpen(false);}}>
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

       {/* Quick nav */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,margin:14}}>
        {[["📋 Trades","trades","View & manage all your trades"],["📊 Analytics","analytics","Performance charts & breakdowns"],["🎯 Discipline","discipline","Plan adherence & consistency"]].map(([l,p,d])=>(
          <button key={p} onClick={()=>setPage(p)} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:10,padding:"14px 16px",textAlign:"left",cursor:"pointer",transition:"border-color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=BLUE} onMouseLeave={e=>e.currentTarget.style.borderColor=BORDER}>
            <div style={{fontSize:13,fontWeight:700,color:WHITE,marginBottom:3}}>{l}</div>
            <div style={{fontSize:11,color:MUTED}}>{d}</div>
          </button>
        ))}
      </div>

      {/* Top stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
        {/* Total Trades */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px 14px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:10,fontWeight:500}}>Total Trades</div>
          <div style={{fontSize:32,fontWeight:800,color:WHITE,letterSpacing:"-0.02em",marginBottom:6}}>{filtered.length}</div>
          <div style={{fontSize:11,color:MUTED}}>All trades across {activeAccount==="All accounts"?"all accounts":activeAccount}</div>
        </div>
        {/* Trades by Day (avg) */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px 14px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:10,fontWeight:500}}>Trades by Day (avg)</div>
          <div style={{fontSize:32,fontWeight:800,color:WHITE,letterSpacing:"-0.02em",marginBottom:4}}>{tradesByDayAvg}</div>
          <div style={{fontSize:10,color:MUTED,marginBottom:8}}>Daily trade count</div>
          <div style={{display:"flex",gap:3,alignItems:"flex-end",height:28}}>
            {barHeights.map((h,i)=>(
              <div key={i} style={{flex:1,background:YELLOW,borderRadius:"2px 2px 0 0",height:`${Math.max(h,8)}%`,minHeight:3,transition:"height 0.3s"}}/>
            ))}
          </div>
        </div>
        {/* Avg last 7 trading days */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px 14px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:6,fontWeight:500}}>Avg. last 7 trading days</div>
          <div style={{height:36,marginBottom:8}}>
            <ResponsiveContainer width="100%" height={36}>
              <LineChart data={last7Avgs.map((v,i)=>({i,v}))}>
                <Line type="monotone" dataKey="v" stroke={YELLOW} strokeWidth={2} dot={{fill:YELLOW,r:3}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{fontSize:11,color:MUTED,marginBottom:2}}>Avg. Lot Size</div>
          <div style={{fontSize:22,fontWeight:700,color:WHITE}}>{avgLotSize}</div>
        </div>
        {/* P&L by Day */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px 14px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:10,fontWeight:500}}>P&L by Day</div>
          <div style={{fontSize:28,fontWeight:800,color:WHITE,letterSpacing:"-0.02em",marginBottom:6}}>{fmt(pnlByDayAvg)}</div>
          <div style={{fontSize:10,color:MUTED,marginBottom:4}}>Average per trading day · Daily avg</div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:pnlByDayAvg>=0?GREEN:RED,display:"inline-block"}}/>
            <span style={{fontSize:11,color:pnlByDayAvg>=0?GREEN:RED,fontWeight:600}}>{pnlByDayAvg>=0?"Profitable":"Losing"}</span>
          </div>
        </div>
      </div>

      {/* Bottom stat cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:8,fontWeight:500}}>Net P&L</div>
          <div style={{fontSize:28,fontWeight:800,color:netPnl>=0?WHITE:RED,letterSpacing:"-0.02em"}}>{fmt(netPnl)}</div>
        </div>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:8,fontWeight:500}}>Average Winning Trade</div>
          <div style={{fontSize:28,fontWeight:800,color:GREEN,letterSpacing:"-0.02em"}}>{fmt(avgWin)}</div>
        </div>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:8,fontWeight:500}}>Average Losing Trade</div>
          <div style={{fontSize:28,fontWeight:800,color:RED,letterSpacing:"-0.02em"}}>{fmt(avgLoss)}</div>
        </div>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"18px 18px"}}>
          <div style={{fontSize:11,color:MUTED,marginBottom:8,fontWeight:500}}>Current Day Streak</div>
          <div style={{fontSize:28,fontWeight:800,color:lastWin?GREEN:RED,letterSpacing:"-0.02em"}}>{streak} {lastWin?"Win":"Loss"} Day{streak!==1?"s":""}</div>
        </div>
      </div>

      {/* Cumulative P&L Chart */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"20px 20px 12px"}}>
        <div style={{marginBottom:4,fontSize:13,fontWeight:700,color:WHITE}}>Cumulative P&L by Account</div>
        <div style={{fontSize:11,color:MUTED,marginBottom:14}}>
          {timeRange} · {accountList.length===1 ? accountList[0] : accountList.join(", ")}
        </div>
        <ResponsiveContainer width="100%" height={229}>
          <AreaChart data={chartDataBuilt} margin={{top:4,right:0,left:0,bottom:0}}>
            <defs>
              {accountList.map((acc,i)=>(
                <linearGradient key={acc} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accColors[i%accColors.length]} stopOpacity={0.35}/>
                  <stop offset="100%" stopColor={accColors[i%accColors.length]} stopOpacity={0.02}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={BORDER} vertical={false}/>
            <XAxis dataKey="date" tick={{fill:"#4a6a8a",fontSize:10}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
            <YAxis tick={{fill:"#4a6a8a",fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${symbol}${(v/1000).toFixed(1)}k`} width={55}/>
            <Tooltip contentStyle={{background:"#1a2030",border:`1px solid #2a3a4a`,borderRadius:8,fontSize:11}} labelStyle={{color:MUTED}} formatter={(v,n)=>[fmt(v),n]} filterNull={false}/>
            <ReferenceLine y={0} stroke={BORDER}/>
            {accountList.map((acc,i)=>(
              <Area key={acc} type="monotone" dataKey={acc} stroke={accColors[i%accColors.length]} strokeWidth={2} fill={`url(#grad${i})`} dot={false} isAnimationActive={false}/>
            ))}
          </AreaChart>
        </ResponsiveContainer>
        {accountList.length>1&&(
          <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
            {accountList.map((acc,i)=>(
              <div key={acc} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:MUTED}}>
                <span style={{width:12,height:3,borderRadius:2,background:accColors[i%accColors.length],display:"inline-block"}}/>
                {acc}
              </div>
            ))}
          </div>
        )}
      </div>

     
    </div>
  );
}

export default DashboardPage;
