"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { 
  Loader2, 
  FileDown, 
  X, 
  FileText, 
  HelpCircle, 
  UploadCloud, 
  Plus, 
  File as FileIcon,
  Sparkles,
  Layers,
  Table,
  Palette,
  Image as ImageIcon,
  CheckCircle2,
  Sliders,
  Languages
} from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

type ConversionMode = "replica" | "editable" | "ocr";

export default function PdfToWord() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Converted.docx");
  const [showHelp, setShowHelp] = useState(false);

  // Conversion Options
  const [mode, setMode] = useState<ConversionMode>("replica");
  const [pageRange, setPageRange] = useState<string>("");
  const [preserveTables, setPreserveTables] = useState<boolean>(true);
  const [preserveColors, setPreserveColors] = useState<boolean>(true);
  const [preserveImages, setPreserveImages] = useState<boolean>(true);
  const [preservePageSize, setPreservePageSize] = useState<boolean>(true);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFile = e.target.files[0];
      if (!newFile.type.includes('pdf')) {
        alert("Only PDF files are allowed.");
        return;
      }
      setFile(newFile);
      setDownloadUrl(null);
    }
  };

  const handleConvert = async () => {
    if (!file) return alert("Select a PDF file first");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);
    formData.append("page_range", pageRange);
    formData.append("preserve_tables", String(preserveTables));
    formData.append("preserve_colors", String(preserveColors));
    formData.append("preserve_images", String(preserveImages));
    formData.append("preserve_page_size", String(preservePageSize));
    formData.append("ocr_lang", "hin+eng");

    try {
      const res = await axios.post(
        api("/converters/pdf-to-word"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Extracted_${file.name.replace('.pdf', '')}.docx`;
      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("PDF to Word", 1);
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const j = JSON.parse(text) as { code?: string; detail?: string };
          if (j?.code === "LOGIN_REQUIRED") {
             alert(`${j.detail || "Log in required"}\n\nPlease log in and try again.`);
             return;
          }
          if (j?.detail) {
             alert(j.detail);
             return;
          }
        } catch {}
      }
      alert("Conversion failed. Please try again or use a different correct PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 animate-fade-in relative">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 md:p-8 mb-8 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 text-white">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold flex items-center gap-3">
            <div className="bg-blue-500/20 p-2.5 rounded-xl border border-blue-400/30 text-blue-300">
              <FileText className="w-8 h-8" />
            </div>
            Smart PDF to WORD (DOCX)
          </h1>
          <p className="text-blue-200/90 mt-2 text-sm md:text-base font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            Layout Geometry, Cell Fill Colors, Devanagari Integrity & Hybrid OCR Engine
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowHelp(true)} 
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl border border-white/20 flex items-center gap-2 text-sm font-bold transition shadow-sm"
          >
            <HelpCircle size={18} />
            <span>Guide</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: Upload & File Panel */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md hover:shadow-lg transition">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UploadCloud className="text-blue-600 w-5 h-5" /> Document Input
            </h2>
            
            <div 
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/40 hover:bg-blue-50 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition group"
            >
              <div className="bg-white p-4 rounded-full shadow-md group-hover:scale-110 transition duration-300 mb-3">
                <FileText className="w-10 h-10 text-blue-600" />
              </div>
              <p className="font-bold text-slate-700 text-base">Click to Upload PDF</p>
              <p className="text-xs text-slate-500 mt-1">Supports vector documents, scanned PDFs & Hindi/Nepali fonts</p>
              <button 
                type="button"
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-xs font-bold shadow transition flex items-center gap-1.5"
              >
                <Plus size={16} /> Browse File
              </button>
              <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Selected File Card */}
            {file && (
              <div className="mt-5 bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-blue-100 text-blue-700 p-2.5 rounded-lg flex-shrink-0">
                    <FileIcon size={20} />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-sm text-slate-800 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>
                <button 
                  onClick={() => {setFile(null); setDownloadUrl(null);}} 
                  className="text-slate-400 hover:text-red-500 p-1.5 bg-white border border-slate-200 rounded-full hover:border-red-300 transition"
                  title="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Quick Engine Specs */}
          <div className="bg-slate-900 text-slate-200 rounded-2xl p-6 shadow-md border border-slate-800 text-xs space-y-3">
            <h3 className="font-bold text-amber-400 text-sm flex items-center gap-2">
              <Sparkles size={16} /> Engine Highlights
            </h3>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="font-bold text-white block">📐 Exact Geometry</span>
                Matches page dimensions & section margins
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="font-bold text-white block">📊 Native Tables</span>
                Extracts cell borders & background fill colors
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="font-bold text-white block">🇮🇳 Hindi Devanagari</span>
                Automatic ligatures & reph reordering
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                <span className="font-bold text-white block">⚡ Hybrid OCR</span>
                Auto-switches for scanned & CID corrupt pages
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Options & Actions Panel */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md">
            <h2 className="text-lg font-bold text-slate-800 mb-5 flex items-center gap-2 border-b pb-3">
              <Sliders className="text-blue-600 w-5 h-5" /> Conversion Mode & Controls
            </h2>

            {/* 1. Mode Selection */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                Conversion Engine Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setMode("replica")}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition ${
                    mode === "replica"
                      ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 text-blue-900"
                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Layers className="w-4 h-4 text-blue-600" />
                    {mode === "replica" && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div>
                    <p className="font-bold text-xs">Exact Replica</p>
                    <p className="text-[11px] opacity-75 mt-0.5">Preserves exact coordinates & design geometry</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("editable")}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition ${
                    mode === "editable"
                      ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 text-blue-900"
                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <FileText className="w-4 h-4 text-blue-600" />
                    {mode === "editable" && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div>
                    <p className="font-bold text-xs">Flowable Editable</p>
                    <p className="text-[11px] opacity-75 mt-0.5">Optimized for easy text editing in Word</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("ocr")}
                  className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition ${
                    mode === "ocr"
                      ? "bg-blue-50 border-blue-600 ring-2 ring-blue-500/20 text-blue-900"
                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Languages className="w-4 h-4 text-blue-600" />
                    {mode === "ocr" && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div>
                    <p className="font-bold text-xs">OCR Engine</p>
                    <p className="text-[11px] opacity-75 mt-0.5">High-DPI parsing for scanned PDFs</p>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Page Range Input */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Page Range (Optional)
              </label>
              <input 
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder="All pages (or type e.g. 1-5, 8, 11-15)"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none bg-slate-50/40"
              />
            </div>

            {/* 3. Advanced Toggle Switches */}
            <div className="space-y-3 mb-6 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Table className="w-4 h-4 text-blue-600" /> Preserve Native Tables & Cell Colors
                </span>
                <input 
                  type="checkbox" 
                  checked={preserveTables} 
                  onChange={(e) => setPreserveTables(e.target.checked)} 
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-blue-600" /> Extract Text & Background Color Fills
                </span>
                <input 
                  type="checkbox" 
                  checked={preserveColors} 
                  onChange={(e) => setPreserveColors(e.target.checked)} 
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-blue-600" /> Extract Embedded Images
                </span>
                <input 
                  type="checkbox" 
                  checked={preserveImages} 
                  onChange={(e) => setPreserveImages(e.target.checked)} 
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" /> Match PDF Page Size & Margins
                </span>
                <input 
                  type="checkbox" 
                  checked={preservePageSize} 
                  onChange={(e) => setPreservePageSize(e.target.checked)} 
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </label>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-2">
              <button 
                onClick={handleConvert} 
                disabled={loading || !file} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-extrabold transition shadow-lg hover:shadow-xl disabled:opacity-50 flex justify-center items-center gap-2 text-base"
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                {loading ? "Processing Document..." : "Convert to WORD (.docx)"}
              </button>

              {downloadUrl && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center animate-fade-in">
                  <p className="text-xs text-green-800 font-bold mb-2">🎉 Conversion Complete!</p>
                  <a 
                    href={downloadUrl} 
                    download={downloadName} 
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-md w-full justify-center text-sm"
                  >
                    <FileDown size={18} /> Download {downloadName}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-6" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-6 rounded-2xl shadow-2xl text-left w-full max-w-lg relative z-60" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 p-1.5 rounded-full"><X size={18} /></button>
            <h2 className="text-xl font-extrabold mb-4 text-slate-800 flex items-center gap-2">
              <HelpCircle className="text-blue-600" /> PDF to WORD Guide
            </h2>
            <div className="space-y-3 text-slate-600 text-xs">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-start gap-3">
                <span className="text-blue-600 font-bold text-base">1</span>
                <p><strong>Exact Replica Mode:</strong> Best for retaining original column geometry, complex graphics, and multi-grid visual design.</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-start gap-3">
                <span className="text-blue-600 font-bold text-base">2</span>
                <p><strong>Editable Mode:</strong> Best for standard document editing, re-typing paragraphs, and inline text updates.</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex items-start gap-3">
                <span className="text-blue-600 font-bold text-base">3</span>
                <p><strong>Smart OCR:</strong> Automatically extracts scanned pages and legacy Hindi fonts (KrutiDev / DevLys) without text loss.</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-6 w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 transition">Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
}
