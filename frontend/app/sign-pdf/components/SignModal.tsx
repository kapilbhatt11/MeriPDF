"use client";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Type, Edit3, Image as ImageIcon, Award, Trash2, Award as SealIcon } from "lucide-react";

interface SignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (element: { type: "image" | "text"; value: string; width: number; height: number }) => void;
}

export default function SignModal({ isOpen, onClose, onSave }: SignModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [activeTab, setActiveTab] = useState<"type" | "draw" | "upload" | "stamp">("type");
  const [inkColor, setInkColor] = useState<string>("#0f172a");

  // Type Tab States
  const [typedName, setTypedName] = useState<string>("");
  const [useInitials, setUseInitials] = useState<boolean>(false);
  const [typedInitials, setTypedInitials] = useState<string>("");
  const [selectedFont, setSelectedFont] = useState<string>("font-sacramento");

  // Draw Tab States
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Upload Tab States
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  // Stamp Tab States
  const stampCanvasRef = useRef<HTMLCanvasElement>(null);
  const [companyName, setCompanyName] = useState<string>("DOCINTEL SOLUTIONS");
  const [subText, setSubText] = useState<string>("★ OFFICIAL SEAL ★");
  const [centerText, setCenterText] = useState<string>("APPROVED");
  const [stampType, setStampType] = useState<"round" | "rect">("round");
  const [stampColor, setStampColor] = useState<string>("#1d4ed8");
  const [stampDate, setStampDate] = useState<string>(() => new Date().toISOString().split("T")[0]);

  // Local Storage Items
  const [savedItems, setSavedItems] = useState<Array<{ id: string; type: string; dataUrl: string }>>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("docintel_signatures");
      if (saved) {
        try {
          setSavedItems(JSON.parse(saved));
        } catch {}
      }
    }
  }, []);

  // Auto-calculate initials suggestion when name changes
  useEffect(() => {
    if (typedName) {
      const words = typedName.trim().split(/\s+/);
      const computed = words
        .map(w => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 3);
      setTypedInitials(computed);
    } else {
      setTypedInitials("");
    }
  }, [typedName]);

  const saveItemToStorage = (type: string, dataUrl: string) => {
    const newItem = { id: Date.now().toString(), type, dataUrl };
    const updated = [newItem, ...savedItems].slice(0, 8);
    setSavedItems(updated);
    localStorage.setItem("docintel_signatures", JSON.stringify(updated));
  };

  const deleteStoredItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedItems.filter(item => item.id !== id);
    setSavedItems(updated);
    localStorage.setItem("docintel_signatures", JSON.stringify(updated));
  };

  // Draw Pad Mouse/Touch Handler
  useEffect(() => {
    if (activeTab === "draw" && drawCanvasRef.current) {
      const canvas = drawCanvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }
  }, [activeTab, inkColor]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x * 2, y * 2);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (e.cancelable) e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x * 2, y * 2);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearDrawPad = () => {
    const canvas = drawCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  // Stamp Live Canvas Render
  useEffect(() => {
    if (activeTab === "stamp" && stampCanvasRef.current) {
      renderStamp();
    }
  }, [activeTab, companyName, subText, centerText, stampType, stampColor, stampDate]);

  const renderStamp = () => {
    const canvas = stampCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    if (stampType === "round") {
      ctx.strokeStyle = stampColor;
      ctx.fillStyle = stampColor;

      // Outer Thick Ring
      ctx.beginPath();
      ctx.arc(cx, cy, 140, 0, 2 * Math.PI);
      ctx.lineWidth = 5;
      ctx.stroke();

      // Inner Thin Circular Border
      ctx.beginPath();
      ctx.arc(cx, cy, 95, 0, 2 * Math.PI);
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Circular text drawing wrapper
      const drawCurvedText = (text: string, radius: number, centerAngle: number, isReversed: boolean) => {
        ctx.save();
        ctx.font = "bold 20px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = stampColor;
        ctx.translate(cx, cy);
        
        const chars = text.split("");
        if (chars.length === 0) {
          ctx.restore();
          return;
        }

        // Measure widths of all characters to calculate exact angular widths
        const charWidths = chars.map(c => ctx.measureText(c).width);
        const kerning = 2.5; // padding in pixels between characters
        const charAngles = charWidths.map(w => (w + kerning) / radius);
        const totalAngle = charAngles.reduce((sum, a) => sum + a, 0);

        if (!isReversed) {
          // Top text: centered at centerAngle (e.g. -Math.PI / 2)
          let currentAngle = centerAngle - totalAngle / 2;
          for (let i = 0; i < chars.length; i++) {
            const charAngle = charAngles[i];
            const angle = currentAngle + charAngle / 2;

            ctx.save();
            ctx.rotate(angle + Math.PI / 2); // Rotate so local negative Y points towards `angle`
            ctx.translate(0, -radius);
            ctx.fillText(chars[i], 0, 0);
            ctx.restore();

            currentAngle += charAngle;
          }
        } else {
          // Bottom text: centered at centerAngle (e.g. Math.PI / 2)
          let currentAngle = centerAngle - totalAngle / 2;
          for (let i = 0; i < chars.length; i++) {
            const charAngle = charAngles[i];
            const angle = currentAngle + charAngle / 2;

            ctx.save();
            ctx.rotate(angle - Math.PI / 2); // Rotate so local positive Y points towards `angle`
            ctx.translate(0, radius);
            ctx.rotate(Math.PI); // Flip character upright
            ctx.fillText(chars[i], 0, 0);
            ctx.restore();

            currentAngle += charAngle;
          }
        }
        ctx.restore();
      };

      if (companyName) {
        drawCurvedText(companyName.toUpperCase(), 117.5, -Math.PI / 2, false);
      }

      if (subText) {
        drawCurvedText(subText.toUpperCase(), 117.5, Math.PI / 2, true);
      }

      if (centerText) {
        // Draw inner horizontal lines
        ctx.beginPath();
        ctx.moveTo(cx - 70, cy - 25);
        ctx.lineTo(cx + 70, cy - 25);
        ctx.moveTo(cx - 70, cy + 25);
        ctx.lineTo(cx + 70, cy + 25);
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(centerText.toUpperCase(), cx, cy);
      }
    } else {
      ctx.strokeStyle = stampColor;
      ctx.fillStyle = stampColor;

      // Double box rectangles
      ctx.lineWidth = 5;
      ctx.strokeRect(20, 40, canvas.width - 40, canvas.height - 80);

      ctx.lineWidth = 2;
      ctx.strokeRect(27, 47, canvas.width - 54, canvas.height - 94);

      // Section lines
      ctx.beginPath();
      ctx.moveTo(27, cy - 25);
      ctx.lineTo(canvas.width - 27, cy - 25);
      ctx.moveTo(27, cy + 20);
      ctx.lineTo(canvas.width - 27, cy + 20);
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "bold 20px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(companyName.toUpperCase() || "OFFICIAL STAMP", cx, 75);

      ctx.font = "bold 22px 'Segoe UI', Arial, sans-serif";
      ctx.fillText(centerText.toUpperCase() || "APPROVED", cx, cy + 5);

      let dStr = "________";
      if (stampDate) {
        const parts = stampDate.split("-");
        if (parts.length === 3) {
          const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          dStr = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        } else {
          dStr = stampDate;
        }
      }
      ctx.font = "italic 13px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`DATE: ${dStr}`, 40, 205);
      ctx.textAlign = "right";
      ctx.fillText(`SIGN: _______`, canvas.width - 40, 205);
    }
  };

  const handleApply = () => {
    if (activeTab === "type") {
      const finalVal = useInitials ? typedInitials : typedName;
      if (!finalVal.trim()) {
        alert(useInitials ? "Please enter initials first." : "Please type your name first.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = inkColor;

        let fontCSS = "700 72px 'Sacramento', cursive";
        if (selectedFont === "font-vibes") fontCSS = "400 74px 'Great Vibes', cursive";
        else if (selectedFont === "font-pacifico") fontCSS = "400 56px 'Pacifico', cursive";
        else if (selectedFont === "font-dancing") fontCSS = "700 52px 'Dancing Script', cursive";
        else if (selectedFont === "font-playfair") fontCSS = "italic 700 56px 'Playfair Display', serif";
        else if (selectedFont === "font-poppins") fontCSS = "700 48px 'Poppins', sans-serif";
        else if (selectedFont === "font-montserrat") fontCSS = "800 46px 'Montserrat', sans-serif";
        else if (selectedFont === "font-merriweather") fontCSS = "italic 700 48px 'Merriweather', serif";
        else if (selectedFont === "font-serif") fontCSS = "italic 52px Georgia, serif";
        else if (selectedFont === "font-sans") fontCSS = "700 48px Helvetica, Arial, sans-serif";

        ctx.font = fontCSS;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(finalVal, canvas.width / 2, canvas.height / 2);

        const dataUrl = canvas.toDataURL("image/png");
        saveItemToStorage("signature", dataUrl);
        onSave({ type: "image", value: dataUrl, width: 280, height: 95 });
        onClose();
        setTypedName("");
        setTypedInitials("");
      }
    } else if (activeTab === "draw") {
      const canvas = drawCanvasRef.current;
      if (canvas) {
        const buffer = document.createElement("canvas");
        buffer.width = canvas.width;
        buffer.height = canvas.height;
        const bCtx = buffer.getContext("2d");
        let hasPixels = false;
        bCtx?.drawImage(canvas, 0, 0);
        const imgData = bCtx?.getImageData(0, 0, canvas.width, canvas.height);
        if (imgData) {
          for (let i = 3; i < imgData.data.length; i += 4) {
            if (imgData.data[i] > 10) {
              hasPixels = true;
              break;
            }
          }
        }
        if (!hasPixels) return alert("Please draw something before applying.");

        const dataUrl = canvas.toDataURL("image/png");
        saveItemToStorage("signature", dataUrl);
        onSave({ type: "image", value: dataUrl, width: 260, height: 110 });
        onClose();
        clearDrawPad();
      }
    } else if (activeTab === "upload") {
      if (!uploadedFileUrl) return alert("Please select an image file first.");
      onSave({ type: "image", value: uploadedFileUrl, width: 220, height: 100 });
      onClose();
    } else if (activeTab === "stamp") {
      const canvas = stampCanvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        saveItemToStorage("stamp", dataUrl);
        
        const size = stampType === "round" ? 170 : 220;
        const ratio = stampType === "round" ? 1.0 : 0.65;
        
        onSave({ 
          type: "image", 
          value: dataUrl, 
          width: size, 
          height: size * ratio 
        });
        onClose();
      }
    }
  };

  const handleUploadedImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setUploadedFileUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      {/* 10 Unique Handwriting + Display Fonts Integration */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Pacifico&family=Sacramento&family=Playfair+Display:ital,wght@1,700&family=Poppins:wght@700&family=Montserrat:wght@800&family=Merriweather:ital,wght@1,700&display=swap');
        .font-sacramento { font-family: 'Sacramento', cursive; }
        .font-vibes { font-family: 'Great Vibes', cursive; }
        .font-pacifico { font-family: 'Pacifico', cursive; }
        .font-dancing { font-family: 'Dancing Script', cursive; }
        .font-playfair { font-family: 'Playfair Display', serif; font-style: italic; font-weight: 700; }
        .font-poppins { font-family: 'Poppins', sans-serif; font-weight: 700; }
        .font-montserrat { font-family: 'Montserrat', sans-serif; font-weight: 850; }
        .font-merriweather { font-family: 'Merriweather', serif; font-style: italic; font-weight: 700; }
        .font-serif { font-family: Georgia, serif; font-style: italic; }
        .font-sans { font-family: 'Helvetica, Arial', sans-serif; font-weight: 700; }
      `}</style>

      <div className="bg-white rounded-3xl w-full max-w-5xl h-[620px] max-h-[90vh] shadow-2xl flex flex-col overflow-hidden relative border border-slate-100 animate-in fade-in zoom-in-95 duration-205">
        
        {/* Header */}
        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <SealIcon className="text-teal-600 w-6 h-6" /> Add Signature or Stamp
          </h2>
          <button 
            onClick={onClose} 
            className="p-1 px-1.5 hover:bg-slate-100 rounded-xl transition text-slate-400 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Split Layout */}
        <div className="flex-1 flex min-h-0">
          
          {/* Preset Sidebar History */}
          <div className="w-1/4 max-w-[210px] bg-slate-50/70 border-r border-slate-100 p-5 flex flex-col shrink-0">
             <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-4 block">Presets History</span>
             <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {savedItems.length === 0 ? (
                  <div className="text-center py-16 text-slate-350 text-xs leading-relaxed select-none">
                     No presets saved yet. Apply stamp/sign to save.
                  </div>
                ) : (
                  savedItems.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => {
                        const size = item.type === "stamp" ? 170 : 250;
                        const height = item.type === "stamp" ? 170 : 100;
                        onSave({ type: "image", value: item.dataUrl, width: size, height });
                        onClose();
                      }}
                      className="group relative cursor-pointer border border-slate-205 hover:border-teal-500 rounded-xl bg-white p-2.5 flex items-center justify-center shadow-xs transition hover:shadow-md"
                    >
                      <img src={item.dataUrl} className="max-h-16 object-contain" alt="saved signature" />
                      <button 
                        onClick={(e) => deleteStoredItem(item.id, e)}
                        className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 w-6 h-6 flex items-center justify-center hover:scale-110 transition active:scale-95 shadow-md z-30"
                        title="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                )}
             </div>
          </div>

          {/* Builder Panel */}
          <div className="flex-1 flex flex-col p-8 min-h-0 bg-white">
            
            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-100 pb-3 mb-6 shrink-0">
              {[
                { id: "type", label: "Type Mode", icon: Type },
                { id: "draw", label: "Drawing Pad", icon: Edit3 },
                { id: "upload", label: "Upload Image", icon: ImageIcon },
                { id: "stamp", label: "Stamp Generator", icon: Award }
              ].map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${isSelected ? "bg-teal-50 text-teal-700 border border-teal-100/60 shadow-xs" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Container Body */}
            <div className="flex-grow min-h-[260px] overflow-y-auto pr-1">

              {activeTab === "type" && (
                <div className="space-y-6 flex flex-col">
                  <div className="grid grid-cols-3 gap-4 items-end">
                    <div className="col-span-2">
                       <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-2">Type your signature name</label>
                      <input 
                        type="text" 
                        placeholder="Enter full name (e.g. DocIntel)..."
                        maxLength={26}
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        className="w-full bg-slate-50 hover:bg-slate-100/60 hover:border-slate-350 font-bold border border-slate-205 rounded-xl px-5 py-4 text-black focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-sm"
                      />
                    </div>
                    <div>
                       <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-2">Sign initials</label>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          maxLength={4}
                          value={typedInitials}
                          onChange={(e) => setTypedInitials(e.target.value.toUpperCase())}
                          className="w-full bg-slate-50 hover:bg-slate-100/60 hover:border-slate-350 text-center font-black border border-slate-205 rounded-xl px-3 py-4 text-black focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-sm"
                          placeholder="e.g. DI"
                        />
                        <button
                          type="button"
                          onClick={() => setUseInitials(!useInitials)}
                          className={`px-3 py-2 border rounded-xl font-bold text-xs truncate transition ${useInitials ? "bg-teal-600 text-white border-teal-650" : "bg-white text-slate-650 border-slate-200 hover:bg-slate-50"}`}
                        >
                          Use Custom Initials
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Cursive Styles Preview Box */}
                  <div className="border border-slate-150 rounded-2xl p-6 bg-slate-50/40 relative">
                    <span className="text-[9px] font-black uppercase text-slate-400 bg-white border border-slate-150 px-2 py-0.5 rounded-full absolute top-3 left-3 select-none">
                      Preview signature: {useInitials ? "Initials" : "Full Name"}
                    </span>
                    <div className="h-28 flex items-center justify-center overflow-hidden">
                      <span 
                        style={{ color: inkColor }}
                        className={`${selectedFont} text-5xl transition-all duration-305`}
                      >
                        {useInitials ? (typedInitials || "DI") : (typedName || "DocIntel")}
                      </span>
                    </div>
                  </div>

                  {/* Primary Tab-level Apply Button - Visible Immediately */}
                  <div className="flex justify-between items-center bg-teal-50/20 border border-teal-150/40 p-4 rounded-2xl shadow-xs">
                    <span className="text-[11px] text-slate-650 font-semibold select-none">Selected style: <strong className="text-teal-700 uppercase font-black">{selectedFont.replace("font-", "")}</strong></span>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="px-6 py-2.5 bg-slate-900 border border-slate-950 text-white font-extrabold rounded-xl text-xs hover:bg-slate-800 transition active:scale-95 shadow-md flex items-center gap-1.5"
                    >
                      Apply Signature to PDF
                    </button>
                  </div>

                  {/* 10 Columns Fonts Grid Selector */}
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-3">Choose Handwriting Style Font</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {[
                        { id: "font-sacramento", font: "Sacramento Script", display: "font-sacramento" },
                        { id: "font-vibes", font: "Great Vibes Calligraphy", display: "font-vibes" },
                        { id: "font-pacifico", font: "Pacifico Ink", display: "font-pacifico" },
                        { id: "font-dancing", font: "Dancing Bouncy", display: "font-dancing" },
                        { id: "font-playfair", font: "Playfair Italic", display: "font-playfair" },
                        { id: "font-poppins", font: "Poppins Bold", display: "font-poppins" },
                        { id: "font-montserrat", font: "Montserrat XBold", display: "font-montserrat" },
                        { id: "font-merriweather", font: "Merriweather Italic", display: "font-merriweather" },
                        { id: "font-serif", font: "Times Serif Italic", display: "font-serif" },
                        { id: "font-sans", font: "Helvetica Sans Bold", display: "font-sans" }
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedFont(item.id)}
                          className={`border rounded-xl p-2.5 text-center transition-all bg-white hover:border-slate-400 ${selectedFont === item.id ? "border-teal-500 bg-teal-50/10 shadow-xs" : "border-slate-200"}`}
                        >
                          <span className={`${item.display} text-[21px] truncate block text-slate-800 px-1`}>
                            {useInitials ? (typedInitials || "DI") : (typedName || "Sign")}
                          </span>
                          <span className="text-[9px] font-black text-slate-400 mt-1 block truncate">{item.font}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "draw" && (
                <div className="space-y-4 flex flex-col h-full">
                  <div className="flex-1 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/30 overflow-hidden relative min-h-[220px]">
                    <canvas
                      ref={drawCanvasRef}
                      width={1200}
                      height={440}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="w-full h-full cursor-crosshair block"
                    />
                    <button 
                      onClick={clearDrawPad}
                      className="absolute bottom-4 right-4 bg-slate-900 border border-slate-950 text-white font-bold px-4 py-2 text-xs rounded-xl shadow hover:bg-slate-800 transition active:scale-95 z-20"
                    >
                      Clear Pad
                    </button>
                  </div>
                  <div className="flex justify-between items-center gap-3">
                    <p className="text-[11px] font-medium text-slate-400">- Use your mouse pointer or touch panel to draw signatures -</p>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="px-6 py-2.5 bg-slate-900 border border-slate-950 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition active:scale-95 shadow-md"
                    >
                      Apply Signature to PDF
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "upload" && (
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-slate-200 rounded-3xl p-10 flex flex-col items-center justify-center text-center bg-slate-50/30 relative">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleUploadedImage}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="bg-white p-4 rounded-2xl shadow mb-3">
                       <ImageIcon className="w-10 h-10 text-teal-650" />
                    </div>
                    <h4 className="font-bold text-slate-700 text-sm mb-1">Select signature image</h4>
                    <p className="text-slate-405 text-[11px] mb-4">Supports PNG & JPG transparent signature templates</p>
                    <button className="bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 rounded-xl font-bold text-xs pointer-events-none">
                      Browse File
                    </button>
                  </div>

                  {uploadedFileUrl && (
                    <div className="border border-slate-150 rounded-2xl p-4 bg-slate-50/40 flex items-center justify-center max-h-28 overflow-hidden">
                       <img src={uploadedFileUrl} className="max-h-24 object-contain" alt="uploaded signature preview" />
                    </div>
                  )}

                  <div className="flex justify-end mt-4">
                    <button
                      type="button"
                      onClick={handleApply}
                      className="px-6 py-2.5 bg-slate-900 border border-slate-950 text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition active:scale-95 shadow-md"
                    >
                      Apply Image to PDF
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "stamp" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start min-h-0">
                  {/* Left input fields */}
                  <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                    
                    <div className="grid grid-cols-2 gap-2">
                       <button 
                         onClick={() => setStampType("round")} 
                         className={`px-3 py-2 border font-bold text-xs rounded-xl transition ${stampType === "round" ? "border-teal-500 bg-teal-50/20 text-teal-650" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                       >
                         Circular Seal
                       </button>
                       <button 
                         onClick={() => setStampType("rect")} 
                         className={`px-3 py-2 border font-bold text-xs rounded-xl transition ${stampType === "rect" ? "border-teal-500 bg-teal-50/20 text-teal-650" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                       >
                         Rectangular Stamp
                       </button>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">Company / Organization name</label>
                      <input 
                        type="text" 
                        maxLength={28}
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full bg-slate-50 hover:bg-slate-100/60 hover:border-slate-350 font-bold border border-slate-205 rounded-lg px-3 py-2 text-xs text-black outline-none focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                        placeholder="Company Name..."
                      />
                    </div>

                    {stampType === "round" && (
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">Bottom Sub-text / Location</label>
                        <input 
                          type="text" 
                          maxLength={28}
                          value={subText}
                          onChange={(e) => setSubText(e.target.value)}
                          className="w-full bg-slate-50 hover:bg-slate-100/60 hover:border-slate-350 font-bold border border-slate-205 rounded-lg px-3 py-2 text-xs text-black outline-none focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all font-semibold"
                          placeholder="Subtext / Date..."
                        />
                      </div>
                    )}

                    {stampType === "rect" && (
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">Custom Stamp Date</label>
                        <input 
                          type="date"
                          value={stampDate}
                          onChange={(e) => setStampDate(e.target.value)}
                          className="w-full bg-slate-50 hover:bg-slate-100/60 hover:border-slate-350 font-bold border border-slate-205 rounded-lg px-3 py-2 text-xs text-black outline-none focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all font-semibold"
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-1">Center initials / Text</label>
                      <input 
                        type="text" 
                        maxLength={13}
                        value={centerText}
                        onChange={(e) => setCenterText(e.target.value)}
                        className="w-full bg-slate-50 hover:bg-slate-100/60 hover:border-slate-350 font-bold border border-slate-205 rounded-lg px-3 py-2 text-xs text-black outline-none focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                        placeholder="e.g. APPROVED, KB, NS..."
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-2 font-bold">Quick Status Presets</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCenterText("APPROVED");
                            setStampColor("#0b6623");
                          }}
                          className="px-3 py-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 rounded-full text-[10px] font-black uppercase transition-all shadow-xs active:scale-95 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          Approved
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCenterText("REJECTED");
                            setStampColor("#d62246");
                          }}
                          className="px-3 py-1.5 text-red-800 bg-red-50 hover:bg-red-100/80 border border-red-200 rounded-full text-[10px] font-black uppercase transition-all shadow-xs active:scale-95 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                          Rejected
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCenterText("PENDING");
                            setStampColor("#f26419");
                          }}
                          className="px-3 py-1.5 text-amber-800 bg-amber-50 hover:bg-amber-100/80 border border-amber-200 rounded-full text-[10px] font-black uppercase transition-all shadow-xs active:scale-95 flex items-center gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Pending
                        </button>
                      </div>
                    </div>

                    {/* Custom Color Selector */}
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-600 block mb-2">Stamp Color Theme (presets & custom color)</label>
                      <div className="flex flex-wrap gap-2.5 items-center">
                        {[
                          { value: "#0f4c81", label: "Royal Blue" },
                          { value: "#d62246", label: "Crimson Red" },
                          { value: "#0b6623", label: "Jade Green" },
                          { value: "#1a1a1a", label: "Pitch Black" },
                          { value: "#f26419", label: "Amber Orange" },
                          { value: "#5a3e85", label: "Royal Purple" }
                        ].map((color) => (
                          <button
                            key={color.value}
                            onClick={() => setStampColor(color.value)}
                            style={{ backgroundColor: color.value }}
                            className={`w-7 h-7 rounded-lg transition-transform ${stampColor === color.value ? "scale-115 border-2 border-white ring-2 ring-teal-500" : "hover:scale-105"}`}
                            title={color.label}
                          />
                        ))}
                        
                        {/* Native RGB custom color input */}
                        <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl p-1 bg-slate-50 shadow-xs hover:border-slate-350 transition">
                          <input 
                            type="color" 
                            value={stampColor}
                            onChange={(e) => setStampColor(e.target.value)}
                            className="w-7 h-7 border-0 rounded-lg cursor-pointer p-0 bg-transparent"
                            title="Choose Custom Color"
                          />
                          <span className="text-[9px] font-black text-slate-550 uppercase pr-1.5 select-none">{stampColor}</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Right Live Preview */}
                  <div className="flex flex-col items-center justify-center border border-slate-150 bg-slate-50/50 rounded-2xl p-4 min-h-[300px] shrink-0">
                    <div className="bg-white p-2 rounded-xl shadow-sm border border-slate-100 flex items-center justify-center max-w-[280px]">
                      <canvas
                        ref={stampCanvasRef}
                        width={300}
                        height={300}
                        className="w-56 h-56 max-w-full block"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 mt-3 select-none mb-3">Live Stamp Seal Preview</span>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="px-6 py-2.5 bg-slate-900 border border-slate-950 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition active:scale-95 shadow-md w-full max-w-[200px]"
                    >
                      Apply Stamp to PDF
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Action Bar */}
            <div className="pt-6 border-t border-slate-100 mt-6 shrink-0 flex items-center justify-between">
              
              {/* Color pickers for Type / Draw tab */}
              {(activeTab === "type" || activeTab === "draw") ? (
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase select-none">Ink Color Options:</span>
                  {[
                    { value: "#0f172a", name: "Black" },
                    { value: "#1d4ed8", name: "Blue" },
                    { value: "#dc2626", name: "Red" }
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setInkColor(preset.value)}
                      style={{ backgroundColor: preset.value }}
                      className={`w-6 h-6 rounded-full border border-white ring-offset-1 transition ${inkColor === preset.value ? "ring-2 ring-teal-500 scale-110" : "hover:scale-105"}`}
                      title={preset.name}
                    />
                  ))}
                  
                  {/* Custom color input for handwriting ink */}
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                    <input 
                      type="color" 
                      value={inkColor}
                      onChange={(e) => setInkColor(e.target.value)}
                      className="w-5 h-5 border-0 rounded cursor-pointer p-0 bg-transparent"
                      title="Custom Ink Color"
                    />
                  </div>
                </div>
              ) : <div />}

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-5 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="px-8 py-3 bg-slate-900 border border-slate-950 text-white rounded-xl font-black text-xs hover:bg-slate-800 transition active:scale-95 shadow-md flex items-center gap-1.5"
                >
                  {activeTab === "stamp" 
                    ? "Apply Stamp" 
                    : activeTab === "upload" 
                    ? "Apply Image" 
                    : "Apply Signature"}
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>,
    document.body
  );
}
