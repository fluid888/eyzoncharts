import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency } from "../contexts";
import { fmtHour } from "../utils/helpers";
import AccountFilterBar from "../components/AccountFilterBar";
import { Breadcrumb, StatRow } from "../components/common";

function TimePage({ trades: allTrades, setPage, accounts, analyticsAccount, setAnalyticsAccount, hourFormat="12" }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const { fmt } = useCurrency();
  const trades = useMemo(()=>analyticsAccount==="All accounts"?allTrades:allTrades.filter(t=>t.account===analyticsAccount),[allTrades,analyticsAccount]);
  const pnlByDay={Sun:{pnl:0,count:0},Mon:{pnl:0,count:0},Tue:{pnl:0,count:0},Wed:{pnl:0,count:0},Thu:{pnl:0,count:0},Fri:{pnl:0,count:0},Sat:{pnl:0,count:0}};
  trades.forEach(t=>{const k=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(t.date).getDay()];pnlByDay[k].pnl+=t.pnl;pnlByDay[k].count++;});
  const dayData=Object.entries(pnlByDay).map(([day,{pnl,count}])=>({day,pnl,count}));
  const hourMap={};trades.forEach(t=>{if(!hourMap[t.hour])hourMap[t.hour]={pnl:0,count:0};hourMap[t.hour].pnl+=t.pnl;hourMap[t.hour].count++;});
  const hourData=Object.entries(hourMap).map(([hour,{pnl,count}])=>({rawHour:hour,hour:fmtHour(hour,hourFormat),pnl,count})).sort((a,b)=>b.pnl-a.pnl);
  const allPnl=trades.map(t=>t.pnl),best=trades.length?Math.max(...allPnl):0,worst=trades.length?Math.min(...allPnl):0;
  const totalPnl=trades.reduce((s,t)=>s+t.pnl,0),tradingDays=Math.max([...new Set(trades.map(t=>t.date))].length,1);
  const ax={fill:MUTED,fontSize:10};

  // Custom tooltip showing both P&L and trade count
  const TimeTooltip = ({active,payload,label})=>{
    if(!active||!payload?.length) return null;
    const d=payload[0]?.payload;
    return (
      <div style={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,padding:"8px 12px",fontSize:11}}>
        <div style={{color:WHITE,fontWeight:700,marginBottom:3}}>{label}</div>
        {payload.map((p,i)=>(
          <div key={i} style={{color:p.value>=0?GREEN:RED,marginBottom:1}}>{p.name}: {p.name==="P&L"?fmt(+p.value):p.value}</div>
        ))}
        {d?.count!==undefined&&<div style={{color:MUTED,marginTop:3}}>{d.count} trade{d.count!==1?"s":""}</div>}
      </div>
    );
  };

  return (
    <div style={{padding:"22px 22px 60px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h1 style={{margin:0,fontSize:18,fontWeight:800,color:WHITE}}>Time Analysis</h1>
        <AccountFilterBar accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount}/>
      </div>
      <Breadcrumb current="time" setPage={setPage}/>
      <StatRow items={[{label:"Avg P&L/Day",value:fmt(totalPnl/tradingDays),icon:"📅",positive:totalPnl>=0},{label:"Total P&L",value:fmt(totalPnl),icon:"💵",positive:totalPnl>=0},{label:"Best Day",value:fmt(best),icon:"↗",positive:true},{label:"Worst Day",value:fmt(worst),icon:"↘",positive:false}]}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div>
          <p style={{fontSize:11,color:MUTED,margin:"0 0 5px"}}>Daily Performance</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={dayData}>
              <CartesianGrid stroke="#252525"/>
              <XAxis dataKey="day" tick={ax} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="pnl" tick={ax} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="cnt" orientation="right" tick={{...ax,fill:"#555"}} axisLine={false} tickLine={false} width={22}/>
              <Tooltip content={<TimeTooltip/>}/>
              <ReferenceLine yAxisId="pnl" y={0} stroke={BORDER}/>
              <Bar yAxisId="pnl" dataKey="pnl" name="P&L" radius={[3,3,0,0]}>{dayData.map((e,i)=><Cell key={i} fill={e.pnl>=0?GREEN:RED}/>)}</Bar>
              <Line yAxisId="cnt" type="monotone" dataKey="count" name="Trades" stroke={YELLOW} strokeWidth={1.5} dot={{fill:YELLOW,r:3}} isAnimationActive={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p style={{fontSize:11,color:MUTED,margin:"0 0 5px"}}>Entry Window Stats</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={hourData} layout="vertical">
              <CartesianGrid stroke="#252525" horizontal={false}/>
              <XAxis type="number" tick={ax} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="hour" tick={{...ax,fill:"#aaa"}} width={hourFormat==="24"?88:56} axisLine={false} tickLine={false}/>
              <Tooltip content={<TimeTooltip/>}/>
              <ReferenceLine x={0} stroke="#333"/>
              <Bar dataKey="pnl" name="P&L" radius={[0,3,3,0]}>
                {hourData.map((e,i)=><Cell key={i} fill={e.pnl>=0?GREEN:RED}/>)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MONTE CARLO ENGINE v2 — Institutional Grade
//
// Architecture:
//   Layer 1 — PRNG (mulberry32): deterministic, seedable, fast 32-bit generator
//   Layer 2 — Statistics (pctSorted, sortedPct, multiPct): efficient percentiles
//   Layer 3 — Autocorrelation & block-size estimation (autocorr1, optimalBlockSize)
//   Layer 4 — Sequence generators: Fisher-Yates shuffle, IID bootstrap,
//              Overlapping Circular Block Bootstrap (Politis & Romano 1992)
//   Layer 5 — Single-sim walk (walkSim): no full path storage, O(n) memory,
//              computes all per-sim metrics inline with subsampled chart path
//   Layer 6 — Result aggregation (buildMCResults): column-major envelope,
//              all distribution metrics, drawdown statistics
//   Layer 7 — Kelly fraction sensitivity sweep (runKellySweep)
//   Layer 8 — Async chunked runner (runMonteCarloAsync): yields to event loop
//              every CHUNK sims, calls onProgress(0..1) for UI progress bar
// ══════════════════════════════════════════════════════════════════════════════

// ─── LAYER 1: PRNG ────────────────────────────────────────────────────────────
// Mulberry32: 32-bit state, period 2^32, passes PractRand 32GB.
// Returns a closure `() => [0, 1)` seeded by any unsigned integer.

export default TimePage;
