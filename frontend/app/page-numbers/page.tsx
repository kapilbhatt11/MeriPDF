"use client";

import { useState, useEffect } from "react";
import { 
  UploadCloud, 
  FileType, 
  Hash, 
  X, 
  Download, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Settings2, 
  Type, 
  Palette, 
  FileDigit,
  ALargeSmall
} from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import { logPDFOperation } from "@/lib/analytics";

/** Helper to format numbers for preview */
const formatPreview = (n: number, m: number, style: string, format: string) => {
    let n_str = n.toString();
    let m_str = m.toString();

    const toRoman = (num: number) => {
        if (num <= 0) return num.toString();
        const val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
        const syb = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
        let res = "";
        for (let i = 0; num > 0; i++) {
            while (num >= val[i]) { res += syb[i]; num -= val[i]; }
        }
        return res;
    };

    const toDevanagari = (num: number) => {
        const dev = "०१२३४५६७८९";
        return num.toString().split('').map(d => dev[parseInt(d)]).join('');
    };

    const toWords = (num: number) => {
        const d: any = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' };
        return d[num] || num.toString();
    };

    if (style === "Roman-Upper") { n_str = toRoman(n); m_str = toRoman(m); }
    else if (style === "Roman-Lower") { n_str = toRoman(n).toLowerCase(); m_str = toRoman(m).toLowerCase(); }
    else if (style === "Alpha-Upper") { n_str = String.fromCharCode(64 + n); m_str = String.fromCharCode(64 + m); }
    else if (style === "Words") { n_str = toWords(n); m_str = toWords(m); }
    else if (style === "Devanagari") { n_str = toDevanagari(n); m_str = toDevanagari(m); }

    return format.replace("{n}", n_str).replace("{m}", m_str);
};

