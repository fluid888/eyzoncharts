import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { useTheme, useCurrency } from "../contexts";
import { saveAccDetails, loadAccDetails, saveAccounts } from "../utils/storage";
import AccountDetailModal from "../components/modals/AccountDetailModal";

function AccountsPage({ trades, accounts, setAccounts, accDetails, setAccDetails, onModalOpen, onModalClose }) {
  const {BG,CARD,CARD2,BORDER,GREEN,RED,CYAN,YELLOW,WHITE,MUTED,SUBBG,BLUE} = useTheme();
  const { fmt, toLocal, symbol, currency: gCurrency } = useCurrency();
  const [selected, setSelected] = useState(null);
  const [adding, setAdding]     = useState(false);
  const [newName, setNewName]   = useState("");
  const ACC_COLORS_LIST = ["#4a90d9","#2ecc71","#f5c842","#e07be0","#ff6b6b","#00d4ff","#ff9f43","#a29bfe"];

  const openCard = (name) => { setSelected(name); onModalOpen?.(); };
  const closeCard = () => { setSelected(null); onModalClose?.(); };

  const getDetail = name => accDetails[name] || { balance:0, broker:"", currency:"USD", type:"Demo", color:ACC_COLORS_LIST[accounts.indexOf(name)%ACC_COLORS_LIST.length], note:"" };

  const handleSaveDetail = (name, detail) => {
    const updated = {...accDetails, [name]: detail};
    setAccDetails(updated);
    saveAccDetails(updated);
  };

  const handleDelete = (name) => {
    const updatedAccounts = accounts.filter(a=>a!==name);
    setAccounts(updatedAccounts);
    const updatedDetails = {...accDetails};
    delete updatedDetails[name];
    setAccDetails(updatedDetails);
    saveAccDetails(updatedDetails);
    closeCard();
  };

  const handleAddAccount = () => {
    const nm = newName.trim();
    if (!nm || accounts.includes(nm)) return;
    const color = ACC_COLORS_LIST[accounts.length % ACC_COLORS_LIST.length];
    const updatedAccounts = [...accounts, nm];
    setAccounts(updatedAccounts);
    const updatedDetails = {...accDetails, [nm]: {balance:0, broker:"", currency:"USD", type:"Demo", color, note:""}};
    setAccDetails(updatedDetails);
    saveAccDetails(updatedDetails);
    setNewName("");
    setAdding(false);
  };

  return (
    <div style={{padding:"26px 26px 60px",minHeight:"calc(100vh - 44px)"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:26}}>
        <div>
          <h1 style={{margin:0,fontSize:20,fontWeight:800,color:WHITE,letterSpacing:"-0.02em"}}>Accounts</h1>
          <div style={{fontSize:12,color:MUTED,marginTop:3}}>{accounts.length} account{accounts.length!==1?"s":""} · click a card to view details</div>
        </div>
        <button onClick={()=>setAdding(true)} style={{background:GREEN,border:"none",borderRadius:8,padding:"8px 16px",color:"#061306",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Add Account</button>
      </div>

      {/* Add account inline form */}
      {adding&&(
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"16px 18px",marginBottom:18,display:"flex",gap:10,alignItems:"center"}}>
          <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleAddAccount();if(e.key==="Escape"){setAdding(false);setNewName("");}}}
            placeholder="Account name e.g. Prop Firm FTMO…"
            style={{flex:1,background:CARD2,border:`1px solid ${BORDER}`,borderRadius:6,color:WHITE,padding:"9px 12px",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <button onClick={handleAddAccount} style={{background:GREEN,border:"none",borderRadius:6,padding:"9px 18px",color:"#061306",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Create</button>
          <button onClick={()=>{setAdding(false);setNewName("");}} style={{background:CARD2,border:`1px solid ${BORDER}`,borderRadius:6,padding:"9px 14px",color:MUTED,fontSize:12,cursor:"pointer"}}>Cancel</button>
        </div>
      )}

      {/* Account cards grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
        {accounts.map(acc=>{
          const det = getDetail(acc);
          const accTrades = trades.filter(t=>t.account===acc);
          const wins = accTrades.filter(t=>t.pnl>0);
          const netPnlUSD = accTrades.reduce((s,t)=>s+t.pnl,0);
          const netPnl = toLocal(netPnlUSD);
          const winRate = accTrades.length?(wins.length/accTrades.length*100).toFixed(0):0;
          const initBalLocal = toLocal(det.balance||0);
          const currentBal = initBalLocal + netPnl;
          const pnlPositive = netPnl >= 0;

          // mini sparkline starting from initial balance
          const byDate = {};
          [...accTrades].sort((a,b)=>a.date.localeCompare(b.date)).forEach(t=>{byDate[t.date]=(byDate[t.date]||0)+t.pnl;});
          let cum=initBalLocal;
          const spark = [{v:cum},...Object.values(byDate).map(p=>{ cum+=toLocal(p); return {v:parseFloat(cum.toFixed(2))}; })];

          return (
            <div key={acc} onClick={()=>openCard(acc)}
              style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:14,padding:"20px 20px 16px",cursor:"pointer",transition:"all 0.18s",position:"relative",overflow:"hidden"}}
              onMouseEnter={e=>{e.currentTarget.style.border=`1px solid ${det.color||"#4a90d9"}55`;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 8px 28px rgba(0,0,0,0.4)`;}}
              onMouseLeave={e=>{e.currentTarget.style.border=`1px solid ${BORDER}`;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}>

              {/* Colored top strip */}
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:det.color||"#4a90d9",borderRadius:"14px 14px 0 0"}}/>

              {/* Account header */}
              <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:16}}>
                <div style={{width:36,height:36,borderRadius:9,background:det.color||"#4a90d9",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,color:"#000",flexShrink:0}}>
                  {acc.charAt(0).toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:WHITE,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc}</div>
                  <div style={{fontSize:10,color:MUTED,marginTop:1}}>{det.type||"Demo"} · {det.currency||"USD"}{det.broker?` · ${det.broker}`:""}</div>
                </div>
                <span style={{fontSize:9,background:det.type==="Live"?"rgba(46,204,113,0.15)":det.type==="Prop Firm"?"rgba(245,200,66,0.15)":"rgba(74,144,217,0.15)",color:det.type==="Live"?GREEN:det.type==="Prop Firm"?YELLOW:BLUE||CYAN,border:`1px solid ${det.type==="Live"?"rgba(46,204,113,0.3)":det.type==="Prop Firm"?"rgba(245,200,66,0.3)":"rgba(74,144,217,0.3)"}`,borderRadius:20,padding:"2px 8px",fontWeight:600,whiteSpace:"nowrap"}}>
                  {det.type||"Demo"}
                </span>
              </div>

              {/* Balance */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,color:MUTED,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.06em"}}>Current Balance</div>
                <div style={{fontSize:22,fontWeight:800,color:WHITE,letterSpacing:"-0.02em"}}>{symbol}{currentBal.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              </div>

              {/* Stats row */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                {[
                  {l:"Net P&L",v:`${pnlPositive?"+":""}${fmt(netPnlUSD,0)}`,c:pnlPositive?GREEN:RED},
                  {l:"Win Rate",v:`${winRate}%`,c:parseFloat(winRate)>=50?GREEN:RED},
                  {l:"Trades",v:accTrades.length,c:WHITE},
                ].map(s=>(
                  <div key={s.l} style={{background:CARD2,borderRadius:7,padding:"7px 8px"}}>
                    <div style={{fontSize:9,color:MUTED,marginBottom:2}}>{s.l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:s.c}}>{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Sparkline */}
              {spark.length>1&&(
                <div style={{height:42,marginTop:4}}>
                  <ResponsiveContainer width="100%" height={42}>
                    <AreaChart data={spark} margin={{top:2,right:0,left:0,bottom:0}}>
                      <defs>
                        <linearGradient id={`sp${acc.replace(/\s/g,"")}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={det.color||"#4a90d9"} stopOpacity={0.4}/>
                          <stop offset="100%" stopColor={det.color||"#4a90d9"} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke={det.color||"#4a90d9"} strokeWidth={1.5} fill={`url(#sp${acc.replace(/\s/g,"")})`} dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              {spark.length<=1&&<div style={{height:42,display:"flex",alignItems:"center",justifyContent:"center",color:MUTED,fontSize:11}}>{accTrades.length===0?"No trades yet":"—"}</div>}

              {/* Click hint */}
              <div style={{marginTop:8,fontSize:10,color:MUTED,textAlign:"right"}}>Click to manage →</div>
            </div>
          );
        })}

        {accounts.length===0&&(
          <div style={{gridColumn:"1/-1",textAlign:"center",padding:"60px 20px",color:MUTED}}>
            <div style={{fontSize:32,marginBottom:12}}>🏦</div>
            <div style={{fontSize:14,fontWeight:600,marginBottom:6,color:WHITE}}>No accounts yet</div>
            <div style={{fontSize:12}}>Click "+ Add Account" to create your first account.</div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected&&(
        <AccountDetailModal
          accName={selected}
          details={getDetail(selected)}
          trades={trades}
          onClose={closeCard}
          onSave={handleSaveDetail}
          onDelete={name=>{handleDelete(name);}}
        />
      )}
    </div>
  );
}


export default AccountsPage;
