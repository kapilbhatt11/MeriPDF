"use client";
import React, { useRef, useState } from "react";
import axios from "axios";
import { Loader2, FileDown, X, HelpCircle, UploadCloud, Plus, File as FileIcon, Code, Globe } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

export default function HtmlToPdf() {
  const [activeTab, setActiveTab] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("Converted_Web_Page.pdf");
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClearUrlInput = () => {
    setUrlInput("");
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFile = e.target.files[0];
      const ext = newFile.name.split('.').pop()?.toLowerCase();
      if (ext !== 'html' && ext !== 'htm') {
        alert("Only HTML files (.html, .htm) are allowed.");
        return;
      }
      setFile(newFile);
      setDownloadUrl(null);
    }
  };

  const handleFileConvert = async () => {
    if (!file) return alert("Select an HTML file first");

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(
        api("/converters/html-to-pdf"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = `Converted_${file.name.replace('.html', '').replace('.htm', '')}.pdf`;
      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("HTML to PDF", 1);
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
        } catch {}
      }
      alert("Conversion failed. Please try again or use a valid HTML document.");
    } finally {
      setLoading(false);
    }
  };

  const handleUrlConvert = async () => {
    if (!urlInput.trim()) return alert("Please enter a link first");
    let targetUrl = urlInput.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "http://" + targetUrl;
    }

    setLoading(true);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append("url", targetUrl);

    try {
      const res = await axios.post(
        api("/converters/url-to-pdf"),
        formData,
        {
          responseType: "blob",
          headers: optionalAuthHeaders(),
        }
      );

      const contentDisposition = res.headers["content-disposition"] as string | undefined;
      let filename = "Converted_Webpage.pdf";
      if (contentDisposition) {
        const match = /filename="?([^";]+)"?/.exec(contentDisposition);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const url = URL.createObjectURL(new Blob([res.data]));
      setDownloadUrl(url);
      setDownloadName(filename);
      logPDFOperation("URL to PDF", 1);
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
        } catch {}
      }
      alert("Conversion failed. Make sure the website link is valid and accessible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 relative">
      <div className="bg-gradient-to-r from-violet-600 to-fuchsia-700 rounded-2xl p-6 mb-8 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4 text-white">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg">
            <Code className="w-8 h-8" />
          </div>
          HTML to PDF
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHelp(true)} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-lg border border-white/20 flex items-center gap-2 transition">
            <HelpCircle size={20} />
            <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
          </button>
        </div>
      </div>

      {/* Premium Tab Bar */}
      <div className="flex border-b border-slate-200 mb-8 max-w-5xl mx-auto gap-4">
        <button
          onClick={() => { setActiveTab("file"); setDownloadUrl(null); }}
          className={`pb-4 px-4 font-bold text-lg flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "file"
              ? "border-violet-600 text-violet-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <UploadCloud size={20} />
          Upload HTML File
        </button>
        <button
          onClick={() => { setActiveTab("url"); setDownloadUrl(null); }}
          className={`pb-4 px-4 font-bold text-lg flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "url"
              ? "border-violet-600 text-violet-600"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          <Globe size={20} />
          Convert Web Link (URL)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {activeTab === "file" ? (
          <div className="bg-violet-50/50 border-2 border-dashed border-violet-400 rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
            <div className="bg-white p-4 rounded-full shadow mb-4">
              <UploadCloud className="w-12 h-12 text-violet-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">Upload HTML</h3>
            <p className="text-gray-500 mb-6 text-sm">Select .html or .htm file.</p>
            <button onClick={() => inputRef.current?.click()} className="bg-violet-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-violet-700 shadow-md flex items-center gap-2 transition transform hover:scale-105 active:scale-95">
              <Plus size={20} /> Select File
            </button>
            <input ref={inputRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={handleFileChange} />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white border rounded-xl shadow p-8 min-h-[300px] flex flex-col justify-center">
              <h3 className="text-xl font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Globe className="text-violet-600 w-6 h-6" />
                Enter Web Page Address
              </h3>
              <p className="text-gray-500 mb-6 text-sm">
                Paste a link to any website or static HTML page (e.g. <code>https://example.com</code>). 
                We will format and convert it into a screen-compatible A4 PDF document.
              </p>
              <div className="flex flex-col gap-4">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="Enter URL (e.g., https://news.ycombinator.com)"
                    value={urlInput}
                    onChange={(e) => {
                      setUrlInput(e.target.value);
                    }}
                    className="w-full bg-white border border-gray-300 rounded-xl py-3 pl-4 pr-12 outline-none focus:border-violet-500 shadow-sm transition-all placeholder:text-slate-400 text-gray-900 font-medium"
                  />
                  {urlInput && (
                    <button
                      type="button"
                      onClick={handleClearUrlInput}
                      className="absolute right-4 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Instant Static Webpage Mockup Preview Card */}
            {urlInput.trim() && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-md overflow-hidden animate-in fade-in duration-300">
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex gap-1.5 flex-shrink-0">
                      <span className="w-3 h-3 rounded-full bg-red-400"></span>
                      <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                      <span className="w-3 h-3 rounded-full bg-green-400"></span>
                    </div>
                    <span className="text-xs font-semibold text-slate-400 font-mono ml-2 truncate max-w-[220px] md:max-w-[320px]">
                      {urlInput}
                    </span>
                  </div>
                  <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex-shrink-0">
                    A4 PDF Layout
                  </span>
                </div>

                <div className="p-6 bg-slate-50 min-h-[220px] flex flex-col items-center justify-center relative">
                  {/* Styled Webpage Skeleton Mockup representing a page being converted */}
                  <div className="w-full max-w-[260px] aspect-[1/1.41] bg-white border border-slate-200 rounded-lg shadow-sm p-4 flex flex-col gap-3 relative overflow-hidden transition-all hover:shadow-md">
                    {/* Simulated Header */}
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <div className="w-10 h-2 bg-violet-200 rounded"></div>
                      <div className="flex gap-1">
                        <div className="w-4 h-1.5 bg-slate-100 rounded"></div>
                        <div className="w-4 h-1.5 bg-slate-100 rounded"></div>
                      </div>
                    </div>

                    {/* Simulated Content */}
                    <div className="space-y-2 flex-1">
                      <div className="w-3/4 h-3.5 bg-violet-600/10 rounded-sm"></div>
                      <div className="w-1/2 h-2.5 bg-slate-200 rounded-sm"></div>
                      
                      {/* Image Placeholder */}
                      <div className="w-full h-16 bg-slate-100 rounded-md border border-slate-200/50 flex items-center justify-center my-1.5">
                        <Globe size={18} className="text-slate-350 animate-pulse" />
                      </div>
                      
                      {/* Paragraph skeleton */}
                      <div className="space-y-1.5">
                        <div className="w-full h-2 bg-slate-100 rounded"></div>
                        <div className="w-full h-2 bg-slate-100 rounded"></div>
                        <div className="w-5/6 h-2 bg-slate-100 rounded"></div>
                      </div>
                    </div>

                    {/* Simulated Footer */}
                    <div className="flex justify-between items-center border-t border-slate-100 pt-2 text-[8px] text-slate-300 font-mono">
                      <span>Powered by Playwright</span>
                      <span>Page 1 of 1</span>
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent pointer-events-none" />
                  </div>

                  <p className="text-xs text-slate-500 font-semibold mt-4 text-center">
                    CSS and JavaScript options will be executed by Playwright.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white border rounded-xl shadow p-8 flex flex-col justify-start">
          <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-4">
            {activeTab === "file" ? "Selected File" : "Conversion Status"}
          </h2>
          {activeTab === "file" ? (
            !file ? (
               <div className="flex flex-col items-center justify-center text-gray-400 py-10">
                 <FileIcon size={40} className="mb-3 opacity-20" />
                 <p className="text-sm">No HTML file selected yet.</p>
               </div>
            ) : (
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-lg shadow-sm hover:border-violet-400 transition group mb-6">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-violet-100 text-violet-600 p-2 rounded flex-shrink-0">
                    <Code size={20} />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="font-semibold text-sm text-gray-800 truncate">{file.name}</span>
                    <span className="text-[10px] text-gray-500 uppercase">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <button onClick={() => {setFile(null); setDownloadUrl(null);}} className="text-gray-400 hover:text-red-500 p-1.5 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-red-50 transition">
                  <X size={16} />
                </button>
              </div>
            )
          ) : (
            <div className="py-6 text-center">
              {!urlInput.trim() ? (
                <div className="text-gray-400">
                  <Globe size={40} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Please input a website address to convert.</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-slate-700 font-semibold truncate">
                  Target Link: <span className="text-violet-600">{urlInput}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto space-y-4 border-t pt-4">
            {activeTab === "file" ? (
              <button onClick={handleFileConvert} disabled={loading || !file} className="w-full bg-violet-600 text-white py-4 rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 transition shadow-lg flex justify-center items-center gap-2 text-lg">
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Code className="w-5 h-5" />}
                {loading ? "Converting..." : "Convert to PDF"}
              </button>
            ) : (
              <div className="space-y-3">
                <button onClick={handleUrlConvert} disabled={loading || !urlInput.trim()} className="w-full bg-violet-600 text-white py-4 rounded-xl font-bold hover:bg-violet-700 disabled:opacity-50 transition shadow-lg flex justify-center items-center gap-2 text-lg">
                  {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Globe className="w-5 h-5" />}
                  {loading ? "Converting Link..." : "Convert Link to PDF"}
                </button>

                {urlInput.trim() && (
                  <button
                    onClick={() => {
                      setUrlInput("");
                      setDownloadUrl(null);
                    }}
                    className="w-full text-slate-500 hover:text-slate-700 font-semibold py-2.5 rounded-lg text-sm transition flex justify-center items-center gap-2 border border-slate-200 bg-white"
                  >
                    Clear Workspace
                  </button>
                )}
              </div>
            )}

            {downloadUrl && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center animate-in fade-in slide-in-from-bottom-4">
                <a href={downloadUrl} download={downloadName} className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-bold transition shadow-md w-full justify-center">
                  <FileDown size={20} /> Download PDF
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-6 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-8 rounded-2xl shadow-2xl text-left w-full max-w-lg relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 p-2 rounded-full"><X size={20} /></button>
            <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-3">
              <HelpCircle className="text-violet-600" /> 
              How to use HTML to PDF
            </h2>
            <div className="space-y-5 text-gray-600">
              <div className="flex items-start gap-4">
                <div className="bg-violet-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">1</div>
                <p className="pt-1">Choose **Upload HTML File** to convert local webpage files, or **Convert Web Link** to convert a live website URL.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-violet-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">2</div>
                <p className="pt-1">Select your HTML file, or paste/type the URL link, then click **Convert to PDF**.</p>
              </div>
              <div className="flex items-start gap-4">
                <div className="bg-violet-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0">3</div>
                <p className="pt-1">Once processing is complete, your fully responsive A4 PDF will be ready for download instantly.</p>
              </div>
            </div>
            <button onClick={() => setShowHelp(false)} className="mt-8 w-full bg-violet-600 text-white font-bold py-3 rounded-xl hover:bg-violet-750 transition shadow-lg">Start Converting Now</button>
          </div>
        </div>
      )}
    </div>
  );
}
