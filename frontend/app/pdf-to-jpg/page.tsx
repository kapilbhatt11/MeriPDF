"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, Image, HelpCircle, UploadCloud, Plus, File as FileIcon } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function PdfToJpg() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Converted.zip");
  const [mode, setMode] = useState<string>("pages");
  const [dpi, setDpi] = useState<string>("150");
  const [format, setFormat] = useState<string>("jpg");
  const [pageRange, setPageRange] = useState<string>("");
  const [targetKb, setTargetKb] = useState<string>("");
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
    formData.append("dpi", dpi);
    formData.append("format", format);
    formData.append("page_range", pageRange);
    if (targetKb) {
      formData.append("target_kb", targetKb);
    }

    try {
      const res = await axios.post(
        api("/converters/pdf-to-jpg"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      const contentType = res.data.type || res.headers["content-type"] || "";
      let filename = `Converted_${file.name.replace('.pdf', '')}.zip`;
      if (mode === "text" || mode === "text_ocr") {
        filename = `Extracted_Text_${file.name.replace('.pdf', '')}.txt`;
      } else if (mode === "images") {
        filename = `Extracted_Images_${file.name.replace('.pdf', '')}.zip`;
      } else if (contentType.includes("image/")) {
        const ext = format === "jpg" ? "jpg" : format;
        filename = `Converted_${file.name.replace('.pdf', '')}.${ext}`;
      }

      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
           filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("PDF to JPG", 1);
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
    <div className="max-w-7xl mx-auto p-6 relative">
      <div className="bg-gradient-to-r from-amber-900 to-amber-700 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
          <div className="bg-amber-500/20 p-2 rounded-lg text-amber-300">
            <Image className="w-8 h-8" />
          </div>
          PDF to JPG
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHelp(true)} className="bg-amber-500/20 text-amber-200 p-2.5 rounded-lg border border-amber-500/30 flex items-center gap-2">
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <div className="bg-amber-50/50 border-2 border-dashed border-amber-300 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="bg-white p-4 rounded-full shadow mb-4">
            <UploadCloud className="w-12 h-12 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Upload PDF</h3>
          <p className="text-gray-500 mb-6 text-sm">Select a PDF document.</p>
          <button onClick={() => inputRef.current?.click()} className="bg-amber-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-amber-700 shadow flex items-center gap-2 transition">
            <Plus size={20} /> Select PDF
          </button>
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
        </div>

        <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-start">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-4">Selected File</h2>
          {!file ? (
             <div className="flex flex-col items-center justify-center text-gray-400 py-10">
               <FileIcon size={40} className="mb-3 opacity-20" />
               <p className="text-sm">No file selected yet.</p>
             </div>
          ) : (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-lg shadow-sm hover:border-amber-300 transition group mb-6">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-amber-100 text-amber-600 p-2 rounded flex-shrink-0">
                  <FileIcon size={16} />
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-semibold text-sm text-gray-700 truncate">{file.name}</span>
                </div>
              </div>
              <button onClick={() => {setFile(null); setDownloadUrl(null);}} className="text-gray-400 hover:text-red-500 p-1 bg-white border border-gray-200 rounded-full shadow-sm">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="mt-auto space-y-4 border-t pt-4">
            <div className="flex flex-col gap-2 mb-2">
              <label className="text-sm font-bold text-gray-700">Extraction Mode</label>
              <select 
                value={mode} 
                onChange={(e) => setMode(e.target.value)}
                className="p-2.5 border rounded-lg bg-slate-50 text-gray-700 font-semibold shadow-sm focus:ring-2 focus:ring-amber-500 outline-none hover:border-amber-300 transition"
              >
                <option value="pages">Convert Pages to JPG/PNG/WEBP (ZIP/Single Image)</option>
                <option value="images">Extract Embedded Images (ZIP/Single Image)</option>
                <option value="text">Extract Text Only (.TXT)</option>
                <option value="text_ocr">Extract Text with OCR (Solves Hindi Font Issues)</option>
              </select>
            </div>

            {/* Advanced Settings */}
            {mode === "pages" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-600">Image Format</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="p-2 border rounded-lg bg-slate-50 text-gray-700 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-amber-500 outline-none hover:border-amber-300 transition"
                  >
                    <option value="jpg">JPG (Best Compatibility)</option>
                    <option value="png">PNG (Lossless Quality)</option>
                    <option value="webp">WEBP (Optimized Weight)</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-600">Resolution (DPI)</label>
                  <select
                    value={dpi}
                    onChange={(e) => setDpi(e.target.value)}
                    className="p-2 border rounded-lg bg-slate-50 text-gray-700 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-amber-500 outline-none hover:border-amber-300 transition"
                  >
                    <option value="75">75 DPI (Low - Fast)</option>
                    <option value="150">150 DPI (Standard)</option>
                    <option value="300">300 DPI (High - Sharp)</option>
                  </select>
                </div>
              </div>
            )}

            {mode === "text_ocr" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-600">OCR Resolution (DPI)</label>
                <select
                  value={dpi}
                  onChange={(e) => setDpi(e.target.value)}
                  className="p-2 border rounded-lg bg-slate-50 text-gray-700 text-sm font-semibold shadow-sm focus:ring-2 focus:ring-amber-500 outline-none hover:border-amber-300 transition"
                >
                  <option value="150">150 DPI (Balanced)</option>
                  <option value="300">300 DPI (High Accuracy)</option>
                </select>
              </div>
            )}

            {/* Page Range Selection */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-600 flex justify-between">
                <span>Page Range (Optional)</span>
                <span className="text-[10px] text-gray-400 font-normal">e.g. 1-3, 5, 8-10</span>
              </label>
              <input
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder="All pages if blank"
                className="p-2 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm font-medium shadow-sm focus:ring-2 focus:ring-amber-500 outline-none hover:border-amber-300 transition placeholder-gray-400"
              />
            </div>

            {/* Target KB Size Limit */}
            {mode === "pages" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-600 flex justify-between items-center">
                  <span>Target Image Size Limit (Optional)</span>
                  <span className="text-[10px] text-amber-600 font-semibold cursor-help" title="Iteratively optimizes quality & scale to meet size. (Only applies to JPG/WEBP)">How it works?</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    value={targetKb}
                    onChange={(e) => setTargetKb(e.target.value)}
                    placeholder="Max KB size (e.g. 100)"
                    min="10"
                    className="w-full p-2 pr-12 border rounded-lg bg-slate-50 text-gray-700 text-sm font-medium shadow-sm focus:ring-2 focus:ring-amber-500 outline-none hover:border-amber-300 transition"
                  />
                  <span className="absolute right-3 text-xs font-bold text-gray-400 pointer-events-none">KB</span>
                </div>
              </div>
            )}

            <button onClick={handleConvert} disabled={loading || !file} className="w-full bg-amber-600 text-white py-3 rounded-lg font-bold hover:bg-amber-700 disabled:opacity-50 transition shadow-md flex justify-center items-center gap-2">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Image className="w-5 h-5" />}
              {loading ? "Processing (OCR takes longer)..." : (mode === "text" || mode === "text_ocr") ? "Extract Text" : mode === "images" ? "Extract Images" : "Convert PDF"}
            </button>

            {downloadUrl && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                <a href={downloadUrl} download={downloadName} onClick={() => setDownloadUrl(null)} className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold transition shadow-sm w-full justify-center">
                  <FileDown size={18} /> Download Result
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* ❓ How to Use Modal */}
      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-6" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-6 rounded-xl shadow-2xl text-left w-full max-w-lg relative z-60" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1"><X size={20} /></button>
            <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center gap-2"><HelpCircle className="text-yellow-500" /> How to use PDF to JPG</h2>
            <div className="space-y-4 text-gray-600 text-sm">
              <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg flex items-start gap-3"><span className="text-yellow-600 font-bold text-lg">1</span><p><strong>Upload:</strong> Choose PDF file.</p></div>
              <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg flex items-start gap-3"><span className="text-yellow-600 font-bold text-lg">2</span><p><strong>Mode:</strong> Select whether to render full pages or extract embedded images.</p></div>
              <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg flex items-start gap-3"><span className="text-yellow-600 font-bold text-lg">3</span><p><strong>Download:</strong> Get a ZIP containing your images.</p></div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-6 w-full bg-yellow-600 text-white font-semibold py-2 rounded-lg hover:bg-yellow-700 transition">Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
}
