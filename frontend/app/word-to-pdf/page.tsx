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
  const inputRef = useRef<HTMLInputElement>(null);

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
      
      setFiles(prev => [...prev, ...validDocs]);
      setDownloadUrl(null);
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
        <div className="bg-blue-50/50 border-2 border-dashed border-blue-400 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
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

        <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-start">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-4">Selected Documents</h2>
          {files.length === 0 ? (
             <div className="flex flex-col items-center justify-center text-gray-400 py-10">
               <FileIcon size={40} className="mb-3 opacity-20" />
               <p className="text-sm">No files selected yet.</p>
             </div>
          ) : (
            <div className="flex-grow overflow-y-auto max-h-[300px] pr-2 space-y-3 mb-6 custom-scrollbar">
              <p className="text-xs text-blue-500 font-bold mb-2">
                💡 Drag documents to rearrange sequence, or use arrows (▲ / ▼) to sort.
              </p>
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
                  className={`flex items-center justify-between bg-slate-50 border border-slate-200 p-3.5 rounded-xl shadow-sm hover:border-blue-400 transition group select-none ${
                    draggedIndex === idx ? "opacity-30" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden cursor-grab">
                    <span className="bg-blue-600 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shadow-sm flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="bg-blue-100 text-blue-700 p-2 rounded flex-shrink-0">
                      <FileIcon size={20} />
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="font-semibold text-sm text-gray-800 truncate" title={file.name}>{file.name}</span>
                      <span className="text-[10px] text-gray-505 text-gray-500 uppercase font-semibold">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveFile(idx, "up")}
                        disabled={idx === 0}
                        className="p-1 bg-white border border-slate-200 text-slate-600 hover:text-blue-705 hover:text-blue-700 rounded-lg hover:border-blue-400 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        title="Move Up"
                      >
                        <span className="text-[10px] font-black font-mono">▲</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFile(idx, "down")}
                        disabled={idx === files.length - 1}
                        className="p-1 bg-white border border-slate-200 text-slate-600 hover:text-blue-705 hover:text-blue-700 rounded-lg hover:border-blue-400 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        title="Move Down"
                      >
                        <span className="text-[10px] font-black font-mono">▼</span>
                      </button>
                    </div>

                    <button
                      onClick={() => removeFile(idx)}
                      className="text-gray-400 hover:text-red-500 p-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-rose-50 transition cursor-pointer"
                      title="Remove"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
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
