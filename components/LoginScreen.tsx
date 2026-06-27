"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ParticleField from "@/components/ParticleField";

export interface LoginScreenProps {
  role: 'admin' | 'driver';
  authEndpoint: string;
  redirectPath: string;
  accentColor: string;
  accentColorRgb: string;
  title: string;
  icon: React.ReactNode;
}

export default function LoginScreen({ role, authEndpoint, redirectPath, accentColor, accentColorRgb, title, icon }: LoginScreenProps) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [shaking, setShaking] = useState(false);
  const [focusU, setFocusU] = useState(false);
  const [focusP, setFocusP] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockCountdown, setBlockCountdown] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [scanningEye, setScanningEye] = useState(false);
  const [eyeRevealed, setEyeRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [failedUsername, setFailedUsername] = useState("");
  const [failedCount, setFailedCount] = useState(0);
  const [showContactHint, setShowContactHint] = useState(false);
  const router = useRouter();
  const userInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isBlocked) return;
    setBlockCountdown(30);
    const interval = setInterval(() => {
      setBlockCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsBlocked(false);
          setAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isBlocked]);

  useEffect(() => {
    // Auto-focus en el campo usuario al montar, con delay
    // para esperar la animación cardIn (0.7s)
    const t = setTimeout(() => {
      if (!isBlocked) userInputRef.current?.focus();
    }, 750);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (isBlocked) return;
    if (loading || accessGranted) return;
    if (!user.trim() || !pass.trim()) return;

    setLoading(true);
    setError(false);

    try {
      const res = await fetch(authEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass }),
      });

      const data = await res.json();

      if (data.ok) {
        sessionStorage.setItem('shuma_auth', '1');
        sessionStorage.setItem('shuma_role', data.role);
        sessionStorage.setItem('shuma_user', data.username);
        sessionStorage.setItem('shuma_name', data.full_name);
        if (role === 'driver' && data.driver_id) {
          sessionStorage.setItem('shuma_driver_id', data.driver_id);
        }
        
        setShowContactHint(false);
        setFailedCount(0);
        setFailedUsername('');

        // Scan de verificación breve antes del estado de éxito
        setScanningEye(true);
        setTimeout(() => {
          setScanningEye(false);
          setAccessGranted(true);
          setTimeout(() => {
            router.push(redirectPath);
          }, 1400);
        }, 500);
      } else {
        const newAttempts = Math.min(attempts + 1, 5);
        setAttempts(newAttempts);

        if (newAttempts >= 3) {
          setIsBlocked(true);
          fetch('/api/audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'Cuenta bloqueada',
              entity: 'session',
              entity_id: null,
              user_name: user.toLowerCase().trim(),
              user_role: 'unknown',
              module: 'Autenticación',
              metadata: { attempts: newAttempts, reason: '3 intentos fallidos' },
            }),
          }).catch(console.error);
        }

        if (user === failedUsername) {
          const newCount = failedCount + 1;
          setFailedCount(newCount);
          if (newCount >= 3) setShowContactHint(true);
        } else {
          setFailedUsername(user);
          setFailedCount(1);
          setShowContactHint(false);
        }

        const rawError = (data.error || '').toLowerCase();
        let friendlyError = '❌ Credenciales incorrectas — verifica tu usuario y contraseña';

        if (rawError.includes('not found') || rawError.includes('no encontrado') ||
            rawError.includes('does not exist') || rawError.includes('invalid user')) {
          friendlyError = `👤 Usuario "${user}" no encontrado en el sistema`;
        } else if (rawError.includes('password') || rawError.includes('contraseña') ||
                   rawError.includes('incorrect') || rawError.includes('wrong')) {
          friendlyError = '🔒 Contraseña incorrecta — inténtalo de nuevo';
        } else if (rawError.includes('inactive') || rawError.includes('disabled') ||
                   rawError.includes('inactivo')) {
          friendlyError = `🚫 La cuenta "${user}" está desactivada. Contacta a TI`;
        } else if (rawError.includes('role') || rawError.includes('rol')) {
          friendlyError = '⚠️ Rol de acceso incorrecto — usa el acceso correspondiente';
        } else if (data.error) {
          friendlyError = `⚠️ ${data.error}`;
        }

        setErrorMsg(friendlyError);
        setGlitching(true);
        setTimeout(() => {
          setGlitching(false);
          setError(true);
          setShaking(true);
          setTimeout(() => setShaking(false), 500);
        }, 680);
      }
    } catch {
      const newAttempts = Math.min(attempts + 1, 5);
      setAttempts(newAttempts);

      if (newAttempts >= 3) {
        setIsBlocked(true);
        fetch('/api/audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'Cuenta bloqueada',
            entity: 'session',
            entity_id: null,
            user_name: user.toLowerCase().trim(),
            user_role: 'unknown',
            module: 'Autenticación',
            metadata: { attempts: newAttempts, reason: '3 intentos fallidos' },
          }),
        }).catch(console.error);
      }

      if (user === failedUsername) {
        const newCount = failedCount + 1;
        setFailedCount(newCount);
        if (newCount >= 3) setShowContactHint(true);
      } else {
        setFailedUsername(user);
        setFailedCount(1);
        setShowContactHint(false);
      }

      setErrorMsg('🌐 Sin conexión — verifica tu red e inténtalo de nuevo');
      setGlitching(true);
      setTimeout(() => {
        setGlitching(false);
        setError(true);
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
      }, 680);
    } finally {
      setLoading(false);
    }
  };

  const toggleEye = () => {
    if (scanningEye) return;
    if (!eyeRevealed) {
      setScanningEye(true);
      setShowPass(false);
      setTimeout(() => {
        setShowPass(true);
        setTimeout(() => {
          setScanningEye(false);
          setEyeRevealed(true);
        }, 500);
      }, 50);
    } else {
      setShowPass(false);
      setEyeRevealed(false);
    }
  };

  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;
  
  const segmentColor = score === 1 ? '#ef4444' : score === 2 ? '#f97316' : score === 3 ? '#eab308' : score === 4 ? '#22c55e' : '#2a2a2a';

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
          z-index: 99999;
          isolation: isolate;
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
          background: radial-gradient(circle, rgba(${accentColorRgb},0.12) 0%, transparent 70%);
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
          border: 1px solid rgba(${accentColorRgb},0.15);
          border-radius: 16px;
          padding: 40px 36px 32px;
          position: relative; overflow: hidden;
        }
        .ls-panel::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(${accentColorRgb},0.7), rgba(0,71,171,0.4), transparent);
          animation: scanT 3s ease-in-out infinite;
        }
        @keyframes scanT {
          0%,100%{ opacity: 0.4; }
          50%{ opacity: 1; }
        }
        .ls-corner { position: absolute; width: 16px; height: 16px; }
        .ls-c-tl { top: 12px; left: 12px; border-top: 1.5px solid rgba(${accentColorRgb},0.5); border-left: 1.5px solid rgba(${accentColorRgb},0.5); }
        .ls-c-tr { top: 12px; right: 12px; border-top: 1.5px solid rgba(${accentColorRgb},0.5); border-right: 1.5px solid rgba(${accentColorRgb},0.5); }
        .ls-c-bl { bottom: 12px; left: 12px; border-bottom: 1.5px solid rgba(${accentColorRgb},0.5); border-left: 1.5px solid rgba(${accentColorRgb},0.5); }
        .ls-c-br { bottom: 12px; right: 12px; border-bottom: 1.5px solid rgba(${accentColorRgb},0.5); border-right: 1.5px solid rgba(${accentColorRgb},0.5); }
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
          height: 80px; width: auto;
          filter: drop-shadow(0 0 16px rgba(${accentColorRgb},0.6)) brightness(1.1);
          animation: logoPulse 4s ease-in-out infinite;
          margin-bottom: 12px;
        }
        @keyframes logoPulse {
          0%,100%{ filter: drop-shadow(0 0 12px rgba(${accentColorRgb},0.45)) brightness(1.05); }
          50%{ filter: drop-shadow(0 0 28px rgba(${accentColorRgb},0.8)) brightness(1.2); }
        }
        .ls-badge {
          display: flex; align-items: center; gap: 6px;
          background: rgba(0,71,171,0.12);
          border: 1px solid rgba(${accentColorRgb},0.2);
          border-radius: 20px;
          padding: 4px 14px;
          margin-bottom: 28px;
        }
        .ls-badge-dot {
          width: 6px; height: 6px; border-radius: 50%; background: ${accentColor};
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
          border-color: ${accentColor};
          box-shadow: 0 0 0 3px rgba(${accentColorRgb},0.1);
        }
        .ls-field-row.err { border-color: rgba(239,68,68,0.4); }
        .ls-icon-box {
          width: 44px; height: 48px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,71,171,0.08);
          border-right: 1px solid #0d1f3a;
          flex-shrink: 0; transition: background 0.2s;
        }
        .focused .ls-icon-box { background: rgba(${accentColorRgb},0.12); }
        .ls-icon-box svg { width: 16px; height: 16px; color: #3a5a80; transition: color 0.2s; }
        .focused .ls-icon-box svg { color: ${accentColor}; }
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
        .ls-eye-btn:hover { color: ${accentColor}; }
        .ls-eye-btn svg { width: 16px; height: 16px; }
        .ls-btn {
          width: 100%; margin-top: 8px; height: 50px;
          background: linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%);
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
          font-family: 'Exo 2', sans-serif; font-size: 13px;
          letter-spacing: 0.10em; text-transform: uppercase;
          background: linear-gradient(90deg,
            #ff0000, #ff6600, #ffff00, #00ff00,
            #00ffff, #0066ff, #cc00ff, #ff0000
          );
          background-size: 400% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: rgbRoll 5s linear infinite;
          opacity: 0.65;
        }
        @keyframes rgbRoll {
          from{ background-position: 0% center; }
          to{ background-position: 400% center; }
        }
        @keyframes lockPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }

        /* GLITCH FULL PAGE */
        .ls-root.glitching .ls-panel {
          animation: lsPageGlitch 0.65s steps(1) forwards;
        }
        .ls-root.glitching .ls-grid { opacity: 0.15; }
        .ls-root.glitching .ls-logo {
          animation: lsLogoGlitch 0.65s steps(1) forwards;
        }
        .ls-glitch-r {
          position: absolute; inset: 0; pointer-events: none;
          background: rgba(255,0,60,0.07); mix-blend-mode: screen;
          opacity: 0; transition: opacity 0.05s;
        }
        .ls-glitch-c {
          position: absolute; inset: 0; pointer-events: none;
          background: rgba(0,255,255,0.06); mix-blend-mode: screen;
          transform: translate(3px,-2px);
          opacity: 0; transition: opacity 0.05s;
        }
        .ls-glitch-lines {
          position: absolute; inset: 0; pointer-events: none; opacity: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 4px);
        }
        .ls-root.glitching .ls-glitch-r,
        .ls-root.glitching .ls-glitch-c,
        .ls-root.glitching .ls-glitch-lines { opacity: 1; }

        @keyframes lsPageGlitch {
          0%  { transform: translate(0,0); filter: none; }
          8%  { transform: translate(calc(-4px * var(--glitch-intensity, 1)),0); filter: hue-rotate(90deg) saturate(2); }
          16% { transform: translate(calc(4px * var(--glitch-intensity, 1)),calc(1px * var(--glitch-intensity, 1))); filter: hue-rotate(-90deg); }
          24% { transform: translate(calc(-2px * var(--glitch-intensity, 1)),calc(-1px * var(--glitch-intensity, 1))); filter: none; }
          32% { transform: translate(calc(3px * var(--glitch-intensity, 1)),0) skewX(-2deg); filter: brightness(1.3); }
          40% { transform: translate(0,calc(2px * var(--glitch-intensity, 1))) skewX(1deg); filter: none; }
          50% { transform: translate(calc(-3px * var(--glitch-intensity, 1)),0); filter: hue-rotate(180deg); }
          60% { transform: translate(calc(2px * var(--glitch-intensity, 1)),calc(-1px * var(--glitch-intensity, 1))); filter: none; }
          70% { transform: translate(calc(4px * var(--glitch-intensity, 1)),0); filter: brightness(1.4) hue-rotate(270deg); }
          80% { transform: translate(calc(-2px * var(--glitch-intensity, 1)),calc(1px * var(--glitch-intensity, 1))); filter: none; }
          90% { transform: translate(calc(1px * var(--glitch-intensity, 1)),calc(-1px * var(--glitch-intensity, 1))); filter: hue-rotate(45deg); }
          100%{ transform: translate(0,0); filter: none; }
        }
        @keyframes lsLogoGlitch {
          0%  { color: #1a6fd4; text-shadow: none; }
          15% { color: #ff003c; text-shadow: calc(-3px * var(--glitch-intensity, 1)) 0 #00ffff, calc(3px * var(--glitch-intensity, 1)) 0 #ff00ff; }
          30% { color: #1a6fd4; text-shadow: calc(3px * var(--glitch-intensity, 1)) 0 #ff003c, calc(-3px * var(--glitch-intensity, 1)) 0 #00ffff; }
          50% { color: #ffffff; text-shadow: none; }
          65% { color: #ff003c; text-shadow: calc(-2px * var(--glitch-intensity, 1)) 0 #00ffff; }
          100%{ color: #1a6fd4; text-shadow: none; }
        }

        /* THERMAL SCAN DEL OJO */
        .ls-scan-line {
          position: absolute; top: 0; width: 3px; height: 100%;
          background: linear-gradient(180deg, transparent, rgba(${accentColorRgb},0.9), transparent);
          border-radius: 2px; opacity: 0; pointer-events: none; left: 42px;
        }
        .ls-frow.ls-scanning .ls-scan-line {
          animation: lsThermalScan 0.5s ease-in-out forwards;
        }
        .ls-frow.ls-scanning input {
          animation: lsThermalReveal 0.5s ease-in-out forwards;
        }
        @keyframes lsThermalScan {
          0%  { left: 42px; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100%{ left: calc(100% - 42px); opacity: 0; }
        }
        @keyframes lsThermalReveal {
          0%, 30% { color: transparent; text-shadow: 0 0 10px rgba(${accentColorRgb},0.9); }
          100%    { color: #E8EFF8; text-shadow: none; }
        }

        /* SUCCESS STATE */
        .ls-root.ls-granted .ls-panel {
          border-color: rgba(16,185,129,0.5);
          box-shadow: 0 0 50px rgba(16,185,129,0.2), inset 0 0 40px rgba(16,185,129,0.04);
          animation: lsSuccessPulse 0.6s ease forwards;
        }
        @keyframes lsSuccessPulse {
          0%  { transform: scale(1); }
          40% { transform: scale(1.018); }
          100%{ transform: scale(1); }
        }
        .ls-root.ls-granted .ls-c-tl,
        .ls-root.ls-granted .ls-c-tr,
        .ls-root.ls-granted .ls-c-bl,
        .ls-root.ls-granted .ls-c-br {
          border-color: rgba(16,185,129,0.8);
        }
        .ls-root.ls-granted .ls-grid {
          background-image:
            linear-gradient(rgba(16,185,129,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16,185,129,0.08) 1px, transparent 1px);
        }
        .ls-root.ls-granted .ls-logo {
          color: #10B981;
          filter: drop-shadow(0 0 20px rgba(16,185,129,0.8));
          animation: none;
        }
        .ls-root.ls-granted .ls-badge {
          background: rgba(16,185,129,0.1);
          border-color: rgba(16,185,129,0.35);
        }
        .ls-root.ls-granted .ls-badge-dot { background: #10B981; }
        .ls-root.ls-granted .ls-badge-text { color: #10B981; }
        .ls-success-scan {
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(16,185,129,0.9), transparent);
          transform: translateY(-2px); opacity: 0;
        }
        .ls-root.ls-granted .ls-success-scan {
          animation: lsSuccessScan 0.7s ease-in-out 0.15s forwards;
        }
        @keyframes lsSuccessScan {
          0%  { transform: translateY(-2px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100%{ transform: translateY(600px); opacity: 0; }
        }
        .ls-success-overlay {
          position: absolute; inset: 0; z-index: 20;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          pointer-events: none; opacity: 0; transition: opacity 0.4s ease 0.3s;
        }
        .ls-root.ls-granted .ls-success-overlay { opacity: 1; }
        .ls-success-ring {
          width: 72px; height: 72px; border-radius: 50%;
          border: 1.5px solid rgba(16,185,129,0.4);
          display: flex; align-items: center; justify-content: center;
          position: relative; margin-bottom: 14px;
        }
        .ls-success-ring::before {
          content: ''; position: absolute; inset: -10px; border-radius: 50%;
          border: 1px solid rgba(16,185,129,0.18);
        }
        .ls-success-ring::after {
          content: ''; position: absolute; inset: -20px; border-radius: 50%;
          border: 1px solid rgba(16,185,129,0.08);
        }
        .ls-check-path {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          transition: stroke-dashoffset 0.45s ease 0.5s;
        }
        .ls-root.ls-granted .ls-check-path { stroke-dashoffset: 0; }
        .ls-success-label {
          font-family: 'Exo 2', sans-serif; font-size: 10px;
          letter-spacing: 0.2em; color: #10B981; text-transform: uppercase;
          opacity: 0; transform: translateY(8px);
          transition: all 0.4s ease 0.7s;
        }
        .ls-root.ls-granted .ls-success-label { opacity: 1; transform: translateY(0); }
        .ls-root.ls-granted .ls-fields-fade {
          opacity: 0.08; transition: opacity 0.4s ease 0.2s; pointer-events: none;
        }

        @keyframes bounce-dot {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }

        /* ATTEMPT DOTS */
        .ls-attempt-bar {
          display: flex; gap: 4px; margin-top: 8px; justify-content: center;
        }
        .ls-a-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #1a3a5a; border: 1px solid #0d1f3a; transition: all 0.3s;
        }
        .ls-a-dot.used {
          background: #EF4444;
          box-shadow: 0 0 6px rgba(239,68,68,0.5);
        }

        .ls-back-link {
          display: flex; align-items: center; gap: 6px;
          margin-top: 16px; justify-content: center;
          font-family: 'Exo 2', sans-serif; font-size: 11px;
          letter-spacing: 0.08em; color: #2a4060;
          text-decoration: none; transition: color 0.2s;
          cursor: pointer; background: none; border: none;
        }
        .ls-back-link:hover { color: #4a90d9; }
        .ls-back-link svg { width: 14px; height: 14px; }
      `}</style>

      <div className={`ls-root${glitching ? ' glitching' : ''}${accessGranted ? ' ls-granted' : ''}`} style={{ position:'fixed', inset:0, zIndex:99999, '--glitch-intensity': Math.min(attempts / 3, 1) } as React.CSSProperties}>
        <div className="ls-glitch-r" />
        <div className="ls-glitch-c" />
        <div className="ls-glitch-lines" />
        <div className="ls-grid" />
        <div className="ls-orb ls-orb1" />
        <div className="ls-orb ls-orb2" />
        <div className="ls-scanline" />

        <div style={{ position: 'fixed', inset: 0, zIndex: 0, opacity: 0.22, pointerEvents: 'none' }}>
          <ParticleField />
        </div>

        {isBlocked && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.97)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto'
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '2px',
              background: 'rgba(220,38,38,0.15)',
              animation: 'scanline 3s linear infinite'
            }} />
            <div style={{
              border: '1px solid rgba(220,38,38,0.2)', padding: '40px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              backgroundColor: 'rgba(20,0,0,0.5)', borderRadius: '16px',
              boxShadow: '0 0 40px rgba(220,38,38,0.05)'
            }}>
              <h2 style={{ color: '#ef4444', fontFamily: "'Exo 2', sans-serif", fontSize: '13px', letterSpacing: '0.1em', margin: 0, textAlign: 'center' }}>
                ⚠ ACCESO DENEGADO
              </h2>
              <h3 style={{ color: '#7f1d1d', fontFamily: "'Exo 2', sans-serif", fontSize: '10px', letterSpacing: '0.15em', margin: '4px 0 24px', textAlign: 'center' }}>
                SISTEMA EN CUARENTENA
              </h3>
              
              <svg width="160" height="160" viewBox="0 0 160 160" style={{ filter: 'drop-shadow(0 0 8px rgba(220,38,38,0.6))' }}>
                <circle cx="80" cy="80" r="72" fill="none" stroke="#1a0000" strokeWidth="8" />
                <circle cx="80" cy="80" r="72" fill="none" stroke="#dc2626" strokeWidth="8"
                  strokeDasharray={2 * Math.PI * 72}
                  strokeDashoffset={2 * Math.PI * 72 * (1 - blockCountdown / 30)}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                />
                <text x="80" y="80" textAnchor="middle" dominantBaseline="central" fill="#dc2626" fontSize="48" fontFamily="'Exo 2', monospace" fontWeight="700" style={{ animation: 'lockPulse 1s ease-in-out infinite' }}>
                  {blockCountdown}
                </text>
              </svg>

              <p style={{ fontFamily: "'DM Sans', sans-serif", color: '#6b7280', fontSize: '13px', marginTop: '24px', textAlign: 'center', lineHeight: '1.5' }}>
                Demasiados intentos fallidos.<br />
                Espera antes de intentarlo de nuevo.
              </p>
            </div>
          </div>
        )}

        <div className="ls-card">
          <div className="ls-panel">
            <div className="ls-success-scan" />
            <div className="ls-success-overlay">
              <div className="ls-success-ring">
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <path className="ls-check-path" d="M6 16 L13 23 L26 10"
                    stroke="#10B981" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="ls-success-label">Acceso concedido</div>
            </div>
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
                <span className="ls-badge-text">Acceso Administrativo</span>
              </div>
            </div>

            <div className="ls-fields-fade">
              <div className="ls-field">
              <div className="ls-field-label">Usuario</div>
              <div className={`ls-field-row ${focusU ? "focused" : ""} ${error ? "err" : ""}`}>
                <div className="ls-icon-box">{icon}</div>
                <input
                  ref={userInputRef}
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
              <div className={`ls-field-row ls-frow ${focusP ? "focused" : ""} ${error ? "err" : ""} ${scanningEye ? "ls-scanning" : ""}`}>
                <div className="ls-icon-box">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div className="ls-scan-line" />
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={pass}
                  onChange={e => setPass(e.target.value)}
                  onFocus={() => setFocusP(true)}
                  onBlur={() => setFocusP(false)}
                  onKeyDown={e => e.key === "Enter" && handleSubmit()}
                  onKeyUp={(e) => {
                    setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'));
                  }}
                  autoComplete="off"
                />
                <button className="ls-eye-btn" onClick={toggleEye} type="button" aria-label="Mostrar contraseña">
                  {showPass
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>

              {pass.length > 0 && (
                <div style={{ marginTop: '6px' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', gap: '3px', height: '4px' }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{
                          flex: 1,
                          height: '4px',
                          borderRadius: '2px',
                          backgroundColor: i <= score ? segmentColor : '#2a2a2a',
                          transition: 'background-color 0.3s ease'
                        }} />
                      ))}
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontFamily: "'DM Sans', sans-serif",
                      color: segmentColor,
                      marginLeft: '8px',
                      minWidth: '48px',
                      textAlign: 'right'
                    }}>
                      {['','Débil','Regular','Buena','Fuerte'][score]}
                    </span>
                  </div>
                </div>
              )}

              {capsLockOn && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px',
                  padding: '6px 10px',
                  backgroundColor: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: '6px',
                }}>
                  <span style={{ fontSize: '14px' }}>⚠️</span>
                  <span style={{
                    fontSize: '12px',
                    fontFamily: "'DM Sans', sans-serif",
                    color: '#eab308'
                  }}>
                    Mayúsculas activadas
                  </span>
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <button
                className={`ls-btn${accessGranted ? " success" : ""}`}
                onClick={handleSubmit}
                disabled={loading || accessGranted || isBlocked || !user.trim() || !pass.trim()}
              >
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="2" x2="12" y2="6"></line>
                      <line x1="12" y1="18" x2="12" y2="22"></line>
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                      <line x1="2" y1="12" x2="6" y2="12"></line>
                      <line x1="18" y1="12" x2="22" y2="12"></line>
                      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                      <line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line>
                    </svg>
                    Autenticando
                    <span style={{ display: 'inline-flex', gap: 2 }}>
                      {[0,1,2].map(i => (
                        <span key={i} style={{
                          width: 4, height: 4, borderRadius: '50%', background: 'currentColor',
                          animation: 'bounce-dot 1s ease-in-out infinite',
                          animationDelay: `${i * 0.15}s`,
                          display: 'inline-block',
                        }} />
                      ))}
                    </span>
                  </span>
                ) : accessGranted ? (
                  <span>✓ Acceso concedido</span>
                ) : (
                  <span>Acceder</span>
                )}
              </button>
            </div>

            <div className={`ls-error ${error ? "show" : ""} ${shaking ? "shake" : ""}`}>
              {(() => {
                const msg = errorMsg || '';
                const icon =
                  msg.includes('red') || msg.includes('conexión') ? '📡' :
                  msg.includes('desactivada')                     ? '🔒' :
                  msg.includes('no encontrado')                   ? '👤' :
                  msg.includes('Contraseña')                      ? '🔑' :
                  msg.includes('Rol')                             ? '⚠️' : '❌';
                return `${icon} ${msg}`;
              })()}
            </div>

            {attempts > 0 && !isBlocked && (
              <div className="ls-attempt-bar">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className={`ls-a-dot${i < attempts ? ' used' : ''}`} />
                ))}
              </div>
            )}

            {showContactHint && !isBlocked && (
              <div style={{
                marginTop: '8px',
                padding: '10px 12px',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>💡</span>
                <span style={{
                  fontSize: '12px',
                  fontFamily: "'DM Sans', sans-serif",
                  color: '#93c5fd',
                  lineHeight: '1.5'
                }}>
                  ¿Olvidaste tu usuario? Contacta a{' '}
                  <strong style={{ color: '#60a5fa' }}>Sistemas IT</strong>
                </span>
              </div>
            )}

            </div>
          </div>

          <button className="ls-back-link" onClick={() => window.location.href = '/'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Volver al inicio
          </button>

          <p className="ls-footer">Design &amp; Developed by Shuma Sistemas IT</p>
        </div>
      </div>
    </>
  );
}
