"use client";
import React, { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, Loader2, Type, Image as ImageIcon, Square, Circle, MousePointer2, 
  Download, Trash2, Minus, X, GripVertical, Bold, Italic, Underline, 
  AlignLeft, AlignCenter, AlignRight, Search, ChevronLeft, ChevronRight, 
  Plus, Maximize2, Minimize2, Sparkles, Eraser, Signature
} from "lucide-react";
import { motion, useDragControls } from "framer-motion";
import axios from "axios";
import { api } from "@/lib/api";
import { logPDFOperation } from "@/lib/analytics";

const FONT_OPTIONS = [
  // Legacy Core Fonts
  { label: "Helvetica / Arial (Standard)", value: "helv" },
  { label: "Times New Roman (Standard)", value: "times" },
  { label: "Courier New (Standard)", value: "cour" },
  { label: "Calibri", value: "calibri" },
  // Sans-Serif
  { label: "Inter (Design Sans)", value: "Inter" },
  { label: "Roboto (Premium Sans)", value: "Roboto" },
  { label: "Poppins (Modern Sans)", value: "Poppins" },
  { label: "Montserrat (Bold)", value: "Montserrat" },
  { label: "Open Sans (Clean)", value: "Open Sans" },
  { label: "Arial", value: "Arial" },
  { label: "Helvetica", value: "Helvetica" },
  { label: "System UI", value: "system-ui" },
  // Serif
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Georgia (Genteel)", value: "Georgia" },
  { label: "Garamond (Elegant)", value: "Garamond" },
  { label: "Playfair Display", value: "Playfair Display" },
  { label: "Merriweather", value: "Merriweather" },
  // Monospace
  { label: "Courier New", value: "Courier New" },
  { label: "Fira Code", value: "Fira Code" },
  { label: "Source Code Pro", value: "Source Code Pro" },
  { label: "Consolas", value: "Consolas" },
  // Signature Cursive
  { label: "Great Vibes (Signature)", value: "Great Vibes" },
  { label: "Sacramento (Thin)", value: "Sacramento" },
  { label: "Pacifico (Curly)", value: "Pacifico" },
  { label: "Dancing Script", value: "Dancing Script" }
];

interface Props {
  file: File;
  onBack: () => void;
}

type Tool = "mouse" | "text" | "image" | "box" | "circle" | "line" | "arrow" | "arc" | "pentagon" | "cloud";

type ElementType = {
  id: string;
  page?: number;
  type: "text" | "image" | "shape";
  shapeType?: "box" | "circle" | "line" | "arrow" | "arc" | "pentagon" | "cloud";
  text?: string;
  base64?: string;
  color: string;
  fillColor: string;
  strokeWidth: number;
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  letterSpacing?: number;
  rotate?: number;
  x: number; 
  y: number; 
  w: number; 
  h: number; 
};

function measureTextWidth(text: string, font: string): number {
  if (typeof window === "undefined") return text.length * 10;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return text.length * 10;
    ctx.font = font;
    return ctx.measureText(text).width;
  } catch (e) {
    return text.length * 10;
  }
}

function getTextColorFromCanvas(canvas: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#000000';
  
  const canvasW = canvas.width;
  const canvasH = canvas.height;
  
  const startX = Math.max(0, Math.floor(rect.x * canvasW));
  const startY = Math.max(0, Math.floor(rect.y * canvasH));
  const w = Math.min(canvasW - startX, Math.max(1, Math.floor(rect.w * canvasW)));
  const h = Math.min(canvasH - startY, Math.max(1, Math.floor(rect.h * canvasH)));
  
  if (w <= 0 || h <= 0) return '#000000';
  
  try {
    const imgData = ctx.getImageData(startX, startY, w, h);
    const data = imgData.data;
    
    // Corners sampling for background
    const corners = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1]
    ];
    let bgR = 0, bgG = 0, bgB = 0;
    let bgCount = 0;
    corners.forEach(([cx, cy]) => {
      if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
        const idx = (cy * w + cx) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        bgCount++;
      }
    });
    if (bgCount > 0) {
      bgR = Math.round(bgR / bgCount);
      bgG = Math.round(bgG / bgCount);
      bgB = Math.round(bgB / bgCount);
    }
    
    // Scan pixel distribution to find text color
    const colorCounts: { [key: string]: { r: number, g: number, b: number, count: number } } = {};
    let maxCount = 0;
    let bestColor = '#000000';
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const a = data[i+3];
      if (a < 50) continue;
      
      const dist = Math.sqrt((r - bgR)**2 + (g - bgG)**2 + (b - bgB)**2);
      if (dist < 45) continue; // Skip background or similar pixels
      
      // Quantize to group close colors
      const qSize = 16;
      const qr = Math.floor(r / qSize) * qSize;
      const qg = Math.floor(g / qSize) * qSize;
      const qb = Math.floor(b / qSize) * qSize;
      const key = `${qr},${qg},${qb}`;
      
      if (!colorCounts[key]) {
        colorCounts[key] = { r, g, b, count: 0 };
      }
      colorCounts[key].count++;
      
      if (colorCounts[key].count > maxCount) {
        maxCount = colorCounts[key].count;
        const toHex = (val: number) => val.toString(16).padStart(2, '0');
        bestColor = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
    }
    return bestColor;
  } catch (err) {
    return '#000000';
  }
}

function getBackgroundColorFromCanvas(canvas: HTMLCanvasElement, rect: { x: number; y: number; w: number; h: number }): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#ffffff';
  
  const canvasW = canvas.width;
  const canvasH = canvas.height;
  
  const startX = Math.max(0, Math.floor(rect.x * canvasW));
  const startY = Math.max(0, Math.floor(rect.y * canvasH));
  const w = Math.min(canvasW - startX, Math.max(1, Math.floor(rect.w * canvasW)));
  const h = Math.min(canvasH - startY, Math.max(1, Math.floor(rect.h * canvasH)));
  
  if (w <= 0 || h <= 0) return '#ffffff';
  
  try {
    const imgData = ctx.getImageData(startX, startY, w, h);
    const data = imgData.data;
    
    const corners = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1]
    ];
    let bgR = 0, bgG = 0, bgB = 0;
    let count = 0;
    corners.forEach(([cx, cy]) => {
      if (cx >= 0 && cx < w && cy >= 0 && cy < h) {
        const idx = (cy * w + cx) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
        count++;
      }
    });
    
    if (count > 0) {
      bgR = Math.round(bgR / count);
      bgG = Math.round(bgG / count);
      bgB = Math.round(bgB / count);
    } else {
      return '#ffffff';
    }
    
    const toHex = (val: number) => val.toString(16).padStart(2, '0');
    return `#${toHex(bgR)}${toHex(bgG)}${toHex(bgB)}`;
  } catch (err) {
    return '#ffffff';
  }
}

interface CanvasElementProps {
  el: ElementType;
  isSelected: boolean;
  isResizing: boolean;
  tool: Tool;
  zoom: number;
  setSelectedId: (id: string | null) => void;
  updateElement: (id: string, updates: Partial<ElementType>) => void;
  recordHistory: () => void;
  setResizing: (val: any) => void;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  pageDimensions: { width: number; height: number };
}

