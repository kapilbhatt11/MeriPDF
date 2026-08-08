"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, LayoutTemplate, HelpCircle, UploadCloud, Plus, File as FileIcon } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function PdfToPowerpoint() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
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
      <div className="bg-gradient-to-r from-orange-900 to-orange-700 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
          <div className="bg-orange-500/20 p-2 rounded-lg text-orange-300">
            <LayoutTemplate className="w-8 h-8" />
          </div>
          PDF to POWERPOINT
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHelp(true)} className="bg-orange-500/20 text-orange-200 p-2.5 rounded-lg border border-orange-500/30 flex items-center gap-2">
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <div className="bg-orange-50/50 border-2 border-dashed border-orange-300 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="bg-white p-4 rounded-full shadow mb-4">
            <UploadCloud className="w-12 h-12 text-orange-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Upload PDF</h3>
          <p className="text-gray-500 mb-6 text-sm">Select a PDF document.</p>
          <button onClick={() => inputRef.current?.click()} className="bg-orange-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-orange-700 shadow flex items-center gap-2 transition">
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
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-lg shadow-sm hover:border-orange-300 transition group mb-6">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-orange-100 text-orange-600 p-2 rounded flex-shrink-0">
                  <FileIcon size={16} />
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-semibold text-sm text-gray-700 truncate">{file.name}</span>
                </div>
              </div>
              <button onClick={() => {setFile(null); setDownloadUrl(null); setPageRange("");}} className="text-gray-400 hover:text-red-500 p-1 bg-white border border-gray-200 rounded-full shadow-sm">
                <X size={16} />
              </button>
            </div>
          )}

          {file && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Page Range (Optional)
              </label>
              <input
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder="e.g. 1-5, 8, 11-15 (Max 8 OCR/scan pages)"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Specifying ranges allows converting large government PDFs fast without Render proxy timeouts.
              </p>
            </div>
          )}

          <div className="mt-auto space-y-4 border-t pt-4">
            <button onClick={handleConvert} disabled={loading || !file} className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 disabled:opacity-50 transition shadow-md flex justify-center items-center gap-2">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <LayoutTemplate className="w-5 h-5" />}
              {loading ? "Processing..." : "Convert to PPT"}
            </button>

            {downloadUrl && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-center">
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
            <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center gap-2"><HelpCircle className="text-orange-500" /> How to use PDF to PPT</h2>
            <div className="space-y-4 text-gray-600 text-sm">
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-start gap-3"><span className="text-orange-600 font-bold text-lg">1</span><p><strong>Upload:</strong> Select your PDF to convert.</p></div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-start gap-3"><span className="text-orange-600 font-bold text-lg">2</span><p><strong>Generate:</strong> We will construct an editable PPTX layout.</p></div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-start gap-3"><span className="text-orange-600 font-bold text-lg">3</span><p><strong>Download:</strong> Download your presentation.</p></div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-6 w-full bg-orange-600 text-white font-semibold py-2 rounded-lg hover:bg-orange-700 transition">Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
}
