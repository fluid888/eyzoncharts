import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency } from "../contexts";
import AccountFilterBar from "../components/AccountFilterBar";
import { Breadcrumb, StatRow } from "../components/common";

function DisciplinePage({ trades: allTrades, setPage, accounts, analyticsAccount, setAnalyticsAccount }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const trades = useMemo(()=>analyticsAccount==="All accounts"?allTrades:allTrades.filter(t=>t.account===analyticsAccount),[allTrades,analyticsAccount]);
  const followed=trades.filter(t=>t.followed);
  const adherence=trades.length?(followed.length/trades.length*100).toFixed(1):0;
  const followedPnl=followed.reduce((s,t)=>s+t.pnl,0);
  const followedWR=followed.length?(followed.filter(t=>t.pnl>0).length/followed.length*100).toFixed(1):0;
  const tagMap={};trades.forEach(t=>(t.tags||[]).forEach(tg=>{if(!tagMap[tg])tagMap[tg]={pnl:0,count:0};tagMap[tg].pnl+=t.pnl;tagMap[tg].count++;}));
  const tagData=Object.entries(tagMap).map(([tag,{pnl,count}])=>({tag,pnl,count})).sort((a,b)=>b.pnl-a.pnl);
  const ax={fill:MUTED,fontSize:10};
  const TagTooltip=({active,payload,label})=>{
    if(!active||!payload?.length) return null;
    const d=payload[0]?.payload;
    return <div style={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,padding:"8px 12px",fontSize:11}}><div style={{color:WHITE,fontWeight:700,marginBottom:3}}>{label}</div><div style={{color:d.pnl>=0?GREEN:RED}}>P&L: ${(+d.pnl).toFixed(2)}</div><div style={{color:MUTED,marginTop:2}}>{d.count} trade{d.count!==1?"s":""}</div></div>;
  };
  const { fmt } = useCurrency();
  return (
    <div style={{padding:"22px 22px 60px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h1 style={{margin:0,fontSize:18,fontWeight:800,color:WHITE}}>Discipline Analysis</h1>
        <AccountFilterBar accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount}/>
      </div>
      <Breadcrumb current="discipline" setPage={setPage}/>
      <StatRow items={[{label:"Plan Adherence",value:`${adherence}%`,icon:"🔴",positive:parseFloat(adherence)>=70},{label:"Followed Plan P&L",value:fmt(followedPnl),icon:"↕",positive:followedPnl>=0},{label:"Followed Plan Win Rate",value:`${followedWR}%`,icon:"↕",positive:parseFloat(followedWR)>=50}]}/>
      {tagData.length===0?<div style={{textAlign:"center",padding:40,color:MUTED,fontSize:13}}>No tagged trades yet.</div>:(
        <>
          <p style={{fontSize:11,color:MUTED,margin:"0 0 6px",textAlign:"center"}}>Comments Performance</p>
          <ResponsiveContainer width="100%" height={150}>
            <ComposedChart data={tagData}>
              <CartesianGrid stroke="#252525"/>
              <XAxis dataKey="tag" tick={ax} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="pnl" tick={ax} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="cnt" orientation="right" tick={{...ax,fill:"#555"}} axisLine={false} tickLine={false} width={22}/>
              <Tooltip content={<TagTooltip/>}/>
              <ReferenceLine yAxisId="pnl" y={0} stroke={BORDER}/>
              <Bar yAxisId="pnl" dataKey="pnl" name="P&L" radius={[4,4,0,0]}>{tagData.map((e,i)=><Cell key={i} fill={e.pnl>=0?GREEN:RED}/>)}</Bar>
              <Line yAxisId="cnt" type="monotone" dataKey="count" name="Trades" stroke={YELLOW} strokeWidth={1.5} dot={{fill:YELLOW,r:3}} isAnimationActive={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

// ── DAY VIEW ─────────────────────────────────────────────────────────────────
const HOUR_SLOTS = [
  "12-1am","1-2am","2-3am","3-4am","4-5am","5-6am","6-7am","7-8am","8-9am","9-10am","10-11am","11-12am",
  "12-1pm","1-2pm","2-3pm","3-4pm","4-5pm","5-6pm","6-7pm","7-8pm","8-9pm","9-10pm","10-11pm","11-12pm",
];

// Convert stored 12h bucket "1-2am" → "01:00–02:00" when 24h format selected

export default DisciplinePage;
