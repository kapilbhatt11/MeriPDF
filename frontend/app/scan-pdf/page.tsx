"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  UploadCloud, 
  Camera, 
  X, 
  Image as ImageIcon, 
  Download, 
  CheckCircle2, 
  Sparkles, 
  RotateCw, 
  Sliders, 
  Trash2,
  Video,
  Monitor,
  Check,
  RefreshCw,
  Plus
} from "lucide-react";
import { toast, Toaster } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import { logPDFOperation } from "@/lib/analytics";

interface ScannedImage {
  id: string;
  rawUrl: string;
  filteredUrl: string;
  filterMode: "original" | "doc" | "grayscale" | "contrast";
  rotation: number; // 0, 90, 180, 270
}

export default function ScanPDFPage() {
  const [scans, setScans] = useState<ScannedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLiveCam, setShowLiveCam] = useState(false);
  
  // Camera state
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const [activeTab, setActiveTab] = useState<"upload" | "webcam">("upload");

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const systemCamInputRef = useRef<HTMLInputElement>(null);

  // Parse list of video devices
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.mediaDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then(devices => {
          const videoInputs = devices.filter(d => d.kind === "videoinput");
          setVideoDevices(videoInputs);
          if (videoInputs.length > 0) {
            // Default to back camera if found (looks for "back" or "environment")
            const backCam = videoInputs.find(d => d.label.toLowerCase().includes("back") || d.label.toLowerCase().includes("environment"));
            setSelectedDeviceId(backCam ? backCam.deviceId : videoInputs[0].deviceId);
          }
        })
        .catch(err => {
          console.warn("Failed to retrieve camera sources:", err);
        });
    }
  }, []);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [camStream]);

  // Bind the camera stream to the video element only after the video element is mounted in the DOM
  useEffect(() => {
    if (showLiveCam && camStream && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = camStream;
      video.play().catch(err => {
        console.warn("webcam autoPlay failed, retrying play interaction", err);
      });
    }
  }, [showLiveCam, camStream]);

  const stopCamera = () => {
    if (camStream) {
      camStream.getTracks().forEach(track => track.stop());
      setCamStream(null);
    }
  };

  const startCamera = async (deviceId: string) => {
    stopCamera();
    try {
      const constraints = {
        video: (deviceId && deviceId.trim() !== "")
          ? { deviceId: { exact: deviceId } } 
          : { facingMode: "environment" }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCamStream(stream);
    } catch (err) {
      toast.error("Unable to access camera stream. Falling back to native system camera mode.");
      console.warn("getUserMedia failed:", err);
      setShowLiveCam(false);
    }
  };

  const handleOpenBrowserScanner = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Browser camera support is only available in secure sessions (HTTPS). Please use Native Camera mode.");
      return;
    }
    // Set state first so video ref mounts in DOM
    setShowLiveCam(true);
    // Request permission/stream
    await startCamera(selectedDeviceId);
  };

  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedDeviceId(id);
    await startCamera(id);
  };

  const applyPixelFilter = (
    rawUrl: string,
    mode: "original" | "doc" | "grayscale" | "contrast",
    callback: (url: string) => void
  ) => {
    if (mode === "original") {
      callback(rawUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      if (mode === "grayscale") {
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = avg;
          data[i + 1] = avg;
          data[i + 2] = avg;
        }
      } else if (mode === "doc") {
        // Doc thresholding filter
        for (let i = 0; i < data.length; i += 4) {
          const avg = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          const threshold = 125;
          const val = avg > threshold ? 255 : 45; // Crisp dark gray and clean white backgrounds
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        }
      } else if (mode === "contrast") {
        // High contrast boost
        const contrast = 70;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        for (let i = 0; i < data.length; i += 4) {
          data[i] = factor * (data[i] - 128) + 128;
          data[i + 1] = factor * (data[i + 1] - 128) + 128;
          data[i + 2] = factor * (data[i + 2] - 128) + 128;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      callback(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.src = rawUrl;
  };

  // Capture frame from local camera
  const captureFrame = () => {
    if (!videoRef.current || !camStream) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        
        const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        const newScan: ScannedImage = {
          id: newId,
          rawUrl: dataUrl,
          filteredUrl: dataUrl,
          filterMode: "original",
          rotation: 0
        };

        setScans(prev => [...prev, newScan]);
        toast.success(`Page ${scans.length + 1} snapped!`, { duration: 1000 });
      }
    } catch (e) {
      toast.error("Failed to capture webcam frame.");
    }
  };

  // Handle uploaded system capture/image files 
  const handleSystemAddFiles = (addedFiles: FileList | null) => {
    if (!addedFiles || addedFiles.length === 0) return;
    
    Array.from(addedFiles).forEach(file => {
      const hasImgExt = /\.(jpe?g|png|webp|heic|heif|gif|tiff|bmp)$/i.test(file.name);
      const isImgType = file.type.startsWith("image/") || file.type === "";
      
      if (!isImgType && !hasImgExt) {
        toast.error(`${file.name} is not a recognized image format.`);
        return;
      }
      
      const previewUrl = URL.createObjectURL(file);
      const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
      const newScan: ScannedImage = {
        id: newId,
        rawUrl: previewUrl,
        filteredUrl: previewUrl,
        filterMode: "original",
        rotation: 0
      };
      setScans(prev => [...prev, newScan]);
    });
  };

  const updateScanFilter = (id: string, mode: "original" | "doc" | "grayscale" | "contrast") => {
    setScans(prev => prev.map(s => {
      if (s.id !== id) return s;
      
      // Keep mode immediately reactive
      const updated = { ...s, filterMode: mode };
      
      // Calculate processed data asynchronously
      applyPixelFilter(s.rawUrl, mode, (processedUrl) => {
        setScans(curr => curr.map(item => item.id === id ? { ...item, filteredUrl: processedUrl } : item));
      });

      return updated;
    }));
  };

  const updateScanRotation = (id: string) => {
    setScans(prev => prev.map(s => {
      if (s.id !== id) return s;
      const nextRotation = (s.rotation + 90) % 360;
      return { ...s, rotation: nextRotation };
    }));
  };

  const deleteScan = (id: string) => {
    setScans(prev => prev.filter(s => s.id !== id));
  };

  // Convert canvas output blob to final Form File with safe .jpg suffix
  const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  // Apply visual rotation right to canvas before building final file upload
  const applyRotationOnCanvas = (
    imgUrl: string, 
    rotation: number, 
    callback: (finalUrl: string) => void
  ) => {
    if (rotation === 0) {
      callback(imgUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        callback(imgUrl);
        return;
      }

      if (rotation === 90 || rotation === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      callback(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.src = imgUrl;
  };

  const handleGeneratePdf = async () => {
    if (scans.length === 0) {
      toast.error("Please add at least one scanned page.");
      return;
    }

    setLoading(true);

    try {
      const processedFilesPromises = scans.map((s, idx) => {
        return new Promise<File>((resolve) => {
          // 1. Bake final rotations to pixels
          applyRotationOnCanvas(s.filteredUrl, s.rotation, (rotatedDataUrl) => {
            // 2. Generate file with absolute extension format
            const file = dataURLtoFile(rotatedDataUrl, `scan_${idx + 1}.jpeg`);
            resolve(file);
          });
        });
      });

      const processedFilesList = await Promise.all(processedFilesPromises);
      const formData = new FormData();
      processedFilesList.forEach(f => formData.append("files", f));

      const res = await fetchWithAuth(api("/pdf/scan"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to process scan compilation.");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MeriPDF_Scanned_Document.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      logPDFOperation("Scan PDF", scans.length);
      toast.success("PDF generated from scans successfully!");
    } catch (err) {
      toast.error("Error compiling PDF. Check image formats.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAuth>
      <div className="min-h-screen bg-slate-50/50 pb-16">
        <Toaster position="top-right" />

        {/* --- Top Premium Header --- */}
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 py-12 px-6 shadow-md border-b border-indigo-950/20">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full filter blur-3xl translate-x-1/4 -translate-y-1/4"></div>
          <div className="max-w-6xl mx-auto relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-bold text-indigo-400 mb-4">
                <Sparkles className="w-3.5 h-3.5" /> High-Fidelity Scanning Tools
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">
                Intelligent Mobile Scan
              </h1>
              <p className="text-slate-400 text-sm mt-1 max-w-xl">
                Convert photographs, receipts, and whiteboard sketches into clean structured PDFs. Supports real-time filter contrast normalization.
              </p>
            </div>
            
            <button
              onClick={() => { setScans([]); }}
              disabled={scans.length === 0}
              className="bg-white/10 hover:bg-white/15 px-4 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-white transition disabled:opacity-55 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              Clear Workspace
            </button>
          </div>
        </div>

        {/* --- Main Workspace --- */}
        <div className="max-w-6xl mx-auto px-6 mt-8">
          
          {/* Dual Toggle Option Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 select-none">
            {/* Native OS Upload selector */}
            <div 
              onClick={() => systemCamInputRef.current?.click()}
              className="bg-white border border-slate-200 hover:border-indigo-400 rounded-2xl p-6.5 p-6 cursor-pointer shadow-sm hover:shadow transition group flex items-center gap-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-indigo-100">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Choose from System Camera / Files</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Trigger native device camera capture or pick JPG, PNG files straight from folder structures.
                </p>
              </div>
            </div>

            {/* Smart Cam Viewfinder trigger */}
            <div 
              onClick={handleOpenBrowserScanner}
              className="bg-white border border-slate-200 hover:border-emerald-400 rounded-2xl p-6.5 p-6 cursor-pointer shadow-sm hover:shadow transition group flex items-center gap-6"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-emerald-100">
                <Camera className="w-7 h-7" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">Open Smart View Finder Scanner</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Consecutive snaps without closing camera. Includes live filter normalization checks.
                </p>
              </div>
            </div>
          </div>

          {/* Hidden File Selectors */}
          <input 
            ref={systemCamInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleSystemAddFiles(e.target.files)}
          />

          {/* Scanned Pages Workspace Grid */}
          <div className="bg-white border border-slate-250 border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-4 mb-6 flex items-center gap-2">
              <ImageIcon className="w-4.5 h-4.5 text-indigo-500" /> Scanned documents List ({scans.length})
            </h3>

            {scans.length === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <Camera className="w-10 h-10 text-slate-350 text-slate-400 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800">Your Scanning tray is empty</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
                  Choose system images, open live camera module capture, or take multi picture snaps to begin creating high-fidelity PDFs.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                
                {/* Thumbnails grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {scans.map((s, idx) => (
                    <div 
                      key={s.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4.5 relative shadow-xs hover:shadow-md transition flex flex-col justify-between"
                    >
                      {/* Delete button */}
                      <button 
                        onClick={() => deleteScan(s.id)}
                        className="absolute top-3.5 right-3.5 bg-rose-50 hover:bg-rose-100 text-rose-600 p-2 rounded-xl transition border border-rose-100 shadow-sm z-10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      {/* Image Preview Window */}
                      <div className="aspect-[3/4] rounded-xl bg-slate-100 border border-slate-150 overflow-hidden flex items-center justify-center relative">
                        <img 
                          src={s.filteredUrl} 
                          alt={`Scan-${idx+1}`} 
                          className="w-full h-full object-contain transform transition-all duration-300 pointer-events-none"
                          style={{ transform: `rotate(${s.rotation}deg)` }}
                        />
                        <div className="absolute bottom-2 left-2 bg-slate-900/75 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                          Page {idx + 1}
                        </div>
                      </div>

                      {/* Enhancer Settings Controls */}
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => updateScanRotation(s.id)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 px-3 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
                          >
                            <RotateCw className="w-3 h-3 text-slate-500" /> Rotate
                          </button>
                          
                          <select
                            value={s.filterMode}
                            onChange={(e) => updateScanFilter(s.id, e.target.value as any)}
                            className="bg-slate-100 hover:bg-slate-250 text-slate-700 py-1.5 px-2 rounded-lg text-[10px] font-bold outline-none border-none flex-grow cursor-pointer"
                          >
                            <option value="original">Original Tone</option>
                            <option value="doc">Doc-Scan filter</option>
                            <option value="grayscale">Grayscale stamp</option>
                            <option value="contrast">Crisp Contrast</option>
                          </select>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>

                {/* Confirm Compilation footer */}
                <div className="border-t border-slate-100 pt-6 flex justify-end">
                  <button
                    onClick={handleGeneratePdf}
                    disabled={loading}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-8 rounded-xl shadow-md flex items-center justify-center gap-2 transition duration-200 text-xs disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Compiling Document structure...
                      </>
                    ) : (
                      <>
                        <Check className="w-4.5 h-4.5 stroke-[3]" /> Generate Scanned PDF
                      </>
                    )}
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>

      {/* ================= 📱 SMART WEB CAMERA VIEW FINDER MODAL ================= */}
      {showLiveCam && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col md:flex-row items-stretch select-none">
          
          {/* Main camera viewfinder panel */}
          <div className="flex-1 relative flex flex-col justify-between p-4 md:p-6">
            
            {/* Header controls select device */}
            <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-center bg-slate-900/60 backdrop-blur-xs py-2 px-4 rounded-xl border border-white/5">
              <span className="text-white text-xs font-bold flex items-center gap-1.5">
                <Video className="w-4 h-4 text-emerald-400 animate-pulse" /> Live viewfinder
              </span>
              
              <div className="flex items-center gap-2">
                {videoDevices.length > 1 && (
                  <select 
                    value={selectedDeviceId}
                    onChange={handleDeviceChange}
                    className="bg-slate-800 text-white text-[10px] py-1.5 px-2 rounded-lg border-none outline-none font-medium cursor-pointer"
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>Camera {i + 1} ({d.label.slice(0, 15) || "Webcam"})</option>
                    ))}
                  </select>
                )}

                <button 
                  onClick={() => { stopCamera(); setShowLiveCam(false); }}
                  className="bg-white/10 text-white hover:bg-rose-600 p-1.5 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video stream container with alignment frame guide */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden rounded-2xl border border-white/10 bg-black mt-12 mb-4">
              <video 
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform rotate-0"
              />
              
              {/* Target Scan Boundaries Guides */}
              <div className="absolute inset-8 md:inset-12 border-2 border-dashed border-emerald-400/60 rounded-xl pointer-events-none flex flex-col justify-between p-3.5">
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400"></div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400"></div>
                </div>
                
                <span className="text-[9px] uppercase tracking-widest font-black text-center text-emerald-400 bg-black/40 backdrop-blur-xs py-1 px-3.5 rounded-full select-none self-center">
                  Align Document inside frame
                </span>

                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400"></div>
                  <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400"></div>
                </div>
              </div>
            </div>

            {/* Bottom Snapper controls */}
            <div className="flex justify-center items-center py-2 relative z-20">
              <button 
                onClick={captureFrame}
                className="w-18 h-18 rounded-full border-4 border-white/80 bg-white hover:bg-emerald-400 hover:border-emerald-250 transition-all flex items-center justify-center shadow-lg active:scale-90 relative cursor-pointer"
                title="Capture Document Page"
              >
                <div className="w-14 h-14 rounded-full border-2 border-black/10 bg-transparent"></div>
              </button>
            </div>

          </div>

          {/* Right tray showing snaps list */}
          <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-white/10 flex flex-col justify-between p-6 shrink-0">
            <div>
              <h4 className="text-white text-xs font-bold uppercase tracking-wider mb-4 border-b border-white/5 pb-2">
                Snapped pages ({scans.length})
              </h4>

              {scans.length === 0 ? (
                <p className="text-slate-500 text-xs leading-relaxed italic text-center py-10">
                  Tap camera shutter to snap pages consecutive times.
                </p>
              ) : (
                <div className="grid grid-cols-4 md:grid-cols-2 gap-3 max-h-56 md:max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
                  {scans.map((s, i) => (
                    <div key={s.id} className="relative group bg-slate-800 p-1.5 rounded-lg border border-white/5 aspect-[3/4] flex items-center justify-center">
                      <img src={s.filteredUrl} className="max-w-full max-h-full object-contain rounded" alt="snap" />
                      <button 
                        onClick={() => deleteScan(s.id)}
                        className="absolute -top-1.5 -right-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full p-1 opacity-90 transition shadow border border-slate-900"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                      <span className="absolute bottom-1 left-1.5 bg-black/60 text-white text-[8px] font-bold px-1 rounded">P{i+1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/5 mt-4">
              <button 
                onClick={() => { stopCamera(); setShowLiveCam(false); }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition text-xs flex justify-center items-center gap-1.5"
              >
                <CheckCircle2 className="w-4.5 h-4.5" /> Done Scanning
              </button>
            </div>
          </div>

        </div>
      )}

    </RequireAuth>
  );
}
