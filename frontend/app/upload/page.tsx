"use client";

import { useState, useEffect, useRef } from "react";
import { Copy, ChevronLeft, ChevronRight, Check, Zap, HelpCircle, UploadCloud, Plus, X, FileText, Download } from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";
import RequireAuth from "@/components/RequireAuth";

export default function OCRUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollingId, setPollingId] = useState<number | null>(null);
  const [lang, setLang] = useState("eng");
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // pagination
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("Please select a file first!");

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setText(null);
    setPages([]);
    setCurrentPage(0);

    try {
      const res = await fetchWithAuth(api(`/upload?lang=${encodeURIComponent(lang)}`), {
        method: "POST",
        body: formData,
      });

      if (res.status === 401) {
        alert("Please log in to use OCR features on MeriPDF.");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Upload failed");
        return;
      }
      setPollingId(data.doc_id);
      setProcessing(true);
      toast.success("Document uploaded, analyzing text...");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed!");
    } finally {
      setLoading(false);
    }
  };

  // Polling OCR result
  useEffect(() => {
    if (!pollingId) return;

    let isDone = false;
    const interval = setInterval(async () => {
      if (isDone) {
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetchWithAuth(api(`/documents/${pollingId}`));
        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            isDone = true;
            setText(data.text);
            setProcessing(false);
            setPollingId(null);
            clearInterval(interval);
            const rawPages = data.text.split(/--- Page \d+ ---/).filter(Boolean);
            setPages(rawPages);
            setCurrentPage(0);
            logPDFOperation("OCR Scan PDF", rawPages.length || 1);
          }
        }
      } catch (err) {
        console.error("Polling failed", err);
      }
    }, 2000);

    return () => {
      isDone = true;
      clearInterval(interval);
    };
  }, [pollingId]);

  // Copy handler
  const handleCopy = () => {
    if (pages.length > 0) {
      navigator.clipboard.writeText(pages[currentPage]).then(() => {
        setCopied(true);
        toast.success("Copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  // Download handler
  const handleDownloadTxt = () => {
    if (pages.length > 0) {
      const allText = pages.join("\n\n");
      const blob = new Blob([allText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MeriPDF_OCR.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <RequireAuth>
      <div className="max-w-7xl mx-auto px-6 pb-6 pt-4 relative">
        
        {/* Full-screen Loading/Processing Overlay */}
        {(loading || processing) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              {/* Premium Top Accent Bar */}
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 animate-pulse"></div>
              
              <div className="relative mb-6 flex items-center justify-center">
                {/* Outer spinning ring */}
                <div className="w-20 h-20 rounded-full border-4 border-rose-100 border-t-rose-600 animate-spin"></div>
                {/* Inner pulsing icon */}
                <div className="absolute bg-rose-50 p-3.5 rounded-full">
                  <Zap className="w-7 h-7 text-rose-600 animate-bounce" />
                </div>
              </div>
              
              <h3 className="text-2xl font-black text-gray-900 mb-2">
                {loading ? "Uploading Document" : "Analyzing OCR Content"}
              </h3>
              
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-6 overflow-hidden">
                <div className={`h-full bg-rose-600 rounded-full ${loading ? 'w-1/3' : 'w-2/3'} animate-pulse`}></div>
              </div>
              
              <p className="text-gray-600 text-sm leading-relaxed">
                {loading 
                  ? "Uploading your file safely to our secure processing servers. Please do not close this window." 
                  : "Our Machine Learning Engine is actively parsing the pages and extracting raw text from your document."
                }
              </p>
              
              <div className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping"></span>
                <span>Active Extraction Pipeline</span>
              </div>
            </div>
          </div>
        )}
        
        {/* --- Top Premium Header --- */}
        <div className="bg-gradient-to-r from-rose-900 to-rose-700 rounded-2xl p-6 mb-6 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
            <div className="bg-rose-500/20 p-2 rounded-lg text-rose-300">
              <Zap className="w-8 h-8" />
            </div>
            OCR PDF Tool
          </h1>

          <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
            {/* Help Button */}
            <button
              onClick={() => setShowHelp(true)}
              className="bg-rose-500/20 text-rose-200 p-2.5 rounded-lg border border-rose-500/30 shadow hover:bg-rose-500/30 transition flex items-center justify-center gap-2"
              title="How to Use"
            >
              <HelpCircle size={20} />
              <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
            </button>

            <div className="bg-slate-800/50 border border-slate-700 text-slate-300 py-2 px-4 rounded-lg text-sm shadow-inner">
              Extract <strong>Selectable Text</strong> from scanned images/PDFs.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto mt-10">
          
          {/* ================= LEFT : UPLOAD PANEL ================= */}
          <div className="bg-rose-50/50 border-2 border-dashed border-rose-300 rounded-xl p-8 flex flex-col items-center justify-center text-center transition">
            {!file ? (
              <>
                <div className="bg-white p-4 rounded-full shadow mb-4">
                  <UploadCloud className="w-12 h-12 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-700 mb-2">Upload your Document</h3>
                <p className="text-gray-500 mb-6 text-sm">Select a scanned PDF or Image to extract text.</p>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="bg-rose-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-rose-700 shadow flex items-center gap-2 transition"
                >
                  <Plus size={20} /> Select File
                </button>
              </>
            ) : (
              <div className="w-full relative bg-white border border-rose-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
                <button
                  onClick={() => { setFile(null); setPages([]); }}
                  className="absolute top-3 right-3 text-rose-600 hover:text-rose-800 bg-rose-50 rounded-full p-1 border border-rose-100 transition"
                  disabled={loading || processing}
                >
                  <X size={16} />
                </button>
                <Zap className="w-12 h-12 text-rose-500 mb-3" />
                <p className="font-semibold text-gray-800 truncate w-full px-4">{file.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              id="fileUpload"
              accept="application/pdf, image/jpeg, image/png"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* ================= RIGHT : ACTION PANEL ================= */}
          <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-start">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-4">Configuration</h2>
            
            {/* Language Dropdown */}
            <div className="mb-8">
              <label htmlFor="lang" className="block text-sm font-semibold text-gray-700 mb-2">
                Document Language:
              </label>
              <select
                id="lang"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none text-gray-700 bg-gray-50 font-medium"
                disabled={loading || processing}
              >
                <option value="eng">🇺🇸 English</option>
                <option value="hin">🇮🇳 Hindi</option>
                <option value="eng+hin">🇺🇸 + 🇮🇳 English & Hindi</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Help the AI identify the text by correctly setting the source language.
              </p>
            </div>

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              className="w-full bg-rose-600 text-white py-3 px-4 rounded-lg hover:bg-rose-700 transition disabled:bg-gray-400 font-bold shadow disabled:cursor-not-allowed mt-auto"
              disabled={loading || processing || !file}
            >
              {loading ? "⏳ Uploading to Server..." : processing ? "🤖 Analyzing Document..." : "🚀 Run OCR Extraction"}
            </button>
          </div>
        </div>

        {/* ================= BOTTOM : RESULTS PANEL ================= */}
        {processing && !text && (
           <div className="mt-10 p-8 bg-slate-50 border rounded-xl shadow-sm text-center">
             <div className="inline-flex items-center justify-center space-x-3 text-rose-600 font-bold animate-pulse">
               <Zap className="w-6 h-6 animate-spin" style={{ animationDuration: '2s' }} />
               <span className="text-lg">Machine Learning Engine is extracting text...</span>
             </div>
             <p className="text-sm text-gray-500 mt-2">This may take a few seconds depending on the document length.</p>
           </div>
        )}

        {pages.length > 0 && (
          <div className="mt-10 bg-white border rounded-xl shadow p-6 relative isolate">
            <div className="flex justify-between items-center mb-4">
               <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                 <FileText className="text-rose-500" /> Extracted Text Results
               </h3>
               
               {/* Action buttons */}
               <div className="flex z-10 gap-3">
                 <button
                    onClick={handleDownloadTxt}
                    className="bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition flex items-center gap-2 font-semibold text-sm shadow cursor-pointer"
                  >
                    <Download size={16} />
                    Download .txt
                  </button>
                 <button
                    onClick={handleCopy}
                    className="bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition flex items-center gap-2 font-semibold text-sm shadow cursor-pointer"
                  >
                    {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    {copied ? "Copied!" : "Copy Text"}
                  </button>
               </div>
            </div>

            <div className="bg-slate-900 text-emerald-300 p-6 rounded-xl shadow-inner whitespace-pre-wrap leading-relaxed min-h-[300px] max-h-[600px] overflow-y-auto font-mono text-sm selection:bg-rose-500 selection:text-white">
              {pages[currentPage]}
            </div>

            {/* Navigation Arrows */}
            {pages.length > 1 && (
              <div className="flex justify-self-center mt-6 gap-4 text-gray-700 bg-slate-100 p-2 rounded-full shadow-sm w-fit mx-auto">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="p-2 bg-white shadow-sm rounded-full disabled:opacity-40 hover:bg-rose-50 text-slate-800 transition"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-slate-700 self-center font-bold text-sm px-2">
                  Page {currentPage + 1} of {pages.length}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(pages.length - 1, p + 1))}
                  disabled={currentPage === pages.length - 1}
                  className="p-2 bg-white shadow-sm rounded-full disabled:opacity-40 hover:bg-rose-50 text-slate-800 transition"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ❓ How to Use Modal */}
        {showHelp && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-6" onClick={() => setShowHelp(false)}>
            <div className="bg-white p-6 rounded-xl shadow-2xl text-left w-full max-w-lg relative z-60" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1"
              >
                <X size={20} />
              </button>
              <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                <HelpCircle className="text-rose-500" /> How OCR Works
              </h2>
              <div className="space-y-4 text-gray-600 text-sm">
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg flex items-start gap-3">
                  <span className="text-rose-600 font-bold text-lg">1</span>
                  <p><strong>Upload Document:</strong> Select and upload your scanned PDF or Image file.</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg flex items-start gap-3">
                  <span className="text-rose-600 font-bold text-lg">2</span>
                  <p><strong>Language Select:</strong> Choose the language present in your document (English, Hindi, or Both) for maximum accuracy.</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg flex items-start gap-3">
                  <span className="text-rose-600 font-bold text-lg">3</span>
                  <p><strong>Extract Text:</strong> Our powerful FastAPI + Tesseract backend will scan the document using AI magically pull out raw, selectable text for you to copy!</p>
                </div>
              </div>
              
              <button
                onClick={() => setShowHelp(false)}
                className="mt-6 w-full bg-rose-600 text-white font-semibold py-2 rounded-lg hover:bg-rose-700 transition"
              >
                Got it, let's go!
              </button>
            </div>
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
