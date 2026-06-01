import { useState, useEffect, useRef } from "react";

export default function LoadingScreen({ children, onReady }) {
  const text1Ref = useRef(null);
  const text2Ref = useRef(null);
  const [showContent, setShowContent] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (window.innerWidth <= 768) {
      setShowContent(true);
      if (onReady) onReady();
      return;
    }

    const t1 = text1Ref.current;
    const t2 = text2Ref.current;
    if (!t1 || !t2) return;

    const morphDuration = 3000;
    const holdDuration = 1200;
    const texts = ["TL is here", "Innovating Journaling experience"];
    let start = null;

    t1.textContent = texts[0];
    t2.textContent = texts[1];
    t1.style.filter = "";
    t1.style.opacity = "100%";
    t2.style.filter = "blur(100px)";
    t2.style.opacity = "0%";

    function animate(ts) {
      if (!start) start = ts;
      const elapsed = ts - start;
      const totalCycle = morphDuration + holdDuration;

      if (elapsed >= totalCycle) {
        t1.style.filter = "";
        t1.style.opacity = "0%";
        t2.style.filter = "";
        t2.style.opacity = "100%";
        setFadeOut(true);
        setTimeout(() => {
          setShowContent(true);
          if (onReady) onReady();
        }, 800);
        return;
      }

      if (elapsed < morphDuration) {
        const fraction = elapsed / morphDuration;
        t2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
        t2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
        const invFraction = 1 - fraction;
        t1.style.filter = `blur(${Math.min(8 / invFraction - 8, 100)}px)`;
        t1.style.opacity = `${Math.pow(invFraction, 0.4) * 100}%`;
      } else {
        t1.style.filter = "";
        t1.style.opacity = "0%";
        t2.style.filter = "";
        t2.style.opacity = "100%";
      }

      requestAnimationFrame(animate);
    }

    const raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (showContent) return <>{children}</>;

  return (
    <>
      <div
        className="loading-screen"
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "none",
          alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          transition: "opacity 0.8s",
          opacity: fadeOut ? 0 : 1,
        }}
      >
        <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(46,204,113,0.1) 0%,transparent 70%)",top:"10%",left:"20%",pointerEvents:"none"}}/>
        <div style={{position:"absolute",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(0,212,255,0.07) 0%,transparent 70%)",bottom:"15%",right:"25%",pointerEvents:"none"}}/>
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 24,
          padding: "48px 56px",
          maxWidth: "92vw",
          position: "relative",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          textAlign: "center",
        }}>
          <div style={{position:"absolute",top:0,left:24,right:24,height:1,background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)"}}/>

          <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
            <defs>
              <filter id="threshold-journal">
                <feColorMatrix
                  in="SourceGraphic"
                  type="matrix"
                  values="1 0 0 0 0
                          0 1 0 0 0
                          0 0 1 0 0
                          0 0 0 255 -140"
                />
              </filter>
            </defs>
          </svg>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", filter: "url(#threshold-journal)", minHeight: 80 }}>
            <span
              ref={text1Ref}
              className="loading-text"
              style={{ position: "absolute", userSelect: "none", textAlign: "center", fontSize: "36pt", fontWeight: 900, color: "#f0f0f0" }}
            />
            <span
              ref={text2Ref}
              className="loading-text"
              style={{ position: "absolute", userSelect: "none", textAlign: "center", fontSize: "36pt", fontWeight: 900, color: "#f0f0f0" }}
            />
          </div>

          <div style={{marginTop:28,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"rgba(46,204,113,0.6)",animation:"loadingPulse 1.2s ease-in-out infinite"}}/>
            <span style={{width:6,height:6,borderRadius:"50%",background:"rgba(46,204,113,0.6)",animation:"loadingPulse 1.2s ease-in-out 0.3s infinite"}}/>
            <span style={{width:6,height:6,borderRadius:"50%",background:"rgba(46,204,113,0.6)",animation:"loadingPulse 1.2s ease-in-out 0.6s infinite"}}/>
          </div>
        </div>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .loading-screen { display: flex !important; }
        }
        .loading-text {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        @keyframes loadingPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}      </style>
      {children}
    </>
  );
}