function CanvasElement({
  el,
  isSelected,
  isResizing,
  tool,
  zoom,
  setSelectedId,
  updateElement,
  recordHistory,
  setResizing,
  wrapperRef,
  pageDimensions
}: CanvasElementProps) {
  const dragControls = useDragControls();
  const localRef = useRef<HTMLDivElement>(null);

  const pageW = pageDimensions.width || 595.27;
  const pageH = pageDimensions.height || 841.89;

  const [domScale, setDomScale] = useState(1.0);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const updateScale = () => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        setDomScale(rect.width / pageW);
      }
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [wrapperRef, pageW, zoom]);

  // Auto resize textbox of typing text inheritance
  useEffect(() => {
    if (el.type === "text" && wrapperRef.current && !isResizing && pageDimensions.width > 0) {
      const lines = (el.text || "").split('\n');
      let maxLineWidth = 0;
      const fontStr = `${el.fontStyle || 'normal'} ${el.fontWeight || 'normal'} ${el.fontSize || 12}px ${
        el.fontFamily === 'helv' ? 'Helvetica, Arial, sans-serif' :
        el.fontFamily === 'times' ? 'Times New Roman, Times, serif' :
        el.fontFamily === 'cour' ? 'Courier New, Courier, monospace' :
        el.fontFamily === 'calibri' ? 'Calibri, sans-serif' :
        el.fontFamily || 'Helvetica, Arial, sans-serif'
      }`;
      
      lines.forEach(line => {
         const wLine = measureTextWidth(line || " ", fontStr);
         if (wLine > maxLineWidth) maxLineWidth = wLine;
      });
      
      const letterSpacingOffset = el.letterSpacing ? (el.text || "").length * el.letterSpacing : 0;
      const proposedW = maxLineWidth + 16 + letterSpacingOffset;
      const pointsW = Math.min(pageW - el.x, proposedW);
      
      const lineHeight = (el.fontSize || 12) * 1.25;
      const proposedH = lines.length * lineHeight + 8;
      const pointsH = Math.min(pageH - el.y, proposedH);
      
      if (isNaN(pointsW) || isNaN(pointsH) || !isFinite(pointsW) || !isFinite(pointsH)) {
        return;
      }
      if (Math.abs(el.w - pointsW) > 1.0 || Math.abs(el.h - pointsH) > 1.0) {
        updateElement(el.id, { w: pointsW, h: pointsH });
      }
    }
  }, [el.text, el.fontSize, el.fontFamily, el.fontWeight, el.fontStyle, el.letterSpacing, wrapperRef, isResizing, zoom, pageDimensions, el.x, el.y, el.w, el.h, pageW, pageH, updateElement]);

  return (
    <motion.div
      ref={localRef}
      drag={tool === "mouse"}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      onDragStart={() => recordHistory()}
      onPointerDown={(e) => {
        if (tool === "mouse") {
          e.stopPropagation();
          setSelectedId(el.id);
        }
      }}
      onDragEnd={(e, info) => {
        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const currentScale = rect.width / pageW;
        let newX = el.x;
        let newY = el.y;

        if (info && info.offset) {
          newX = el.x + info.offset.x / currentScale;
          newY = el.y + info.offset.y / currentScale;
        } else if (localRef.current) {
          const nodeRect = localRef.current.getBoundingClientRect();
          newX = (nodeRect.left - rect.left) / currentScale;
          newY = (nodeRect.top - rect.top) / currentScale;
        }

        // Apply page-boundary layout bounding offsets in PDF points
        newX = Math.max(0, Math.min(pageW - el.w, newX));
        newY = Math.max(0, Math.min(pageH - el.h, newY));

        console.log("DRAG END (PROCESSED):", {
          elementId: el.id,
          oldX: el.x,
          oldY: el.y,
          offset: info?.offset,
          calculatedX: newX,
          calculatedY: newY
        });

        updateElement(el.id, {
          x: newX,
          y: newY
        });
      }}
      className={`absolute overflow-visible ${
        isSelected ? "ring-2 ring-indigo-500 ring-offset-2 z-50 rounded-sm" : "z-20"
      }`}
      style={{
        left: `${(el.x / pageW) * 100}%`,
        top: `${(el.y / pageH) * 100}%`,
        width: `${(el.w / pageW) * 100}%`,
        height: `${(el.h / pageH) * 100}%`,
        opacity: el.opacity,
        transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined
      }}
    >
      {/* Hold & Move Grip Bar */}
      {isSelected && tool === "mouse" && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            dragControls.start(e);
          }}
          className="absolute -top-7 left-0 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-2 py-0.5 text-[9px] font-black tracking-wider flex items-center gap-1 select-none pointer-events-auto cursor-move shadow-md z-[60] transition-colors"
          title="Drag here to reposition element"
        >
          <GripVertical size={10} className="text-white/80" /> MOVE
        </div>
      )}

      {/* Responsive Resizer Handle */}
      {isSelected && tool === "mouse" && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            recordHistory();
            setResizing({ id: el.id, startX: e.clientX, startY: e.clientY, startW: el.w, startH: el.h });
          }}
          className="absolute -bottom-2 -right-2 w-5 h-5 bg-white border-[3px] border-indigo-600 rounded-full cursor-nwse-resize z-50 shadow-md transform hover:scale-125 transition-transform"
        />
      )}

      {/* Shape Rendering */}
      {el.type === "shape" ? (
        <div
          className="w-full h-full cursor-move"
          onPointerDown={(e) => {
            if (tool === "mouse") {
              e.stopPropagation();
              setSelectedId(el.id);
              dragControls.start(e);
            }
          }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" className="overflow-visible pointer-events-none">
            {el.shapeType === "box" && (
              <rect x="0" y="0" width="100" height="100" fill={el.fillColor} stroke={el.color} strokeWidth={el.strokeWidth} />
            )}
            {el.shapeType === "circle" && (
              <ellipse cx="50" cy="50" rx="50" ry="50" fill={el.fillColor} stroke={el.color} strokeWidth={el.strokeWidth} />
            )}
            {el.shapeType === "line" && (
              <line x1="0" y1="50%" x2="100%" y2="50%" stroke={el.color} strokeWidth={Math.max(el.strokeWidth, 2)} />
            )}
            {el.shapeType === "arrow" && (
              <>
                <defs>
                  <marker id={`arrow-${el.id}`} markerWidth="10" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill={el.color} />
                  </marker>
                </defs>
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke={el.color} strokeWidth={Math.max(el.strokeWidth, 2)} markerEnd={`url(#arrow-${el.id})`} />
              </>
            )}
            {el.shapeType === "arc" && (
              <path d="M 5,80 Q 50,15 95,80" fill={el.fillColor} stroke={el.color} strokeWidth={Math.max(el.strokeWidth, 2)} />
            )}
            {el.shapeType === "pentagon" && (
              <polygon points="50,5 95,38 78,90 22,90 5,38" fill={el.fillColor} stroke={el.color} strokeWidth={el.strokeWidth} />
            )}
            {el.shapeType === "cloud" && (
              <path d="M 20 60 a 16 16 0 0 1 20 -15 a 22 22 0 0 1 35 5 a 16 16 0 0 1 10 20 a 16 16 0 0 1 -15 15 l -40 0 a 16 16 0 0 1 -15 -15 a 16 16 0 0 1 5 -10 z" fill={el.fillColor} stroke={el.color} strokeWidth={el.strokeWidth} />
            )}
          </svg>
        </div>
      ) : el.type === "image" && el.base64 ? (
        <img
          src={el.base64}
          alt="Overlay"
          className="w-full h-full object-contain cursor-move"
          onPointerDown={(e) => {
            if (tool === "mouse") {
              e.stopPropagation();
              setSelectedId(el.id);
              dragControls.start(e);
            }
          }}
        />
      ) : el.type === "text" ? (
        <textarea
          autoFocus={isSelected}
          className="w-full h-full border-none outline-none placeholder-black/50 resize-none overflow-hidden cursor-text select-text z-50 relative pointer-events-auto"
          style={{
            backgroundColor: el.fillColor || 'transparent',
            color: el.color,
            fontSize: `${(el.fontSize || 12) * domScale}px`,
            fontFamily: el.fontFamily === 'helv' ? 'Helvetica, Arial, sans-serif' :
                        el.fontFamily === 'times' ? 'Times New Roman, Times, serif' :
                        el.fontFamily === 'cour' ? 'Courier New, Courier, monospace' :
                        el.fontFamily === 'calibri' ? 'Calibri, sans-serif' :
                        el.fontFamily || 'Helvetica, Arial, sans-serif',
            fontWeight: el.fontWeight || 'normal',
            fontStyle: el.fontStyle || 'normal',
            textDecoration: el.textDecoration || 'none',
            textAlign: el.textAlign || 'left',
            letterSpacing: el.letterSpacing ? `${el.letterSpacing * domScale}px` : 'normal',
            lineHeight: 1.25,
            padding: 0,
            margin: 0,
            boxSizing: 'border-box',
            outline: 'none',
            boxShadow: 'none',
            border: 'none'
          }}
          value={el.text}
          onPointerDown={(e) => {
             if (tool === "mouse") {
                 e.stopPropagation();
                 setSelectedId(el.id);
             }
          }}
          onChange={(e) => updateElement(el.id, { text: e.target.value })}
        />
      ) : null}
    </motion.div>
  );
}

