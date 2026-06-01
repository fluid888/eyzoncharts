import { useState, useEffect, useRef } from "react";

export default function LoadingScreen({ children }) {
  const text1Ref = useRef(null);
  const text2Ref = useRef(null);
  const [showContent, setShowContent] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (window.innerWidth <= 768) {
      setShowContent(true);
      return;
    }
    document.body.style.overflow = "hidden";

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
        setTimeout(() => setShowContent(true), 800);
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
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = "";
    };
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
          background: "#fff",
          transition: "opacity 0.8s",
          opacity: fadeOut ? 0 : 1,
        }}
      >
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", filter: "url(#threshold-journal)" }}>
          <span
            ref={text1Ref}
            className="loading-text"
            style={{ position: "absolute", userSelect: "none", textAlign: "center", fontSize: "56pt", fontWeight: 900, color: "#111" }}
          />
          <span
            ref={text2Ref}
            className="loading-text"
            style={{ position: "absolute", userSelect: "none", textAlign: "center", fontSize: "56pt", fontWeight: 900, color: "#111" }}
          />
        </div>
      </div>
      <style>{`
        @media (min-width: 768px) {
          .loading-screen { display: flex !important; }
        }
        .loading-text {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
      `}</style>
      {children}
    </>
  );
}
