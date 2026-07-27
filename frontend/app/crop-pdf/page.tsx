"use client";

import { useState, useRef, useEffect } from "react";
import { UploadCloud, FileType, Crop, X, Download, RefreshCw, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import * as pdfjsLib from "pdfjs-dist";
import { logPDFOperation } from "@/lib/analytics";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface CropData {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface FileCropConfig {
  rangeType: "all" | "custom";
  customPages: string;        // e.g. "1, 4-6"
  activePageNum: number;      // the page currently open in the cropper
  pageCrops: Record<number, CropData>; // pageNum -> CropData
  deletedPages: number[];     // pages completely removed from PDF
}

const defaultCrop: CropData = { top: 0, bottom: 0, left: 0, right: 0 };

// Parse string like "1, 3-5" into array [1, 3, 4, 5]
const parsePages = (pagesStr: string, totalPages: number): number[] => {
  if (pagesStr === "all") {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (!pagesStr || pagesStr.trim() === "") {
    return [];
  }
  const result = new Set<number>();
  const parts = pagesStr.split(",");
  for (const part of parts) {
    const p = part.trim();
    if (p.includes("-")) {
      const [start, end] = p.split("-").map(Number);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) result.add(i);
      }
    } else {
      const pNum = Number(p);
      if (!isNaN(pNum)) result.add(pNum);
    }
  }
  return Array.from(result).filter((n) => n > 0 && n <= totalPages).sort((a, b) => a - b);
};

export default function CropPDFPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Record<number, Record<number, string>>>({}); // fileIdx -> pageNum -> dataURL
  const [cropSettings, setCropSettings] = useState<Record<number, FileCropConfig>>({}); // fileIdx -> config
  
  const [activeFileIdx, setActiveFileIdx] = useState<number>(0);
  const [fileTotalPages, setFileTotalPages] = useState<Record<number, number>>({});
  
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);

  // Interactive Dragging
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);
  
  // Carousel Pagination
  const [carouselOffset, setCarouselOffset] = useState(0);
  const ITEMS_PER_PAGE = 4;

  const extractPagePreview = async (fileIdx: number, pageNum: number, file: File) => {
    // Check if already extracted
    if (previews[fileIdx] && previews[fileIdx][pageNum]) return previews[fileIdx][pageNum];
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 }); 
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        
        setPreviews(prev => ({
            ...prev,
            [fileIdx]: { ...(prev[fileIdx] || {}), [pageNum]: dataUrl }
        }));
        return dataUrl;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const processUploadedPdfs = async (uploadedFiles: FileList | File[]) => {
    const newFiles = Array.from(uploadedFiles);
    
    const newSettings = { ...cropSettings };
    const newFileTotalPages = { ...fileTotalPages };
    const startIndex = files.length;
    
    setFiles(prev => [...prev, ...newFiles]);
    setRendering(true);

    try {
      for (let i = 0; i < newFiles.length; i++) {
          const file = newFiles[i];
          const actualIdx = startIndex + i;
          
          // Get total pages
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const totalPages = pdf.numPages;
          newFileTotalPages[actualIdx] = totalPages;
          
          // Setup config
          newSettings[actualIdx] = {
              rangeType: "all",
              customPages: "all",
              activePageNum: 1,
              pageCrops: { 1: { ...defaultCrop } },
              deletedPages: []
          };
          
          // Pre-extract first page
          await extractPagePreview(actualIdx, 1, file);
      }
      setFileTotalPages(newFileTotalPages);
      setCropSettings(newSettings);
      
      if (files.length === 0) setActiveFileIdx(0);
    } catch (error) {
      toast.error("Could not process PDFs.");
    } finally {
      setRendering(false);
    }
  };

  // Safe fetch properties
  const currentConfig = cropSettings[activeFileIdx] || { rangeType: "all", customPages: "all", activePageNum: 1, pageCrops: {}, deletedPages: [] };
  const currentTotalPages = fileTotalPages[activeFileIdx] || 1;
  const rawParsed = currentConfig.rangeType === "all" ? Array.from({length: currentTotalPages}, (_, i) => i+1) : parsePages(currentConfig.customPages, currentTotalPages);
  const deletedPages = currentConfig.deletedPages || [];
  const parsedPages = rawParsed.filter(p => !deletedPages.includes(p));
  
  // Auto-correct activePageNum if it gets out of bounds of parsedPages or doesn't exist
  useEffect(() => {
     if (parsedPages.length > 0 && !parsedPages.includes(currentConfig.activePageNum)) {
         updateConfig({ activePageNum: parsedPages[0] });
     }
  }, [currentConfig.customPages, currentConfig.rangeType, parsedPages, currentConfig.activePageNum]);

  // Load preview when activePageNum changes
  useEffect(() => {
      const activePage = currentConfig.activePageNum || 1;
      const file = files[activeFileIdx];
      if (file && (!previews[activeFileIdx] || !previews[activeFileIdx][activePage])) {
          extractPagePreview(activeFileIdx, activePage, file);
      }
  }, [activeFileIdx, currentConfig.activePageNum, files, previews]);
  
  // Pre-load thumbnails for the current carousel window
  useEffect(() => {
     const windowPages = parsedPages.slice(carouselOffset, carouselOffset + ITEMS_PER_PAGE);
     const file = files[activeFileIdx];
     if (file) {
         windowPages.forEach(p => {
             if (!previews[activeFileIdx] || !previews[activeFileIdx][p]) {
                 extractPagePreview(activeFileIdx, p, file);
             }
         });
     }
  }, [carouselOffset, parsedPages, activeFileIdx, files, previews]);

  const updateConfig = (updates: Partial<FileCropConfig>) => {
      setCropSettings(prev => ({
          ...prev,
          [activeFileIdx]: {
              ...prev[activeFileIdx],
              ...updates
          }
      }));
  };

  const removePageFromCrop = (pageNum: number) => {
      const newPages = parsedPages.filter(p => p !== pageNum);
      const currentDeleted = currentConfig.deletedPages || [];
      updateConfig({ 
          rangeType: "custom", 
          customPages: newPages.length > 0 ? newPages.join(", ") : "",
          deletedPages: [...currentDeleted, pageNum]
      });
      toast.success(`Page ${pageNum} will be DELETED from the PDF`);
  };

  const updatePageCrop = (pageNum: number, updates: Partial<CropData>) => {
      setCropSettings(prev => {
          const fileConfig = prev[activeFileIdx];
          const existingCrop = fileConfig.pageCrops[pageNum] || { ...defaultCrop };
          return {
              ...prev,
              [activeFileIdx]: {
                  ...fileConfig,
                  pageCrops: {
                      ...fileConfig.pageCrops,
                      [pageNum]: { ...existingCrop, ...updates }
                  }
              }
          }
      });
  };

  const activePageNum = currentConfig.activePageNum;
  const activeCrop = currentConfig.pageCrops[activePageNum] || { ...defaultCrop };
  const previewDataUrl = (previews[activeFileIdx] && previews[activeFileIdx][activePageNum]) || null;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;

      if (x < 0) x = 0;
      if (x > rect.width) x = rect.width;
      if (y < 0) y = 0;
      if (y > rect.height) y = rect.height;

      const xPct = (x / rect.width) * 100;
      const yPct = (y / rect.height) * 100;

      const minMargin = 2; // Keep at least 2% distance from opposite side
      
      let newLeft = activeCrop.left;
      let newRight = activeCrop.right;
      let newTop = activeCrop.top;
      let newBottom = activeCrop.bottom;

      if (isDragging === "tl" || isDragging === "l") newLeft = Math.min(xPct, 100 - activeCrop.right - minMargin);
      if (isDragging === "tr" || isDragging === "r") newRight = Math.min(100 - xPct, 100 - activeCrop.left - minMargin);
      if (isDragging === "tl" || isDragging === "tr" || isDragging === "t") newTop = Math.min(yPct, 100 - activeCrop.bottom - minMargin);
      if (isDragging === "bl" || isDragging === "br" || isDragging === "b") newBottom = Math.min(100 - yPct, 100 - activeCrop.top - minMargin);
      if (isDragging === "bl") newLeft = Math.min(xPct, 100 - activeCrop.right - minMargin);
      if (isDragging === "br") newRight = Math.min(100 - xPct, 100 - activeCrop.left - minMargin);

      updatePageCrop(activePageNum, { left: newLeft, right: newRight, top: newTop, bottom: newBottom });
    };

    const handleMouseUp = () => setIsDragging(null);

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
    } else {
      document.body.style.userSelect = "auto";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, activeCrop, activePageNum]);

  const handleDragStart = (e: React.MouseEvent, type: string) => {
    e.stopPropagation();
    setIsDragging(type);
  };

  const removeFile = (idxToRemove: number) => {
      const newFiles = [...files];
      newFiles.splice(idxToRemove, 1);
      
      const newSettings: Record<number, FileCropConfig> = {};
      const newPreviews: Record<number, Record<number, string>> = {};
      const newTotalPages: Record<number, number> = {};
      
      let newIdx = 0;
      for (let i=0; i <= files.length; i++) {
          if (i === idxToRemove) continue;
          if (cropSettings[i]) {
              newSettings[newIdx] = cropSettings[i];
              newPreviews[newIdx] = previews[i];
              newTotalPages[newIdx] = fileTotalPages[i];
              newIdx++;
          }
      }
      
      setFiles(newFiles);
      setCropSettings(newSettings);
      setPreviews(newPreviews);
      setFileTotalPages(newTotalPages);
      if (activeFileIdx === idxToRemove) setActiveFileIdx(0);
      else if (activeFileIdx > idxToRemove) setActiveFileIdx(activeFileIdx - 1);
  };

  const clearAll = () => {
      setFiles([]); setCropSettings({}); setPreviews({}); setFileTotalPages({}); setActiveFileIdx(0);
  };

  const handleUploadClick = async () => {
    if (files.length === 0) return;

    setLoading(true);
    const formData = new FormData();
    files.forEach(f => formData.append("files", f));
    
    // Construct settings payload expected by backend
    // Format: { "0": { "page_crops": { "1": {"top": 10}, "3": {"top": 0} } } }
    const exportSettings: Record<string, any> = {};
    for (const [idxStr, config] of Object.entries(cropSettings)) {
        const idx = Number(idxStr);
        const fTotalPages = fileTotalPages[idx];
        const pPages = config.rangeType === 'all' ? Array.from({length: fTotalPages}, (_, i) => i+1) : parsePages(config.customPages, fTotalPages);
        
        const pageCropsForExport: Record<string, any> = {};
        for (const p of pPages) {
            // Apply configured crop or default [0,0,0,0]
             pageCropsForExport[p.toString()] = config.pageCrops[p] || { ...defaultCrop };
        }
        
        exportSettings[idx] = { 
            page_crops: pageCropsForExport,
            deleted_pages: config.deletedPages || []
        };
    }
    
    formData.append("crop_settings", JSON.stringify(exportSettings));

    try {
      const res = await fetchWithAuth(api("/pdf/crop"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to crop PDF.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `DocIntel_Cropped_Files.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      logPDFOperation("Crop PDF", files.length);
      toast.success("PDFs cropped locally successfully!");
    } catch (err) {
      toast.error("Error cropping document.");
    } finally {
      setLoading(false);
    }
  };

  // Carousel handlers
  const nextCarousel = () => {
      if (carouselOffset + ITEMS_PER_PAGE < parsedPages.length) {
          setCarouselOffset(prev => prev + ITEMS_PER_PAGE);
      }
  };
  
  const prevCarousel = () => {
      if (carouselOffset - ITEMS_PER_PAGE >= 0) {
          setCarouselOffset(prev => prev - ITEMS_PER_PAGE);
      } else {
          setCarouselOffset(0);
      }
  };

  return (
    <RequireAuth>
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
        <div className="max-w-6xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
          
          <div className="bg-gradient-to-br from-green-600 to-emerald-700 p-8 text-white relative overflow-hidden flex flex-col items-center text-center">
            <div className="absolute opacity-10 top-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl -ml-20 -mt-20"></div>
            <h1 className="text-4xl font-extrabold flex items-center justify-center gap-3 relative z-10">
              <span className="bg-white/20 p-3 rounded-2xl shadow-inner backdrop-blur-sm"><Crop size={32} /></span>
              Intelligent Crop
            </h1>
            <p className="mt-4 text-green-100 font-medium text-lg max-w-xl relative z-10">
              Advanced Per-Page Cropping. Dial in unique boundaries for every single page.
            </p>
          </div>

          <div className="p-8">
            <div className="mb-8">
              {files.length === 0 ? (
                <label className="border-3 border-dashed border-green-200 bg-green-50/50 hover:bg-green-50 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors group h-64">
                  <div className="bg-green-100 p-4 rounded-full text-green-600 group-hover:scale-110 shadow-sm mb-4">
                    <UploadCloud size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Upload multiple PDFs</h3>
                  <p className="text-slate-500 text-sm mt-1">Select one or more files to apply dynamic cropping</p>
                  <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => {
                      if(e.target.files && e.target.files.length > 0) processUploadedPdfs(e.target.files);
                  }} />
                </label>
              ) : (
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-6 relative shadow-sm flex flex-col gap-6">
                  <div className="flex items-start md:items-center gap-4 justify-between border-b pb-4 flex-col md:flex-row">
                     <div className="flex items-center gap-4">
                       <div className="p-3 bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl text-green-600 shadow-inner">
                         <Layers size={24} />
                       </div>
                       <div>
                         <p className="font-bold text-slate-800 text-lg">{files.length} Files Uploaded</p>
                         <p className="text-sm font-medium text-slate-500">Pick a file to set its specific boundaries</p>
                       </div>
                     </div>
                     <div className="flex gap-2 w-full md:w-auto">
                        <label className="flex-1 md:flex-none cursor-pointer text-sm font-bold bg-white border border-green-200 text-green-600 px-4 py-2 rounded-full hover:bg-green-50 transition text-center whitespace-nowrap">
                            + Add More
                            <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => {
                                if(e.target.files && e.target.files.length > 0) processUploadedPdfs(e.target.files);
                            }} />
                        </label>
                        <button onClick={clearAll} className="flex-1 md:flex-none text-rose-500 hover:text-rose-700 font-bold transition-colors px-4 py-2 bg-white border border-rose-200 rounded-full hover:bg-rose-50 whitespace-nowrap">
                            Clear All
                        </button>
                     </div>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-6">
                     
                     {/* Dynamic Files List Sidebar equivalent */}
                     {files.length > 1 && (
                         <div className="w-full lg:w-48 bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 max-h-[500px] overflow-y-auto custom-scrollbar shrink-0 shadow-inner">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1 mb-1">Target Files</p>
                             {files.map((f, i) => (
                                 <button 
                                     key={i} 
                                     onClick={() => setActiveFileIdx(i)}
                                     className={`relative flex flex-col items-start gap-1 p-3 rounded-lg text-left transition-all border-2 group ${activeFileIdx === i ? "bg-green-50 border-green-400 shadow-sm" : "bg-slate-50 border-transparent hover:bg-slate-100 hover:border-slate-200"}`}
                                 >
                                     <span className={`text-xs font-bold truncate w-full pr-6 ${activeFileIdx === i ? "text-green-700" : "text-slate-600"}`}>
                                         {f.name}
                                     </span>
                                     <span 
                                         onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                         className="absolute top-1/2 -translate-y-1/2 right-2 bg-rose-100 text-rose-500 hover:bg-rose-500 hover:text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all border border-rose-200 hover:border-rose-500 shadow-sm"
                                         title="Remove File"
                                     >
                                         <X size={14} strokeWidth={3} />
                                     </span>
                                 </button>
                             ))}
                         </div>
                     )}

                     {/* Center Column: Thumbnails + Previews Box */}
                     <div className="flex-1 flex flex-col gap-4">
                         
                         {/* THUMBNAIL CAROUSEL (Top Line) */}
                         {parsedPages.length > 0 && (
                             <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-inner flex items-center justify-between">
                                <button disabled={carouselOffset === 0} onClick={prevCarousel} className="p-2 text-slate-400 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                                    <ChevronLeft size={24} />
                                </button>
                                
                                <div className="flex-1 flex gap-3 overflow-hidden justify-center max-w-full">
                                    {parsedPages.slice(carouselOffset, carouselOffset + ITEMS_PER_PAGE).map(pageNum => {
                                        const thumbUrl = previews[activeFileIdx]?.[pageNum];
                                        const isActive = pageNum === activePageNum;
                                        return (
                                            <div 
                                                key={pageNum}
                                                onClick={() => updateConfig({ activePageNum: pageNum })}
                                                className={`relative w-20 h-28 flex-shrink-0 rounded-lg cursor-pointer transition-all border-2 flex flex-col items-center justify-center bg-slate-100 group hover:border-green-300 ${isActive ? 'border-green-500 shadow-md transform scale-105' : 'border-transparent'}`}
                                            >
                                                {thumbUrl ? (
                                                    <img src={thumbUrl} className="max-w-full max-h-full object-contain pointer-events-none p-1 rounded" alt={`Page ${pageNum}`} />
                                                ) : (
                                                    <RefreshCw className="animate-spin text-slate-400" size={16} />
                                                )}
                                                <button 
                                                    onClick={(e) => { 
                                                      e.preventDefault(); 
                                                      e.stopPropagation(); 
                                                      removePageFromCrop(pageNum); 
                                                    }}
                                                    className="absolute -top-2 -right-2 bg-rose-100 hover:bg-rose-500 text-rose-500 hover:text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-sm border border-rose-200 hover:border-rose-500"
                                                    title="Exclude from cropping"
                                                >
                                                    <X size={12} strokeWidth={4} />
                                                </button>
                                                <div className={`absolute -bottom-2 -left-2 bg-white text-[10px] font-black px-1.5 py-0.5 rounded shadow ${isActive ? 'text-green-600 border border-green-200' : 'text-slate-500 border border-slate-200'}`}>
                                                    P{pageNum}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                <button disabled={carouselOffset + ITEMS_PER_PAGE >= parsedPages.length} onClick={nextCarousel} className="p-2 text-slate-400 hover:text-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition">
                                    <ChevronRight size={24} />
                                </button>
                             </div>
                         )}

                         <div className="flex-1 bg-slate-200/40 p-4 rounded-xl border border-slate-200 shadow-inner flex items-center justify-center min-h-[500px]">
                             {rendering ? (
                                 <div className="flex flex-col items-center">
                                     <RefreshCw className="animate-spin text-green-600 mb-4" size={40} />
                                     <span className="text-slate-500 font-medium">Extracting Vector Previews...</span>
                                 </div>
                             ) : previewDataUrl ? (
                                 <div className="relative inline-block border-2 border-white shadow-2xl rounded-sm group select-none" ref={containerRef}>
                                     {/* Base Image dynamically swaps! */}
                                     <img src={previewDataUrl} className="max-h-[600px] w-auto pointer-events-none select-none transition-opacity duration-300" draggable={false} alt="Preview" />
                                     
                                     {/* Dark Overlay Masks locked to the specific setup */}
                                     <div className="absolute top-0 left-0 right-0 bg-slate-900/60 pointer-events-none" style={{ height: `${activeCrop.top}%` }}></div>
                                     <div className="absolute bottom-0 left-0 right-0 bg-slate-900/60 pointer-events-none" style={{ height: `${activeCrop.bottom}%` }}></div>
                                     <div className="absolute top-0 left-0 bottom-0 bg-slate-900/60 pointer-events-none" style={{ width: `${activeCrop.left}%`, top: `${activeCrop.top}%`, bottom: `${activeCrop.bottom}%` }}></div>
                                     <div className="absolute top-0 right-0 bottom-0 bg-slate-900/60 pointer-events-none" style={{ width: `${activeCrop.right}%`, top: `${activeCrop.top}%`, bottom: `${activeCrop.bottom}%` }}></div>
                                     
                                     {/* Interactive Crop Boundary */}
                                     <div className="absolute border-[3px] border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.6)] flex items-center justify-center group-hover:border-emerald-300 transition-colors duration-200 overflow-visible" 
                                          style={{ top: `${activeCrop.top}%`, bottom: `${activeCrop.bottom}%`, left: `${activeCrop.left}%`, right: `${activeCrop.right}%` }}>
                                             
                                             {/* Edge Handles */}
                                             <div onMouseDown={(e)=>handleDragStart(e, "t")} className="absolute top-0 left-0 right-0 h-4 -mt-2 cursor-ns-resize z-10 flex justify-center"><div className="w-8 h-1.5 bg-emerald-400 rounded-full mt-1 bg-white border border-emerald-500"></div></div>
                                             <div onMouseDown={(e)=>handleDragStart(e, "b")} className="absolute bottom-0 left-0 right-0 h-4 -mb-2 cursor-ns-resize z-10 flex justify-center"><div className="w-8 h-1.5 bg-emerald-400 rounded-full mb-1 bg-white border border-emerald-500"></div></div>
                                             <div onMouseDown={(e)=>handleDragStart(e, "l")} className="absolute top-0 bottom-0 left-0 w-4 -ml-2 cursor-ew-resize z-10 flex items-center"><div className="h-8 w-1.5 bg-emerald-400 rounded-full ml-1 bg-white border border-emerald-500"></div></div>
                                             <div onMouseDown={(e)=>handleDragStart(e, "r")} className="absolute top-0 bottom-0 right-0 w-4 -mr-2 cursor-ew-resize z-10 flex items-center"><div className="h-8 w-1.5 bg-emerald-400 rounded-full mr-1 bg-white border border-emerald-500"></div></div>

                                             {/* Corner nodes */}
                                             <div onMouseDown={(e)=>handleDragStart(e, "tl")} className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-white border-4 border-emerald-500 rounded-full cursor-nwse-resize z-20 hover:scale-125 transition-transform"></div>
                                             <div onMouseDown={(e)=>handleDragStart(e, "tr")} className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-white border-4 border-emerald-500 rounded-full cursor-nesw-resize z-20 hover:scale-125 transition-transform"></div>
                                             <div onMouseDown={(e)=>handleDragStart(e, "bl")} className="absolute -bottom-2.5 -left-2.5 w-5 h-5 bg-white border-4 border-emerald-500 rounded-full cursor-nesw-resize z-20 hover:scale-125 transition-transform"></div>
                                             <div onMouseDown={(e)=>handleDragStart(e, "br")} className="absolute -bottom-2.5 -right-2.5 w-5 h-5 bg-white border-4 border-emerald-500 rounded-full cursor-nwse-resize z-20 hover:scale-125 transition-transform"></div>
                                     </div>
                                 </div>
                             ) : <div className="text-slate-400 font-bold">No Preview Available</div>}
                         </div>
                     </div>

                      {/* Config Box tied to active file & page */}
                      <div className="lg:w-80 space-y-5 bg-white p-5 rounded-xl border border-slate-200 h-fit">
                          <div className="flex justify-between items-center border-b pb-3">
                            <div>
                               <h3 className="font-bold text-slate-800 text-lg">Page Settings</h3>
                               <p className="text-[10px] uppercase font-bold text-green-600">Editing Page {activePageNum}</p>
                            </div>
                            <button 
                              onClick={() => { updatePageCrop(activePageNum, { top:0, left:0, right:0, bottom:0 }) }}
                              className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-lg uppercase tracking-wider hover:bg-slate-200 transition-colors"
                            >
                              Reset
                            </button>
                          </div>
                         
                         <div>
                            <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                               <span>Top</span> <span className="text-green-600">{Math.round(activeCrop.top)}%</span>
                            </div>
                            <input type="range" min="0" max="95" value={activeCrop.top} onChange={(e) => updatePageCrop(activePageNum, { top: Math.min(Number(e.target.value), 100 - activeCrop.bottom - 2) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600" />
                         </div>

                         <div>
                            <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                               <span>Bottom</span> <span className="text-green-600">{Math.round(activeCrop.bottom)}%</span>
                            </div>
                            <input type="range" min="0" max="95" value={activeCrop.bottom} onChange={(e) => updatePageCrop(activePageNum, { bottom: Math.min(Number(e.target.value), 100 - activeCrop.top - 2) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600" />
                         </div>

                         <div>
                            <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                               <span>Left</span> <span className="text-green-600">{Math.round(activeCrop.left)}%</span>
                            </div>
                            <input type="range" min="0" max="95" value={activeCrop.left} onChange={(e) => updatePageCrop(activePageNum, { left: Math.min(Number(e.target.value), 100 - activeCrop.right - 2) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600" />
                         </div>

                         <div>
                            <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                               <span>Right</span> <span className="text-green-600">{Math.round(activeCrop.right)}%</span>
                            </div>
                            <input type="range" min="0" max="95" value={activeCrop.right} onChange={(e) => updatePageCrop(activePageNum, { right: Math.min(Number(e.target.value), 100 - activeCrop.left - 2) })} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600" />
                         </div>

                          <div className="border-t pt-4 space-y-3">
                             <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                               Selected Pages for Cropping
                             </label>
                             <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-2">
                               <button 
                                 onClick={() => { updateConfig({rangeType: "all"}); setCarouselOffset(0); }}
                                 className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${currentConfig.rangeType === "all" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                               >
                                 PDF All Pages
                               </button>
                               <button 
                                 onClick={() => { updateConfig({rangeType: "custom", customPages: parsedPages.join(", ")}); setCarouselOffset(0); }}
                                 className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${currentConfig.rangeType === "custom" ? "bg-white text-green-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                                >
                                 Specific
                               </button>
                             </div>
                             
                             {currentConfig.rangeType === "custom" && (
                               <input 
                                 type="text" 
                                 placeholder={`e.g. 1, 3, 5-${currentTotalPages}`}
                                 value={currentConfig.customPages}
                                 onChange={(e) => {
                                     updateConfig({ customPages: e.target.value });
                                     setCarouselOffset(0);
                                 }}
                                 className="w-full bg-slate-50 border-2 border-green-200 focus:border-green-500 text-green-900 focus:bg-white px-3 py-2 rounded-xl outline-none transition-all font-bold text-sm mb-2"
                               />
                             )}
                             
                             <p className="text-xs text-slate-500 font-medium">
                                 Current file has {currentTotalPages} pages. Unselected pages will be kept identically as they are.
                             </p>
                          </div>

                         <button
                           onClick={handleUploadClick}
                           disabled={loading || rendering || files.length === 0}
                           className="w-full mt-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
                         >
                           {loading ? <RefreshCw className="animate-spin" /> : <Download size={20} className="stroke-[2.5]" />}
                           Download Processed ZIP
                         </button>
                     </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
