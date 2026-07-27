"use client";

import React, { useRef, useState } from "react";
import axios from "axios";
import { 
  Loader2, 
  FileDown, 
  X, 
  Plus, 
  HelpCircle, 
  Sparkles,
  FileText,
  Grid,
  CheckCircle2,
  Trash2,
  FolderOpen
} from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";
import { toast } from "react-hot-toast";

export default function CompressPDF() {
  const [files, setFiles] = useState<File[]>([]);
  const [level, setLevel] = useState("recommended");
  const [mode, setMode] = useState<"merged" | "per-file">("merged");
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("compressed.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
    setDownloadUrl(null);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setDownloadUrl(null);
  };

  const handleCompress = async () => {
    if (!files.length) {
      toast.error("Please select a PDF file first");
      return;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("compression_level", level);
    formData.append("mode", mode);

    try {
      const res = await axios.post(
        api("/compress/pdf/compress"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      let filename = mode === "per-file" ? "DocIntel_Compressed.zip" : "DocIntel_Compressed.pdf";
      const url = URL.createObjectURL(new Blob([res.data]));
      
      setDownloadUrl(url);
      setDownloadName(filename);
      
      // Log event to client-side analytics
      logPDFOperation("Compress PDF", files.length);
      toast.success("PDF compressed successfully!");
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const j = JSON.parse(text) as { code?: string; detail?: string };
          if (j?.code === "LOGIN_REQUIRED") {
            toast.error(j.detail || "Verification required to process daily requests.");
            return;
          }
        } catch {
          /* fall through */
        }
      }
      toast.error("Compression failed. Please verify file integrity.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">

      {/* --- Top Premium Header --- */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-905 from-slate-900 via-indigo-950 to-slate-900 py-12 px-6 shadow-md">
        <div className="absolute top-0 right-0 w-84 h-84 bg-orange-500/10 rounded-full filter blur-3xl translate-x-1/3 -translate-y-1/3"></div>
        <div className="max-w-6xl mx-auto relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-bold text-orange-400 mb-4">
              <Sparkles className="w-3.5 h-3.5" /> High-Fidelity Compression
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Compress PDF Configuration
            </h1>
            <p className="text-slate-400 text-sm mt-2 max-w-xl">
              Optimize file sizes without losing structural quality. Choose from multiple options to scale down document MB limits.
            </p>
          </div>

          <div className="flex items-center gap-3.5 flex-wrap">
            <button
              onClick={() => setShowHelp(true)}
              className="bg-white/10 text-white hover:bg-white/15 px-4.5 py-2.5 rounded-xl border border-white/10 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-orange-400" />
              <span>How it works</span>
            </button>

            <div className="bg-slate-850 bg-slate-800/60 border border-slate-700/60 text-slate-350 text-xs py-2.5 px-4 rounded-xl shadow-inner font-medium">
              Daily Limit: <span className="text-white font-bold">5 free actions/day</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ================= LEFT : FILE CARDS WORKSPACE ================= */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-3.5 mb-6 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-500" /> Loaded Documents ({files.length})
              </h3>

              {files.length === 0 ? (
                /* Empty Upload State */
                <div 
                  onClick={() => inputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-orange-500 bg-slate-50/50 hover:bg-orange-50/20 rounded-2xl p-12 text-center cursor-pointer transition select-none group"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-all">
                    <Plus className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">Select PDF files to compress</h4>
                  <p className="text-[11px] text-slate-450 text-slate-400 mt-1.5 leading-relaxed">
                    Click to browse your device files. Support batch execution.
                  </p>
                </div>
              ) : (
                /* Grid of selected files */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {files.map((file, i) => (
                    <div 
                      key={i}
                      className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4.5 relative group shadow-xs flex flex-col justify-between min-h-[110px]"
                    >
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-rose-600 p-1.5 hover:bg-slate-50 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="pr-8">
                        <FileText className="w-6 h-6 text-red-500 mb-2.5" />
                        <p className="text-xs font-bold text-slate-850 text-slate-800 truncate" title={file.name}>
                          {file.name}
                        </p>
                      </div>

                      <div className="border-t border-slate-50 pt-2 mt-2 flex justify-between items-center text-[10px] text-slate-450 text-slate-400 font-semibold">
                        <span>PDF Document</span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md font-bold text-slate-700">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Add file card inside grid */}
                  <div 
                    onClick={() => inputRef.current?.click()}
                    className="border-2 border-dashed border-slate-250 border-slate-300 hover:border-orange-500 rounded-xl flex flex-col items-center justify-center min-h-[110px] cursor-pointer hover:bg-orange-50/20 text-slate-550 text-slate-500 hover:text-orange-600 transition"
                  >
                    <Plus className="w-5 h-5 mb-1.5" />
                    <span className="text-[11px] font-bold">Add files</span>
                  </div>
                </div>
              )}

              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>
          </div>

          {/* ================= RIGHT : FIXED CONTROL SIDEBAR ================= */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-205 border-slate-200 rounded-2xl shadow-sm p-6 relative overflow-hidden">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-3 mb-5">
                Compression Settings
              </h3>

              {/* Mode Selection */}
              <div className="mb-5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Output Mode</span>
                <div className="flex bg-slate-100 rounded-xl p-0.5.5 p-1 text-xs font-bold w-full select-none">
                  <button
                    type="button"
                    onClick={() => setMode("merged")}
                    className={`flex-1 py-2 px-3 rounded-lg text-[11px] transition duration-250 cursor-pointer ${
                      mode === "merged"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Merge & Compress
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("per-file")}
                    className={`flex-1 py-2 px-3 rounded-lg text-[11px] transition duration-250 cursor-pointer ${
                      mode === "per-file"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Compress Each
                  </button>
                </div>
              </div>

              {/* Quality Levels */}
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Select Density</span>
                <div className="space-y-3">
                  {[
                    {
                      id: "extreme",
                      title: "Extreme Compression",
                      desc: "Lowest density · maximum payload reduction",
                    },
                    {
                      id: "recommended",
                      title: "Recommended Level",
                      desc: "Balanced density · good quality",
                    },
                    {
                      id: "less",
                      title: "High Fidelity Status",
                      desc: "Original density · high quality",
                    },
                  ].map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex gap-3.5 p-3.5 border rounded-xl cursor-pointer transition select-none items-start ${
                        level === opt.id
                          ? "border-orange-505 border-orange-500 bg-orange-50/20"
                          : "border-slate-200 hover:border-slate-355 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="compression-radio"
                        checked={level === opt.id}
                        onChange={() => setLevel(opt.id)}
                        className="mt-0.5 accent-orange-600 focus:ring-0"
                      />
                      <div>
                        <p className={`text-xs font-bold transition-colors ${level === opt.id ? "text-orange-700" : "text-slate-900"}`}>{opt.title}</p>
                        <p className="text-[10px] text-slate-450 text-slate-400 font-semibold mt-0.5">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Execution Actions */}
              <div className="border-t border-slate-100 mt-6 pt-5">
                <button
                  onClick={handleCompress}
                  disabled={loading || files.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all text-white font-bold py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer text-xs disabled:opacity-50 disabled:pointer-events-none hover:shadow-lg"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="animate-spin w-4 h-4 text-white" /> Optimize Layouts...
                    </span>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" />
                      <span>Compress Documents</span>
                    </>
                  )}
                </button>

                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={downloadName}
                    className="mt-3.5 flex justify-center items-center gap-2 bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl font-bold text-xs select-none shadow hover:shadow-md transition active:scale-[0.98]"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white animate-pulse" /> Download Result PDF
                  </a>
                )}
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* ❓ How to Use Modal */}
      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/60 z-50 p-6 backdrop-blur-xs animate-in fade-in duration-200" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-8 rounded-3xl shadow-2xl text-left w-full max-w-lg relative animate-in zoom-in-95 duration-250" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5"
            >
              <X size={18} />
            </button>
            <h2 className="text-xl font-black mb-6 text-slate-900 flex items-center gap-2 border-b pb-3 border-slate-100">
              <HelpCircle className="text-orange-500 w-5 h-5 shrink-0" /> Guide: Compressing PDFs
            </h2>
            <div className="space-y-4 text-slate-600 text-xs">
              <div className="bg-orange-50/20 border border-orange-100/50 p-3.5 rounded-xl flex items-start gap-3">
                <span className="bg-orange-100 text-orange-700 w-5 h-5 rounded-full shrink-0 flex items-center justify-center font-bold text-xs">1</span>
                <p className="leading-relaxed"><strong>Add Files:</strong> Click the large upload area or grid slot to select one or multiple PDF documents.</p>
              </div>
              <div className="bg-orange-50/20 border border-orange-100/50 p-3.5 rounded-xl flex items-start gap-3">
                <span className="bg-orange-100 text-orange-700 w-5 h-5 rounded-full shrink-0 flex items-center justify-center font-bold text-xs">2</span>
                <p className="leading-relaxed"><strong>Choose Output Mode:</strong> <br/>• <em>Merge & Compress:</em> Combines all selected files into one single PDF.<br/>• <em>Compress Each:</em> Compresses every document individually and bundles them in a package ZIP folder.</p>
              </div>
              <div className="bg-orange-50/20 border border-orange-100/50 p-3.5 rounded-xl flex items-start gap-3">
                <span className="bg-orange-100 text-orange-700 w-5 h-5 rounded-full shrink-0 flex items-center justify-center font-bold text-xs">3</span>
                <p className="leading-relaxed"><strong>Select Density Level:</strong> Choose Extreme (maximum page compression, lower visual quality), Recommended (balanced output), or High Fidelity (original visuals, lower bytes compression).</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full bg-slate-900 border border-slate-800 text-white font-bold py-3.5 rounded-xl hover:bg-slate-850 transition cursor-pointer text-xs"
            >
              Start Compression utilities
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
