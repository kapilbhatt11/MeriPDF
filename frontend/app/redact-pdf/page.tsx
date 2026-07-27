"use client";
import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import { 
  Loader2, FileDown, X, EyeOff, HelpCircle, UploadCloud, 
  Plus, Search, Shield, ChevronLeft, ChevronRight, 
  Trash2, Sliders, Info, Eye, Download, Layers, Sparkles, Undo2, Redo2
} from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { logPDFOperation } from "@/lib/analytics";

interface RedactRect {
  id: string;
  page: number;
  x: number; // in PDF points
  y: number; // in PDF points
  w: number; // in PDF points
  h: number; // in PDF points
}

export default function RedactPDF() {
  // Core State
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Redacted.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Workspace Config
  const [tab, setTab] = useState<"text" | "area">("text");
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pageDimensions, setPageDimensions] = useState({ width: 595, height: 842 });
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  // Redaction Items
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [rects, setRects] = useState<RedactRect[]>([]);
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scale, setScale] = useState(1.0);

  // Undo-Redo History Stack
  const [history, setHistory] = useState<RedactRect[][]>([]);
  const [redoHistory, setRedoHistory] = useState<RedactRect[][]>([]);

  const recordHistory = (currentRects = rects) => {
    setHistory(prev => [...prev, currentRects]);
    setRedoHistory([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoHistory(prev => [...prev, rects]);
    setRects(previous);
    setHistory(prev => prev.slice(0, prev.length - 1));
    setSelectedRectId(null);
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const next = redoHistory[redoHistory.length - 1];
    setHistory(prev => [...prev, rects]);
    setRects(next);
    setRedoHistory(prev => prev.slice(0, prev.length - 1));
    setSelectedRectId(null);
  };

  // Synchronize scale based on outer container size
  useEffect(() => {
    const handleResize = () => {
      if (outerWrapperRef.current) {
        const rect = outerWrapperRef.current.getBoundingClientRect();
        // Available space minus wrapper padding
        const padding = 48; // p-6 on each side
        const availableW = Math.max(150, rect.width - padding);
        const availableH = Math.max(200, rect.height - padding);

        const scaleW = availableW / pageDimensions.width;
        const scaleH = availableH / pageDimensions.height;
        const fitScale = Math.min(scaleW, scaleH);

        // Cap scale factor at 1.0 to prevent pixelation/upscaling
        setScale(Math.min(1.0, fitScale));
      }
    };
    // Run delay to ensure image loading paint has finished
    const timer = setTimeout(handleResize, 150);
    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [pageImage, pageDimensions, pageNum]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewWrapperRef = useRef<HTMLDivElement>(null);
  const outerWrapperRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  // PDF.js State
  const [pdfjsLib, setPdfjsLib] = useState<any>(null);
  const [pdfReady, setPdfReady] = useState(false);

  // Load PDF.js engine
  useEffect(() => {
    const loadPdfJs = async () => {
      if (typeof window === "undefined") return;
      try {
        // @ts-ignore
        const module = await import("pdfjs-dist/build/pdf");
        // @ts-ignore
        const worker = await import("pdfjs-dist/build/pdf.worker.min.js");
        (window as any).pdfjsWorker = worker;
        module.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        setPdfjsLib(module);
        setPdfReady(true);
      } catch (error) {
        console.error("Failed to load PDF.js:", error);
      }
    };
    loadPdfJs();
  }, []);

  // Render current selected page
  useEffect(() => {
    if (!file || !pdfReady || !pdfjsLib) {
      setPageImage(null);
      return;
    }
    const renderPDFPage = async () => {
      setLoadingPage(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const typedarray = new Uint8Array(reader.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            setNumPages(pdf.numPages);
            
            const page = await pdf.getPage(pageNum);
            const standardViewport = page.getViewport({ scale: 1.0 });
            setPageDimensions({ width: standardViewport.width, height: standardViewport.height });
            
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas context not supported.");
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport }).promise;
            
            setPageImage(canvas.toDataURL());
          } catch (e) {
            console.error("PDF page render error:", e);
          } finally {
            setLoadingPage(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error("FileReader error:", err);
        setLoadingPage(false);
      }
    };
    renderPDFPage();
  }, [file, pageNum, pdfReady, pdfjsLib]);

  // Handle Resize Mouse Events
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!previewWrapperRef.current) return;
      const rect = previewWrapperRef.current.getBoundingClientRect();
      const currentScale = rect.width / pageDimensions.width;

      const deltaX = (e.clientX - resizing.startX) / currentScale;
      const deltaY = (e.clientY - resizing.startY) / currentScale;

      let newW = Math.max(15, resizing.startW + deltaX);
      let newH = Math.max(10, resizing.startH + deltaY);

      // Boundary limits
      const el = rects.find(x => x.id === resizing.id);
      if (el) {
        newW = Math.min(pageDimensions.width - el.x, newW);
        newH = Math.min(pageDimensions.height - el.y, newH);
        setRects(prev => prev.map(item => item.id === el.id ? { ...item, w: newW, h: newH } : item));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, rects, pageDimensions]);

  // Handle Keyboard Adjustments (Arrows = move, Shift + Arrows = resize/boundary, Backspace/Del = delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        return;
      }

      // Undo / Redo Global Shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (!selectedRectId) return;

      const rectEl = rects.find(r => r.id === selectedRectId);
      if (!rectEl) return;

      const step = e.shiftKey ? 1 : 2; // Shift does fine-grained border sizing
      let newX = rectEl.x;
      let newY = rectEl.y;
      let newW = rectEl.w;
      let newH = rectEl.h;
      let updated = false;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) { // Adjust right border (shrink horizontally)
          newW = Math.max(10, rectEl.w - step);
        } else { // Move left
          newX = Math.max(0, rectEl.x - step);
        }
        updated = true;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) { // Expand right border
          newW = Math.min(pageDimensions.width - rectEl.x, rectEl.w + step);
        } else { // Move right
          newX = Math.min(pageDimensions.width - rectEl.w, rectEl.x + step);
        }
        updated = true;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (e.shiftKey) { // Shrink vertical height
          newH = Math.max(10, rectEl.h - step);
        } else { // Move up
          newY = Math.max(0, rectEl.y - step);
        }
        updated = true;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (e.shiftKey) { // Expand vertical height
          newH = Math.min(pageDimensions.height - rectEl.y, rectEl.h + step);
        } else { // Move down
          newY = Math.min(pageDimensions.height - rectEl.h, rectEl.y + step);
        }
        updated = true;
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteRect(selectedRectId);
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedRectId(null);
        return;
      }

      if (updated) {
        if (!e.repeat) {
          recordHistory();
        }
        setRects(prev => prev.map(r => r.id === selectedRectId ? { ...r, x: newX, y: newY, w: newW, h: newH } : r));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRectId, rects, pageDimensions, history, redoHistory]);

  // File Upload Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setDownloadUrl(null);
      setPageNum(1);
      setRects([]);
      setKeywords([]);
    }
  };

  // Scan patterns from document
  const scanPatterns = async (type: string, custom?: string) => {
    if (!file) {
      alert("Please upload a PDF file first.");
      return;
    }
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("query_type", type);
      if (custom) {
        formData.append("custom_query", custom);
      }
      const res = await axios.post(api("/pdf/search_patterns"), formData, {
        headers: optionalAuthHeaders(),
      });
      if (res.data && res.data.matches) {
        const matches = res.data.matches;
        if (matches.length === 0) {
          alert(`No matches found in the document for "${custom || type}".`);
          return;
        }

        const newRects: RedactRect[] = matches.map((m: any) => ({
          id: m.id,
          page: m.page,
          x: m.x,
          y: m.y,
          w: m.w,
          h: m.h
        }));

        const filteredNewRects = newRects.filter(nr => 
          !rects.some(pr => pr.page === nr.page && Math.abs(pr.x - nr.x) < 2 && Math.abs(pr.y - nr.y) < 2)
        );
        if (filteredNewRects.length === 0) {
          alert("No new unique occurrences found.");
          return;
        }

        recordHistory();
        setRects(prev => [...prev, ...filteredNewRects]);
        alert(`Scan complete: Identified and added ${filteredNewRects.length} redact boxes to the workspace.`);
      }
    } catch (e) {
      console.error("Pattern scan error:", e);
      alert("Failed to scan document patterns.");
    } finally {
      setScanning(false);
    }
  };

  // Keyword Helpers
  const addKeyword = () => {
    const kw = newKeyword.trim();
    if (kw) {
      if (!keywords.includes(kw)) {
        setKeywords(prev => [...prev, kw]);
      }
      setNewKeyword("");
      // Auto-scan this custom term & place adjustable redact boxes
      scanPatterns("custom", kw);
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(prev => prev.filter(k => k !== kw));
  };

  // Rect Helpers
  const spawnRedactRect = () => {
    recordHistory();
    const defaultW = 120;
    const defaultH = 30;
    const spawnX = Math.max(10, (pageDimensions.width - defaultW) / 2);
    const spawnY = Math.max(10, (pageDimensions.height - defaultH) / 2);

    const newRect: RedactRect = {
      id: Date.now().toString(),
      page: pageNum,
      x: spawnX,
      y: spawnY,
      w: defaultW,
      h: defaultH
    };

    setRects(prev => [...prev, newRect]);
    setSelectedRectId(newRect.id);
  };

  const deleteRect = (id: string) => {
    recordHistory();
    setRects(prev => prev.filter(r => r.id !== id));
    if (selectedRectId === id) setSelectedRectId(null);
  };

  // Redact Call
  const handleApplyRedactions = async () => {
    if (!file) return;
    if (keywords.length === 0 && rects.length === 0) {
      alert("Please add at least one keyword search or manually draw a redaction area.");
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);
    
    const redactionsConfig = {
      keywords: keywords,
      rects: rects.map(r => ({
        page: r.page,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h
      }))
    };

    formData.append("redactions", JSON.stringify(redactionsConfig));

    try {
      const res = await axios.post(
        api("/pdf/redact"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Redacted.pdf`;
      if (contentDisposition) {
        const match = /filename="?([^\";]+)"?/.exec(contentDisposition);
        if (match && match[1]) filename = match[1];
      }

      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("Redact PDF", 1);
    } catch (e: any) {
      console.error("Redactions logic error:", e);
      let errorMsg = "Could not apply redactions. Make sure the document is not password protected.";
      if (axios.isAxiosError(e) && e.response?.data?.detail) {
        errorMsg = e.response.data.detail;
      }
      alert(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const activeRects = rects.filter(r => r.page === pageNum);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <Loader2 className="animate-spin text-rose-500 w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-800 font-sans pb-12 selection:bg-rose-200">
      
      {/* Header Container */}
      <div className="max-w-7xl mx-auto px-6 pt-2 pb-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="bg-rose-600 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/20">
              <EyeOff className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 leading-tight">Redact Secure PDF</h1>
              <p className="text-slate-500 font-medium text-sm">Permanently blackout and erase sensitive data</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-bold transition border border-slate-200"
            >
              <HelpCircle size={17} /> How it works
            </button>
            <div className="h-10 w-[1px] bg-slate-200 hidden md:block mx-1" />
            <div className="bg-rose-50 text-rose-700 px-4 py-2 rounded-xl text-xs font-black border border-rose-100 flex items-center gap-1.5">
              <Shield size={13} /> Strict Security
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-6 mt-2 items-start">
        
        {/* Left Control Bar (2 Units) */}
        <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-base font-bold flex items-center gap-2 mb-6 text-slate-800">
              <Sliders size={18} className="text-rose-600" />
              Redaction Settings
            </h2>

            {/* Tabs */}
            <div className="bg-slate-50 p-1 rounded-xl flex mb-6 border border-slate-100">
              {(["text", "area"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all font-bold text-xs ${
                    tab === t 
                      ? "bg-white text-rose-600 shadow-sm border border-slate-100" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t === "text" ? <Search size={14} /> : <Layers size={14} />}
                  {t === "text" ? "Keywords Search" : "Manual Area Redact"}
                </button>
              ))}
            </div>

            {/* Keyword Panel */}
            <AnimatePresence mode="wait">
              {tab === "text" ? (
                <motion.div
                  key="text-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Search and Redact Term
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                        placeholder="Type names, emails, ids..."
                        className="flex-1 bg-slate-50 border border-slate-200 focus:border-rose-500 focus:bg-white px-4 py-3 rounded-xl outline-none font-bold text-xs"
                      />
                      <button
                        onClick={addKeyword}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-4 rounded-xl flex items-center justify-center font-bold text-xs transition"
                      >
                        Add List
                      </button>
                    </div>
                  </div>

                  {/* Active List */}
                  <div className="space-y-3">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Current Redact Terms ({keywords.length})
                    </span>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 min-h-[120px] max-h-[180px] overflow-y-auto flex flex-wrap gap-2 items-start">
                      {keywords.length === 0 ? (
                        <div className="text-slate-400 text-xs font-semibold py-8 mx-auto text-center flex flex-col items-center gap-1.5">
                          <EyeOff size={18} className="opacity-40" />
                          No search terms added yet.
                        </div>
                      ) : (
                        keywords.map((kw) => (
                          <div 
                            key={kw}
                            className="bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-2 group shadow-2xs"
                          >
                            <span>{kw}</span>
                            <button
                              onClick={() => removeKeyword(kw)}
                              className="text-rose-500 hover:text-rose-900 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Redaction presets */}
                  <div className="space-y-2">
                    <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider ml-1">
                      Quick Auto-Scan & Place Boxes:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "[Emails]", type: "emails" },
                        { label: "[Social Numbers]", type: "ssns" },
                        { label: "[Phone Numbers]", type: "phones" },
                        { label: "[Prices/Billing]", type: "prices" },
                        { label: "[Credit/Debit Cards]", type: "cards" }
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => scanPatterns(preset.type)}
                          disabled={scanning || !file}
                          className="bg-white border border-slate-200 hover:border-rose-400 hover:bg-rose-50 px-3 py-2 rounded-xl text-slate-500 hover:text-rose-600 font-bold text-[10px] transition disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {scanning ? <Loader2 className="animate-spin text-rose-500" size={10} /> : "+"}
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                </motion.div>
              ) : (
                <motion.div
                  key="area-tab"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl text-center space-y-4">
                    <div className="bg-rose-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-rose-600">
                      <Layers size={20} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-700">Custom Region Placement</h4>
                      <p className="text-slate-500 text-xs font-semibold px-2">Spawn redaction blocks on the page view, and resize/drag them to blackout logos, stamps, grids, or signature lines.</p>
                    </div>

                    <button
                      onClick={spawnRedactRect}
                      disabled={!file}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold text-xs transition disabled:opacity-50"
                    >
                      + Spawn Redaction Box
                    </button>
                  </div>

                  {/* Placed rects list */}
                  <div className="space-y-3">
                    <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Placed Area Redactions ({rects.length})
                    </span>
                    <div className="max-h-[220px] overflow-y-auto space-y-2">
                      {rects.length === 0 ? (
                        <div className="text-slate-400 text-xs font-semibold py-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                          No manual blocks drawn.
                        </div>
                      ) : (
                        rects.map((r, index) => (
                          <div 
                            key={r.id}
                            onClick={() => setSelectedRectId(r.id)}
                            className={`flex justify-between items-center p-3 rounded-xl border transition cursor-pointer ${
                              selectedRectId === r.id 
                                ? "bg-rose-50 border-rose-400 text-rose-800" 
                                : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="bg-rose-100 text-rose-700 text-xs w-6 h-6 rounded-lg flex items-center justify-center font-bold">
                                {index + 1}
                              </span>
                              <div className="text-left leading-none">
                                <p className="text-xs font-bold font-mono">Page {r.page}</p>
                                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">X:{Math.round(r.x)} Y:{Math.round(r.y)} W:{Math.round(r.w)} H:{Math.round(r.h)}</p>
                              </div>
                            </div>

                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteRect(r.id);
                              }}
                              className="text-slate-400 hover:text-red-500 transition-colors p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

        {/* Right Dashboard preview Area (3 Units) */}
        <div className="lg:col-span-3 flex flex-col gap-6 h-full">
          
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-[520px]">
            
            {/* Ambient gradients */}
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-rose-500/5 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none" />

            {!file ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group cursor-pointer w-full max-w-2xl text-center space-y-8 py-10"
              >
                <div className="relative mx-auto w-40 h-40 flex items-center justify-center">
                  <div className="absolute inset-0 bg-rose-500/10 rounded-[60px] rotate-12 group-hover:rotate-6 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-rose-500/20 rounded-[60px] -rotate-12 group-hover:-rotate-6 transition-transform duration-500" />
                  <div className="relative bg-white w-32 h-32 rounded-[48px] shadow-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                    <UploadCloud className="w-14 h-14 text-rose-600" />
                  </div>
                </div>
                
                <div>
                  <h3 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Drop sensitive PDF here</h3>
                  <p className="text-slate-500 font-medium text-lg leading-relaxed max-w-md mx-auto">
                    Select a document to sanitize. File data is processed safe and deleted immediately after.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <button className="bg-slate-900 text-white px-10 py-5 rounded-[24px] font-black text-xl hover:scale-105 active:scale-95 transition shadow-2xl flex items-center gap-3">
                    <Plus size={24} /> Locate File
                  </button>
                  <div className="flex items-center gap-6 text-slate-300 font-black tracking-widest text-[9px] uppercase mt-4">
                    <span>100% Offline Sanitize</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    <span>Permanent Erase</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    <span>Metadata Stripped</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-4 bg-slate-50 pr-6 pl-2 py-2 rounded-2xl border border-slate-100 max-w-[70%]">
                    <div className="bg-white p-3 rounded-xl shadow-xs text-rose-600">
                      <EyeOff size={22} />
                    </div>
                    <div className="truncate text-left">
                      <p className="text-sm font-black text-slate-800 truncate leading-none mb-1">{file.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  
                  {/* Page Navigator */}
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-205 px-3 py-1.5 rounded-xl">
                    <button
                      onClick={() => setPageNum(p => Math.max(1, p - 1))}
                      disabled={pageNum === 1}
                      className="text-slate-550 hover:text-rose-650 disabled:opacity-30 transition-colors p-1"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-[11px] font-bold text-slate-600 min-w-14 text-center select-none tabular-nums">
                      Page {pageNum} / {numPages}
                    </span>
                    <button
                      onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
                      disabled={pageNum === numPages}
                      className="text-slate-550 hover:text-rose-650 disabled:opacity-30 transition-colors p-1"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* History Controls */}
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-205 p-1.5 rounded-xl">
                    <button
                      onClick={handleUndo}
                      disabled={history.length === 0}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition flex items-center justify-center"
                      title="Undo Redaction (Ctrl+Z)"
                    >
                      <Undo2 size={15} />
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={redoHistory.length === 0}
                      className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition flex items-center justify-center"
                      title="Redo Redaction (Ctrl+Y)"
                    >
                      <Redo2 size={15} />
                    </button>
                  </div>

                  <button 
                    onClick={() => {
                      setFile(null);
                      setDownloadUrl(null);
                    }}
                    className="w-11 h-11 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-450 hover:text-red-500 transition flex items-center justify-center border border-slate-200"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* PDF Page Canvas Wrapper */}
                <div 
                  ref={outerWrapperRef}
                  className="flex-1 bg-slate-100/50 rounded-2xl border-2 border-slate-200 border-dashed relative flex items-center justify-center p-6 overflow-hidden min-h-[480px]"
                >
                  {loadingPage && (
                    <div className="absolute inset-0 bg-slate-100/35 backdrop-blur-2xs flex items-center justify-center z-15">
                      <Loader2 className="animate-spin text-rose-500" />
                    </div>
                  )}

                  <div className="absolute top-4 left-6 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 select-none">Active Viewport</span>
                  </div>

                  {/* Rendering standard viewport dimensions */}
                  <div 
                    ref={previewWrapperRef}
                    className="bg-white shadow-xl rounded-sm border border-slate-200 relative overflow-hidden select-none"
                    style={{
                      width: `${pageDimensions.width * scale}px`,
                      height: `${pageDimensions.height * scale}px`
                    }}
                  >
                    {pageImage ? (
                      <img src={pageImage} className="w-full h-full object-contain pointer-events-none" alt="PDF Content Page" />
                    ) : (
                      <div className="p-8 space-y-4 opacity-10 pointer-events-none">
                        <div className="h-4 bg-slate-200 w-3/4 rounded-full" />
                        <div className="h-4 bg-slate-200 w-full rounded-full" />
                        <div className="h-4 bg-slate-200 w-5/6 rounded-full" />
                        <div className="pt-8 h-4 bg-slate-205 w-1/2 rounded-full" />
                        <div className="h-4 bg-slate-200 w-full rounded-full" />
                      </div>
                    )}

                    {/* Draggable & Resizable manual redactions overlays */}
                    {activeRects.map((r) => {
                      const isSelected = selectedRectId === r.id;
                      // Local coordinate mapping
                      const clientX = r.x * scale;
                      const clientY = r.y * scale;
                      const clientW = r.w * scale;
                      const clientH = r.h * scale;

                      return (
                        <div
                          key={r.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRectId(r.id);
                          }}
                          className={`absolute group cursor-move flex items-center justify-center ${
                            isSelected 
                              ? "ring-2 ring-rose-500 ring-offset-1 bg-rose-550/45 z-40 border border-rose-500" 
                              : "bg-black/85 hover:bg-black/90 hover:ring-2 hover:ring-rose-500/60 z-30"
                          }`}
                          style={{
                            left: `${clientX}px`,
                            top: `${clientY}px`,
                            width: `${clientW}px`,
                            height: `${clientH}px`
                          }}
                          // simple drag handler using mouse positions
                          onMouseDown={(downEvent) => {
                            downEvent.stopPropagation();
                            setSelectedRectId(r.id);
                            recordHistory();
                            const startX = r.x;
                            const startY = r.y;
                            const initialMouseX = downEvent.clientX;
                            const initialMouseY = downEvent.clientY;

                            const moveHandler = (moveEvent: MouseEvent) => {
                              const deltaX = (moveEvent.clientX - initialMouseX) / scale;
                              const deltaY = (moveEvent.clientY - initialMouseY) / scale;

                              let newX = startX + deltaX;
                              let newY = startY + deltaY;

                              // Boundaries
                              newX = Math.max(0, Math.min(pageDimensions.width - r.w, newX));
                              newY = Math.max(0, Math.min(pageDimensions.height - r.h, newY));

                              setRects(prev => prev.map(x => x.id === r.id ? { ...x, x: newX, y: newY } : x));
                            };

                            const upHandler = () => {
                              window.removeEventListener("mousemove", moveHandler);
                              window.removeEventListener("mouseup", upHandler);
                            };

                            window.addEventListener("mousemove", moveHandler);
                            window.addEventListener("mouseup", upHandler);
                          }}
                        >
                          <div className="absolute text-[8px] font-black text-rose-350 select-none tracking-widest leading-none pointer-events-none uppercase">
                            REDACT
                          </div>

                          {/* Close grip */}
                          {isSelected && (
                            <button
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteRect(r.id);
                              }}
                              className="absolute -top-2.5 -right-2.5 bg-rose-600 text-white w-5 h-5 rounded-full flex items-center justify-center shadow-md hover:bg-rose-800 transition"
                            >
                              <X size={10} />
                            </button>
                          )}

                          {/* Resize grip */}
                          {isSelected && (
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                recordHistory();
                                setResizing({
                                  id: r.id,
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  startW: r.w,
                                  startH: r.h
                                });
                              }}
                              className="absolute -bottom-1 -right-1 w-3 h-3 bg-rose-600 rounded-xs cursor-se-resize shadow border border-white"
                            />
                          )}
                        </div>
                      );
                    })}

                  </div>

                  {/* UI tips */}
                  <div className="absolute bottom-6 flex gap-3">
                     <div className="bg-white/90 backdrop-blur shadow-xs px-3.5 py-1.5 rounded-xl text-[9px] font-bold text-slate-550 flex items-center gap-1.5">
                        <Info size={11} className="text-rose-500" /> Elements permanently destroyed from source code
                     </div>
                  </div>
                </div>

                {/* Confirm Action triggers */}
                <div className="mt-8 flex flex-col md:flex-row gap-4 items-center">
                  <button
                    onClick={handleApplyRedactions}
                    disabled={loading}
                    className="flex-1 w-full bg-rose-605 bg-rose-600 text-white h-15 rounded-2xl font-black text-lg hover:scale-[1.01] active:scale-[0.99] transition shadow-lg shadow-rose-500/10 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin w-5 h-5" />
                    ) : (
                      <>🔒 Apply Permanent Redactions</>
                    )}
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Success Dialog */}
          <AnimatePresence>
            {downloadUrl && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="bg-emerald-600 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6"
              >
                <div className="flex items-center gap-5 text-left">
                  <div className="bg-white/20 w-14 h-14 rounded-full flex items-center justify-center shrink-0">
                    <FileDown className="text-white w-7 h-7" />
                  </div>
                  <div className="text-white">
                    <h4 className="text-lg font-black">PDF Redacted Successfully!</h4>
                    <p className="text-emerald-100 font-medium text-xs">All matching text streams were securely wiped in depth.</p>
                  </div>
                </div>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="bg-white text-emerald-700 hover:bg-slate-50 px-8 py-4 rounded-2xl font-black text-sm transition shadow flex items-center gap-2 shrink-0"
                >
                  <Download size={14} /> Download Secure PDF
                </a>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </main>

      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end p-6 bg-slate-900/25 backdrop-blur-xs" onClick={() => setShowHelp(false)}>
            <motion.div 
              initial={{ x: 350 }} animate={{ x: 0 }} exit={{ x: 350 }}
              className="w-full max-w-sm h-full bg-white rounded-3xl shadow-xl p-8 relative overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-6 right-6 text-slate-300 hover:text-slate-655"
              >
                <X size={20} />
              </button>

              <div className="mb-10 text-left">
                <div className="bg-rose-100 w-12 h-12 rounded-xl flex items-center justify-center text-rose-600 mb-4">
                   <Info size={25} />
                </div>
                <h2 className="text-2xl font-black text-slate-800">What is true redaction?</h2>
              </div>

              <div className="space-y-8 text-left">
                {[
                  { title: "Standard vs True Redact", desc: "Just overlapping text with black squares allows users to copy/paste the content layout beneath. True redaction securely wipes the underlying characters." },
                  { title: "Keywords Redact", desc: "Instantly locate and erase names, emails, values, or custom phrases across every single page." },
                  { title: "Visual Area Redact", desc: "Spawn and size blocking boxes to wipe stamps, faces, signature graphics, or charts." },
                  { title: "Metadata Stripped", desc: "The document is compressed and cleaned, ensuring no recovery is possible." }
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="text-xl font-black text-rose-500/25">0{idx + 1}</div>
                    <div className="space-y-1">
                       <h4 className="font-bold text-slate-805 text-xs uppercase tracking-wide">{step.title}</h4>
                       <p className="text-slate-500 text-xs font-semibold leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={() => setShowHelp(false)}
                className="w-full mt-10 bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-xl font-bold text-sm transition"
              >
                Let me try!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
