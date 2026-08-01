"use client";
import React, { useRef, useState, useCallback } from "react";
import axios from "axios";
import { Loader2, FileDown, X, Image as ImageIcon, HelpCircle, UploadCloud, Plus, GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

interface ImageFile {
  file: File;
  preview: string;
}

export default function ImageToPDF() {
  const [files, setFiles] = useState<ImageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Converted_Images.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const validImages = newFiles.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return f.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext || '');
      });
      
      if (validImages.length !== newFiles.length) {
        alert("Some files were discarded. Please upload valid images only (JPG, PNG, HEIC, WEBP).");
      }
      
      const maxLimit = 50;
      if (files.length + validImages.length > maxLimit) {
        alert(`Maximum limit of ${maxLimit} images reached. You can only convert up to ${maxLimit} images at a time.`);
        return;
      }
      
      const mapped = validImages.map(f => ({
        file: f,
        preview: URL.createObjectURL(f)
      }));
      setFiles(prev => [...prev, ...mapped]);
      setDownloadUrl(null);
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
      const validImages = newFiles.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return f.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext || '');
      });
      
      if (validImages.length !== newFiles.length) {
        alert("Some files were discarded. Please upload valid images only (JPG, PNG, HEIC, WEBP).");
      }
      
      const maxLimit = 50;
      if (files.length + validImages.length > maxLimit) {
        alert(`Maximum limit of ${maxLimit} images reached. You can only convert up to ${maxLimit} images at a time.`);
        return;
      }
      
      const mapped = validImages.map(f => ({
        file: f,
        preview: URL.createObjectURL(f)
      }));
      setFiles(prev => [...prev, ...mapped]);
      setDownloadUrl(null);
    }
  };

  const removeFile = (index: number) => {
    const item = files[index];
    if (item && item.preview) {
      URL.revokeObjectURL(item.preview);
    }
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

  const isRenderable = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext !== 'heic' && ext !== 'heif';
  };

  const handleConvert = async () => {
    if (files.length === 0) return alert("Select at least one image first");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    files.forEach(item => {
      formData.append("files", item.file);
    });

    try {
      const res = await axios.post(
        api("/converters/image-to-pdf"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Converted_From_${files.length}_Images.pdf`;
      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("Image to PDF", files.length || 1);
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
        } catch {
          /* fall through */
        }
      }
      alert("Failed to convert images. Make sure they are standard JPG/PNG/HEIC formats.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {/* --- Top Premium Header --- */}
      <div className="bg-gradient-to-r from-indigo-900 to-purple-800 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
          <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-300">
            <ImageIcon className="w-8 h-8" />
          </div>
          Image to PDF
        </h1>

        <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
          {/* Help Button */}
          <button
            onClick={() => setShowHelp(true)}
            className="bg-indigo-500/20 text-indigo-200 p-2.5 rounded-lg border border-indigo-500/30 shadow hover:bg-indigo-500/30 transition flex items-center justify-center gap-2"
            title="How to Use"
          >
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>

          <div className="bg-slate-800/50 border border-slate-700 text-slate-300 py-2 px-4 rounded-lg text-sm shadow-inner">
            Convert <strong>JPG & PNG</strong> securely into PDF.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {/* ================= LEFT : UPLOAD PANEL ================= */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition min-h-[300px] ${
            isDragOver 
              ? "bg-indigo-100 border-indigo-500 scale-[1.01]" 
              : "bg-indigo-50/50 border-indigo-300 hover:bg-indigo-100/50 hover:border-indigo-400"
          }`}
        >
          <div className="bg-white p-4 rounded-full shadow mb-4">
            <UploadCloud className="w-12 h-12 text-indigo-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">Upload Images</h3>
          <p className="text-gray-500 mb-6 text-sm">Select JPG or PNG images to merge.</p>
          <button
            onClick={() => inputRef.current?.click()}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow flex items-center gap-2 transition"
          >
            <Plus size={20} /> Select Images
          </button>
          
          <input
            ref={inputRef}
            type="file"
            accept="image/png, image/jpeg, image/jpg, image/heic, image/heif, .heic, .heif"
            className="hidden"
            multiple
            onChange={handleFileChange}
          />
        </div>

        {/* ================= RIGHT : ACTION PANEL & LIST ================= */}
        <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-start">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-4">Selected Images</h2>

          {files.length === 0 ? (
             <div className="flex-grow flex flex-col items-center justify-center text-gray-400 py-10">
               <ImageIcon size={40} className="mb-3 opacity-20" />
               <p className="text-sm">No images selected yet.</p>
             </div>
          ) : (
            <div className="flex-grow overflow-y-auto max-h-[380px] pr-2 mb-6 custom-scrollbar">
              <p className="text-xs text-indigo-500 font-bold mb-3">
                💡 Drag cards to rearrange order, or use arrows (◀ / ▶) to sort on mobile.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {files.map((item, idx) => {
                  const renderable = isRenderable(item.file.name);
                  return (
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
                      className={`relative bg-slate-50 border p-2.5 rounded-2xl flex flex-col justify-between gap-3 text-center transition group shadow-sm select-none hover:border-indigo-400 hover:shadow-md ${
                        draggedIndex === idx ? "opacity-30" : ""
                      }`}
                    >
                      {/* Image Thumbnail Preview container */}
                      <div className="w-full aspect-[4/3] bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center border border-slate-200 relative group cursor-grab">
                        {renderable ? (
                          <img
                            src={item.preview}
                            alt={item.file.name}
                            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-indigo-400">
                            <ImageIcon className="w-8 h-8 opacity-75" />
                            <span className="text-[8px] uppercase font-bold mt-1 text-slate-500">HEIC Image</span>
                          </div>
                        )}
                        <span className="absolute top-2 left-2 bg-indigo-600/90 text-white text-[9px] font-black w-4.5 h-4.5 flex items-center justify-center rounded-full shadow-sm">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Info & action buttons */}
                      <div className="flex flex-col gap-1 overflow-hidden">
                        <span className="font-bold text-[11px] text-slate-700 truncate block px-1" title={item.file.name}>
                          {item.file.name}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
                          {(item.file.size / 1024 / 1024).toFixed(2)} MB
                        </span>

                        <div className="flex items-center justify-between border-t border-slate-200/80 pt-2 mt-1 gap-1">
                          {/* Reordering buttons (desktop & mobile friendly) */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => moveFile(idx, "up")}
                              disabled={idx === 0}
                              className="p-1 bg-white border border-slate-200 text-slate-650 hover:text-indigo-600 rounded-lg hover:border-indigo-400 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              title="Move Left"
                            >
                              <span className="text-[10px] font-bold font-mono">◀</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => moveFile(idx, "down")}
                              disabled={idx === files.length - 1}
                              className="p-1 bg-white border border-slate-200 text-slate-650 hover:text-indigo-600 rounded-lg hover:border-indigo-400 transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                              title="Move Right"
                            >
                              <span className="text-[10px] font-bold font-mono">▶</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFile(idx)}
                            className="p-1 bg-white border border-slate-200 text-red-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Remove"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-auto space-y-4 pt-4 border-t">
            <button
              onClick={handleConvert}
              disabled={loading || files.length === 0}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md"
            >
              {loading ? (
                <span className="flex justify-center flex-row items-center gap-2">
                  <Loader2 className="animate-spin w-5 h-5" /> Processing...
                </span>
              ) : (
                "🖼️ Convert to PDF"
              )}
            </button>

            {downloadUrl && (
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-center animate-fade-in">
                <div className="text-green-600 font-bold mb-2 flex items-center justify-center gap-2">
                  <ImageIcon className="w-5 h-5" /> Conversion Complete!
                </div>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  onClick={() => setDownloadUrl(null)}
                  className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold transition shadow-sm w-full justify-center"
                >
                  <FileDown size={18} /> Download PDF
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
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1"
            >
              <X size={20} />
            </button>
            <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center gap-2">
              <HelpCircle className="text-indigo-500" /> How to Convert Images
            </h2>
            <div className="space-y-4 text-gray-600 text-sm">
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-indigo-600 font-bold text-lg">1</span>
                <p><strong>Upload Images:</strong> Click 'Select Images' to select multiple JPG or PNG images from your device.</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-indigo-600 font-bold text-lg">2</span>
                <p><strong>Review Selection:</strong> Ensure you have selected all the images you want combined into a single document.</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-indigo-600 font-bold text-lg">3</span>
                <p><strong>Convert to PDF:</strong> Click "Convert to PDF". We will magically stitch your images into a clean, full-size A4 format document ready for download!</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full bg-indigo-600 text-white font-semibold py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              Got it, let's go!
            </button>
          </div>
        </div>
      )}

      {/* Internal CSS for scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1; 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8; 
        }
      `}} />
    </div>
  );
}
