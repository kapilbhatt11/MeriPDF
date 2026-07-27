"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPDFAnalyticsSummary, PDFLog } from "@/lib/analytics";
import { 
  TrendingUp, 
  TrendingDown, 
  FileText, 
  Layers, 
  History, 
  Sparkles, 
  DollarSign, 
  ChevronRight, 
  PiggyBank,
  CheckCircle2
} from "lucide-react";

export default function AnalyticsPage() {
  const [stats, setStats] = useState({
    totalOps: 0,
    totalPages: 0,
    totalSavings: 0,
    history: [] as PDFLog[]
  });
  const [activeTab, setActiveTab] = useState<"all" | "high-value">("all");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("docintel_token") : null;
    if (!token) {
      setStats({
        totalOps: 0,
        totalPages: 0,
        totalSavings: 0,
        history: []
      });
    } else {
      const summary = getPDFAnalyticsSummary();
      setStats(summary);
    }
  }, []);

  // Compute tool usage percentages
  const toolCounts = stats.history.reduce((acc, item) => {
    acc[item.toolName] = (acc[item.toolName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedTools = Object.entries(toolCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const getToolColor = (name: string) => {
    switch (name.toLowerCase()) {
      case "merge pdf": return "bg-purple-500";
      case "split pdf": return "bg-blue-500";
      case "compress pdf": return "bg-green-500";
      case "organize pdf": return "bg-orange-500";
      default: return "bg-indigo-500";
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* Premium Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 py-12 px-6 shadow-md">
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full filter blur-3xl translate-x-1/3 -translate-y-1/3"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full filter blur-3xl -translate-x-1/3 translate-y-1/3"></div>
        
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-bold text-orange-400 mb-4">
            <Sparkles className="w-3.5 h-3.5" /> Direct Value Dashboard
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            Analytics & Savings Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-2 max-w-xl">
            Track your client-side operations history, view pages processed, and visualize estimated costs saved using DocIntel free utilities.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 -mt-6 relative z-20">
        
        {/* Core Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Total Savings */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-50 rounded-full mix-blend-multiply filter blur-xl opacity-70 group-hover:scale-110 transition-transform duration-300"></div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest">Total Savings Value</p>
                <h3 className="text-3xl font-black text-slate-900 mt-2">
                  ₹{stats.totalSavings.toLocaleString("en-IN")}
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-green-50 border border-green-100 text-green-600">
                <PiggyBank className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-green-700 font-semibold mt-4">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Saved vs. premium Acrobat APIs</span>
            </div>
          </div>

          {/* Card 2: PDFs Processed */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-50 rounded-full mix-blend-multiply filter blur-xl opacity-70 group-hover:scale-110 transition-transform duration-300"></div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest">Total PDF Operations</p>
                <h3 className="text-3xl font-black text-slate-900 mt-2">
                  {stats.totalOps} <span className="text-sm font-semibold text-slate-400">actions</span>
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-purple-600">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-purple-700 font-semibold mt-4">
              <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
              <span>Processed locally on client side</span>
            </div>
          </div>

          {/* Card 3: Pages Managed */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full mix-blend-multiply filter blur-xl opacity-70 group-hover:scale-110 transition-transform duration-300"></div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest">Total Pages Compiled</p>
                <h3 className="text-3xl font-black text-slate-900 mt-2">
                  {stats.totalPages} <span className="text-sm font-semibold text-slate-400">sheets</span>
                </h3>
              </div>
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-100 text-orange-600">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-orange-700 font-semibold mt-4">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Estimated ₹5 value per sheet</span>
            </div>
          </div>
        </div>

        {/* Dashboard Grid Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          
          {/* Timeline History Logs */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-slate-700" />
                <h2 className="text-lg font-bold text-slate-900">Recent PDF Operations</h2>
              </div>
              
              <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold">
                <button 
                  onClick={() => setActiveTab("all")} 
                  className={`px-3 py-1 rounded-md transition ${activeTab === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-550 hover:text-slate-800"}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setActiveTab("high-value")} 
                  className={`px-3 py-1 rounded-md transition ${activeTab === "high-value" ? "bg-white text-slate-900 shadow-sm" : "text-slate-550 hover:text-slate-800"}`}
                >
                  High Value (₹25+)
                </button>
              </div>
            </div>

            {stats.history.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-350 mb-4">
                  <FileText className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800">No Operations Recorded</h3>
                <p className="text-xs text-slate-450 text-slate-400 mt-1 max-w-[260px] mx-auto leading-normal">
                  Try organizing, merging, watermarking, or editing a PDF first to log metrics.
                </p>
                <Link href="/" className="inline-block mt-5 text-xs font-bold bg-indigo-600 text-white px-5 py-2.5 rounded-xl shadow hover:bg-indigo-700 hover:shadow-md transition">
                  Convert a PDF Now
                </Link>
              </div>
            ) : (
              <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
                {stats.history
                  .filter(item => activeTab === "all" || item.savings >= 25)
                  .map((item) => (
                    <div 
                      key={item.id}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white ${getToolColor(item.toolName)}`}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800 group-hover:text-indigo-650 transition-colors">
                            {item.toolName}
                          </h4>
                          <span className="text-[10px] font-semibold text-slate-400 mt-0.5 block">
                            {new Date(item.timestamp).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 border-slate-50 pt-2 sm:pt-0">
                        <div className="text-left sm:text-right">
                          <span className="text-xs text-slate-450 text-slate-400 font-bold uppercase tracking-wider block">Scope</span>
                          <span className="text-sm font-bold text-slate-800 block mt-0.5">{item.pagesCount} sheets</span>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-green-600 font-extrabold uppercase tracking-widest block">Value Saved</span>
                          <span className="text-sm font-black text-green-700 block mt-0.5">+₹{item.savings}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Right Side: Tool breakdown & Premium Stats */}
          <div className="space-y-6">
            
            {/* Tool Breakdown Chart */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">
                Usage Share By Tool
              </h3>
              
              {sortedTools.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6 leading-relaxed">
                  Start processing files. We will display a structural breakdown of your most popular utilities here.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {sortedTools.map(({ name, count }) => {
                    const percentage = Math.round((count / stats.totalOps) * 100);
                    return (
                      <div key={name} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-700">
                          <span>{name}</span>
                          <span className="text-slate-400">{count}x ({percentage}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${getToolColor(name)}`} 
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Savings Calculator Info Box */}
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 text-white shadow-md relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full mix-blend-overlay -translate-y-1/3 translate-x-1/3"></div>
              <h3 className="text-base font-black flex items-center gap-1.5 text-white">
                <Sparkles className="w-5 h-5 animate-pulse" /> Upgrade to Unlimited
              </h3>
              <p className="text-white/80 text-xs font-medium mt-3 leading-relaxed">
                Enjoyed saving with DocIntel? Unlock unlimited single conversions, custom compression sliders, and faster server compiles.
              </p>
              <Link 
                href="/pricing"
                className="inline-flex mt-5 bg-white text-orange-600 font-extrabold text-xs px-4 py-2.5 rounded-xl shadow hover:bg-slate-50 transition items-center gap-1"
              >
                View Premium Pricing <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
