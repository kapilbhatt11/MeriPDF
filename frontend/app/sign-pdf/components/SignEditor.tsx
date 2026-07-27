"use client";
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { motion, useDragControls } from "framer-motion";
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Download, Loader2, Sparkles, 
  Trash2, Calendar, Type as TypeIcon, Award, GripVertical, Check, ZoomIn, ZoomOut,
  Undo2, Redo2
} from "lucide-react";
import { api } from "@/lib/api";
import SignModal from "./SignModal";
import { logPDFOperation } from "@/lib/analytics";

interface Props {
  file: File;
  onBack: () => void;
}

interface ElementType {
  id: string;
  page: number;
  type: "text" | "image";
  text?: string;
  base64?: string;
  x: number; // PDF points
  y: number; // PDF points
  w: number; // PDF points
  h: number; // PDF points
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
}

export default function SignEditor({ file, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({ width: 595, height: 842 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const [pdfjsLib, setPdfjsLib] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0);

  const [elements, setElements] = useState<ElementType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);

  // Undo-Redo Stack
  const [history, setHistory] = useState<ElementType[][]>([]);
  const [redoHistory, setRedoHistory] = useState<ElementType[][]>([]);

  // Selected Date Format Preset
  const [selectedDateFormat, setSelectedDateFormat] = useState<string>("DD-MM-YYYY");

  // Resize State
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number } | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);

  const recordHistory = (currentElements = elements) => {
    setHistory(prev => [...prev, currentElements]);
    setRedoHistory([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoHistory(prev => [...prev, elements]);
    setElements(previous);
    setHistory(prev => prev.slice(0, prev.length - 1));
    setSelectedId(null);
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const next = redoHistory[redoHistory.length - 1];
    setHistory(prev => [...prev, elements]);
    setElements(next);
    setRedoHistory(prev => prev.slice(0, prev.length - 1));
    setSelectedId(null);
  };

  // Keyboard Event Handlers for Undo/Redo Shortcuts & Canvas Position Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      
      // Allow Escape key to blur active input/text area to enable keyboard control
      if (e.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
        return;
      }

      if (isTyping) return; // Ignore editing shortcuts while typing

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      } else if (selectedId) {
        let dx = 0;
        let dy = 0;
        let isArrow = false;
        const step = e.shiftKey ? 10 : 1;

        if (e.key === "ArrowUp") {
          dy = -step;
          isArrow = true;
        } else if (e.key === "ArrowDown") {
          dy = step;
          isArrow = true;
        } else if (e.key === "ArrowLeft") {
          dx = -step;
          isArrow = true;
        } else if (e.key === "ArrowRight") {
          dx = step;
          isArrow = true;
        }

        if (isArrow) {
          e.preventDefault();
          // Record history only on the initial press, not on repeat keydown
          if (!e.repeat) {
            recordHistory();
          }
          setElements(prev => prev.map(item => {
            if (item.id === selectedId) {
              let newX = item.x + dx;
              let newY = item.y + dy;
              
              // Prevent moving outside document boundaries
              newX = Math.max(0, Math.min(pageDimensions.width - item.w, newX));
              newY = Math.max(0, Math.min(pageDimensions.height - item.h, newY));
              
              return { ...item, x: newX, y: newY };
            }
            return item;
          }));
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          recordHistory();
          setElements(prev => prev.filter(x => x.id !== selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, redoHistory, elements, selectedId, pageDimensions]);

  // Load PDF.js engine
  useEffect(() => {
    const loadPdfJs = async () => {
      try {
        // @ts-ignore
        const module = await import("pdfjs-dist/build/pdf");
        // @ts-ignore
        const worker = await import("pdfjs-dist/build/pdf.worker.min.js");
        (window as any).pdfjsWorker = worker;
        module.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        setPdfjsLib(module);
      } catch (error) {
        console.error("Failed to load PDF.js:", error);
        setErrorMessage("Failed to load PDF rendering engine.");
      }
    };
    loadPdfJs();
  }, []);

  // Load and render PDF pages
  useEffect(() => {
    if (!file || !pdfjsLib) return;
    const renderPDFPage = async () => {
      setLoading(true);
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
          } catch (e: any) {
            console.error("PDF render processing failed:", e);
            setErrorMessage("Error rendering PDF pages.");
          } finally {
            setLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err: any) {
        console.error("Document read failed:", err);
        setErrorMessage("Error loading uploaded file document.");
        setLoading(false);
      }
    };
    renderPDFPage();
  }, [file, pageNum, pdfjsLib]);

  // Handle resizing hooks
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const el = elements.find(x => x.id === resizing.id);
      if (!el || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const currentScale = rect.width / pageDimensions.width;

      const deltaX = (e.clientX - resizing.startX) / currentScale;
      const deltaY = (e.clientY - resizing.startY) / currentScale;

      let newW = Math.max(20, resizing.startW + deltaX);
      let newH = Math.max(10, resizing.startH + deltaY);

      newW = Math.min(pageDimensions.width - el.x, newW);
      newH = Math.min(pageDimensions.height - el.y, newH);

      setElements(prev => prev.map(item => item.id === el.id ? { ...item, w: newW, h: newH } : item));
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
  }, [resizing, elements, pageDimensions]);

  // Spawn Element in Center of Viewport
  const spawnElement = (type: "text" | "image", value: string, defaultW = 180, defaultH = 60) => {
    recordHistory();
    const pageW = pageDimensions.width;
    const pageH = pageDimensions.height;
    
    const spawnX = Math.max(10, (pageW - defaultW) / 2);
    const spawnY = Math.max(10, (pageH - defaultH) / 2);

    const newElement: ElementType = {
      id: Date.now().toString(),
      page: pageNum,
      type,
      x: spawnX,
      y: spawnY,
      w: defaultW,
      h: defaultH,
      opacity: 1.0,
      ...(type === "text" ? {
        text: value,
        fontSize: 16,
        fontFamily: "helv",
        color: "#0f172a"
      } : {
        base64: value
      })
    };

    setElements(prev => [...prev, newElement]);
    setSelectedId(newElement.id);
  };

  // Generate Current Date in Selected Format
  const getFormattedDate = (format: string): string => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    switch (format) {
      case "DD-MM-YYYY":
        return `${day}-${month}-${year}`;
      case "DD/MM/YYYY":
        return `${day}/${month}/${year}`;
      case "DD MMMM YYYY":
        return `${day} ${monthNames[d.getMonth()]} ${year}`;
      case "DD-MMM-YYYY":
        return `${day}-${monthShort[d.getMonth()]}-${year}`;
      case "DD/MMM/YYYY":
        return `${day}/${monthShort[d.getMonth()]}/${year}`;
      case "MM-DD-YYYY":
        return `${month}-${day}-${year}`;
      case "YYYY-MM-DD":
        return `${year}-${month}-${day}`;
      default:
        return `${day}-${month}-${year}`;
    }
  };

  const handleAddDate = () => {
    const formatted = getFormattedDate(selectedDateFormat);
    spawnElement("text", formatted, 140, 24);
  };

  // Save changes & download PDF
  const handleSaveAndDownload = async () => {
    if (elements.length === 0) {
      alert("No elements added to the PDF yet. Add a signature or stamp first.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const instructions = elements.map(el => ({
        page: el.page,
        type: el.type,
        text: el.text,
        base64: el.base64,
        x: el.x,
        y: el.y,
        width: el.w,
        height: el.h,
        color: el.color || "#000000",
        fontFamily: el.fontFamily || "helv",
        fontSize: el.fontSize || 12,
        opacity: el.opacity || 1.0,
        fontWeight: "normal",
        fontStyle: "normal",
        textDecoration: "none",
        textAlign: "left"
      }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("edits", JSON.stringify(instructions));

      const res = await axios.post(api("/pdf/edit"), formData, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `Signed_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 100);
      logPDFOperation("Sign PDF", 1);
      setSuccessMessage("PDF signed and downloaded successfully!");
      setTimeout(() => setSuccessMessage(null), 4050);
    } catch (e: any) {
      console.error("PDF e-signing failed:", e);
      setErrorMessage("E-signing failed. Please check backend server log.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 border border-slate-200 shadow-xl rounded-3xl overflow-hidden mt-1 relative z-10 w-full min-h-0 h-full">
      {/* 20+ Handwriting & Display Fonts Integration for canvas text boxes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Inter:wght@400;700&family=Lato:wght@400;700&family=Merriweather:ital,wght@0,400;0,700;1,400;1,700&family=Montserrat:wght@400;700;800&family=Open+Sans:wght@400;700&family=Pacifico&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Poppins:wght@400;700&family=Roboto:wght@400;700&family=Sacramento&display=swap');
      `}</style>
      
      {/* Messages */}
      {errorMessage && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-red-650/95 backdrop-blur border border-red-750 text-white px-5 py-3 rounded-xl shadow-2xl z-[999] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-2 h-2 rounded-full bg-white animate-ping"></div>
          <span className="font-black text-[9px] tracking-wider uppercase bg-white/20 px-1.5 py-0.5 rounded">error</span>
          <span className="font-bold text-xs">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="hover:bg-white/10 transition rounded-md w-5 h-5 flex items-center justify-center text-[10px] font-black ml-1.5">✕</button>
        </div>
      )}

      {/* Success toast */}
      {successMessage && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-emerald-600/95 backdrop-blur border border-emerald-700 text-white px-5 py-3 rounded-xl shadow-2xl z-[999] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
          <span className="font-black text-[9px] tracking-wider uppercase bg-white/20 px-1.5 py-0.5 rounded">success</span>
          <span className="font-bold text-xs">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="hover:bg-white/10 transition rounded-md w-5 h-5 flex items-center justify-center text-[10px] font-black ml-1.5">✕</button>
        </div>
      )}

      {/* Header Toolbar */}
      <div className="bg-white border-b border-slate-100 flex items-center justify-between shadow-sm z-20 shrink-0 h-[60px] px-6">
        <div className="flex items-center gap-4 shrink-0">
          <button onClick={onBack} className="p-2 bg-slate-100/80 hover:bg-slate-205 text-slate-500 rounded-xl transition-colors" title="Change Document">
            <ArrowLeft size={16} />
          </button>
          <div className="flex flex-col">
            <span className="font-black text-xs text-slate-800 truncate max-w-[120px] sm:max-w-[200px] md:max-w-[300px]">{file.name}</span>
            <span className="text-[10px] font-bold text-teal-650 uppercase tracking-widest">Sign Workspace</span>
          </div>
        </div>

        {/* Page Switcher, Zoom & Undo / Redo */}
        {!loading && (
          <div className="flex items-center gap-4 md:gap-7">
            {/* Undo-Redo Toolbar */}
            <div className="flex items-center gap-1 bg-slate-100/60 rounded-xl p-1 border border-slate-200/50">
               <button
                 disabled={history.length === 0}
                 onClick={handleUndo}
                 className="p-1.5 hover:bg-white disabled:opacity-25 disabled:pointer-events-none rounded-lg text-slate-705 transition"
                 title="Undo (Ctrl+Z)"
               >
                 <Undo2 size={15} />
               </button>
               <button
                 disabled={redoHistory.length === 0}
                 onClick={handleRedo}
                 className="p-1.5 hover:bg-white disabled:opacity-25 disabled:pointer-events-none rounded-lg text-slate-705 transition"
                 title="Redo (Ctrl+Y)"
               >
                 <Redo2 size={15} />
               </button>
            </div>

            {/* Page layout switcher */}
            <div className="flex items-center gap-1.5 bg-slate-100/60 rounded-xl p-1 border border-slate-200/50">
              <button 
                onClick={() => { recordHistory(); setPageNum(p => Math.max(1, p - 1)); }}
                disabled={pageNum === 1}
                className="p-1 hover:bg-white disabled:pointer-events-none rounded-lg text-slate-650 disabled:opacity-30 transition font-bold"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-black text-slate-700 select-none px-2 tabular-nums">
                Page {pageNum} of {numPages}
              </span>
              <button 
                onClick={() => { recordHistory(); setPageNum(p => Math.min(numPages, p + 1)); }}
                disabled={pageNum === numPages}
                className="p-1 hover:bg-white disabled:pointer-events-none rounded-lg text-slate-650 disabled:opacity-30 transition font-bold"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Zoom selectors */}
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom(z => Math.max(0.6, z - 0.1))} className="p-1.5 hover:bg-slate-105 rounded-xl text-slate-500"><ZoomOut size={15} /></button>
              <span className="text-xs font-black text-slate-700 min-w-[34px] text-center select-none tabular-nums">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2.0, z + 0.1))} className="p-1.5 hover:bg-slate-105 rounded-xl text-slate-500"><ZoomIn size={15} /></button>
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleSaveAndDownload}
          disabled={saving || loading || elements.length === 0}
          className="bg-slate-900 border border-slate-950 font-black text-xs text-white rounded-xl py-2 px-5 hover:bg-slate-800 disabled:opacity-40 transition flex items-center gap-2 active:scale-95 shadow-md shadow-slate-950/10 shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Sign & Download
        </button>
      </div>

      {/* Main Responsive Split Layout */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-50 relative overflow-hidden h-full">

        {/* Loading Spinner */}
        {loading && (
          <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-xs flex flex-col items-center justify-center z-[90] animate-in fade-in duration-300">
            <Loader2 size={40} className="text-teal-600 animate-spin mb-3" />
            <h4 className="font-extrabold text-sm text-slate-700">Loading Document PDF...</h4>
          </div>
        )}

        {/* Page Board Canvas Viewer */}
        <div className="flex-grow overflow-auto p-4 md:p-8 flex items-start justify-center min-w-0" ref={canvasAreaRef}>
          {pageImage && (
            <div 
              ref={wrapperRef}
              className="relative shadow-2xl border border-slate-200/80 bg-white select-none transition-all duration-200 shrink-0"
              style={{
                width: `${pageDimensions.width * zoom}px`,
                height: `${pageDimensions.height * zoom}px`
              }}
            >
              <img 
                src={pageImage} 
                className="w-full h-full object-cover select-none pointer-events-none" 
                alt="PDF page rendered view" 
              />
              
              {/* Placed Element Annotations */}
              {elements.filter(el => el.page === pageNum).map(el => (
                <CanvasSignElement 
                  key={el.id}
                  el={el}
                  isSelected={selectedId === el.id}
                  setSelectedId={setSelectedId}
                  zoom={zoom}
                  pageDimensions={pageDimensions}
                  wrapperRef={wrapperRef}
                  setElements={setElements}
                  setResizing={setResizing}
                  isResizing={resizing?.id === el.id}
                  recordHistory={recordHistory}
                />
              ))}

            </div>
          )}
        </div>

        {/* Properties Sidebar Panel */}
        <div className="w-full md:w-[305px] bg-white border-t md:border-t-0 md:border-l border-slate-100 p-5 flex flex-col gap-6 overflow-y-auto z-10 shadow-xs relative shrink-0 h-[300px] md:h-full justify-start">
          
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sign Controls</h4>
             {selectedId && (
               <button 
                 onClick={() => {
                   recordHistory();
                   setElements(prev => prev.filter(x => x.id !== selectedId));
                   setSelectedId(null);
                 }} 
                 className="text-red-500 hover:text-red-700 transition" 
                 title="Delete Selected Item"
               >
                 <Trash2 size={15} />
               </button>
             )}
          </div>

          {/* Quick presets buttons */}
          <div className="space-y-4 shrink-0">
             <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase block mb-1">Add Signature Seals</span>
             
             <button 
               onClick={() => setShowSignModal(true)}
               className="w-full py-4 border border-teal-200 hover:border-teal-500 rounded-2xl flex items-center justify-center gap-2 bg-teal-50/25 text-teal-850 hover:bg-teal-50 transition shadow-xs hover:shadow hover:scale-[1.02] active:scale-[0.98] font-black text-xs"
             >
               <Award size={15} className="text-teal-650" /> Add Sign or Stamp
             </button>

             {/* Multiple Date formats toggle selector */}
             <div className="space-y-1.5 border border-slate-150 p-3 rounded-2xl bg-slate-50/50">
               <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Date Format Separators</label>
               <select 
                 value={selectedDateFormat}
                 onChange={(e) => setSelectedDateFormat(e.target.value)}
                 className="w-full bg-white border border-slate-205 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-700 outline-none"
               >
                 <option value="DD-MM-YYYY">{getFormattedDate("DD-MM-YYYY")} (DD-MM-YYYY)</option>
                 <option value="DD/MM/YYYY">{getFormattedDate("DD/MM/YYYY")} (DD/MM/YYYY)</option>
                 <option value="DD MMMM YYYY">{getFormattedDate("DD MMMM YYYY")} (DD Month YYYY)</option>
                 <option value="DD-MMM-YYYY">{getFormattedDate("DD-MMM-YYYY")} (DD-Mon-YYYY)</option>
                 <option value="DD/MMM/YYYY">{getFormattedDate("DD/MMM/YYYY")} (DD/Mon/YYYY)</option>
                 <option value="MM-DD-YYYY">{getFormattedDate("MM-DD-YYYY")} (MM-DD-YYYY)</option>
                 <option value="YYYY-MM-DD">{getFormattedDate("YYYY-MM-DD")} (YYYY-MM-DD)</option>
               </select>
               <button 
                 onClick={handleAddDate}
                 className="w-full mt-2 py-2.5 border border-slate-205 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-700 rounded-xl transition font-bold text-xs flex items-center justify-center gap-1.5"
               >
                 <Calendar size={13} className="text-slate-500" /> Insert Styled Date
               </button>
             </div>

             <button 
               onClick={() => spawnElement("text", "Double click to edit text box", 240, 30)}
               className="w-full py-3.5 border border-slate-200 hover:border-slate-450 rounded-2xl flex items-center justify-center gap-2 bg-white text-slate-705 hover:bg-slate-50 transition shadow-xs hover:scale-[1.02] active:scale-[0.98] font-bold text-xs"
             >
               <TypeIcon size={15} className="text-slate-500" /> Insert Text Annotation
             </button>
          </div>

          {/* Active selection element properties */}
          {selectedId && (
            <div className="border-t border-slate-100 pt-5 space-y-4 shrink-0">
              <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase block">Selected Element Properties</span>
              
              {(() => {
                const el = elements.find(x => x.id === selectedId);
                if (!el) return null;

                if (el.type === "text") {
                  return (
                    <div className="space-y-4">
                      {/* Font Size controls */}
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Text Font Size</label>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              recordHistory();
                              setElements(prev => prev.map(x => x.id === el.id ? { ...x, fontSize: Math.max(8, (x.fontSize || 12) - 1) } : x));
                            }}
                            className="bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-lg font-bold text-slate-700 flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="bg-slate-50 border border-slate-200 flex-1 h-8 rounded-lg text-xs font-bold text-slate-700 flex items-center justify-center tabular-nums">
                            {el.fontSize} pt
                          </span>
                          <button
                            onClick={() => {
                              recordHistory();
                              setElements(prev => prev.map(x => x.id === el.id ? { ...x, fontSize: Math.min(80, (x.fontSize || 12) + 1) } : x));
                            }}
                            className="bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded-lg font-bold text-slate-700 flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Font Family selector */}
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Font Family preset</label>
                        <select
                          value={el.fontFamily || "helv"}
                          onChange={(e) => {
                            recordHistory();
                            setElements(prev => prev.map(x => x.id === el.id ? { ...x, fontFamily: e.target.value } : x));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none"
                        >
                          <optgroup label="Sans-Serif (Modern)">
                            <option value="helv">Helvetica / Arial (Standard)</option>
                            <option value="inter">Inter (Clean UI)</option>
                            <option value="roboto">Roboto</option>
                            <option value="poppins">Poppins (Geometric)</option>
                            <option value="montserrat">Montserrat</option>
                            <option value="open-sans">Open Sans</option>
                            <option value="lato">Lato</option>
                            <option value="verdana">Verdana</option>
                            <option value="tahoma">Tahoma</option>
                            <option value="trebuchet">Trebuchet MS</option>
                          </optgroup>
                          <optgroup label="Serif (Classic & Elegant)">
                            <option value="times">Times New Roman (Standard)</option>
                            <option value="georgia">Georgia</option>
                            <option value="playfair">Playfair Display</option>
                            <option value="merriweather">Merriweather</option>
                            <option value="garamond">Garamond</option>
                          </optgroup>
                          <optgroup label="Monospace (Code/Typewriter)">
                            <option value="cour">Courier New (Standard)</option>
                            <option value="consolas">Consolas</option>
                            <option value="lucida">Lucida Console</option>
                          </optgroup>
                          <optgroup label="Handwriting / Scripts">
                            <option value="dancing">Dancing Script</option>
                            <option value="pacifico">Pacifico</option>
                            <option value="vibes">Great Vibes</option>
                            <option value="sacramento">Sacramento</option>
                          </optgroup>
                        </select>
                      </div>

                      {/* Text Color Presets */}
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase">Ink Color (Presets & Custom)</label>
                        <div className="flex gap-2 items-center flex-wrap">
                          {[
                            { value: "#0f172a", label: "Black" },
                            { value: "#1d4ed8", label: "Blue" },
                            { value: "#dc2626", label: "Red" }
                          ].map((ink) => (
                            <button
                              key={ink.value}
                              onClick={() => {
                                recordHistory();
                                setElements(prev => prev.map(x => x.id === el.id ? { ...x, color: ink.value } : x));
                              }}
                              style={{ backgroundColor: ink.value }}
                              className={`w-6 h-6 rounded-full border border-white ring-teal-500 ${el.color === ink.value ? "ring-2 scale-110" : ""}`}
                              title={ink.label}
                            />
                          ))}
                          
                          <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                            <input 
                              type="color" 
                              value={el.color || "#000000"}
                              onChange={(e) => {
                                recordHistory();
                                setElements(prev => prev.map(x => x.id === el.id ? { ...x, color: e.target.value } : x));
                              }}
                              className="w-5 h-5 border-0 rounded cursor-pointer p-0 bg-transparent"
                              title="Custom Color"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="space-y-4">
                      {/* Opacity handler */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase">
                          <span>Stamp Opacity</span>
                          <span className="tabular-nums">{Math.round((el.opacity || 1.0) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.10"
                          max="1.00"
                          step="0.05"
                          value={el.opacity || 1.0}
                          onChange={(e) => {
                            setElements(prev => prev.map(x => x.id === el.id ? { ...x, opacity: parseFloat(e.target.value) } : x));
                          }}
                          className="w-full accent-teal-650 h-1 bg-slate-100 rounded-lg cursor-pointer appearance-none"
                        />
                      </div>
                    </div>
                  );
                }
              })()}

            </div>
          )}

        </div>

      </div>

      {/* Signature Modal */}
      <SignModal 
        isOpen={showSignModal}
        onClose={() => setShowSignModal(false)}
        onSave={(item) => {
          spawnElement(item.type, item.value, item.width, item.height);
        }}
      />

    </div>
  );
}

// ---------------------------------------------------------------------
// 🖼️ Child Sign Canvas Overlay Drag Component
// ---------------------------------------------------------------------
interface SignElementProps {
  el: ElementType;
  isSelected: boolean;
  setSelectedId: (id: string | null) => void;
  zoom: number;
  pageDimensions: { width: number; height: number };
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  setElements: React.Dispatch<React.SetStateAction<ElementType[]>>;
  setResizing: (val: any) => void;
  isResizing: boolean;
  recordHistory: () => void;
}

function CanvasSignElement({
  el,
  isSelected,
  setSelectedId,
  zoom,
  pageDimensions,
  wrapperRef,
  setElements,
  setResizing,
  isResizing,
  recordHistory
}: SignElementProps) {
  const dragControls = useDragControls();
  const localRef = useRef<HTMLDivElement>(null);
  
  const pageW = pageDimensions.width;
  const pageH = pageDimensions.height;

  const [currentScale, setCurrentScale] = useState(1.0);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const computeScale = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        setCurrentScale(rect.width / pageW);
      }
    };
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, [wrapperRef, pageW, zoom]);

  return (
    <motion.div
      ref={localRef}
      drag={true}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      onPointerDown={(e) => {
        e.stopPropagation();
        setSelectedId(el.id);
        const target = e.target as HTMLElement;
        if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") {
          (document.activeElement as HTMLElement)?.blur();
        }
      }}
      onDragStart={() => recordHistory()}
      onDragEnd={(e, info) => {
        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const scaleRatio = rect.width / pageW;
        let newX = el.x;
        let newY = el.y;

        if (info && info.offset) {
          newX = el.x + info.offset.x / scaleRatio;
          newY = el.y + info.offset.y / scaleRatio;
        } else if (localRef.current) {
          const nodeRect = localRef.current.getBoundingClientRect();
          newX = (nodeRect.left - rect.left) / scaleRatio;
          newY = (nodeRect.top - rect.top) / scaleRatio;
        }

        newX = Math.max(0, Math.min(pageW - el.w, newX));
        newY = Math.max(0, Math.min(pageH - el.h, newY));

        setElements(prev => prev.map(item => item.id === el.id ? { ...item, x: newX, y: newY } : item));
      }}
      className={`absolute overflow-visible ${
        isSelected ? "ring-2 ring-teal-500 ring-offset-2 z-50 rounded-sm" : "z-20"
      }`}
      style={{
        left: `${(el.x / pageW) * 100}%`,
        top: `${(el.y / pageH) * 100}%`,
        width: `${(el.w / pageW) * 100}%`,
        height: `${(el.h / pageH) * 100}%`,
        opacity: el.opacity,
      }}
    >
      {/* Reposition Grip */}
      {isSelected && (
        <div 
          onPointerDown={(e) => {
            e.stopPropagation();
            (document.activeElement as HTMLElement)?.blur();
            dragControls.start(e);
          }}
          className="absolute -top-7 left-0 bg-teal-650 hover:bg-teal-700 text-white rounded-md px-2 py-0.5 text-[9px] font-black tracking-wider flex items-center gap-1 select-none pointer-events-auto cursor-move shadow-md z-[60] transition-colors"
        >
          <GripVertical size={10} /> MOVE
        </div>
      )}

      {/* Resize Handle */}
      {isSelected && (
        <div 
          onPointerDown={(e) => {
            e.stopPropagation();
            recordHistory();
            setResizing({ id: el.id, startX: e.clientX, startY: e.clientY, startW: el.w, startH: el.h });
          }}
          className="absolute -bottom-2 -right-2 w-5 h-5 bg-white border-[3px] border-teal-500 rounded-full cursor-nwse-resize z-50 shadow-md hover:scale-125 transition-transform"
        />
      )}

      {/* Renders image stamp */}
      {el.type === "image" && el.base64 ? (
        <img 
          src={el.base64} 
          className="w-full h-full object-contain cursor-move select-none" 
          onPointerDown={(e) => {
            e.stopPropagation();
            setSelectedId(el.id);
            dragControls.start(e);
          }}
          alt="Placed signature stamp" 
        />
      ) : el.type === "text" ? (
        <textarea
          autoFocus={isSelected}
          value={el.text || ""}
          onChange={(e) => {
            const val = e.target.value;
            setElements(prev => prev.map(item => item.id === el.id ? { ...item, text: val } : item));
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            setSelectedId(el.id);
          }}
          className="w-full h-full border-none outline-none resize-none overflow-hidden bg-transparent cursor-text select-text z-50 relative pointer-events-auto leading-tight"
          style={{
            color: el.color || "#000000",
            fontSize: `${(el.fontSize || 12) * currentScale}px`,
            fontFamily: getFontFamilyStyle(el.fontFamily)
          }}
        />
      ) : null}

    </motion.div>
  );
}

