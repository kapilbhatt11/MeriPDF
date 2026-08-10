"use client";
import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import { 
  Loader2, FileDown, X, Stamp, HelpCircle, UploadCloud, 
  Plus, Settings2, Image as ImageIcon, Type, Palette, 
  RotateCw, Layers, Grid3X3, Eye, Sliders, Info
} from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";
import { motion, AnimatePresence } from "framer-motion";

export default function WatermarkPDF() {
  // Core State
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Watermarked.pdf");
  const [showHelp, setShowHelp] = useState(false);
  
  // Watermark Settings
  const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [fontName, setFontName] = useState("helv");
  const [fontSize, setFontSize] = useState(60);
  const [textColor, setTextColor] = useState("#f59e0b");
  const [transparency, setTransparency] = useState(0.7);
  const [rotation, setRotation] = useState(45);
  const [mosaic, setMosaic] = useState(true);
  const [pageRange, setPageRange] = useState("all");
  const [layer, setLayer] = useState<"over" | "below">("over");
  const [imageSize, setImageSize] = useState(50);
  const [imageGap, setImageGap] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const [pdfjsLib, setPdfjsLib] = useState<any>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Load PDF.js dynamically
  useEffect(() => {
    const loadPdfJs = async () => {
      if (typeof window === "undefined") return;
      try {
        // @ts-ignore
        const module = await import("pdfjs-dist/build/pdf");
        // @ts-ignore
        const worker = await import("pdfjs-dist/build/pdf.worker.min.js");
        (window as any).pdfjsWorker = worker;
        module.GlobalWorkerOptions.workerSrc =
          "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        setPdfjsLib(module);
        setPdfReady(true);
      } catch (error) {
        console.error("Failed to load PDF.js:", error);
      }
    };
    loadPdfJs();
  }, []);

  // Generate preview image based on pageRange
  useEffect(() => {
    if (!file || !pdfReady || !pdfjsLib) {
      setPreviewImage(null);
      return;
    }
    const loadPDF = async () => {
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const typedarray = new Uint8Array(reader.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            
            let pageNumToExtract = 1;
            if (pageRange !== "all") {
               const parts = pageRange.split('-');
               const parsedStart = parseInt(parts[0]);
               if (!isNaN(parsedStart) && parsedStart >= 1 && parsedStart <= pdf.numPages) {
                  pageNumToExtract = parsedStart;
               }
            }

            const page = await pdf.getPage(pageNumToExtract);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas context not supported.");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport }).promise;
            setPreviewImage(canvas.toDataURL());
          } catch (err) {
            console.error("Error processing PDF:", err);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        console.error("Error loading PDF:", err);
      }
    };
    loadPDF();
  }, [file, pdfReady, pdfjsLib, pageRange]);

  const updatePosition = (e: React.PointerEvent) => {
    if (previewContainerRef.current) {
      const rect = previewContainerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setPosition({ x, y });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (mosaic) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!mosaic && e.buttons === 1) {
      updatePosition(e);
    }
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setDownloadUrl(null);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const img = e.target.files[0];
      setWatermarkImage(img);
      setImagePreview(URL.createObjectURL(img));
    }
  };

  const handleWatermark = async () => {
    if (!file) return;
    if (watermarkType === "text" && !watermarkText) return alert("Please enter watermark text");
    if (watermarkType === "image" && !watermarkImage) return alert("Please upload a watermark image");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("watermark_type", watermarkType);
    formData.append("text_color", textColor);
    formData.append("font_name", fontName);
    formData.append("font_size", fontSize.toString());
    formData.append("transparency", transparency.toString());
    formData.append("rotation", rotation.toString());
    formData.append("mosaic", mosaic.toString());
    formData.append("page_range", pageRange);
    formData.append("layer", layer);
    formData.append("image_size", imageSize.toString());
    formData.append("image_gap", imageGap.toString());
    formData.append("pos_x", position.x.toString());
    formData.append("pos_y", position.y.toString());

    if (watermarkType === "text") {
      formData.append("watermark_text", watermarkText);
    } else if (watermarkImage) {
      formData.append("image_file", watermarkImage);
    }

    try {
      const res = await axios.post(
        api("/watermark/add"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      if (res.status !== 200) {
        throw new Error(`Server returned ${res.status}`);
      }

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `MeriPDF_Watermarked.pdf`;
      if (contentDisposition) {
        const match = /filename="?([^\";]+)"?/.exec(contentDisposition);
        if (match && match[1]) filename = match[1];
      }

      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("Watermark PDF", 1);
    } catch (e: any) {
      console.error("Watermark error:", e);
      let errorMsg = "Failed to apply watermark. Make sure the file is a valid PDF and parameters are correct.";
      
      if (axios.isAxiosError(e)) {
        if (e.code === "ERR_NETWORK") {
          errorMsg = "Network error: The server could not be reached. Ensure the backend is running and CORS is allowed.";
        } else if (e.response && e.response.data instanceof Blob) {
          const text = await e.response.data.text();
          try {
            const errJson = JSON.parse(text);
            errorMsg = errJson.detail || errorMsg;
          } catch {
            errorMsg = text || errorMsg;
          }
        } else if (e.response?.data?.detail) {
          errorMsg = e.response.data.detail;
        }
      }
      
      alert(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans pb-8">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto px-6 pt-2 pb-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="bg-amber-500 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Stamp className="text-white w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 leading-tight">Advanced Watermark</h1>
              <p className="text-slate-500 font-medium text-sm">Protect and brand your documents with ease</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-semibold transition-all border border-slate-200"
            >
              <HelpCircle size={18} /> How it works
            </button>
            <div className="h-10 w-[1px] bg-slate-200 hidden md:block mx-2" />
            <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl text-sm font-bold border border-amber-100">
              Premium Tool
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-6 mt-2 items-start">
        
        {/* Left Column: Settings (2 units) */}
        <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-800">
              <Settings2 size={18} className="text-amber-500" />
              Watermark Options
            </h2>

            {/* Type Toggle */}
            <div className="bg-slate-50 p-1.5 rounded-2xl flex mb-6 border border-slate-100">
              {(["text", "image"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setWatermarkType(t)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-bold text-sm ${
                    watermarkType === t 
                      ? "bg-white text-amber-600 shadow-sm border border-slate-100" 
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t === "text" ? <Type size={16} /> : <ImageIcon size={16} />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Content Input (Reduced Spacing) */}
            <div className="space-y-4 mb-8">
              {watermarkType === "text" ? (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Watermark Text
                  </label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="Enter text..."
                    className="w-full bg-slate-50 border border-slate-400 focus:border-amber-500/20 focus:bg-white p-4 rounded-2xl outline-none transition-all font-bold text-sm text-slate-900 placeholder-slate-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Watermark Image
                  </label>
                  <div 
                    onClick={() => imageInputRef.current?.click()}
                    className="group relative cursor-pointer overflow-hidden bg-slate-50 border-2 border-dashed border-slate-200 hover:border-amber-500/40 rounded-2xl p-6 transition-all text-center"
                  >
                    {imagePreview ? (
                      <div className="relative group">
                        <img src={imagePreview} className="max-h-24 mx-auto rounded-lg shadow-sm" alt="Preview" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-lg transition-opacity">
                          <Plus className="text-white" />
                        </div>
                      </div>
                    ) : (
                      <div className="py-2">
                        <div className="bg-amber-100 w-8 h-8 rounded-full flex items-center justify-center mx-auto mb-2 text-amber-600 group-hover:scale-110 transition-transform">
                          <Plus size={16} />
                        </div>
                        <p className="text-xs font-bold text-slate-600">Upload Logo</p>
                      </div>
                    )}
                    <input 
                      type="file" 
                      ref={imageInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleImageChange} 
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Visual Sliders (More Compact) */}
            <div className="space-y-6">
              {watermarkType === "text" && (
                <div className="grid grid-cols-2 gap-4">
                   <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                      Color
                    </label>
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border-none bg-transparent"
                      />
                      <span className="text-[10px] font-black text-slate-600 tabular-nums uppercase">{textColor}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">
                      Size
                    </label>
                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                      <input
                        type="number"
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-full bg-transparent border-none outline-none font-bold text-slate-600 px-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {watermarkType === "image" && (
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <ImageIcon size={12} className="text-amber-500" /> Image Size
                    </label>
                    <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                      {imageSize} pt
                    </span>
                  </div>
                  <input
                    type="range" min="50" max="500" step="10"
                    value={imageSize}
                    onChange={(e) => setImageSize(parseInt(e.target.value))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              {mosaic && (
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       <Grid3X3 size={12} className="text-amber-500" /> Mosaic Gap
                    </label>
                    <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                      {Math.round(imageGap * 100)}%
                    </span>
                  </div>
                  <input
                    type="range" min="0" max="3" step="0.1"
                    value={imageGap}
                    onChange={(e) => setImageGap(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Eye size={12} className="text-amber-500" /> Transparency
                  </label>
                  <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                    {Math.round(transparency * 100)}%
                  </span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.1"
                  value={transparency}
                  onChange={(e) => setTransparency(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <RotateCw size={12} className="text-blue-500" /> Rotation
                  </label>
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                    {rotation}°
                  </span>
                </div>
                <input
                  type="range" min="-180" max="180" step="5"
                  value={rotation}
                  onChange={(e) => setRotation(parseInt(e.target.value))}
                  className="w-full accent-blue-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Layout Toggles */}
            <div className="grid grid-cols-1 gap-3 mt-8">
              <button 
                onClick={() => setMosaic(!mosaic)}
                className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all ${
                  mosaic 
                    ? "border-amber-500 bg-amber-50/30 text-amber-700" 
                    : "border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${mosaic ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                    <Grid3X3 size={16} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-xs">Mosaic Mode</p>
                  </div>
                </div>
                <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${mosaic ? "bg-amber-500" : "bg-slate-300"}`}>
                   <div className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${mosaic ? "translate-x-3.5" : "translate-x-0"}`} />
                </div>
              </button>

              <button 
                onClick={() => setLayer(layer === "over" ? "below" : "over")}
                className={`flex items-center justify-between p-3.5 rounded-2xl border-2 transition-all ${
                  layer === "over" 
                    ? "border-blue-500 bg-blue-50/30 text-blue-700" 
                    : "border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${layer === "over" ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                    <Layers size={16} />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-xs">Overlap Mode</p>
                  </div>
                </div>
                <div className="text-[8px] font-black uppercase tracking-widest opacity-60 bg-white/50 px-2 py-1 rounded-md">{layer}</div>
              </button>
            </div>

            {/* Page Range */}
            <div className="mt-8">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                Apply to Pages
              </label>
              <div className="flex bg-slate-50 rounded-2xl p-1 border border-slate-100">
                {(["all", "custom"] as const).map((r) => (
                   <button
                    key={r}
                    onClick={() => setPageRange(r === "all" ? "all" : "1-10")}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${
                      (pageRange === "all" && r === "all") || (pageRange !== "all" && r === "custom")
                        ? "bg-white text-slate-800 shadow-sm border border-slate-100"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                   >
                     {r.toUpperCase()}
                   </button>
                ))}
              </div>
              {pageRange !== "all" && (
                <div className="mt-4">
                  <input 
                    type="text" 
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    className="w-full bg-white border border-slate-400 p-3 rounded-xl outline-none focus:border-amber-500 font-bold text-xs text-center text-slate-900 placeholder-slate-500"
                    placeholder="e.g. 1-16"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Upload/Preview (3 units) */}
        <div className="lg:col-span-3 flex flex-col gap-6 h-full">
          
          {/* Main Workspace */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-[500px]">
            
            {/* Background Decorative Element */}
            <div className="absolute -top-16 -right-16 w-64 h-64 bg-amber-500/5 blur-[80px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-blue-500/5 blur-[80px] rounded-full pointer-events-none" />

            {!file ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group cursor-pointer w-full max-w-2xl text-center space-y-8"
              >
                <div className="relative mx-auto w-40 h-40 flex items-center justify-center">
                  <div className="absolute inset-0 bg-amber-500/10 rounded-[60px] rotate-12 group-hover:rotate-6 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-amber-500/20 rounded-[60px] -rotate-12 group-hover:-rotate-6 transition-transform duration-500" />
                  <div className="relative bg-white w-32 h-32 rounded-[48px] shadow-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                    <UploadCloud className="w-14 h-14 text-amber-500" />
                  </div>
                </div>
                
                <div>
                  <h3 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Drop your PDF here</h3>
                  <p className="text-slate-500 font-medium text-lg leading-relaxed max-w-md mx-auto">
                    Select the document you want to brand. We support all PDF versions.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <button className="bg-slate-900 text-white px-10 py-5 rounded-[24px] font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-slate-900/20 flex items-center gap-3">
                    <Plus size={24} /> Select File
                  </button>
                  <div className="flex items-center gap-6 text-slate-300 font-black tracking-widest text-[10px] uppercase mt-4">
                    <span>Secure</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    <span>Private</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    <span>Fast</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col">
                <div className="flex justify-between items-center mb-10">
                  <div className="flex items-center gap-4 bg-slate-50 pr-6 pl-2 py-2 rounded-2xl border border-slate-100 max-w-[70%]">
                    <div className="bg-white p-3 rounded-xl shadow-sm text-amber-500">
                      <Stamp size={24} />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-black text-slate-800 truncate">{file.name}</p>
                      <p className="text-[10px] font-bold text-slate-400">{(file.size/1024/1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setFile(null)}
                    className="w-12 h-12 rounded-2xl bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center border border-slate-200"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Live Preview Pane */}
                <div className="flex-1 bg-slate-100/50 rounded-[32px] border-2 border-slate-200 border-dashed relative flex items-center justify-center p-8 overflow-hidden group">
                  <div className="absolute top-4 left-6 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Simulation</span>
                  </div>
                  
                  {/* Mock PDF Page */}
                  <div 
                     ref={previewContainerRef}
                     className="w-[85%] aspect-[1/1.41] bg-white shadow-2xl rounded-sm border border-slate-200 relative overflow-hidden select-none"
                     style={{ cursor: mosaic ? 'default' : 'crosshair' }}
                     onPointerDown={handlePointerDown}
                     onPointerMove={handlePointerMove}
                   >
                    {previewImage ? (
                      <img src={previewImage} className="w-full h-full object-contain pointer-events-none" />
                    ) : (
                      <div className="p-10 space-y-4 opacity-10 pointer-events-none">
                        <div className="h-4 bg-slate-200 w-3/4 rounded-full" />
                        <div className="h-4 bg-slate-200 w-full rounded-full" />
                        <div className="h-4 bg-slate-200 w-5/6 rounded-full" />
                        <div className="pt-8 h-4 bg-slate-200 w-1/2 rounded-full" />
                        <div className="h-4 bg-slate-200 w-full rounded-full" />
                      </div>
                    )}

                    {/* Watermark Preview Overlay */}
                    <AnimatePresence>
                      <motion.div 
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        suppressHydrationWarning
                      >
                        {mosaic ? (
                          <div 
                            className="w-full h-full grid grid-cols-3 grid-rows-4 p-8"
                            style={{ 
                              opacity: transparency,
                              transform: `rotate(${rotation}deg)`,
                              color: textColor,
                              gap: `${imageGap * 50}px`
                            }}
                          >
                            {Array.from({ length: 12 }).map((_, i) => (
                              <div key={i} className="flex items-center justify-center text-center leading-none">
                                {watermarkType === "text" ? (
                                  <span style={{ fontSize: fontSize/4, fontWeight: 900 }}>{watermarkText}</span>
                                ) : (
                                  imagePreview ? <img src={imagePreview} style={{ width: imageSize / 5 }} className="opacity-70" /> : <Stamp size={24} />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <motion.div
                            className="absolute"
                            style={{ 
                              opacity: transparency,
                              transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                              color: textColor,
                              fontSize: fontSize * 0.65,
                              fontWeight: 900,
                              left: `${position.x * 100}%`,
                              top: `${position.y * 100}%`,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {watermarkType === "text" ? (
                              watermarkText
                            ) : (
                              imagePreview ? <img src={imagePreview} style={{ width: imageSize / 1.5 }} /> : <Stamp size={imageSize / 2} />
                            )}
                          </motion.div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                    
                    {/* Layer indicator */}
                    {layer === "below" && (
                      <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] flex items-center justify-center">
                        <span className="bg-slate-900/10 px-4 py-2 rounded-full text-[10px] font-black uppercase text-slate-900 mix-blend-overlay">Behind Content</span>
                      </div>
                    )}
                  </div>

                  {/* UI hints */}
                  <div className="absolute bottom-6 flex gap-4">
                     <div className="bg-white/80 backdrop-blur shadow-sm px-4 py-2 rounded-2xl flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <Sliders size={12} className="text-amber-500" /> Real-time Adjust
                     </div>
                     <div className="bg-white/80 backdrop-blur shadow-sm px-4 py-2 rounded-2xl flex items-center gap-2 text-[10px] font-bold text-slate-500">
                        <Eye size={12} className="text-blue-500" /> Final Look
                     </div>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="mt-10 flex flex-col md:flex-row gap-4 items-center">
                  <button
                    onClick={handleWatermark}
                    disabled={loading}
                    className="flex-1 w-full bg-amber-500 text-white h-16 rounded-3xl font-black text-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-amber-500/20 flex items-center justify-center gap-3"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin w-6 h-6" />
                    ) : (
                      <>🏷️ Application Watermark</>
                    )}
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Success Panel */}
          <AnimatePresence>
            {downloadUrl && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-green-600 rounded-[40px] p-8 shadow-2xl shadow-green-600/20 flex flex-col md:flex-row items-center justify-between gap-6"
              >
                <div className="flex items-center gap-6">
                  <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center">
                    <FileDown className="text-white w-8 h-8" />
                  </div>
                  <div className="text-white">
                    <h4 className="text-xl font-black">All Done!</h4>
                    <p className="text-green-100 font-medium">Your watermark was applied successfully.</p>
                  </div>
                </div>
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="bg-white text-green-700 px-10 py-5 rounded-3xl font-black text-lg hover:scale-105 active:scale-95 transition-all shadow-xl"
                >
                  Download Result
                </a>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modern Help Sidebar/Modal */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end p-6 bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
            <motion.div 
              initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
              className="w-full max-w-md h-full bg-white rounded-[40px] shadow-2xl p-10 relative overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-8 right-8 text-slate-300 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>

              <div className="mb-12">
                <div className="bg-amber-100 w-14 h-14 rounded-2xl flex items-center justify-center text-amber-600 mb-6">
                   <Info size={28} />
                </div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">How to brand documents</h2>
              </div>

              <div className="space-y-12">
                {[
                  { title: "Upload Base", desc: "Start by dropping the PDF document you want to secure or brand." },
                  { title: "Choose Style", desc: "Toggle between Text or an Image (logo) for your watermark." },
                  { title: "Customize", desc: "Adjust colors, rotation, and transparency. Enable Mosaic mode to tile the mark across the page." },
                  { title: "Layering", desc: "Choose 'Under' if you want a subtle background watermark that goes behind your text." }
                ].map((step, idx) => (
                  <div key={idx} className="flex gap-6">
                    <div className="text-2xl font-black text-amber-500/20 tabular-nums">0{idx + 1}</div>
                    <div className="space-y-2">
                       <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">{step.title}</h4>
                       <p className="text-slate-500 font-medium leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <button 
                onClick={() => setShowHelp(false)}
                className="w-full mt-16 bg-slate-900 text-white py-5 rounded-2xl font-black hover:bg-slate-800 transition-all"
              >
                Got it, thanks!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
