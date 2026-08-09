"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, LayoutTemplate, HelpCircle, UploadCloud, Plus, File as FileIcon, Sparkles, Layers, Sliders, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function PdfToPowerpoint() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"replica" | "hybrid" | "editable">("replica");
  const [dpi, setDpi] = useState<number>(300);
  const [pageRange, setPageRange] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Converted.pptx");
  const [showHelp, setShowHelp] = useState(false);
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
    formData.append("dpi", dpi.toString());
    if (pageRange) {
      formData.append("page_range", pageRange);
    }

    try {
      const res = await axios.post(
        api("/converters/pdf-to-ppt"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Converted_${file.name.replace('.pdf', '')}.pptx`;
      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("PDF to PowerPoint", 1);
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data) {
        try {
          let errorText = "";
          if (e.response.data instanceof Blob) {
            errorText = await e.response.data.text();
          } else if (typeof e.response.data === "string") {
            errorText = e.response.data;
          }

          if (errorText) {
            try {
              const j = JSON.parse(errorText) as { code?: string; detail?: string };
              if (j?.code === "LOGIN_REQUIRED") {
                alert(`${j.detail || "Log in required"}\n\nPlease log in and try again.`);
                return;
              }
              if (j?.detail) {
                alert(`Conversion Error: ${j.detail}`);
                return;
              }
            } catch {
              alert(`Server Response (${e.response.status}): ${errorText.substring(0, 150)}`);
              return;
            }
          }
        } catch {}
      }
      alert("Conversion failed. Please try again with Visual Replica mode (200 DPI).");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-900 via-orange-800 to-amber-900 rounded-2xl p-6 mb-8 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 border border-orange-700/50">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
            <div className="bg-orange-500/20 p-2.5 rounded-xl text-orange-300 border border-orange-400/30">
              <LayoutTemplate className="w-8 h-8" />
            </div>
            PDF to POWERPOINT
          </h1>
          <p className="text-orange-200/80 text-sm mt-1">
            Universal Pixel-Preserving PDF to PPT Conversion Engine • High-Fidelity Match
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/20 text-orange-200 text-xs font-semibold border border-orange-500/30">
            <ShieldCheck size={14} className="text-emerald-400" /> 100% Visual Replica
          </span>
          <button onClick={() => setShowHelp(true)} className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-200 p-2.5 rounded-lg border border-orange-500/30 flex items-center gap-2 transition">
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto">
        {/* Left Column: Upload Area */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-orange-50/50 border-2 border-dashed border-orange-300 hover:border-orange-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[320px] transition shadow-sm bg-gradient-to-b from-orange-50/60 to-amber-50/20">
            <div className="bg-white p-4 rounded-2xl shadow-md mb-4 border border-orange-100">
              <UploadCloud className="w-12 h-12 text-orange-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-1">Upload PDF Document</h3>
            <p className="text-gray-500 mb-6 text-xs max-w-xs">
              Supports Scanned PDFs, Financial & ITR Statements, Accounting Tables, Hindi/English Text.
            </p>
            <button onClick={() => inputRef.current?.click()} className="bg-orange-600 text-white px-7 py-3 rounded-xl font-bold hover:bg-orange-700 shadow-md hover:shadow-lg flex items-center gap-2 transition transform active:scale-95">
              <Plus size={20} /> Select PDF File
            </button>
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Badges / Information Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-md border border-slate-700 text-xs space-y-3">
            <div className="flex items-center gap-2 font-bold text-orange-400 text-sm border-b border-slate-700/80 pb-2">
              <Sparkles size={16} /> Advanced Conversion Capabilities
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 1:1 Slide Ratio
              </div>
              <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Aspect Ratio Match
              </div>
              <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Financial/ITR Tables
              </div>
              <div className="flex items-center gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Hindi & Devanagari
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Settings & Conversion */}
        <div className="lg:col-span-7 bg-white border border-gray-200 rounded-2xl shadow-lg p-7 flex flex-col justify-start">
          <h2 className="text-xl font-bold mb-5 text-gray-800 border-b pb-3 flex items-center gap-2">
            <Sliders size={20} className="text-orange-600" /> Conversion Settings
          </h2>

          {/* Selected File Card */}
          {!file ? (
            <div className="flex flex-col items-center justify-center text-gray-400 py-8 bg-gray-50/50 rounded-xl border border-dashed mb-6">
              <FileIcon size={36} className="mb-2 opacity-30 text-gray-500" />
              <p className="text-xs font-medium">No PDF file selected yet.</p>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-orange-50/80 border border-orange-200 p-3.5 rounded-xl shadow-sm mb-6">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-orange-600 text-white p-2.5 rounded-lg flex-shrink-0">
                  <FileIcon size={18} />
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-bold text-sm text-gray-800 truncate">{file.name}</span>
                  <span className="text-xs text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              </div>
              <button onClick={() => { setFile(null); setDownloadUrl(null); setPageRange(""); }} className="text-gray-400 hover:text-red-500 p-1.5 bg-white border border-gray-200 rounded-full shadow-sm transition">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Mode Selector */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers size={14} className="text-orange-600" /> Conversion Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode("replica")}
                className={`p-3 rounded-xl text-left border transition flex flex-col justify-between ${
                  mode === "replica"
                    ? "bg-orange-50 border-orange-500 ring-2 ring-orange-500/20 text-orange-950 font-semibold"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="text-xs font-bold block mb-1">🌟 Visual Replica</span>
                <span className="text-[10px] text-gray-500 leading-tight">100% Exact Visual Match</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("hybrid")}
                className={`p-3 rounded-xl text-left border transition flex flex-col justify-between ${
                  mode === "hybrid"
                    ? "bg-orange-50 border-orange-500 ring-2 ring-orange-500/20 text-orange-950 font-semibold"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="text-xs font-bold block mb-1">⚡ Smart Hybrid</span>
                <span className="text-[10px] text-gray-500 leading-tight">High-Res Image + Text Overlays</span>
              </button>

              <button
                type="button"
                onClick={() => setMode("editable")}
                className={`p-3 rounded-xl text-left border transition flex flex-col justify-between ${
                  mode === "editable"
                    ? "bg-orange-50 border-orange-500 ring-2 ring-orange-500/20 text-orange-950 font-semibold"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="text-xs font-bold block mb-1">✏️ Editable Objects</span>
                <span className="text-[10px] text-gray-500 leading-tight">Reconstruct PPT Tables & Shapes</span>
              </button>
            </div>
          </div>

          {/* Quality / DPI Selector */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              Rendering Quality (DPI)
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: "150 DPI", val: 150, desc: "Fast" },
                { label: "200 DPI", val: 200, desc: "Medium" },
                { label: "300 DPI", val: 300, desc: "Default" },
                { label: "400 DPI", val: 400, desc: "Ultra" },
                { label: "600 DPI", val: 600, desc: "Max" },
              ].map((d) => (
                <button
                  key={d.val}
                  type="button"
                  onClick={() => setDpi(d.val)}
                  className={`py-2 px-1 rounded-lg border text-center transition ${
                    dpi === d.val
                      ? "bg-orange-600 text-white font-bold border-orange-600 shadow-sm"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  <div className="text-xs font-bold">{d.label}</div>
                  <div className={`text-[9px] ${dpi === d.val ? "text-orange-100" : "text-gray-400"}`}>{d.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Page Range Input */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Page Range (Optional)
            </label>
            <input
              type="text"
              value={pageRange}
              onChange={(e) => setPageRange(e.target.value)}
              placeholder="e.g. 1-5, 8, 11-15 (Leave blank for all pages)"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-xs"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Specify ranges if you only need specific pages of large PDFs.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-auto space-y-4 border-t pt-4">
            <button
              onClick={handleConvert}
              disabled={loading || !file}
              className="w-full bg-orange-600 text-white py-3.5 rounded-xl font-bold hover:bg-orange-700 disabled:opacity-50 transition shadow-lg flex justify-center items-center gap-2 text-base active:scale-[0.99]"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <LayoutTemplate className="w-5 h-5" />}
              {loading ? "Converting PDF to PowerPoint..." : "Convert to PowerPoint"}
            </button>

            {downloadUrl && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center shadow-sm">
                <a
                  href={downloadUrl}
                  download={downloadName}
                  onClick={() => setDownloadUrl(null)}
                  className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-xl hover:bg-emerald-700 font-bold transition shadow-md w-full justify-center text-sm"
                >
                  <FileDown size={18} /> Download PowerPoint (.pptx)
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ❓ How to Use Modal */}
      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-6" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-6 rounded-2xl shadow-2xl text-left w-full max-w-lg relative z-60 border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition"><X size={20} /></button>
            <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2"><HelpCircle className="text-orange-500" /> How to use PDF to PPT</h2>
            <div className="space-y-3 text-gray-600 text-xs">
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-start gap-3">
                <span className="text-orange-600 font-bold text-sm bg-orange-200/60 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">1</span>
                <p><strong>Upload:</strong> Select any PDF file (including scanned, financial, ITR, or accounting documents).</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-start gap-3">
                <span className="text-orange-600 font-bold text-sm bg-orange-200/60 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">2</span>
                <p><strong>Select Mode:</strong> Choose <strong>Visual Replica</strong> for 100% exact visual match (ILovePDF parity) or <strong>Editable Objects</strong> to reconstruct PPT tables.</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-start gap-3">
                <span className="text-orange-600 font-bold text-sm bg-orange-200/60 w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0">3</span>
                <p><strong>Convert & Download:</strong> Click Convert to generate and download your high-fidelity presentation.</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-5 w-full bg-orange-600 text-white font-semibold py-2.5 rounded-xl hover:bg-orange-700 transition text-sm">Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
}
