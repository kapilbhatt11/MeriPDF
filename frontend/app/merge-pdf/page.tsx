"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import SortableItem from "./sortable-item";
import { X, RotateCw, Plus, GripVertical, ArrowDownAZ, ArrowUpAZ, HelpCircle, FileText, Download, CheckCircle, Layers, Undo, Redo } from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import { logPDFOperation } from "@/lib/analytics";

type FileWithId = File & { uid: string };

export default function MergePDFPage() {
  const [files, setFiles] = useState<FileWithId[]>([]);
  const [previews, setPreviews] = useState<{ [key: string]: string }>({});
  const [rotations, setRotations] = useState<{ [key: string]: number }>({});
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // History Undo/Redo stack states
  interface MergeHistoryState {
    files: FileWithId[];
    rotations: { [key: string]: number };
  }
  const [history, setHistory] = useState<MergeHistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<MergeHistoryState[]>([]);

  const pushToHistory = (customFiles = files, customRotations = rotations) => {
    setHistory((prev) => [...prev, { files: [...customFiles], rotations: { ...customRotations } }]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, { files: [...files], rotations: { ...rotations } }]);
    setFiles(previous.files);
    setRotations(previous.rotations);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setHistory((prev) => [...prev, { files: [...files], rotations: { ...rotations } }]);
    setFiles(next.files);
    setRotations(next.rotations);
  };
  const [mergeSuccess, setMergeSuccess] = useState<{ url: string; done: boolean } | null>(null);
  const [previewUid, setPreviewUid] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [loading, setLoading] = useState(false);

  // 📥 Add files
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length > 0) {
      pushToHistory();
      const withIds = selected.map((f) =>
        Object.assign(f, { uid: f.name + "-" + Date.now() + "-" + Math.random() })
      );
      withIds.forEach((file) => {
        const url = URL.createObjectURL(file);
        setPreviews((prev) => ({ ...prev, [file.uid]: url }));
        setRotations((prev) => ({ ...prev, [file.uid]: 0 }));
      });
      setFiles((prev) => [...prev, ...withIds]);
    }
  };

  // ❌ Delete
  const handleDelete = (uid: string) => {
    pushToHistory();
    setFiles((prev) => prev.filter((f) => f.uid !== uid));
    setPreviews((prev) => {
      const copy = { ...prev };
      delete copy[uid];
      return copy;
    });
    setRotations((prev) => {
      const copy = { ...prev };
      delete copy[uid];
      return copy;
    });
  };

  // 🔄 Rotate
  const handleRotate = (uid: string) => {
    pushToHistory();
    setRotations((prev) => ({
      ...prev,
      [uid]: ((prev[uid] || 0) + 90) % 360,
    }));
  };

  // ↕️ Reorder
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const oldIndex = files.findIndex((f) => f.uid === active.id);
      const newIndex = files.findIndex((f) => f.uid === over.id);
      pushToHistory();
      setFiles((items) => arrayMove(items, oldIndex, newIndex));
    }
  };

  // 🔃 Sort Toggle
  const toggleSort = () => {
  const newOrder = sortOrder === "asc" ? "desc" : "asc";
  pushToHistory();
  setSortOrder(newOrder);

  setFiles((prev) =>
    [...prev].sort((a, b) =>
      newOrder === "asc"
        ? a.name.localeCompare(b.name, undefined, { numeric: true })
        : b.name.localeCompare(a.name, undefined, { numeric: true })
      )
    );
  };

  // 🚀 Merge PDFs
  const handleMerge = async () => {
  if (files.length < 2) {
    alert("Select at least 2 PDFs to merge!");
    return;
  }

  setMergeSuccess({ url: "", done: false }); // 🔹 Open modal immediately

  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append(
    "rotations",
    JSON.stringify(
      files.map((file) => ({
        name: file.name,
        rotation: rotations[file.uid] || 0,
      }))
    )
  );

  try {
    const res = await fetch(api(`/pdf/merge-pdf`), {
      method: "POST",
      body: formData,
      headers: optionalAuthHeaders(),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setMergeSuccess({ url, done: false });
      logPDFOperation("Merge PDF", files.length);
    } else {
      let msg = "Merge failed!";
      try {
        const err = await res.json();
        if (err?.code === "LOGIN_REQUIRED") {
          msg = `${err.detail || msg}\n\nLog in and try again.`;
        } else if (err?.detail) {
          msg = String(err.detail);
        }
      } catch {
        /* ignore */
      }
      alert(msg);
      setMergeSuccess(null);
    }
  } catch (error) {
    alert("Server error while merging!");
    setMergeSuccess(null);
  }
};

  

  return (
    <div className="max-w-6xl mx-auto px-6 pt-4 pb-28 relative">
      {/* --- Top Premium Header --- */}
      <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-slate-900 rounded-2xl p-6 mb-6 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 border border-indigo-905/30">
        <h1 className="text-3xl font-black flex items-center gap-3 text-white">
          <div className="bg-indigo-500/20 p-2 rounded-xl text-indigo-300 border border-indigo-500/30 shadow-inner">
            <Layers className="w-8 h-8" />
          </div>
          Merge PDF
        </h1>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-4">
          <div className="hidden lg:block bg-slate-800/40 border border-slate-700 text-slate-300 py-2 px-4 rounded-xl text-sm shadow-inner">
            Without account: <strong className="text-white">5 free actions/day</strong>.{" "}
            <a href="/login" className="text-indigo-400 hover:text-indigo-300 underline font-semibold">Log in</a> unlimited
          </div>

          <div className="flex gap-3">
            {/* Undo / Redo controls */}
            {files.length > 0 && (
              <div className="flex items-center gap-1 bg-white/10 border border-white/20 rounded-xl p-1 shadow-sm">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 text-white p-2 rounded-lg transition flex items-center justify-center cursor-pointer disabled:cursor-not-allowed border border-transparent"
                  title="Undo Action"
                >
                  <Undo size={16} className="text-white" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10 text-white p-2 rounded-lg transition flex items-center justify-center cursor-pointer disabled:cursor-not-allowed border border-transparent"
                  title="Redo Action"
                >
                  <Redo size={16} className="text-white" />
                </button>
              </div>
            )}

            {/* Help Button */}
            <button
              onClick={() => setShowHelp(true)}
              className="bg-indigo-500/20 text-indigo-200 p-2.5 rounded-xl border border-indigo-500/30 shadow hover:bg-indigo-500/30 transition flex items-center justify-center gap-2"
              title="How to Use"
            >
              <HelpCircle size={20} />
              <span className="hidden sm:inline text-sm font-semibold">How to Use</span>
            </button>

            {/* Sort Button */}
            {files.length > 1 && (
              <button
                onClick={toggleSort}
                className="bg-white/10 text-white p-2.5 rounded-xl border border-white/20 shadow hover:bg-white/20 transition flex items-center justify-center"
                title="Sort Alphabetically"
              >
                {sortOrder === "asc" ? <ArrowDownAZ size={20} /> : <ArrowUpAZ size={20} />}
              </button>
            )}

            {/* Add PDF Button */}
            <label className="relative cursor-pointer">
              <div className="bg-indigo-600 text-white p-2.5 px-4 rounded-xl shadow border border-indigo-500 hover:bg-indigo-500 transition flex items-center gap-2 font-semibold text-sm">
                <Plus size={20} /> Add Files
              </div>
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              {files.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow">
                  {files.length}
                </span>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* 💡 Hint / Limit (Mobile) */}
      {files.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 text-indigo-900 p-4 rounded-2xl shadow-sm mb-6 flex flex-col sm:flex-row gap-2 justify-between items-center">
          <span className="text-sm font-medium flex items-center gap-2">
            💡 Drag & Drop cards to reorder. Use 🔄 Rotate / ❌ Delete. Click 🔽/🔼 to sort by name.
          </span>
          <span className="lg:hidden text-xs bg-indigo-100 text-indigo-755 px-3 py-1 rounded-full font-medium">
            5 actions/day without login
          </span>
        </div>
      )}

      {/* 🗂️ Cards Section */}
      {files.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 flex flex-col items-center justify-center text-center shadow-sm hover:border-indigo-400 transition-colors duration-300 group">
          <div className="bg-indigo-50 p-5 rounded-3xl text-indigo-600 mb-4 group-hover:scale-110 transition-transform duration-300 shadow-inner">
            <Layers className="w-12 h-12 animate-pulse" />
          </div>
          <h3 className="text-xl font-bold text-slate-800">Combine multiple PDF files into one</h3>
          <p className="text-slate-500 text-sm max-w-sm mt-2 mb-6">
            Upload PDFs in the order you want them to appear, drag to rearrange, rotate pages, and compile instantly.
          </p>
          <label className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-8 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 text-sm">
            <Plus className="w-5 h-5" /> Select PDF Files
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={files.map((f) => f.uid)} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4">
              {files.map((file, index) => (
                <SortableItem key={file.uid} id={file.uid}>
                  {({ setActivatorNodeRef, listeners, attributes }) => (
                    <div className="relative bg-white border border-slate-100 rounded-2xl p-4 flex flex-col items-center select-none shadow-sm hover:shadow-md transition-all duration-300">
                      {/* Top Action Bar */}
                      <div className="w-full flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                        {/* Drag Handle */}
                        <div
                          ref={setActivatorNodeRef}
                          {...listeners}
                          {...attributes}
                          className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-lg hover:bg-slate-50 transition cursor-grab active:cursor-grabbing"
                          title="Drag to reorder"
                        >
                          <GripVertical size={18} />
                        </div>
                        
                        {/* Index Number Badge */}
                        <span className="text-[10px] font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-full">
                          #{index + 1}
                        </span>
                        
                        {/* Action buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRotate(file.uid);
                            }}
                            className="text-slate-400 hover:text-indigo-605 hover:bg-indigo-50 p-1 rounded-lg transition"
                            title="Rotate Page"
                          >
                            <RotateCw size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(file.uid);
                            }}
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-lg transition"
                            title="Delete"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>

                      {/* 📄 Thumbnail */}
                      <div
                        onClick={() => setPreviewUid(file.uid)}
                        className="w-full aspect-[3/4] max-h-36 overflow-hidden flex items-center justify-center bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition cursor-zoom-in relative group"
                        title="Click to Preview"
                      >
                        <embed
                          src={previews[file.uid]}
                          type="application/pdf"
                          className="w-full h-full rounded transition-transform duration-300 pointer-events-none"
                          style={{ transform: `rotate(${rotations[file.uid] || 0}deg)` }}
                        />
                        <div className="absolute inset-0 bg-slate-900/0 hover:bg-slate-900/10 transition-colors flex items-center justify-center">
                          <span className="bg-white/95 backdrop-blur-sm text-slate-800 text-[10px] font-bold px-2 py-1 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            View PDF
                          </span>
                        </div>
                      </div>

                      {/* Filename */}
                      <div className="w-full mt-3 flex items-center gap-1.5 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-700 truncate w-full" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                    </div>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 📄 Preview modal (scroll inside PDF) */}
      {previewUid && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-6"
          onClick={() => setPreviewUid(null)}
        >
          <div
            className="bg-white w-full max-w-5xl h-[85vh] rounded-lg shadow-lg overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="text-sm font-semibold text-gray-700 truncate pr-4">
                {files.find((f) => f.uid === previewUid)?.name || "Preview"}
              </div>
              <button
                onClick={() => setPreviewUid(null)}
                className="bg-gray-700 text-white px-3 py-1 rounded hover:bg-gray-800"
              >
                Close
              </button>
            </div>
            <div className="h-[calc(85vh-56px)] overflow-auto bg-gray-100">
              <embed
                src={previews[previewUid]}
                type="application/pdf"
                className="w-full h-full"
                style={{ transform: `rotate(${rotations[previewUid] || 0}deg)` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Actions Bar */}
      {files.length > 1 && (
        <div className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-md border-t border-slate-200 p-4 shadow-xl z-40 animate-in slide-in-from-bottom duration-300">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600 border border-indigo-100">
                <Layers className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-900">Merge Queue Ready</p>
                <p className="text-xs text-gray-500 font-medium">{files.length} documents will be combined</p>
              </div>
            </div>
            
            <button
              onClick={handleMerge}
              className="bg-indigo-600 hover:bg-indigo-500 hover:scale-[1.01] text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center gap-2 text-sm cursor-pointer"
            >
              🚀 Combine PDFs
            </button>
          </div>
        </div>
      )}

      {/* 📑 Merge Modal / Overlay */}
      {mergeSuccess && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white border border-slate-100 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Top Accent line */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>

            {!mergeSuccess.url ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="relative mb-6">
                  {/* Outer spinning ring */}
                  <div className="w-18 h-18 rounded-full border-4 border-indigo-100 border-t-indigo-650 animate-spin"></div>
                  {/* Inner pulsing layers icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Layers className="w-6 h-6 text-indigo-600 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Combining PDFs</h3>
                <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                  We are organizing and joining your selected documents into a single PDF...
                </p>
                <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-ping"></span>
                  <span>Compiling Pages</span>
                </div>
              </div>
            ) : !mergeSuccess.done ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-5 border border-emerald-100 shadow-sm">
                  <CheckCircle className="w-9 h-9 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-1">Documents Merged!</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs leading-relaxed">
                  Your new combined PDF is compiled and ready for download.
                </p>
                
                <div className="w-full space-y-3">
                  <a
                    href={mergeSuccess.url}
                    download="MeriPDF_merged.pdf"
                    onClick={() => setMergeSuccess((prev) => prev ? { ...prev, done: true } : null)}
                    className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg hover:shadow-indigo-500/20 hover:from-indigo-500 hover:to-blue-500 active:scale-[0.98] transition-all cursor-pointer text-sm"
                  >
                    <Download className="w-4 h-4" /> Download PDF
                  </a>
                  
                  <button
                    onClick={() => setMergeSuccess(null)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold py-3 px-6 rounded-xl hover:bg-slate-100 transition-colors text-sm cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center mb-5 shadow-lg border border-indigo-400">
                  <CheckCircle className="w-9 h-9 text-white animate-bounce" />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-1">Process Complete</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs leading-relaxed">
                  Your merged PDF has been downloaded successfully to your device!
                </p>
                
                <div className="w-full space-y-3">
                  <button
                    onClick={() => {
                      setMergeSuccess(null);
                      setFiles([]);
                      setPreviews({});
                      setRotations({});
                    }}
                    className="w-full inline-flex items-center justify-center bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] transition-all text-sm cursor-pointer"
                  >
                    ✨ Start New Merge
                  </button>
                  
                  <button
                    onClick={() => setMergeSuccess(null)}
                    className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold py-3 px-6 rounded-xl transition-colors text-sm cursor-pointer"
                  >
                    Back to Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


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
              <HelpCircle className="text-indigo-500" /> How to Merge PDFs
            </h2>
            <div className="space-y-4 text-gray-600 text-sm">
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-indigo-600 font-bold text-lg">1</span>
                <p><strong>Add Files:</strong> Click the "Add Files" button to select multiple PDFs from your device. You can add more later.</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-indigo-600 font-bold text-lg">2</span>
                <p><strong>Reorder & Sort:</strong> Drag and drop the pages using the vertical dots (<GripVertical size={16} className="inline"/>) to reorder them manually. You can also use the Sort button (<ArrowDownAZ size={16} className="inline"/>) to sort them alphabetically.</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-indigo-600 font-bold text-lg">3</span>
                <p><strong>Rotate & Preview:</strong> Click the Rotate icon (<RotateCw size={16} className="inline"/>) on any file if it is upside down. Click the file's thumbnail to scroll through its pages before merging.</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-indigo-600 font-bold text-lg">4</span>
                <p><strong>Merge:</strong> Once they are in the correct order, click the green "🚀 Merge PDFs" button at the bottom right. The combined PDF will be available to download!</p>
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

    </div>
  );
}