export default function PageNumbersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [format, setFormat] = useState("Page {n} of {m}");
  const [position, setPosition] = useState("bottom-center");
  const [startNumber, setStartNumber] = useState(1);
  const [numberStyle, setNumberStyle] = useState("Arabic");
  const [color, setColor] = useState("#f59e0b");
  const [fontSize, setFontSize] = useState(12);
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

  // Generate preview image
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
            const page = await pdf.getPage(1);
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
  }, [file, pdfReady, pdfjsLib]);

  const handleUploadClick = async () => {
    if (!file) return toast.error("Please upload a PDF first.");

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("format", format);
    formData.append("position", position);
    formData.append("start_number", startNumber.toString());
    formData.append("number_style", numberStyle);
    formData.append("color", color);
    formData.append("font_size", fontSize.toString());

    try {
      const res = await fetchWithAuth(api("/pdf/page-numbers"), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to add page numbers.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `DocIntel_Numbered.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      logPDFOperation("Page Numbers", 1);
      toast.success("Page numbers added successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error adding numbers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const PositionBtn = ({ pos, label, icon: Icon }: { pos: string, label: string, icon: any }) => (
     <button
        onClick={() => setPosition(pos)}
        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all font-bold group ${
            position === pos 
            ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm" 
            : "border-slate-100 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50/30"
        }`}
     >
        <Icon size={20} className={`mb-1 ${position === pos ? "text-amber-600" : "text-slate-300 group-hover:text-amber-400"}`} />
        <span className="text-[10px] uppercase tracking-tighter">{label.replace("Bottom ", "").replace("Top ", "")}</span>
     </button>
  );

  const StyleOption = ({ style, label, sample }: { style: string, label: string, sample: string }) => (
      <button
        onClick={() => setNumberStyle(style)}
        className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${
            numberStyle === style 
            ? "border-amber-500 bg-amber-50 shadow-inner" 
            : "border-slate-100 bg-white hover:border-slate-200"
        }`}
      >
          <span className={`text-2xl font-black ${numberStyle === style ? "text-amber-600" : "text-slate-400"}`}>{sample}</span>
          <span className={`text-[10px] font-bold uppercase tracking-tight ${numberStyle === style ? "text-amber-700" : "text-slate-500"}`}>{label}</span>
      </button>
  );

  return (
    <RequireAuth>
      <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 flex flex-col items-center">
        
        <div className="max-w-6xl w-full">
          {/* Header Section */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-8 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none"></div>
                <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
                    <div className="bg-white/20 p-5 rounded-2xl backdrop-blur-md shadow-xl border border-white/30">
                        <Hash size={42} className="text-white" />
                    </div>
                    <div className="text-center md:text-left">
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2">Automated Page Stamping</h1>
                        <p className="text-orange-50/80 font-medium">Professional document numbering with custom styles, fonts, and regions.</p>
                    </div>
                </div>
            </div>

            <div className="p-8">
              {!file ? (
                <label className="group relative border-2 border-dashed border-slate-200 rounded-[2.5rem] p-24 flex flex-col items-center justify-center cursor-pointer transition-all hover:border-amber-300 hover:bg-amber-50/30 overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-100/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="bg-amber-100/50 p-8 rounded-3xl text-amber-600 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 mb-6">
                    <UploadCloud size={64} />
                  </div>
                  <h2 className="text-3xl font-black text-slate-800 mb-2">Drop PDF Here</h2>
                  <p className="text-slate-500 font-medium text-lg">or click to browse your storage</p>
                  <input type="file" accept="application/pdf" className="hidden" onChange={(e) => {
                      if(e.target.files && e.target.files[0]) setFile(e.target.files[0]);
                  }} />
                </label>
              ) : (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {/* File Info Bar */}
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-4 md:p-6">
                     <div className="flex items-center gap-4">
                        <div className="p-4 bg-white rounded-xl shadow-sm text-amber-600 border border-slate-100">
                          <FileType size={32} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 text-lg leading-tight">{file.name}</p>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{(file.size / 1024 / 1024).toFixed(2)} MB • Ready to Stamp</p>
                        </div>
                     </div>
                     <button onClick={() => setFile(null)} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all shadow-sm">
                       <X size={20} />
                     </button>
                  </div>

                  <div className="grid lg:grid-cols-12 gap-8 items-start">
                     {/* Settings Panel */}
                     <div className="lg:col-span-7 space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Format & Style */}
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-6 text-slate-800">
                                    <Settings2 size={20} className="text-amber-500" />
                                    <h3 className="font-black uppercase text-xs tracking-widest">Numbering Engine</h3>
                                </div>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Format Pattern</label>
                                        <select 
                                            value={format}
                                            onChange={(e) => setFormat(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
                                        >
                                            <option value="Page {n} of {m}">Page 1 of 5</option>
                                            <option value="Page {n}">Page 1</option>
                                            <option value="{n} / {m}">1 / 5</option>
                                            <option value="{n}">1</option>
                                            <option value="- {n} -">- 1 -</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Starting At</label>
                                        <div className="relative">
                                            <FileDigit className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input 
                                                type="number" 
                                                min="1"
                                                value={startNumber}
                                                onChange={(e) => setStartNumber(parseInt(e.target.value) || 1)}
                                                className="w-full bg-slate-50 border border-slate-200 py-3 pl-10 pr-4 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Appearance */}
                            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                                <div className="flex items-center gap-2 mb-6 text-slate-800">
                                    <Palette size={20} className="text-amber-500" />
                                    <h3 className="font-black uppercase text-xs tracking-widest">Visual Style</h3>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Font Size: {fontSize}px</label>
                                        <input 
                                            type="range" min="8" max="36" 
                                            value={fontSize}
                                            onChange={(e) => setFontSize(parseInt(e.target.value))}
                                            className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2 ml-1">Stamping Color</label>
                                        <div className="flex items-center gap-3">
                                            <label 
                                                className="w-12 h-12 rounded-full border-2 border-slate-200 shadow-sm transition-transform hover:scale-105 cursor-pointer shrink-0" 
                                                style={{ backgroundColor: color }}
                                            >
                                                <input 
                                                    type="color"
                                                    value={color}
                                                    onChange={(e) => setColor(e.target.value)}
                                                    className="opacity-0 w-0 h-0 absolute overflow-hidden"
                                                />
                                            </label>
                                            <input 
                                                type="text"
                                                value={color}
                                                onChange={(e) => setColor(e.target.value)}
                                                className="flex-1 min-w-0 bg-slate-50 border border-slate-200 py-3 px-4 rounded-xl font-mono font-bold text-slate-700 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Numbering Style Grid */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-6 text-slate-800">
                                <ALargeSmall size={20} className="text-amber-500" />
                                <h3 className="font-black uppercase text-xs tracking-widest">Script & Notation</h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <StyleOption style="Arabic" label="Arabic" sample="1" />
                                <StyleOption style="Devanagari" label="Devnagri" sample="१" />
                                <StyleOption style="Roman-Upper" label="Roman" sample="I" />
                                <StyleOption style="Alpha-Upper" label="Alpha" sample="A" />
                                <StyleOption style="Words" label="Words" sample="One" />
                            </div>
                        </div>

                        {/* Alignment Grid */}
                        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 text-slate-800">
                                <AlignLeft size={20} className="text-amber-500" />
                                <h3 className="font-black uppercase text-xs tracking-widest">Alignment & Margin</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <p className="text-[10px] font-black text-slate-300 uppercase text-center tracking-widest">Header Region</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <PositionBtn pos="top-left" label="Top Left" icon={AlignLeft} />
                                        <PositionBtn pos="top-center" label="Top Center" icon={AlignCenter} />
                                        <PositionBtn pos="top-right" label="Top Right" icon={AlignRight} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-[10px] font-black text-slate-300 uppercase text-center tracking-widest">Footer Region</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        <PositionBtn pos="bottom-left" label="Bottom Left" icon={AlignLeft} />
                                        <PositionBtn pos="bottom-center" label="Bottom Center" icon={AlignCenter} />
                                        <PositionBtn pos="bottom-right" label="Bottom Right" icon={AlignRight} />
                                    </div>
                                </div>
                            </div>
                        </div>
                     </div>

                     {/* Right Panel: Live Preview */}
                     <div className="lg:col-span-5 sticky top-8">
                        <div className="bg-slate-900 rounded-[2.5rem] p-4 shadow-2xl relative border-8 border-slate-800">
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-1 bg-slate-700 rounded-full"></div>
                            
                            <div className="mt-6 bg-white aspect-[1/1.41] w-full rounded-2xl relative overflow-hidden shadow-inner flex flex-col pointer-events-none select-none">
                                {/* Mock Page Content */}
                                {previewImage ? (
                                    <img src={previewImage} className="w-full h-full object-contain mix-blend-multiply" alt="Preview Thumbnail" />
                                ) : (
                                    <div className="space-y-3 opacity-[0.08] p-8">
                                        <div className="h-4 bg-slate-900 rounded-full w-3/4"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-full"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-5/6"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-full"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-2/3 mt-8"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-full"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-4/5"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-full"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-full"></div>
                                        <div className="h-4 bg-slate-900 rounded-full w-1/2"></div>
                                    </div>
                                )}

                                {/* Dynamic Page Number Overlay */}
                                <div 
                                    className="absolute transition-all duration-300 font-bold pointer-events-none"
                                    style={{ 
                                        color: color, 
                                        fontSize: `${fontSize + 4}px`,
                                        ...(position.includes('top') ? { top: '30px' } : { bottom: '30px' }),
                                        ...(position.includes('left') ? { left: '30px' } : position.includes('right') ? { right: '30px' } : { left: '50%', transform: 'translateX(-50%)' })
                                    }}
                                >
                                    {formatPreview(startNumber, 5, numberStyle, format)}
                                </div>
                            </div>

                            <div className="mt-6 p-2">
                                <button
                                    onClick={handleUploadClick}
                                    disabled={loading}
                                    className="w-full bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black py-4 px-8 rounded-2xl shadow-xl shadow-amber-500/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 text-lg"
                                >
                                    {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        <span>Applying...</span>
                                    </>
                                    ) : (
                                    <>
                                        <Download size={22} className="stroke-[3]" /> 
                                        <span>Download Document</span>
                                    </>
                                    )}
                                </button>
                            </div>
                        </div>
                        <p className="mt-6 text-center text-slate-400 font-bold text-xs uppercase tracking-[0.2em]">Real-time Layout Preview</p>
                     </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
