"use client";

import { useEffect, useRef } from "react";
import styles from "./space.module.css";

/* ── Login backdrop: photographers in space ─────────────────────────────
 * Everything sits in the margins around the login card; the middle stays
 * open sky. Two photographers take turns shooting (7s loop, offset 3.5s) and
 * a polaroid pops out on each flash. Layers drift with the pointer, and
 * clicking a photographer makes them shoot right away. */

const SHOT_LOOP_MS = 7000;
const FLASH_AT = 0.098; // just before the flash keyframe

/** Deterministic star field, so server and client render the same markup. */
const STARS = (() => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 90 }, () => {
    const kind = rand();
    return {
      left: rand() * 100,
      top: rand() * 100,
      delay: -rand() * 3.2,
      duration: 2.4 + rand() * 2.4,
      variant: kind > 0.93 ? styles.starPlus : kind > 0.8 ? styles.starBig : "",
    };
  });
})();

type Vars = React.CSSProperties & Record<`--${string}`, string>;

export function SpaceBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Pointer parallax: each layer drifts by its depth.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layers = [...root.querySelectorAll<HTMLElement>("[data-depth]")];
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        for (const layer of layers) {
          const d = Number(layer.dataset.depth);
          layer.style.transform = `translate(${-x * 40 * d}px, ${-y * 30 * d}px)`;
        }
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  function shootNow(e: React.MouseEvent<HTMLElement>) {
    const scene = e.currentTarget.closest(`.${styles.scene}`);
    if (!scene) return;
    for (const el of scene.querySelectorAll(`.${styles.flash}, .${styles.flashRing}, .${styles.shot}`)) {
      for (const anim of el.getAnimations()) anim.currentTime = SHOT_LOOP_MS * FLASH_AT;
    }
  }

  return (
    <div ref={rootRef} className={styles.sky} aria-hidden="true">
      <div className={styles.layer} data-depth="0.15">
        {STARS.map((s, i) => (
          <span
            key={i}
            className={`${styles.star} ${s.variant}`}
            style={{ left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }}
          />
        ))}
      </div>

      <div className={styles.layer} data-depth="0.25">
        <div className={styles.orbit} style={{ width: "min(1180px,150vw)", height: "min(1180px,150vw)" }}>
          <div className={styles.orbitSpin}><span className={styles.moonlet} /></div>
        </div>
        <div className={styles.orbit} style={{ width: "min(1500px,190vw)", height: "min(1500px,190vw)" }}>
          <div className={styles.orbitSpin} style={{ animationDuration: "95s", animationDirection: "reverse" }}>
            <span className={styles.moonlet} style={{ background: "#C25A3A" }} />
          </div>
        </div>
      </div>

      <div className={styles.layer} data-depth="0.35">
        <div className={styles.rocket}>
          <Rocket />
          <div className={styles.trail}><i /><i /><i /></div>
        </div>
      </div>

      <div className={styles.layer} data-depth="0.6">
        {/* Top-left: terracotta planet, photographer shooting into the left margin */}
        <div className={styles.scene} style={{ left: -120, top: -120 }}>
          <div className={styles.bob}>
            <div className={`${styles.planet} ${styles.planetTerra}`} style={{ width: 310, height: 310 }}>
              <span className={styles.crater} style={{ width: 44, height: 44, left: 180, top: 196 }} />
              <span className={styles.crater} style={{ width: 24, height: 24, left: 120, top: 250 }} />
              <span className={styles.crater} style={{ width: 30, height: 30, left: 246, top: 130 }} />
            </div>
            <span className={styles.shooter} style={{ left: 228, top: 184, transform: "rotate(44deg)" }} onClick={shootNow}>
              <Photographer variant="kurta" />
              <span className={styles.flash} style={{ left: 38, top: -8 }} />
              <span className={styles.flashRing} style={{ left: 46, top: 0 }} />
            </span>
          </div>
          <Polaroid src="/login-space/haldi.jpg" tag="Haldi" style={{ left: 150, top: 360, "--r": "-6deg", "--dx": "10px" }} />
        </div>

        {/* Top-right: camera satellite + "128 photos of you" */}
        <div className={`${styles.scene} ${styles.hideSm}`} style={{ right: "5vw", top: "6vh" }}>
          <div className={styles.bob} style={{ animationDuration: "7s" }}>
            <Satellite />
            <span className={styles.ping} style={{ left: 53, top: 8, width: 64, height: 64 }} />
            <span className={`${styles.ping} ${styles.pingLate}`} style={{ left: 53, top: 8, width: 64, height: 64 }} />
          </div>
          <div className={styles.pill} style={{ left: 30, top: 104 }}>
            <span className={styles.pillIcon}>
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M2.5 6.2l2.2 2.2 4.8-4.8" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span><b>128</b> photos of you</span>
          </div>
        </div>

        {/* Bottom-right: ringed planet, photographer shooting up into the right margin */}
        <div className={styles.scene} style={{ right: -130, bottom: -60, width: 400, height: 400 }}>
          <div className={styles.bob} style={{ animationDuration: "8s", animationDelay: "-3s" }}>
            <RingedPlanet />
            <span className={styles.shooter} style={{ left: 66, top: -2, transform: "rotate(-45deg)" }} onClick={shootNow}>
              <Photographer variant="lehenga" flip />
              <span className={styles.flash} style={{ left: -22, top: -8, animationDelay: "-3.5s" }} />
              <span className={styles.flashRing} style={{ left: -14, top: 0, animationDelay: "-3.5s" }} />
            </span>
          </div>
          <Polaroid
            src="/login-space/sangeet.jpg"
            tag="Sangeet"
            style={{ left: 84, top: -190, "--r": "7deg", "--dx": "-8px", animationDelay: "-3.5s" }}
          />
        </div>

        {/* Bottom-left: moon with a polaroid planted like a flag */}
        <div className={`${styles.scene} ${styles.hideSm}`} style={{ left: "4vw", bottom: "5vh" }}>
          <div className={styles.bob} style={{ animationDuration: "9s", animationDelay: "-2s" }}>
            <div
              className="absolute rounded-sm bg-[#F0D9CD]"
              style={{ left: 62, top: -74, width: 3, height: 84, transform: "rotate(6deg)", transformOrigin: "bottom" }}
            />
            <Polaroid src="/login-space/dadi.jpg" tag="Dadi" still style={{ left: 66, top: -96, width: 62 }} />
            <div className={`${styles.planet} ${styles.planetCream}`} style={{ width: 124, height: 124 }}>
              <span className={styles.crater} style={{ width: 20, height: 20, left: 30, top: 52 }} />
              <span className={styles.crater} style={{ width: 12, height: 12, left: 72, top: 78 }} />
            </div>
            <div className={styles.heart} style={{ left: -12, top: -84 }}>
              <svg width="18" height="16" viewBox="0 0 24 21">
                <path d="M12 21 1.8 10.9A6 6 0 0 1 12 3.2a6 6 0 0 1 10.2 7.7Z" fill="#C25A3A" />
              </svg>
            </div>
          </div>
        </div>

        {/* Asteroids in the margins */}
        <span className={styles.rock} style={{ left: "22vw", top: "14vh", width: 26, height: 22 }} />
        <span className={styles.rock} style={{ left: "26vw", top: "20vh", width: 14, height: 12, animationDelay: "-3s" }} />
        <span className={styles.rock} style={{ right: "24vw", bottom: "9vh", width: 34, height: 28, animationDelay: "-5s" }} />
        <span className={styles.rock} style={{ right: "30vw", bottom: "15vh", width: 16, height: 14, animationDelay: "-1s" }} />
        <span className={`${styles.rock} ${styles.hideSm}`} style={{ left: "3vw", top: "48vh", width: 22, height: 18, animationDelay: "-6s" }} />
        <span className={`${styles.rock} ${styles.hideSm}`} style={{ right: "4vw", top: "46vh", width: 28, height: 24, animationDelay: "-2s" }} />
      </div>
    </div>
  );
}

