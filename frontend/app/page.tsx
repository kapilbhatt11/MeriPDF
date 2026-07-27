"use client";
import React, { useState } from "react";
import Link from "next/link";
import { 
  FileText, FilePlus, FileMinus, Search, Shield, FileLock2, Unlock, Layers, Trash2, 
  FileSearch, Smartphone, Settings, Zap, Languages, CheckSquare, EyeOff, Crop, RefreshCw, Hash, FileImage, PenTool, LayoutTemplate, CopyPlus, Gift
} from "lucide-react";
import Footer from "../components/Footer";  // ✅ Footer local components me se import karo

interface ToolItem {
  id: string;
  name: string;
  synonym: string;
  desc: string;
  link: string;
  icon: React.ElementType;
  isReady: boolean;
  color: string;
}

interface Category {
  title: string;
  items: ToolItem[];
}

const toolsData: Category[] = [
  {
    title: "Organize PDF",
    items: [
      { id: "merge", name: "Merge PDF", synonym: "Combine files", desc: "Combine PDFs in the order you want with the easiest PDF merger available.", link: "/merge-pdf", icon: Layers, isReady: true, color: "text-purple-600 bg-purple-100" },
      { id: "split", name: "Split PDF", synonym: "Extract pages", desc: "Separate one page or a whole set for easy conversion into independent PDF files.", link: "/split-pdf", icon: SplitIcon, isReady: true, color: "text-blue-600 bg-blue-100" },
      { id: "remove", name: "Remove Pages", synonym: "Delete pages", desc: "Remove unwanted pages from a PDF.", link: "/remove-pages", icon: Trash2, isReady: true, color: "text-red-600 bg-red-100" },
      { id: "extract", name: "Extract Pages", synonym: "Pull pages", desc: "Get a new document containing only the desired pages.", link: "/extract-pages", icon: FileSearch, isReady: true, color: "text-emerald-600 bg-emerald-100" },
      { id: "organize", name: "Organize PDF", synonym: "Sort pages", desc: "Sort, add and delete PDF pages. Drag and drop the page thumbnails at your will.", link: "/organize-pdf", icon: LayoutTemplate, isReady: true, color: "text-indigo-600 bg-indigo-100" },
      { id: "scan", name: "Scan to PDF", synonym: "Mobile scan", desc: "Capture document scans from your mobile device instantly into PDF.", link: "/scan-pdf", icon: Smartphone, isReady: true, color: "text-blue-600 bg-blue-100" }
    ]
  },
  {
    title: "Optimize PDF",
    items: [
      { id: "compress", name: "Compress PDF", synonym: "Reduce size", desc: "Reduce file size while optimizing for maximal PDF quality.", link: "/compress", icon: FileMinus, isReady: true, color: "text-green-600 bg-green-100" },
      { id: "repair", name: "Repair PDF", synonym: "Fix PDF", desc: "Repair a damaged or corrupted PDF document.", link: "/repair-pdf", icon: Settings, isReady: true, color: "text-emerald-600 bg-emerald-100" },
      { id: "ocr", name: "OCR PDF", synonym: "Extract Text", desc: "Make scanned text selectable and extractable using Optical Character Recognition.", link: "/upload", icon: Zap, isReady: true, color: "text-rose-600 bg-rose-100" }
    ]
  },
  {
    title: "Convert to PDF",
    items: [
      { id: "jpg-to-pdf", name: "JPG to PDF", synonym: "Image to PDF", desc: "Convert JPG/PNG images to PDF in seconds.", link: "/image-to-pdf", icon: FileImage, isReady: true, color: "text-indigo-600 bg-indigo-100" },
      { id: "word-to-pdf", name: "WORD to PDF", synonym: "DOC to PDF", desc: "Make DOC and DOCX files easy to read by converting them to PDF.", link: "/word-to-pdf", icon: FilePlus, isReady: true, color: "text-blue-700 bg-blue-100" },

      { id: "ppt-to-pdf", name: "POWERPOINT to PDF", synonym: "PPT to PDF", desc: "Make PPT and PPTX slideshows easy to view by converting them to PDF.", link: "/ppt-to-pdf", icon: LayoutTemplate, isReady: true, color: "text-orange-600 bg-orange-100" },
      { id: "excel-to-pdf", name: "EXCEL to PDF", synonym: "XLS to PDF", desc: "Make EXCEL spreadsheets easy to read by converting them to PDF.", link: "/excel-to-pdf", icon: CopyPlus, isReady: true, color: "text-green-600 bg-green-100" },
      { id: "html-to-pdf", name: "HTML to PDF", synonym: "Web to PDF", desc: "Convert webpages in HTML to PDF.", link: "/html-to-pdf", icon: FileText, isReady: true, color: "text-blue-600 bg-blue-100" }
    ]
  },
  {
    title: "Convert from PDF",
    items: [
      { id: "pdf-to-jpg", name: "PDF to JPG", synonym: "Extract images", desc: "Convert each PDF page into a JPG or extract all images contained.", link: "/pdf-to-jpg", icon: FileImage, isReady: true, color: "text-amber-600 bg-amber-100" },
      { id: "pdf-to-word", name: "PDF to WORD", synonym: "PDF to DOCX", desc: "Easily convert your PDF files into easy to edit DOC and DOCX documents.", link: "/pdf-to-word", icon: FileText, isReady: true, color: "text-blue-600 bg-blue-100" },
      { id: "pdf-to-ppt", name: "PDF to POWERPOINT", synonym: "PDF to PPT", desc: "Turn your PDF files into easy to edit PPT and PPTX slideshows.", link: "/pdf-to-ppt", icon: LayoutTemplate, isReady: true, color: "text-orange-600 bg-orange-100" },
      { id: "pdf-to-excel", name: "PDF to EXCEL", synonym: "Extract data", desc: "Pull data straight from PDFs into EXCEL spreadsheets in a few short seconds.", link: "/pdf-to-excel", icon: CopyPlus, isReady: true, color: "text-green-600 bg-green-100" },
      { id: "pdf-to-pdfa", name: "PDF to PDF/A", synonym: "Archive PDF", desc: "Convert your PDF to PDF/A for archiving and long-term preservation.", link: "/pdf-to-pdfa", icon: FileMinus, isReady: true, color: "text-purple-600 bg-purple-100" }
    ]
  },
  {
    title: "Edit PDF",
    items: [
      { id: "watermark", name: "Add Watermark", synonym: "Protect/Brand", desc: "Choose an image or text to stamp over your PDF.", link: "/watermark-pdf", icon: Hash, isReady: true, color: "text-amber-600 bg-amber-100" },
      { id: "rotate", name: "Rotate PDF", synonym: "Turn pages", desc: "Rotate your PDFs the way you need them.", link: "/rotate-pdf", icon: RefreshCw, isReady: true, color: "text-cyan-600 bg-cyan-100" },
      { id: "page-numbers", name: "Add Page Numbers", synonym: "Numbering", desc: "Add page numbers into PDFs with ease.", link: "/page-numbers", icon: Hash, isReady: true, color: "text-amber-600 bg-amber-100" },
      { id: "crop", name: "Crop PDF", synonym: "Trim margins", desc: "Crop PDF margins and select the exact area you want.", link: "/crop-pdf", icon: Crop, isReady: true, color: "text-green-600 bg-green-100" },
      { id: "edit", name: "Edit PDF", synonym: "Add text", desc: "Add text, images, shapes or freehand annotations to a PDF.", link: "/edit-pdf", icon: PenTool, isReady: true, color: "text-indigo-600 bg-indigo-100" }
    ]
  },
  {
    title: "PDF Security",
    items: [
      { id: "protect", name: "Protect PDF", synonym: "Lock PDF", desc: "Encrypt your PDF with a password to prevent unauthorized access.", link: "/protect-pdf", icon: FileLock2, isReady: true, color: "text-red-600 bg-red-100" },
      { id: "unlock", name: "Unlock PDF", synonym: "Remove password", desc: "Remove PDF password security, giving you the freedom to use your PDFs.", link: "/unlock-pdf", icon: Unlock, isReady: true, color: "text-emerald-600 bg-emerald-100" },
      { id: "sign", name: "Sign PDF", synonym: "E-Signature", desc: "Signature your document easily.", link: "/sign-pdf", icon: PenTool, isReady: true, color: "text-teal-600 bg-teal-100" },
      { id: "redact", name: "Redact PDF", synonym: "Blackout text", desc: "Permanently blackout sensitive information to keep it secure.", link: "/redact-pdf", icon: EyeOff, isReady: true, color: "text-rose-600 bg-rose-100" },
      { id: "compare", name: "Compare PDF", synonym: "Diff PDF", desc: "Side by side PDF comparison to easily spot changes.", link: "/compare-pdf", icon: CheckSquare, isReady: true, color: "text-indigo-650 bg-indigo-100" }
    ]
  },
  {
    title: "PDF Intelligence (AI)",
    items: [
      { id: "summarizer", name: "AI Summarizer", synonym: "Auto-Read", desc: "Get instant smart summaries of long PDFs using AI.", link: "#", icon: Zap, isReady: false, color: "text-slate-400 bg-slate-100" },
      { id: "translate", name: "Translate PDF", synonym: "Language shift", desc: "Translate your documents while retaining layout.", link: "#", icon: Languages, isReady: false, color: "text-slate-400 bg-slate-100" }
    ]
  }
];

function SplitIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"></path>
      <path d="M14 2v4a2 2 0 0 0 2 2h4"></path>
      <path d="M9 13v6"></path>
      <path d="m11 17-2 2-2-2"></path>
    </svg>
  );
}

export default function HomePage() {
  const [search, setSearch] = useState("");

  const filteredCategories = toolsData.map(cat => ({
    ...cat,
    items: cat.items.filter(item => 
      item.name.toLowerCase().includes(search.toLowerCase()) || 
      item.synonym.toLowerCase().includes(search.toLowerCase()) ||
      item.desc.toLowerCase().includes(search.toLowerCase())
    )
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-blue-200">
      {/* Premium Hero Section */}
      <div className="bg-slate-955 bg-slate-950 text-white pt-16 pb-24 px-6 text-center relative overflow-hidden">
        {/* Decorative background grid and gradients */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none"></div>
        <div className="absolute top-0 right-0 -mt-20 -mr-20 w-[400px] h-[400px] bg-orange-600 rounded-full blur-3xl opacity-10 pointer-events-none"></div>
        <div className="absolute top-0 left-0 mt-10 ml-10 w-[350px] h-[350px] bg-amber-500 rounded-full blur-3xl opacity-10 pointer-events-none"></div>

        <div className="max-w-4xl mx-auto relative z-10 space-y-6">
          {/* Animated Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-orange-500/30 bg-orange-500/5 text-orange-400 font-bold text-xs uppercase tracking-wide animate-pulse">
            <Shield className="w-3.5 h-3.5" /> 100% Free & Privacy-First PDF Toolkit
          </div>

          {/* Heading */}
          <h1 className="text-4xl md:text-6xl font-black mb-4 tracking-tight leading-none text-slate-100">
            MeriPDF <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 bg-clip-text text-transparent">All-In-One</span> PDF Tools
          </h1>

          {/* Subtitle */}
          <p className="text-sm md:text-lg text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Every tool you need to merge, split, compress, and edit PDF documents in seconds. Crafted with maximum local security — we never store/read your files.
          </p>

          {/* Search bar */}
          <div className="max-w-xl mx-auto relative group mt-8">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full blur-md opacity-25 group-focus-within:opacity-50 transition-opacity duration-300 pointer-events-none"></div>
            <div className="relative">
              <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors duration-200 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Search for a utility... (e.g., Merge, Word to PDF, Compress, OCR)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-800 text-white rounded-full py-4 pl-12 pr-6 outline-none focus:border-orange-500/85 shadow-2xl backdrop-blur-md transition-all placeholder:text-slate-500 font-semibold focus:ring-1 focus:ring-orange-500/30 text-sm"
                suppressHydrationWarning={true}
              />
            </div>
          </div>

          {/* Quick Filter Tags */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-xs">
            <span className="text-slate-500 font-bold mr-1">Popular:</span>
            {["Merge PDF", "Compress PDF", "JPG to PDF", "OCR PDF"].map((tag) => (
              <button
                key={tag}
                type="button"
                suppressHydrationWarning={true}
                onClick={() => setSearch(tag === "OCR PDF" ? "OCR" : tag)}
                className="px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 hover:border-orange-500/50 hover:bg-orange-500/10 text-slate-405 text-slate-400 hover:text-orange-400 transition-all font-semibold cursor-pointer"
              >
                {tag}
              </button>
            ))}
            {search && (
              <button
                type="button"
                suppressHydrationWarning={true}
                onClick={() => setSearch("")}
                className="px-2.5 py-1.5 rounded-full bg-orange-600/10 border border-orange-500/30 text-orange-450 text-orange-400 font-bold hover:bg-orange-600/20 transition-all cursor-pointer"
              >
                Clear ×
              </button>
            )}
          </div>

          {/* 3 Main Benefits Cards in grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-10 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 p-3 bg-slate-900/40 border border-slate-900 rounded-2xl">
              <span className="p-2 bg-orange-500/10 text-orange-400 rounded-xl">
                 <Shield className="w-5 h-5" />
              </span>
              <div className="text-left">
                <p className="text-xs font-black text-slate-300">Privacy Guaranteed</p>
                <p className="text-[10px] text-slate-505 text-slate-500 font-semibold">100% secure, auto-delete</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-900/40 border border-slate-900 rounded-2xl">
              <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                 <Zap className="w-5 h-5" />
              </span>
              <div className="text-left">
                <p className="text-xs font-black text-slate-300">No Limits</p>
                <p className="text-[10px] text-slate-505 text-slate-500 font-semibold">No login required for guests</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-900/40 border border-slate-900 rounded-2xl">
              <span className="p-2 bg-yellow-500/10 text-yellow-405 text-yellow-400 rounded-xl">
                 <Zap className="w-5 h-5" />
              </span>
              <div className="text-left">
                <p className="text-xs font-black text-slate-300">Fast Conversion</p>
                <p className="text-[10px] text-slate-550 text-slate-555 text-slate-500 font-semibold">Lightning fast, high quality</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Grid Content */}
      <div className="max-w-7xl mx-auto px-6 pt-10 relative z-20 pb-20">
        
        {filteredCategories.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-16 text-center text-slate-500">
            <Search className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <h3 className="text-2xl font-bold text-slate-700 mb-2">No tools found</h3>
            <p>Try searching for a different keyword like "Compress" or "jpg".</p>
          </div>
        ) : (
          <div className="space-y-16">
            {filteredCategories.map((category, idx) => (
              <div key={idx} className="scroll-mt-24" id={category.title.toLowerCase().replace(/\s+/g, '-')}>
                <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                  <span className="bg-blue-600 w-2 h-8 rounded-full"></span>
                  {category.title}
                </h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-in fade-in duration-350">
                  {category.items.map(item => {
                    const Icon = item.icon;
                    return (
                      <Link 
                        key={item.id}
                        href={item.isReady ? item.link : "#"}
                        className={`group relative flex flex-col p-6 bg-white rounded-2xl shadow-sm border border-slate-200 transition-all duration-300 ${item.isReady ? 'hover:shadow-xl hover:-translate-y-1 hover:border-transparent' : 'opacity-80 cursor-default'}`}
                      >
                        {item.isReady && (
                           <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/0 via-transparent to-purple-500/0 group-hover:from-blue-500/5 group-hover:to-purple-500/5 pointer-events-none transition-colors duration-500"></div>
                        )}
                        
                        <div className="flex items-start justify-between mb-4">
                          <div className={`p-3 rounded-xl ${item.isReady ? item.color : 'bg-slate-100 text-slate-400'} transition-transform group-hover:scale-110 duration-300`}>
                            <Icon size={24} strokeWidth={item.isReady ? 2.5 : 2} />
                          </div>
                          {!item.isReady && (
                            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider backdrop-blur-none border border-amber-200">
                              Coming Soon
                            </span>
                          )}
                          {item.isReady && (
                            <span className="text-blue-600 bg-blue-50 border border-blue-100 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                              Try Now
                            </span>
                          )}
                        </div>
                        
                        <h3 className={`text-xl font-bold mb-1 ${item.isReady ? 'text-slate-900 group-hover:text-blue-600 transition-colors' : 'text-slate-600'}`}>
                          {item.name}
                        </h3>
                        <p className={`text-xs font-semibold mb-3 ${item.isReady ? 'text-blue-500/70' : 'text-slate-400'}`}>
                          {item.synonym}
                        </p>
                        <p className={`text-sm leading-relaxed ${item.isReady ? 'text-slate-600' : 'text-slate-400'}`}>
                          {item.desc}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Premium Contribution / Support Section */}
      <section className="max-w-6xl mx-auto px-6 mb-16 mt-8">
        <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-yellow-500/10 border border-amber-500/20 rounded-3xl p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-8 shadow-sm">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="space-y-4 max-w-2xl text-center md:text-left relative z-10">
            <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-800 font-bold px-3 py-1 rounded-full text-xs uppercase tracking-wider">
              <Gift className="w-3.5 h-3.5 justify-center" /> Support MeriPDF
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-800 leading-tight">
              Keep MeriPDF Free & Ad-Free!
            </h2>
            <p className="text-slate-600 text-sm md:text-base leading-relaxed">
              We build premium PDF tools with 100% data privacy. If our tools save your time and files, please consider supporting our running server costs. You can make a micro-contribution by choosing a premium plan.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-center shrink-0 w-full sm:w-auto relative z-10">
            <Link 
              href="/pricing"
              className="w-full sm:w-auto text-center px-6 py-3.5 font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition shadow-md hover:shadow-lg"
            >
              ☕ Support / Donate
            </Link>
            <Link 
              href="/pricing" 
              className="w-full sm:w-auto text-center px-6 py-3.5 font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition"
            >
              🌟 See Pro Plans
            </Link>
          </div>
        </div>
      </section>

      {/* Footer displayed on Home Page only */}
      <Footer />
    </div>
  );
}
