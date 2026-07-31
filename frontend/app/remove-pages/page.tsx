"use client";

import { useState, useEffect, useRef } from "react";
import { UploadCloud, FileType, Download, Trash2, X, RefreshCw, HelpCircle, FileText } from "lucide-react";
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

export default function RemovePagesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pagesStr, setPagesStr] = useState("");
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // PDF Visual state
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  const [totalNumPages, setTotalNumPages] = useState(0);

  // Mobile navigation swipe states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const diffX = e.touches[0].clientX - touchStartX.current;
      const diffY = e.touches[0].clientY - touchStartY.current;

      // Check if horizontal swipe is dominant
      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (!isDrawerOpen) {
          // Swipe right from left edge (clientX < 60) to open drawer
          if (diffX > 50 && touchStartX.current < 60) {
            setIsDrawerOpen(true);
            touchStartX.current = null;
            touchStartY.current = null;
          }
        } else {
          // Swipe left to close drawer
          if (diffX < -50) {
            setIsDrawerOpen(false);
            touchStartX.current = null;
            touchStartY.current = null;
          }
        }
      }
    };

    const handleTouchEnd = () => {
      touchStartX.current = null;
      touchStartY.current = null;
    };

    window.addEventListener("touchstart", handleTouchStart);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDrawerOpen]);

  // Parse string like "1, 3-5" into a Set of numbers
  const parseRanges = (str: string): Set<number> => {
    let result = new Set<number>();
    const parts = str.split(",");
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;
      if (p.includes("-")) {
        const [start, end] = p.split("-");
        const s = parseInt(start),
          e = parseInt(end);
        if (!isNaN(s) && !isNaN(e)) {
          for (let i = Math.min(s, e); i <= Math.max(s, e); i++) result.add(i);
        }
      } else {
        const v = parseInt(p);
        if (!isNaN(v)) result.add(v);
      }
    }
    return result;
  };

  // Convert Set backwards to "1, 3-5"
  const buildRangesString = (set: Set<number>): string => {
    if (set.size === 0) return "";
    const arr = Array.from(set).sort((a, b) => a - b);
    const ranges = [];
    let start = arr[0];
    let end = arr[0];

    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === end + 1) {
        end = arr[i];
      } else {
        if (start === end) ranges.push(`${start}`);
        else ranges.push(`${start}-${end}`);
        start = arr[i];
        end = arr[i];
      }
    }
    if (start === end) ranges.push(`${start}`);
    else ranges.push(`${start}-${end}`);

    return ranges.join(", ");
  };

  const processUploadedPdf = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setRendering(true);
    setThumbnails([]);
    setSelectedPages(new Set());
    setPagesStr("");
    setLastClicked(null);

    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      setTotalNumPages(pdf.numPages);

      const generatedUrls: string[] = [];
      // Generate standard small thumbnails for quick preview
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 }); // Keep it lightweight
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, viewport }).promise;
          generatedUrls.push(canvas.toDataURL("image/jpeg", 0.6));
        }
      }
      setThumbnails(generatedUrls);
    } catch (error) {
      console.error("PDF Parsing error:", error);
      toast.error("Could not generate visual previews for this PDF.");
    } finally {
      setRendering(false);
    }
  };

  // Handle visual thumbnail click
  const handlePageClick = (pageNumber: number, event: React.MouseEvent) => {
    const newSelected = new Set(selectedPages);

    if (event.shiftKey && lastClicked !== null) {
      const start = Math.min(lastClicked, pageNumber);
      const end = Math.max(lastClicked, pageNumber);
      
      // On shift click, usually we "add" all to selection
      for (let i = start; i <= end; i++) {
        newSelected.add(i);
      }
    } else {
      if (newSelected.has(pageNumber)) {
        newSelected.delete(pageNumber);
      } else {
        newSelected.add(pageNumber);
      }
    }

    setSelectedPages(newSelected);
    setLastClicked(pageNumber);
    setPagesStr(buildRangesString(newSelected)); // Sync to string input instantly!
  };

  // Handle manual string input by User
  const handleStringInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPagesStr(val);
    
    // Attempt parse
    const parsedSet = parseRanges(val);
    
    // Ensure they don't select out of bounds pages manually
    const validSet = new Set<number>();
    parsedSet.forEach(p => {
        if(p >= 1 && p <= totalNumPages) validSet.add(p);
    });
    
    setSelectedPages(validSet);
  };

  const handleUploadClick = async () => {
    if (!file) return toast.error("Please upload a PDF first.");
    if (selectedPages.size === 0) return toast.error("No pages selected to remove.");

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("pages", JSON.stringify(Array.from(selectedPages)));

    try {
      const res = await fetchWithAuth(api("/pdf/remove-pages"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = "Failed to remove pages.";
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
      link.download = `MeriPDF_Removed_Pages.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      logPDFOperation("Remove Pages", selectedPages.size);
      toast.success("Pages removed successfully!");
    } catch (err) {
      toast.error((err as Error).message || "Error removing pages. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="max-w-7xl mx-auto px-6 pb-6 pt-4 relative">
        
        {/* --- Top Premium Header --- */}
        <div className="bg-white border border-slate-205 border-slate-200 rounded-3xl p-6 mb-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-black flex items-center gap-3 text-slate-900">
            <div className="bg-rose-50 p-2.5 rounded-xl text-rose-600 border border-rose-100 shadow-inner">
              <Trash2 className="w-8 h-8" />
            </div>
            Remove Pages
          </h1>
          
          <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
            <div className="hidden lg:block bg-slate-50 border border-slate-150 text-slate-700 py-2.5 px-4 rounded-xl text-xs font-semibold shadow-inner">
              Visual mode: <strong className="text-slate-950 text-slate-900">Delete selected sheets</strong> instantly.
            </div>

            {/* Help Button */}
            <button
              onClick={() => setShowHelp(true)}
              className="bg-slate-50 text-slate-750 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-250 hover:border-slate-300 shadow-sm transition flex items-center justify-center gap-2 font-bold text-xs cursor-pointer"
              title="How to Use"
            >
              <HelpCircle size={20} className="text-rose-500" />
              <span className="hidden sm:inline">How to Use</span>
            </button>
            
            {file && (
              <button
                onClick={() => {
                  setFile(null);
                  setThumbnails([]);
                  setSelectedPages(new Set());
                  setPagesStr("");
                  setLastClicked(null);
                }}
                className="text-xs bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-500 hover:text-white px-4 py-2.5 rounded-xl font-bold transition cursor-pointer"
              >
                Remove File
              </button>
            )}
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
                   <HelpCircle className="text-rose-600" /> How to use Visual Removal
                </h2>
                <ul className="space-y-4 text-slate-700 font-bold text-xs leading-relaxed">
                   <li className="flex gap-3"><span className="bg-rose-100 text-rose-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">1</span> Upload your PDF to instantly generate visual thumbnails.</li>
                   <li className="flex gap-3"><span className="bg-rose-100 text-rose-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">2</span> Click on any page to mark it for deletion (it will show a trash icon).</li>
                   <li className="flex gap-3"><span className="bg-rose-100 text-rose-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">3</span> <span className="flex-1"><b>Pro Tip:</b> Click a page, hold <code>Shift</code>, and click another page to select a huge range instantly!</span></li>
                   <li className="flex gap-3"><span className="bg-rose-100 text-rose-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">4</span> Alternatively, type exact page ranges (e.g. <code>1-4, 8</code>) in the text box in the sidebar.</li>
                   <li className="flex gap-3"><span className="bg-rose-100 text-rose-700 font-bold px-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0">5</span> Click the Download button to receive your brand new PDF!</li>
                </ul>
                <button onClick={() => setShowHelp(false)} className="w-full mt-8 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition text-sm">Got it, let's go!</button>
             </div>
          </div>
        )}

        {/* Interactive Loader Overlay */}
        {(rendering || loading) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-pink-500 to-red-600 animate-pulse"></div>
              
              <div className="relative mb-6 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-4 border-rose-100 border-t-rose-600 animate-spin"></div>
                <div className="absolute bg-rose-50 p-3.5 rounded-full">
                  <Trash2 className="w-7 h-7 text-rose-600 animate-bounce" />
                </div>
              </div>
              
              <h3 className="text-2xl font-black text-slate-900 mb-2">
                {rendering ? "Generating Previews" : "Removing Pages"}
              </h3>
              
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-6 overflow-hidden">
                <div className="h-full bg-rose-600 rounded-full w-2/3 animate-pulse"></div>
              </div>
              
              <p className="text-slate-700 text-xs font-bold leading-relaxed">
                {rendering 
                  ? "Rendering high-precision page previews to build your interactive workspace..." 
                  : "Secured PDF processing engine is rebuilding documents by removing active sequence selections..."
                }
              </p>
            </div>
          </div>
        )}

        {/* Upload Zone */}
        {!file && (
          <div className="w-full bg-white border-2 border-dashed border-slate-205 border-slate-205/60 border-slate-200 rounded-3xl p-16 flex flex-col items-center justify-center text-center shadow-sm hover:border-rose-400 transition-colors duration-300 group">
            <div className="bg-rose-50 p-5 rounded-3xl text-rose-600 mb-4 group-hover:scale-110 transition-transform duration-350 shadow-inner">
              <Trash2 className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold text-slate-850">Remove PDF Pages</h3>
            <p className="text-slate-700 text-sm max-w-sm mt-2 mb-6 font-semibold">
              Upload a PDF document to visually delete page sheets on an interactive thumbnail explorer.
            </p>
            <label className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-rose-600/20 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 text-sm">
              📂 Choose PDF File
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processUploadedPdf(e.target.files[0]);
                  }
                }}
              />
            </label>
          </div>
        )}

        {file && thumbnails.length > 0 && (
          <div className="flex flex-col lg:flex-row gap-8 items-start relative pb-28">
            
            {/* Visual Grid Preview Explorer */}
            <div className="flex-1 h-[68vh] overflow-y-auto pr-2 pb-10 border border-slate-100 bg-slate-50/30 p-6 rounded-3xl shadow-inner">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/80">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-rose-500" />
                    PDF Page Explorer
                  </h3>
                  <p className="text-xs text-slate-750 mt-0.5 font-bold">
                    Select pages to delete. Hold <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[9px] text-rose-605 font-bold">Shift</code> to delete ranges.
                  </p>
                </div>
                
                {selectedPages.size > 0 && (
                  <button
                    onClick={() => {
                      setSelectedPages(new Set());
                      setPagesStr("");
                    }}
                    className="text-[10px] uppercase tracking-wider font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/60 px-3 py-1.5 rounded-lg border border-rose-150 transition-colors cursor-pointer"
                  >
                    Deselect All
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 animate-in fade-in duration-300">
                {thumbnails.map((src, idx) => {
                  const pageNum = idx + 1;
                  const isSelected = selectedPages.has(pageNum);
                  return (
                    <div
                      key={pageNum}
                      onClick={(e) => handlePageClick(pageNum, e)}
                      className={`relative p-3 bg-white border rounded-2xl transition-all duration-300 group select-none cursor-pointer ${
                        isSelected
                          ? "border-rose-550 border-rose-600 bg-rose-50/10 ring-2 ring-rose-650/20 scale-[1.01] shadow"
                          : "border-slate-200 hover:border-rose-450 hover:border-rose-500 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <div className="w-full aspect-[3/4] overflow-hidden rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1 relative">
                        <img
                          src={src}
                          alt={`Page ${pageNum}`}
                          className={`w-full h-full object-contain rounded-lg transition-all duration-300 ${
                            isSelected ? "grayscale brightness-75 blur-[0.5px] scale-[0.98]" : "group-hover:scale-[1.02]"
                          }`}
                        />
                        
                        {/* Dustbin Overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-rose-950/45 backdrop-blur-[1px] rounded-xl animate-in fade-in zoom-in-95 duration-200">
                            <div className="bg-rose-600 text-white p-2.5 rounded-full shadow-lg border border-rose-400/50">
                              <Trash2 className="w-5 h-5 animate-pulse" />
                            </div>
                          </div>
                        )}

                        {/* Hover Overlay */}
                        {!isSelected && (
                          <div className="absolute inset-0 bg-rose-950/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none rounded-xl">
                            <div className="bg-white/95 border border-slate-250 text-rose-500 p-2 rounded-full shadow-md">
                              <Trash2 className="w-4 h-4 animate-in zoom-in-75" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Left Page Number Badge */}
                      <span className="absolute top-4 left-4 bg-slate-805 bg-slate-800 text-white font-black text-[9px] w-5.5 h-5.5 flex items-center justify-center rounded-full shadow-sm">
                        {pageNum}
                      </span>
                      
                      {/* Page State Badge */}
                      <div className="mt-3 text-center">
                        <span className={`text-[9px] uppercase tracking-wide font-black px-2.5 py-1 rounded-lg border transition-all ${
                          isSelected 
                            ? "bg-rose-50 border-rose-100 text-rose-700 font-bold" 
                            : "bg-slate-50 text-slate-700 border-slate-150 group-hover:border-rose-200 group-hover:text-rose-600 font-bold"
                        }`}>
                          {isSelected ? "To Delete" : `Page ${pageNum}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sidebar Controls */}
            {/* Mobile Overlay backdrop */}
            {isDrawerOpen && (
              <div 
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
                onClick={() => setIsDrawerOpen(false)}
              />
            )}

            <div className={`
              fixed top-0 left-0 h-full w-[290px] bg-white border-r border-slate-205 z-50 p-6 shadow-2xl transition-transform duration-300 ease-in-out overflow-y-auto
              lg:relative lg:top-auto lg:left-auto lg:h-auto lg:w-80 lg:border lg:rounded-3xl lg:shadow-md lg:translate-x-0 lg:z-auto
              ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"}
            `}>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-600 animate-pulse" /> Page Controls
                </h2>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="lg:hidden p-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 p-4 border border-slate-150 rounded-2xl shadow-inner">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black block mb-1">Source File</span>
                  <p className="text-xs font-bold text-slate-800 truncate" title={file.name}>📄 {file.name}</p>
                  <p className="text-[10px] font-bold text-slate-650 mt-1">{totalNumPages} Total Pages</p>
                </div>

                {/* Text Input selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider">
                    Pages to delete:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1, 3-5, 8"
                    value={pagesStr}
                    onChange={handleStringInputChange}
                    className="w-full bg-slate-50 border border-slate-205 text-rose-700 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:bg-white focus:border-rose-500 transition-all placeholder:text-slate-400 font-mono shadow-inner focus:ring-1 focus:ring-rose-500/10"
                  />
                  <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                    Specify page ranges (e.g. <span className="bg-rose-50 px-1 py-0.5 rounded font-mono text-[9px] text-rose-700 font-black">1-3, 5, 8-10</span>). Syncs with visual selections.
                  </p>
                </div>

                {/* Badges Deletion Queue */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-slate-550 text-slate-600 uppercase font-black tracking-widest block">Deletion Queue</span>
                    {selectedPages.size > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPages(new Set());
                          setPagesStr("");
                        }}
                        className="text-[9px] font-black uppercase text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/60 px-2 py-0.5 rounded border border-rose-150 transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {selectedPages.size === 0 ? (
                      <p className="text-[10px] text-slate-500 italic font-semibold">No pages queued for deletion. Click the thumbnails to add.</p>
                    ) : (
                      Array.from(selectedPages).sort((a,b)=>a-b).map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-150 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm animate-in zoom-in-75"
                        >
                          Page {p}
                          <button
                            type="button"
                            onClick={() => {
                              const newSelected = new Set(selectedPages);
                              newSelected.delete(p);
                              setSelectedPages(newSelected);
                              setPagesStr(buildRangesString(newSelected));
                            }}
                            className="text-rose-450 hover:text-rose-650 ml-0.5 font-bold cursor-pointer text-xs"
                          >
                            ✕
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <button
                  onClick={handleUploadClick}
                  disabled={selectedPages.size === 0 || loading || rendering}
                  className="w-full bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg hover:shadow-rose-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm disabled:opacity-50 disabled:pointer-events-none"
                >
                  <Trash2 className="w-4 h-4 animate-pulse" /> Delete {selectedPages.size} Page{selectedPages.size > 1 ? "s" : ""}
                </button>
              </div>
            </div>

            {/* Mobile Drawer FAB trigger */}
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="fixed bottom-6 left-6 z-30 lg:hidden bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black p-4 rounded-full shadow-2xl flex items-center justify-center gap-2 animate-bounce border border-rose-500"
              title="Open Page Controls"
            >
              <Trash2 className="w-6 h-6 animate-pulse" />
              <span className="text-xs uppercase tracking-wider pr-1">Page Controls</span>
            </button>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
