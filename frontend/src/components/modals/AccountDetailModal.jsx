import { useState, useEffect, useRef } from "react";
import { useTheme, useCurrency } from "../../contexts";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { ACC_COLORS, ACC_TYPES, FX_BASE_RATES } from "../../constants";

function AccountDetailModal({ accName, details, trades, onClose, onSave, onDelete }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const [d, setD]               = useState({ ...details });
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted]   = useState(false);
  const upd = (k,v) => setD(p=>({...p,[k]:v}));

  // Slide-in animation
  useEffect(()=>{ requestAnimationFrame(()=>setMounted(true)); },[]);

  const accTrades = trades.filter(t=>t.account===accName);
  const wins      = accTrades.filter(t=>t.pnl>0);
  const losses    = accTrades.filter(t=>t.pnl<0);
  const netPnlUSD = accTrades.reduce((s,t)=>s+t.pnl,0);
  const winRate   = accTrades.length?(wins.length/accTrades.length*100).toFixed(1):0;
  const avgSize   = accTrades.length?(accTrades.reduce((s,t)=>s+t.size,0)/accTrades.length).toFixed(2):"—";

  // FX conversion
  const currency   = d.currency||"USD";
  const isNonUSD   = currency !== "USD";
  const fxRateVal  = parseFloat(d.fxRate) || FX_BASE_RATES[currency] || 1;
  const toLocal    = (usd) => usd * fxRateVal;
  const fmtLocal   = (usd, digits=2) => toLocal(usd).toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const initBal    = d.balance||0;
  const initBalLocal = toLocal(initBal);
  const netPnl     = toLocal(netPnlUSD);
  const currentBalance = initBalLocal + netPnl;
  const returnPct  = initBalLocal ? ((netPnl/initBalLocal)*100).toFixed(2) : "0.00";

  // Build equity curve starting from initial balance
  const byDate = {};
  [...accTrades].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{
    byDate[t.date] = (byDate[t.date]||0) + t.pnl;
  });
  let cum = 0;
  // Start with a "day 0" point at initial balance
  const chartData = [
    { date: "Start", bal: parseFloat(initBalLocal.toFixed(2)) },
    ...Object.entries(byDate).map(([date,pnl])=>{
      cum += pnl;
      return { date: date.slice(5), bal: parseFloat((initBalLocal + toLocal(cum)).toFixed(2)) };
    })
  ];

  const accentColor = d.color||"#4a90d9";
  const pnlColor    = netPnl >= 0 ? accentColor : RED;

  const inp2 = { background:CARD2, border:`1px solid ${BORDER}`, borderRadius:6, color:WHITE, padding:"7px 10px", fontSize:12, width:"100%", outline:"none", fontFamily:"inherit" };
  const lbl2 = { fontSize:10, color:MUTED, marginBottom:3, display:"block", textTransform:"uppercase", letterSpacing:"0.07em" };
  const ax   = { fill:MUTED, fontSize:10 };

  return (
    <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>

      {/* Slide-in drawer from right */}
      <div style={{
        position:"absolute", top:0, right:0, bottom:0,
        width:"min(780px, 95vw)",
        background:CARD,
        borderLeft:`1px solid ${BORDER}`,
        display:"flex", flexDirection:"column",
        overflow:"hidden",
        transform: mounted ? "translateX(0)" : "translateX(100%)",
        transition:"transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)",
        boxShadow:"-20px 0 60px rgba(0,0,0,0.6)",
      }}>
        {/* Colored top accent line */}
        <div style={{height:3,background:`linear-gradient(90deg,${accentColor},${accentColor}55,transparent)`,flexShrink:0}}/>

        {/* Header */}
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{width:40,height:40,borderRadius:10,background:accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#000",flexShrink:0}}>
            {accName.charAt(0).toUpperCase()}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:800,color:WHITE,letterSpacing:"-0.01em"}}>{accName}</div>
            <div style={{fontSize:10,color:MUTED,marginTop:1}}>
              {d.broker||"No broker set"} · {d.type||"Demo"} ·{" "}
              {isNonUSD ? <span style={{color:accentColor,fontWeight:600}}>USD → {currency} <span style={{color:MUTED,fontWeight:400}}>×{fxRateVal.toFixed(4)}</span></span> : currency}
            </div>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {/* Gear / settings toggle */}
            <button
              onClick={()=>setShowSettings(s=>!s)}
              title="Account Settings"
              style={{background:showSettings?accentColor+"22":"transparent",border:`1px solid ${showSettings?accentColor+"55":BORDER}`,borderRadius:7,padding:"5px 9px",color:showSettings?accentColor:MUTED,fontSize:14,cursor:"pointer",transition:"all 0.15s",lineHeight:1}}
            >⚙</button>
            <button onClick={()=>onDelete(accName)} style={{background:"rgba(255,107,107,0.1)",border:`1px solid rgba(255,107,107,0.3)`,borderRadius:6,padding:"5px 10px",color:RED,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Delete</button>
            <button onClick={()=>{onSave(accName,d);onClose();}} style={{background:accentColor,border:"none",borderRadius:6,padding:"6px 14px",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save</button>
            <button onClick={onClose} style={{background:"none",border:"none",color:MUTED,fontSize:18,cursor:"pointer",lineHeight:1,padding:"0 4px"}}>✕</button>
          </div>
        </div>

        <div style={{flex:1,overflow:"auto",display:"flex",minHeight:0}}>

          {/* Settings side panel (collapsible) */}
          {showSettings && (
            <div style={{width:260,borderRight:`1px solid ${BORDER}`,padding:"18px 16px",display:"flex",flexDirection:"column",gap:14,overflowY:"auto",flexShrink:0,background:SUBBG||"#161616",animation:"slideIn 0.2s ease"}}>
              <div style={{fontSize:11,fontWeight:700,color:WHITE,letterSpacing:"0.04em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:6}}>⚙ Account Settings</div>

              {/* Color picker */}
              <div>
                <label style={lbl2}>Account Color</label>
                <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:4}}>
                  {ACC_COLORS.map(c=>(
                    <div key={c} onClick={()=>upd("color",c)} style={{width:24,height:24,borderRadius:5,background:c,cursor:"pointer",border:d.color===c?`2px solid ${WHITE}`:"2px solid transparent",transition:"border 0.15s",flexShrink:0}}/>
                  ))}
                </div>
              </div>

              <div><label style={lbl2}>Starting Balance (USD)</label>
                <input style={inp2} type="number" value={d.balance||""} onChange={e=>upd("balance",parseFloat(e.target.value)||0)} placeholder="10000"/>
              </div>

              <div><label style={lbl2}>Broker</label>
                <input style={inp2} value={d.broker||""} onChange={e=>upd("broker",e.target.value)} placeholder="e.g. MetaTrader 5…"/>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><label style={lbl2}>Currency</label>
                  <select style={inp2} value={d.currency||"USD"} onChange={e=>upd("currency",e.target.value)}>
                    {["USD","EUR","GBP","JPY","CHF","AUD","CAD","PLN"].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={lbl2}>Type</label>
                  <select style={inp2} value={d.type||"Demo"} onChange={e=>upd("type",e.target.value)}>
                    {ACC_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* FX Rate — shown only for non-USD currencies */}
              {isNonUSD && (
                <div>
                  <label style={lbl2}>USD → {currency} Rate</label>
                  <input style={{...inp2,borderColor:accentColor+"55"}} type="number" step="0.0001"
                    value={d.fxRate||fxRateVal}
                    onChange={e=>upd("fxRate",parseFloat(e.target.value)||fxRateVal)}
                    placeholder={`e.g. ${FX_BASE_RATES[currency]||1}`}/>
                  <div style={{fontSize:9,color:MUTED,marginTop:3}}>1 USD = {d.fxRate||fxRateVal} {currency}</div>
                </div>
              )}

              <div><label style={lbl2}>Notes</label>
                <textarea style={{...inp2,height:60,resize:"vertical"}} value={d.note||""} onChange={e=>upd("note",e.target.value)} placeholder="Any notes…"/>
              </div>
            </div>
          )}

          {/* Main content */}
          <div style={{flex:1,padding:"18px 20px",display:"flex",flexDirection:"column",gap:16,overflowY:"auto"}}>

            {/* Balance row */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                {l:"Current Balance",  v:`${currency} ${currentBalance.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`, c:WHITE,   big:true},
                {l:"Net P&L",          v:`${netPnl>=0?"+":""}${currency} ${fmtLocal(netPnlUSD)}`,                                                    c:pnlColor, big:true},
                {l:"Return %",         v:`${netPnl>=0?"+":""}${returnPct}%`,                                                                          c:pnlColor, big:true},
              ].map(x=>(
                <div key={x.l} style={{background:"#161616",border:`1px solid ${x.c===pnlColor&&pnlColor===accentColor?accentColor+"33":BORDER}`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:10,color:MUTED,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>{x.l}</div>
                  <div style={{fontSize:x.big?18:14,fontWeight:800,color:x.c,letterSpacing:"-0.01em"}}>{x.v}</div>
                  {isNonUSD&&x.l!=="Current Balance"&&<div style={{fontSize:9,color:MUTED,marginTop:2}}>≈ ${(parseFloat(x.v.replace(/[^0-9.-]/g,""))/fxRateVal).toFixed(2)} USD</div>}
                </div>
              ))}
            </div>

            {/* Quick Stats */}
            <div style={{background:"#161616",border:`1px solid ${BORDER}`,borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:11,fontWeight:700,color:WHITE,marginBottom:10}}>Quick Stats</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {[
                  ["Initial Balance", `${currency} ${initBalLocal.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}`, accentColor],
                  ["Trades",          accTrades.length, WHITE],
                  ["Win Rate",        `${winRate}%`,    parseFloat(winRate)>=50?GREEN:RED],
                  ["Avg Lot Size",    avgSize,          CYAN],
                  ["Wins",            wins.length,      GREEN],
                  ["Losses",          losses.length,    RED],
                ].map(([l,v,c])=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"4px 0",borderBottom:`1px solid ${BORDER}33`}}>
                    <span style={{color:MUTED}}>{l}</span>
                    <span style={{color:c,fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Equity curve starting from initial balance */}
            <div style={{background:CARD2,border:`1px solid ${accentColor}22`,borderRadius:10,padding:"14px 16px 8px",display:"flex",flexDirection:"column",minHeight:200}}>
              <div style={{fontSize:12,fontWeight:700,color:WHITE,marginBottom:2}}>Equity Curve</div>
              <div style={{fontSize:10,color:MUTED,marginBottom:10}}>
                Starts at {currency} {initBalLocal.toLocaleString("en-US",{minimumFractionDigits:0})} initial balance · {accTrades.length} trades
              </div>
              {chartData.length > 2 ? (
                <div style={{flex:1,minHeight:160}}>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={chartData} margin={{top:4,right:4,left:0,bottom:0}}>
                      <defs>
                        <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={accentColor} stopOpacity={0.4}/>
                          <stop offset="100%" stopColor={accentColor} stopOpacity={0.02}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={BORDER} vertical={false}/>
                      <XAxis dataKey="date" tick={ax} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={ax} axisLine={false} tickLine={false} width={65} tickFormatter={v=>`${v>=1000?`${(v/1000).toFixed(1)}k`:v.toFixed(0)}`}/>
                      <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:7,fontSize:11}} labelStyle={{color:MUTED}} formatter={(v)=>[`${currency} ${v.toLocaleString("en-US",{minimumFractionDigits:2})}`, "Balance"]}/>
                      <ReferenceLine y={initBalLocal} stroke={accentColor} strokeDasharray="4,3" strokeOpacity={0.5}/>
                      <Area type="monotone" dataKey="bal" stroke={accentColor} strokeWidth={2} fill="url(#accGrad)" dot={false} isAnimationActive={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED,fontSize:12}}>
                  {accTrades.length===0?"No trades logged yet.":"Need at least 2 trading days for a chart."}
                </div>
              )}
            </div>

            {/* Monthly P&L breakdown */}
            {accTrades.length>0&&(()=>{
              const mMap={};
              accTrades.forEach(t=>{const m=t.date.slice(0,7);mMap[m]=(mMap[m]||0)+t.pnl;});
              const mData=Object.entries(mMap).sort().map(([m,p])=>({month:m.slice(5),pnl:parseFloat(toLocal(p).toFixed(2))}));
              return (
                <div style={{background:"#161616",border:`1px solid ${BORDER}`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:WHITE,marginBottom:8}}>Monthly P&L</div>
                  <ResponsiveContainer width="100%" height={90}>
                    <BarChart data={mData} margin={{top:0,right:0,left:0,bottom:0}}>
                      <XAxis dataKey="month" tick={ax} axisLine={false} tickLine={false}/>
                      <YAxis tick={ax} axisLine={false} tickLine={false} width={50} tickFormatter={v=>`${v>=0?"+":""}${v.toFixed(0)}`}/>
                      <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:6,fontSize:11}} formatter={v=>[`${currency} ${v.toFixed(2)}`,"P&L"]}/>
                      <ReferenceLine y={0} stroke={BORDER}/>
                      <Bar dataKey="pnl" radius={[3,3,0,0]}>{mData.map((e,i)=><Cell key={i} fill={e.pnl>=0?accentColor:RED}/>)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ACCOUNTS PAGE ─────────────────────────────────────────────────────────────

export default AccountDetailModal;
