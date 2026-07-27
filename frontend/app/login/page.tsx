"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Sparkles, Mail, Lock, ArrowRight, HelpCircle, CheckCircle } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const verifiedBanner = searchParams.get("verified") === "1";
  const verifyInvalid = searchParams.get("verify") === "invalid";
  const verifyExpired = searchParams.get("verify") === "expired";

  async function resend() {
    if (!email.trim()) {
      setError("Enter your email above, then click Resend.");
      return;
    }
    setResendLoading(true);
    try {
      const res = await fetch(api("/auth/resend-verification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      alert(data.message || "Done.");
    } catch {
      alert("Could not resend. Try again later.");
    } finally {
      setResendLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(api("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.detail;
        setError(typeof detail === "string" ? detail : "Login failed");
        return;
      }
      setToken(data.access_token);
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 relative overflow-hidden p-4 md:p-8">
      {/* Decorative ambient background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-orange-655 bg-orange-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-indigo-505 bg-indigo-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Main glassmorphic container layout */}
      <div className="w-full max-w-5xl bg-white/[0.02] backdrop-blur-xl border border-white/[0.08] rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col md:flex-row relative z-10 min-h-[640px]">
        
        {/* Left Side: Professional SVG Illustration Panel */}
        <div className="hidden md:flex flex-1 relative flex-col justify-between p-12 bg-gradient-to-b from-white/[0.03] to-transparent">
          {/* Top Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-amber-600 flex items-center justify-center shadow shadow-orange-500/20">
              <Sparkles className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-lg font-black tracking-tight text-white">
              Doc<span className="text-orange-500">Intel</span>
            </span>
          </div>

          {/* Central Workspace Vector Illustration */}
          <div className="my-8 flex justify-center items-center">
            <svg viewBox="0 0 500 500" className="w-full max-w-[360px] drop-shadow-3xl" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Central gradient orb */}
              <circle cx="250" cy="250" r="160" fill="url(#svg-light-glow)" opacity="0.12" />

              {/* Connected Papers */}
              {/* Document 1: Left */}
              <g transform="translate(60, 150) rotate(-10)">
                <rect width="130" height="170" rx="14" fill="#0f172a" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" />
                <rect x="15" y="20" width="100" height="6" rx="2" fill="rgba(255, 255, 255, 0.15)" />
                <rect x="15" y="34" width="70" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                <rect x="15" y="46" width="85" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                <rect x="15" y="58" width="50" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                <rect x="15" y="70" width="90" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
              </g>

              {/* Document 2: Right/Top */}
              <g transform="translate(260, 80) rotate(8)">
                <rect width="135" height="180" rx="14" fill="#1e293b" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1.5" filter="drop-shadow(0 15px 20px rgba(0,0,0,0.35))" />
                <rect x="15" y="20" width="105" height="6" rx="2" fill="rgba(255, 255, 255, 0.2)" />
                {/* Orange Highlighter Marker Line */}
                <rect x="15" y="42" width="75" height="10" rx="2" fill="#ea580c" opacity="0.35" />
                <rect x="15" y="45" width="60" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                <rect x="15" y="60" width="90" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                <rect x="15" y="74" width="80" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                <circle cx="110" cy="140" r="10" fill="#f97316" opacity="0.2" />
                <path d="M106 140h8M110 136v8" stroke="#f97316" strokeWidth="1.5" />
              </g>

              {/* Document 3: Bottom/Middle */}
              <g transform="translate(170, 270) rotate(-2)">
                <rect width="140" height="180" rx="14" fill="#1e293b" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1.5" filter="drop-shadow(0 20px 30px rgba(0,0,0,0.4))" />
                <rect x="15" y="20" width="110" height="6" rx="2" fill="rgba(255, 255, 255, 0.18)" />
                <rect x="15" y="34" width="70" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                {/* Small tick mark badge */}
                <path d="M15 54l6 6l12 -12" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="40" y="52" width="80" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
                <rect x="15" y="70" width="110" height="4" rx="2" fill="rgba(255, 255, 255, 0.08)" />
              </g>

              {/* Orange Connecting Flow-lines */}
              {/* Path 1: From left doc to top-right doc */}
              <path d="M 170 230 C 210 230, 210 140, 260 140" stroke="#f97316" strokeWidth="2.5" strokeDasharray="5 5" opacity="0.8" strokeLinecap="round" />
              <circle cx="170" cy="230" r="5" fill="#f97316" />
              <circle cx="260" cy="140" r="5" fill="#f97316" />
              
              {/* Path 2: From top-right doc to bottom doc */}
              <path d="M 320 250 C 320 280, 260 280, 260 300" stroke="#f97316" strokeWidth="2.5" opacity="0.85" strokeLinecap="round" />
              <circle cx="320" cy="250" r="5" fill="#f97316" />
              <circle cx="260" cy="300" r="5" fill="#f97316" />

              {/* Highlighter Marker drawing on Document 2 */}
              <g transform="translate(195, 65) rotate(42)">
                <rect x="-10" y="0" width="22" height="65" rx="4" fill="#334155" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
                {/* Marker collar */}
                <rect x="-7" y="-8" width="16" height="8" fill="#475569" />
                {/* Marker tip (orange) */}
                <path d="M -5 -8 L -1 -15 L 5 -15 L 3 -8 Z" fill="#f97316" />
                {/* Highlight wet ray */}
                <circle cx="1" cy="-21" r="3" fill="#f97316" opacity="0.85" />
              </g>

              {/* Sleek Pen overlay */}
              <g transform="translate(330, 310) rotate(-40)">
                {/* Pen body */}
                <path d="M 0 0 L 10 -10 L 120 -120 L 110 -130 L 0 -20 Z" fill="url(#pen-linear-glow)" />
                <path d="M 0 0 L 10 -10 L 4 -22 Z" fill="#cbd5e1" />
                {/* Tip active marker */}
                <circle cx="4" cy="-22" r="1.5" fill="#f97316" />
                {/* Pen clip */}
                <path d="M 90 -90 L 100 -100" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
              </g>

              {/* Defs/Gradients */}
              <defs>
                <radialGradient id="svg-light-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="pen-linear-glow" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="60%" stopColor="#64748b" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Slogan */}
          <div>
            <h3 className="text-xl font-bold text-white leading-tight">
              Intelligent PDF Workspace
            </h3>
            <p className="text-slate-400 text-xs mt-2 max-w-[320px] font-medium leading-relaxed">
              Combine, split, compress, watermark and process documents inside a fully encrypted client workspace.
            </p>
          </div>
        </div>

        {/* Right Side: Form Panel */}
        <div className="w-full md:w-[460px] bg-slate-900/60 backdrop-blur-md p-8 md:p-12 flex flex-col justify-between">
          <div className="my-auto space-y-6">
            <div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Welcome back
              </h2>
              <p className="text-slate-400 text-xs mt-1.5 font-medium">
                Log in to sync search archives & download protected files.
              </p>
            </div>

            {/* Notification and warning banners */}
            {verifiedBanner && (
              <div className="flex items-start gap-2.5 bg-emerald-58 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs p-3.5 rounded-2xl">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Verification successful! You can now log in below.</span>
              </div>
            )}
            {verifyInvalid && (
              <div className="flex items-start gap-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3.5 rounded-2xl">
                <HelpCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>Link is invalid. Re-check the address or click Resend.</span>
              </div>
            )}
            {verifyExpired && (
              <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-350 text-amber-300 text-xs p-3.5 rounded-2xl">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>Confirmation link expired. Please click below to resend.</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-black text-slate-300 uppercase tracking-widest mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-slate-950/45 border border-white/[0.08] hover:border-white/[0.15] focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl pl-10.5 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="password" className="block text-xs font-black text-slate-300 uppercase tracking-widest">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/45 border border-white/[0.08] hover:border-white/[0.15] focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl pl-10 px-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                  />
                </div>
              </div>

              {error && (
                <p className="text-rose-400 text-xs font-semibold bg-rose-500/10 border border-rose-500/15 p-3 rounded-xl">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-extrabold text-xs py-3 rounded-xl auto-scale-[0.98] shadow shadow-orange-500/10 hover:shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{loading ? "Logging you in..." : "Log in to MeriPDF"}</span>
                {!loading && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </form>

            <div className="text-[11px] text-slate-400 leading-relaxed border-t border-white/[0.05] pt-4.5 pt-4">
              <span>Didn&apos;t get the verification mail or link expired? </span>
              <button
                type="button"
                onClick={resend}
                disabled={resendLoading}
                className="text-orange-400 font-extrabold hover:underline disabled:opacity-50 cursor-pointer"
              >
                Resend link
              </button>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-slate-400 border-t border-white/[0.05] pt-4">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-orange-400 hover:underline font-extrabold">
              Create one
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-bold">
          Loading auth workspace…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