const getFontFamilyStyle = (fontKey: string = "helv") => {
  switch (fontKey) {
    // Sans-serif
    case "helv": return "Helvetica, Arial, sans-serif";
    case "inter": return "'Inter', sans-serif";
    case "roboto": return "'Roboto', sans-serif";
    case "poppins": return "'Poppins', sans-serif";
    case "montserrat": return "'Montserrat', sans-serif";
    case "open-sans": return "'Open Sans', sans-serif";
    case "lato": return "'Lato', sans-serif";
    case "arial": return "Arial, sans-serif";
    case "verdana": return "Verdana, Geneva, sans-serif";
    case "tahoma": return "Tahoma, Geneva, sans-serif";
    case "trebuchet": return "'Trebuchet MS', sans-serif";
    
    // Serif
    case "times": return "'Times New Roman', Times, serif";
    case "georgia": return "Georgia, serif";
    case "playfair": return "'Playfair Display', serif";
    case "merriweather": return "'Merriweather', serif";
    case "garamond": return "Garamond, serif";
    
    // Monospace
    case "cour": return "'Courier New', Courier, monospace";
    case "consolas": return "Consolas, monospace";
    case "lucida": return "'Lucida Console', Monaco, monospace";
    
    // Handwriting / Script
    case "dancing": return "'Dancing Script', cursive";
    case "pacifico": return "'Pacifico', cursive";
    case "vibes": return "'Great Vibes', cursive";
    case "sacramento": return "'Sacramento', cursive";
    
    default: return "Helvetica, Arial, sans-serif";
  }
};

