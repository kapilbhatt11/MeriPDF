"use client";

import { useState, useRef, useEffect } from "react";
import { UploadCloud, FileType, LayoutTemplate, Download, X, RefreshCw, RotateCw, Trash2, Plus, HelpCircle, FileText } from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import * as pdfjsLib from "pdfjs-dist";
import { logPDFOperation } from "@/lib/analytics";

// Next.js client-side PDF.js worker setup
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
}

interface PageData {
  id: string; // unique identifier
  type: "page" | "blank";
  fileIndex: number;
  originalIndex: number;
  src: string;
  rotation: number;
}

export default function OrganizePDFPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [pages, setPages] = useState<PageData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const scrollSpeed = useRef<number>(0);
  const scrollRaf = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      const globalBuffer = 120;
      const localBuffer = 80;
      const minSpeed = 5;
      const maxSpeed = 35;
      
      const distWindowTop = e.clientY;
      const distWindowBot = window.innerHeight - e.clientY;

      let speedTop = 0;
      let speedBot = 0;

      // Global window bounds
      if (distWindowTop >= 0 && distWindowTop < globalBuffer) {
        speedTop = Math.max(speedTop, (maxSpeed - minSpeed) * (1 - distWindowTop / globalBuffer) + minSpeed);
      }
      if (distWindowBot >= 0 && distWindowBot < globalBuffer) {
        speedBot = Math.max(speedBot, (maxSpeed - minSpeed) * (1 - distWindowBot / globalBuffer) + minSpeed);
      }

      // Container bounds
      if (scrollContainerRef.current) {
         const rect = scrollContainerRef.current.getBoundingClientRect();
         const distLocalTop = e.clientY - rect.top;
         const distLocalBot = rect.bottom - e.clientY;
         
         if (e.clientX >= rect.left && e.clientX <= rect.right) {
             if (distLocalTop >= -localBuffer && distLocalTop < localBuffer) {
                 const ratio = Math.max(0, distLocalTop) / localBuffer;
                 speedTop = Math.max(speedTop, (maxSpeed - minSpeed) * (1 - ratio) + minSpeed);
             }
             if (distLocalBot >= -localBuffer && distLocalBot < localBuffer) {
                 const ratio = Math.max(0, distLocalBot) / localBuffer;
                 speedBot = Math.max(speedBot, (maxSpeed - minSpeed) * (1 - ratio) + minSpeed);
             }
         }
      }

      if (speedTop > 0 && speedBot === 0) {
        scrollSpeed.current = -speedTop;
      } else if (speedBot > 0 && speedTop === 0) {
        scrollSpeed.current = speedBot;
      } else if (speedTop > 0 && speedBot > 0) {
        scrollSpeed.current = speedTop > speedBot ? -speedTop : speedBot;
      } else {
        scrollSpeed.current = 0;
      }
    };

    const handleGlobalDragEnd = () => {
      scrollSpeed.current = 0;
      setIsDragging(false);
    };

    window.addEventListener("dragover", handleGlobalDragOver, false);
    window.addEventListener("drop", handleGlobalDragEnd, false);
    window.addEventListener("dragend", handleGlobalDragEnd, false);
    window.addEventListener("dragleave", (e) => {
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        handleGlobalDragEnd();
      }
    }, false);

    const step = () => {
      if (scrollSpeed.current !== 0 && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += scrollSpeed.current;
      }
      scrollRaf.current = requestAnimationFrame(step);
    };
    scrollRaf.current = requestAnimationFrame(step);
    
    return () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
      window.removeEventListener("dragover", handleGlobalDragOver, false);
      window.removeEventListener("drop", handleGlobalDragEnd, false);
      window.removeEventListener("dragend", handleGlobalDragEnd, false);
    };
  }, []);

  const processUploadedPdfs = async (uploadedFiles: FileList | File[]) => {
    const newFiles = Array.from(uploadedFiles);
    setFiles(prev => [...prev, ...newFiles]);
    setRendering(true);

    try {
      const allGeneratedPages: PageData[] = [...pages];
      const startIndex = files.length; // offset for new files
      
      for (let fIndex = 0; fIndex < newFiles.length; fIndex++) {
        const file = newFiles[fIndex];
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.5 }); 
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (ctx) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;
            allGeneratedPages.push({ 
              id: Math.random().toString(36).substring(2, 10),
              type: "page",
              fileIndex: startIndex + fIndex,
              originalIndex: i - 1, 
              src: canvas.toDataURL("image/jpeg", 0.6),
              rotation: 0
            });
          }
        }
      }
      setPages(allGeneratedPages);
    } catch (error) {
      toast.error("Could not generate visual previews for these PDFs.");
    } finally {
      setRendering(false);
    }
  };

  const handleSort = () => {
    const fromIndex = dragItem.current;
    const toIndex = dragOverItem.current;

    if (fromIndex === null || toIndex === null) return;
    
    setPages(prev => {
        const _pages = [...prev];
        const draggedElement = _pages[fromIndex];
        
        _pages.splice(fromIndex, 1);
        _pages.splice(toIndex, 0, draggedElement);
        return _pages;
    });
    
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const addBlankPage = (index: number) => {
    setPages(prev => {
      const _pages = [...prev];
      _pages.splice(index + 1, 0, {
        id: Math.random().toString(36).substring(2, 10),
        type: "blank",
        fileIndex: -1,
        originalIndex: -1,
        src: "", 
        rotation: 0
      });
      return _pages;
    });
    toast.success("Successfully added a blank page.");
  };

  const rotatePage = (index: number) => {
    setPages(prev => {
      const _pages = [...prev];
      _pages[index] = { ..._pages[index], rotation: (_pages[index].rotation + 90) % 360 };
      return _pages;
    });
  };

  const deletePage = (index: number) => {
    setPages(prev => {
      const _pages = [...prev];
      _pages.splice(index, 1);
      return _pages;
    });
  };

  const handleUploadClick = async () => {
    if (files.length === 0 || pages.length === 0) return;

    setLoading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    
    const config = pages.map(p => ({
      type: p.type,
      fileIndex: p.fileIndex,
      originalIndex: p.originalIndex,
      rotation: p.rotation
    }));
    formData.append("config", JSON.stringify(config));

    try {
      const res = await fetchWithAuth(api("/pdf/organize"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = "Failed to organize PDF.";
        try {
          const errData = await res.json();
          if (errData?.detail) msg = String(errData.detail);
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MeriPDF_Organized.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success("PDF organized successfully!");
      logPDFOperation("Organize PDF", pages.length);
    } catch (err) {
      toast.error((err as Error).message || "Error organizing document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="max-w-7xl mx-auto px-6 pb-6 pt-4 relative">
        
        {isDragging && (
           <>
              <div className="fixed top-0 left-0 right-0 h-32 bg-gradient-to-b from-indigo-500/10 to-transparent z-[100] flex items-start justify-center pointer-events-none transition-all duration-300">
                 <div className="mt-4 bg-indigo-600 backdrop-blur-sm text-white px-6 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 animate-bounce border border-indigo-400">
                    ⬆️ Drag here to Scroll Up
                 </div>
              </div>
              <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-indigo-500/10 to-transparent z-[100] flex items-end justify-center pointer-events-none transition-all duration-300">
                 <div className="mb-4 bg-indigo-600 backdrop-blur-sm text-white px-6 py-2 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 animate-bounce border border-indigo-400">
                    ⬇️ Drag here to Scroll Down
                 </div>
              </div>
           </>
        )}

        {/* --- Top Premium Header --- */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-black flex items-center gap-3 text-slate-900">
            <div className="bg-indigo-55 bg-indigo-50 p-2.5 rounded-xl text-indigo-600 border border-indigo-100 shadow-inner">
              <LayoutTemplate className="w-8 h-8" />
            </div>
            Organize PDF
          </h1>
          
          <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
            <div className="hidden lg:block bg-slate-50 border border-slate-200 text-slate-700 py-2.5 px-4 rounded-xl text-xs font-semibold shadow-inner">
              Reorder mode: <strong className="text-slate-900">Drag thumbnails, insert blank sheets & rotate pages</strong> visually.
            </div>

            {/* Help Button */}
            <button
              onClick={() => setShowHelp(true)}
              className="bg-slate-50 text-slate-700 hover:bg-slate-100 p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 shadow-sm transition flex items-center justify-center gap-2 font-bold text-xs cursor-pointer"
              title="How to Use"
            >
              <HelpCircle size={20} className="text-indigo-600" />
              <span>How to Use</span>
            </button>
          </div>
        </div>

        {/* Help Modal */}
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4" onClick={() => setShowHelp(false)}>
             <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 relative animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-full transition">
                   <X size={18} />
                </button>
                <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                   <HelpCircle className="text-indigo-600" /> How to Organize PDFs
                </h2>
                <ul className="space-y-4 text-slate-700 font-bold text-xs leading-relaxed">
                   <li className="flex gap-3"><span className="bg-indigo-100 text-indigo-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">1</span> Upload your PDF(s) to instantly generate visual thumbnails of every page.</li>
                   <li className="flex gap-3"><span className="bg-indigo-100 text-indigo-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">2</span> Click and drag any page card to reorder it inside the workspace grid.</li>
                   <li className="flex gap-3"><span className="bg-indigo-100 text-indigo-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">3</span> Hover over a thumbnail to rotate it 90 degrees clockwise or delete it completely.</li>
                   <li className="flex gap-3"><span className="bg-indigo-100 text-indigo-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">4</span> Hover over the visual guide line between any two pages and click the insert button to add a blank page sheet.</li>
                   <li className="flex gap-3"><span className="bg-indigo-100 text-indigo-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">5</span> Hit the Download PDF button to compile your modifications instantly!</li>
                </ul>
                <button onClick={() => setShowHelp(false)} className="w-full mt-8 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition text-sm">Got it, let's start!</button>
             </div>
          </div>
        )}

        {/* Global Progress Loading Overlay */}
        {(rendering || loading) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 animate-pulse"></div>
              
              <div className="relative mb-6 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                <div className="absolute bg-indigo-50 p-3.5 rounded-full">
                  <LayoutTemplate className="w-7 h-7 text-indigo-600 animate-bounce" />
                </div>
              </div>
              
              <h3 className="text-2xl font-black text-slate-900 mb-2">
                {rendering ? "Generating Workspace" : "Compiling Document"}
              </h3>
              
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-6 overflow-hidden">
                <div className="h-full bg-indigo-600 rounded-full w-2/3 animate-pulse"></div>
              </div>
              
              <p className="text-slate-700 text-xs font-bold leading-relaxed">
                {rendering 
                  ? "Importing files and generating visual page thumbnails to build your interactive workspace reorder board..." 
                  : "Secured PDF engine is re-assembling page configurations and committing rotations..."
                }
              </p>
            </div>
          </div>
        )}

        {/* Upload Zone */}
        {files.length === 0 ? (
          <div className="w-full bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 flex flex-col items-center justify-center text-center shadow-sm hover:border-indigo-400 transition-colors duration-300 group">
            <div className="bg-indigo-50 p-5 rounded-3xl text-indigo-600 mb-4 group-hover:scale-110 transition-transform duration-350 shadow-inner">
              <LayoutTemplate className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Organize PDF Document</h3>
            <p className="text-slate-700 text-sm max-w-sm mt-2 mb-6 font-semibold">
              Select one or multiple PDF documents to visually drag-and-drop, add blank cells, and delete sheets.
            </p>
            <label className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-8 rounded-xl shadow active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 text-sm shadow-indigo-500/10">
              📂 Select PDF Files
              <input
                type="file"
                multiple
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    processUploadedPdfs(e.target.files);
                  }
                }}
              />
            </label>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 items-start relative pb-28">
            
            {/* Visual Reorder Board */}
            <div 
              ref={scrollContainerRef}
              className="flex-1 h-[68vh] overflow-y-auto pr-2 pb-10 border border-slate-100 bg-slate-50/20 p-6 rounded-3xl shadow-inner scrollbar-thin"
              onDragOver={(e) => { e.preventDefault(); }}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 mb-6">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    Document Reorder Board
                  </h3>
                  <p className="text-xs text-slate-500 font-bold mt-0.5 animate-pulse">
                    Drag elements to rearrange. Hover between segments to insert empty sheets.
                  </p>
                </div>
                
                {pages.length > 0 && (
                  <button
                    onClick={() => {
                      setFiles([]);
                      setPages([]);
                    }}
                    className="text-[10px] uppercase tracking-wider font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/60 px-3 py-1.5 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                  >
                    Clear Workspace
                  </button>
                )}
              </div>

              {/* Grid content */}
              <div className={`flex flex-wrap gap-y-6 gap-x-2 justify-start transition-all duration-300 ${isDragging ? "opacity-75" : ""}`}>
                {pages.map((page, idx) => (
                  <div key={page.id} className="flex items-center">
                    
                    {/* Visual Card */}
                    <div
                      draggable
                      onDragStart={(e) => {
                        dragItem.current = idx;
                        setTimeout(() => setIsDragging(true), 0);
                      }}
                      onDragEnter={(e) => {
                        dragOverItem.current = idx;
                        const ct = e.currentTarget;
                        if (dragItem.current !== null && dragItem.current !== idx) {
                          if (dragItem.current > idx) {
                            ct.classList.add('border-l-4', 'border-indigo-500', 'scale-[1.03]', 'shadow-xl');
                          } else {
                            ct.classList.add('border-r-4', 'border-indigo-500', 'scale-[1.03]', 'shadow-xl');
                          }
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('border-l-4', 'border-r-4', 'border-indigo-500', 'scale-[1.03]', 'shadow-xl');
                      }}
                      onDrop={(e) => {
                        e.currentTarget.classList.remove('border-l-4', 'border-r-4', 'border-indigo-500', 'scale-[1.03]', 'shadow-xl');
                      }}
                      onDragEnd={() => {
                        setIsDragging(false);
                        handleSort();
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      className={`relative flex flex-col items-center justify-center p-3.5 bg-white border border-slate-200 rounded-2xl transition-all duration-300 w-36 shadow-sm hover:border-indigo-400 group cursor-grab active:cursor-grabbing select-none`}
                    >
                      <div className="w-full aspect-[3/4] overflow-hidden rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1.5 relative">
                        {page.type === "blank" ? (
                          <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                            <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Blank Page</span>
                            <div className="w-6 h-6 border-2 border-dashed border-indigo-405 border-indigo-400 rounded mt-1.5 flex items-center justify-center text-indigo-500 bg-indigo-50 font-bold">+</div>
                          </div>
                        ) : (
                          <img
                            src={page.src}
                            style={{ transform: `rotate(${page.rotation}deg)` }}
                            className="max-w-full max-h-full object-contain rounded shadow-sm pointer-events-none transition-transform duration-300"
                          />
                        )}

                        {/* Hover Action Overlays */}
                        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-xl">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              rotatePage(idx);
                            }}
                            className="bg-white hover:bg-orange-50 hover:text-orange-600 p-2 rounded-xl text-slate-800 shadow-md hover:scale-105 transition-all cursor-pointer"
                            title="Rotate 90° Clockwise"
                          >
                            <RotateCw size={15} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePage(idx);
                            }}
                            className="bg-white hover:bg-rose-50 hover:text-rose-600 p-2 rounded-xl text-rose-550 text-rose-600 shadow-md hover:scale-105 transition-all cursor-pointer"
                            title="Delete Page"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Absolute page badge */}
                      <span className="absolute top-4 left-4 bg-slate-800 text-white font-black text-[9px] w-5 h-5 flex items-center justify-center rounded-full shadow-sm">
                        {idx + 1}
                      </span>

                      {/* State indicator name */}
                      <div className="mt-3 text-center w-full">
                        <span className={`text-[9px] uppercase tracking-wide font-black px-2.5 py-1 rounded-lg border transition-all ${
                          page.type === "blank" 
                            ? "bg-indigo-50 border-indigo-100 text-indigo-755 text-indigo-700" 
                            : "bg-slate-50 border-slate-200 text-slate-700 group-hover:border-indigo-200 group-hover:text-indigo-600"
                        }`}>
                          {page.type === "blank" ? "Blank Sheet" : `Page ${page.originalIndex + 1}`}
                        </span>
                      </div>
                    </div>

                    {/* Inserts vertical guide line spacer-block */}
                    <div className="flex items-center justify-center group/insert h-[180px] w-6 relative transition-all duration-300 px-1">
                      <div className="w-0.5 h-16 bg-slate-200 group-hover/insert:bg-indigo-400 group-hover/insert:h-28 transition-all rounded duration-300"></div>
                      <button
                        onClick={() => addBlankPage(idx)}
                        title="Insert Blank Page Here"
                        className="absolute inset-y-0 inset-x-0 flex items-center justify-center bg-transparent group-hover/insert:bg-indigo-50/20 cursor-pointer"
                      >
                        <Plus 
                          size={15} 
                          className="bg-white border border-slate-200 rounded-full p-0.5 text-slate-400 opacity-0 group-hover/insert:opacity-100 group-hover/insert:text-indigo-650 group-hover/insert:text-indigo-600 group-hover/insert:border-indigo-400 transition-all shadow duration-250 w-5 h-5" 
                        />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </div>

            {/* Sidebar Controls */}
            <div className="w-full lg:w-80 bg-white border border-slate-200 rounded-3xl p-6 shadow-md sticky top-6">
              <h2 className="text-xl font-black text-slate-900 border-b border-slate-200 pb-4 mb-4 flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-indigo-600" />
                Organize Controls
              </h2>
              
              <div className="space-y-6">
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl shadow-inner">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black block mb-1">Queue Status</span>
                  <p className="text-xs font-bold text-slate-800">{files.length} Source file(s)</p>
                  <p className="text-[10px] font-bold text-slate-500 mt-1">{pages.length} Total Output Sheets</p>
                </div>

                {/* Dashboard Count Details */}
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100 flex flex-col justify-center">
                    <span className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider block">Blank Pages</span>
                    <span className="text-lg font-black text-indigo-900 mt-1">{pages.filter(p => p.type === "blank").length}</span>
                  </div>
                  <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 flex flex-col justify-center">
                    <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider block">Rotated</span>
                    <span className="text-lg font-black text-amber-900 mt-1">{pages.filter(p => p.rotation !== 0).length}</span>
                  </div>
                </div>

                {/* Add files / Clear actions */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  <label className="cursor-pointer bg-slate-900 text-white font-bold py-2.5 text-center px-4 rounded-xl shadow-sm hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-xs">
                    <Plus size={16} /> Add More Files
                    <input 
                      type="file" 
                      multiple 
                      accept="application/pdf" 
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          processUploadedPdfs(e.target.files);
                        }
                        e.target.value = '';
                      }} 
                    />
                  </label>
                  <button 
                    onClick={() => { setFiles([]); setPages([]); }}
                    className="bg-slate-50 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                  >
                    <Trash2 size={14} className="text-slate-550 text-slate-550 text-slate-500 hover:text-rose-705 key hover:text-rose-700" /> Clear workspace
                  </button>
                </div>

                {/* Download PDF button with hover and active states */}
                <button
                  onClick={handleUploadClick}
                  disabled={loading || rendering || pages.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-805 active:bg-indigo-800 text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-sm disabled:opacity-50 disabled:pointer-events-none hover:shadow-lg"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </button>
              </div>
            </div>

          </div>
        )}

      </div>
    </RequireAuth>
  );
}
