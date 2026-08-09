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

          {/* Single Perfect Tool Highlight Box */}
          <div className="mb-6 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-orange-500/10 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
            <div className="bg-orange-600 text-white p-2.5 rounded-lg flex-shrink-0 shadow-sm">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-0.5">
                Native Vector & Fully Editable Engine
              </h4>
              <p className="text-[11px] text-gray-600 leading-tight">
                100% Vector Table Grids, Cell Borders, Fill Colors, Form Checkboxes & Editable Text. Zero Full-Page Background Images!
              </p>
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
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 text-xs text-gray-900 font-bold placeholder:text-gray-400 placeholder:font-normal bg-white shadow-sm transition"
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
              {loading ? "Converting PDF to PowerPoint..." : "Convert to PowerPoint (.pptx)"}
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

      {/* ❓ Comprehensive How to Use Modal */}
      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4 sm:p-6" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-6 sm:p-7 rounded-2xl shadow-2xl text-left w-full max-w-2xl relative z-60 border border-gray-100 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition">
              <X size={20} />
            </button>
            
            <h2 className="text-2xl font-bold mb-5 text-gray-800 flex items-center gap-2.5 border-b pb-3">
              <HelpCircle className="text-orange-600 w-7 h-7" /> How to Use PDF to PowerPoint Converter
            </h2>

            {/* Quick Steps */}
            <div className="space-y-3 mb-6">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Quick Conversion Steps</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-orange-50/70 border border-orange-100 p-3 rounded-xl flex flex-col items-start gap-1">
                  <span className="text-orange-600 font-bold text-xs bg-orange-200/80 px-2 py-0.5 rounded-md">Step 1</span>
                  <p className="text-xs text-gray-700 font-semibold mt-1">Upload PDF</p>
                  <p className="text-[11px] text-gray-500">Select any digital, scanned, financial, or ITR PDF file.</p>
                </div>
                <div className="bg-orange-50/70 border border-orange-100 p-3 rounded-xl flex flex-col items-start gap-1">
                  <span className="text-orange-600 font-bold text-xs bg-orange-200/80 px-2 py-0.5 rounded-md">Step 2</span>
                  <p className="text-xs text-gray-700 font-semibold mt-1">Configure Mode & DPI</p>
                  <p className="text-[11px] text-gray-500">Choose Visual Replica, Smart Hybrid, or Editable mode.</p>
                </div>
                <div className="bg-orange-50/70 border border-orange-100 p-3 rounded-xl flex flex-col items-start gap-1">
                  <span className="text-orange-600 font-bold text-xs bg-orange-200/80 px-2 py-0.5 rounded-md">Step 3</span>
                  <p className="text-xs text-gray-700 font-semibold mt-1">Convert & Download</p>
                  <p className="text-[11px] text-gray-500">Click Convert to download your 1:1 PPT presentation.</p>
                </div>
              </div>
            </div>

            {/* Conversion Modes Detailed Explanation */}
            <div className="mb-6 space-y-2">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} className="text-orange-600" /> Conversion Modes Explained
              </h3>
              <div className="space-y-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5 mb-1">
                    <span>🌟 Visual Replica (Recommended)</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-semibold">100% Visual Match</span>
                  </div>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    Converts each PDF page into a high-definition 1:1 visual slide layer. <strong>Best for Financial Statements, ITR forms, Accounting Balance Sheets, Hindi/Devanagari text, Stamps, Signatures, and complex merged-cell tables.</strong> Zero layout shift or text wrapping errors.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5 mb-1">
                    <span>⚡ Smart Hybrid Mode</span>
                  </div>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    Combines high-definition visual page background with exact-coordinate selectable text box overlays. Ideal when you want a pixel-perfect document background while still being able to highlight and copy text.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="font-bold text-gray-800 flex items-center gap-1.5 mb-1">
                    <span>✏️ Editable Objects Mode</span>
                  </div>
                  <p className="text-gray-600 text-[11px] leading-relaxed">
                    Reconstructs PDF tables into native PowerPoint editable tables with solid cell borders and converts text blocks into editable text boxes. Ideal for editing numbers and content inside PowerPoint.
                  </p>
                </div>
              </div>
            </div>

            {/* DPI & Page Range Explanation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl text-xs">
                <h4 className="font-bold text-gray-800 mb-1 flex items-center gap-1">
                  <Sliders size={13} className="text-orange-600" /> Rendering Quality (DPI)
                </h4>
                <ul className="space-y-1 text-[11px] text-gray-600 list-disc list-inside">
                  <li><strong>150 DPI:</strong> Fast processing & smaller file size.</li>
                  <li><strong>200 DPI:</strong> Recommended default (High clarity + Speed).</li>
                  <li><strong>300 - 600 DPI:</strong> Ultra HD archival print clarity.</li>
                </ul>
              </div>

              <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl text-xs">
                <h4 className="font-bold text-gray-800 mb-1 flex items-center gap-1">
                  <FileIcon size={13} className="text-orange-600" /> Page Range Selection
                </h4>
                <p className="text-[11px] text-gray-600 leading-relaxed mb-1">
                  Specify specific pages to convert instead of the entire document.
                </p>
                <p className="text-[10px] text-orange-700 bg-orange-50 p-1.5 rounded border border-orange-200 font-mono">
                  Example: 1-5, 8, 11-15
                </p>
              </div>
            </div>

            <button onClick={() => setShowHelp(false)} className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 transition text-sm shadow-md">
              Got it, Close Guide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
