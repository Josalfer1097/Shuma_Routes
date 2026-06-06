"use client";

import { useState } from "react";
import { User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (user: string, pass: string) => boolean;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [shaking, setShaking] = useState(false);

  const handleSubmit = () => {
    const ok = onLogin(user, pass);
    if (!ok) {
      setError(true);
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } else {
      setError(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600;700&family=DM+Sans:wght@300;400;500&display=swap');

        .ls-bg {
          position: fixed;
          inset: 0;
          background: #050C1A;
          background-image:
            linear-gradient(rgba(17,32,64,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(17,32,64,0.4) 1px, transparent 1px);
          background-size: 40px 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          font-family: 'DM Sans', sans-serif;
        }

        .ls-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,71,171,0.13) 0%, transparent 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
        }

        .ls-wrap {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          padding: 0 20px;
          animation: lsFadeUp 0.6s ease-out forwards;
        }

        @keyframes lsFadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .ls-card {
          background: rgba(10,22,40,0.88);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          padding: 44px 40px 36px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .ls-logo {
          font-family: 'Exo 2', sans-serif;
          font-size: 38px;
          font-weight: 700;
          color: #1a6fd4;
          letter-spacing: 1px;
          filter: drop-shadow(0 0 14px rgba(33,150,243,0.5));
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .ls-logo img {
          height: 42px;
          filter: drop-shadow(0 0 14px rgba(33,150,243,0.5));
        }

        .ls-sublabel {
          font-family: 'Exo 2', sans-serif;
          font-size: 10px;
          letter-spacing: 0.22em;
          color: #5B7BA0;
          text-transform: uppercase;
          margin-bottom: 4px;
          text-align: center;
        }

        .ls-desc {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          color: #3a5a80;
          text-align: center;
          margin-bottom: 28px;
          letter-spacing: 0.03em;
        }

        .ls-divider {
          width: 40px;
          height: 1px;
          background: linear-gradient(90deg, transparent, #112040, transparent);
          margin-bottom: 24px;
        }

        .ls-field {
          position: relative;
          width: 100%;
          margin-bottom: 14px;
        }

        .ls-field input {
          width: 100%;
          background: #07111E;
          border: 1px solid #112040;
          border-radius: 10px;
          padding: 14px 14px 14px 42px;
          color: #E8EFF8;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .ls-field input::placeholder { color: transparent; }

        .ls-field input:focus {
          border-color: #2196F3;
          box-shadow: 0 0 0 3px rgba(33,150,243,0.12);
        }

        .ls-field-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #3a5a80;
          pointer-events: none;
          transition: color 0.2s;
          display: flex;
          align-items: center;
        }

        .ls-field input:focus ~ .ls-field-icon { color: #2196F3; }

        .ls-field-label {
          position: absolute;
          left: 42px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 13px;
          color: #3a5a80;
          pointer-events: none;
          transition: all 0.15s;
          font-family: 'DM Sans', sans-serif;
          background: transparent;
        }

        .ls-field input:focus ~ .ls-field-label,
        .ls-field input:not(:placeholder-shown) ~ .ls-field-label {
          top: 2px;
          font-size: 10px;
          color: #2196F3;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .ls-eye {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #3a5a80;
          padding: 4px;
          transition: color 0.2s;
          display: flex;
          align-items: center;
        }

        .ls-eye:hover { color: #2196F3; }

        .ls-btn {
          width: 100%;
          margin-top: 8px;
          padding: 14px;
          background: #0047AB;
          border: none;
          border-radius: 10px;
          color: #fff;
          font-family: 'Exo 2', sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
          position: relative;
          overflow: hidden;
        }

        .ls-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%);
          pointer-events: none;
        }

        .ls-btn:hover {
          background: #1565C0;
          box-shadow: 0 0 24px rgba(0,71,171,0.5);
        }

        .ls-btn:active { transform: scale(0.98); }

        .ls-error {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #EF4444;
          font-size: 12px;
          font-family: 'DM Sans', sans-serif;
          margin-top: 10px;
          padding: 10px 14px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 8px;
          width: 100%;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .ls-error.visible { opacity: 1; }

        @keyframes lsShake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }

        .ls-shake { animation: lsShake 0.45s ease; }

        .ls-footer {
          margin-top: 24px;
          font-family: 'Exo 2', sans-serif;
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          text-align: center;
          background: linear-gradient(90deg,
            #ff0000, #ff7700, #ffff00, #00ff00,
            #00ffff, #0077ff, #ff00ff, #ff0000
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: lsRgb 4s linear infinite;
          opacity: 0.7;
        }

        @keyframes lsRgb {
          from { background-position: 0% center; }
          to   { background-position: 200% center; }
        }
      `}</style>

      <div className="ls-bg">
        <div className="ls-glow" />
        <div className="ls-wrap">
          <div className="ls-card">
            <div className="ls-logo">
              <img src="/shuma_logo.png" alt="Shuma" />
            </div>

            <p className="ls-sublabel">Sistema de Logística</p>
            <p className="ls-desc">Optimización de rutas de entrega</p>
            <div className="ls-divider" />

            <div className="ls-field" onKeyDown={handleKey}>
              <input
                type="text"
                placeholder=" "
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoComplete="off"
              />
              <div className="ls-field-icon"><User size={16} /></div>
              <span className="ls-field-label">Usuario</span>
            </div>

            <div className="ls-field" onKeyDown={handleKey}>
              <input
                type={showPass ? "text" : "password"}
                placeholder=" "
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="off"
              />
              <div className="ls-field-icon"><Lock size={16} /></div>
              <span className="ls-field-label">Contraseña</span>
              <button
                className="ls-eye"
                onClick={() => setShowPass(!showPass)}
                aria-label="Mostrar contraseña"
                type="button"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button className="ls-btn" onClick={handleSubmit}>
              Ingresar
            </button>

            <div className={`ls-error ${error ? "visible" : ""} ${shaking ? "ls-shake" : ""}`}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              Credenciales incorrectas
            </div>
          </div>

          <p className="ls-footer">Design &amp; Developed by Shuma Sistemas IT</p>
        </div>
      </div>
    </>
  );
}
