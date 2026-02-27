import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency } from "../contexts";
import AccountFilterBar from "../components/AccountFilterBar";
import { CT, StatRow } from "../components/common";

function AnalyticsPage({ trades: allTrades, setPage, accounts, analyticsAccount, setAnalyticsAccount, accDetails }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const { fmt, symbol, toLocal, currency } = useCurrency();
  const trades = useMemo(()=>analyticsAccount==="All accounts"?allTrades:allTrades.filter(t=>t.account===analyticsAccount),[allTrades,analyticsAccount]);

  // Compute initial balance for selected account(s)
  const initBalUSD = useMemo(()=>{
    if(!accDetails) return 0;
    if(analyticsAccount==="All accounts") {
      return accounts.reduce((s,acc)=>s+(accDetails[acc]?.balance||0),0);
    }
    return accDetails[analyticsAccount]?.balance||0;
  },[accDetails, analyticsAccount, accounts]);

  const wins=trades.filter(t=>t.pnl>0),totalPnl=trades.reduce((s,t)=>s+t.pnl,0);
  const winRate=(wins.length/Math.max(trades.length,1)*100).toFixed(1);
  const grossWin=wins.reduce((s,t)=>s+t.pnl,0),grossLoss=Math.abs(trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0));
  const pf=grossLoss>0?(grossWin/grossLoss).toFixed(2):"∞";
  const byDate={};[...trades].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{byDate[t.date]=(byDate[t.date]||0)+t.pnl;});
  const initBalLocal = toLocal(initBalUSD);
  let bal=initBalLocal;
  const startPoint = {date:"Start",pnl:parseFloat(bal.toFixed(2))};
  const growthPoints = Object.entries(byDate).map(([d,p])=>{bal+=toLocal(p);return{date:d.slice(5),pnl:parseFloat(bal.toFixed(2))};});
  const growthData = [startPoint, ...growthPoints];
  const symMap={};trades.forEach(t=>{symMap[t.symbol]=(symMap[t.symbol]||0)+t.pnl;});
  const symData=Object.entries(symMap).map(([symbol,pnl])=>({symbol,pnl})).sort((a,b)=>b.pnl-a.pnl);
  const sesMap={};trades.forEach(t=>{sesMap[t.session]=(sesMap[t.session]||0)+1;});
  const sesData=Object.entries(sesMap).map(([name,value])=>({name,value}));
  const sesCols={"London":"#6eb5ff","New York":"#e07be0","Asia":"#f5c842"};
  const modMap={};trades.forEach(t=>{modMap[t.model]=(modMap[t.model]||0)+t.pnl;});
  const modData=Object.entries(modMap).map(([model,pnl])=>({model,pnl}));
  const ax={fill:MUTED,fontSize:10};
  const accColors=["#00d4ff","#2ecc71","#f5c842","#e07be0","#ff6b6b","#4a90d9"];

  return (
    <div style={{padding:"22px 22px 60px"}}>
      {/* Header row with account selector */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h1 style={{margin:0,fontSize:18,fontWeight:800,color:WHITE,letterSpacing:"0.06em",textTransform:"uppercase"}}>ANALYTICS</h1>
        <AccountFilterBar accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount}/>
      </div>
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:8,padding:"7px 0",display:"flex",marginBottom:18}}>
        {[["📅","Calendar","calendar"],["🕐","Time Analysis","time"],["⚠️","Risk Analysis","risk"],["🎯","Discipline Analysis","discipline"]].map(([ico,lbl,pg],i,arr)=>(
          <button key={pg} onClick={()=>setPage(pg)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"4px 0",fontSize:11,color:GREEN,fontWeight:500,borderRight:i<arr.length-1?`1px solid ${BORDER}`:"none"}}><span>{ico}</span>{lbl}</button>
        ))}
      </div>
      <StatRow items={[{label:"Win Rate",value:`${winRate}%`,icon:"🎯",positive:true},{label:"Total P&L",value:fmt(totalPnl),icon:"💵",positive:totalPnl>=0},{label:"Return %",value:`${initBalLocal>0?((toLocal(totalPnl)/initBalLocal)*100).toFixed(1):"—"}%`,icon:"📈",positive:totalPnl>=0},{label:"Profit Factor",value:pf,icon:"↕️"}]}/>
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:16,marginBottom:16}}>
        <div><p style={{fontSize:11,color:MUTED,margin:"0 0 5px"}}>Account Growth</p><ResponsiveContainer width="100%" height={180}><AreaChart data={growthData}><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GREEN} stopOpacity={0.3}/><stop offset="100%" stopColor={GREEN} stopOpacity={0.02}/></linearGradient></defs><CartesianGrid stroke="#252525"/><XAxis dataKey="date" tick={ax} axisLine={false} tickLine={false}/><YAxis tick={ax} axisLine={false} tickLine={false} width={70} tickFormatter={v=>`${symbol}${v>=1000?`${(v/1000).toFixed(1)}k`:v.toFixed(0)}`}/><Tooltip content={<CT/>}/><Area type="monotone" dataKey="pnl" name="Balance" stroke={GREEN} strokeWidth={1.5} fill="url(#ag)"/></AreaChart></ResponsiveContainer></div>
        <div><p style={{fontSize:11,color:MUTED,margin:"0 0 5px"}}>Symbol Performance</p><ResponsiveContainer width="100%" height={180}><BarChart data={symData}><CartesianGrid stroke="#252525"/><XAxis dataKey="symbol" tick={ax} axisLine={false} tickLine={false}/><YAxis tick={ax} axisLine={false} tickLine={false}/><Tooltip content={<CT/>}/><ReferenceLine y={0} stroke={BORDER}/><Bar dataKey="pnl" name="P&L" radius={[3,3,0,0]}>{symData.map((e,i)=><Cell key={i} fill={e.pnl>=0?GREEN:RED}/>)}</Bar></BarChart></ResponsiveContainer></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr",gap:16}}>
        <div><p style={{fontSize:11,color:MUTED,margin:"0 0 5px"}}>Session Performance</p><div style={{display:"flex",gap:8,marginBottom:4}}>{sesData.map(s=><span key={s.name} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:MUTED}}><span style={{width:6,height:6,borderRadius:"50%",background:sesCols[s.name]||"#aaa",display:"inline-block"}}/>{s.name}</span>)}</div><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={sesData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>{sesData.map((e,i)=><Cell key={i} fill={sesCols[e.name]||"#aaa"}/>)}</Pie><Tooltip formatter={(v,n)=>[`${v} trades`,n]}/></PieChart></ResponsiveContainer></div>
        <div><p style={{fontSize:11,color:MUTED,margin:"0 0 5px"}}>Performance by Model</p><ResponsiveContainer width="100%" height={180}><BarChart data={[...modData].reverse()} layout="vertical"><CartesianGrid stroke="#252525" horizontal={false}/><XAxis type="number" tick={ax} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="model" tick={{...ax,fill:"#aaa"}} width={70} axisLine={false} tickLine={false}/><Tooltip content={<CT/>}/><ReferenceLine x={0} stroke="#333"/><Bar dataKey="pnl" name="P&L" radius={[0,3,3,0]}>{modData.map((e,i)=><Cell key={i} fill={e.pnl>=0?GREEN:RED}/>)}</Bar></BarChart></ResponsiveContainer></div>
      </div>
    </div>
  );
}

export default AnalyticsPage;
