"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, HelpCircle, UploadCloud, Plus, File as FileIcon, Table } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function ExcelToPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Converted_Excel.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFile = e.target.files[0];
      const ext = newFile.name.split('.').pop()?.toLowerCase();
      if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
        alert("Only Excel or CSV files (.xls, .xlsx, .csv) are allowed.");
        return;
      }
      setFile(newFile);
      setDownloadUrl(null);
    }
  };

  const handleConvert = async () => {
    if (!file) return alert("Select an Excel or CSV file first");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(
        api("/converters/excel-to-pdf"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Converted_${file.name.replace('.xlsx', '').replace('.xls', '').replace('.csv', '')}.pdf`;
      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("Excel to PDF", 1);
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
      alert("Conversion failed. Please try again or use a valid Excel spreadsheet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-800 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 text-white">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <Table className="w-8 h-8" />
          </div>
          EXCEL / CSV to PDF
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHelp(true)} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-lg border border-white/20 flex items-center gap-2 transition">
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <div className="bg-emerald-50/50 border-2 border-dashed border-emerald-400 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
          <div className="bg-white p-4 rounded-full shadow mb-4">
            <UploadCloud className="w-12 h-12 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Upload EXCEL or CSV</h3>
          <p className="text-gray-500 mb-6 text-sm">Select .xlsx, .xls or .csv file.</p>
          <button onClick={() => inputRef.current?.click()} className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-emerald-700 shadow-md flex items-center gap-2 transition transform hover:scale-105 active:scale-95">
            <Plus size={20} /> Select File
          </button>
          <input ref={inputRef} type="file" accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={handleFileChange} />
        </div>

        <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-start">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-4">Selected File</h2>
          {!file ? (
             <div className="flex flex-col items-center justify-center text-gray-400 py-10">
               <FileIcon size={40} className="mb-3 opacity-20" />
               <p className="text-sm">No spreadsheet selected yet.</p>
             </div>
          ) : (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-lg shadow-sm hover:border-emerald-400 transition group mb-6">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-emerald-100 text-emerald-600 p-2 rounded flex-shrink-0">
                  <Table size={20} />
                </div>
                <div className="flex flex-col truncate">
                  <span className="font-semibold text-sm text-gray-800 truncate">{file.name}</span>
                  <span className="text-[10px] text-gray-500 uppercase">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              </div>
              <button onClick={() => {setFile(null); setDownloadUrl(null);}} className="text-gray-400 hover:text-red-500 p-1.5 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-red-50 transition">
                <X size={16} />
              </button>
            </div>
          )}

          <div className="mt-auto space-y-4 border-t pt-4">
            <button onClick={handleConvert} disabled={loading || !file} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition shadow-lg flex justify-center items-center gap-2 text-lg">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Table className="w-5 h-5" />}
              {loading ? "Converting..." : "Convert to PDF"}
            </button>

            {downloadUrl && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center animate-in fade-in slide-in-from-bottom-4">
                <a href={downloadUrl} download={downloadName} onClick={() => setDownloadUrl(null)} className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-bold transition shadow-md w-full justify-center">
                  <FileDown size={20} /> Download PDF
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-6 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-left w-full max-w-lg relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 p-2 rounded-full"><X size={20} /></button>
            <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-3">
              <HelpCircle className="text-emerald-600" /> 
              How to use Excel/CSV to PDF
            </h2>
            <div className="space-y-5 text-gray-600">
              <div className="flex items-start gap-4">
                <div className="bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
                <p className="pt-1">Click on <strong>"Select File"</strong> to upload your Excel spreadsheet (.xlsx, .xls) or CSV table (.csv).</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
                <p className="pt-1">Verify the file name and click <strong>"Convert to PDF"</strong>.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">3</div>
                <p className="pt-1">Once processing is complete, your <strong>PDF</strong> will be ready for download instantly.</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-8 w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 transition shadow-lg">Start Converting Now</button>
          </div>
        </div>
      )}
    </div>
  );
}
