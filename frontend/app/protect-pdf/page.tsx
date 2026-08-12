"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, Lock, HelpCircle, UploadCloud, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function ProtectPDF() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Locked.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setDownloadUrl(null);
    }
  };

  const handleLock = async () => {
    if (!file) return alert("Select a PDF first");
    if (!password) return alert("Please enter a password to lock the PDF");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("password", password);

    try {
      const res = await axios.post(
        api("/protect/lock"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Locked_${file.name}`;
      if (contentDisposition) {
        const match = /filename="?([^\";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("Protect PDF", 1);
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const j = JSON.parse(text) as { code?: string; detail?: string };
          if (j?.code === "LOGIN_REQUIRED") {
            alert(`${j.detail || "Log in required"}\n\nPlease log in and try again.`);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      alert("Failed to lock PDF. Make sure it isn't already password protected.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      {/* --- Top Premium Header --- */}
      <div className="bg-gradient-to-r from-red-900 to-red-800 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-white">
          <div className="bg-red-500/20 p-2 rounded-lg text-red-400">
            <Lock className="w-8 h-8" />
          </div>
          Lock PDF
        </h1>

        <div className="flex items-center gap-4 flex-wrap md:flex-nowrap">
          {/* Help Button */}
          <button
            onClick={() => setShowHelp(true)}
            className="bg-red-500/20 text-red-300 p-2.5 rounded-lg border border-red-500/30 shadow hover:bg-red-500/30 transition flex items-center justify-center gap-2"
            title="How to Use"
          >
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>

          <div className="bg-slate-800/50 border border-slate-700 text-slate-300 py-2 px-4 rounded-lg text-sm shadow-inner">
            <strong className="text-white">Secure your files</strong> with AES-256 encryption.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* ================= LEFT : UPLOAD PANEL ================= */}
        <div className="bg-gray-100 border-2 border-dashed border-red-300 rounded-xl p-8 flex flex-col items-center justify-center text-center">
          {!file ? (
            <>
              <div className="bg-white p-4 rounded-full shadow mb-4">
                <UploadCloud className="w-12 h-12 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">Upload your PDF</h3>
              <p className="text-gray-500 mb-6 text-sm">Select the document you want to encrypt and password-protect.</p>
              <button
                onClick={() => inputRef.current?.click()}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-red-700 shadow flex items-center gap-2"
              >
                <Plus size={20} /> Select PDF
              </button>
            </>
          ) : (
            <div className="w-full relative bg-white border border-red-200 rounded-xl p-6 shadow-sm flex flex-col items-center">
              <button
                onClick={() => setFile(null)}
                className="absolute top-3 right-3 text-red-500 hover:text-red-700 bg-red-50 rounded-full p-1 border border-red-100"
              >
                <X size={16} />
              </button>
              <Lock className="w-12 h-12 text-red-500 mb-3" />
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
          <h2 className="text-2xl font-bold mb-6 text-gray-800">Set a Password</h2>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Type your secure password:
            </label>
            <input
              type="password"
              placeholder="e.g. MySecretPass123"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-gray-900 bg-white placeholder-gray-400 font-medium"
            />
            <p className="text-xs text-gray-500 mt-2">
              Note: If you forget this password, the PDF cannot be recovered. Keep it safe!
            </p>
          </div>

          <button
            onClick={handleLock}
            disabled={loading || !file || !password}
            className="w-full bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? (
              <span className="flex justify-center items-center gap-2">
                <Loader2 className="animate-spin w-5 h-5" /> Encrypting...
              </span>
            ) : (
              "🔒 Lock Document"
            )}
          </button>

          {downloadUrl && (
            <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-xl text-center animate-fade-in">
              <div className="text-green-600 font-bold mb-2 flex items-center justify-center gap-2">
                <Lock className="w-5 h-5" /> Successfully Locked!
              </div>
              <p className="text-sm text-gray-600 mb-4">Your file is now encrypted.</p>
              <a
                href={downloadUrl}
                download={downloadName}
                className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 font-bold transition shadow"
              >
                <FileDown size={18} /> Download Protected PDF
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
              <HelpCircle className="text-red-500" /> How to Lock PDFs
            </h2>
            <div className="space-y-4 text-gray-600 text-sm">
              <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-red-600 font-bold text-lg">1</span>
                <p><strong>Upload File:</strong> Click the 'Select PDF' button to choose the document you want to secure.</p>
              </div>
              <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-red-600 font-bold text-lg">2</span>
                <p><strong>Set Password:</strong> Enter a strong password. This exact password will be required every time someone tries to open the PDF.</p>
              </div>
              <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-red-600 font-bold text-lg">3</span>
                <p><strong>Lock & Download:</strong> Hit "Lock Document". Your file is immediately encrypted with military-grade AES-256 encryption. Click download to save your new secure file.</p>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full bg-red-600 text-white font-semibold py-2 rounded-lg hover:bg-red-700 transition"
            >
              Got it, let's go!
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
