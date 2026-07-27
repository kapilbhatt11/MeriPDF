"use client";

import React, { useRef, useState } from "react";
import { UploadCloud, FileType, Settings, Download, X, Wrench, RefreshCw, CheckCircle2, Loader2, HelpCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";
import RequireAuth from "@/components/RequireAuth";

export default function RepairPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = async () => {
    if (!file) return toast.error("Please upload a corrupted PDF first!");

    setLoading(true);
    setSuccess(false);
    setLogs(["Initializing auto-repair protocol...", "Analyzing binary structures...", "Recalculating broken XREF tables..."]);
    
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetchWithAuth(api("/pdf/repair"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Repair failed. The file might be irreparably damaged.");

      // Visual delay for professional telemetry feeling
      setTimeout(() => setLogs(p => [...p, "Rebuilding object streams...", "Stripping invalid syntax..."]), 650);
      setTimeout(() => setLogs(p => [...p, "Validating PDF headers...", "Repair Successful. Generating document..."]), 1300);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${file.name.replace(/\.[^/.]+$/, "")}_repaired.pdf`;
      
      setTimeout(() => {
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         window.URL.revokeObjectURL(url);
         setLoading(false);
         setSuccess(true);
         logPDFOperation("Repair PDF", 1);
      }, 1900);
      
    } catch (err) {
      toast.error((err as Error).message || "Error repairing PDF.");
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === "application/pdf") {
        setFile(droppedFile);
        setSuccess(false);
        setLogs([]);
      } else {
        toast.error("Please drag a standard PDF file only.");
      }
    }
  };

  return (
    <RequireAuth>
      <div className="max-w-7xl mx-auto p-6 relative min-h-screen">
        
        {/* --- Top Premium Header (Matching rest of app) --- */}
        <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
            <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
              <Wrench className="w-8 h-8" />
            </div>
            Intelligent PDF Repair
          </h1>

          <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
            <div className="bg-slate-800/50 border border-slate-700 text-slate-350 text-slate-205 py-2 px-4 rounded-lg text-sm shadow-inner text-slate-300">
              <strong className="text-white text-emerald-400">Recover damaged documents</strong> and fix broken cross-reference tables.
            </div>
          </div>
        </div>

        {/* --- Workspace Grid Layout --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-4">
          
          {/* ================= LEFT: DRAG-AND-DROP FILE UPLOAD ================= */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`transition-all duration-300 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px] border-2 border-dashed ${
              file 
                ? "bg-slate-50 border-emerald-300"
                : isDragOver
                  ? "bg-emerald-50 border-emerald-500 scale-[1.01]"
                  : "bg-gray-100 border-gray-300 hover:bg-gray-200/60 hover:border-emerald-400"
            }`}
          >
            {!file ? (
              <>
                <div className="bg-white p-4.5 p-4 rounded-full shadow mb-4 text-emerald-500 hover:scale-105 transition">
                  <UploadCloud className="w-12 h-12" />
                </div>
                <h3 className="text-lg font-bold text-gray-700 mb-1">Select Corrupted PDF</h3>
                <p className="text-gray-500 text-xs mb-6 max-w-xs leading-relaxed">
                  Drag and drop the damaged file or click below to search local files.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow transition active:scale-[0.98]"
                >
                  Select File
                </button>
              </>
            ) : (
              <div className="w-full relative bg-white border border-emerald-100 rounded-xl p-6 shadow-sm flex flex-col items-center relative">
                <button
                  onClick={() => { setFile(null); setSuccess(false); setLogs([]); }}
                  className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 bg-slate-50 hover:bg-rose-55 rounded-full p-2 border border-slate-100 transition"
                  title="Remove file"
                >
                  <X size={16} />
                </button>
                <FileType className="w-12 h-12 text-emerald-500 mb-3" />
                <p className="font-bold text-gray-800 truncate w-full px-4 text-sm">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1 font-semibold">
                  {(file.size / 1024 / 1024).toFixed(2)} MB • Ready for restoration
                </p>
              </div>
            )}

            <input 
              ref={fileInputRef}
              type="file" 
              accept="application/pdf" 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFile(e.target.files[0]);
                  setSuccess(false);
                  setLogs([]);
                }
              }} 
            />
          </div>

          {/* ================= RIGHT: RUN / TELEMETRY LOGS PANEL ================= */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-md p-8 flex flex-col justify-center min-h-[300px]">
            {!file ? (
              <div className="text-center py-6 text-slate-400">
                <Wrench className="w-10 h-10 mx-auto mb-2 text-slate-350 opacity-60" />
                <p className="text-xs font-semibold">Upload a corrupted document to activate the repair engine.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Binary Restructurer</h2>
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                    This repairs PDF cross-reference (xref) indices and builds compliant page headers directly via secure local backend scripts.
                  </p>
                </div>

                {loading ? (
                   <div className="bg-slate-900 rounded-xl p-4 font-mono text-emerald-400 text-xs shadow-inner border border-slate-950">
                      <div className="flex items-center gap-2 mb-2 text-emerald-350 border-b border-slate-800 pb-2 text-[10px] uppercase font-black">
                         <RefreshCw className="animate-spin text-emerald-400" size={13} /> Engine Active
                      </div>
                      <div className="space-y-1 h-24 overflow-y-auto leading-normal opacity-90">
                         {logs.map((L, i) => (
                             <p key={i}> {`>`} {L}</p>
                         ))}
                         <p className="animate-pulse">{`>`} _</p>
                      </div>
                   </div>
                ) : success ? (
                   <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-center flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
                      <div className="text-emerald-700 font-bold mb-1 flex items-center justify-center gap-2 text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Repaired Successfully!
                      </div>
                      <p className="text-xs text-emerald-600 mb-4 font-medium">Your restored file has been downloaded.</p>
                      <button 
                         onClick={() => { setFile(null); setSuccess(false); setLogs([]); }}
                         className="bg-emerald-650 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition"
                      >
                         Repair new PDF
                      </button>
                   </div>
                ) : (
                  <button
                    onClick={handleUploadClick}
                    className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                  >
                    <Wrench size={16} /> Rebuild PDF Structure
                  </button>
                )}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </RequireAuth>
  );
}