function Polaroid({ src, tag, style, still }: { src: string; tag: string; style: Vars; still?: boolean }) {
  return (
    <div className={`${styles.shot} ${still ? styles.shotStill : ""}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <span className={styles.tag} style={still ? { fontSize: 10, right: -20 } : undefined}>{tag}</span>
    </div>
  );
}

/** Flat photographer in the landing-page illustration style, camera at eye. */
function Photographer({ variant, flip }: { variant: "kurta" | "lehenga"; flip?: boolean }) {
  const kurta = variant === "kurta";
  const skin = kurta ? "#C98B62" : "#A8704C";
  return (
    <svg viewBox="0 0 60 92" width="66" style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <rect x="18" y="60" width="8" height="28" rx="4" fill={kurta ? "#3B2A20" : "#2A2218"} />
      <rect x="29" y="60" width="8" height="28" rx="4" fill={kurta ? "#3B2A20" : "#2A2218"} />
      <ellipse cx="22" cy="89" rx="7" ry="3" fill={kurta ? "#2A2218" : "#C25A3A"} />
      <ellipse cx="34" cy="89" rx="7" ry="3" fill={kurta ? "#2A2218" : "#C25A3A"} />
      {kurta ? (
        <>
          <path d="M14 34 Q27 28 40 34 L44 66 Q27 70 10 66Z" fill="#F2B23E" />
          <path d="M27 31 V66" stroke="#D99A2B" strokeWidth="1.5" />
        </>
      ) : (
        <path d="M14 34 Q27 28 40 34 L43 64 Q27 68 11 64Z" fill="#E77B8C" />
      )}
      <circle cx="27" cy="20" r="10" fill={skin} />
      {kurta ? (
        <path d="M17 19 Q17 8 28 8 Q37 8 37 16 Q31 13 24 15 Q20 16 19 22Z" fill="#2A2218" />
      ) : (
        <>
          <circle cx="18" cy="12" r="5" fill="#2A2218" />
          <path d="M17 20 Q16 8 28 8 Q37 9 37 17 Q30 13 22 16Z" fill="#2A2218" />
          <circle cx="18" cy="24" r="1.4" fill="#F2B23E" />
        </>
      )}
      <path d="M36 38 Q44 32 40 24" stroke={skin} strokeWidth="5" strokeLinecap="round" fill="none" />
      {kurta ? (
        <>
          <rect x="33" y="14" width="17" height="12" rx="2.5" fill="#2A2218" />
          <rect x="48" y="16" width="7" height="8" rx="1.5" fill="#4A3A2C" />
          <rect x="36" y="11.5" width="6" height="3" rx="1" fill="#2A2218" />
          <circle cx="38" cy="20" r="1.5" fill="#C25A3A" />
          <path d="M16 36 Q24 48 36 38" stroke="#C25A3A" strokeWidth="2" fill="none" />
        </>
      ) : (
        <>
          <rect x="33" y="14" width="15" height="12" rx="2.5" fill="#2A2218" />
          <rect x="46" y="15" width="12" height="10" rx="2" fill="#4A3A2C" />
          <rect x="56" y="14" width="3" height="12" rx="1" fill="#2A2218" />
          <circle cx="37" cy="20" r="1.5" fill="#F2B23E" />
        </>
      )}
    </svg>
  );
}

function RingedPlanet() {
  return (
    <svg viewBox="0 0 400 400" width="400" className="block overflow-visible">
      <defs>
        <radialGradient id="login-planet-cream" cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#FFF8EF" />
          <stop offset=".55" stopColor="#F0D9CD" />
          <stop offset="1" stopColor="#D4A893" />
        </radialGradient>
      </defs>
      <g transform="rotate(-24 200 200)">
        <path d="M8 200 A192 46 0 0 1 392 200" fill="none" stroke="#A8442A" strokeWidth="12" strokeLinecap="round" />
      </g>
      <circle cx="200" cy="200" r="140" fill="url(#login-planet-cream)" />
      <circle cx="150" cy="150" r="22" fill="rgba(168,68,42,.14)" />
      <circle cx="120" cy="230" r="12" fill="rgba(168,68,42,.14)" />
      <circle cx="250" cy="110" r="14" fill="rgba(168,68,42,.12)" />
      <g transform="rotate(-24 200 200)">
        <path d="M8 200 A192 46 0 0 0 392 200" fill="none" stroke="#C25A3A" strokeWidth="12" strokeLinecap="round" />
        <path d="M40 222 A192 46 0 0 0 360 222" fill="none" stroke="#F2B23E" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" opacity=".9" />
      </g>
    </svg>
  );
}

function Satellite() {
  return (
    <svg viewBox="0 0 160 90" width="170" style={{ transform: "rotate(-14deg)" }}>
      <g fill="#C25A3A" stroke="#F0D9CD" strokeWidth="1.5">
        <rect x="2" y="30" width="40" height="26" rx="3" />
        <rect x="118" y="30" width="40" height="26" rx="3" />
      </g>
      <path d="M15 30v26M28 30v26M131 30v26M144 30v26M2 43h40M118 43h40" stroke="#F0D9CD" strokeWidth="1.2" />
      <path d="M42 43h12M106 43h12" stroke="#F0D9CD" strokeWidth="3" />
      <rect x="54" y="22" width="52" height="40" rx="8" fill="#FAF4EC" />
      <rect x="62" y="16" width="16" height="8" rx="2" fill="#F0D9CD" />
      <circle cx="80" cy="43" r="15" fill="#2A2218" />
      <circle cx="80" cy="43" r="10" fill="#4A3A2C" />
      <circle cx="76" cy="39" r="3.2" fill="#fff" opacity=".8" />
      <circle cx="98" cy="29" r="2.5" fill="#C25A3A" />
      <path d="M80 22V6" stroke="#F0D9CD" strokeWidth="2" />
      <circle cx="80" cy="5" r="3.5" fill="#F2B23E" />
    </svg>
  );
}

function Rocket() {
  return (
    <svg viewBox="0 0 60 130" width="46">
      <defs>
        <clipPath id="login-rocket-window">
          <circle cx="30" cy="46" r="11" />
        </clipPath>
      </defs>
      <path d="M30 2 C46 18 50 44 48 92 L12 92 C10 44 14 18 30 2Z" fill="#FAF4EC" />
      <path d="M30 2 C40 12 45 22 47 32 L13 32 C15 22 20 12 30 2Z" fill="#C25A3A" />
      <path d="M12 70 L0 98 L12 92Z M48 70 L60 98 L48 92Z" fill="#A8442A" />
      <rect x="24" y="86" width="12" height="10" rx="2" fill="#A8442A" />
      <circle cx="30" cy="46" r="13" fill="#A8442A" />
      <image
        href="/login-space/guest.jpg"
        x="19"
        y="35"
        width="22"
        height="22"
        preserveAspectRatio="xMidYMid slice"
        clipPath="url(#login-rocket-window)"
      />
      <g className={styles.flame}>
        <path d="M22 96 Q30 128 38 96Z" fill="#F2B23E" />
        <path d="M26 96 Q30 116 34 96Z" fill="#FFF3D6" />
      </g>
    </svg>
  );
}
