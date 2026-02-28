import { useState, useMemo, useEffect, useRef, useCallback, startTransition, useDeferredValue } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line, Brush } from "recharts";
import { useTheme, useCurrency } from "../contexts";
import { runMonteCarloAsync, runKellySweep, buildMCResults } from "../utils/mcEngine";
import AccountFilterBar from "../components/AccountFilterBar";
import { Breadcrumb, StatRow } from "../components/common";

function RiskPage({ trades: allTrades, setPage, accounts, analyticsAccount, setAnalyticsAccount, accDetails }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const { fmt, symbol, toLocal } = useCurrency();
  const trades = useMemo(()=>analyticsAccount==="All accounts"?allTrades:allTrades.filter(t=>t.account===analyticsAccount),[allTrades,analyticsAccount]);

  const initBalUSD = useMemo(()=>{
    if(!accDetails) return 0;
    if(analyticsAccount==="All accounts") {
      return accounts.reduce((s,acc)=>s+(accDetails[acc]?.balance||0),0);
    }
    return accDetails[analyticsAccount]?.balance||0;
  },[accDetails, analyticsAccount, accounts]);

  // Defer expensive chart recalculations so input interactions stay snappy
  const deferredTrades = useDeferredValue(trades);
  const wins=deferredTrades.filter(t=>t.pnl>0), losses=deferredTrades.filter(t=>t.pnl<0);
  const totalPnl=trades.reduce((s,t)=>s+t.pnl,0);
  const avgWin=wins.length?wins.reduce((s,t)=>s+t.pnl,0)/wins.length:0;
  const avgLoss=losses.length?losses.reduce((s,t)=>s+t.pnl,0)/losses.length:0;
  const profitFactor=Math.abs(avgLoss)>0?(Math.abs(avgWin)*wins.length)/(Math.abs(avgLoss)*losses.length):wins.length?999:0;
  const winRate=trades.length?wins.length/trades.length*100:0;
  const sorted = useMemo(()=>[...deferredTrades].sort((a,b)=>a.date.localeCompare(b.date)),[deferredTrades]);
  const ax={fill:MUTED,fontSize:10};

  // ── Monte Carlo state ─────────────────────────────────────────────────────
  const [showMC, setShowMC] = useState(false);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcProgress, setMcProgress] = useState(0); // only used for final/key states
  const progressBarRef  = useRef(null);
  const progressTextRef = useRef(null);
  const progressSimRef  = useRef(null);
  // Direct DOM progress update — bypasses React re-render cycle entirely
  const numSimsRef = useRef(1000); // kept in sync with mcCfg.numSims for setProgress closure
  const setProgress = useCallback((p) => {
    if (progressBarRef.current)  progressBarRef.current.style.width  = `${Math.round(p*100)}%`;
    if (progressTextRef.current) progressTextRef.current.textContent  = `${Math.round(p*100)}%`;
    if (progressSimRef.current)  progressSimRef.current.textContent   =
      `${Math.round(p * numSimsRef.current).toLocaleString()} / ${numSimsRef.current.toLocaleString()} simulations`;
  }, []); // stable — reads from ref, no stale closure
  const [mcResult,   setMcResult]   = useState(null);
  const [kellySweep, setKellySweep] = useState(null);
  const [mcTab,      setMcTab]      = useState("overview"); // "overview"|"drawdown"|"kelly"
  const [mcError,    setMcError]    = useState(null);       // visible error message
  const mcCancelRef = useRef(null); // cancel function for in-flight simulation
  const [mcCfg, setMcCfg] = useState({
    simMode: "shuffle",       // "shuffle" | "bootstrap" | "block_bootstrap"
    numSims: 1000,
    sizingMode: "pnl_direct", // "pnl_direct" | "r_fixed_fraction"
    fraction: 0.01,
    tradesPerYear: 50,
    blockSize: 5,
    autoBlockSize: false,     // compute optimal block size from data
    seed: 42,
    runKelly: true,           // also run Kelly sweep after main simulation
  });
  // Keep numSimsRef in sync so setProgress can read it without stale closure
  numSimsRef.current = mcCfg.numSims;

  // localCfg mirrors mcCfg for text/number inputs so typing doesn't re-render charts
  const [localCfg, setLocalCfg] = useState({
    tradesPerYear: "50",
    blockSize: "5",
    fraction: "0.01",
    seed: "42",
  });
  const commitLocal = (field, parser, min) => (e) => {
    const raw = e.target.value;
    const val = Math.max(min, parser(raw));
    if (!isNaN(val)) {
      setLocalCfg(c => ({...c, [field]: String(val)}));
      startTransition(() => setMcCfg(c => ({...c, [field]: val})));
    }
  };

  // ── A. Account Growth (cumulative equity from initial balance) ─────────────
  const accountGrowthData = useMemo(()=>{
    const byDate={};
    sorted.forEach(t=>{ byDate[t.date]=(byDate[t.date]||0)+t.pnl; });
    const initLocal = toLocal(initBalUSD);
    let cum=initLocal;
    const startPt={date:"Start",pnl:parseFloat(initLocal.toFixed(2)),day:0};
    const pts=Object.entries(byDate).sort().map(([d,p])=>{ cum+=toLocal(p); return{date:d.slice(5),pnl:parseFloat(cum.toFixed(2)),day:parseFloat(toLocal(p).toFixed(2))}; });
    return [startPt,...pts];
  },[sorted, initBalUSD, toLocal]);

  // ── B. Symbol Performance ─────────────────────────────────────────────────
  const symbolData = useMemo(()=>{
    const map={};
    deferredTrades.forEach(t=>{
      if(!map[t.symbol]) map[t.symbol]={pnl:0,wins:0,count:0};
      map[t.symbol].pnl+=t.pnl; map[t.symbol].count++;
      if(t.pnl>0) map[t.symbol].wins++;
    });
    return Object.entries(map).map(([sym,d])=>({
      sym, pnl:parseFloat(d.pnl.toFixed(2)),
      wr:parseFloat((d.wins/d.count*100).toFixed(0)),
      count:d.count,
    })).sort((a,b)=>b.pnl-a.pnl);
  },[trades]);

  // ── C. Session Performance ────────────────────────────────────────────────
  const sessionData = useMemo(()=>{
    const map={};
    deferredTrades.forEach(t=>{
      const s=t.session||"Unknown";
      if(!map[s]) map[s]={pnl:0,wins:0,count:0};
      map[s].pnl+=t.pnl; map[s].count++;
      if(t.pnl>0) map[s].wins++;
    });
    return Object.entries(map).map(([session,d])=>({
      session, pnl:parseFloat(d.pnl.toFixed(2)),
      wr:parseFloat((d.wins/d.count*100).toFixed(0)),
      count:d.count,
    })).sort((a,b)=>b.pnl-a.pnl);
  },[trades]);

  // ── D. Performance by Model/Setup ────────────────────────────────────────
  const modelData = useMemo(()=>{
    const map={};
    deferredTrades.forEach(t=>{
      const m=t.model||"Unknown";
      if(!map[m]) map[m]={pnl:0,wins:0,count:0};
      map[m].pnl+=t.pnl; map[m].count++;
      if(t.pnl>0) map[m].wins++;
    });
    return Object.entries(map).map(([model,d])=>({
      model, pnl:parseFloat(d.pnl.toFixed(2)),
      wr:parseFloat((d.wins/d.count*100).toFixed(0)),
      count:d.count,
    })).sort((a,b)=>b.pnl-a.pnl);
  },[trades]);

  // ── E. Equity Curve + Volatility ─────────────────────────────────────────
  const equityData = useMemo(()=>{
    const byWeek={};
    sorted.forEach(t=>{
      const d=new Date(t.date+"T12:00:00");
      const ws=new Date(d); ws.setDate(d.getDate()-d.getDay());
      const wk=ws.toISOString().slice(0,10);
      if(!byWeek[wk]) byWeek[wk]=[];
      byWeek[wk].push(t.pnl);
    });
    const initLocal = toLocal(initBalUSD);
    let cum=initLocal;
    const startPt={week:"Start",equity:parseFloat(initLocal.toFixed(2)),ret:0,vol:0};
    const wks=Object.keys(byWeek).sort().map(wk=>{ const s=byWeek[wk].reduce((a,v)=>a+v,0); cum+=toLocal(s); return{week:wk.slice(5),equity:parseFloat(cum.toFixed(2)),ret:parseFloat(toLocal(s).toFixed(2))}; });
    const withVol=wks.map((pt,i,arr)=>{
      const win=arr.slice(Math.max(0,i-3),i+1).map(x=>x.ret);
      const mean=win.reduce((a,v)=>a+v,0)/win.length;
      const vol=parseFloat(Math.sqrt(win.reduce((a,v)=>a+(v-mean)**2,0)/win.length).toFixed(2));
      return{...pt,vol};
    });
    return [startPt,...withVol];
  },[sorted, initBalUSD, toLocal]);

  // ── F. Rolling Win Rate + Streak ──────────────────────────────────────────
  const winRateData = useMemo(()=>{
    const W=10;
    return sorted.map((t,i,arr)=>{
      const win=arr.slice(Math.max(0,i-W+1),i+1);
      const wr=parseFloat((win.filter(x=>x.pnl>0).length/win.length*100).toFixed(1));
      let streak=0; const kind=t.pnl>0?"w":"l";
      for(let j=i;j>=0;j--){ if((arr[j].pnl>0?"w":"l")===kind) streak++; else break; }
      return{date:t.date.slice(5),wr,streak:kind==="w"?streak:-streak};
    });
  },[sorted]);

  // ── G. Return Distribution Histogram ─────────────────────────────────────
  const histData = useMemo(()=>{
    if(trades.length<2) return[];
    const pnls=trades.map(t=>t.pnl);
    const min=Math.min(...pnls), max=Math.max(...pnls), range=max-min||1;
    const BINS=12, binW=range/BINS;
    const mean=pnls.reduce((a,v)=>a+v,0)/pnls.length;
    const std=Math.sqrt(pnls.reduce((a,v)=>a+(v-mean)**2,0)/pnls.length)||1;
    return Array.from({length:BINS},(_,i)=>{
      const lo=min+i*binW, hi=lo+binW, mid=(lo+hi)/2;
      const count=pnls.filter(p=>p>=lo&&(i===BINS-1?p<=hi:p<hi)).length;
      const y=Math.exp(-0.5*((mid-mean)/std)**2)/(std*Math.sqrt(2*Math.PI));
      return{range:`${lo>=0?"+":""}${lo.toFixed(0)}`,count,normal:parseFloat((y*trades.length*binW).toFixed(3)),mid,lo};
    });
  },[trades]);

  // ── H. Profit Factor Over Time (rolling 20) ───────────────────────────────
  const pfData = useMemo(()=>{
    const W=20;
    return sorted.map((t,i,arr)=>{
      const win=arr.slice(Math.max(0,i-W+1),i+1);
      const gw=win.filter(x=>x.pnl>0).reduce((s,x)=>s+x.pnl,0);
      const gl=Math.abs(win.filter(x=>x.pnl<0).reduce((s,x)=>s+x.pnl,0));
      return{date:t.date.slice(5),pf:Math.min(gl>0?parseFloat((gw/gl).toFixed(2)):gw>0?9.99:0,9.99)};
    });
  },[sorted]);

  // ── I. Win/Loss Streaks ────────────────────────────────────────────────────
  const streakBars = useMemo(()=>{
    if(!sorted.length) return[];
    const out=[];
    let cur={type:sorted[0].pnl>0?"win":"loss",count:1,start:sorted[0].date};
    for(let i=1;i<sorted.length;i++){
      const type=sorted[i].pnl>0?"win":"loss";
      if(type===cur.type) cur.count++;
      else{ out.push({...cur}); cur={type,count:1,start:sorted[i].date}; }
    }
    out.push({...cur}); return out.slice(-20);
  },[sorted]);

  // ── J. Rolling Sharpe ─────────────────────────────────────────────────────
  const sharpeData = useMemo(()=>{
    const W=20;
    return sorted.map((t,i,arr)=>{
      const win=arr.slice(Math.max(0,i-W+1),i+1).map(x=>x.pnl);
      const mean=win.reduce((a,v)=>a+v,0)/win.length;
      const std=Math.sqrt(win.reduce((a,v)=>a+(v-mean)**2,0)/win.length)||0.001;
      return{date:t.date.slice(5),sharpe:Math.max(-4,Math.min(parseFloat((mean/std*Math.sqrt(252/5)).toFixed(2)),8))};
    });
  },[sorted]);

  // ── K. Rolling Expectancy ─────────────────────────────────────────────────
  const expectancyData = useMemo(()=>{
    const W=15;
    return sorted.map((t,i,arr)=>{
      const win=arr.slice(Math.max(0,i-W+1),i+1);
      const ws=win.filter(x=>x.pnl>0), ls=win.filter(x=>x.pnl<0);
      const wr=win.length?ws.length/win.length:0;
      const lr=1-wr;
      const avgW=ws.length?ws.reduce((s,x)=>s+x.pnl,0)/ws.length:0;
      const avgL=ls.length?Math.abs(ls.reduce((s,x)=>s+x.pnl,0)/ls.length):0;
      const exp=parseFloat(((wr*avgW)-(lr*avgL)).toFixed(2));
      return{date:t.date.slice(5),exp,avgW:parseFloat(avgW.toFixed(2)),avgL:parseFloat(avgL.toFixed(2))};
    });
  },[sorted]);

  // ── L. Benchmark Comparison (vs S&P 500 estimates) ────────────────────────
  const benchmarkData = useMemo(()=>{
    if(trades.length<2) return null;
    const initLocal=toLocal(initBalUSD)||1;
    const totalPnlLocal=toLocal(totalPnl);
    // Date span in years
    const dates=sorted.map(t=>new Date(t.date+"T12:00:00"));
    const spanMs=dates[dates.length-1]-dates[0]; const spanYrs=Math.max(spanMs/(365.25*86400000),1/52);
    // ── Trader metrics ──
    const traderCAGR=parseFloat(((Math.pow((initLocal+totalPnlLocal)/initLocal,1/spanYrs)-1)*100).toFixed(1));
    // Sharpe: annualised mean/std of daily returns (% of initial)
    const dailyMap={}; sorted.forEach(t=>{dailyMap[t.date]=(dailyMap[t.date]||0)+t.pnl;});
    const dailyRets=Object.values(dailyMap).map(p=>toLocal(p)/initLocal*100);
    const dMean=dailyRets.reduce((s,v)=>s+v,0)/Math.max(dailyRets.length,1);
    const dStd=Math.sqrt(dailyRets.reduce((s,v)=>s+(v-dMean)**2,0)/Math.max(dailyRets.length,1))||0.001;
    const traderSharpe=parseFloat((dMean/dStd*Math.sqrt(252)).toFixed(2));
    // Max drawdown
    let peak=initLocal,maxDD=0,runBal=initLocal;
    sorted.forEach(t=>{runBal+=toLocal(t.pnl);if(runBal>peak)peak=runBal;const dd=(peak-runBal)/peak*100;if(dd>maxDD)maxDD=dd;});
    const traderDD=parseFloat(maxDD.toFixed(1));
    // Volatility (annualised std of daily returns %)
    const traderVol=parseFloat((dStd*Math.sqrt(252)).toFixed(1));
    // Alpha / Beta — approximate using S&P daily ~0.04% mean, ~1% std
    const spDailyMean=0.04; const spDailyStd=1.0;
    const beta=parseFloat((dStd/spDailyStd*(dMean/Math.max(Math.abs(spDailyMean),0.001)/Math.abs(dMean/Math.max(Math.abs(spDailyMean),0.001)))).toFixed(2));
    const traderBeta=Math.max(-3,Math.min(parseFloat((dStd/spDailyStd).toFixed(2)),3));
    const traderAlpha=parseFloat((traderCAGR-(traderBeta*spDailyMean*252)).toFixed(1));
    // ── S&P 500 reference values ──
    const spCAGR=10.5; // historical avg %
    const spSharpe=0.55;
    const spDD=33.9; // avg bear-market DD
    const spVol=15.8;
    const spBeta=1.0; const spAlpha=0;
    return {
      cagrData:[{name:"Your Trading",value:traderCAGR,fill:traderCAGR>=0?GREEN:RED},{name:"S&P 500",value:spCAGR,fill:BLUE}],
      sharpeData:[{name:"Your Trading",value:traderSharpe,fill:traderSharpe>=1?GREEN:traderSharpe>=0?YELLOW:RED},{name:"S&P 500",value:spSharpe,fill:BLUE}],
      riskData:[
        {metric:"Max DD %",trader:traderDD,sp500:spDD},
        {metric:"Volatility %",trader:traderVol,sp500:spVol},
      ],
      abData:[{name:"Your Trading",beta:traderBeta,alpha:traderAlpha,fill:traderAlpha>=0?GREEN:RED},{name:"S&P 500",beta:spBeta,alpha:spAlpha,fill:BLUE}],
      traderCAGR,spCAGR,traderSharpe,spSharpe,traderDD,spDD,traderVol,spVol,traderBeta,traderAlpha,
    };
  },[sorted,trades,initBalUSD,totalPnl,toLocal]);

  // ── Shared styles ─────────────────────────────────────────────────────────
  const C={background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px 16px 12px",display:"flex",flexDirection:"column",minHeight:0};
  const T=(label,sub)=>(
    <div style={{marginBottom:12}}>
      <div style={{fontSize:11,color:WHITE,fontWeight:700,letterSpacing:"-0.01em"}}>{label}</div>
      {sub&&<div style={{fontSize:10,color:MUTED,marginTop:2}}>{sub}</div>}
    </div>
  );
  const Empty=()=><div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED,fontSize:12,minHeight:140}}>Not enough data</div>;
  const CH=180;

  // Session colors
  const SCOL={"London":"#6eb5ff","New York":"#e07be0","Asia":"#f5c842","Unknown":MUTED};
  const MODEL_COLS=["#4a90d9","#2ecc71","#f5c842","#e07be0","#ff6b6b","#00d4ff","#ff9f43"];

  return (
    <div style={{padding:"22px 22px 60px"}}>
      {/* ── Header ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h1 style={{margin:0,fontSize:18,fontWeight:800,color:WHITE}}>Risk Analysis</h1>
        <AccountFilterBar accounts={accounts} analyticsAccount={analyticsAccount} setAnalyticsAccount={setAnalyticsAccount}/>
      </div>
      <Breadcrumb current="risk" setPage={setPage}/>

      {/* ── KPI Bar ── */}
      <StatRow items={[
        {label:"Win Rate",      value:`${winRate.toFixed(1)}%`,                                          icon:"🎯",positive:winRate>=50},
        {label:"Profit Factor", value:profitFactor===999?"∞":profitFactor.toFixed(2),                    icon:"⚖", positive:profitFactor>=1},
        {label:"Avg Win",       value:fmt(avgWin),                                                       icon:"↗", positive:true},
        {label:"Avg Loss",      value:fmt(avgLoss),                                                      icon:"↘", positive:false},
        {label:"Net P&L",       value:`${totalPnl>=0?"+":""}${fmt(totalPnl)}`,                           icon:"📈",positive:totalPnl>=0},
        {label:"Total Trades",  value:trades.length,                                                     icon:"📋",positive:null},
      ]}/>

      {/* ════════════════════════════════════
          ROW 1 — Performance Breakdowns (3 col)
          ════════════════════════════════════ */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>

        {/* A — Symbol Performance */}
        <div style={C}>
          {T("Symbol Performance","Net P&L & win rate per asset")}
          {symbolData.length===0?<Empty/>:(
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:7,overflowY:"auto",maxHeight:220}}>
              {symbolData.map((s,i)=>{
                const maxAbs=Math.max(...symbolData.map(x=>Math.abs(x.pnl)),1);
                const barPct=Math.abs(s.pnl)/maxAbs*100;
                return (
                  <div key={s.sym}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{fontSize:11,fontWeight:700,color:CYAN}}>#{s.sym}</span>
                        <span style={{fontSize:9,color:MUTED}}>{s.count} trades</span>
                      </div>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <span style={{fontSize:9,color:s.wr>=50?GREEN:RED,fontWeight:600,background:s.wr>=50?GREEN+"14":RED+"14",borderRadius:4,padding:"1px 6px"}}>{s.wr}%WR</span>
                        <span style={{fontSize:11,fontWeight:700,color:s.pnl>=0?GREEN:RED,minWidth:60,textAlign:"right"}}>{s.pnl>=0?"+":""}${s.pnl}</span>
                      </div>
                    </div>
                    <div style={{height:5,background:CARD2,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${barPct}%`,borderRadius:3,background:s.pnl>=0?`linear-gradient(90deg,${GREEN},${GREEN}88)`:`linear-gradient(90deg,${RED},${RED}88)`,transition:"width 0.4s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* B — Session Performance */}
        <div style={C}>
          {T("Session Performance","P&L breakdown by trading session")}
          {sessionData.length===0?<Empty/>:(
            <>
              <div style={{flex:1,minHeight:CH}}>
                <ResponsiveContainer width="100%" height={CH}>
                  <ComposedChart data={sessionData} margin={{top:4,right:4,left:0,bottom:20}}>
                    <CartesianGrid stroke="#252525" vertical={false}/>
                    <XAxis dataKey="session" tick={{...ax,fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="pnl" tick={ax} axisLine={false} tickLine={false} width={44} tickFormatter={v=>`$${v}`}/>
                    <YAxis yAxisId="wr" orientation="right" tick={ax} axisLine={false} tickLine={false} width={32} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                    <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={(v,n)=>n==="wr"?[`${v}%`,"WR"]:[`$${v}`,"P&L"]}/>
                    <ReferenceLine yAxisId="pnl" y={0} stroke={BORDER}/>
                    <Bar yAxisId="pnl" dataKey="pnl" radius={[4,4,0,0]} maxBarSize={40} isAnimationActive={false}>
                      {sessionData.map((e,i)=><Cell key={i} fill={SCOL[e.session]||MODEL_COLS[i%MODEL_COLS.length]}/>)}
                    </Bar>
                    <Line yAxisId="wr" type="monotone" dataKey="wr" stroke={YELLOW} strokeWidth={2} dot={{fill:YELLOW,r:3}} isAnimationActive={false}/>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
                {sessionData.map(s=>(
                  <span key={s.session} style={{fontSize:9,color:SCOL[s.session]||MUTED,background:(SCOL[s.session]||MUTED)+"14",borderRadius:4,padding:"1px 6px",fontWeight:600}}>
                    ● {s.session} · {s.count}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* C — Performance by Model */}
        <div style={C}>
          {T("Performance by Setup","Net P&L & win rate per model")}
          {modelData.length===0?<Empty/>:(
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:7,overflowY:"auto",maxHeight:220}}>
              {modelData.map((m,i)=>{
                const maxAbs=Math.max(...modelData.map(x=>Math.abs(x.pnl)),1);
                const col=MODEL_COLS[i%MODEL_COLS.length];
                return (
                  <div key={m.model}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:col,display:"inline-block",flexShrink:0}}/>
                        <span style={{fontSize:11,fontWeight:600,color:WHITE}}>{m.model}</span>
                        <span style={{fontSize:9,color:MUTED}}>{m.count}×</span>
                      </div>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <span style={{fontSize:9,color:m.wr>=50?GREEN:RED,fontWeight:600,background:m.wr>=50?GREEN+"14":RED+"14",borderRadius:4,padding:"1px 6px"}}>{m.wr}%</span>
                        <span style={{fontSize:11,fontWeight:700,color:m.pnl>=0?GREEN:RED,minWidth:54,textAlign:"right"}}>{m.pnl>=0?"+":""}${m.pnl}</span>
                      </div>
                    </div>
                    <div style={{height:4,background:CARD2,borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${Math.abs(m.pnl)/maxAbs*100}%`,borderRadius:3,background:m.pnl>=0?col:RED,transition:"width 0.4s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════
          ROW 2 — Account Growth (full width)
          ════════════════════════════════════ */}
      <div style={{...C,marginBottom:14}}>
        {T("Account Growth","Cumulative P&L over time · daily bars behind equity curve")}
        {accountGrowthData.length<2?<Empty/>:(
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={accountGrowthData} margin={{top:4,right:4,left:0,bottom:0}}>
              <defs>
                <linearGradient id="agGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity={0.28}/>
                  <stop offset="100%" stopColor={GREEN} stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#252525" vertical={false}/>
              <XAxis dataKey="date" tick={ax} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis yAxisId="cum" tick={ax} axisLine={false} tickLine={false} width={60} tickFormatter={v=>`${symbol}${v>=1000?`${(v/1000).toFixed(1)}k`:v.toFixed(0)}`}/>
              <YAxis yAxisId="day" orientation="right" tick={ax} axisLine={false} tickLine={false} width={44} tickFormatter={v=>`${symbol}${v.toFixed(0)}`}/>
              <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={(v,n)=>[`$${v.toFixed(2)}`,n==="pnl"?"Cumulative":"Daily P&L"]}/>
              <ReferenceLine yAxisId="cum" y={toLocal(initBalUSD)} stroke={GREEN} strokeDasharray="4,3" strokeOpacity={0.4} label={{value:"Start",fill:GREEN+"88",fontSize:8,position:"insideTopLeft"}}/>
              <ReferenceLine yAxisId="cum" y={0} stroke={BORDER}/>
              <Bar yAxisId="day" dataKey="day" maxBarSize={18} isAnimationActive={false} opacity={0.45} radius={[2,2,0,0]}>
                {accountGrowthData.map((e,i)=><Cell key={i} fill={e.day>=0?GREEN:RED}/>)}
              </Bar>
              <Area yAxisId="cum" type="monotone" dataKey="pnl" stroke={GREEN} strokeWidth={2.5} fill="url(#agGrad)" dot={false} isAnimationActive={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ════════════════════════════════════
          ROWS 3 & 4 — Analytics 3×2 Grid
          ════════════════════════════════════ */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>

        {/* E — Equity Curve + Volatility */}
        <div style={C}>
          {T("Equity + Volatility","Weekly cumulative · 4-wk rolling vol band")}
          {equityData.length<2?<Empty/>:(
            <ResponsiveContainer width="100%" height={CH}>
              <AreaChart data={equityData} margin={{top:4,right:4,left:0,bottom:0}}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GREEN} stopOpacity={0.3}/><stop offset="100%" stopColor={GREEN} stopOpacity={0.02}/>
                  </linearGradient>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={YELLOW} stopOpacity={0.22}/><stop offset="100%" stopColor={YELLOW} stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252525" vertical={false}/>
                <XAxis dataKey="week" tick={ax} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis yAxisId="eq" tick={ax} axisLine={false} tickLine={false} width={60} tickFormatter={v=>`${symbol}${v>=1000?`${(v/1000).toFixed(1)}k`:v.toFixed(0)}`}/>
                <YAxis yAxisId="vol" orientation="right" tick={ax} axisLine={false} tickLine={false} width={32} tickFormatter={v=>`±${v.toFixed(0)}`}/>
                <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={(v,n)=>[n==="equity"?`${symbol}${v.toFixed(2)}`:`±${symbol}${v.toFixed(2)}`,n==="equity"?"Equity":"Vol"]}/>
                <ReferenceLine yAxisId="eq" y={toLocal(initBalUSD)} stroke={GREEN} strokeDasharray="4,3" strokeOpacity={0.4} label={{value:"Start",fill:GREEN+"88",fontSize:8,position:"insideTopLeft"}}/>
                <Area yAxisId="vol" type="monotone" dataKey="vol" stroke={YELLOW} strokeWidth={1} fill="url(#volGrad)" dot={false} isAnimationActive={false}/>
                <Area yAxisId="eq" type="monotone" dataKey="equity" stroke={GREEN} strokeWidth={2} fill="url(#eqGrad)" dot={false} isAnimationActive={false}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* F — Win Rate + Streak */}
        <div style={C}>
          {T("Win Rate Over Time","Rolling 10-trade win % with streak bars")}
          {winRateData.length<3?<Empty/>:(
            <ResponsiveContainer width="100%" height={CH}>
              <ComposedChart data={winRateData} margin={{top:4,right:4,left:0,bottom:0}}>
                <defs>
                  <linearGradient id="wrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CYAN} stopOpacity={0.22}/><stop offset="100%" stopColor={CYAN} stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252525" vertical={false}/>
                <XAxis dataKey="date" tick={ax} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis yAxisId="wr" tick={ax} axisLine={false} tickLine={false} width={36} domain={[0,100]} tickFormatter={v=>`${v}%`}/>
                <YAxis yAxisId="str" orientation="right" tick={ax} axisLine={false} tickLine={false} width={26}/>
                <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={(v,n)=>[n==="wr"?`${v}%`:v,n==="wr"?"Win Rate":"Streak"]}/>
                <ReferenceLine yAxisId="wr" y={50} stroke={BORDER} strokeDasharray="3,3" label={{value:"50%",fill:MUTED,fontSize:8,position:"insideTopRight"}}/>
                <Area yAxisId="wr" type="monotone" dataKey="wr" stroke={CYAN} strokeWidth={2} fill="url(#wrGrad)" dot={false} isAnimationActive={false}/>
                <Bar yAxisId="str" dataKey="streak" maxBarSize={5} isAnimationActive={false}>
                  {winRateData.map((e,i)=><Cell key={i} fill={e.streak>=0?GREEN+"bb":RED+"bb"}/>)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* G — Return Distribution */}
        <div style={C}>
          {T("Return Distribution","P&L histogram · yellow = normal curve")}
          {histData.length<3?<Empty/>:(
            <ResponsiveContainer width="100%" height={CH}>
              <ComposedChart data={histData} margin={{top:4,right:4,left:0,bottom:0}}>
                <CartesianGrid stroke="#252525" vertical={false}/>
                <XAxis dataKey="range" tick={ax} axisLine={false} tickLine={false} interval={2}/>
                <YAxis tick={ax} axisLine={false} tickLine={false} width={26}/>
                <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={(v,n)=>[typeof v==="number"?v.toFixed(n==="normal"?2:0):v,n==="count"?"Freq":"Normal"]}/>
                <Bar dataKey="count" radius={[3,3,0,0]} maxBarSize={30} isAnimationActive={false}>
                  {histData.map((e,i)=><Cell key={i} fill={e.lo>=0?GREEN+"bb":RED+"bb"}/>)}
                </Bar>
                <Line type="monotone" dataKey="normal" stroke={YELLOW} strokeWidth={2} dot={false} isAnimationActive={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* H — Profit Factor Over Time */}
        <div style={C}>
          {T("Profit Factor Over Time","Rolling 20-trade · 1.0 = breakeven")}
          {pfData.length<5?<Empty/>:(
            <ResponsiveContainer width="100%" height={CH}>
              <AreaChart data={pfData} margin={{top:4,right:4,left:0,bottom:0}}>
                <defs>
                  <linearGradient id="pfGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.28}/><stop offset="100%" stopColor={BLUE} stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#252525" vertical={false}/>
                <XAxis dataKey="date" tick={ax} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                <YAxis tick={ax} axisLine={false} tickLine={false} width={34} tickFormatter={v=>`${v}x`}/>
                <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={(v)=>[`${v}x`,"Profit Factor"]}/>
                <ReferenceLine y={1} stroke={RED} strokeDasharray="4,3" label={{value:"1.0",fill:RED+"cc",fontSize:9,position:"insideTopRight"}}/>
                <ReferenceLine y={2} stroke={GREEN+"55"} strokeDasharray="3,3" label={{value:"2.0",fill:GREEN+"88",fontSize:9,position:"insideTopRight"}}/>
                <Area type="monotone" dataKey="pf" stroke={BLUE} strokeWidth={2} fill="url(#pfGrad)" dot={false} isAnimationActive={false}/>
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* I — Win/Loss Streak Bars */}
        <div style={C}>
          {T("Win / Loss Streak History","Horizontal bars for last 20 streaks")}
          {streakBars.length===0?<Empty/>:(
            <div style={{display:"flex",flexDirection:"column",gap:5,overflowY:"auto",maxHeight:CH+10}}>
              {streakBars.map((s,i)=>{
                const maxC=Math.max(...streakBars.map(x=>x.count),1);
                const isW=s.type==="win";
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:10,color:isW?GREEN:RED,fontWeight:800,width:12,flexShrink:0,textAlign:"center"}}>{isW?"W":"L"}</span>
                    <div style={{flex:1,background:CARD2,borderRadius:3,height:18,position:"relative",overflow:"hidden"}}>
                      <div style={{
                        position:"absolute",left:0,top:0,height:"100%",
                        width:`${s.count/maxC*100}%`,
                        background:isW?`linear-gradient(90deg,${GREEN}99,${GREEN}44)`:`linear-gradient(90deg,${RED}99,${RED}44)`,
                        borderRadius:3,transition:"width 0.35s",
                      }}/>
                      <span style={{position:"absolute",left:8,top:0,lineHeight:"18px",fontSize:9,color:isW?GREEN:RED,fontWeight:700,letterSpacing:"0.03em"}}>
                        {s.count} {s.type}{s.count>1?"s":""} · {s.start.slice(5)}
                      </span>
                    </div>
                    <span style={{fontSize:9,color:MUTED,width:22,textAlign:"right",flexShrink:0}}>×{s.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* J — Rolling Sharpe Ratio */}
        <div style={{...C,position:"relative"}}>
          {T("Rolling Sharpe Ratio","20-trade · ≥1.0 green zone · <1.0 red zone")}
          {sharpeData.length<5?<Empty/>:(
            <>
              <ResponsiveContainer width="100%" height={CH}>
                <AreaChart data={sharpeData} margin={{top:4,right:4,left:0,bottom:0}}>
                  <defs>
                    <linearGradient id="shGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GREEN} stopOpacity={0.25}/><stop offset="100%" stopColor={GREEN} stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#252525" vertical={false}/>
                  <XAxis dataKey="date" tick={ax} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                  <YAxis tick={ax} axisLine={false} tickLine={false} width={34} tickFormatter={v=>v.toFixed(1)}/>
                  <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={(v)=>[v.toFixed(2),"Sharpe"]}/>
                  <ReferenceLine y={0} stroke={BORDER}/>
                  <ReferenceLine y={1} stroke={GREEN} strokeWidth={1.5} strokeDasharray="4,3" label={{value:"1.0 ✓",fill:GREEN,fontSize:9,position:"insideTopRight"}}/>
                  <ReferenceLine y={-1} stroke={RED+"88"} strokeDasharray="3,3"/>
                  <Area type="monotone" dataKey="sharpe" stroke={GREEN} strokeWidth={2} fill="url(#shGrad)" dot={false} isAnimationActive={false} activeDot={{r:4,fill:GREEN}}/>
                </AreaChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:14,marginTop:6}}>
                <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:GREEN}}><span style={{width:8,height:8,borderRadius:"50%",background:GREEN,display:"inline-block"}}/> ≥1.0 consistent edge</span>
                <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:RED}}><span style={{width:8,height:8,borderRadius:"50%",background:RED,display:"inline-block"}}/> &lt;1.0 noisy / no edge</span>
              </div>
            </>
          )}
        </div>

      </div>

      {/* ════════════════════════════════════
          ROW 5 — Expectancy (full-width)
          ════════════════════════════════════ */}
      <div style={{...C,marginBottom:14,marginTop:14}}>
        {T("Rolling Expectancy","15-trade rolling · Expectancy = (Win% × Avg Win) – (Loss% × Avg Loss)")}
        {expectancyData.length<3?<Empty/>:(
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={expectancyData} margin={{top:4,right:4,left:0,bottom:0}}>
              <defs>
                <linearGradient id="expPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity={0.28}/><stop offset="100%" stopColor={GREEN} stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="expNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={RED} stopOpacity={0.22}/><stop offset="100%" stopColor={RED} stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#252525" vertical={false}/>
              <XAxis dataKey="date" tick={ax} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
              <YAxis yAxisId="exp" tick={ax} axisLine={false} tickLine={false} width={60} tickFormatter={v=>`${symbol}${v>=0?"+":""}${v.toFixed(0)}`}/>
              <YAxis yAxisId="avg" orientation="right" tick={ax} axisLine={false} tickLine={false} width={60} tickFormatter={v=>`${symbol}${v.toFixed(0)}`}/>
              <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}}
                formatter={(v,n)=>[`${symbol}${v.toFixed(2)}`,n==="exp"?"Expectancy":n==="avgW"?"Avg Win":"Avg Loss"]}/>
              <ReferenceLine yAxisId="exp" y={0} stroke={BORDER}/>
              <Line yAxisId="avg" type="monotone" dataKey="avgW" stroke={GREEN} strokeWidth={1} dot={false} strokeDasharray="3,3" isAnimationActive={false} opacity={0.5}/>
              <Line yAxisId="avg" type="monotone" dataKey="avgL" stroke={RED} strokeWidth={1} dot={false} strokeDasharray="3,3" isAnimationActive={false} opacity={0.5}/>
              <Area yAxisId="exp" type="monotone" dataKey="exp" stroke={GREEN} strokeWidth={2.5}
                fill="url(#expPos)" dot={false} isAnimationActive={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {expectancyData.length>=3&&(
          <div style={{display:"flex",gap:18,marginTop:6}}>
            <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:GREEN}}><span style={{width:8,height:2,background:GREEN,display:"inline-block"}}/> Expectancy line</span>
            <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:GREEN,opacity:0.6}}><span style={{width:8,height:2,background:GREEN,display:"inline-block",opacity:0.5}}/> Avg Win (dashed)</span>
            <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:RED,opacity:0.6}}><span style={{width:8,height:2,background:RED,display:"inline-block",opacity:0.5}}/> Avg Loss (dashed)</span>
            {expectancyData.length>0&&<span style={{marginLeft:"auto",fontSize:10,color:expectancyData[expectancyData.length-1].exp>=0?GREEN:RED,fontWeight:700}}>
              Latest: {symbol}{expectancyData[expectancyData.length-1].exp>=0?"+":""}{expectancyData[expectancyData.length-1].exp.toFixed(2)} per trade
            </span>}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          ROW 6 — Benchmark Comparison
          ════════════════════════════════════ */}
      {benchmarkData&&(
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 14px"}}>
            <div style={{flex:1,height:1,background:BORDER}}/>
            <span style={{fontSize:11,fontWeight:700,color:WHITE,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap"}}>📊 Benchmark Comparison (vs S&P 500)</span>
            <div style={{flex:1,height:1,background:BORDER}}/>
          </div>
          <div style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"7px 14px",marginBottom:14,fontSize:11,color:MUTED,lineHeight:1.6}}>
            S&P 500 reference values are long-run historical averages (CAGR≈10.5%, Sharpe≈0.55, Max DD≈34%, Vol≈16%). Your metrics are computed from your actual trade history over the same span.
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14,marginBottom:14}}>

            {/* CAGR comparison */}
            <div style={C}>
              {T("Annualised Return (CAGR)","Compound annual growth rate · your trades vs S&P 500")}
              <ResponsiveContainer width="100%" height={CH}>
                <BarChart data={benchmarkData.cagrData} margin={{top:4,right:4,left:0,bottom:0}}>
                  <CartesianGrid stroke="#252525" vertical={false}/>
                  <XAxis dataKey="name" tick={ax} axisLine={false} tickLine={false}/>
                  <YAxis tick={ax} axisLine={false} tickLine={false} width={38} tickFormatter={v=>`${v}%`}/>
                  <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={v=>[`${v}%`,"CAGR"]}/>
                  <ReferenceLine y={0} stroke={BORDER}/>
                  <Bar dataKey="value" name="CAGR" maxBarSize={60} radius={[6,6,0,0]} isAnimationActive={false}>
                    {benchmarkData.cagrData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6,padding:"6px 10px",background:CARD,borderRadius:6}}>
                <span style={{fontSize:10,color:WHITE}}>Your CAGR: <b style={{color:benchmarkData.traderCAGR>=0?GREEN:RED}}>{benchmarkData.traderCAGR>=0?"+":""}{benchmarkData.traderCAGR}%</b></span>
                <span style={{fontSize:10,color:MUTED}}>S&P 500: <b style={{color:BLUE}}>+{benchmarkData.spCAGR}%</b></span>
              </div>
            </div>

            {/* Sharpe ratio comparison */}
            <div style={C}>
              {T("Sharpe Ratio","Risk-adjusted return · ≥1 is good · ≥2 is excellent")}
              <ResponsiveContainer width="100%" height={CH}>
                <BarChart data={benchmarkData.sharpeData} margin={{top:4,right:4,left:0,bottom:0}}>
                  <CartesianGrid stroke="#252525" vertical={false}/>
                  <XAxis dataKey="name" tick={ax} axisLine={false} tickLine={false}/>
                  <YAxis tick={ax} axisLine={false} tickLine={false} width={34} tickFormatter={v=>v.toFixed(1)}/>
                  <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={v=>[v.toFixed(2),"Sharpe"]}/>
                  <ReferenceLine y={0} stroke={BORDER}/>
                  <ReferenceLine y={1} stroke={GREEN} strokeDasharray="3,3" strokeOpacity={0.5}/>
                  <Bar dataKey="value" name="Sharpe" maxBarSize={60} radius={[6,6,0,0]} isAnimationActive={false}>
                    {benchmarkData.sharpeData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6,padding:"6px 10px",background:CARD,borderRadius:6}}>
                <span style={{fontSize:10,color:WHITE}}>Your Sharpe: <b style={{color:benchmarkData.traderSharpe>=1?GREEN:benchmarkData.traderSharpe>=0?YELLOW:RED}}>{benchmarkData.traderSharpe>=0?"+":""}{benchmarkData.traderSharpe}</b></span>
                <span style={{fontSize:10,color:MUTED}}>S&P 500: <b style={{color:BLUE}}>{benchmarkData.spSharpe}</b></span>
              </div>
            </div>

            {/* Risk metrics: drawdown + volatility */}
            <div style={C}>
              {T("Risk Metrics","Max drawdown & annualised volatility · lower = less risk")}
              <ResponsiveContainer width="100%" height={CH}>
                <BarChart data={benchmarkData.riskData} layout="vertical" margin={{top:4,right:4,left:0,bottom:0}}>
                  <CartesianGrid stroke="#252525" horizontal={false}/>
                  <XAxis type="number" tick={ax} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
                  <YAxis type="category" dataKey="metric" tick={{...ax,fill:"#aaa"}} width={80} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}} formatter={v=>[`${v}%`]}/>
                  <Bar dataKey="trader" name="Your Trading" maxBarSize={28} radius={[0,4,4,0]} fill={RED} isAnimationActive={false}/>
                  <Bar dataKey="sp500"  name="S&P 500"      maxBarSize={28} radius={[0,4,4,0]} fill={BLUE} isAnimationActive={false}/>
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:16,marginTop:6}}>
                <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:RED}}><span style={{width:8,height:8,borderRadius:2,background:RED,display:"inline-block"}}/> Your Trading</span>
                <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:BLUE}}><span style={{width:8,height:8,borderRadius:2,background:BLUE,display:"inline-block"}}/> S&P 500</span>
                <span style={{marginLeft:"auto",fontSize:9,color:MUTED}}>Max DD: <b style={{color:benchmarkData.traderDD<=benchmarkData.spDD?GREEN:RED}}>{benchmarkData.traderDD}%</b> · Vol: <b style={{color:benchmarkData.traderVol<=benchmarkData.spVol?GREEN:RED}}>{benchmarkData.traderVol}%</b></span>
              </div>
            </div>

            {/* Beta / Alpha */}
            <div style={C}>
              {T("Beta & Alpha","Beta = market sensitivity · Alpha = excess return above market")}
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:16,justifyContent:"center",padding:"16px 4px"}}>
                {/* Beta gauge */}
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:11,color:MUTED}}>Beta (β)</span>
                    <span style={{fontSize:13,fontWeight:800,color:benchmarkData.traderBeta>0&&benchmarkData.traderBeta<2?GREEN:YELLOW}}>{benchmarkData.traderBeta}</span>
                  </div>
                  <div style={{height:8,background:CARD2,borderRadius:4,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.min(Math.abs(benchmarkData.traderBeta)/3*100,100)}%`,background:`linear-gradient(90deg,${GREEN},${benchmarkData.traderBeta>2?RED:GREEN})`,borderRadius:4}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:9,color:MUTED}}>
                    <span>0 (uncorrelated)</span><span style={{color:GREEN}}>1.0 (market)</span><span>3.0 (high risk)</span>
                  </div>
                </div>
                {/* Alpha bar */}
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:11,color:MUTED}}>Alpha (α)</span>
                    <span style={{fontSize:13,fontWeight:800,color:benchmarkData.traderAlpha>=0?GREEN:RED}}>{benchmarkData.traderAlpha>=0?"+":""}{benchmarkData.traderAlpha}%</span>
                  </div>
                  <div style={{height:8,background:CARD2,borderRadius:4,position:"relative",overflow:"hidden"}}>
                    <div style={{position:"absolute",left:"50%",top:0,height:"100%",
                      width:`${Math.min(Math.abs(benchmarkData.traderAlpha)/40*50,50)}%`,
                      transform:benchmarkData.traderAlpha>=0?"none":"translateX(-100%)",
                      background:benchmarkData.traderAlpha>=0?GREEN:RED,borderRadius:4}}/>
                    <div style={{position:"absolute",left:"50%",top:"25%",height:"50%",width:1,background:MUTED}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:3,fontSize:9,color:MUTED}}>
                    <span style={{color:RED}}>Under-perform</span><span>0%</span><span style={{color:GREEN}}>Out-perform</span>
                  </div>
                </div>
                <div style={{padding:"8px 12px",background:CARD,borderRadius:7,fontSize:10,color:MUTED,lineHeight:1.6}}>
                  Beta {benchmarkData.traderBeta<0.5?"< 0.5 — low market correlation, independent edge":benchmarkData.traderBeta<1.5?"≈ 1.0 — moves similarly to the market":"&gt; 1.5 — amplified market exposure"}. Alpha {benchmarkData.traderAlpha>=0?"is positive — you're generating excess returns above market":"is negative — market index currently outperforms your strategy"}.
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          ROW 7 — Monte Carlo Simulation v2
          ════════════════════════════════════ */}
      {trades.length>=2&&(
        <div style={{marginTop:4}}>
          {/* ── Section toggle header ── */}
          <button
            onClick={()=>setShowMC(s=>!s)}
            style={{width:"100%",background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:10,margin:"6px 0 0"}}
          >
            <div style={{flex:1,height:1,background:BORDER}}/>
            <span style={{fontSize:11,fontWeight:700,color:WHITE,letterSpacing:"0.06em",textTransform:"uppercase",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}>
              🎲 Monte Carlo Simulation
              <span style={{fontSize:9,fontWeight:600,color:MUTED,background:CARD2,border:`1px solid ${BORDER}`,borderRadius:4,padding:"2px 7px",textTransform:"none",letterSpacing:"0"}}>
                {showMC?"collapse":"expand"}
              </span>
            </span>
            <div style={{flex:1,height:1,background:BORDER}}/>
          </button>

          {showMC&&(
            <div style={{marginTop:14}}>
              {/* ── Info banner ── */}
              <div style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"8px 14px",marginBottom:14,fontSize:11,color:MUTED,lineHeight:1.75}}>
                Stress-tests your trade sequence by resampling it thousands of times.
                Reveals whether performance depends on <b style={{color:WHITE}}>trade order (luck)</b> or a <b style={{color:WHITE}}>repeatable edge</b>.
                Produces drawdown risk profiles, ruin probabilities, Kelly-optimal sizing, and full equity path envelopes.
              </div>

              {/* ── Config panel ── */}
              <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px",marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:WHITE,marginBottom:12,letterSpacing:"-0.01em"}}>Simulation Parameters</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10}}>

                  <div>
                    <div style={{fontSize:10,color:MUTED,marginBottom:4}}>Resampling Mode</div>
                    <select value={mcCfg.simMode} onChange={e=>startTransition(()=>setMcCfg(c=>({...c,simMode:e.target.value})))}
                      style={{width:"100%",background:CARD2,border:`1px solid ${BORDER}`,borderRadius:7,color:WHITE,fontSize:11,padding:"6px 10px"}}>
                      <option value="shuffle">Shuffle (permutation)</option>
                      <option value="bootstrap">Bootstrap (IID resample)</option>
                      <option value="block_bootstrap">Block Bootstrap (autocorr)</option>
                    </select>
                  </div>

                  <div>
                    <div style={{fontSize:10,color:MUTED,marginBottom:4}}>Position Sizing</div>
                    <select value={mcCfg.sizingMode} onChange={e=>startTransition(()=>setMcCfg(c=>({...c,sizingMode:e.target.value})))}
                      style={{width:"100%",background:CARD2,border:`1px solid ${BORDER}`,borderRadius:7,color:WHITE,fontSize:11,padding:"6px 10px"}}>
                      <option value="pnl_direct">Fixed (raw P&L)</option>
                      <option value="r_fixed_fraction">Fractional (% of equity)</option>
                    </select>
                  </div>

                  <div>
                    <div style={{fontSize:10,color:MUTED,marginBottom:4}}>Simulations</div>
                    <select value={mcCfg.numSims} onChange={e=>startTransition(()=>setMcCfg(c=>({...c,numSims:+e.target.value})))}
                      style={{width:"100%",background:CARD2,border:`1px solid ${BORDER}`,borderRadius:7,color:WHITE,fontSize:11,padding:"6px 10px"}}>
                      <option value={500}>500</option>
                      <option value={1000}>1 000</option>
                      <option value={2500}>2 500</option>
                      <option value={5000}>5 000</option>
                      <option value={10000}>10 000</option>
                    </select>
                  </div>

                  <div>
                    <div style={{fontSize:10,color:MUTED,marginBottom:4}}>Trades / Year</div>
                    <input type="number" min={1} max={1000} step={1}
                      value={localCfg.tradesPerYear}
                      onChange={e=>setLocalCfg(c=>({...c,tradesPerYear:e.target.value}))}
                      onBlur={commitLocal("tradesPerYear", parseInt, 1)}
                      style={{width:"100%",background:CARD2,border:`1px solid ${BORDER}`,borderRadius:7,color:WHITE,fontSize:11,padding:"6px 10px",boxSizing:"border-box"}}/>
                  </div>

                  {mcCfg.simMode==="block_bootstrap"&&(
                    <div>
                      <div style={{fontSize:10,color:MUTED,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                        Block Size
                        <label style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:MUTED,cursor:"pointer"}}>
                          <input type="checkbox" checked={mcCfg.autoBlockSize}
                            onChange={e=>startTransition(()=>setMcCfg(c=>({...c,autoBlockSize:e.target.checked})))}
                            style={{accentColor:CYAN,width:10,height:10}}/>
                          auto
                        </label>
                      </div>
                      <input type="number" min={2} max={50} step={1}
                        value={localCfg.blockSize}
                        disabled={mcCfg.autoBlockSize}
                        onChange={e=>setLocalCfg(c=>({...c,blockSize:e.target.value}))}
                        onBlur={commitLocal("blockSize", parseInt, 2)}
                        style={{width:"100%",background:CARD2,border:`1px solid ${BORDER}`,borderRadius:7,color:mcCfg.autoBlockSize?MUTED:WHITE,fontSize:11,padding:"6px 10px",boxSizing:"border-box"}}/>
                    </div>
                  )}

                  {mcCfg.sizingMode==="r_fixed_fraction"&&(
                    <div>
                      <div style={{fontSize:10,color:MUTED,marginBottom:4}}>Risk Fraction</div>
                      <input type="number" min={0.001} max={0.5} step={0.005}
                        value={localCfg.fraction}
                        onChange={e=>setLocalCfg(c=>({...c,fraction:e.target.value}))}
                        onBlur={commitLocal("fraction", parseFloat, 0.001)}
                        style={{width:"100%",background:CARD2,border:`1px solid ${BORDER}`,borderRadius:7,color:WHITE,fontSize:11,padding:"6px 10px",boxSizing:"border-box"}}/>
                    </div>
                  )}

                  <div>
                    <div style={{fontSize:10,color:MUTED,marginBottom:4}}>Random Seed</div>
                    <input type="number" min={0} step={1}
                      value={localCfg.seed}
                      onChange={e=>setLocalCfg(c=>({...c,seed:e.target.value}))}
                      onBlur={commitLocal("seed", parseInt, 0)}
                      style={{width:"100%",background:CARD2,border:`1px solid ${BORDER}`,borderRadius:7,color:WHITE,fontSize:11,padding:"6px 10px",boxSizing:"border-box"}}/>
                  </div>
                </div>

                {/* Kelly sweep toggle */}
                <label style={{display:"flex",alignItems:"center",gap:8,marginTop:12,cursor:"pointer",width:"fit-content"}}>
                  <input type="checkbox" checked={mcCfg.runKelly}
                    onChange={e=>startTransition(()=>setMcCfg(c=>({...c,runKelly:e.target.checked})))}
                    style={{accentColor:CYAN,width:12,height:12}}/>
                  <span style={{fontSize:11,color:MUTED}}>Also run Kelly fraction sweep <span style={{color:MUTED,fontSize:9}}>(+0.1–3% grid, ~400 sims/point)</span></span>
                </label>

                {/* Run / Cancel buttons */}
                <div style={{display:"flex",gap:10,marginTop:14,alignItems:"center",flexWrap:"wrap"}}>
                  <button
                    disabled={mcRunning||trades.length<2}
                    onClick={async ()=>{
                      // ── Cancel any in-flight run ──────────────────────────────
                      if (mcCancelRef.current) { mcCancelRef.current(); }
                      mcCancelRef.current = null;

                      setMcRunning(true);
                      setMcProgress(0);   // reset react state (hides bar until running=true)
                      setMcResult(null);
                      setKellySweep(null);
                      setMcError(null);
                      setMcTab("overview");
                      const startEq = initBalUSD > 0 ? initBalUSD : 10000;

                      // Use an object so closures always see the latest cancelled value
                      const runState = { cancelled: false };
                      mcCancelRef.current = () => { runState.cancelled = true; };

                      const payload = {
                        trades: trades.map(t => ({
                          pnl: t.pnl,
                          risk_dollars: t.risk_dollars || Math.abs(t.pnl) || 100,
                        })),
                        config: {
                          simMode:       mcCfg.simMode,
                          numSims:       mcCfg.numSims,
                          sizingMode:    mcCfg.sizingMode,
                          fraction:      mcCfg.fraction,
                          tradesPerYear: mcCfg.tradesPerYear,
                          blockSize:     mcCfg.blockSize,
                          autoBlockSize: mcCfg.autoBlockSize,
                          seed:          mcCfg.seed,
                          startEquity:   startEq,
                          runKelly:      false,
                          earlyStop:     false
                        },
                      };

                      // Fake progress ticker — updates DOM directly, no React re-render
                      let fakeP = 0.05;
                      setProgress(fakeP);
                      const fakeTimer = setInterval(() => {
                        fakeP = Math.min(fakeP + 0.012, 0.85);
                        if (!runState.cancelled) setProgress(fakeP);
                      }, 120);

                      // Dedicated AbortController ONLY for 30s network timeout
                      // NOT stored in mcCancelRef to avoid abort-on-rerun bugs
                      const timeoutCtrl = new AbortController();
                      const timeoutId   = setTimeout(() => timeoutCtrl.abort(), 30000);

                      try {
                        console.log("📡 POSTing to https://eyzoncharts-production.up.railway.app/api/simulate ...");
                        const resp = await fetch("https://eyzoncharts-production.up.railway.app/api/simulate", {
                          method:  "POST",
                          headers: { "Content-Type": "application/json" },
                          body:    JSON.stringify(payload),
                          signal:  timeoutCtrl.signal,
                        });
                        clearTimeout(timeoutId);
                        clearInterval(fakeTimer);

                        if (runState.cancelled) { setMcRunning(false); return; }

                        if (!resp.ok) {
                          const errText = await resp.text();
                          throw new Error("Backend " + resp.status + ": " + errText);
                        }

                        const { mc_result, interpretation } = await resp.json();
                        setProgress(0.9);
                        setMcResult({ ...mc_result, interpretation });

                        // Kelly sweep
                        if (mcCfg.runKelly && !runState.cancelled) {
                          try {
                            const kellyPayload = { ...payload, config: { ...payload.config, runKelly: true } };
                            const kellyResp = await fetch("https://eyzoncharts-production.up.railway.app/api/kelly", {
                              method:  "POST",
                              headers: { "Content-Type": "application/json" },
                              body:    JSON.stringify(kellyPayload),
                            });
                            if (kellyResp.ok) {
                              setKellySweep(await kellyResp.json());
                            } else {
                              setKellySweep(runKellySweep(trades, {...mcCfg, startEquity: startEq}));
                            }
                          } catch {
                            setKellySweep(runKellySweep(trades, {...mcCfg, startEquity: startEq}));
                          }
                        }

                      } catch (err) {
                        clearTimeout(timeoutId);
                        clearInterval(fakeTimer);
                        if (runState.cancelled) { setMcRunning(false); return; }

                        const isTimeout = err.name === "AbortError";
                        const msg = isTimeout
                          ? "Python timed out (30s) - is uvicorn running on port 8000? Using JS fallback."
                          : "Python unreachable: " + err.message + ". Using JS fallback.";
                        console.error("MC fetch error:", err.name, err.message);
                        setMcError(msg);
                        setProgress(0.5);

                        // JS fallback — runMonteCarloAsync with completion callback
                        runMonteCarloAsync(
                          trades,
                          { ...mcCfg, startEquity: startEq },
                          (p) => { if (!runState.cancelled) setProgress(0.5 + p * 0.5); },
                          (jsResult) => {
                            if (runState.cancelled) return;
                            if (jsResult) {
                              setMcResult(jsResult);
                              if (mcCfg.runKelly) {
                                try { setKellySweep(runKellySweep(trades, {...mcCfg, startEquity: startEq})); }
                                catch (e) { console.warn("Kelly sweep failed:", e); }
                              }
                            } else {
                              setMcError("Both Python and JS engines failed. Check console.");
                            }
                            setMcRunning(false);
                            setMcProgress(1);
                            mcCancelRef.current = null;
                          }
                        );
                        return;
                      }

                      if (!runState.cancelled) {
                        setProgress(1);
                        setMcRunning(false);
                        setMcProgress(1);
                        mcCancelRef.current = null;
                      }
                    }}
                    style={{padding:"9px 28px",borderRadius:8,border:"none",cursor:mcRunning?"wait":"pointer",
                      background:mcRunning?CARD2:`linear-gradient(135deg,${CYAN},${BLUE})`,
                      color:mcRunning?MUTED:CARD,fontWeight:700,fontSize:12,letterSpacing:"0.03em",transition:"all 0.2s",opacity:mcRunning?0.6:1}}
                  >
                    {mcRunning?"⏳  Running…":"▶  Run Simulation"}
                  </button>
                  {mcRunning&&(
                    <button
                      onClick={()=>{if(mcCancelRef.current){mcCancelRef.current();mcCancelRef.current=null;setMcRunning(false);}}}
                      style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${RED}`,cursor:"pointer",background:"transparent",color:RED,fontWeight:600,fontSize:11}}
                    >✕ Cancel</button>
                  )}
                </div>

                {/* Progress bar — DOM refs only, zero React re-renders during animation */}
                {mcRunning&&(
                  <div style={{marginTop:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:9,color:MUTED}}>Simulating equity paths…</span>
                      <span ref={progressTextRef} style={{fontSize:9,color:CYAN,fontWeight:700}}>5%</span>
                    </div>
                    <div style={{height:4,background:CARD2,borderRadius:4,overflow:"hidden"}}>
                      <div ref={progressBarRef} style={{height:"100%",width:"5%",background:`linear-gradient(90deg,${CYAN},${BLUE})`,borderRadius:4,transition:"width 0.1s"}}/>
                    </div>
                    <div ref={progressSimRef} style={{fontSize:9,color:MUTED,marginTop:4}}>
                      0 / {mcCfg.numSims.toLocaleString()} simulations
                    </div>
                  </div>
                )}
              </div>

              {/* ── Error banner ── */}
              {mcError&&(
                <div style={{marginTop:10,padding:"8px 14px",background:"#2a1010",border:`1px solid ${RED}`,borderRadius:8,fontSize:10,color:RED,display:"flex",alignItems:"center",gap:8}}>
                  <span>⚠</span><span>{mcError}</span>
                  <button onClick={()=>setMcError(null)} style={{marginLeft:"auto",background:"none",border:"none",color:RED,cursor:"pointer",fontSize:12}}>✕</button>
                </div>
              )}

              {/* ── Results section ── */}
              {mcResult&&(()=>{
                const {finalEquity:fe,maxDrawdown:md,ddDuration:ddd,probBelowStart,
                  probDD30,probDD40,probDD50,probRuin,var95,cvar95,
                  cagr,sharpe,sortino,calmar,envelopeData,metadata} = mcResult;
                const startEq = initBalUSD>0?initBalUSD:10000;
                const fmtEq   = v => v>=1000000?`${symbol}${(v/1e6).toFixed(2)}M`:v>=1000?`${symbol}${(v/1000).toFixed(1)}k`:`${symbol}${v.toFixed(0)}`;

                // Tab bar
                const tabs=[
                  {key:"overview",  label:"Overview"},
                  {key:"drawdown",  label:"Drawdown Analysis"},
                  {key:"kelly",     label:`Kelly Sweep${kellySweep?"":" …"}`},
                ];

                return (
                  <>
                    {/* ── Tab bar ── */}
                    <div style={{display:"flex",gap:4,marginBottom:14,borderBottom:`1px solid ${BORDER}`,paddingBottom:0}}>
                      {tabs.map(({key,label})=>(
                        <button key={key} onClick={()=>setMcTab(key)}
                          style={{padding:"7px 14px",borderRadius:"8px 8px 0 0",border:`1px solid ${mcTab===key?BORDER:"transparent"}`,
                            borderBottom:mcTab===key?`1px solid ${CARD}`:"none",background:mcTab===key?CARD:CARD2,
                            color:mcTab===key?WHITE:MUTED,fontWeight:mcTab===key?700:400,fontSize:11,cursor:"pointer",
                            transition:"all 0.15s",marginBottom:-1}}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* ════ TAB: OVERVIEW ════ */}
                    {mcTab==="overview"&&(
                      <>
                        {/* KPI cards — 4 columns */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(138px,1fr))",gap:10,marginBottom:14}}>
                          {[
                            {label:"Median Final Equity", val:fmtEq(fe.median),    sub:`P5 ${fmtEq(fe.p5)} · P95 ${fmtEq(fe.p95)}`,col:fe.median>=startEq?GREEN:RED},
                            {label:"Prob. of Loss",        val:`${probBelowStart}%`, sub:"Simulations ending below start",             col:+probBelowStart>40?RED:+probBelowStart>20?YELLOW:GREEN},
                            {label:"Median Max DD",        val:`${md.median}%`,      sub:`P5 ${md.p5}% · P95 ${md.p95}%`,              col:md.median<20?GREEN:md.median<40?YELLOW:RED},
                            {label:"VaR 95%",              val:fmtEq(var95),         sub:"5th-percentile final equity",                 col:RED},
                            {label:"CVaR 95%",             val:fmtEq(cvar95),        sub:"Expected worst-5% outcome",                  col:RED},
                            {label:"Median CAGR",          val:`${cagr>=0?"+":""}${cagr}%`, sub:`${metadata.tradesPerYear} trades/yr`, col:cagr>=0?GREEN:RED},
                            {label:"Annualised Sharpe",    val:sharpe>=0?`+${sharpe}`:sharpe, sub:"Mean/Std × √N (rf=0)",              col:sharpe>=1?GREEN:sharpe>=0?YELLOW:RED},
                            {label:"Sortino Ratio",        val:sortino>=0?`+${sortino}`:sortino, sub:"Mean/DownsideStd × √N",          col:sortino>=1?GREEN:sortino>=0?YELLOW:RED},
                            {label:"Calmar Ratio",         val:calmar>=0?`+${calmar}`:calmar, sub:"CAGR / Median Max DD",              col:calmar>=1?GREEN:calmar>=0?YELLOW:RED},
                            {label:"Ruin Probability",     val:`${probRuin}%`,       sub:"Ever fell below 50% of start",               col:+probRuin>10?RED:+probRuin>2?YELLOW:GREEN},
                            {label:"Sims Completed",       val:metadata.numSims.toLocaleString(), sub:metadata.simMode,               col:CYAN},
                            {label:"DD Duration P95",      val:`${ddd.p95} trades`,  sub:`Median ${ddd.median} · P75 ${ddd.p75}`,     col:+ddd.p95>20?RED:+ddd.p95>10?YELLOW:GREEN},
                          ].map(({label,val,sub,col})=>(
                            <div key={label} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 13px"}}>
                              <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,lineHeight:1.3}}>{label}</div>
                              <div style={{fontSize:15,fontWeight:800,color:col,marginBottom:2,letterSpacing:"-0.02em"}}>{val}</div>
                              <div style={{fontSize:9,color:MUTED,lineHeight:1.3}}>{sub}</div>
                            </div>
                          ))}
                        </div>

                        {/* Equity fan chart */}
                        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px 16px 12px",marginBottom:14}}>
                          <div style={{marginBottom:10}}>
                            <div style={{fontSize:11,color:WHITE,fontWeight:700,letterSpacing:"-0.01em"}}>Equity Path Envelope</div>
                            <div style={{fontSize:10,color:MUTED,marginTop:2}}>
                              Shaded region = P5–P95 across {metadata.numSims.toLocaleString()} simulations · Cyan = median · Red traces = 3 worst outcomes
                            </div>
                            {envelopeData.length>100&&(
                              <div style={{fontSize:9,color:MUTED,marginTop:2}}>
                                {envelopeData.length} chart points · drag brush handles below to zoom · drag center to scroll
                              </div>
                            )}
                          </div>
                          <ResponsiveContainer width="100%" height={envelopeData.length>200?280:240}>
                            <ComposedChart data={envelopeData} margin={{top:4,right:4,left:0,bottom:0}}>
                              <CartesianGrid stroke="#252525" vertical={false}/>
                              <XAxis dataKey="t" tick={{fill:MUTED,fontSize:9}} axisLine={false} tickLine={false}
                                label={{value:"Trade #",position:"insideBottomRight",offset:-4,fill:MUTED,fontSize:9}}
                                interval={Math.max(0, Math.floor(envelopeData.length / 12) - 1)}
                                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                              />
                              <YAxis tick={{fill:MUTED,fontSize:9}} axisLine={false} tickLine={false} width={50}
                                tickFormatter={v=>v>=1000?`${symbol}${(v/1000).toFixed(0)}k`:`${symbol}${v.toFixed(0)}`}/>
                              <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}}
                                formatter={(v,name)=>[`${symbol}${(+v).toLocaleString(undefined,{maximumFractionDigits:0})}`,name]}/>
                              <ReferenceLine y={startEq} stroke={YELLOW} strokeDasharray="4,4" strokeOpacity={0.55}/>
                              {/* P5–P95 shaded band using stacked Areas */}
                              <Area type="monotone" dataKey="p95" name="P95 equity" stroke="none" fill={CYAN} fillOpacity={0.08} isAnimationActive={false}/>
                              <Area type="monotone" dataKey="p5"  name="P5 equity"  stroke="none" fill={CARD} fillOpacity={1}    isAnimationActive={false}/>
                              {/* Worst 3 paths in red with decreasing opacity */}
                              {["w0","w1","w2"].map((k,i)=>(
                                <Line key={k} type="monotone" dataKey={k} name={`Worst path ${i+1}`}
                                  stroke={RED} strokeWidth={1} dot={false}
                                  strokeOpacity={0.5-i*0.13} isAnimationActive={false}/>
                              ))}
                              {/* Median path */}
                              <Line type="monotone" dataKey="med" name="Median path" stroke={CYAN} strokeWidth={2} dot={false} isAnimationActive={false}/>
                              {/* P5/P95 border lines */}
                              <Line type="monotone" dataKey="p95" name="P95 border" stroke={GREEN} strokeWidth={1} strokeDasharray="5,3" dot={false} strokeOpacity={0.45} isAnimationActive={false}/>
                              <Line type="monotone" dataKey="p5"  name="P5 border"  stroke={RED}   strokeWidth={1} strokeDasharray="5,3" dot={false} strokeOpacity={0.45} isAnimationActive={false}/>
                              {/* Brush: only shown when there are enough points to benefit from zoom */}
                              {envelopeData.length > 60 && (
                                <Brush
                                  dataKey="t"
                                  startIndex={Math.max(0, Math.floor(envelopeData.length * 0.55))}
                                  height={20}
                                  stroke={BORDER}
                                  fill={CARD}
                                  travellerWidth={5}
                                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                                />
                              )}
                            </ComposedChart>
                          </ResponsiveContainer>
                          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:8,padding:"5px 10px",background:CARD2,borderRadius:7}}>
                            {[{col:CYAN,l:"Median path",d:false},{col:GREEN,l:"P95 (optimistic 5%)",d:true},{col:RED,l:"P5 (worst 5%)",d:true},{col:RED,l:"3 worst sims",d:false},{col:YELLOW,l:"Start equity",d:true}]
                              .map(({col,l,d})=>(
                              <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:MUTED}}>
                                <span style={{width:18,height:2,display:"inline-block",borderTop:d?`2px dashed ${col}`:`2px solid ${col}`}}/>
                                {l}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Final equity percentiles */}
                        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px 16px 12px",marginBottom:14}}>
                          <div style={{fontSize:11,color:WHITE,fontWeight:700,marginBottom:4}}>Terminal Equity Distribution</div>
                          <div style={{fontSize:10,color:MUTED,marginBottom:14}}>
                            Distribution of final equity values across {metadata.numSims.toLocaleString()} simulations
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:9}}>
                            {[{label:"P5  — worst 5%",val:fe.p5,col:RED},{label:"P25",val:fe.p25,col:YELLOW},
                              {label:"P50 Median",val:fe.median,col:CYAN},{label:"P75",val:fe.p75,col:GREEN},{label:"P95 — best 5%",val:fe.p95,col:GREEN}
                            ].map(({label,val,col})=>{
                              const maxFe=Math.max(fe.p5,fe.p95,startEq);
                              const pct=(val/maxFe)*100;
                              return (
                                <div key={label}>
                                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                                    <span style={{fontSize:9,color:MUTED}}>{label}</span>
                                    <span style={{fontSize:10,fontWeight:700,color:col}}>{fmtEq(val)}</span>
                                  </div>
                                  <div style={{height:5,background:CARD2,borderRadius:3,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${Math.min(pct,100)}%`,borderRadius:3,background:col}}/>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{marginTop:12,fontSize:9,color:MUTED,borderTop:`1px solid ${BORDER}`,paddingTop:8,display:"flex",justifyContent:"space-between"}}>
                            <span>Starting equity: <b style={{color:WHITE}}>{fmtEq(startEq)}</b></span>
                            <span>Outcomes above start: <b style={{color:fe.median>=startEq?GREEN:RED}}>{(100-+probBelowStart).toFixed(1)}%</b></span>
                          </div>
                        </div>

                        {/* Methodology note */}
                        <div style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"8px 14px",fontSize:10,color:MUTED,lineHeight:1.75}}>
                          <b style={{color:WHITE}}>Methodology: </b>
                          {metadata.numSims.toLocaleString()} simulations · <b style={{color:WHITE}}>{metadata.simMode==="shuffle"?"Fisher-Yates permutation shuffle":metadata.simMode==="bootstrap"?"IID bootstrap with replacement":`Overlapping Circular Block Bootstrap (block=${metadata.effectiveBlockSize})`}</b> · <b style={{color:WHITE}}>{metadata.sizingMode==="pnl_direct"?"fixed-dollar sizing":"fractional equity sizing"}</b> · Seed {metadata.seed} · {metadata.tradesPerYear} trades/year assumed.
                          VaR/CVaR = 5th-percentile and conditional tail mean of terminal equity. Sharpe uses rf=0; Sortino uses downside deviation only. Calmar = CAGR/medianMaxDD.
                        </div>
                      </>
                    )}

                    {/* ════ TAB: DRAWDOWN ANALYSIS ════ */}
                    {mcTab==="drawdown"&&(
                      <>
                        {/* Top 4 drawdown KPIs */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10,marginBottom:14}}>
                          {[
                            {label:"Median Max DD",      val:`${md.median}%`,    sub:`P5: ${md.p5}% · P75: ${md.p75}% · P95: ${md.p95}%`,col:md.median<20?GREEN:md.median<40?YELLOW:RED},
                            {label:"DD Duration — P50",  val:`${ddd.median} trades`, sub:`Mean ${ddd.mean} · P75 ${ddd.p75} · P95 ${ddd.p95}`,col:+ddd.median>15?RED:+ddd.median>8?YELLOW:GREEN},
                            {label:"DD Duration — P95",  val:`${ddd.p95} trades`, sub:"Longest streak in worst 5% of sims",col:+ddd.p95>30?RED:+ddd.p95>15?YELLOW:GREEN},
                            {label:"Ruin (< 50% start)", val:`${probRuin}%`,      sub:"Probability of catastrophic loss",col:+probRuin>10?RED:+probRuin>2?YELLOW:GREEN},
                          ].map(({label,val,sub,col})=>(
                            <div key={label} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 13px"}}>
                              <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,lineHeight:1.3}}>{label}</div>
                              <div style={{fontSize:15,fontWeight:800,color:col,marginBottom:2}}>{val}</div>
                              <div style={{fontSize:9,color:MUTED,lineHeight:1.3}}>{sub}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
                          {/* Drawdown threshold probabilities */}
                          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px"}}>
                            <div style={{fontSize:11,color:WHITE,fontWeight:700,marginBottom:4}}>Catastrophic Drawdown Risk</div>
                            <div style={{fontSize:10,color:MUTED,marginBottom:16}}>
                              Probability of exceeding critical drawdown thresholds across {metadata.numSims.toLocaleString()} simulations
                            </div>
                            <div style={{display:"flex",flexDirection:"column",gap:16}}>
                              {[
                                {threshold:"30%",val:probDD30,col:YELLOW,desc:"Painful but recoverable"},
                                {threshold:"40%",val:probDD40,col:"#ff9f43",desc:"Severe — requires 67% gain to recover"},
                                {threshold:"50%",val:probDD50,col:RED,desc:"Catastrophic — 100% gain to recover"},
                              ].map(({threshold,val,col,desc})=>(
                                <div key={threshold}>
                                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                                    <div>
                                      <span style={{fontSize:12,fontWeight:800,color:col}}>P(DD ≥ {threshold})</span>
                                      <span style={{fontSize:9,color:MUTED,marginLeft:8}}>{desc}</span>
                                    </div>
                                    <span style={{fontSize:14,fontWeight:800,color:col}}>{val}%</span>
                                  </div>
                                  <div style={{height:8,background:CARD2,borderRadius:4,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${Math.min(val,100)}%`,borderRadius:4,
                                      background:`linear-gradient(90deg,${col}88,${col})`,transition:"width 0.5s"}}/>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Ruin probability with special treatment */}
                            <div style={{marginTop:16,padding:"10px 12px",background:+probRuin>5?RED+"12":CARD2,border:`1px solid ${+probRuin>5?RED+"44":BORDER}`,borderRadius:8}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <div>
                                  <div style={{fontSize:11,fontWeight:700,color:+probRuin>5?RED:WHITE}}>⚠ Ruin Probability</div>
                                  <div style={{fontSize:9,color:MUTED,marginTop:2}}>Equity ever fell below 50% of starting value</div>
                                </div>
                                <span style={{fontSize:20,fontWeight:800,color:+probRuin>10?RED:+probRuin>2?YELLOW:GREEN}}>{probRuin}%</span>
                              </div>
                            </div>
                          </div>

                          {/* Drawdown distribution bars */}
                          <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px"}}>
                            <div style={{fontSize:11,color:WHITE,fontWeight:700,marginBottom:4}}>Max Drawdown Distribution</div>
                            <div style={{fontSize:10,color:MUTED,marginBottom:16}}>Percentile breakdown of peak-to-trough losses</div>
                            <div style={{display:"flex",flexDirection:"column",gap:12}}>
                              {[
                                {label:"Best 5%  — P5",  val:md.p5,  col:GREEN},
                                {label:"Median — P50",   val:md.median,col:CYAN},
                                {label:"P75",            val:md.p75, col:YELLOW},
                                {label:"Worst 5% — P95", val:md.p95, col:RED},
                              ].map(({label,val,col})=>(
                                <div key={label}>
                                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                                    <span style={{fontSize:10,color:MUTED}}>{label}</span>
                                    <span style={{fontSize:11,fontWeight:700,color:col}}>{val}%</span>
                                  </div>
                                  <div style={{height:6,background:CARD2,borderRadius:3,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${Math.min(val,100)}%`,borderRadius:3,background:col}}/>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* DD Duration */}
                            <div style={{marginTop:18,borderTop:`1px solid ${BORDER}`,paddingTop:14}}>
                              <div style={{fontSize:11,color:WHITE,fontWeight:700,marginBottom:4}}>Drawdown Duration</div>
                              <div style={{fontSize:10,color:MUTED,marginBottom:12}}>Consecutive trades spent below equity peak</div>
                              {[
                                {label:"Median",val:ddd.median,col:CYAN},
                                {label:"P75",   val:ddd.p75,  col:YELLOW},
                                {label:"P95",   val:ddd.p95,  col:RED},
                              ].map(({label,val,col})=>(
                                <div key={label} style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                                  <span style={{fontSize:9,color:MUTED,width:40,flexShrink:0}}>{label}</span>
                                  <div style={{flex:1,height:5,background:CARD2,borderRadius:3,overflow:"hidden"}}>
                                    <div style={{height:"100%",width:`${Math.min((val/Math.max(ddd.p95,1))*100,100)}%`,background:col,borderRadius:3}}/>
                                  </div>
                                  <span style={{fontSize:10,fontWeight:700,color:col,width:60,textAlign:"right"}}>{val} trades</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Interpretation guide */}
                        <div style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"8px 14px",fontSize:10,color:MUTED,lineHeight:1.75}}>
                          <b style={{color:WHITE}}>Interpreting drawdown metrics: </b>
                          <b style={{color:WHITE}}>Threshold probabilities</b> show how likely your strategy is to hit a given max drawdown across all simulations — a value below 5% for 50% DD is considered low-risk.
                          <b style={{color:WHITE}}> Duration</b> measures how many consecutive trades you'd spend underwater — long durations increase psychological risk.
                          <b style={{color:WHITE}}> Ruin (50% threshold)</b> — simulations where equity halved at any point — is the key capital preservation metric for position-sizing decisions.
                        </div>
                      </>
                    )}

                    {/* ════ TAB: KELLY SWEEP ════ */}
                    {mcTab==="kelly"&&(
                      kellySweep?(()=>{
                        const {results,kellyFull,kellyHalf,autocorr,suggestedBlockSize} = kellySweep;
                        const maxCagr = Math.max(...results.map(r=>r.cagr));
                        return (
                          <>
                            {/* Kelly stats */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10,marginBottom:14}}>
                              {[
                                {label:"Full Kelly f*",  val:`${kellyFull}%`, sub:"Theoretical optimal (p×R−q)/R",      col:CYAN},
                                {label:"Half Kelly",     val:`${kellyHalf}%`, sub:"Practical recommendation (f*/2)",     col:GREEN},
                                {label:"AR(1) Autocorr", val:autocorr,        sub:Math.abs(autocorr)>0.15?"Block bootstrap recommended":"Low — shuffle/bootstrap OK",col:Math.abs(autocorr)>0.15?YELLOW:GREEN},
                                {label:"Optimal Block",  val:suggestedBlockSize, sub:"Data-driven Lahiri (1999) estimate", col:CYAN},
                              ].map(({label,val,sub,col})=>(
                                <div key={label} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 13px"}}>
                                  <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{label}</div>
                                  <div style={{fontSize:15,fontWeight:800,color:col,marginBottom:2}}>{val}</div>
                                  <div style={{fontSize:9,color:MUTED}}>{sub}</div>
                                </div>
                              ))}
                            </div>

                            {/* Risk-return chart */}
                            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"16px 16px 12px",marginBottom:14}}>
                              <div style={{fontSize:11,color:WHITE,fontWeight:700,marginBottom:4}}>Risk-Return Tradeoff by Fraction</div>
                              <div style={{fontSize:10,color:MUTED,marginBottom:12}}>
                                CAGR and median max drawdown across fraction values · 400 sims per point · Dashed = Full Kelly ({kellyFull}%)
                              </div>
                              <ResponsiveContainer width="100%" height={200}>
                                <ComposedChart data={results} margin={{top:4,right:14,left:0,bottom:0}}>
                                  <CartesianGrid stroke="#252525" vertical={false}/>
                                  <XAxis dataKey="fracPct" tick={{fill:MUTED,fontSize:9}} axisLine={false} tickLine={false} label={{value:"Risk fraction (%)",position:"insideBottomRight",offset:-4,fill:MUTED,fontSize:9}}/>
                                  <YAxis yAxisId="cagr" tick={{fill:MUTED,fontSize:9}} axisLine={false} tickLine={false} width={38} tickFormatter={v=>`${v}%`}/>
                                  <YAxis yAxisId="dd"   orientation="right" tick={{fill:MUTED,fontSize:9}} axisLine={false} tickLine={false} width={38} tickFormatter={v=>`${v}%`}/>
                                  <Tooltip contentStyle={{background:"#1a1a1a",border:`1px solid ${BORDER}`,borderRadius:7,fontSize:10}}
                                    formatter={(v,name)=>[`${v}%`,name]}/>
                                  <ReferenceLine yAxisId="cagr" x={`${kellyFull}`} stroke={CYAN} strokeDasharray="5,3" strokeOpacity={0.7}/>
                                  <Bar yAxisId="cagr" dataKey="cagr" name="CAGR %" maxBarSize={32} radius={[4,4,0,0]} isAnimationActive={false}>
                                    {results.map((r,i)=><Cell key={i} fill={r.isNearFullKelly?CYAN:r.cagr===maxCagr?GREEN:r.cagr>0?BLUE:RED}/>)}
                                  </Bar>
                                  <Line yAxisId="dd" type="monotone" dataKey="medianDD" name="Median Max DD %" stroke={RED} strokeWidth={2} dot={{fill:RED,r:3}} isAnimationActive={false}/>
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>

                            {/* Kelly sweep table */}
                            <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,overflow:"hidden",marginBottom:14}}>
                              <div style={{padding:"12px 16px",borderBottom:`1px solid ${BORDER}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                                <div>
                                  <div style={{fontSize:11,color:WHITE,fontWeight:700}}>Kelly Fraction Sensitivity Table</div>
                                  <div style={{fontSize:9,color:MUTED,marginTop:2}}>400 sims per fraction · {metadata.simMode} resampling · All fractions use r_fixed_fraction sizing</div>
                                </div>
                                <div style={{display:"flex",gap:8,fontSize:9}}>
                                  <span style={{display:"flex",alignItems:"center",gap:4,color:CYAN}}><span style={{width:8,height:8,borderRadius:2,background:CYAN,display:"inline-block"}}/> Full Kelly</span>
                                  <span style={{display:"flex",alignItems:"center",gap:4,color:GREEN}}><span style={{width:8,height:8,borderRadius:2,background:GREEN,display:"inline-block"}}/> Half Kelly</span>
                                </div>
                              </div>
                              <div style={{overflowX:"auto"}}>
                                <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                                  <thead>
                                    <tr style={{background:CARD2}}>
                                      {["Fraction","Med. Final","Median CAGR","Med. Max DD","Prob. Ruin","Signal"].map(h=>(
                                        <th key={h} style={{padding:"7px 12px",textAlign:"left",color:MUTED,fontWeight:600,fontSize:9,letterSpacing:"0.05em",textTransform:"uppercase",borderBottom:`1px solid ${BORDER}`,whiteSpace:"nowrap"}}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {results.map((r,i)=>{
                                      const highlight = r.isNearFullKelly?CYAN:r.isNearHalfKelly?GREEN:null;
                                      const rowBg = highlight?highlight+"0D":i%2===0?CARD:CARD2;
                                      return (
                                        <tr key={r.fraction} style={{background:rowBg,borderLeft:highlight?`3px solid ${highlight}`:"3px solid transparent"}}>
                                          <td style={{padding:"7px 12px",color:highlight||WHITE,fontWeight:highlight?700:400}}>
                                            {r.fracPct}%
                                            {r.isNearFullKelly&&<span style={{marginLeft:6,fontSize:8,color:CYAN,fontWeight:700}}>FULL K</span>}
                                            {r.isNearHalfKelly&&<span style={{marginLeft:6,fontSize:8,color:GREEN,fontWeight:700}}>½K</span>}
                                          </td>
                                          <td style={{padding:"7px 12px",color:r.medianFinal>=startEq?GREEN:RED,fontWeight:600}}>{fmtEq(r.medianFinal)}</td>
                                          <td style={{padding:"7px 12px",color:r.cagr>=0?GREEN:RED,fontWeight:600}}>{r.cagr>=0?"+":""}{r.cagr}%</td>
                                          <td style={{padding:"7px 12px",color:r.medianDD<20?GREEN:r.medianDD<40?YELLOW:RED}}>{r.medianDD}%</td>
                                          <td style={{padding:"7px 12px",color:+r.probRuin<2?GREEN:+r.probRuin<10?YELLOW:RED}}>{r.probRuin}%</td>
                                          <td style={{padding:"7px 12px",color:MUTED,fontSize:9}}>
                                            {r.probRuin>10?"⚠ High ruin risk":r.cagr===maxCagr?"★ Max return":r.isNearFullKelly?"◆ Full Kelly":r.isNearHalfKelly?"◇ Half Kelly (rec.)":"—"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Kelly interpretation */}
                            <div style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"8px 14px",fontSize:10,color:MUTED,lineHeight:1.75}}>
                              <b style={{color:WHITE}}>Kelly Criterion: </b>
                              Full Kelly (f* = {kellyFull}%) maximises long-run geometric growth but produces extreme drawdowns. <b style={{color:GREEN}}>Half Kelly ({kellyHalf}%)</b> is the standard institutional practice — it captures ~75% of full Kelly growth while halving volatility and ruin risk. Fractions above Full Kelly are overbetting and will reduce long-run wealth regardless of short-term gains. Autocorrelation of {autocorr} {Math.abs(+autocorr)>0.15?"suggests serial dependence in your trades — Block Bootstrap is recommended for more accurate results.":"is near zero — your trades appear independent, IID Bootstrap is appropriate."}</div>
                          </>
                        );
                      })()
                    : (
                      <div style={{textAlign:"center",padding:40,color:MUTED,fontSize:12}}>
                        {mcCfg.runKelly?"Kelly sweep is computing…":"Enable Kelly Sweep in simulation parameters and run again."}
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RiskPage;
