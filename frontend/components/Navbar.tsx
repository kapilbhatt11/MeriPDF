"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, getToken, fetchWithAuth } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";
import { toast } from "react-hot-toast";
import { 
  Layers, 
  Scissors, 
  FileDown, 
  Lock, 
  Unlock, 
  Bookmark, 
  Image as ImageIcon, 
  FileText, 
  ChevronDown, 
  ChevronRight,
  LogOut, 
  Sparkles,
  Menu,
  X,
  User
} from "lucide-react";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userLabel, setUserLabel] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(null);
  const [savings, setSavings] = useState<number>(0);

  const updateSavings = () => {
    try {
      const token = getToken();
      if (!token) {
        setSavings(0);
        return;
      }
      const listRaw = localStorage.getItem("docintel_analytics_history");
      const list = listRaw ? JSON.parse(listRaw) : [];
      const total = list.reduce((acc: number, curr: any) => acc + (curr.savings || 0), 0);
      setSavings(total);
    } catch {
      setSavings(0);
    }
  };

  // Global Network Quota Interceptor
  useEffect(() => {
    if (typeof window === "undefined") return;

    const getToolNameFromUrl = (url: string): string => {
      const lower = url.toLowerCase();
      if (lower.includes("/merge")) return "Merge PDF";
      if (lower.includes("/split")) return "Split PDF";
      if (lower.includes("/compress")) return "Compress PDF";
      if (lower.includes("/repair")) return "Repair PDF";
      if (lower.includes("/rotate")) return "Rotate PDF";
      if (lower.includes("/remove")) return "Remove Pages";
      if (lower.includes("/extract")) return "Extract Pages";
      if (lower.includes("/organize")) return "Organize PDF";
      if (lower.includes("/watermark")) return "Watermark PDF";
      if (lower.includes("/page-number") || lower.includes("/number")) return "Page Numbers";
      if (lower.includes("/protect") || lower.includes("/encrypt")) return "Protect PDF";
      if (lower.includes("/unlock") || lower.includes("/decrypt")) return "Unlock PDF";
      if (lower.includes("/sign")) return "Sign PDF";
      if (lower.includes("/ocr") || lower.includes("/scan")) return "OCR Scan PDF";
      if (lower.includes("/crop")) return "Crop PDF";
      if (lower.includes("/compare")) return "Compare PDF";
      return "PDF Action";
    };

    const processInterceptSuccess = (url: string) => {
      window.dispatchEvent(new Event("pdf-activity-completed"));
      
      const lower = url.toLowerCase();
      const isManuallyLogged = 
        lower.includes("/merge") ||
        lower.includes("/split") ||
        lower.includes("/compress") ||
        lower.includes("/repair") ||
        lower.includes("/organize") ||
        lower.includes("/scan") ||
        lower.includes("/upload");

      if (isManuallyLogged) return;

      setTimeout(() => {
        const lastLogged = (window as any).__last_logged_at || 0;
        if (Date.now() - lastLogged > 500) {
          const toolName = getToolNameFromUrl(url);
          logPDFOperation(toolName, 1);
        }
      }, 150);
    };

    // 1) Intercept window.fetch
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : (args[0] instanceof URL ? args[0].href : "");
        const init = args[1];
        if (
          response.ok &&
          init &&
          String(init.method).toUpperCase() === "POST" &&
          (url.includes("/pdf/") || url.includes("/split/") || url.includes("/compress/") || url.includes("/watermark/"))
        ) {
          processInterceptSuccess(url);
        }
      } catch (err) {
        // ignore
      }
      return response;
    };

    // 2) Intercept XMLHttpRequest (Axios)
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(...args) {
      const self = this;
      this.addEventListener("readystatechange", function() {
        if (self.readyState === 4 && self.status >= 200 && self.status < 300) {
          const url = self.responseURL;
          if (
            url &&
            (url.includes("/pdf/") || url.includes("/split/") || url.includes("/compress/") || url.includes("/watermark/"))
          ) {
            processInterceptSuccess(url);
          }
        }
      }, false);
      return originalSend.apply(this, args);
    };
  }, []);

  const fetchQuota = () => {
    fetchWithAuth(api("/billing/pdf-quota"))
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        setQuota({
          limit: data.limit,
          used: data.used,
          remaining: data.remaining,
        });
      })
      .catch(() => {
        // Guest fallback
        fetch(api("/billing/pdf-quota"))
          .then((res) => res.json())
          .then((data) => {
            setQuota({
              limit: data.limit,
              used: data.used,
              remaining: data.remaining,
            });
          })
          .catch(() => setQuota(null));
      });
  };

  useEffect(() => {
    fetchQuota();
    updateSavings();
    const handleActivity = () => {
      fetchQuota();
      updateSavings();
    };
    window.addEventListener("pdf-activity-completed", handleActivity);
    return () => {
      window.removeEventListener("pdf-activity-completed", handleActivity);
    };
  }, [userLabel, pathname]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUserLabel(null);
      setUserAvatar(null);
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    fetchWithAuth(api("/auth/me"))
      .then((res) => {
        if (!res.ok) throw new Error("unauthorized");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          const label =
            (data.full_name && String(data.full_name).trim()) || data.email || null;
          setUserLabel(label);
          setUserAvatar(data.avatar_url || null);
          setIsAdmin(!!data.is_admin);

          // Birthday check trigger
          if (data.date_of_birth) {
            try {
              const dobParts = String(data.date_of_birth).split("-");
              if (dobParts.length === 3) {
                const dobMonth = parseInt(dobParts[1], 10);
                const dobDay = parseInt(dobParts[2], 10);
                
                const today = new Date();
                const todayMonth = today.getMonth() + 1; // 1-indexed
                const todayDay = today.getDate();

                if (dobMonth === todayMonth && dobDay === todayDay) {
                  const localSessionKey = `birthday_wish_${data.id}_${today.getFullYear()}`;
                  const alreadyWished = sessionStorage.getItem(localSessionKey);
                  
                  if (!alreadyWished) {
                    toast((t) => (
                      <div className="flex flex-col gap-1 text-slate-800">
                        <span className="font-extrabold text-sm flex items-center gap-1.5 text-indigo-900">
                          🥳 Happy Birthday, {data.full_name || 'User'}! 🎂🎉
                        </span>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                          Wishing you an amazing day ahead from the MeriPDF family. Enjoy your premium tools today! 🎁✨
                        </p>
                      </div>
                    ), {
                      duration: 9000,
                      icon: "🎁",
                      position: "top-center",
                      style: {
                        background: '#ffffff',
                        border: '1.5px solid #e0e7ff',
                        padding: '16px',
                        borderRadius: '1.25rem',
                        boxShadow: '0 20px 25px -5px rgba(99, 102, 241, 0.1), 0 8px 10px -6px rgba(99, 102, 241, 0.1)',
                      }
                    });
                    sessionStorage.setItem(localSessionKey, "true");
                  }
                }
              }
            } catch (e) {
              console.warn("Error parsing birthday:", e);
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUserLabel(null);
          setUserAvatar(null);
          setIsAdmin(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Close menus on path transition
  useEffect(() => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  function logout() {
    clearToken();
    setUserLabel(null);
    setUserAvatar(null);
    setIsAdmin(false);
    try {
      localStorage.removeItem("docintel_analytics_history");
    } catch {}
    router.push("/");
    router.refresh();
  }

  const toolLinks = [
    { name: "Merge PDF", desc: "Combine multiple PDF sheets", href: "/merge-pdf", icon: Layers, color: "text-purple-600 bg-purple-50 border-purple-100" },
    { name: "Split PDF", desc: "Separate page intervals", href: "/split-pdf", icon: Scissors, color: "text-blue-600 bg-blue-50 border-blue-105" },
    { name: "Compress PDF", desc: "Shrink sizing with ease", href: "/compress", icon: FileDown, color: "text-green-600 bg-green-50 border-green-105" },
    { name: "Lock PDF", desc: "Secure files with passwords", href: "/protect-pdf", icon: Lock, color: "text-rose-600 bg-rose-50 border-rose-105" },
    { name: "Unlock PDF", desc: "Decrypt password PDFs", href: "/unlock-pdf", icon: Unlock, color: "text-red-600 bg-red-50 border-red-105" },
    { name: "Watermark", desc: "Stamp banners over files", href: "/watermark-pdf", icon: Bookmark, color: "text-amber-600 bg-amber-50 border-amber-105" },
    { name: "Image to PDF", desc: "Rebuild images as PDF", href: "/image-to-pdf", icon: ImageIcon, color: "text-indigo-600 bg-indigo-50 border-indigo-105" },
    { name: "Word to PDF", desc: "Translate DOC to PDF doc", href: "/word-to-pdf", icon: FileText, color: "text-cyan-600 bg-cyan-50 border-cyan-105" },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-600 shadow-sm shadow-orange-500/10 group-hover:scale-105 transition-transform duration-300">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <span className="text-xl font-black tracking-tight text-slate-900 group-hover:text-orange-650 transition-colors">
            Meri<span className="text-orange-600">PDF</span>
          </span>
        </Link>

        {/* Desktop Main Links */}
        <div className="hidden md:flex items-center gap-1.55 gap-1.5">
          <Link href="/" className="text-xs font-bold text-slate-600 hover:text-orange-650 hover:bg-orange-50 px-3 py-2 rounded-xl transition-all">
            Home
          </Link>
          <Link href="/upload" className="text-xs font-bold text-slate-600 hover:text-orange-650 hover:bg-orange-50 px-3 py-2 rounded-xl transition-all">
            Upload
          </Link>
          <Link href="/documents" className="text-xs font-bold text-slate-600 hover:text-orange-650 hover:bg-orange-50 px-3 py-2 rounded-xl transition-all">
            Documents
          </Link>
          <Link href="/analytics" className="text-xs font-bold text-slate-605 text-slate-600 hover:text-orange-650 hover:bg-orange-50 px-3 py-2 rounded-xl transition-all">
            Analytics & Savings
          </Link>
          
          {/* Custom Hoverable Tools Dropdown */}
          <div 
            className="relative"
            onMouseEnter={() => setDropdownOpen(true)}
            onMouseLeave={() => setDropdownOpen(false)}
          >
            <button 
              type="button" 
              suppressHydrationWarning={true}
              className={`text-xs font-bold px-3 py-2 rounded-xl transition-all flex items-center gap-1 cursor-pointer ${
                dropdownOpen ? "bg-orange-55 bg-orange-50 text-orange-600" : "text-slate-600 hover:text-orange-650 hover:bg-orange-50"
              }`}
            >
              PDF Tools 
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-250 ${dropdownOpen ? "rotate-180 text-orange-600" : "text-slate-400"}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-[460px] z-50 pt-1 animate-in fade-in slide-in-from-top-3 duration-250">
                <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl p-4 grid grid-cols-2 gap-2 backdrop-blur-lg">
                  {toolLinks.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Link 
                        key={tool.href}
                        href={tool.href}
                        className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-orange-50/40 border border-transparent hover:border-orange-100/50 transition-all group"
                      >
                        <div className={`p-2 rounded-lg border shrink-0 ${tool.color} group-hover:scale-105 transition-all`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 group-hover:text-orange-600 transition-colors">{tool.name}</p>
                          <p className="text-[10px] text-slate-550 text-slate-500 font-semibold mt-0.5 leading-tight">{tool.desc}</p>
                        </div>
                      </Link>
                    );
                  })}
                  <div className="col-span-2 border-t border-slate-100 mt-2 pt-2 flex justify-between items-center px-1">
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">SECURE PDF SUITE</span>
                    <Link href="/" className="text-[10px] font-bold text-orange-655 text-orange-600 hover:text-orange-705 hover:underline flex items-center gap-1">
                      View all utilities →
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Link href="/pricing" className="text-xs font-bold text-slate-600 hover:text-orange-655 hover:bg-orange-50 px-3 py-2 rounded-xl transition-all">
            Pricing
          </Link>
          <Link href="/privacy" className="text-xs font-bold text-slate-600 hover:text-orange-655 hover:bg-orange-50 px-3 py-2 rounded-xl transition-all">
            Policies
          </Link>
        </div>

        {/* Right Side Controls */}
        <div className="hidden md:flex items-center gap-4">
          {quota && (
            <Link 
              href="/analytics" 
              className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100/90 px-3 py-1.5 rounded-2xl border border-emerald-200 transition-all text-xs font-semibold select-none group"
              title="Click to view details in your Savings Dashboard!"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="text-emerald-800 font-bold shrink-0">
                Saved: ₹{savings}
              </span>
            </Link>
          )}

          {isAdmin && (
            <Link 
              href="/admin" 
              className="text-[10px] uppercase tracking-wider font-extrabold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-600 hover:text-white px-3 py-1.5 rounded-lg transition-all"
            >
              Admin Dashboard
            </Link>
          )}

          {userLabel ? (
            <div className="flex items-center gap-3">
              <Link href="/profile" className="flex items-center gap-2 hover:bg-orange-50 hover:border-orange-200 bg-slate-50 border border-slate-205 px-3 py-1.5 rounded-2xl transition">
                {userAvatar ? (
                  <img src={userAvatar} alt="Profile" className="w-5.5 h-5.5 rounded-full object-cover border border-white" />
                ) : (
                  <div className="w-5.5 h-5.5 rounded-full bg-orange-600 text-white flex items-center justify-center font-black text-[10px]">
                    {userLabel.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[11px] font-black text-slate-800 max-w-[100px] truncate">
                  {userLabel}
                </span>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-orange-600 hover:bg-orange-50 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 animate-pulse" />
                <span>Log out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-xs font-bold text-slate-600 hover:text-orange-655 transition px-2.5 py-1.5">
                Log in
              </Link>
              <Link
                href="/signup"
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow auto-scale-[0.98] transition-all"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu toggle */}
        <div className="flex md:hidden items-center gap-3">
          {quota && (
            <Link 
              href="/analytics" 
              className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200 text-[10px] font-extrabold text-emerald-800 group"
            >
              <Sparkles className="w-3 h-3 text-emerald-600" />
              <span>Saved: ₹{savings}</span>
            </Link>
          )}
          {userLabel && (
            <Link href="/profile" className="w-7 h-7 rounded-full bg-orange-600 text-white flex items-center justify-center font-black text-xs shrink-0">
              {userLabel.charAt(0).toUpperCase()}
            </Link>
          )}
          <button 
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-slate-650 hover:text-orange-600 bg-slate-50 border border-slate-200 p-2 rounded-xl hover:bg-orange-50 hover:border-orange-200"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Drawer menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white p-6 flex flex-col gap-6 animate-in slide-in-from-top duration-250 select-none">
          <div className="flex flex-col gap-4">
            <span className="text-[9px] text-slate-405 text-slate-400 uppercase tracking-widest font-black">Main Navigator</span>
            <Link href="/" className="text-sm font-bold text-slate-700 hover:text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-all">Home</Link>
            <Link href="/upload" className="text-sm font-bold text-slate-700 hover:text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-all">Upload Documents</Link>
            <Link href="/documents" className="text-sm font-bold text-slate-700 hover:text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-all">My Workspace</Link>
            <Link href="/analytics" className="text-sm font-bold text-slate-705 text-slate-700 hover:text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-all">Analytics & Savings</Link>
            <Link href="/pricing" className="text-sm font-bold text-slate-705 text-slate-700 hover:text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-all font-extrabold flex items-center gap-1.5">
              Pricing Plans <span className="bg-amber-100 text-amber-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-amber-200 animate-pulse">PRO</span>
            </Link>
            <Link href="/privacy" className="text-sm font-bold text-slate-705 text-slate-700 hover:text-orange-600 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-all">
              Privacy & Policies
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            <span className="text-[9px] text-slate-405 text-slate-400 uppercase tracking-widest font-black">Quick Tool Utilities</span>
            <div className="grid grid-cols-2 gap-2">
              {toolLinks.map((tool) => (
                <Link 
                  key={tool.href} 
                  href={tool.href} 
                  className="bg-slate-50 border border-slate-150 p-2.5 rounded-xl text-center text-xs font-bold text-slate-700 hover:text-orange-600 hover:bg-orange-50 hover:border-orange-200 transition-all"
                >
                  {tool.name}
                </Link>
              ))}
            </div>
          </div>

          {quota && (
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white space-y-2 relative overflow-hidden shadow-md">
              <div className="absolute right-0 bottom-0 translate-x-2 translate-y-2 opacity-15">
                <Sparkles className="w-24 h-24 text-white" />
              </div>
              <div className="relative z-10 flex justify-between items-center text-xs font-black">
                <span className="flex items-center gap-1.5 uppercase tracking-wider text-[10px] text-emerald-100">
                  Savings Engine
                </span>
                <span className="bg-white/20 px-2.5 py-0.5 rounded-lg border border-white/10 text-[10px] font-bold">
                  ₹{savings} Saved
                </span>
              </div>
              <p className="relative z-10 text-[10px] text-emerald-50 leading-relaxed font-semibold">
                You've successfully saved **₹{savings}** and manual processing hours compared to standard commercial alternatives.
              </p>
              <Link 
                href="/analytics" 
                className="relative z-10 block text-center bg-white text-emerald-800 font-bold text-[10px] py-1.5 rounded-xl shadow-sm hover:bg-emerald-50 transition"
              >
                Open Savings Dashboard
              </Link>
            </div>
          )}

          {/* Account status */}
          <div className="border-t border-slate-150 pt-6">
            {isAdmin && (
              <Link 
                href="/admin" 
                className="w-full block text-center text-xs font-bold bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-600 hover:bg-orange-500 hover:text-white py-3 rounded-xl mb-4 transition"
              >
                Admin Panel Dashboard
              </Link>
            )}

            {userLabel ? (
              <div className="space-y-3">
                <Link href="/profile" className="block">
                  <div className="bg-slate-50 hover:bg-orange-50 hover:border-orange-200 p-3 rounded-2xl border border-slate-150 flex items-center justify-between transition-all duration-200 group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {userLabel.charAt(0).toUpperCase()}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-850 group-hover:text-orange-655 text-slate-800 truncate">{userLabel}</p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">Manage Account Details</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition" />
                  </div>
                </Link>
                <button
                  onClick={logout}
                  className="w-full bg-slate-50 border border-slate-150 text-slate-600 hover:text-orange-600 hover:bg-orange-50 py-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" /> Log Out
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <Link href="/login" className="flex-1 text-center py-3 border border-slate-205 hover:bg-orange-50/50 text-slate-700 text-xs font-bold rounded-xl transition">
                  Log In
                </Link>
                <Link href="/signup" className="flex-1 text-center py-3 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition">
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
