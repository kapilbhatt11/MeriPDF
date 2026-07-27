"use client";

import { useState } from "react";
import { UploadCloud, FileType, Download, X, RefreshCw, HelpCircle, RotateCw, RotateCcw } from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import * as pdfjsLib from "pdfjs-dist";
import { logPDFOperation } from "@/lib/analytics";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

interface ThumbnailData {
  fileIdx: number;
  pageNum: number;
  url: string;
}

export default function RotatePDFPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Grouped Thumbnails: fileIdx -> ThumbnailData[]
  const [thumbnails, setThumbnails] = useState<Record<number, ThumbnailData[]>>({});
  
  // Set of selected item IDs: "fileIdx-pageNum"
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  
  // Maps fileIdx -> { pageNumber -> offset angle }
  const [pageRotations, setPageRotations] = useState<Record<number, Record<number, number>>>({});

  const processUploadedPdfs = async (uploadedFiles: FileList | File[]) => {
    const newFiles = Array.from(uploadedFiles);
    setFiles([ ...files, ...newFiles ]);
    setRendering(true);

    const startIdx = files.length;
    
    try {
      const newThumbnails = { ...thumbnails };
      const newRotations = { ...pageRotations };

      for (let fIdx = 0; fIdx < newFiles.length; fIdx++) {
        const file = newFiles[fIdx];
        const actualIdx = startIdx + fIdx;
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const generatedUrls: ThumbnailData[] = [];
        newRotations[actualIdx] = {};

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.5 }); 
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (ctx) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;
            generatedUrls.push({ fileIdx: actualIdx, pageNum: i, url: canvas.toDataURL("image/jpeg", 0.6) });
          }
        }
        newThumbnails[actualIdx] = generatedUrls;
      }
      
      setThumbnails(newThumbnails);
      setPageRotations(newRotations);
    } catch (error) {
      console.error("PDF Parsing error:", error);
      toast.error("Could not generate visual previews for PDFs.");
    } finally {
      setRendering(false);
    }
  };

  const handlePageClick = (fileIdx: number, pageNum: number, event: React.MouseEvent) => {
    const id = `${fileIdx}-${pageNum}`;
    const newSelected = new Set(selectedPages);

    if (event.shiftKey && lastClicked !== null) {
      // Basic shift logic inside the SAME file for simplicity
      const [lastFileStr, lastPageStr] = lastClicked.split("-");
      const lastFileIdx = parseInt(lastFileStr);
      const lastPageNum = parseInt(lastPageStr);

      if (lastFileIdx === fileIdx) {
        const start = Math.min(lastPageNum, pageNum);
        const end = Math.max(lastPageNum, pageNum);
        for (let i = start; i <= end; i++) {
          newSelected.add(`${fileIdx}-${i}`);
        }
      } else {
        newSelected.add(id);
      }
    } else {
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
    }

    setSelectedPages(newSelected);
    setLastClicked(id);
  };

  const selectEntireFile = (fileIdx: number) => {
    const newSelected = new Set(selectedPages);
    const fileThumbs = thumbnails[fileIdx] || [];
    let allSelected = true;
    
    // Check if all are currently selected
    for(const t of fileThumbs) {
        if(!newSelected.has(`${fileIdx}-${t.pageNum}`)) {
            allSelected = false; break;
        }
    }

    if (allSelected) {
       for(const t of fileThumbs) newSelected.delete(`${fileIdx}-${t.pageNum}`);
    } else {
       for(const t of fileThumbs) newSelected.add(`${fileIdx}-${t.pageNum}`);
    }
    
    setSelectedPages(newSelected);
  };

  const applyRotation = (offset: number) => {
    setPageRotations(prev => {
      const next = JSON.parse(JSON.stringify(prev)); // Deep copy tracking

      // If specific pages selected, rotate only those
      if (selectedPages.size > 0) {
          selectedPages.forEach(id => {
              const [fileIdxStr, pageNumStr] = id.split("-");
              const fIdx = Number(fileIdxStr);
              const pNum = Number(pageNumStr);
              if (!next[fIdx]) next[fIdx] = {};
              next[fIdx][pNum] = (next[fIdx][pNum] || 0) + offset;
          });
      } else {
          // If no pages selected, rotate ALL pages in ALL files
          Object.keys(thumbnails).forEach(fIdxStr => {
              const fIdx = Number(fIdxStr);
              if (!next[fIdx]) next[fIdx] = {};
              thumbnails[fIdx].forEach(t => {
                  next[fIdx][t.pageNum] = (next[fIdx][t.pageNum] || 0) + offset;
              });
          });
      }
      return next;
    });
  };

  const removeFile = (idxToRemove: number) => {
    const newFiles = [...files];
    newFiles.splice(idxToRemove, 1);
    setFiles(newFiles);

    // Rebuild thumbnails and rotations tracking with shifted indices
    const newThumbnails: Record<number, ThumbnailData[]> = {};
    const newRotations: Record<number, Record<number, number>> = {};
    const newSelected = new Set<string>();

    let newIdx = 0;
    for (let oldIdx = 0; oldIdx <= files.length; oldIdx++) {
        if (oldIdx === idxToRemove) continue;
        if (thumbnails[oldIdx]) {
            newThumbnails[newIdx] = thumbnails[oldIdx].map(t => ({...t, fileIdx: newIdx}));
            newRotations[newIdx] = pageRotations[oldIdx] || {};
            // Translate explicit selections
            selectedPages.forEach(id => {
                const [fStr, pStr] = id.split("-");
                if (Number(fStr) === oldIdx) newSelected.add(`${newIdx}-${pStr}`);
            });
            newIdx++;
        }
    }

    setThumbnails(newThumbnails);
    setPageRotations(newRotations);
    setSelectedPages(newSelected);
    setLastClicked(null);
  };

  const clearAll = () => {
    setFiles([]); setThumbnails({}); setSelectedPages(new Set()); setPageRotations({}); setLastClicked(null);
  };

  const handleUploadClick = async () => {
    if (files.length === 0) return toast.error("Please upload PDFs first.");

    // Clean up rotations - remove pages with 0 offset (or multiples of 360)
    const activeRotations: Record<number, Record<number, number>> = {};
    for (const [fIdx, map] of Object.entries(pageRotations)) {
        const fileActive: Record<number, number> = {};
        for (const [p, angle] of Object.entries(map as Record<number, number>)) {
            const a = angle % 360;
            if (a !== 0) fileActive[Number(p)] = a;
        }
        if (Object.keys(fileActive).length > 0) activeRotations[Number(fIdx)] = fileActive;
    }

    setLoading(true);
    const formData = new FormData();
    files.forEach(f => formData.append("files", f));
    formData.append("rotations", JSON.stringify(activeRotations));

    try {
      const res = await fetchWithAuth(api("/pdf/rotate"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let msg = "Failed to rotate PDF.";
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
      link.download = `DocIntel_Rotated_Files.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      logPDFOperation("Rotate PDF", files.length);
      toast.success("PDFs rotated and downloaded successfully!");
    } catch (err) {
      toast.error((err as Error).message || "Error rotating PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
        <div className="max-w-6xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
          
          <div className="bg-gradient-to-br from-cyan-600 to-sky-600 p-8 text-white relative overflow-hidden flex flex-col md:flex-row justify-between items-center">
            <div className="absolute opacity-10 right-0 top-0 w-64 h-64 bg-white rounded-full -mt-20 -mr-20"></div>
            <div>
              <h1 className="text-4xl font-extrabold flex items-center gap-3 relative z-10">
                <span className="bg-white/20 p-3 rounded-2xl shadow-inner backdrop-blur-sm"><RefreshCw size={32} /></span>
                Visual Rotate PDF
              </h1>
              <p className="mt-4 text-cyan-100 font-medium text-lg max-w-xl relative z-10">
                Upload multiple PDFs! Select files or individual pages to rotate precisely, then download as a ZIP.
              </p>
            </div>
            <button onClick={() => setShowHelp(true)} className="relative z-10 mt-6 md:mt-0 flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl transition backdrop-blur-sm font-semibold">
              <HelpCircle size={20} /> How to Use
            </button>
          </div>

          {showHelp && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 text-left">
               <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 relative">
                  <button onClick={() => setShowHelp(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition">
                     <X size={20} />
                  </button>
                  <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                     <HelpCircle className="text-cyan-500" /> How to use Smart Rotation
                  </h2>
                  <ul className="space-y-4 text-slate-600 font-medium">
                     <li className="flex gap-3"><span className="bg-cyan-100 text-cyan-600 font-bold px-2.5 py-0.5 rounded h-min">1</span> Select <b>multiple</b> PDFs to upload them together.</li>
                     <li className="flex gap-3"><span className="bg-cyan-100 text-cyan-600 font-bold px-2.5 py-0.5 rounded h-min">2</span> Click the <b>Select Entire File</b> button to select a whole document, or click individual pages to target them.</li>
                     <li className="flex gap-3"><span className="bg-cyan-100 text-cyan-600 font-bold px-2.5 py-0.5 rounded h-min">3</span> Use the <b>Rotate</b> buttons below to spin selected pages.</li>
                     <li className="flex gap-3"><span className="bg-cyan-100 text-cyan-600 font-bold px-2.5 py-0.5 rounded h-min">4</span> If no pages are selected, hitting Rotate will rotate <b>all</b> pages across <b>all</b> files!</li>
                     <li className="flex gap-3"><span className="bg-cyan-100 text-cyan-600 font-bold px-2.5 py-0.5 rounded h-min">5</span> Click <b>Download</b> to receive a ZIP carrying your refreshed PDFs.</li>
                  </ul>
                  <button onClick={() => setShowHelp(false)} className="w-full mt-8 bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl transition">Got it!</button>
               </div>
            </div>
          )}

          <div className="p-8">
            <div className="mb-8">
              {files.length === 0 ? (
                <label className="border-3 border-dashed border-cyan-200 bg-cyan-50/50 hover:bg-cyan-50 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors group h-64">
                  <div className="bg-cyan-100 p-4 rounded-full text-cyan-500 group-hover:scale-110 group-hover:bg-cyan-200 transition-all duration-300 shadow-sm mb-4">
                    <UploadCloud size={48} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Upload multiple PDFs</h3>
                  <p className="text-slate-500 text-sm">Click or drag & drop</p>
                  <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => {
                      if(e.target.files && e.target.files.length>0) processUploadedPdfs(e.target.files);
                  }} />
                </label>
              ) : (
                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-6 relative shadow-sm flex flex-col gap-6">
                  <div className="flex items-center gap-4 justify-between border-b pb-4">
                     <div className="flex items-center gap-4">
                       <div className="p-3 bg-gradient-to-br from-cyan-100 to-sky-100 rounded-xl text-cyan-600 shadow-inner">
                         <FileType size={24} />
                       </div>
                       <div>
                         <p className="font-bold text-slate-800 text-lg">{files.length} Files Uploaded</p>
                         <p className="text-sm font-medium text-slate-500">Ready for specific rotation</p>
                       </div>
                     </div>
                     <div className="flex gap-2">
                        <label className="cursor-pointer text-sm font-bold bg-white border border-cyan-200 text-cyan-600 px-4 py-2 rounded-full hover:bg-cyan-50 transition">
                            + Add More
                            <input type="file" multiple accept="application/pdf" className="hidden" onChange={(e) => {
                                if(e.target.files && e.target.files.length>0) processUploadedPdfs(e.target.files);
                            }} />
                        </label>
                        <button onClick={clearAll} className="text-rose-500 hover:text-rose-700 font-bold transition-colors px-4 py-2 bg-white border border-rose-200 rounded-full hover:bg-rose-50">
                            Clear All
                        </button>
                     </div>
                  </div>

                  {rendering ? (
                     <div className="flex flex-col items-center justify-center h-48 bg-white border border-dashed rounded-xl border-slate-300">
                         <RefreshCw className="animate-spin text-cyan-500 mb-4" size={40} />
                         <span className="text-slate-500 font-medium">Extracting PDF structures...</span>
                     </div>
                  ) : (
                     <div className="bg-slate-200/50 p-6 rounded-xl border border-slate-200 overflow-y-auto max-h-[600px] shadow-inner custom-scrollbar flex flex-col gap-8">
                         {files.map((f, idx) => {
                            const fileThumbs = thumbnails[idx] || [];
                            
                            // Determine if all are selected
                            let allSelected = fileThumbs.length > 0;
                            for(const t of fileThumbs) {
                                if(!selectedPages.has(`${idx}-${t.pageNum}`)) {
                                    allSelected = false; break;
                                }
                            }

                            return (
                             <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative">
                                <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                                    <h4 className="font-bold text-slate-700 flex items-center gap-2">
                                        <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs">File {idx+1}</span>
                                        {f.name}
                                    </h4>
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => selectEntireFile(idx)}
                                            className={`text-xs font-bold px-3 py-1.5 rounded-md transition ${allSelected ? "bg-cyan-600 text-white" : "bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border border-cyan-200"}`}
                                        >
                                            {allSelected ? "Deselect File" : "Select Entire File"}
                                        </button>
                                        <button onClick={() => removeFile(idx)} className="text-slate-400 hover:text-rose-500 transition">
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                    {fileThumbs.map((thumb) => {
                                        const id = `${idx}-${thumb.pageNum}`;
                                        const isSelected = selectedPages.has(id);
                                        const rotation = (pageRotations[idx] && pageRotations[idx][thumb.pageNum]) || 0;
                                        
                                        return (
                                        <div 
                                            key={thumb.pageNum}
                                            onClick={(e) => handlePageClick(idx, thumb.pageNum, e)}
                                            className={`relative flex flex-col items-center justify-center group cursor-pointer transition-all duration-200 transform hover:scale-105`}
                                        >
                                            <div className={`
                                                relative bg-white p-1 rounded-sm shadow-md transition-all duration-300 overflow-hidden border-2 flex items-center justify-center min-h-[90px] w-full
                                                ${isSelected ? "border-cyan-500 shadow-cyan-500/40 ring-4 ring-cyan-500/20" : "border-transparent hover:border-slate-300"}
                                            `}>
                                                <img 
                                                    src={thumb.url} 
                                                    alt={`Page ${thumb.pageNum}`} 
                                                    className="w-full h-auto rounded-[1px] shadow-sm transform transition-all duration-500 ease-out" 
                                                    style={{ rotate: `${rotation}deg` }}
                                                />
                                            </div>
                                            <span className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors ${
                                                isSelected ? "bg-cyan-100 text-cyan-700 border-cyan-300" : "bg-white text-slate-500 border-slate-200 group-hover:border-cyan-300 group-hover:text-cyan-500"
                                            }`}>
                                                p.{thumb.pageNum}
                                            </span>
                                        </div>
                                        )
                                    })}
                                </div>
                             </div>
                            )
                         })}
                     </div>
                  )}

                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-center">
                     <div className="flex-1 w-full flex items-center justify-center md:justify-start gap-4">
                         <button
                           onClick={() => applyRotation(-90)}
                           className="flex-1 md:flex-none flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 transition-all font-bold group"
                         >
                           <RotateCcw className="mb-2 text-slate-500 group-hover:text-cyan-500 transition-colors" size={28} />
                           Left (-90°)
                         </button>
                         <button
                           onClick={() => applyRotation(90)}
                           className="flex-1 md:flex-none flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-200 bg-white text-slate-700 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 transition-all font-bold group"
                         >
                           <RotateCw className="mb-2 text-slate-500 group-hover:text-cyan-500 transition-colors" size={28} />
                           Right (+90°)
                         </button>
                         <div className="hidden md:flex ml-4 flex-col gap-2">
                            <div className="text-sm text-slate-500">
                               {selectedPages.size > 0 
                                  ? <span>Rotating <strong className="text-cyan-600">{selectedPages.size} selected</strong> pages total</span>
                                  : <span>Rotating <strong className="text-cyan-600">All</strong> pages globally</span>
                               }
                            </div>
                            {selectedPages.size > 0 && (
                               <button 
                                  onClick={() => setSelectedPages(new Set())}
                                  className="text-xs text-rose-500 hover:text-rose-600 font-bold px-3 py-1 bg-rose-50 hover:bg-rose-100 rounded-full w-max whitespace-nowrap transition-colors"
                               >
                                  Clear Selection
                               </button>
                            )}
                         </div>
                     </div>
                     
                     <button
                       onClick={handleUploadClick}
                       disabled={loading || rendering || files.length === 0}
                       className="w-full md:w-auto shrink-0 bg-gradient-to-r from-cyan-600 to-sky-500 hover:from-cyan-500 hover:to-sky-400 text-white font-bold py-4 px-10 rounded-xl shadow-lg hover:shadow-cyan-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 text-lg h-[92px]"
                     >
                       {loading ? (
                         <>
                           <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                           Zipping...
                         </>
                       ) : (
                         <>
                           <Download size={24} className="stroke-[2.5]" />
                           Download ZIP
                         </>
                       )}
                     </button>
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
