"use client";
import { useState } from "react";

interface LoginScreenProps {
  onLogin: (user: string, pass: string) => boolean;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [focusU, setFocusU] = useState(false);
  const [focusP, setFocusP] = useState(false);

  const handleSubmit = () => {
    const ok = onLogin(user, pass);
    if (ok) {
      setSuccess(true);
      setError(false);
    } else {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600;700&family=DM+Sans:wght@300;400;500&display=swap');

        .ls-root {
          position: fixed; inset: 0;
          background: #050C1A;
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Sans', sans-serif;
          overflow: hidden;
          z-index: 9999;
        }
        .ls-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(17,32,64,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(17,32,64,0.5) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .ls-orb {
          position: absolute; border-radius: 50%; pointer-events: none;
        }
        .ls-orb1 {
          width: 400px; height: 400px; top: -100px; left: -100px;
          background: radial-gradient(circle, rgba(0,71,171,0.18) 0%, transparent 70%);
          animation: orbF 8s ease-in-out infinite;
        }
        .ls-orb2 {
          width: 320px; height: 320px; bottom: -80px; right: -80px;
          background: radial-gradient(circle, rgba(33,150,243,0.12) 0%, transparent 70%);
          animation: orbF 10s ease-in-out infinite reverse;
        }
        .ls-scanline {
          position: absolute; inset: 0; pointer-events: none;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px);
        }
        @keyframes orbF {
          0%,100%{ transform: translateY(0) scale(1); }
          50%{ transform: translateY(-20px) scale(1.05); }
        }
        .ls-card {
          position: relative; z-index: 10;
          width: 100%; max-width: 400px; padding: 0 20px;
          animation: cardIn 0.7s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes cardIn {
          from{ opacity: 0; transform: translateY(30px) scale(0.97); }
          to{ opacity: 1; transform: translateY(0) scale(1); }
        }
        .ls-panel {
          background: rgba(8,18,36,0.93);
          border: 1px solid rgba(33,150,243,0.15);
          border-radius: 16px;
          padding: 40px 36px 32px;
          position: relative; overflow: hidden;
        }
        .ls-panel::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(33,150,243,0.7), rgba(0,71,171,0.4), transparent);
          animation: scanT 3s ease-in-out infinite;
        }
        @keyframes scanT {
          0%,100%{ opacity: 0.4; }
          50%{ opacity: 1; }
        }
        .ls-corner { position: absolute; width: 16px; height: 16px; }
        .ls-c-tl { top: 12px; left: 12px; border-top: 1.5px solid rgba(33,150,243,0.5); border-left: 1.5px solid rgba(33,150,243,0.5); }
        .ls-c-tr { top: 12px; right: 12px; border-top: 1.5px solid rgba(33,150,243,0.5); border-right: 1.5px solid rgba(33,150,243,0.5); }
        .ls-c-bl { bottom: 12px; left: 12px; border-bottom: 1.5px solid rgba(33,150,243,0.5); border-left: 1.5px solid rgba(33,150,243,0.5); }
        .ls-c-br { bottom: 12px; right: 12px; border-bottom: 1.5px solid rgba(33,150,243,0.5); border-right: 1.5px solid rgba(33,150,243,0.5); }
        .ls-status {
          position: absolute; top: 14px; right: 14px;
          display: flex; align-items: center; gap: 5px;
          font-family: 'Exo 2', sans-serif; font-size: 9px;
          letter-spacing: 0.1em; color: #1a3a60; text-transform: uppercase;
        }
        .ls-status-dot {
          width: 5px; height: 5px; border-radius: 50%; background: #1a3a60;
          animation: blink 2s ease-in-out infinite;
        }
        @keyframes blink {
          0%,100%{ opacity: 1; } 50%{ opacity: 0.3; }
        }
        .ls-logo-area {
          display: flex; flex-direction: column; align-items: center;
          margin-bottom: 8px;
        }
        .ls-logo-img {
          height: 56px; width: auto;
          filter: drop-shadow(0 0 16px rgba(33,150,243,0.6)) brightness(1.1);
          animation: logoPulse 4s ease-in-out infinite;
          margin-bottom: 12px;
        }
        @keyframes logoPulse {
          0%,100%{ filter: drop-shadow(0 0 12px rgba(33,150,243,0.45)) brightness(1.05); }
          50%{ filter: drop-shadow(0 0 28px rgba(33,150,243,0.8)) brightness(1.2); }
        }
        .ls-badge {
          display: flex; align-items: center; gap: 6px;
          background: rgba(0,71,171,0.12);
          border: 1px solid rgba(33,150,243,0.2);
          border-radius: 20px;
          padding: 4px 14px;
          margin-bottom: 28px;
        }
        .ls-badge-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #2196F3;
          animation: blink 2s ease-in-out infinite;
        }
        .ls-badge-text {
          font-family: 'Exo 2', sans-serif; font-size: 10px;
          letter-spacing: 0.18em; color: #4a90d9; text-transform: uppercase;
        }
        .ls-field-label {
          font-family: 'Exo 2', sans-serif; font-size: 10px;
          letter-spacing: 0.12em; color: #2a4060;
          text-transform: uppercase; margin-bottom: 6px; margin-left: 2px;
        }
        .ls-field { margin-bottom: 14px; }
        .ls-field-row {
          display: flex; align-items: center;
          background: #060F1D;
          border: 1px solid #0d1f3a;
          border-radius: 10px; overflow: hidden;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ls-field-row.focused {
          border-color: #2196F3;
          box-shadow: 0 0 0 3px rgba(33,150,243,0.1);
        }
        .ls-field-row.err { border-color: rgba(239,68,68,0.4); }
        .ls-icon-box {
          width: 44px; height: 48px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,71,171,0.08);
          border-right: 1px solid #0d1f3a;
          flex-shrink: 0; transition: background 0.2s;
        }
        .focused .ls-icon-box { background: rgba(33,150,243,0.12); }
        .ls-icon-box svg { width: 16px; height: 16px; color: #3a5a80; transition: color 0.2s; }
        .focused .ls-icon-box svg { color: #2196F3; }
        .ls-field-row input {
          flex: 1; height: 48px;
          background: transparent; border: none; outline: none;
          color: #E8EFF8; font-family: 'DM Sans', sans-serif; font-size: 14px;
          padding: 0 14px;
        }
        .ls-field-row input::placeholder { color: #2a4060; }
        .ls-eye-btn {
          width: 40px; height: 48px;
          background: none; border: none; cursor: pointer;
          color: #3a5a80; display: flex; align-items: center; justify-content: center;
          transition: color 0.2s; flex-shrink: 0;
        }
        .ls-eye-btn:hover { color: #2196F3; }
        .ls-eye-btn svg { width: 16px; height: 16px; }
        .ls-btn {
          width: 100%; margin-top: 8px; height: 50px;
          background: linear-gradient(135deg, #0047AB 0%, #1565C0 100%);
          border: none; border-radius: 10px; color: #fff;
          font-family: 'Exo 2', sans-serif; font-size: 12px; font-weight: 700;
          letter-spacing: 0.25em; text-transform: uppercase;
          cursor: pointer; position: relative; overflow: hidden;
          transition: transform 0.15s, box-shadow 0.2s;
        }
        .ls-btn.success {
          background: linear-gradient(135deg, #065f46 0%, #059669 100%);
        }
        .ls-btn:hover:not(.success) {
          transform: translateY(-1px);
          box-shadow: 0 8px 30px rgba(0,71,171,0.45);
        }
        .ls-btn:active { transform: scale(0.98); }
        .ls-error {
          display: flex; align-items: center; gap: 8px;
          margin-top: 10px; padding: 10px 14px;
          background: rgba(239,68,68,0.07);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 8px;
          color: #EF4444; font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          opacity: 0; transition: opacity 0.2s;
        }
        .ls-error.show { opacity: 1; }
        .ls-error.shake { animation: errShake 0.45s ease; }
        @keyframes errShake {
          0%,100%{ transform: translateX(0); }
          20%{ transform: translateX(-8px); }
          40%{ transform: translateX(8px); }
          60%{ transform: translateX(-5px); }
          80%{ transform: translateX(5px); }
        }
        .ls-footer {
          margin-top: 20px; text-align: center;
          font-family: 'Exo 2', sans-serif; font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase;
          background: linear-gradient(90deg,
            #ff0000, #ff6600, #ffff00, #00ff00,
            #00ffff, #0066ff, #cc00ff, #ff0000
          );
          background-size: 250% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: rgbRoll 5s linear infinite;
          opacity: 0.65;
        }
        @keyframes rgbRoll {
          from{ background-position: 0% center; }
          to{ background-position: 250% center; }
        }
      `}</style>

      <div className="ls-root">
        <div className="ls-grid" />
        <div className="ls-orb ls-orb1" />
        <div className="ls-orb ls-orb2" />
        <div className="ls-scanline" />

        <div className="ls-card">
          <div className="ls-panel">
            <div className="ls-corner ls-c-tl" />
            <div className="ls-corner ls-c-tr" />
            <div className="ls-corner ls-c-bl" />
            <div className="ls-corner ls-c-br" />

            <div className="ls-status">
              <div className="ls-status-dot" />
              Sistema activo
            </div>

            <div className="ls-logo-area">
              <img src="/shuma_logo.png" alt="Shuma" className="ls-logo-img" />
              <div className="ls-badge">
                <div className="ls-badge-dot" />
                <span className="ls-badge-text">Sistema de Logística</span>
              </div>
            </div>

            <div className="ls-field">
              <div className="ls-field-label">Usuario</div>
              <div className={`ls-field-row ${focusU ? "focused" : ""} ${error ? "err" : ""}`}>
                <div className="ls-icon-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <input
                  type="text"
                  placeholder="Identificador de acceso"
                  value={user}
                  onChange={e => setUser(e.target.value)}
                  onFocus={() => setFocusU(true)}
                  onBlur={() => setFocusU(false)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="ls-field">
              <div className="ls-field-label">Contraseña</div>
              <div className={`ls-field-row ${focusP ? "focused" : ""} ${error ? "err" : ""}`}>
                <div className="ls-icon-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  onFocus={() => setFocusP(true)}
                  onBlur={() => setFocusP(false)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  autoComplete="off"
                />
                <button className="ls-eye-btn" onClick={() => setShowPass(!showPass)} type="button" aria-label="Mostrar contraseña">
                  {showPass
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <button
              className={`ls-btn${success ? " success" : ""}`}
              onClick={handleSubmit}
            >
              {success ? "Acceso concedido ✓" : "Ingresar"}
            </button>

            <div className={`ls-error ${error ? "show" : ""} ${shaking ? "shake" : ""}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Credenciales incorrectas — acceso denegado
            </div>
          </div>

          <p className="ls-footer">Design &amp; Developed by Shuma Sistemas IT</p>
        </div>
      </div>
    </>
  );
}
