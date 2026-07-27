"use client";
import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import { 
  UploadCloud, FileText, ChevronLeft, ChevronRight, Eye, 
  ShieldAlert, Sparkles, Loader2, RefreshCw, X, ZoomIn, 
  ZoomOut, CheckCircle2, Columns, ArrowRight, Settings, Info
} from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";
import { motion, AnimatePresence } from "framer-motion";

interface TextDiffBlock {
  type: "equal" | "added" | "deleted";
  text: string;
}

interface ComparePageData {
  pageNumber: number;
  hasChanges: boolean;
  onlyInA: boolean;
  onlyInB: boolean;
  imageA: string;
  imageB: string;
  imageDiff: string;
  textDiff: TextDiffBlock[];
  changesCount: number;
}

interface CompareResponse {
  status: string;
  totalPagesA: number;
  totalPagesB: number;
  modifiedPagesCount: number;
  totalChangesCount: number;
  pages: ComparePageData[];
}

export default function ComparePDFPage() {
  const [mounted, setMounted] = useState(false);
  
  // File A (Original) and File B (Modified)
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  
  const fileInputRefA = useRef<HTMLInputElement>(null);
  const fileInputRefB = useRef<HTMLInputElement>(null);
  
  // App States
  const [comparing, setComparing] = useState(false);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(1.0);
  const [mode, setMode] = useState<"visual" | "text">("visual"); // visual vs textual diff
  const [visualViewType, setVisualViewType] = useState<"side" | "diff">("diff"); // side-by-side vs red diff overlay
  const [filterChangedOnly, setFilterChangedOnly] = useState<boolean>(false);
  
  // UI Helpers
  const [draggingA, setDraggingA] = useState(false);
  const [draggingB, setDraggingB] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Handle file picker click
  const triggerFileA = () => fileInputRefA.current?.click();
  const triggerFileB = () => fileInputRefB.current?.click();

  // File Change Handlers
  const handleFileChangeA = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileA(e.target.files[0]);
    }
  };
  const handleFileChangeB = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFileB(e.target.files[0]);
    }
  };

  // Drag and Drop handlers for File A
  const onDragOverA = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingA(true);
  };
  const onDragLeaveA = () => setDraggingA(false);
  const onDropA = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingA(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFileA(e.dataTransfer.files[0]);
    }
  };

  // Drag and Drop handlers for File B
  const onDragOverB = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingB(true);
  };
  const onDragLeaveB = () => setDraggingB(false);
  const onDropB = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingB(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFileB(e.dataTransfer.files[0]);
    }
  };

  const clearFiles = () => {
    setFileA(null);
    setFileB(null);
    setResult(null);
    setPageNum(1);
  };

  // Submit and compare PDFs
  const startComparison = async () => {
    if (!fileA || !fileB) return;
    setComparing(true);
    
    const formData = new FormData();
    formData.append("file_a", fileA);
    formData.append("file_b", fileB);

    try {
      const response = await axios.post<CompareResponse>(
        "http://localhost:8000/pdf/compare", 
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            ...optionalAuthHeaders(),
          }
        }
      );
      setResult(response.data);
      logPDFOperation("Compare PDF", 2);
      // Automatically find the first page with changes to show the user
      const firstChangedPage = response.data.pages.find(p => p.hasChanges);
      if (firstChangedPage) {
        setPageNum(firstChangedPage.pageNumber);
      } else {
        setPageNum(1);
      }
    } catch (e: any) {
      console.error(e);
      alert(e.response?.data?.detail || "An error occurred while comparing the documents.");
    } finally {
      setComparing(false);
    }
  };

  // Navigation Logic
  const getFilteredPages = () => {
    if (!result) return [];
    if (!filterChangedOnly) return result.pages;
    return result.pages.filter(p => p.hasChanges);
  };

  const filteredPagesList = getFilteredPages();
  const currentPageData = result?.pages.find(p => p.pageNumber === pageNum);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Dynamic Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-900 to-slate-950 pointer-events-none z-0" />
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-slate-800 pointer-events-none z-0" />

      {/* Main Container */}
      <div className="flex-1 max-w-[1700px] w-full mx-auto px-4 md:px-8 py-6 relative z-10 flex flex-col">
        
        {/* Workspace Title & Stats Banner */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 mt-2">
          <div className="text-left">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-500/10 text-blue-400 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full border border-blue-500/20">
                PRO MODULE
              </span>
              <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-slate-700">
                Beta v1.0
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white leading-none tracking-tight flex items-center gap-2.5">
              Compare PDF Documents <Sparkles className="text-blue-400 animate-pulse" size={24} />
            </h1>
            <p className="text-slate-400 text-sm font-semibold mt-2.5 leading-relaxed">
              Analyze revision differences visually and textually side-by-side with high-precision metrics.
            </p>
          </div>

          {result && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-4 bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl shadow-xl backdrop-blur-md"
            >
              <div className="text-left px-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Document Comparison Stats</span>
                </div>
                <div className="flex items-center gap-6 mt-1.5">
                  <div>
                    <span className="text-slate-500 text-[10px] font-bold block leading-none">Modified Pages</span>
                    <span className="font-mono text-xl font-bold text-blue-400 mt-1 block">{result.modifiedPagesCount} / {result.pages.length}</span>
                  </div>
                  <div className="w-[1px] h-8 bg-slate-700" />
                  <div>
                    <span className="text-slate-500 text-[10px] font-bold block leading-none">Total Edit Points</span>
                    <span className="font-mono text-xl font-bold text-rose-400 mt-1 block">{result.totalChangesCount}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={clearFiles}
                className="bg-slate-750 hover:bg-slate-700 text-slate-300 hover:text-white p-2.5 rounded-xl border border-slate-700/50 transition self-center"
                title="Reset Workspace"
              >
                <RefreshCw size={16} />
              </button>
            </motion.div>
          )}
        </header>

        {/* Action Space */}
        <div className="flex-1 w-full flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            {!result ? (
              // ---------------- FILE UPLOAD SYSTEM ----------------
              <motion.div 
                key="upload-pane"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="flex-1 w-full max-w-4xl mx-auto flex flex-col justify-center min-h-[460px] py-12"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  {/* File Dropzone A */}
                  <div 
                    onDragOver={onDragOverA}
                    onDragLeave={onDragLeaveA}
                    onDrop={onDropA}
                    onClick={triggerFileA}
                    className={`h-[280px] rounded-3xl border-2 border-dashed flex flex-col justify-center items-center p-8 transition cursor-pointer relative overflow-hidden group ${
                      draggingA 
                        ? "border-blue-400 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                        : fileA 
                        ? "border-emerald-500/50 bg-emerald-500/5" 
                        : "border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/60"
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRefA} 
                      onChange={handleFileChangeA} 
                      className="hidden" 
                      accept=".pdf" 
                    />
                    {fileA ? (
                      <div className="space-y-4 text-center">
                        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-inner group-hover:scale-105 transition">
                          <FileText size={32} />
                        </div>
                        <div>
                          <p className="text-white text-sm font-black truncate max-w-[240px] mx-auto">{fileA.name}</p>
                          <p className="text-slate-400 text-xs font-semibold mt-1">{(fileA.size/1024/1024).toFixed(2)} MB</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setFileA(null); }}
                          className="bg-rose-500/15 border border-rose-500/20 text-rose-400 hover:bg-rose-500/25 hover:text-rose-300 py-1.5 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto"
                        >
                          <X size={12} /> Remove
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-center">
                        <div className="bg-slate-700/50 text-blue-400 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg group-hover:-translate-y-1 transition-transform">
                          <UploadCloud size={30} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-200">Upload Original PDF</p>
                          <p className="text-xs font-semibold text-slate-400 mt-1 max-w-[180px] mx-auto leading-relaxed">Drag file here or browse device directories</p>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-800/85 py-1 px-3.5 rounded-full border border-slate-705">
                          Document A
                        </span>
                      </div>
                    )}
                  </div>

                  {/* File Dropzone B */}
                  <div 
                    onDragOver={onDragOverB}
                    onDragLeave={onDragLeaveB}
                    onDrop={onDropB}
                    onClick={triggerFileB}
                    className={`h-[280px] rounded-3xl border-2 border-dashed flex flex-col justify-center items-center p-8 transition cursor-pointer relative overflow-hidden group ${
                      draggingB 
                        ? "border-blue-400 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.15)]" 
                        : fileB 
                        ? "border-emerald-500/50 bg-emerald-500/5" 
                        : "border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/60"
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRefB} 
                      onChange={handleFileChangeB} 
                      className="hidden" 
                      accept=".pdf" 
                    />
                    {fileB ? (
                      <div className="space-y-4 text-center">
                        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-inner group-hover:scale-105 transition">
                          <FileText size={32} />
                        </div>
                        <div>
                          <p className="text-white text-sm font-black truncate max-w-[240px] mx-auto">{fileB.name}</p>
                          <p className="text-slate-400 text-xs font-semibold mt-1">{(fileB.size/1024/1024).toFixed(2)} MB</p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setFileB(null); }}
                          className="bg-rose-500/15 border border-rose-500/20 text-rose-400 hover:bg-rose-500/25 hover:text-rose-300 py-1.5 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 mx-auto"
                        >
                          <X size={12} /> Remove
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-center">
                        <div className="bg-slate-700/50 text-blue-400 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg group-hover:-translate-y-1 transition-transform">
                          <UploadCloud size={30} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-200">Upload Modified PDF</p>
                          <p className="text-xs font-semibold text-slate-400 mt-1 max-w-[180px] mx-auto leading-relaxed">Drag file here or browse device directories</p>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-800/85 py-1 px-3.5 rounded-full border border-slate-705">
                          Document B
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={startComparison}
                    disabled={!fileA || !fileB || comparing}
                    className="w-full max-w-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-base py-4 rounded-2xl shadow-xl transition hover:scale-103 active:scale-97 disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center gap-3 border border-blue-400/25"
                  >
                    {comparing ? (
                      <>
                        <Loader2 className="animate-spin" size={20} /> Comparing Documents...
                      </>
                    ) : (
                      <>
                        Compare Documents <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <p className="flex items-center gap-2 text-slate-500 text-xs font-semibold mt-1">
                    <Info size={14} /> Compare textual changes and layout shifts simultaneously. No files are saved to server.
                  </p>
                </div>
              </motion.div>
            ) : (
              // ---------------- COMPARISON WORKSPACE ----------------
              <motion.div 
                key="workspace-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-grow w-full flex flex-col md:flex-row gap-6 min-h-0"
              >
                {/* 1. Left Sidebar: Page Selection Navigation */}
                <div className="w-full md:w-[280px] flex flex-col bg-slate-800 border border-slate-700 p-4 rounded-2xl min-h-[300px] max-h-screen md:max-h-none overflow-y-auto">
                  <div className="flex items-center justify-between gap-4 mb-4 pb-2 border-b border-slate-800">
                    <h3 className="text-xs font-black tracking-widest uppercase text-slate-400">Pages List</h3>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-bold text-slate-500 mr-1 select-none">Changes Only</label>
                      <input 
                        type="checkbox" 
                        checked={filterChangedOnly}
                        onChange={(e) => setFilterChangedOnly(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {filteredPagesList.length === 0 ? (
                      <div className="text-slate-550 text-xs font-semibold py-12 text-center flex flex-col items-center justify-center gap-2">
                        <CheckCircle2 size={24} className="text-slate-600" />
                        No changed pages observed.
                      </div>
                    ) : (
                      filteredPagesList.map((p) => {
                        const isSelected = pageNum === p.pageNumber;
                        return (
                          <div
                            key={p.pageNumber}
                            onClick={() => setPageNum(p.pageNumber)}
                            className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer select-none text-left ${
                              isSelected
                                ? "bg-blue-600/10 border-blue-550/50 text-blue-400"
                                : "bg-slate-800/50 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] w-6 h-6 rounded-lg flex items-center justify-center font-bold font-mono ${
                                isSelected ? "bg-blue-500/20 text-blue-300" : "bg-slate-800 text-slate-500"
                              }`}>
                                {p.pageNumber}
                              </span>
                              <div className="leading-none">
                                <p className="text-xs font-bold">Page {p.pageNumber}</p>
                                <p className="text-[9px] text-slate-500 font-semibold mt-0.5">
                                  {p.onlyInA ? "Deleted Page" : p.onlyInB ? "Added Page" : "Modified"}
                                </p>
                              </div>
                            </div>

                            <div>
                              {p.hasChanges ? (
                                <span className="bg-rose-500/15 text-rose-400 font-black font-mono text-[9px] px-2 py-0.5 rounded-md border border-rose-550/20">
                                  {p.changesCount} {p.changesCount === 1 ? "diff" : "diffs"}
                                </span>
                              ) : (
                                <CheckCircle2 size={15} className="text-emerald-500/80" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 2. Right Canvas: Displays & Controls */}
                <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden min-h-[460px]">
                  
                  {/* Inner Page View Controls bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-850 border-b border-slate-800">
                    
                    {/* Visual vs Text mode toggle */}
                    <div className="flex bg-slate-800/80 border border-slate-700/60 p-1 rounded-xl w-fit self-start">
                      {[
                        { id: "visual", label: "Visual Check" },
                        { id: "text", label: "Text Diff View" }
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setMode(t.id as any)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-black transition ${
                            mode === t.id
                              ? "bg-slate-700 text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Segmented display toggle for Visual Mode */}
                    {mode === "visual" && (
                      <div className="flex bg-slate-800/80 border border-slate-700/60 p-1 rounded-xl w-fit self-start">
                        {[
                          { id: "diff", label: "Red Overlay Diff" },
                          { id: "side", label: "Side-by-Side View" }
                        ].map((v) => (
                          <button
                            key={v.id}
                            onClick={() => setVisualViewType(v.id as any)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition ${
                              visualViewType === v.id
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Zoom / Scaling tools */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
                        className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-750 transition"
                        title="Zoom Out"
                      >
                        <ZoomOut size={16} />
                      </button>
                      <span className="font-mono text-xs font-bold text-slate-400 min-w-10 text-center select-none">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        onClick={() => setZoom(z => Math.min(2.0, z + 0.1))}
                        className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-750 transition"
                        title="Zoom In"
                      >
                        <ZoomIn size={16} />
                      </button>
                    </div>

                  </div>

                  {/* Document Page Display Content */}
                  <div className="flex-1 p-6 overflow-auto flex justify-center items-start bg-slate-950/40 relative">
                    
                    {currentPageData ? (
                      <div className="w-full flex justify-center">
                        <AnimatePresence mode="wait">
                          
                          {/* VISUAL DIFF PANEL MODE */}
                          {mode === "visual" ? (
                            <motion.div
                              key={`visual-${pageNum}-${visualViewType}`}
                              initial={{ opacity: 0, scale: 0.98 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0 }}
                              className="w-full flex justify-center"
                            >
                              {visualViewType === "side" ? (
                                // Side-By-Side A / B
                                <div className="flex flex-col lg:flex-row gap-6 max-w-full">
                                  {/* Document A (Original) */}
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                      <span className="text-[10px] font-black text-slate-450 uppercase tracking-widest">A: Original</span>
                                      <span className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]">{fileA?.name}</span>
                                    </div>
                                    <div 
                                      className="bg-white rounded border border-slate-750 shadow-2xl relative overflow-hidden"
                                      style={{
                                        width: `${500 * zoom}px`,
                                        aspectRatio: "595 / 842"
                                      }}
                                    >
                                      {currentPageData.imageA ? (
                                        <img src={currentPageData.imageA} className="w-full h-full object-contain" alt="Original Page" />
                                      ) : (
                                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm">
                                          Page Not Found in Original Document
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Document B (Modified) */}
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                      <span className="text-[10px] font-black text-slate-450 uppercase tracking-widest text-emerald-450">B: Revised</span>
                                      <span className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]">{fileB?.name}</span>
                                    </div>
                                    <div 
                                      className="bg-white rounded border border-slate-750 shadow-2xl relative overflow-hidden"
                                      style={{
                                        width: `${500 * zoom}px`,
                                        aspectRatio: "595 / 842"
                                      }}
                                    >
                                      {currentPageData.imageB ? (
                                        <img src={currentPageData.imageB} className="w-full h-full object-contain" alt="Modified Page" />
                                      ) : (
                                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-sm">
                                          Page Not Found in Modified Document
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                // High-Precision Visual Overlay Diff
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center px-1">
                                    <span className="text-[10px] font-black text-rose-450 uppercase tracking-widest flex items-center gap-1.5">
                                      <ShieldAlert size={12} /> Red Overlay Difference Map (A vs B)
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-800 py-0.5 px-2.5 rounded-full border border-slate-700">
                                      {currentPageData.hasChanges ? "Changes Highlighted in Red" : "Pages Match Perfectly"}
                                    </span>
                                  </div>
                                  <div 
                                    className="bg-white rounded border border-slate-750 shadow-2xl relative overflow-hidden mx-auto"
                                    style={{
                                      width: `${550 * zoom}px`,
                                      aspectRatio: "595 / 842"
                                    }}
                                  >
                                    <img src={currentPageData.imageDiff} className="w-full h-full object-contain" alt="Overlay Difference Map" />
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ) : (
                            
                            // TEXTUAL DIFF PANEL MODE
                            <motion.div
                              key={`text-${pageNum}`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-3 border-b border-slate-800">
                                <div className="flex items-center gap-2">
                                  <FileText size={18} className="text-blue-400" />
                                  <h4 className="text-xs font-black tracking-widest text-slate-400 uppercase">Text Diff Analysis - Page {pageNum}</h4>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] font-bold">
                                  <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Added
                                  </span>
                                  <span className="flex items-center gap-1.5 text-rose-450 bg-rose-500/5 px-2 py-0.5 rounded border border-rose-500/10 line-through">
                                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" /> Deleted
                                  </span>
                                </div>
                              </div>

                              <div className="bg-slate-950/65 p-6 rounded-2xl border border-slate-800/60 font-mono text-xs leading-relaxed max-h-[600px] overflow-y-auto pr-2 custom-scrollbar whitespace-pre-wrap text-left">
                                {currentPageData.textDiff.length === 0 ? (
                                  <div className="text-slate-500 text-center py-20 font-semibold italic">
                                    No text content extracted/detected on this page.
                                  </div>
                                ) : (
                                  currentPageData.textDiff.map((block, idx) => {
                                    if (block.type === "added") {
                                      return (
                                        <span 
                                          key={idx} 
                                          className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/15 px-1 py-0.5 rounded font-black mx-[0.5px]"
                                          title="Added"
                                        >
                                          {block.text}
                                        </span>
                                      );
                                    } else if (block.type === "deleted") {
                                      return (
                                        <span 
                                          key={idx} 
                                          className="bg-rose-500/20 text-rose-400 border border-rose-500/15 line-through px-1 py-0.5 rounded mx-[0.5px]"
                                          title="Deleted"
                                        >
                                          {block.text}
                                        </span>
                                      );
                                    } else {
                                      return (
                                        <span key={idx} className="text-slate-350">
                                          {block.text}
                                        </span>
                                      );
                                    }
                                  })
                                )}
                              </div>
                            </motion.div>
                          )}
                          
                        </AnimatePresence>
                      </div>
                    ) : (
                      <div className="text-slate-500 italic text-sm">Please select a page from the sidebar to inspect comparison data.</div>
                    )}

                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
