"use client";
import React, { useRef, useState, useCallback, useEffect } from "react";
import axios from "axios";
import { Loader2, FileDown, X, Image as ImageIcon, HelpCircle, UploadCloud, Plus, GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

interface ImageFile {
  file: File;
  preview: string;
  originalFile: File;
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

  // Image Editor Canvas States & Refs
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editorTextOverlays, setEditorTextOverlays] = useState<Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    size: number;
    font?: string;
  }>>([]);
  const [editorRotateAngle, setEditorRotateAngle] = useState<number>(0);
  const [currentCrop, setCurrentCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 1, h: 1 });
  const [cropMode, setCropMode] = useState<boolean>(false);
  const [isDrawingCrop, setIsDrawingCrop] = useState<boolean>(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [editorCropBox, setEditorCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  
  // Adding Text states
  const [newText, setNewText] = useState<string>("");
  const [textColor, setTextColor] = useState<string>("#e11d48"); // default rose-600
  const [textSize, setTextSize] = useState<number>(24);
  const [textFont, setTextFont] = useState<string>("Arial");
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [activeTextId, setActiveTextId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageObject, setImageObject] = useState<HTMLImageElement | null>(null);
  const canvasDimsRef = useRef({ w: 0, h: 0 });

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
        preview: URL.createObjectURL(f),
        originalFile: f
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
        preview: URL.createObjectURL(f),
        originalFile: f
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

  // --- Canvas Editor Logic ---
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;
    
    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const handleCanvasStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    
    // Check if clicked text overlays draggable bounds
    let foundId = null;
    let clickedItem = null;
    
    for (let i = editorTextOverlays.length - 1; i >= 0; i--) {
      const textItem = editorTextOverlays[i];
      const w = textItem.text.length * textItem.size * 0.5;
      const h = textItem.size;
      
      if (
        coords.x >= textItem.x - w/2 - 10 &&
        coords.x <= textItem.x + w/2 + 10 &&
        coords.y >= textItem.y - h/2 - 10 &&
        coords.y <= textItem.y + h/2 + 10
      ) {
        foundId = textItem.id;
        clickedItem = textItem;
        setDragOffset({ x: coords.x - textItem.x, y: coords.y - textItem.y });
        break;
      }
    }
    
    if (foundId && clickedItem) {
      setActiveTextId(foundId);
      setSelectedTextId(foundId);
      // Sync properties so the UI sliders match this text block
      setTextColor(clickedItem.color);
      setTextSize(clickedItem.size);
      if (clickedItem.font) {
        setTextFont(clickedItem.font);
      }
    } else {
      // Clicked base canvas: Deselect active text annotation
      setSelectedTextId(null);
      
      if (cropMode) {
        setIsDrawingCrop(true);
        setCropStart({ x: coords.x, y: coords.y });
        setEditorCropBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
      }
    }
  };

  const handleCanvasMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;
    
    if (activeTextId) {
      setEditorTextOverlays(prev => prev.map(item => {
        if (item.id === activeTextId) {
          return {
            ...item,
            x: coords.x - dragOffset.x,
            y: coords.y - dragOffset.y
          };
        }
        return item;
      }));
    } else if (cropMode && isDrawingCrop && cropStart) {
      const x = Math.min(cropStart.x, coords.x);
      const y = Math.min(cropStart.y, coords.y);
      const w = Math.abs(cropStart.x - coords.x);
      const h = Math.abs(cropStart.y - coords.y);
      setEditorCropBox({ x, y, w, h });
    }
  };

  const handleCanvasEnd = () => {
    setActiveTextId(null);
    setIsDrawingCrop(false);
    setCropStart(null);
  };

  // Loads active image when editor modal is opened
  useEffect(() => {
    setImageObject(null);
    setSelectedTextId(null);
    setEditorRotateAngle(0);
    setCurrentCrop({ x: 0, y: 0, w: 1, h: 1 });
    setEditorTextOverlays([]);
    setEditorCropBox(null);
    setCropMode(false);

    if (editingIndex === null) return;
    
    const activeFile = files[editingIndex];
    if (!activeFile) return;
    
    const img = new Image();
    img.src = activeFile.preview;
    img.onload = () => {
      setImageObject(img);
    };
  }, [editingIndex]);

  // Continuous canvas updates render loop
  useEffect(() => {
    if (!imageObject || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const imgW = imageObject.naturalWidth;
    const imgH = imageObject.naturalHeight;
    
    const srcX = imgW * currentCrop.x;
    const srcY = imgH * currentCrop.y;
    const srcW = imgW * currentCrop.w;
    const srcH = imgH * currentCrop.h;
    
    const rotatedW = (editorRotateAngle % 180 === 0) ? srcW : srcH;
    const rotatedH = (editorRotateAngle % 180 === 0) ? srcH : srcW;
    
    const maxDisplayDim = 500;
    let displayWidth = 0;
    let displayHeight = 0;
    
    if (rotatedW > rotatedH) {
      displayWidth = maxDisplayDim;
      displayHeight = (rotatedH / rotatedW) * maxDisplayDim;
    } else {
      displayHeight = maxDisplayDim;
      displayWidth = (rotatedW / rotatedH) * maxDisplayDim;
    }
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    canvasDimsRef.current = { w: displayWidth, h: displayHeight };
    
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    
    // Draw rotated base image slice
    ctx.save();
    ctx.translate(displayWidth / 2, displayHeight / 2);
    ctx.rotate((editorRotateAngle * Math.PI) / 180);
    
    const drawW = (editorRotateAngle % 180 === 0) ? displayWidth : displayHeight;
    const drawH = (editorRotateAngle % 180 === 0) ? displayHeight : displayWidth;
    
    ctx.drawImage(
      imageObject,
      srcX, srcY, srcW, srcH,
      -drawW / 2, -drawH / 2, drawW, drawH
    );
    ctx.restore();
    
    // Draw text annotations
    editorTextOverlays.forEach(item => {
      ctx.save();
      ctx.fillStyle = item.color;
      const fontStack = item.font === "Mangal" ? '"Mangal", "Noto Sans Devanagari", sans-serif' :
                        item.font === "Poppins" ? '"Poppins", "Noto Sans Devanagari", sans-serif' :
                        item.font === "Times New Roman" ? '"Times New Roman", Times, serif' :
                        item.font === "Courier New" ? '"Courier New", Courier, monospace' :
                        item.font === "Calibri" ? '"Calibri", sans-serif' :
                        `"${item.font || 'Arial'}", sans-serif`;
      ctx.font = `bold ${item.size}px ${fontStack}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(item.text, item.x, item.y);
      
      // If active selection overlay, render bounding bounds & corner widgets
      if (item.id === selectedTextId) {
        const textMetrics = ctx.measureText(item.text);
        const w = textMetrics.width;
        const h = item.size;
        
        ctx.strokeStyle = "#6366f1"; // Indigo selector
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(item.x - w/2 - 6, item.y - h/2 - 4, w + 12, h + 8);
        
        // Handle dots
        ctx.fillStyle = "#6366f1";
        ctx.fillRect(item.x - w/2 - 9, item.y - h/2 - 7, 6, 6);
        ctx.fillRect(item.x + w/2 + 3, item.y - h/2 - 7, 6, 6);
        ctx.fillRect(item.x - w/2 - 9, item.y + h/2 + 1, 6, 6);
        ctx.fillRect(item.x + w/2 + 3, item.y + h/2 + 1, 6, 6);
      }
      
      ctx.restore();
    });
    
    // Draw cropping overlay box
    if (cropMode && editorCropBox) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.beginPath();
      ctx.rect(0, 0, displayWidth, displayHeight);
      ctx.rect(editorCropBox.x, editorCropBox.y, editorCropBox.w, editorCropBox.h);
      ctx.fill("evenodd");
      
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(editorCropBox.x, editorCropBox.y, editorCropBox.w, editorCropBox.h);
      ctx.restore();
    }
  }, [imageObject, editorRotateAngle, currentCrop, editorTextOverlays, cropMode, editorCropBox, selectedTextId]);

  const handleRotate = () => {
    setEditorRotateAngle(prev => (prev + 90) % 360);
    setEditorCropBox(null);
  };

  const handleApplyCrop = () => {
    if (!editorCropBox || editorCropBox.w < 10 || editorCropBox.h < 10) return;
    
    const { w: displayWidth, h: displayHeight } = canvasDimsRef.current;
    
    const cx = editorCropBox.x;
    const cy = editorCropBox.y;
    const cw = editorCropBox.w;
    const ch = editorCropBox.h;
    
    const newX = currentCrop.x + (cx / displayWidth) * currentCrop.w;
    const newY = currentCrop.y + (cy / displayHeight) * currentCrop.h;
    const newW = (cw / displayWidth) * currentCrop.w;
    const newH = (ch / displayHeight) * currentCrop.h;
    
    setCurrentCrop({ x: newX, y: newY, w: newW, h: newH });
    setEditorCropBox(null);
    setCropMode(false);
  };

  const handleAddText = () => {
    if (!newText.trim()) return;
    
    const { w: displayWidth, h: displayHeight } = canvasDimsRef.current;
    
    const textItem = {
      id: Math.random().toString(36).substring(2, 9),
      text: newText,
      x: displayWidth / 2,
      y: displayHeight / 2,
      color: textColor,
      size: textSize,
      font: textFont
    };
    
    setEditorTextOverlays(prev => [...prev, textItem]);
    setNewText("");
    setSelectedTextId(textItem.id); // Auto-select newly added text box
  };

  const handleResetImage = () => {
    if (editingIndex === null) return;
    
    const original = files[editingIndex].originalFile;
    const originalPreview = URL.createObjectURL(original);
    
    setFiles(prev => prev.map((item, idx) => {
      if (idx === editingIndex) {
        URL.revokeObjectURL(item.preview);
        return {
          ...item,
          file: original,
          preview: originalPreview
        };
      }
      return item;
    }));
    
    const img = new Image();
    img.src = originalPreview;
    img.onload = () => {
      setImageObject(img);
      setEditorRotateAngle(0);
      setCurrentCrop({ x: 0, y: 0, w: 1, h: 1 });
      setEditorTextOverlays([]);
      setSelectedTextId(null);
      setEditorCropBox(null);
      setCropMode(false);
    };
  };

  const handleSaveChanges = () => {
    if (editingIndex === null || !imageObject) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const imgW = imageObject.naturalWidth;
    const imgH = imageObject.naturalHeight;
    
    const outW = imgW * currentCrop.w;
    const outH = imgH * currentCrop.h;
    
    const exportW = (editorRotateAngle % 180 === 0) ? outW : outH;
    const exportH = (editorRotateAngle % 180 === 0) ? outH : outW;
    
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;
    
    // Core Correction: Add save() to balance the restore() and clear translations properly
    exportCtx.save();
    exportCtx.translate(exportW / 2, exportH / 2);
    exportCtx.rotate((editorRotateAngle * Math.PI) / 180);
    
    const drawW = (editorRotateAngle % 180 === 0) ? exportW : exportH;
    const drawH = (editorRotateAngle % 180 === 0) ? exportH : exportW;
    
    exportCtx.drawImage(
      imageObject,
      imgW * currentCrop.x, imgH * currentCrop.y, outW, outH,
      -drawW / 2, -drawH / 2, drawW, drawH
    );
    exportCtx.restore();
    
    const { w: displayWidth, h: displayHeight } = canvasDimsRef.current;
    const scaleFactorX = exportW / displayWidth;
    const scaleFactorY = exportH / displayHeight;
    
    editorTextOverlays.forEach(item => {
      exportCtx.save();
      exportCtx.fillStyle = item.color;
      const scaledSize = item.size * scaleFactorY;
      const fontStack = item.font === "Mangal" ? '"Mangal", "Noto Sans Devanagari", sans-serif' :
                        item.font === "Poppins" ? '"Poppins", "Noto Sans Devanagari", sans-serif' :
                        item.font === "Times New Roman" ? '"Times New Roman", Times, serif' :
                        item.font === "Courier New" ? '"Courier New", Courier, monospace' :
                        item.font === "Calibri" ? '"Calibri", sans-serif' :
                        `"${item.font || 'Arial'}", sans-serif`;
      exportCtx.font = `bold ${scaledSize}px ${fontStack}`;
      exportCtx.textBaseline = "middle";
      exportCtx.textAlign = "center";
      
      const scaledX = item.x * scaleFactorX;
      const scaledY = item.y * scaleFactorY;
      
      exportCtx.fillText(item.text, scaledX, scaledY);
      exportCtx.restore();
    });
    
    exportCanvas.toBlob(blob => {
      if (!blob) return;
      
      const originalItem = files[editingIndex];
      const updatedFile = new File([blob], originalItem.file.name, {
        type: "image/jpeg",
        lastModified: Date.now()
      });
      
      URL.revokeObjectURL(originalItem.preview);
      const newPreview = URL.createObjectURL(updatedFile);
      
      setFiles(prev => prev.map((item, idx) => {
        if (idx === editingIndex) {
          return {
            ...item,
            file: updatedFile,
            preview: newPreview
          };
        }
        return item;
      }));
      
      setSelectedTextId(null);
      setEditingIndex(null);
      setImageObject(null);
    }, "image/jpeg", 0.92);
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

                          <div className="flex items-center gap-1">
                            {renderable && (
                              <button
                                type="button"
                                onClick={() => setEditingIndex(idx)}
                                className="p-1 px-1.5 bg-indigo-50 border border-indigo-150 text-indigo-700 hover:bg-indigo-100 rounded-lg transition cursor-pointer flex items-center gap-1 text-[9px] font-bold"
                                title="Edit / Preview"
                              >
                                🎨 Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeFile(idx)}
                              className="p-1 bg-white border border-slate-205 text-red-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Remove"
                            >
                              <X size={12} />
                            </button>
                          </div>
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

      {editingIndex !== null && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/85 z-50 p-4 md:p-6 backdrop-blur-md overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl text-left w-full max-w-4xl relative flex flex-col max-h-[92vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            
            {/* Header bar - stays fixed at top of modal */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-805 bg-slate-900 rounded-t-2xl z-10 flex-shrink-0">
              <div className="overflow-hidden mr-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                  🎨 Canvas Image Editor
                </h3>
                <p className="text-[10px] text-slate-500 truncate" title={files[editingIndex]?.file?.name}>
                  File: {files[editingIndex]?.file?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingIndex(null); setImageObject(null); }}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-full border border-slate-700 transition cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable contents zone for mobile/desktop layouts */}
            <div className="p-5 md:p-6 flex flex-col md:flex-row gap-6 overflow-hidden flex-grow">

              {/* Left side: Canvas Editor workspace */}
              <div className="flex-shrink-0 md:flex-grow flex flex-col items-center justify-center bg-slate-950 rounded-xl border border-slate-800 p-2.5 h-[30vh] min-h-[200px] md:h-auto md:min-h-[460px] relative overflow-hidden select-none">
                {!imageObject ? (
                  <div className="flex flex-col items-center gap-2 text-indigo-400">
                    <Loader2 className="animate-spin w-8 h-8" />
                    <span className="text-xs text-slate-400 font-semibold">Creating workspace...</span>
                  </div>
                ) : (
                  <div className="relative max-w-full overflow-hidden flex items-center justify-center">
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleCanvasStart}
                      onMouseMove={handleCanvasMove}
                      onMouseUp={handleCanvasEnd}
                      onMouseLeave={handleCanvasEnd}
                      onTouchStart={handleCanvasStart}
                      onTouchMove={handleCanvasMove}
                      onTouchEnd={handleCanvasEnd}
                      className={`max-w-full max-h-[28vh] md:max-h-[50vh] border border-slate-800 rounded shadow-inner ${
                        cropMode ? "cursor-crosshair" : "cursor-default"
                      }`}
                    />
                  </div>
                )}
                {cropMode && (
                  <p className="text-[10px] text-yellow-500 font-bold mt-2 text-center animate-pulse">
                    🖱️ Click and drag on the canvas to draw a crop selection area.
                  </p>
                )}
              </div>

              {/* Right side: Editor controls */}
              <div className="w-full md:w-80 flex flex-col justify-between gap-6 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6 text-slate-202 overflow-y-auto flex-grow custom-scrollbar h-[45vh] md:h-auto pb-4">
                <div className="space-y-6"><div className="space-y-3.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-800 pb-1.5">
                    Transform Rules
                  </span>
                  
                  <div className="flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleRotate}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold p-2.5 rounded-xl border border-slate-700 text-xs flex items-center justify-center gap-2 transition"
                    >
                      🔄 Rotate +90°
                    </button>
                    
                    <button
                      type="button"
                      disabled={!imageObject}
                      onClick={() => {
                        setCropMode(!cropMode);
                        setEditorCropBox(null);
                      }}
                      className={`flex-1 font-bold p-2.5 rounded-xl border text-xs flex items-center justify-center gap-2 transition disabled:opacity-40 ${
                        cropMode
                          ? "bg-amber-600 border-amber-500 hover:bg-amber-700 text-white"
                          : "bg-slate-800 border-slate-700 hover:bg-slate-700 text-white"
                      }`}
                    >
                      ✂️ Crop Image
                    </button>
                  </div>

                  {cropMode && editorCropBox && editorCropBox.w > 10 && editorCropBox.h > 10 && (
                    <button
                      type="button"
                      onClick={handleApplyCrop}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition animate-in zoom-in-95"
                    >
                      ✔️ Apply Selected Crop
                    </button>
                  )}
                </div>

                {/* Annotation features */}
                <div className="space-y-3.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block border-b border-slate-800 pb-1.5 flex justify-between items-center">
                    <span>Annotate / Add Text</span>
                    {selectedTextId && (
                      <span className="text-[9px] bg-indigo-500/25 px-1.5 py-0.5 rounded text-indigo-305 font-semibold animate-pulse">
                        Selected
                      </span>
                    )}
                  </span>
                  
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      placeholder={selectedTextId ? "Edit selected text..." : "Type text overlay..."}
                      value={selectedTextId ? (editorTextOverlays.find(t => t.id === selectedTextId)?.text || "") : newText}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedTextId) {
                          setEditorTextOverlays(prev => prev.map(t => t.id === selectedTextId ? { ...t, text: val } : t));
                        } else {
                          setNewText(val);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-505 focus:outline-none focus:border-indigo-500"
                    />

                    {/* Color Presets */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 mr-1">Color:</span>
                      {["#ffffff", "#000000", "#e11d48", "#eab308", "#2563eb", "#16a34a"].map((c, i) => {
                        const activeColor = selectedTextId 
                          ? (editorTextOverlays.find(t => t.id === selectedTextId)?.color || textColor)
                          : textColor;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              if (selectedTextId) {
                                setEditorTextOverlays(prev => prev.map(t => t.id === selectedTextId ? { ...t, color: c } : t));
                              }
                              setTextColor(c);
                            }}
                            className={`w-5 h-5 rounded-full border transition ${
                              activeColor === c ? "border-white scale-110 shadow" : "border-slate-850"
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        );
                      })}
                      
                      {/* Custom Color Wheel Picker */}
                      <div className="relative flex items-center justify-center w-5 h-5 rounded-full border border-slate-700 bg-gradient-to-tr from-rose-500 via-yellow-400 to-indigo-500 hover:scale-110 active:scale-95 transition cursor-pointer overflow-hidden shadow-sm ml-1 animate-in zoom-in-95" title="Choose custom color">
                        <input
                          type="color"
                          value={selectedTextId ? (editorTextOverlays.find(t => t.id === selectedTextId)?.color || textColor) : textColor}
                          onChange={(e) => {
                            const customC = e.target.value;
                            if (selectedTextId) {
                              setEditorTextOverlays(prev => prev.map(t => t.id === selectedTextId ? { ...t, color: customC } : t));
                            }
                            setTextColor(customC);
                          }}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                        />
                        <span className="text-[9px] pointer-events-none text-white font-black drop-shadow-sm select-none">🎨</span>
                      </div>
                    </div>

                    {/* Font size control */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Size: {selectedTextId ? (editorTextOverlays.find(t => t.id === selectedTextId)?.size || textSize) : textSize}px</span>
                      <input
                        type="range"
                        min="12"
                        max="80"
                        value={selectedTextId ? (editorTextOverlays.find(t => t.id === selectedTextId)?.size || textSize) : textSize}
                        onChange={(e) => {
                          const sz = Number(e.target.value);
                          if (selectedTextId) {
                            setEditorTextOverlays(prev => prev.map(t => t.id === selectedTextId ? { ...t, size: sz } : t));
                          }
                          setTextSize(sz);
                        }}
                        className="w-2/3 accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Font Family selector */}
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Font:</span>
                      <select
                        value={selectedTextId ? (editorTextOverlays.find(t => t.id === selectedTextId)?.font || "Arial") : textFont}
                        onChange={(e) => {
                          const f = e.target.value;
                          if (selectedTextId) {
                            setEditorTextOverlays(prev => prev.map(t => t.id === selectedTextId ? { ...t, font: f } : t));
                          }
                          setTextFont(f);
                        }}
                        className="w-2/3 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                      >
                        <option value="Arial">Sans-Serif (Arial)</option>
                        <option value="Times New Roman">Times New Roman (Courts & Legal)</option>
                        <option value="Calibri">Calibri (Official Document)</option>
                        <option value="Poppins">Poppins (Modern Devnagari / English)</option>
                        <option value="Mangal">Mangal (Govt Exam Hindi / Devnagari)</option>
                        <option value="Georgia">Georgia (Serif)</option>
                        <option value="Courier New">Courier New (Typewriter / Code)</option>
                        <option value="Impact">Impact (Bold Titles)</option>
                      </select>
                    </div>

                    {selectedTextId ? (
                      <div className="flex gap-2 pt-1 animate-in slide-in-from-top-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditorTextOverlays(prev => prev.filter(t => t.id !== selectedTextId));
                            setSelectedTextId(null);
                          }}
                          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl text-xs transition"
                        >
                          🗑️ Delete Text
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTextId(null)}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 rounded-xl border border-slate-700 text-xs transition"
                        >
                          Deselect
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleAddText}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                      >
                        ✍️ Add Text Box
                      </button>
                    )}

                    {editorTextOverlays.length > 0 && (
                      <p className="text-[9.5px] text-slate-400 block pt-1 text-center font-medium">
                        💡 Click a text box to select/edit/resize; drag to relocate.
                      </p>
                    )}
                  </div>
                </div>

              </div>

              {/* Reset, Cancel, Save action group */}
              <div className="space-y-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleResetImage}
                  className="w-full bg-slate-950 text-slate-400 hover:text-white border border-slate-850 hover:border-slate-700 font-bold py-2.5 rounded-xl text-xs transition"
                >
                  ↩️ Reset Original Image
                </button>
                
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingIndex(null); setImageObject(null); }}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs border border-slate-700 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              </div>

            </div>
            </div>

          </div>
        </div>
      )}

      {/* Internal CSS for scrollbar */}
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;650;700&family=Noto+Sans+Devanagari:wght@400;700&display=swap');
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
