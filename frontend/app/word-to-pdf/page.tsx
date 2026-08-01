"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, FileMinus, HelpCircle, UploadCloud, Plus, File as FileIcon } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function WordToPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Converted.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState<number | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchThumbnail = async (file: File) => {
    const key = `${file.name}_${file.size}`;
    if (previews[key]) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(
        api("/converters/document-thumbnail"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "image/png" }));
      setPreviews(prev => ({ ...prev, [key]: url }));
    } catch (err) {
      console.error("Failed to generate document preview", err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const validDocs = newFiles.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ext === 'docx' || ext === 'doc';
      });
      
      if (validDocs.length !== newFiles.length) {
        alert("Some files were discarded. Only Word documents (.doc, .docx) are allowed.");
      }
      
      const maxLimitVal = 50;
      if (files.length + validDocs.length > maxLimitVal) {
        alert(`Maximum limit of ${maxLimitVal} documents reached. You can only convert up to ${maxLimitVal} documents at a time.`);
        return;
      }
      
      setFiles(prev => [...prev, ...validDocs]);
      setDownloadUrl(null);
      validDocs.forEach(fetchThumbnail);
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
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      const validDocs = newFiles.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ext === 'docx' || ext === 'doc';
      });
      
      if (validDocs.length !== newFiles.length) {
        alert("Some files were discarded. Only Word documents (.doc, .docx) are allowed.");
      }
      
      const maxLimitVal = 50;
      if (files.length + validDocs.length > maxLimitVal) {
        alert(`Maximum limit of ${maxLimitVal} documents reached. You can only convert up to ${maxLimitVal} documents at a time.`);
        return;
      }
      
      setFiles(prev => [...prev, ...validDocs]);
      setDownloadUrl(null);
      validDocs.forEach(fetchThumbnail);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setDownloadUrl(null);
  };

  const moveFile = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === files.length - 1) return;

    const nextIndex = direction === "up" ? index - 1 : index + 1;
    const reordered = [...files];
    const temp = reordered[index];
    reordered[index] = reordered[nextIndex];
    reordered[nextIndex] = temp;
    setFiles(reordered);
    setDownloadUrl(null);
  };

  const handleConvert = async () => {
    if (files.length === 0) return alert("Select at least one Word file first");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });

    try {
      const res = await axios.post(
        api("/converters/word-to-pdf"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = files.length === 1 
        ? `Converted_${files[0].name.replace('.docx', '').replace('.doc', '')}.pdf`
        : "Converted_Word_Documents.pdf";
        
      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("Word to PDF", files.length || 1);
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const j = JSON.parse(text) as { code?: string; detail?: any };
          if (j?.code === "LOGIN_REQUIRED") {
             alert(`${j.detail || "Log in required"}\n\nPlease log in and try again.`);
             return;
          }
          if (j?.detail) {
             const msg = typeof j.detail === "object"
               ? (Array.isArray(j.detail)
                   ? j.detail.map((err: any) => err.msg || JSON.stringify(err)).join("\n")
                   : JSON.stringify(j.detail))
               : j.detail;
             alert(msg);
             return;
          }
        } catch {}
      }
      alert("Conversion failed. Please try again or check if you uploaded valid Word documents.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 text-white">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <FileMinus className="w-8 h-8" />
          </div>
          WORD to PDF
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHelp(true)} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-lg border border-white/20 flex items-center gap-2 transition">
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition min-h-[300px] ${
            isDragOver 
              ? "bg-blue-100 border-blue-500 scale-[1.01]" 
              : "bg-blue-50/50 border-blue-400 hover:bg-blue-100/50 hover:border-blue-500"
          }`}
        >
          <div className="bg-white p-4 rounded-full shadow mb-4">
            <UploadCloud className="w-12 h-12 text-blue-700" />
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Upload WORD</h3>
          <p className="text-gray-500 mb-6 text-sm">Select .docx or .doc file.</p>
          <button onClick={() => inputRef.current?.click()} className="bg-blue-700 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-800 shadow-md flex items-center gap-2 transition transform hover:scale-105 active:scale-95">
            <Plus size={20} /> Select File
          </button>
          <input ref={inputRef} type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" multiple onChange={handleFileChange} />
        </div>

        <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-start animate-fade-in" onClick={() => setActiveCardIndex(null)}>
          <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-4">Selected Documents</h2>
          {files.length === 0 ? (
             <div className="flex flex-col items-center justify-center text-gray-400 py-10">
               <FileIcon size={40} className="mb-3 opacity-20 animate-pulse" />
               <p className="text-sm">No files selected yet.</p>
             </div>
          ) : (
            <div className="flex-grow overflow-y-auto max-h-[380px] pr-2 mb-6 custom-scrollbar" onClick={() => setActiveCardIndex(null)}>
              <p className="text-xs text-blue-500 font-bold mb-3">
                💡 Drag cards to rearrange order, or use arrows (◀ / ▶) to sort on mobile.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={() => setDraggedIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={() => setDraggedIndex(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedIndex === null || draggedIndex === idx) return;
                      const reordered = [...files];
                      const [moved] = reordered.splice(draggedIndex, 1);
                      reordered.splice(idx, 0, moved);
                      setFiles(reordered);
                      setDraggedIndex(null);
                      setDownloadUrl(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveCardIndex(idx);
                    }}
                    className={`relative bg-slate-50 border p-2.5 rounded-2xl flex flex-col justify-between gap-3 text-center transition-all duration-300 group shadow-sm select-none hover:border-blue-400 hover:shadow-md cursor-pointer ${
                      draggedIndex === idx ? "opacity-30" : ""
                    } ${
                      activeCardIndex === idx
                        ? "ring-2 ring-blue-500 bg-blue-50/10 scale-102 z-10 shadow-lg col-span-2 sm:col-span-2 lg:col-span-1"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="w-full aspect-[4/3] bg-gradient-to-tr from-blue-50 to-indigo-50/60 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200 relative group cursor-grab">
                      {previews[`${file.name}_${file.size}`] ? (
                        <img 
                          src={previews[`${file.name}_${file.size}`]} 
                          alt="First page preview" 
                          className="w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-blue-600 transition-transform duration-200 group-hover:scale-105">
                          <FileIcon className="w-10 h-10 opacity-85" />
                          <span className="text-[8px] uppercase font-black tracking-widest mt-1.5 text-blue-700/80 bg-blue-100/50 px-1.5 py-0.5 rounded">
                            Word Doc
                          </span>
                        </div>
                      )}
                      
                      <span className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-sm z-10">
                        {idx + 1}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        className="absolute top-2 right-2 bg-rose-600 hover:bg-rose-700 text-white p-1 rounded-full shadow-md transition hover:scale-110 active:scale-90 z-20 cursor-pointer"
                        title="Remove Document"
                      >
                        <X size={10} className="w-2.5 h-2.5" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1 overflow-hidden">
                      <span className="font-bold text-[11px] text-slate-700 truncate block px-1" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>

                      <div className="flex items-center justify-center border-t border-slate-200/85 pt-2 mt-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveFile(idx, "up");
                            }}
                            disabled={idx === 0}
                            className="p-1 px-3 bg-white border border-slate-200 text-slate-650 hover:text-blue-600 rounded-lg hover:border-blue-400 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
                            title="Move Left"
                          >
                            <span className="text-[10px] font-bold leading-none">◀</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveFile(idx, "down");
                            }}
                            disabled={idx === files.length - 1}
                            className="p-1 px-3 bg-white border border-slate-200 text-slate-650 hover:text-blue-600 rounded-lg hover:border-indigo-400 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center justify-center"
                            title="Move Right"
                          >
                            <span className="text-[10px] font-bold leading-none">▶</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto space-y-4 border-t pt-4">
            <button onClick={handleConvert} disabled={loading || files.length === 0} className="w-full bg-blue-700 text-white py-4 rounded-xl font-bold hover:bg-blue-800 disabled:opacity-50 transition shadow-lg flex justify-center items-center gap-2 text-lg">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <FileMinus className="w-5 h-5" />}
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
              <HelpCircle className="text-blue-600" /> 
              How to use Word to PDF
            </h2>
            <div className="space-y-5 text-gray-600">
              <div className="flex items-start gap-4">
                <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
                <p className="pt-1">Click on <strong>"Select File"</strong> to upload your Word document (.docx or .doc).</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
                <p className="pt-1">Verify the file name and click <strong>"Convert to PDF"</strong>.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">3</div>
                <p className="pt-1">Once processing is complete, your <strong>PDF</strong> will be ready for download instantly.</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-8 w-full bg-blue-700 text-white font-bold py-3 rounded-xl hover:bg-blue-800 transition shadow-lg">Start Converting Now</button>
          </div>
        </div>
      )}
    </div>
  );
}