export default function PdfEditor({ file, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageDimensions, setPageDimensions] = useState({ width: 595, height: 842 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pdfjsLib, setPdfjsLib] = useState<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1.0); // 1.0 = 100% zoom
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<Tool>("mouse");
  const [elements, setElements] = useState<ElementType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Undo-Redo Stack
  const [history, setHistory] = useState<ElementType[][]>([]);
  const [redoHistory, setRedoHistory] = useState<ElementType[][]>([]);

  const [activeColor, setActiveColor] = useState("#000000"); // Default Black
  const [activeFill, setActiveFill] = useState("transparent");
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(1);
  const [activeOpacity, setActiveOpacity] = useState(1);
  const [activeFontSize, setActiveFontSize] = useState(24);
  const [activeFontFamily, setActiveFontFamily] = useState("Helvetica"); // Default to standard Helvetica
  const [activeFontWeight, setActiveFontWeight] = useState<"normal" | "bold">("normal");
  const [activeFontStyle, setActiveFontStyle] = useState<"normal" | "italic">("normal");
  const [activeTextDecoration, setActiveTextDecoration] = useState<"none" | "underline">("none");
  const [activeTextAlign, setActiveTextAlign] = useState<"left" | "center" | "right">("left");
  const [activeLetterSpacing, setActiveLetterSpacing] = useState(0);

  // Search PDF text states
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [searchResults, setSearchResults] = useState<{ rect: { x: number; y: number; w: number; h: number } }[]>([]);
  const [pageTextItems, setPageTextItems] = useState<any[]>([]);

  // Text hover state
  const [hoveredTextItem, setHoveredTextItem] = useState<any[] | null>(null);

  // Signature Modal States
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [sigModalTab, setSigModalTab] = useState<"draw" | "type" | "upload">("draw");
  const [sigTypedName, setSigTypedName] = useState("");
  const [sigTypedFont, setSigTypedFont] = useState("Great Vibes");
  const [sigColor, setSigColor] = useState("#000000");
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);

  const recordHistory = (currentElements = elements) => {
    setHistory(prev => [...prev, currentElements]);
    setRedoHistory([]);
  };

  const updateElement = (id: string, updates: Partial<ElementType>) => {
      setElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoHistory(prev => [...prev, elements]);
    setElements(previous);
    setHistory(prev => prev.slice(0, prev.length - 1));
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const next = redoHistory[redoHistory.length - 1];
    setHistory(prev => [...prev, elements]);
    setElements(next);
    setRedoHistory(prev => prev.slice(0, prev.length - 1));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      
      if (isTyping) {
        if (e.key === "Escape") {
          target.blur();
        }
        return; // Don't interrupt typing
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      
      if (selectedId) {
        const pageW = pageDimensions.width || 595.27;
        const pageH = pageDimensions.height || 841.89;
        const step = e.shiftKey ? 10.0 : 2.0;
        const el = elements.find(x => x.id === selectedId);
        if (el) {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            recordHistory();
            updateElement(selectedId, { y: Math.max(0, el.y - step) });
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            recordHistory();
            updateElement(selectedId, { y: Math.min(pageH - el.h, el.y + step) });
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            recordHistory();
            updateElement(selectedId, { x: Math.max(0, el.x - step) });
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            recordHistory();
            updateElement(selectedId, { x: Math.min(pageW - el.w, el.x + step) });
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            recordHistory();
            setElements(els => els.filter(x => x.id !== selectedId));
            setSelectedId(null);
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [history, redoHistory, elements, selectedId, pageDimensions]);

  const spawnElement = (type: Tool) => {
    if (type === "mouse") {
      setTool("mouse");
      return;
    }
    
    if (type === "image") {
      const pageW = pageDimensions.width || 595.27;
      const pageH = pageDimensions.height || 841.89;
      const elW = 0.25 * pageW;
      const elH = 0.15 * pageH;
      const newEl: ElementType = {
        id: Date.now().toString(),
        page: pageNum,
        type: "image",
        color: activeColor,
        fillColor: "transparent",
        strokeWidth: activeStrokeWidth,
        opacity: activeOpacity,
        x: (pageW - elW) / 2,
        y: (pageH - elH) / 2,
        w: elW,
        h: elH
      };
      
      const imgInput = document.createElement("input");
      imgInput.type = "file";
      imgInput.accept = "image/*";
      imgInput.onchange = (ev: any) => {
        const uploadFile = ev.target.files[0];
        if (uploadFile) {
          const reader = new FileReader();
          reader.onload = (eReader) => {
            newEl.base64 = eReader.target?.result as string;
            recordHistory();
            setElements(prev => [...prev, newEl]);
            setSelectedId(newEl.id);
            setTool("mouse");
          };
          reader.readAsDataURL(uploadFile);
        }
      };
      imgInput.click();
      return;
    }
    
    // Set placement mode tool so that clicking on page canvas places text or shape
    React.startTransition ? React.startTransition(() => setTool(type)) : setTool(type);
  };

  const handleAutoColor = (elementId: string) => {
    const el = elements.find(x => x.id === elementId);
    if (!el || !pageCanvasRef.current) return;
    recordHistory();
    const rect = { x: el.x, y: el.y, w: el.w, h: el.h };
    const autoColor = getTextColorFromCanvas(pageCanvasRef.current, rect);
    updateElement(elementId, { color: autoColor });
    setActiveColor(autoColor);
  };

  // Resize State
  const [resizing, setResizing] = useState<{id: string, startX: number, startY: number, startW: number, startH: number} | null>(null);

  useEffect(() => {
    const loadPdfJs = async () => {
      try {
        // @ts-ignore
        const module = await import("pdfjs-dist/build/pdf");
        // @ts-ignore
        const worker = await import("pdfjs-dist/build/pdf.worker.min.js");
        (window as any).pdfjsWorker = worker;
        module.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        setPdfjsLib(module);
      } catch (error) {
        console.error("Failed to load PDF.js:", error);
      }
    };
    loadPdfJs();

    // Dynamically inject Google Fonts style
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script&family=Fira+Code&family=Great+Vibes&family=Inter:wght@400;700&family=Montserrat:wght@400;700&family=Open+Sans&family=Pacifico&family=Poppins:wght@400;700&family=Playfair+Display&family=Merriweather&family=Roboto&family=Sacramento&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      try {
        document.head.removeChild(link);
      } catch (err) {}
    };
  }, []);

   useEffect(() => {
    if (!file || !pdfjsLib) return;
    const loadPDF = async () => {
      setLoading(true);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const typedarray = new Uint8Array(reader.result as ArrayBuffer);
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            setNumPages(pdf.numPages);
            const page = await pdf.getPage(pageNum);
            const standardViewport = page.getViewport({ scale: 1.0 });
            setPageDimensions({ width: standardViewport.width, height: standardViewport.height });
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas context not supported.");
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport }).promise;
            pageCanvasRef.current = canvas;
            setPageImage(canvas.toDataURL());
            
            // Extract text items for styling matching & paragraphs overlays
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map((item: any) => {
              const tx = item.transform;
              const itemWidth = item.width;
              const itemHeight = item.height || Math.abs(tx[3]);
              
              // Convert baseline lower-left point and upper-right point to viewport space
              const [x1, y1] = viewport.convertToViewportPoint(tx[4], tx[5]);
              const [x2, y2] = viewport.convertToViewportPoint(tx[4] + itemWidth, tx[5] + itemHeight);
              
              const vx = Math.min(x1, x2);
              const vy = Math.min(y1, y2);
              const vw = Math.abs(x2 - x1);
              const vh = Math.abs(y2 - y1);
              
              const normX = vx / viewport.width;
              const normY = vy / viewport.height;
              const normW = vw / viewport.width;
              const normH = vh / viewport.height;
              
              const style = textContent.styles[item.fontName];
              const fontFamily = style ? style.fontFamily : 'Helvetica';
              
              const angleRad = Math.atan2(tx[1], tx[0]);
              const angleDeg = Math.round(angleRad * (180 / Math.PI));
              
              return {
                text: item.str,
                x: normX,
                y: normY,
                w: normW,
                h: normH,
                fontFamily: fontFamily,
                fontSize: itemHeight,
                rotate: angleDeg
              };
            });
            setPageTextItems(textItems);
            setLoading(false);
          } catch (err) {
            setLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        setLoading(false);
      }
    };
    loadPDF();
  }, [file, pdfjsLib, pageNum]);

  // Global Resize Engine
  useEffect(() => {
     if (!resizing) return;
     const handlePointerMove = (e: PointerEvent) => {
         if(!wrapperRef.current) return;
         const rect = wrapperRef.current.getBoundingClientRect();
         const pageW = pageDimensions.width || 595.27;
         const pageH = pageDimensions.height || 841.89;
         const domScale = rect.width / pageW;
         if (domScale <= 0) return;
         
         const diffX_points = (e.clientX - resizing.startX) / domScale;
         const diffY_points = (e.clientY - resizing.startY) / domScale;
         
         updateElement(resizing.id, { 
            w: Math.max(5.0, resizing.startW + diffX_points),
            h: Math.max(5.0, resizing.startH + diffY_points)
         });
     };
     const handlePointerUp = () => setResizing(null);
     window.addEventListener('pointermove', handlePointerMove);
     window.addEventListener('pointerup', handlePointerUp);
     return () => {
         window.removeEventListener('pointermove', handlePointerMove);
         window.removeEventListener('pointerup', handlePointerUp);
     };
  }, [resizing, pageDimensions, updateElement]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    
    // Page dimensions in PDF points
    const pageW = pageDimensions.width || 595.27;
    const pageH = pageDimensions.height || 841.89;

    let clickPctX = (e.clientX - rect.left) / rect.width;
    let clickPctY = (e.clientY - rect.top) / rect.height;

    // Bound coordinates inside page limit [0, 1]
    clickPctX = Math.max(0, Math.min(1.0, clickPctX));
    clickPctY = Math.max(0, Math.min(1.0, clickPctY));

    // Convert percentages to PDF points
    const clickX_points = clickPctX * pageW;
    const clickY_points = clickPctY * pageH;

    // Check if spawning text or clicking on existing text and if close to existing word
    let closestItem: any = null;
    let closestWordText = "";
    let closestWordRect = { x: 0, y: 0, w: 0, h: 0 };
    let minScore = Infinity;
    
    for (const item of pageTextItems) {
      // Direct bounding box containment check (perfect match)
      const isInsideX = clickPctX >= item.x && clickPctX <= (item.x + item.w);
      const isInsideY = clickPctY >= item.y && clickPctY <= (item.y + item.h);
      
      if (isInsideX && isInsideY) {
         closestItem = item;
         minScore = 0;
         break;
      }
      
      // Vertical distance relative to vertical center
      const centerY = item.y + item.h / 2;
      const distY = Math.abs(clickPctY - centerY);
      
      // Horizontal distance component
      let distX = 0;
      if (clickPctX < item.x) {
        distX = item.x - clickPctX;
      } else if (clickPctX > item.x + item.w) {
        distX = clickPctX - (item.x + item.w);
      } else {
        distX = 0;
      }
      
      // Weighted combination: vertical discrepancy is penalized heavily
      const score = distX + distY * 8;
      if (score < minScore) {
        minScore = score;
        closestItem = item;
      }
    }
    
    // Check if clicked close to a word/line
    const isWordClicked = closestItem && (minScore < 0.12 || minScore === 0);
    console.log("PDF Canvas Click (percentages):", { clickPctX, clickPctY }, "Closest matching item:", closestItem, "Score:", minScore);
    
    if (isWordClicked) {
      closestWordText = (closestItem.text || "").trim();
      closestWordRect = {
         x: closestItem.x,
         y: closestItem.y,
         w: closestItem.w,
         h: closestItem.h
      };
    }

    if (tool === "mouse") {
        if (isWordClicked) {
             const wordX_points = closestWordRect.x * pageW;
             const wordY_points = closestWordRect.y * pageH;
             // Find if there is an existing spawned text box element already covering this word
             const existingElement = elements.find(el => 
                 el.type === "text" && 
                 (el.page || 1) === pageNum &&
                 Math.abs(el.x - wordX_points) < 10 && 
                 Math.abs(el.y - wordY_points) < 10
             );
             if (existingElement) {
                 // If it already exists, select it instead of creating a duplicate
                 setSelectedId(existingElement.id);
                 return;
             }
             // Proceed to spawn the edit textbox below (falling through)
        } else {
             // If they click on a blank canvas or background image, simply deselect
             if (e.target === wrapperRef.current || (e.target as HTMLElement).tagName === "IMG") {
                 setSelectedId(null);
             }
             return;
        }
    } else {
        // If not in mouse mode but click on/near an existing word that has already been white-outed/spawned
        if (tool === "text" && isWordClicked) {
             const wordX_points = closestWordRect.x * pageW;
             const wordY_points = closestWordRect.y * pageH;
             const existingElement = elements.find(el => 
                 el.type === "text" && 
                 (el.page || 1) === pageNum &&
                 Math.abs(el.x - wordX_points) < 10 && 
                 Math.abs(el.y - wordY_points) < 10
             );
             if (existingElement) {
                 setSelectedId(existingElement.id);
                 setTool("mouse");
                 return;
             }
        }
    }

    // Spawning element at clicked coordinates in PDF Points
    const spawnedType = tool === "mouse" ? "text" : tool;
    
    let textPrefilled = "Double click to edit text";
    let fontSize = activeFontSize;
    let fontFamily = activeFontFamily;
    let fill = activeFill;
    let isBold = activeFontWeight === "bold";
    let isItalic = activeFontStyle === "italic";
    let textLetterSpacing = activeLetterSpacing;
    let textColor = activeColor;
    let bgColor = activeFill;
    let textRotate = 0;
    
    let elW_points = 0;
    let elH_points = 0;
    let newX_points = 0;
    let newY_points = 0;
    
    if (spawnedType === "text") {
      if (closestWordText) {
        textPrefilled = closestWordText;
        
        // Use native original text point size directly to preserve precise vector export dimensions
        fontSize = closestItem.fontSize ? Math.round(closestItem.fontSize) : 12;
        textRotate = closestItem.rotate || 0;
        
        // Map detected font family (must match value keys list)
        const detectedFamily = (closestItem.fontFamily || "").toLowerCase();
        if (detectedFamily.includes("times") || detectedFamily.includes("serif") || detectedFamily.includes("georgia")) {
          fontFamily = "times";
        } else if (detectedFamily.includes("cour") || detectedFamily.includes("mono") || detectedFamily.includes("fira") || detectedFamily.includes("consolas")) {
          fontFamily = "cour";
        } else {
          fontFamily = "helv";
        }
        
        isBold = detectedFamily.includes("bold") || detectedFamily.includes("w7") || detectedFamily.includes("w8") || detectedFamily.includes("w9") || detectedFamily.includes("heavy") || detectedFamily.includes("black");
        isItalic = detectedFamily.includes("italic") || detectedFamily.includes("oblique") || detectedFamily.includes("slanted") || detectedFamily.includes("it");
        textLetterSpacing = 0;
        
        // Canvas color sampling
        if (pageCanvasRef.current) {
          textColor = getTextColorFromCanvas(pageCanvasRef.current, closestWordRect);
          bgColor = getBackgroundColorFromCanvas(pageCanvasRef.current, closestWordRect);
        } else {
          textColor = activeColor;
          bgColor = "white"; // default white overlay masking
        }
        
        newX_points = closestWordRect.x * pageW;
        newY_points = closestWordRect.y * pageH;
        
        // Convert width & height to points with margin buffer to mask background text perfectly
        elW_points = Math.max(20, closestWordRect.w * pageW * 1.02);
        elH_points = Math.max(10, closestWordRect.h * pageH * 1.1);
        fill = bgColor; // cover the old word perfectly!
        
        // Inherit detected style states immediately
        setActiveColor(textColor);
        setActiveFill(bgColor);
        setActiveFontSize(fontSize);
        setActiveFontFamily(fontFamily);
        setActiveFontWeight(isBold ? "bold" : "normal");
        setActiveFontStyle(isItalic ? "italic" : "normal");
        setActiveLetterSpacing(textLetterSpacing);
      } else {
        // Spawning clean textbox at clicked coordinates
        elW_points = 0.2 * pageW;
        elH_points = 0.05 * pageH;
        newX_points = clickX_points - elW_points / 2;
        newY_points = clickY_points - elH_points / 2;
        fill = "transparent";
        bgColor = "transparent";
      }
    } else {
      // Shape sizes
      elW_points = 0.15 * pageW;
      elH_points = (["line", "arrow", "arc"].includes(spawnedType) ? 0.03 : 0.15) * pageH;
      newX_points = clickX_points - elW_points / 2;
      newY_points = clickY_points - elH_points / 2;
    }
    
    // Boundary containment checks for spawned elements in points
    newX_points = Math.max(0, Math.min(pageW - elW_points, newX_points));
    newY_points = Math.max(0, Math.min(pageH - elH_points, newY_points));

    const newEl: ElementType = {
      id: Date.now().toString(),
      page: pageNum,
      type: spawnedType === "text" ? "text" : "shape",
      shapeType: ["box", "circle", "line", "arrow", "arc", "pentagon", "cloud"].includes(spawnedType) ? (spawnedType as any) : undefined,
      text: spawnedType === "text" ? textPrefilled : undefined,
      color: spawnedType === "text" ? textColor : activeColor,
      fillColor: spawnedType === "text" ? bgColor : (["line", "arrow", "arc"].includes(spawnedType) ? "transparent" : fill),
      strokeWidth: activeStrokeWidth,
      opacity: activeOpacity,
      fontSize: spawnedType === "text" ? fontSize : undefined,
      fontFamily: spawnedType === "text" ? fontFamily : undefined,
      fontWeight: spawnedType === "text" ? (isBold ? "bold" : "normal") : undefined,
      fontStyle: spawnedType === "text" ? (isItalic ? "italic" : "normal") : undefined,
      textDecoration: spawnedType === "text" ? activeTextDecoration : undefined,
      textAlign: spawnedType === "text" ? activeTextAlign : undefined,
      letterSpacing: spawnedType === "text" ? textLetterSpacing : undefined,
      rotate: spawnedType === "text" ? textRotate : undefined,
      x: newX_points,
      y: newY_points,
      w: elW_points,
      h: elH_points
    };

    recordHistory();
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
    setTool("mouse"); // Reset to standard cursor/select tool
  };

  const handleCanvasPointerMove = (e: React.MouseEvent) => {
    if (tool !== "mouse" || !wrapperRef.current || pageTextItems.length === 0) {
      setHoveredTextItem(null);
      return;
    }
    const rect = wrapperRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width;
    const mouseY = (e.clientY - rect.top) / rect.height;
    
    let closest: any = null;
    let minScore = Infinity;
    for (const item of pageTextItems) {
      const isInsideX = mouseX >= item.x && mouseX <= (item.x + item.w);
      const isInsideY = mouseY >= item.y && mouseY <= (item.y + item.h);
      if (isInsideX && isInsideY) {
         closest = item;
         minScore = 0;
         break;
      }
      
      const centerY = item.y + item.h / 2;
      const distY = Math.abs(mouseY - centerY);
      
      let distX = 0;
      if (mouseX < item.x) {
        distX = item.x - mouseX;
      } else if (mouseX > item.x + item.w) {
        distX = mouseX - (item.x + item.w);
      }
      
      const score = distX + distY * 8;
      if (score < minScore) {
        minScore = score;
        closest = item;
      }
    }
    
    if (closest && (minScore < 0.05 || minScore === 0)) {
      setHoveredTextItem(closest);
    } else {
      setHoveredTextItem(null);
    }
  };

  const spawnSignatureElement = (base64Data: string) => {
    recordHistory();
    const pageW = pageDimensions.width || 595.27;
    const pageH = pageDimensions.height || 841.89;
    const elW = 0.25 * pageW;
    const elH = 0.1 * pageH;
    const newEl: ElementType = {
      id: Date.now().toString(),
      page: pageNum,
      type: "image",
      color: sigColor,
      fillColor: "transparent",
      strokeWidth: 0,
      opacity: 1,
      x: (pageW - elW) / 2,
      y: (pageH - elH) / 2,
      w: elW,
      h: elH,
      base64: base64Data
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(newEl.id);
    setShowSignatureModal(false);
    setTool("mouse");
  };

  const handleSignatureTypeSubmit = () => {
    if (!sigTypedName.trim()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `italic 38px ${
        sigTypedFont === "Sacramento" ? "Sacramento, cursive" :
        sigTypedFont === "Pacifico" ? "Pacifico, cursive" :
        sigTypedFont === "Dancing Script" ? "Dancing Script, cursive" :
        "Great Vibes, cursive"
      }`;
      ctx.fillStyle = sigColor;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(sigTypedName, 200, 60);
      const base64 = canvas.toDataURL();
      spawnSignatureElement(base64);
    }
  };

  const handleSignatureDrawSubmit = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
    const isBlank = !buffer.some(color => color !== 0);
    if (isBlank) {
       alert("Please draw your signature first.");
       return;
    }
    
    const base64 = canvas.toDataURL();
    spawnSignatureElement(base64);
  };

  const startSigDrawing = (e: any) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    ctx.strokeStyle = sigColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawingSig(true);
  };

  const drawSig = (e: any) => {
    if (!isDrawingSig) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopSigDrawing = () => {
    setIsDrawingSig(false);
  };

  const clearSigCanvas = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

// Sync active properties with selected item
  useEffect(() => {
     if (selectedId) {
        const el = elements.find(x => x.id === selectedId);
        if (el) {
           setActiveColor(el.color);
           setActiveFill(el.fillColor);
           setActiveStrokeWidth(el.strokeWidth);
           setActiveOpacity(el.opacity);
           if (el.fontSize) setActiveFontSize(el.fontSize);
           if (el.fontFamily) setActiveFontFamily(el.fontFamily);
           setActiveFontWeight(el.fontWeight || "normal");
           setActiveFontStyle(el.fontStyle || "normal");
           setActiveTextDecoration(el.textDecoration || "none");
           setActiveTextAlign(el.textAlign || "left");
           setActiveLetterSpacing(el.letterSpacing || 0);
        }
     }
  }, [selectedId]);

  const handleSaveList = async () => {
      setSaving(true);
      console.log("SAVE PDF - Elements state contains:", elements);
      try {
          const instructions = elements.map(el => ({
              page: el.page || pageNum,
              type: el.type,
              shapeType: el.shapeType,
              text: el.text,
              base64: el.base64,
              color: el.color,
              fillColor: el.fillColor,
              strokeWidth: el.strokeWidth,
              opacity: el.opacity,
              fontSize: el.fontSize,
              fontFamily: el.fontFamily || "helv",
              fontWeight: el.fontWeight || "normal",
              fontStyle: el.fontStyle || "normal",
              textDecoration: el.textDecoration || "none",
              textAlign: el.textAlign || "left",
              letterSpacing: el.letterSpacing || 0,
              rotate: el.rotate || 0,
              x: el.x, y: el.y,
              width: el.w, height: el.h
          }));
          console.log("SAVE PDF - mapped instructions:", instructions);

          const formData = new FormData();
          formData.append("file", file);
          formData.append("edits", JSON.stringify(instructions));

          const res = await axios.post(api("/pdf/edit"), formData, { responseType: "blob" });
          const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `edited_${file.name}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 100);
          logPDFOperation("Edit PDF", 1);
          setSuccessMessage("PDF saved and downloaded successfully!");
          setTimeout(() => setSuccessMessage(null), 4000);
      } catch (e: any) {
          console.error("Save PDF failed:", e);
          if (e.response?.data instanceof Blob) {
              const reader = new FileReader();
              reader.onload = () => {
                  try {
                      const errObj = JSON.parse(reader.result as string);
                      setErrorMessage(errObj.detail || "Failed to save PDF modifications.");
                  } catch {
                      setErrorMessage("Failed to save PDF modifications.");
                  }
              };
              reader.readAsText(e.response.data);
          } else {
              setErrorMessage(e.message || "Failed to save PDF modifications.");
          }
      } finally {
          setSaving(false);
      }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !pdfjsLib || !file) {
      setSearchResults([]);
      return;
    }
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const typedarray = new Uint8Array(reader.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const viewport = page.getViewport({ scale: 1.0 });

          const matches: any[] = [];
          textContent.items.forEach((item: any) => {
            if (!item.str) return;
            const textStr = item.str;
            const index = textStr.toLowerCase().indexOf(query.toLowerCase());
            if (index !== -1) {
              const tx = item.transform;
              const x = tx[4];
              const y = tx[5];
              const w = item.width;
              const h = item.height;
              const [vx, vy] = viewport.convertToViewportPoint(x, y + h);

              matches.push({
                text: textStr,
                rect: {
                  x: vx / viewport.width,
                  y: vy / viewport.height,
                  w: w / viewport.width,
                  h: h / viewport.height
                }
              });
            }
          });
          setSearchResults(matches);
        } catch (e) {
          console.error(e);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
     if (searchQuery.trim() && pdfjsLib) {
        handleSearch(searchQuery);
     } else {
        setSearchResults([]);
     }
  }, [pageNum, searchQuery, pdfjsLib]);

  useEffect(() => {
     setSearchQuery("");
     setSearchResults([]);
  }, [file]);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 border border-slate-200 shadow-xl rounded-3xl overflow-hidden mt-1 relative z-10 w-full min-h-0">
      
      {errorMessage && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-red-600/95 backdrop-blur border border-red-700 text-white px-5 py-3 rounded-xl shadow-2xl z-[999] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-2 h-2 rounded-full bg-white animate-ping"></div>
          <span className="font-black text-[9px] tracking-wider uppercase bg-white/20 px-1.5 py-0.5 rounded">error</span>
          <span className="font-bold text-xs">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="hover:bg-white/10 transition rounded-md w-5 h-5 flex items-center justify-center text-[10px] font-black ml-1.5">
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-emerald-600/95 backdrop-blur border border-emerald-700 text-white px-5 py-3 rounded-xl shadow-2xl z-[999] flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
          <span className="font-black text-[9px] tracking-wider uppercase bg-white/20 px-1.5 py-0.5 rounded">success</span>
          <span className="font-bold text-xs">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="hover:bg-white/10 transition rounded-md w-5 h-5 flex items-center justify-center text-[10px] font-black ml-1.5">
            ✕
          </button>
        </div>
      )}
      
      {/* Header */}
      <div className="bg-white border-b border-slate-100 flex items-center justify-between shadow-sm z-20 shrink-0 h-[60px] px-6">
        {/* Left Side: Back + Filename */}
        <div className="flex items-center gap-4 shrink-0">
            <button onClick={onBack} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-colors" title="Go Back">
               <ArrowLeft size={18} />
            </button>
            <div className="font-bold text-slate-800 text-sm truncate max-w-[180px] lg:max-w-[280px]" title={file.name}>{file.name}</div>
        </div>

        {/* Middle: Document controls (Docked Zoom, Page Controls) */}
        {!loading && (
          <div className="hidden md:flex items-center gap-6">
             {/* Page Navigation */}
             <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm shrink-0">
                <button 
                   disabled={pageNum <= 1 || loading} 
                   onClick={() => setPageNum(p => Math.max(1, p - 1))} 
                   className="p-1 px-2.5 text-slate-600 hover:bg-slate-200 disabled:opacity-30 flex items-center justify-center transition"
                   title="Previous Page"
                >
                   <ChevronLeft size={16} />
                </button>
                <div className="px-3 text-[10px] font-black text-slate-700 bg-white border-x border-slate-200 flex items-center min-w-[75px] justify-center tracking-wider select-none">
                    PAGE {pageNum} OF {numPages}
                </div>
                <button 
                   disabled={pageNum >= numPages || loading} 
                   onClick={() => setPageNum(p => Math.min(numPages, p + 1))} 
                   className="p-1 px-2.5 text-slate-600 hover:bg-slate-200 disabled:opacity-30 flex items-center justify-center transition"
                   title="Next Page"
                >
                   <ChevronRight size={16} />
                </button>
             </div>

             <div className="h-5 w-px bg-slate-200 shrink-0" />

             {/* Zoom Controls */}
             <div className="flex items-center gap-1.5 shrink-0">
                 <button 
                    onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} 
                    className="p-1.5 bg-slate-100 hover:bg-slate-250 text-slate-700 rounded-lg transition font-extrabold flex items-center justify-center w-6 h-6"
                    title="Zoom Out"
                 >
                    －
                 </button>
                 <span className="text-xs font-black text-slate-700 min-w-[40px] text-center select-none">
                    {Math.round(zoom * 100)}%
                 </span>
                 <button 
                    onClick={() => setZoom(z => Math.min(2.0, z + 0.1))} 
                    className="p-1.5 bg-slate-100 hover:bg-slate-250 text-slate-700 rounded-lg transition font-extrabold flex items-center justify-center w-6 h-6"
                    title="Zoom In"
                 >
                    ＋
                 </button>
                 
                 <div className="flex items-center gap-1.5 ml-2">
                     <button 
                        onClick={() => setZoom(1.4)} // 1.4 = Fit Width
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-indigo-600 rounded-lg transition"
                        title="Fit Width"
                     >
                        FIT WIDTH
                     </button>
                     <button 
                        onClick={() => setZoom(1.0)} // 1.0 = Fit Page
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-black text-slate-600 rounded-lg transition"
                        title="Fit Page / Reset"
                     >
                        FIT PAGE
                     </button>
                 </div>
             </div>
          </div>
        )}

        {/* Right Side: Search + Save Button */}
        <div className="flex gap-4 items-center shrink-0">
             {/* PDF Search Box */}
             {!loading && (
                 <div className="flex items-center gap-1.5">
                     {showSearchInput || searchQuery ? (
                         <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 gap-1.5 w-[140px] md:w-[170px] shadow-sm transition-all duration-300">
                             <Search size={13} className="text-indigo-600 shrink-0" />
                             <input 
                                type="text" 
                                placeholder="Search..." 
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 w-full placeholder-slate-400"
                                autoFocus
                             />
                             {searchQuery.trim() !== "" && (
                                 <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 rounded-md px-1 py-0.5 shrink-0 select-none">
                                     {searchResults.length}
                                 </span>
                             )}
                             <button 
                                onClick={() => {
                                    handleSearch("");
                                    setShowSearchInput(false);
                                }} 
                                className="text-slate-400 hover:text-slate-600 text-[10px] font-black px-0.5 shrink-0"
                                title="Close search"
                             >
                                ✕
                             </button>
                         </div>
                     ) : (
                         <button 
                            onClick={() => setShowSearchInput(true)}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-250 text-slate-600 hover:text-indigo-650 rounded-xl transition shadow-sm flex items-center justify-center w-8 h-8"
                            title="Search PDF text"
                          >
                            <Search size={14} />
                         </button>
                     )}
                 </div>
             )}

             <button onClick={handleSaveList} disabled={saving} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-black shadow-lg hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                 {saving ? <Loader2 size={16} className="animate-spin"/> : <Download size={16} />} Save PDF
             </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
         
         {/* Left Side: Toolbar */}
         <div className="w-[124px] md:w-[280px] shrink-0 bg-white border-r border-slate-100 p-4 flex flex-col gap-6 overflow-y-auto z-10 shadow-sm relative">
             
             {/* History Toolbar (Undo/Redo) */}
             <div className="flex gap-2 justify-between border-b border-slate-100 pb-3">
                 <button 
                     disabled={history.length === 0} 
                     onClick={handleUndo} 
                     className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 border border-slate-200 rounded-xl flex items-center justify-center gap-1 text-[11px] font-black text-slate-700 transition shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                     title="Undo (Ctrl+Z)"
                 >
                     Undo
                 </button>
                 <button 
                     disabled={redoHistory.length === 0} 
                     onClick={handleRedo} 
                     className="flex-1 py-1.5 px-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 border border-slate-200 rounded-xl flex items-center justify-center gap-1 text-[11px] font-black text-slate-700 transition shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                     title="Redo (Ctrl+Y)"
                 >
                     Redo
                 </button>
             </div>

              <div className="flex flex-col gap-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add overlays</h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => setTool("mouse")} className={`flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border rounded-2xl transition duration-200 ${tool === "mouse" ? 'bg-indigo-600 border-indigo-700 text-white shadow-md' : 'bg-slate-50/50 border-slate-200/60 text-slate-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
                          <MousePointer2 size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase">Select</span>
                      </button>
                      <button onClick={() => spawnElement("text")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <Type size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase">Text</span>
                      </button>
                      <button onClick={() => spawnElement("image")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <ImageIcon size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase">Image</span>
                      </button>
                      
                      <div className="h-px bg-slate-100 col-span-2 my-1" />
                      
                      <button onClick={() => spawnElement("box")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <Square size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase">Box</span>
                      </button>
                      <button onClick={() => spawnElement("circle")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <Circle size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase">Circle</span>
                      </button>
                      <button onClick={() => spawnElement("line")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <Minus size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase">Line</span>
                      </button>
                      <button onClick={() => spawnElement("arrow")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <ArrowLeft className="rotate-180" size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase">Arrow</span>
                      </button>
                      <button onClick={() => spawnElement("arc")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <span className="text-sm font-black -mt-1 leading-none select-none">⌒</span>
                          <span className="text-[9px] font-black tracking-wider uppercase mt-1">Arc Shape</span>
                      </button>
                      <button onClick={() => spawnElement("pentagon")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <Square size={16} className="opacity-0 absolute" />
                          <span className="text-[10px] font-bold">⬠</span>
                          <span className="text-[9px] font-black tracking-wider uppercase mt-1">Pentagon</span>
                      </button>
                      <button onClick={() => spawnElement("cloud")} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-600">
                          <Square size={16} className="opacity-0 absolute" />
                          <span className="text-[10px] font-bold">☁</span>
                          <span className="text-[9px] font-black tracking-wider uppercase mt-1">Cloud Shape</span>
                      </button>
                      
                      <button onClick={() => {
                          recordHistory();
                          const newEl: ElementType = {
                            id: Date.now().toString(),
                            type: "shape",
                            shapeType: "box",
                            color: "#ffffff",
                            fillColor: "#ffffff",
                            strokeWidth: 0,
                            opacity: 1,
                            x: 0.4,
                            y: 0.4,
                            w: 0.15,
                            h: 0.08
                          };
                          setElements(prev => [...prev, newEl]);
                          setSelectedId(newEl.id);
                          setTool("mouse");
                      }} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-605">
                          <Eraser size={16} />
                          <span className="text-[9px] font-black tracking-wider uppercase mt-1">Eraser / Mask</span>
                      </button>
                      
                      <button onClick={() => setShowSignatureModal(true)} className="flex flex-col items-center justify-center gap-1.5 py-3.5 px-2 border border-slate-200/60 rounded-2xl transition duration-200 bg-slate-50/50 text-slate-600 hover:border-indigo-400 hover:text-indigo-650 col-span-2">
                          <Signature size={16} className="text-indigo-600" />
                          <span className="text-[9px] font-black tracking-wider uppercase mt-1 text-indigo-700">Add Signature</span>
                      </button>
                  </div>
              </div>
         </div>
         
         {/* Main Editable Canvas Area */}
         <div ref={canvasAreaRef} className="flex-1 bg-[#e2e8f0] p-6 pb-36 flex justify-center items-start relative overflow-auto custom-scrollbar border-l border-white/50 min-h-0">
             {loading ? (
                <div className="flex flex-col items-center justify-center">
                   <Loader2 className="animate-spin w-10 h-10 text-indigo-500 mb-4" />
                </div>
             ) : (
                               <div 
                      ref={wrapperRef}
                      onPointerDown={handleCanvasClick}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerLeave={() => setHoveredTextItem(null)}
                      className={`relative shadow-2xl inline-block ${tool !== "mouse" ? "cursor-crosshair" : (hoveredTextItem ? "cursor-text" : "")}`}
                    >
                        {pageImage && (
                            <img 
                              src={pageImage} 
                              alt="PDF Background"
                              className="pointer-events-none select-none rounded-sm bg-white"
                              style={{ 
                                  display: 'block', 
                                  height: `calc((100vh - 200px) * ${zoom})`, 
                                  width: 'auto'
                              }}
                            />
                        )}
                        
                        {/* Hover Highlight Overlay */}
                        {hoveredTextItem && tool === "mouse" && (
                            <div 
                              className="absolute border border-dashed border-indigo-500 bg-indigo-500/10 pointer-events-none rounded-sm z-30 transition-all font-sans"
                              style={{
                                  left: `${(hoveredTextItem as any).x * 100}%`,
                                  top: `${(hoveredTextItem as any).y * 100}%`,
                                  width: `${(hoveredTextItem as any).w * 100}%`,
                                  height: `${(hoveredTextItem as any).h * 100}%`
                              }}
                            />
                        )}
                     
                        {/* Render Search Highlights */}
                        {searchQuery.trim() !== "" && searchResults.map((match, i) => (
                            <div
                               key={`match-${i}`}
                               className="absolute bg-yellow-400/40 border border-yellow-500 rounded-sm z-30 pointer-events-none"
                               style={{
                                   left: `${match.rect.x * 100}%`,
                                   top: `${match.rect.y * 100}%`,
                                   width: `${match.rect.w * 100}%`,
                                   height: `${match.rect.h * 100}%`
                               }}
                            />
                        ))}
                    
                        {/* Render Elements Overlap */}
                        {elements.filter(el => (el.page || 1) === pageNum).map(el => (
                            <CanvasElement
                               key={`${el.id}-${el.x}-${el.y}`}
                               el={el}
                               isSelected={selectedId === el.id}
                               isResizing={resizing?.id === el.id}
                               tool={tool}
                               zoom={zoom}
                               setSelectedId={setSelectedId}
                               updateElement={updateElement}
                               recordHistory={recordHistory}
                               setResizing={setResizing}
                               wrapperRef={wrapperRef}
                               pageDimensions={pageDimensions}
                            />
                        ))}
                   </div>
             )}
         </div>

         {/* Right Sidebar: Properties (iLovePDF Pro Style) */}
         <div className="w-[300px] shrink-0 bg-white border-l border-slate-100 p-4 flex flex-col gap-6 overflow-y-auto z-10 shadow-sm relative">
             <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                 <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">element properties</h4>
                 {selectedId && (
                     <button onClick={() => { setElements(els => els.filter(x => x.id !== selectedId)); setSelectedId(null); }} className="text-red-500 hover:text-red-700 transition" title="Delete Element">
                         <Trash2 size={15} />
                     </button>
                 )}
             </div>
             
             {selectedId ? (
                 (() => {
                     const el = elements.find(x => x.id === selectedId);
                     if (!el) return null;
                     
                     return (
                         <div className="flex flex-col gap-5">
                             
                             {/* TEXT SPECIFIC CONTROLS */}
                             {el.type === "text" && (
                                 <>
                                     <div className="flex flex-col gap-1.5">
                                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Font Family</label>
                                         <select 
                                            value={activeFontFamily} 
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                recordHistory();
                                                setActiveFontFamily(val);
                                                updateElement(selectedId, {fontFamily: val});
                                            }}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                                         >
                                            {FONT_OPTIONS.map(opt => (
                                                <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>
                                                    {opt.label}
                                                </option>
                                            ))}
                                         </select>
                                     </div>
                                     
                                     <div className="flex flex-col gap-1.5">
                                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Font Size</label>
                                         <div className="flex items-center gap-2">
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    const val = Math.max(1, activeFontSize - 1);
                                                    setActiveFontSize(val);
                                                    updateElement(selectedId, {fontSize: val});
                                                }}
                                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-205 flex items-center justify-center font-black text-slate-600 transition"
                                             >
                                                 -
                                             </button>
                                             <input 
                                                type="number" 
                                                value={activeFontSize}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value) || 12;
                                                    setActiveFontSize(val);
                                                    updateElement(selectedId, {fontSize: val});
                                                }}
                                                className="flex-1 w-12 text-center bg-slate-50 border border-slate-200 rounded-lg py-1 text-xs font-bold text-slate-700 outline-none"
                                             />
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    const val = activeFontSize + 1;
                                                    setActiveFontSize(val);
                                                    updateElement(selectedId, {fontSize: val});
                                                }}
                                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-205 flex items-center justify-center font-black text-slate-600 transition"
                                             >
                                                 +
                                             </button>
                                         </div>
                                     </div>
                                     
                                     <div className="flex flex-col gap-1">
                                         <div className="flex justify-between items-center mb-1">
                                            <label className="text-[10px] font-black text-slate-400 tracking-wider uppercase">Letter Spacing</label>
                                            <span className="text-[10px] font-bold text-indigo-600">{activeLetterSpacing}px</span>
                                         </div>
                                         <input 
                                            type="range" 
                                            min="-2" 
                                            max="15" 
                                            step="1" 
                                            value={activeLetterSpacing} 
                                            onPointerDown={() => recordHistory()}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setActiveLetterSpacing(val);
                                                updateElement(selectedId, {letterSpacing: val});
                                            }} 
                                            className="w-full accent-indigo-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" 
                                         />
                                     </div>

                                     <div className="flex flex-col gap-1.5">
                                         <label className="text-[10px] font-black text-slate-405 uppercase tracking-wider">Formatting</label>
                                         <div className="flex gap-2">
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    const val = activeFontWeight === "bold" ? "normal" : "bold";
                                                    setActiveFontWeight(val);
                                                    updateElement(selectedId, {fontWeight: val});
                                                }}
                                                className={`flex-1 py-2 rounded-xl border flex items-center justify-center transition font-black ${activeFontWeight === "bold" ? "bg-indigo-600 border-indigo-700 text-white shadow-sm" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                                             >
                                                 <Bold size={14} />
                                             </button>
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    const val = activeFontStyle === "italic" ? "normal" : "italic";
                                                    setActiveFontStyle(val);
                                                    updateElement(selectedId, {fontStyle: val});
                                                }}
                                                className={`flex-1 py-2 rounded-xl border flex items-center justify-center transition font-black ${activeFontStyle === "italic" ? "bg-indigo-600 border-indigo-700 text-white shadow-sm" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-105"}`}
                                             >
                                                 <Italic size={14} />
                                             </button>
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    const val = activeTextDecoration === "underline" ? "none" : "underline";
                                                    setActiveTextDecoration(val);
                                                    updateElement(selectedId, {textDecoration: val});
                                                }}
                                                className={`flex-1 py-2 rounded-xl border flex items-center justify-center transition font-black ${activeTextDecoration === "underline" ? "bg-indigo-600 border-indigo-700 text-white shadow-sm" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-105"}`}
                                             >
                                                 <Underline size={14} />
                                             </button>
                                         </div>
                                     </div>
                                     
                                     <div className="flex flex-col gap-1.5">
                                         <label className="text-[10px] font-black text-slate-405 uppercase tracking-wider">Alignment</label>
                                         <div className="flex gap-2">
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    setActiveTextAlign("left");
                                                    updateElement(selectedId, {textAlign: "left"});
                                                }}
                                                className={`flex-1 py-2 rounded-xl border flex items-center justify-center transition font-black ${activeTextAlign === "left" ? "bg-indigo-600 border-indigo-700 text-white shadow-sm" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                                             >
                                                 <AlignLeft size={14} />
                                             </button>
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    setActiveTextAlign("center");
                                                    updateElement(selectedId, {textAlign: "center"});
                                                }}
                                                className={`flex-1 py-2 rounded-xl border flex items-center justify-center transition font-black ${activeTextAlign === "center" ? "bg-indigo-600 border-indigo-700 text-white shadow-sm" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                                             >
                                                 <AlignCenter size={14} />
                                             </button>
                                             <button 
                                                onClick={() => {
                                                    recordHistory();
                                                    setActiveTextAlign("right");
                                                    updateElement(selectedId, {textAlign: "right"});
                                                }}
                                                className={`flex-1 py-2 rounded-xl border flex items-center justify-center transition font-black ${activeTextAlign === "right" ? "bg-indigo-600 border-indigo-700 text-white shadow-sm" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                                             >
                                                 <AlignRight size={14} />
                                             </button>
                                         </div>
                                     </div>
                                 </>
                             )}
                             
                             {/* COMMON STYLING PANELS */}
                             <div className="flex flex-col gap-1.5">
                                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Color / Border</label>
                                 <div className="flex flex-wrap gap-1.5">
                                     {/* Auto Color Selection Circle */}
                                     {el.type === "text" && (
                                         <button 
                                            onClick={() => handleAutoColor(selectedId)}
                                            className="w-6 h-6 rounded-full border border-slate-200 transition shadow-sm hover:scale-110 flex items-center justify-center bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white"
                                            title="Auto Color Selection (Sample text color from page)"
                                         >
                                            <Sparkles size={11} />
                                         </button>
                                     )}
                                     {["#000000", "#6b7280", "#d1d5db", "#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"].map(c => (
                                         <button key={c} onClick={() => { recordHistory(); setActiveColor(c); updateElement(selectedId, {color: c}); }}
                                            className={`w-6 h-6 rounded-full border border-slate-200 transition shadow-sm ${activeColor === c ? 'scale-125 ring-2 ring-indigo-400 ring-offset-1' : 'hover:scale-110'}`} style={{backgroundColor: c}}
                                         />
                                     ))}
                                 </div>
                             </div>
                             
                             {(el.type === "shape" || el.type === "text") && (
                                 <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-black text-slate-405 uppercase tracking-wider">
                                        {el.type === "text" ? "Background Color" : "Shape Fill"}
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        <button onClick={() => { recordHistory(); setActiveFill("transparent"); updateElement(selectedId, {fillColor: "transparent"}); }}
                                            className={`w-6 h-6 rounded-full border border-dashed border-slate-300 flex items-center justify-center transition ${activeFill === "transparent" ? 'scale-125 ring-2 ring-indigo-400 ring-offset-1 bg-slate-100' : 'hover:scale-110'}`}
                                        >
                                           <X size={10} className="text-slate-400"/>
                                        </button>
                                        {["#000000", "#6b7280", "#d1d5db", "#ffffff", "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"].map(c => (
                                            <button key={c} onClick={() => { recordHistory(); setActiveFill(c); updateElement(selectedId, {fillColor: c}); }}
                                               className={`w-6 h-6 rounded-full border border-slate-200 transition shadow-sm ${activeFill === c ? 'scale-125 ring-2 ring-indigo-400 ring-offset-1' : 'hover:scale-110'}`} style={{backgroundColor: c}}
                                            />
                                        ))}
                                    </div>
                                 </div>
                             )}
                             
                             <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center mb-1">
                                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Opacity</label>
                                   <span className="text-[10px] font-bold text-indigo-600">{Math.round(activeOpacity * 100)}%</span>
                                </div>
                                <input type="range" min="0.1" max="1" step="0.1" value={activeOpacity} 
                                    onPointerDown={() => recordHistory()}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setActiveOpacity(val);
                                        updateElement(selectedId, {opacity: val});
                                    }} className="w-full accent-indigo-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                             </div>
                             
                             {el.type === "shape" && (
                                 <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center mb-1">
                                       <label className="text-[10px] font-black text-slate-405 uppercase tracking-wider">Stroke Width</label>
                                       <span className="text-[10px] font-bold text-indigo-600">{activeStrokeWidth}px</span>
                                    </div>
                                    <input type="range" min="0" max="20" value={activeStrokeWidth} 
                                        onPointerDown={() => recordHistory()}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setActiveStrokeWidth(val);
                                            updateElement(selectedId, {strokeWidth: val});
                                        }} className="w-full accent-indigo-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                                 </div>
                             )}
                             
                             {/* Nudge & Shortcut Helper Tip */}
                             <div className="mt-4 p-3 bg-indigo-50/50 border border-indigo-100/50 rounded-xl flex items-start gap-2 select-none">
                                 <span className="text-xs text-indigo-600">💡</span>
                                 <div className="flex flex-col gap-0.5">
                                     <h5 className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">Keyboard Shortcuts</h5>
                                     <p className="text-[9px] font-bold text-slate-500 leading-relaxed">
                                         • Use <span className="text-indigo-650 font-black">Arrow keys</span> to nudge. (Hold <span className="text-indigo-650 font-black">Shift</span> to jump).<br />
                                         • If typing inside text box, press <span className="text-indigo-650 font-black">Escape</span> first, then use arrow keys.<br />
                                         • Press <span className="text-indigo-650 font-black">Delete / Backspace</span> to remove.
                                     </p>
                                 </div>
                             </div>
                             
                         </div>
                     );
                 })()
             ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                     <p className="text-xs font-bold text-slate-400">Select an element on the canvas to configure properties.</p>
                 </div>
             )}
         </div>

       </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 flex flex-col font-sans"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 tracking-wider uppercase">Add Signature</h3>
              <button 
                onClick={() => setShowSignatureModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1 m-4 rounded-xl">
              {[
                { id: "draw", label: "Draw" },
                { id: "type", label: "Type" },
                { id: "upload", label: "Upload Image" }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setSigModalTab(t.id as any)}
                  className={`flex-1 py-2 text-xs font-black tracking-wider uppercase rounded-lg transition-all ${sigModalTab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content Body */}
            <div className="px-6 pb-6 flex-1 flex flex-col min-h-[180px]">
              
              {/* Tab 1: Draw */}
              {sigModalTab === "draw" && (
                <div className="flex flex-col gap-3">
                  <div className="border border-slate-200 bg-slate-50 rounded-2xl overflow-hidden relative">
                    <canvas
                      ref={sigCanvasRef}
                      width={500}
                      height={180}
                      onMouseDown={startSigDrawing}
                      onMouseMove={drawSig}
                      onMouseUp={stopSigDrawing}
                      onMouseLeave={stopSigDrawing}
                      onTouchStart={startSigDrawing}
                      onTouchMove={drawSig}
                      onTouchEnd={stopSigDrawing}
                      className="w-full bg-[#fcfdfd] h-[180px] cursor-crosshair touch-none"
                    />
                    <div className="absolute bottom-2.5 left-3 text-[9px] font-bold text-slate-400 select-none pointer-events-none">
                      Draw signature in the space above
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    {/* Sig Colors */}
                    <div className="flex gap-1.5 items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase mr-1">Color:</span>
                      {["#000000", "#1e3a8b", "#0f766e", "#be123c"].map(c => (
                        <button 
                          key={c}
                          onClick={() => setSigColor(c)}
                          className={`w-5 h-5 rounded-full border transition ${sigColor === c ? 'scale-125 ring-2 ring-indigo-400 ring-offset-1' : 'hover:scale-110'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    
                    <button 
                      onClick={clearSigCanvas}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-10 border border-slate-200 text-[10px] font-black text-rose-500 rounded-xl transition"
                    >
                      CLEAR CANVAS
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Type */}
              {sigModalTab === "type" && (
                <div className="flex flex-col gap-4">
                  <input
                    type="text"
                    placeholder="Enter your name to sign..."
                    value={sigTypedName}
                    onChange={(e) => setSigTypedName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
                  />
                  
                  {/* Cursive Previews */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Select Style</span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "Great Vibes", fontName: "Great Vibes", cls: "font-['Great_Vibes']" },
                        { id: "Sacramento", fontName: "Sacramento", cls: "font-['Sacramento']" },
                        { id: "Pacifico", fontName: "Pacifico", cls: "font-['Pacifico']" },
                        { id: "Dancing Script", fontName: "Dancing Script", cls: "font-['Dancing_Script']" }
                      ].map(f => (
                        <button
                          key={f.id}
                          onClick={() => setSigTypedFont(f.fontName)}
                          className={`p-3 border rounded-xl transition-all text-left flex flex-col justify-center min-h-[64px] ${sigTypedFont === f.fontName ? 'border-indigo-500 bg-indigo-50/20' : 'border-slate-200 hover:border-slate-300 bg-slate-50/30'}`}
                        >
                          <span style={{ fontFamily: `"${f.fontName}", cursive`, color: sigColor }} className="text-xl">
                            {sigTypedName || "Signature Preview"}
                          </span>
                          <span className="text-[8px] font-black text-slate-400 tracking-wider uppercase mt-1">
                            {f.id}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-1.5 items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase mr-1">Color:</span>
                    {["#000000", "#1e3a8b", "#0f766e", "#be123c"].map(c => (
                      <button 
                        key={c}
                        onClick={() => setSigColor(c)}
                        className={`w-5 h-5 rounded-full border transition ${sigColor === c ? 'scale-125 ring-2 ring-indigo-400 ring-offset-1' : 'hover:scale-110'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 3: Upload */}
              {sigModalTab === "upload" && (
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 p-6 rounded-2xl transition cursor-pointer min-h-[160px] relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (eReader) => {
                          if (eReader.target?.result) {
                            spawnSignatureElement(eReader.target.result as string);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <ImageIcon className="text-slate-400 mb-2 w-8 h-8" />
                  <span className="text-xs font-black text-slate-600 tracking-wider uppercase">Upload Signature Image</span>
                  <span className="text-[9px] font-bold text-slate-400 mt-1">PNG format with transparent background is recommended</span>
                </div>
              )}

            </div>

            {/* Footer */}
            {sigModalTab !== "upload" && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2.5">
                <button
                  onClick={() => setShowSignatureModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-xs font-black tracking-wider uppercase rounded-xl transition text-slate-600"
                >
                  Cancel
                </button>
                <button
                  onClick={sigModalTab === "draw" ? handleSignatureDrawSubmit : handleSignatureTypeSubmit}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black tracking-wider uppercase rounded-xl transition shadow-md"
                >
                  Create Signature
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
