"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, Unlock, HelpCircle, UploadCloud, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function UnlockPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Unlocked.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setDownloadUrl(null);
    }
  };

  const handleUnlock = async () => {
    if (!file) return alert("Select a PDF first");
    if (!password) return alert("Please enter the password to unlock the PDF");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("password", password);

    try {
      const res = await axios.post(
        api("/protect/unlock"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Unlocked_${file.name}`;
      if (contentDisposition) {
        const match = /filename="?([^\";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("Unlock PDF", 1);
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
      alert("Failed to unlock PDF. Please make sure the password is correct.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {/* --- Top Premium Header --- */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
          <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
            <Unlock className="w-8 h-8" />
          </div>
          Unlock PDF
        </h1>

        <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
          {/* Help Button */}
          <button
            onClick={() => setShowHelp(true)}
            className="bg-emerald-500/20 text-emerald-300 p-2.5 rounded-lg border border-emerald-500/30 shadow hover:bg-emerald-500/30 transition flex items-center justify-center gap-2"
            title="How to Use"
          >
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>

          <div className="bg-slate-800/50 border border-slate-700 text-slate-300 py-2 px-4 rounded-lg text-sm shadow-inner">
            <strong className="text-white">Remove passwords</strong> and decrypt your files instantly.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* ================= LEFT : UPLOAD PANEL ================= */}
        <div className="bg-gray-100 border-2 border-dashed border-emerald-300 rounded-xl p-8 flex flex-col items-center justify-center text-center">
          {!file ? (
            <>
              <div className="bg-white p-4 rounded-full shadow mb-4">
                <UploadCloud className="w-12 h-12 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">Upload your PDF</h3>
              <p className="text-gray-500 mb-6 text-sm">Select the protected document you want to unlock.</p>
              <button
                onClick={() => inputRef.current?.click()}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-emerald-700 shadow flex items-center gap-2"
              >
                <Plus size={20} /> Select PDF
              </button>
            </>
          ) : (
            <div className="w-full relative bg-white border border-emerald-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
              <button
                onClick={() => setFile(null)}
                className="absolute top-3 right-3 text-emerald-500 hover:text-emerald-700 bg-emerald-50 rounded-full p-1 border border-emerald-100"
              >
                <X size={16} />
              </button>
              <Unlock className="w-12 h-12 text-emerald-500 mb-3" />
              <p className="font-semibold text-gray-800 truncate w-full px-4">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* ================= RIGHT : ACTION PANEL ================= */}
        <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-center">
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Enter Password</h2>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              What is the current password?
            </label>
            <input
              type="password"
              placeholder="e.g. MySecretPass123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-gray-900 bg-white placeholder-gray-400 font-medium"
            />
            <p className="text-xs text-gray-500 mt-2">
              Note: We do not crack passwords. You must know the current password to remove it permanently.
            </p>
          </div>

          <button
            onClick={handleUnlock}
            disabled={loading || !file || !password}
            className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <span className="flex justify-center flex-row items-center gap-2">
                <Loader2 className="animate-spin w-5 h-5" /> Decrypting...
              </span>
            ) : (
              "🔓 Unlock Document"
            )}
          </button>

          {downloadUrl && (
            <div className="mt-8 p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-center animate-fade-in">
              <div className="text-green-600 font-bold mb-2 flex items-center justify-center gap-2">
                <Unlock className="w-5 h-5" /> Successfully Unlocked!
              </div>
              <p className="text-sm text-gray-600 mb-4">Your file is now permanently decrypted.</p>
              <a
                href={downloadUrl}
                download={downloadName}
                onClick={() => setDownloadUrl(null)}
                className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 font-bold transition shadow"
              >
                <FileDown size={18} /> Download Unlocked PDF
              </a>
            </div>
          )}
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
              <HelpCircle className="text-emerald-500" /> How to Unlock PDFs
            </h2>
            <div className="space-y-4 text-gray-600 text-sm">
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-emerald-600 font-bold text-lg">1</span>
                <p><strong>Upload Locked File:</strong> Click 'Select PDF' to upload the document that is currently annoying you with passwords.</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-emerald-600 font-bold text-lg">2</span>
                <p><strong>Prove Ownership:</strong> Enter the current password in the box. We need this to verify that you actually have permission to open the file.</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-emerald-600 font-bold text-lg">3</span>
                <p><strong>Decrypt Forever:</strong> Click "Unlock Document". We will strip the encryption entirely. The PDF you download will never ask for a password again!</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full bg-emerald-600 text-white font-semibold py-2 rounded-lg hover:bg-emerald-700 transition"
            >
              Got it, let's go!
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
