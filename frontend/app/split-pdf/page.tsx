"use client";

import { useEffect, useState, useRef } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { Scissors, HelpCircle, X, FileText, CheckCircle2, Settings, Sparkles, Plus, Trash2, Layers, Download } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";


export default function SplitPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfjsLib, setPdfjsLib] = useState<any>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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

  const [mode, setMode] = useState<"pages" | "pair">("pages");
  const [subMode, setSubMode] = useState<"all" | "manual">("all");
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pairs, setPairs] = useState<{ from: number; to: number }[]>([
    { from: 1, to: 1 },
  ]);
  const [rangeText, setRangeText] = useState("1-1");
  const [mergePairs, setMergePairs] = useState(false);
  const [rangeMode, setRangeMode] = useState<"custom" | "fixed">("custom");
  const [fixedSize, setFixedSize] = useState(5);
  const [totalPages, setTotalPages] = useState(0);
  const [splitSuccess, setSplitSuccess] = useState<{ url: string; filename: string; done: boolean } | null>(null);

  // Helper to parse page range strings like "1-3, 5, 8-10"
  const parseRangeText = (text: string) => {
    const parts = text.split(",");
    const newPairs: { from: number; to: number }[] = [];
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      
      if (part.includes("-")) {
        const [fromS, toS] = part.split("-");
        const from = parseInt(fromS.trim());
        const to = parseInt(toS.trim());
        if (!isNaN(from) && !isNaN(to)) {
          newPairs.push({
            from: Math.max(1, Math.min(from, totalPages || 1000)),
            to: Math.max(1, Math.min(to, totalPages || 1000)),
          });
        }
      } else {
        const val = parseInt(part.trim());
        if (!isNaN(val)) {
          newPairs.push({
            from: Math.max(1, Math.min(val, totalPages || 1000)),
            to: Math.max(1, Math.min(val, totalPages || 1000)),
          });
        }
      }
    }
    return newPairs;
  };

  // ✅ Load PDF.js dynamically (client-side only)
  useEffect(() => {
    const loadPdfJs = async () => {
      if (typeof window === "undefined") return;
      try {
        // @ts-ignore
        const module = await import("pdfjs-dist/build/pdf");
        // @ts-ignore
        const worker = await import("pdfjs-dist/build/pdf.worker.min.js");
        (window as any).pdfjsWorker = worker;
        module.GlobalWorkerOptions.workerSrc =
          "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        setPdfjsLib(module);
        setPdfReady(true);
        console.log("✅ PDF.js fully loaded");
      } catch (error) {
        console.error("❌ Failed to load PDF.js:", error);
      }
    };
    loadPdfJs();
  }, []);

  

  // 📥 Load PDF thumbnails
  useEffect(() => {
    if (!file || !pdfReady || !pdfjsLib) return;

    const loadPDF = async () => {
      setIsLoading(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const typedarray = new Uint8Array(reader.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: typedarray })
              .promise;
            setTotalPages(pdf.numPages);
            setPairs([{ from: 1, to: pdf.numPages }]);
            setRangeText(`1-${pdf.numPages}`);

            const pages: string[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 0.4 });
              const canvas = document.createElement("canvas");
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Canvas context not supported.");
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              await page.render({ canvasContext: context, viewport }).promise;
              pages.push(canvas.toDataURL());
            }
            setPreviews(pages);
          } catch (err) {
            console.error("Error processing PDF:", err);
            alert("Failed to process PDF pages.");
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error("Error loading PDF:", err);
        alert("Failed to load PDF.");
        setIsLoading(false);
      }
    };

    loadPDF();
  }, [file, pdfReady, pdfjsLib]);

  // 📂 Handle File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setPreviews([]);
      setSelectedPages([]);
      setMode("pages");
      setSubMode("all");
      setPairs([{ from: 1, to: 1 }]);
      setRangeText("1-1");
      setIsLoading(false);
    }
  };

  // ✅ Toggle Page
  const togglePage = (page: number) => {
    setSelectedPages((prev) => {
      const newPages = prev.includes(page)
        ? prev.filter((p) => p !== page)
        : [...prev, page];
      setSubMode("manual");
      return newPages;
    });
  };

  // ➕ Add Custom Pair
  const addPair = () => setPairs([...pairs, { from: 1, to: totalPages }]);
  const updatePair = (i: number, key: "from" | "to", val: string) => {
    const newPairs = [...pairs];
    newPairs[i][key] = Number(val);
    setPairs(newPairs);
  };

  // 🚀 Split Action
  const handleSplit = async () => {
  if (!file) return alert("Please select a PDF file");
  if (mode === "pages" && subMode === "manual" && selectedPages.length === 0) {
    return alert("Please select at least 1 page.");
  }
  if (mode === "pair" && rangeMode === "fixed" && fixedSize < 1) {
    return alert("Fixed size must be at least 1.");
  }

  const formData = new FormData();
  let endpoint = "";

  if (mode === "pages") {

    if (subMode === "all") {
      endpoint = api("/split/pdf/split/all");
      formData.append("file", file);
    }

    if (subMode === "manual") {
      endpoint = api("/split/pdf/split/manual");
      formData.append("file", file);
      // backend accepts both CSV and JSON list; send JSON to be explicit
      formData.append("pages", JSON.stringify(selectedPages));
    }

  }

  else if (mode === "pair") {

    if (rangeMode === "custom") {
      endpoint = api("/split/pdf/split/custom");
      formData.append("file", file);

      // backend accepts both "1-3,4-6" and JSON list; send JSON objects
      formData.append("ranges", JSON.stringify(pairs));

      formData.append("merge_all", mergePairs ? "true" : "false");
    }

    if (rangeMode === "fixed") {
      endpoint = api("/split/pdf/split/fixed");
      formData.append("file", file);
      formData.append("fixed_size", String(fixedSize));
    }

  }

  if (!endpoint) return alert("Invalid mode");

  try {
    setSplitLoading(true);
    const res = await fetch(endpoint, {
      method: "POST",
      body: formData,
      headers: optionalAuthHeaders(),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const data = await res.json();
        if (data?.code === "LOGIN_REQUIRED") {
          detail = `${String(data.detail || "")} Log in and try again.`;
        } else {
          detail = data?.detail ? String(data.detail) : JSON.stringify(data);
        }
      } catch {
        try {
          detail = await res.text();
        } catch {
          detail = "";
        }
      }
      throw new Error(detail ? `Split failed: ${detail}` : "Split failed");
    }

    logPDFOperation("Split PDF", previews.length || 1);

    const blob = await res.blob()
    const contentType = res.headers.get("content-type")

    let filename="MeriPDF_Split_Output"

    if(contentType?.includes("zip")){
      filename+=".zip"
    }else{
      filename+=".pdf"
    }

    const url = URL.createObjectURL(blob)
    setSplitSuccess({ url, filename, done: false });

    // Auto-trigger download
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

  } catch(err){
    console.error(err)
    alert(`❌ Failed to split PDF${err instanceof Error && err.message ? `\n\n${err.message}` : ""}`)
  } finally {
    setSplitLoading(false);
  }
};
  // const handleSplit = async () => {
  //   if (!file) return alert("Please select a PDF file");

  //   const formData = new FormData();

  //   let endpoint = "";

  //   if (mode === "pages") {
  //     if (subMode === "all") {
  //       endpoint = "http://127.0.0.1:8000/split/pdf/split/all";
  //       formData.append("file", file);
  //     } else if (subMode === "manual") {
  //       endpoint = "http://127.0.0.1:8000/split/pdf/split/manual";
  //       formData.append("file", file);
  //       // formData.append("pages", JSON.stringify(selectedPages));
  //       formData.append("pages", selectedPages.join(","));
  //     }
  //   } else if (mode === "pair") {
  //     if (rangeMode === "custom") {
  //       endpoint = "http://127.0.0.1:8000/split/pdf/split/custom";
  //       // formData.append("file", file as Blob);
  //       formData.append("file", file);
  //       // formData.append("ranges", JSON.stringify(pairs));
  //       const rangeString = pairs.map(p => `${p.from}-${p.to}`).join(",");
  //       formData.append("ranges", rangeString);

  //       formData.append("merge_all", mergePairs  ? "true" : "false");
  //     } else if (rangeMode === "fixed") {
  //       endpoint = "http://127.0.0.1:8000/split/pdf/split/fixed";
  //       formData.append("file", file as Blob);
  //       formData.append("fixed_size", String(fixedSize));
  //     }
  //   }

  //   if (!endpoint) return alert("Invalid mode or option");

  //   try {
  //     const res = await fetch(endpoint, { method: "POST", body: formData });
  //     if (!res.ok) throw new Error("Failed to split PDF");

  //     // const blob = await res.blob();
  //     // const url = window.URL.createObjectURL(blob);
  //     // const a = document.createElement("a");
  //     // a.href = url;
  //     // a.download = "MeriPDF_Split_Output.zip";
  //     const contentType = res.headers.get("content-type");

  //     let filename = "MeriPDF_Split_Output";

  //     if (contentType?.includes("zip")) {
  //       filename += ".zip";
  //     } else {
  //       filename += ".pdf";
  //     }

  //     const blob = await res.blob();
  //     const url = window.URL.createObjectURL(blob);

  //     const a = document.createElement("a");
  //     a.href = url;
  //     a.download = filename;
  //     a.click();

  //     window.URL.revokeObjectURL(url);
  //     // a.click();
  //     // window.URL.revokeObjectURL(url);

  //     alert("✅ Split Completed Successfully!");
  //   } catch (err) {
  //     console.error(err);
  //     alert("❌ Failed to split PDF");
  //   }
  // };

  return (
    <div className="max-w-7xl mx-auto px-6 pb-6 pt-4 relative">
      {/* --- Top Premium Header --- */}
      <div className="bg-white border border-slate-205 border-slate-200 rounded-3xl p-6 mb-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-black flex items-center gap-3 text-slate-900">
          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600 border border-indigo-100 shadow-inner">
            <Scissors className="w-8 h-8" />
          </div>
          Split PDF
        </h1>

        <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
          <div className="hidden lg:block bg-slate-50 border border-slate-150 text-slate-700 py-2.5 px-4 rounded-xl text-xs font-semibold shadow-inner">
            Without account: <strong className="text-slate-900">5 free actions/day</strong>.{" "}
            <a href="/login" className="text-indigo-600 hover:text-indigo-705 underline font-bold">Log in</a> for unlimited access.
          </div>

          {/* Help Button */}
          <button
            onClick={() => setShowHelp(true)}
            className="bg-slate-50 text-slate-750 hover:bg-slate-100 text-slate-700 p-2.5 rounded-xl border border-slate-250 hover:border-slate-300 shadow-sm transition flex items-center justify-center gap-2 font-bold text-xs cursor-pointer"
            title="How to Use"
          >
            <HelpCircle size={20} className="text-indigo-600" />
            <span className="hidden sm:inline">How to Use</span>
          </button>

          {file && (
            <button
              onClick={() => {
                setFile(null);
                setPreviews([]);
                setSelectedPages([]);
                setMode("pages");
                setSubMode("all");
              }}
              className="text-xs bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-500 hover:text-white px-4 py-2.5 rounded-xl font-bold transition duration-200 cursor-pointer"
            >
              Remove File
            </button>
          )}
        </div>
      </div>

      {/* File Upload Area */}
      {!file && (
        <div className="w-full bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 flex flex-col items-center justify-center text-center shadow-sm hover:border-indigo-400 transition-colors duration-300 group">
          <div className="bg-indigo-50 p-5 rounded-3xl text-indigo-600 mb-4 group-hover:scale-110 transition-transform duration-350 shadow-inner">
            <Scissors className="w-12 h-12" />
          </div>
          <h3 className="text-xl font-bold text-slate-850">Split your PDF document</h3>
          <p className="text-slate-500 text-sm max-w-sm mt-2 mb-6">
            Upload a PDF file to select pages, extract custom ranges, or split into fixed equal parts.
          </p>
          <label className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 text-sm">
            📂 Choose PDF File
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              disabled={!pdfReady}
              className="hidden"
            />
          </label>
          {!pdfReady && (
            <p className="text-rose-500 text-xs mt-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              Loading PDF extraction engine...
            </p>
          )}
        </div>
      )}

      {file && (
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Glassmorphic Loader */}
          {(isLoading || splitLoading) && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
              <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-indigo-600 to-indigo-700 animate-pulse"></div>
                
                <div className="relative mb-6 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin"></div>
                  <div className="absolute bg-indigo-50 p-3.5 rounded-full">
                    <Scissors className="w-7 h-7 text-indigo-600 animate-bounce" />
                  </div>
                </div>
                
                <h3 className="text-2xl font-black text-gray-900 mb-2">
                  {isLoading ? "Reading PDF File" : "Splitting Document"}
                </h3>
                
                <div className="w-full bg-slate-100 rounded-full h-1.5 mb-6 overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full w-2/3 animate-pulse"></div>
                </div>
                
                <p className="text-gray-605 text-sm leading-relaxed">
                  {isLoading 
                    ? "Converting pages into light image previews to help you select splitting lines..." 
                    : "Secured PDF processing backend is generating splits & compiling output streams..."
                  }
                </p>
                
                <div className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                  <span>Active Engine Node</span>
                </div>
              </div>
            </div>
          )}
                    {/* Thumbnails Container */}
          <div className="flex-1 h-[68vh] overflow-y-auto pr-2 pb-10 border border-slate-100 bg-slate-50/30 p-6 rounded-3xl shadow-inner">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200/80">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  PDF Page Explorer
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-semibold">
                  {mode === "pages" && subMode === "all" && "All pages are being split into separate PDF documents."}
                  {mode === "pages" && subMode === "manual" && `Custom Page Extract: ${selectedPages.length} of ${totalPages} pages selected.`}
                  {mode === "pair" && rangeMode === "custom" && `Custom range splitting (${pairs.length} segments active).`}
                  {mode === "pair" && rangeMode === "fixed" && `Splitting every ${fixedSize} page(s) into segments.`}
                </p>
              </div>
              
              {mode === "pages" && subMode === "manual" && selectedPages.length > 0 && (
                <button
                  onClick={() => setSelectedPages([])}
                  className="text-[10px] uppercase tracking-wider font-bold text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/60 px-3 py-1.5 rounded-lg border border-rose-150 transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
              {previews.map((src, index) => {
                const pageNum = index + 1;

                // 1. Pages mode states
                const isSelectedInPageMode = selectedPages.includes(pageNum);
                
                // 2. Custom Pair mode states
                const activeRangeIndices = pairs
                  .map((p, i) => (pageNum >= p.from && pageNum <= p.to ? i + 1 : -1))
                  .filter(idx => idx !== -1);
                const isInCustomRange = activeRangeIndices.length > 0;

                // 3. Fixed size mode states
                const segmentIndex = Math.floor((pageNum - 1) / Math.max(1, fixedSize));
                
                // Styling generator for premium layouts
                const getBorderClass = () => {
                  if (mode === "pages") {
                    if (subMode === "all") return "border-slate-200 hover:border-indigo-400 bg-indigo-50/5 ring-1 ring-indigo-500/10";
                    return isSelectedInPageMode 
                      ? "border-indigo-500 bg-indigo-50/10 ring-2 ring-indigo-600/20 scale-[1.01] shadow" 
                      : "border-slate-200 hover:border-indigo-305 hover:border-indigo-400 opacity-60 hover:opacity-100";
                  }
                  
                  if (mode === "pair" && rangeMode === "custom") {
                    return isInCustomRange
                      ? "border-indigo-500 bg-indigo-50/10 ring-2 ring-indigo-600/20 scale-[1.01] shadow"
                      : "border-slate-205 border-slate-200 opacity-40 hover:opacity-70 grayscale-[25%]";
                  }

                  if (mode === "pair" && rangeMode === "fixed") {
                    const colors = [
                      "border-blue-500 bg-blue-50/5 ring-2 ring-blue-500/20",
                      "border-emerald-500 bg-emerald-50/5 ring-2 ring-emerald-500/20",
                      "border-violet-500 bg-violet-50/5 ring-2 ring-violet-500/20",
                      "border-amber-500 bg-amber-50/5 ring-2 ring-amber-500/20",
                      "border-rose-500 bg-rose-50/5 ring-2 ring-rose-500/20"
                    ];
                    return colors[segmentIndex % colors.length];
                  }

                  return "border-slate-200";
                };

                return (
                  <div
                    key={pageNum}
                    onClick={() => {
                      if (mode === "pages") {
                        togglePage(pageNum);
                      } else if (mode === "pair" && rangeMode === "custom") {
                        // Click thumbnail to toggle it in page range selections
                        const existingRangeIndex = pairs.findIndex(p => p.from === pageNum && p.to === pageNum);
                        let newPairs = [...pairs];
                        if (existingRangeIndex !== -1) {
                          newPairs = newPairs.filter((_, i) => i !== existingRangeIndex);
                        } else {
                          newPairs.push({ from: pageNum, to: pageNum });
                        }
                        newPairs.sort((a, b) => a.from - b.from);
                        setPairs(newPairs);
                        setRangeText(newPairs.map(x => x.from === x.to ? String(x.from) : `${x.from}-${x.to}`).join(", "));
                      }
                    }}
                    className={`relative p-3 bg-white border rounded-2xl transition-all duration-300 group select-none ${getBorderClass()} cursor-pointer`}
                  >
                    <div className="w-full aspect-[3/4] overflow-hidden rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center p-1">
                      <img
                        src={src}
                        alt={`Page ${pageNum}`}
                        className="w-full h-full object-contain rounded-lg transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                    
                    {/* Left Page Number Badge */}
                    <span className="absolute top-4 left-4 bg-slate-800 text-white font-black text-[9px] w-5.5 h-5.5 flex items-center justify-center rounded-full shadow-sm">
                      {pageNum}
                    </span>
                    
                    {/* Right Info Badges */}
                    {mode === "pages" && subMode === "manual" && (
                      isSelectedInPageMode ? (
                        <div className="absolute top-4 right-4 bg-indigo-650 bg-indigo-600 text-white rounded-full w-5.5 h-5.5 flex items-center justify-center shadow text-xs font-bold animate-in zoom-in-50">
                          ✓
                        </div>
                      ) : (
                        <div className="absolute top-4 right-4 bg-white/95 opacity-0 group-hover:opacity-100 border border-slate-205 text-slate-400 rounded-full w-5.5 h-5.5 flex items-center justify-center text-xs font-semibold shadow-sm transition-opacity">
                          +
                        </div>
                      )
                    )}

                    {mode === "pages" && subMode === "all" && (
                      <div className="absolute top-4 right-4 bg-indigo-50 border border-indigo-200 text-indigo-750 text-indigo-700 rounded-full px-1.5 py-0.5 text-[8px] font-bold shadow-sm">
                        Extract
                      </div>
                    )}

                    {mode === "pair" && rangeMode === "custom" && isInCustomRange && (
                      <div className="absolute top-4 right-4 bg-indigo-605 bg-indigo-600 text-white rounded-full px-1.5 py-0.5 text-[8px] font-black shadow-sm">
                        Range {activeRangeIndices.join(", ")}
                      </div>
                    )}

                    {mode === "pair" && rangeMode === "fixed" && (
                      <div className="absolute top-4 right-4 bg-slate-800 text-white rounded-full px-1.5 py-0.5 text-[8px] font-mono font-black shadow-sm">
                        Part {segmentIndex + 1}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Settings Sidebar */}
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
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-505 text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} /> Split Controls
              </h2>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="lg:hidden p-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-805 hover:text-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mode selection tabs */}
            <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 mb-6">
              <button
                onClick={() => setMode("pages")}
                className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "pages"
                    ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                    : "text-slate-700 hover:text-indigo-700"
                }`}
              >
                Split by Page
              </button>
              <button
                onClick={() => setMode("pair")}
                className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  mode === "pair"
                    ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                    : "text-slate-700 hover:text-indigo-700"
                }`}
              >
                Split by Pair
              </button>
            </div>

            {mode === "pages" && (
              <div className="space-y-4">
                <label
                  onClick={() => setSubMode("all")}
                  className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-all ${
                    subMode === "all"
                      ? "border-indigo-500 bg-indigo-50/60 text-indigo-900 font-bold shadow-sm"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    checked={subMode === "all"}
                    onChange={() => setSubMode("all")}
                    className="accent-indigo-600 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm text-slate-800 font-bold">Separate all pages</p>
                    <p className="text-[10px] text-slate-650 font-bold">Extract every page as a single PDF</p>
                  </div>
                </label>

                <label
                  onClick={() => setSubMode("manual")}
                  className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-all ${
                    subMode === "manual"
                      ? "border-indigo-500 bg-indigo-50/60 text-indigo-900 font-bold shadow-sm"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="radio"
                    checked={subMode === "manual"}
                    onChange={() => setSubMode("manual")}
                    className="accent-indigo-600 w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm text-slate-800 font-bold">Custom page select</p>
                    <p className="text-[10px] text-slate-650 font-bold">Select specific thumbnails manually</p>
                  </div>
                </label>
              </div>
            )}

            {mode === "pair" && (
              <div className="space-y-6">
                <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setRangeMode("custom")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      rangeMode === "custom"
                        ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                        : "text-slate-750 hover:text-indigo-750 hover:text-indigo-700"
                    }`}
                  >
                    Custom Pair
                  </button>
                  <button
                    onClick={() => setRangeMode("fixed")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      rangeMode === "fixed"
                        ? "bg-white text-indigo-700 shadow-sm border border-slate-200"
                        : "text-slate-750 hover:text-indigo-750 hover:text-indigo-700"
                    }`}
                  >
                    Fixed Chunk
                  </button>
                </div>
                {rangeMode === "custom" && (
                  <div className="space-y-4">
                    {/* Compact Custom Range Input */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                        Page Ranges:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 1-3, 5-8, 10"
                        value={rangeText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRangeText(val);
                          const parsed = parseRangeText(val);
                          if (parsed.length > 0) {
                            setPairs(parsed);
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-205 text-slate-800 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:bg-white focus:border-indigo-500 transition-all placeholder:text-slate-400"
                      />
                      <p className="text-[10px] text-slate-650 font-bold leading-relaxed">
                        Enter page ranges (e.g. <span className="bg-indigo-50 px-1 py-0.5 rounded font-mono text-[9px] text-indigo-700 font-extrabold">1-3, 5, 8-10</span>). Or click the page preview cards on the left directly to select intervals.
                      </p>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] text-slate-705 text-slate-700 uppercase font-black tracking-widest block">Active Ranges</span>
                        {pairs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPairs([]);
                              setRangeText("");
                            }}
                            className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-600 bg-rose-55 hover:bg-rose-100/60 px-2 py-0.5 rounded border border-rose-150 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {pairs.length === 0 ? (
                          <p className="text-[10px] text-slate-550 text-slate-500 italic font-semibold">No intervals active. Click page preview cards to start.</p>
                        ) : (
                          pairs.map((p, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-150 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm"
                            >
                              {p.from === p.to ? `Page ${p.from}` : `${p.from} - ${p.to}`}
                              <button
                                type="button"
                                onClick={() => {
                                  const newPairs = pairs.filter((_, i) => i !== idx);
                                  setPairs(newPairs);
                                  setRangeText(newPairs.map(x => x.from === x.to ? String(x.from) : `${x.from}-${x.to}`).join(", "));
                                }}
                                className="text-indigo-400 hover:text-indigo-650 ml-0.5 font-bold cursor-pointer text-xs"
                              >
                                ✕
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    <label className="flex items-center gap-2 mt-4 text-xs font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mergePairs}
                        onChange={() => setMergePairs(!mergePairs)}
                        className="accent-indigo-600 w-4 h-4 cursor-pointer"
                      />
                      <span>Merge intervals back in 1 output file</span>
                    </label>
                  </div>
                )}

                {rangeMode === "fixed" && (
                  <div className="space-y-3">
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
                      Interval sheet count:
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={fixedSize === 0 ? "" : fixedSize}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setFixedSize(0);
                        } else {
                          const num = parseInt(val);
                          if (!isNaN(num) && num > 0) setFixedSize(num);
                        }
                      }}
                      className="border border-slate-200 text-slate-700 rounded-xl px-4 py-2 w-28 outline-none focus:border-indigo-500 bg-slate-50 font-semibold"
                    />

                    <div className="bg-indigo-50/40 p-4 border border-indigo-100/50 rounded-2xl text-xs text-indigo-850 leading-relaxed mt-4">
                      💡 Split details: The PDF will automatically segment into parts of <strong className="text-indigo-900">{fixedSize} pages</strong> — creating <strong className="text-indigo-900">{Math.ceil(totalPages / Math.max(1, fixedSize))} output PDF intervals</strong>.
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSplit}
              className="mt-8 w-full bg-gradient-to-r from-rose-650 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg hover:shadow-rose-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <Scissors className="w-4 h-4" /> Split PDF Document
            </button>
          </div>

          {/* Mobile Drawer FAB trigger */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="fixed bottom-6 left-6 z-30 lg:hidden bg-indigo-600 hover:bg-indigo-705 key:bg-indigo-700 active:scale-95 text-white font-black p-4 rounded-full shadow-2xl flex items-center justify-center gap-2 animate-bounce border border-indigo-500"
            title="Open Split Controls"
          >
            <Settings className="w-6 h-6 animate-spin" style={{ animationDuration: '6s' }} />
            <span className="text-xs uppercase tracking-wider pr-1">Split Settings</span>
          </button>
        </div>
      )}

      {/* ❓ How to Use Modal */}
      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/60 backdrop-blur-md z-50 p-6 shadow-2xl" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-8 rounded-3xl text-left w-full max-w-lg relative z-60 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-55 hover:bg-slate-100 rounded-full p-1.5 transition-colors"
            >
              <X size={18} />
            </button>
            <h2 className="text-2xl font-black mb-4 text-slate-850 flex items-center gap-2">
              <HelpCircle className="text-indigo-500" /> How to Split PDFs
            </h2>
            
            <div className="space-y-4 text-slate-600 text-xs font-semibold leading-relaxed">
              <div className="bg-indigo-50/40 border border-indigo-100/50 p-3.5 rounded-2xl flex items-start gap-3">
                <span className="bg-indigo-100 text-indigo-655 w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</span>
                <p><strong>Split by Page:</strong> Select single page sheets. Separate <em>All pages</em> as Individual files or click thumbnails manually to pick specific pages.</p>
              </div>
              <div className="bg-indigo-50/40 border border-indigo-100/50 p-3.5 rounded-2xl flex items-start gap-3">
                <span className="bg-indigo-100 text-indigo-650 w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</span>
                <p><strong>Split by Pair (Custom):</strong> Specify unique custom intervals (e.g. from page 1 to 5). Add multiple intervals dynamically using the <em>+ Add Page Interval</em> button.</p>
              </div>
              <div className="bg-indigo-50/40 border border-indigo-100/50 p-3.5 rounded-2xl flex items-start gap-3">
                <span className="bg-indigo-100 text-indigo-650 w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</span>
                <p><strong>Split by Pair (Fixed):</strong> Split your document into equal chunks (e.g. every 10 pages). Simply enter the page limit to chunk.</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full bg-indigo-605 text-white font-bold py-3 rounded-xl hover:bg-indigo-505 transition active:scale-[0.98]"
            >
              Got it, let's go!
            </button>
          </div>
        </div>
      )}

      {/* 🎉 Split PDF Status Modal */}
      {splitSuccess && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-650 animate-pulse"></div>
            
            {/* Top Close Icon */}
            <button
              onClick={() => setSplitSuccess(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            {!splitSuccess.done ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-650 rounded-full flex items-center justify-center mb-5 shadow-lg border border-indigo-400/50">
                  <CheckCircle2 className="w-9 h-9 text-white animate-bounce" />
                </div>
                
                <h3 className="text-2xl font-black text-slate-850 mb-1">🎉 Extraction Successful</h3>
                
                <p className="text-xs text-slate-400 uppercase tracking-widest font-black mb-3">
                  Document splits executed
                </p>
                
                <p className="text-xs font-semibold text-slate-500 leading-relaxed bg-slate-55 p-2.5 rounded-xl border border-slate-100 w-full mb-6 truncate" title={splitSuccess.filename}>
                  📄 {splitSuccess.filename}
                </p>

                <div className="w-full space-y-3">
                  <a
                    href={splitSuccess.url}
                    download={splitSuccess.filename}
                    onClick={() => setSplitSuccess((prev) => prev ? { ...prev, done: true } : null)}
                    className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg hover:shadow-indigo-500/20 hover:from-indigo-500 hover:to-blue-500 active:scale-[0.98] transition-all cursor-pointer text-sm"
                  >
                    <Download className="w-4 h-4" /> Download Files
                  </a>
                  
                  <button
                    onClick={() => setSplitSuccess(null)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-750 font-semibold py-3 px-6 rounded-xl hover:bg-slate-100 transition-colors text-sm cursor-pointer"
                  >
                    Keep Configuration
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-505 rounded-full flex items-center justify-center mb-5 shadow-lg border border-emerald-400">
                  <CheckCircle2 className="w-9 h-9 text-white animate-bounce" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-1">Process Complete</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-xs leading-relaxed font-semibold">
                  Your split document files have been generated and downloaded successfully!
                </p>
                
                <div className="w-full space-y-3">
                  <button
                    onClick={() => {
                      setSplitSuccess(null);
                      setFile(null);
                      setPreviews([]);
                      setSelectedPages([]);
                      setMode("pages");
                      setSubMode("all");
                    }}
                    className="w-full inline-flex items-center justify-center bg-gradient-to-r from-emerald-600 to-teal-650 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg hover:from-emerald-500 hover:to-teal-600 active:scale-[0.98] transition-all text-sm cursor-pointer"
                  >
                    ✨ Start New Split
                  </button>
                  
                  <button
                    onClick={() => setSplitSuccess(null)}
                    className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold py-3 px-6 rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    Back to Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
