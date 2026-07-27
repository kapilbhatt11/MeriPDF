"use client";
import React, { useRef, useState } from "react";
import { PenTool, Plus, HelpCircle, X, UploadCloud, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SignEditor from "./components/SignEditor";

export default function SignPDFPage() {
  const [file, setFile] = useState<File | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[56px] bg-[#fafafa] text-slate-900 font-sans overflow-hidden">
      <div className="max-w-7xl mx-auto w-full h-full p-4 flex flex-col overflow-hidden">
        {/* Header Section */}
        <div className="w-full pb-2 shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <div className="flex items-center gap-5">
              <div className="bg-teal-500 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/20 shrink-0">
                <PenTool className="text-white w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-800 leading-tight">Digital PDF Signer</h1>
                <p className="text-slate-500 font-medium text-[11px]">Type, Draw, or Generate Company Seal Stamps and place them on your PDF.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHelp(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-semibold transition-all border border-slate-200 text-xs shadow-sm"
              >
                <HelpCircle size={14} /> How it works
              </button>
              <div className="h-8 w-[1px] bg-slate-200 hidden md:block mx-1" />
              <div className="bg-teal-50 text-teal-700 px-3 py-1.5 rounded-xl text-xs font-bold border border-teal-100">
                Secure Sign
              </div>
            </div>
          </div>
        </div>

        <main className="w-full flex-grow min-h-0 flex flex-col overflow-hidden">
          {!file ? (
            <div 
              className="bg-white rounded-3xl p-16 shadow-sm border border-slate-100 flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-[600px] cursor-pointer group" 
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="absolute -top-16 -right-16 w-64 h-64 bg-teal-500/5 blur-[80px] rounded-full pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />

              <div className="relative mx-auto w-40 h-40 flex items-center justify-center mb-8">
                <div className="absolute inset-0 bg-teal-500/10 rounded-[60px] rotate-12 group-hover:rotate-6 transition-transform duration-500" />
                <div className="absolute inset-0 bg-teal-500/20 rounded-[60px] -rotate-12 group-hover:-rotate-6 transition-transform duration-500" />
                <div className="relative bg-white w-32 h-32 rounded-[48px] shadow-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                  <UploadCloud className="w-14 h-14 text-teal-500" />
                </div>
              </div>
              
              <div className="text-center z-10">
                <h3 className="text-4xl font-black text-slate-800 mb-4 tracking-tight">Drop your PDF here to Sign</h3>
                <p className="text-slate-500 font-medium text-lg leading-relaxed max-w-md mx-auto mb-8">
                  Upload the document you want to sign. Draw a signature, type your initials, or stamp your custom company seal.
                </p>
                
                <button className="mx-auto bg-slate-900 text-white px-10 py-5 rounded-[24px] font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-slate-900/20 flex items-center gap-3">
                  <Plus size={24} /> Select PDF File
                </button>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          ) : (
            <SignEditor file={file} onBack={() => setFile(null)} />
          )}
        </main>

        {/* Help Modal */}
        <AnimatePresence>
          {showHelp && (
            <div className="fixed inset-0 z-[100] flex items-center justify-end p-6 bg-slate-950/40 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
              <motion.div 
                initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
                className="w-full max-w-md h-full bg-white rounded-[40px] shadow-2xl p-10 relative overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <button 
                  onClick={() => setShowHelp(false)}
                  className="absolute top-8 right-8 text-slate-350 hover:text-slate-600 transition-colors"
                >
                  <X size={24} />
                </button>

                <div className="mb-12">
                  <div className="bg-teal-100 w-14 h-14 rounded-2xl flex items-center justify-center text-teal-650 mb-6">
                     <Info size={28} />
                  </div>
                  <h2 className="text-3xl font-black text-slate-850 tracking-tight">How to Sign PDFs</h2>
                </div>

                <div className="space-y-12">
                  {[
                    { title: "Upload PDF", desc: "Select your PDF file and load it in the digital signature editor." },
                    { title: "Create Signature or Stamp", desc: "Choose to type a styled name, draw with your mouse/touchpad, upload an image, or configure a circular company seal." },
                    { title: "Place on Page", desc: "Drag and drop the signature or stamp wherever you want. You can resize it or place multiple items." },
                    { title: "Download Signed PDF", desc: "Click the Save & Download button. The signature is permanently embedded into the PDF structure." }
                  ].map((step, idx) => (
                    <div key={idx} className="flex gap-6">
                      <div className="text-2xl font-black text-teal-500/20 tabular-nums">0{idx + 1}</div>
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
                  Got it, let's start!
                </button>
              </motion.div>
            </div>
           )}
        </AnimatePresence>
      </div>
    </div>
  );
}
