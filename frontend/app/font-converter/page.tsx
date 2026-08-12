"use client";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  ArrowLeftRight, 
  Copy, 
  Trash2, 
  Download, 
  HelpCircle, 
  Check, 
  FileText, 
  Sparkles, 
  Keyboard
} from "lucide-react";
import { api } from "@/lib/api";
import { optionalAuthHeaders } from "@/lib/auth";
import * as pdfjsLib from "pdfjs-dist";

// Initialize pdfjs worker in client-side context
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = "";
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => (item as any).str)
      .join(" ");
    fullText += pageText + "\n";
  }
  
  return fullText;
};

// ==============================================================================
// 1. MAPPING DICTIONARIES & LOGIC
// ==============================================================================

const DEVLYS_ARRAY_ONE = [
  "ñ","Q+Z","sas","aa",")Z","ZZ","‘","’","“","”",
  "å",  "ƒ",  "„",   "…",   "†",   "‡",   "ˆ",   "‰",   "Š",   "‹", 
  "¶+",   "d+", "[+k","[+", "x+",  "T+",  "t+", "M+", "<+", "Q+", ";+", "j+", "u+",
  "Ùk", "Ù", "ä", "–", "—","é","™","=kk","f=k",  
  "à",   "á",    "â",   "ã",   "ºz",  "º",   "í", "{k", "{", "=",  "«",   
  "Nî",   "Vî",    "Bî",   "Mî",   "<î", "|", "K", "}",
  "J",   "Vª",   "Mª",  "<ªª",  "Nª",   "Ø",  "Ý", "nzZ",  "æ", "ç", "Á", "xz", "#", ":",
  "v‚","vks",  "vkS",  "vk",    "v",  "b±", "Ã",  "bZ",  "b",  "m",  "Å",  ",s",  ",",   "_",
  "ô",  "d", "Dk", "D", "[k", "[", "x","Xk", "X", "Ä", "?k", "?",   "³", 
  "pkS",  "p", "Pk", "P",  "N",  "t", "Tk", "T",  ">", "÷", "¥",
  "ê",  "ë",   "V",  "B",   "ì",   "ï", "M+", "<+", "M",  "<", ".k", ".",    
  "r",  "Rk", "R",   "Fk", "F",  ")", "n", "/k", "èk",  "/", "Ë", "è", "u", "Uk", "U",   
  "i",  "Ik", "I",   "Q",    "¶",  "c", "Ck",  "C",  "Hk",  "H", "e", "Ek",  "E",
  ";",  "¸",   "j",    "y", "Yk",  "Y",  "G",  "o", "Ok", "O",
  "'k", "'",   "\"k",  "\"",  "l", "Lk",  "L",   "g", 
  "È", "z", 
  "Ì", "Í", "Î",  "Ï",  "Ñ",  "Ò",  "Ó",  "Ô",   "Ö",  "Ø",  "Ù","Ük", "Ü",
  "‚",    "ks",   "kS",   "k",  "h",    "q",   "w",   "`",    "s",    "S",
  "a",    "¡",    "%",     "W",  "•", "·", "∙", "·", "~j",  "~", "\\","+"," ः",
  "^", "*",  "Þ", "ß", "(", "¼", "½", "¿", "À", "¾", "A", "-", "&", "&", "Œ", "]","~ ","@"
];

const DEVLYS_ARRAY_TWO = [
  "॰","QZ+","sa","a","र्द्ध","Z","\"","\"","'","'",
  "०",  "१",  "२",  "३",     "४",   "५",  "६",   "७",   "८",   "९",   
  "फ़्",  "क़",  "ख़", "ख़्",  "ग़", "ज़्", "ज़",  "ड़",  "ढ़",   "फ़",  "य़",  "ऱ",  "ऩ",
  "त्त", "त्त्", "क्त",  "दृ",  "कृ","न्न","न्न्","=k","f=",
  "ह्न",  "ह्य",  "हृ",  "ह्म",  "ह्र",  "ह्",   "द्द",  "क्ष", "क्ष्", "त्र", "त्र्", 
  "छ्य",  "ट्य",  "ठ्य",  "ड्य",  "ढ्य", "द्य", "ज्ञ", "द्व",
  "श्र",  "ट्र",    "ड्र",    "ढ्र",    "छ्र",   "क्र",  "फ्र", "र्द्र",  "द्र",   "प्र", "प्र",  "ग्र", "रु",  "रू",
  "ऑ",   "ओ",  "औ",  "आ",   "अ", "ईं", "ई",  "ई",   "इ",  "उ",   "ऊ",  "ऐ",  "ए", "ऋ",
  "क्क", "क", "क", "क्", "ख", "ख्", "ग", "ग", "ग्", "घ", "घ", "घ्", "ङ",
  "चै",  "च", "च", "च्", "छ", "ज", "ज", "ज्",  "झ",  "झ्", "ञ",
  "टृ",   "ट्ठ",   "ट",   "ठ",   "ड्ड",   "ड्ढ",  "ड़", "ढ़", "ड",   "ढ", "ण", "ण्",   
  "त", "त", "त्", "थ", "थ्",  "द्ध",  "द", "ध", "ध", "ध्", "ध्", "ध्", "न", "न", "न्",    
  "प", "प", "प्",  "फ", "फ्",  "ब", "ब", "ब्",  "भ", "भ्",  "म",  "म", "म्",  
  "य", "य्",  "र", "ल", "ल", "ल्",  "ळ",  "व", "व", "व्",   
  "श", "श्",  "ष", "ष्", "स", "स", "स्", "ह", 
  "ीं", "्र",    
  "द्द", "ट्ट","ट्ठ","ड्ड","कृ","भ","्य","ड्ढ","झ्","क्र","त्त्","श","श्",
  "ॉ",  "ो",   "ौ",   "ा",   "ी",   "ु",   "ू",   "ृ",   "े",   "ै",
  "ं",   "ँ",   "ः",   "ॅ",  "ऽ", "ऽ", "ऽ", "ऽ", "्र",  "्", "?", "़",":",
  "‘",   "’",   "“",   "”",  ";",  "(",    ")",   "{",    "}",   "=", "।", ".", "-",  "µ", "॰", ",","् ","/"
];

const UNICODE_TO_KRUTIDEV_ONE = [
  "‘",   "’",   "“",   "”",   "(",    ")",   "{",    "}",   "=", "।",  "?",  "-",  "µ", "॰", ",", ".", "् ", 
  "०",  "१",  "२",  "३",     "४",   "५",  "६",   "७",   "८",   "९", "x", 
  "फ़्",  "क़",  "ख़",  "ग़", "ज़्", "ज़",  "ड़",  "ढ़",   "फ़",  "य़",  "ऱ",  "ऩ",
  "त्त्",   "त्त",     "क्त",  "दृ",  "कृ",
  "ह्न",  "ह्य",  "हृ",  "ह्म",  "ह्र",  "ह्",   "द्द",  "क्ष्", "क्ष", "त्र्", "त्र","ज्ञ",
  "छ्य",  "ट्य",  "ठ्य",  "ड्य",  "ढ्य", "द्य","द्व",
  "श्र",  "ट्र",    "ड्र",    "ढ्र",    "छ्र",   "क्र",  "फ्र",  "द्र",   "प्र",   "ग्र", "रु",  "रू",
  "्र",
  "ओ",  "औ",  "आ",   "अ",   "ई",   "इ",  "उ",   "ऊ",  "ऐ",  "ए", "ऋ",
  "क्",  "क",  "क्क",  "ख्",   "ख",    "ग्",   "ग",  "घ्",  "घ",    "ङ",
  "चै",   "च्",   "च",   "छ",  "ज्", "ज",   "झ्",  "झ",   "ञ",
  "ट्ट",   "ट्ठ",   "ट",   "ठ",   "ड्ड",   "ड्ढ",  "ड",   "ढ",  "ण्", "ण",  
  "त्",  "त",  "थ्", "थ",  "द्ध",  "द", "ध्", "ध",  "न्",  "न",  
  "प्",  "प",  "फ्", "फ",  "ब्",  "ब", "भ्",  "भ",  "म्",  "म",
  "य्",  "य",  "र",  "ल्", "ल",  "ळ",  "व्",  "व", 
  "श्", "श",  "ष्", "ष",  "स्",   "स",   "ह",     
  "ऑ",   "ॉ",  "ो",   "ौ",   "ा",   "ी",   "ु",   "ू",   "ृ",   "े",   "ै",
  "ं",   "ँ",   "ः",   "ॅ",    "ऽ",  "् ", "्"
];

const UNICODE_TO_KRUTIDEV_TWO = [
  "^", "*",  "Þ", "ß", "¼", "½", "¿", "À", "¾", "A", "\\", "&", "&", "Œ", "]","-","~ ", 
  "å",  "ƒ",  "„",   "…",   "†",   "‡",   "ˆ",   "‰",   "Š",   "‹","Û",
  "¶",   "d",    "[k",  "x",  "T",  "t",   "M+", "<+", "Q",  ";",    "j",   "u",
  "Ù",   "Ùk",   "ä",    "–",   "—",       
  "à",   "á",    "â",   "ã",   "ºz",  "º",   "í", "{", "{k",  "«", "=","K", 
  "Nî",   "Vî",    "Bî",   "Mî",   "<î", "|","}",
  "J",   "Vª",   "Mª",  "<ªª",  "Nª",   "Ø",  "Ý",   "æ", "ç", "xz", "#", ":",
  "z",
  "vks",  "vkS",  "vk",    "v",   "bZ",  "b",  "m",  "Å",  ",s",  ",",   "_",
  "D",  "d",    "ô",     "[",     "[k",    "X",   "x",  "?",    "?k",   "³", 
  "pkS",  "P",    "p",  "N",   "T",    "t",   "÷",  ">",   "¥",
  "ê",      "ë",      "V",  "B",   "ì",       "ï",     "M",  "<",  ".", ".k",   
  "R",  "r",   "F", "Fk",  ")",    "n", "/",  "/k",  "U", "u",   
  "I",  "i",   "¶", "Q",   "C",  "c",  "H",  "Hk", "E",   "e",
  "¸",   ";",    "j",  "Y",   "y",  "G",  "O",  "o",
  "'", "'k",  "\"", "\"k", "L",   "l",   "g",      
  "v‚",    "‚",    "ks",   "kS",   "k",     "h",    "q",   "w",   "`",    "s",    "S",
  "a",    "¡",    "%",     "W",   "·",   "~ ", "~"
];

const PREETI_UNICODE_DICT: { [key: string]: string } = {
  "अ": "c", "आ": "cf", "ा": "f", "इ": "O", "ई": "O{", "र्": "{", "उ": "p", "ए": "P",
  "े": "]", "ै": "}", "ो": "f]", "ौ": "f}", "ओ": "cf]", "औ": "cf}", "ं": "+", "ँ": "F",
  "ि": "l", "ी": "L", "ु": "'", "ू": '"', "क": "s", "ख": "v", "ग": "u", "घ": "3",
  "ङ": "ª", "च": "r", "छ": "5", "ज": "h", "झ": "´", "ञ": "`", "ट": "6", "ठ": "7",
  "ड": "8", "ढ": "9", "ण": "0f", "त": "t", "थ": "y", "द": "b", "ध": "w", "न": "g",
  "प": "k", "फ": "km", "ब": "a", "भ": "e", "म": "d", "य": "o", "र": "/", "रू": "?",
  "ृ": "[", "ल": "n", "व": "j", "स": ";", "श": "z", "ष": "if", "ज्ञ": "1", "ह": "x",
  "१": "!", "२": "@", "३": "#", "४": "$", "५": "%", "६": "^", "७": "&", "८": "*",
  "९": "(", "०": ")", "।": ".", "्": "\\", "ऊ": "pm", "-": " ", "(": "-", ")": "_"
};

const PREETI_TO_UNICODE_DICT: { [key: string]: string } = {
  "÷": "/", "v": "ख", "r": "च", "\"": "ू", "~": "ञ्", "z": "श", "ç": "ॐ", "f": "ा",
  "b": "द", "n": "ल", "j": "व", "×": "×", "V": "ख्", "R": "च्", "ß": "द्म", "^": "६",
  "Û": "!", "Z": "श्", "F": "ँ", "B": "द्य", "N": "ल्", "Ë": "ङ्ग", "J": "व्", "6": "ट",
  "2": "द्द", "¿": "रू", ">": "श्र", ":": "स्", "§": "ट्ट", "&": "७", "£": "घ्",
  "•": "ड्ड", ".": "।", "«": "्र", "*": "८", "„": "ध्र", "w": "ध", "s": "क", "g": "न",
  "æ": "“", "c": "अ", "o": "य", "k": "प", "W": "ध्", "Ö": "=", "S": "क्", "Ò": "¨",
  "_": ")", "[": "ृ", "Ú": "’", "G": "न्", "ˆ": "फ्", "C": "ऋ", "O": "इ", "Î": "ङ्ख",
  "K": "प्", "7": "ठ", "¶": "ठ्ठ", "3": "घ", "9": "ढ", "?": "रु", ";": "स", "'": "ु",
  "#": "३", "¢": "द्घ", "/": "र", "+": "ं", "ª": "ङ", "t": "त", "p": "उ", "|": "्र",
  "x": "ह", "å": "द्व", "d": "म", "`": "ञ", "l": "ि", "h": "ज", "T": "त्", "P": "ए",
  "Ý": "ट्ठ", "\\": "्", "Ù": ";", "X": "ह्", "Å": "हृ", "D": "म्", "@": "२", "Í": "ङ्क",
  "L": "ी", "H": "ज्", "4": "द्ध", "±": "+", "0": "ण्", "<": "?", "8": "ड", "¥": "र्‍",
  "$": "४", "¡": "ज्ञ्", ",": ",", "©": "र", "(": "९", "‘": "ॅ", "u": "ग", "q": "त्र",
  "}": "ै", "y": "थ", "e": "भ", "a": "ब", "i": "ष्", "‰": "झ्", "U": "ग्", "Q": "त्त",
  "]": "े", "˜": "ऽ", "Y": "थ्", "Ø": "्य", "E": "भ्", "A": "ब्", "M": "ः", "Ì": "nn",
  "I": "क्ष्", "5": "छ", "´": "झ", "1": "ज्ञ", "°": "ङ्ढ", "=": ".", "Æ": "”",
  "‹": "ङ्घ", "%": "५", "¤": "झ्", "!": "१", "-": "(", "›": "द्र", ")": "०", "…": "‘",
  "Ü": "%"
};

function replaceAll(str: string, search: string, replacement: string): string {
  return str.split(search).join(replacement);
}

function clientKrutidevToUnicode(text: string): string {
  if (!text) return "";
  let out = text;
  for (let i = 0; i < DEVLYS_ARRAY_ONE.length; i++) {
    out = replaceAll(out, DEVLYS_ARRAY_ONE[i], DEVLYS_ARRAY_TWO[i]);
  }

  out = replaceAll(out, "±", "Zं");
  out = replaceAll(out, "Æ", "र्f");

  let pos = out.indexOf("f");
  while (pos !== -1) {
    if (pos + 1 < out.length) {
      const nextChar = out.charAt(pos + 1);
      out = out.substring(0, pos) + nextChar + "ि" + out.substring(pos + 2);
    } else {
      out = out.substring(0, pos) + "ि";
    }
    pos = out.indexOf("f", pos + 1);
  }

  out = replaceAll(out, "Ç", "fa");
  out = replaceAll(out, "É", "र्fa");
  pos = out.indexOf("fa");
  while (pos !== -1) {
    if (pos + 2 < out.length) {
      const nextChar = out.charAt(pos + 2);
      out = out.substring(0, pos) + nextChar + "िं" + out.substring(pos + 3);
    } else {
      out = out.substring(0, pos) + "िं";
    }
    pos = out.indexOf("fa", pos + 1);
  }

  out = replaceAll(out, "Ê", "ीZ");

  pos = out.indexOf("ि्");
  while (pos !== -1) {
    if (pos + 2 < out.length) {
      const nextChar = out.charAt(pos + 2);
      out = out.substring(0, pos) + "्" + nextChar + "ि" + out.substring(pos + 3);
    }
    pos = out.indexOf("ि्", pos + 2);
  }

  const setOfMatras = "अ आ इ ई उ ऊ ए ऐ ओ औ ा ि ी ु ू ृ े ै ो ौ ं : ँ ॅ";
  const matrasSet = new Set(setOfMatras.split(" "));
  let posZ = out.indexOf("Z");
  while (posZ > 0) {
    let probPos = posZ - 1;
    while (probPos >= 0 && matrasSet.has(out.charAt(probPos))) {
      probPos--;
    }
    const charsToMove = out.substring(probPos, posZ);
    out = out.substring(0, probPos) + "र्" + charsToMove + out.substring(posZ + 1);
    posZ = out.indexOf("Z");
  }

  return out;
}

function clientUnicodeToKrutidev(text: string): string {
  if (!text) return "";
  let out = text;
  const nuktas = [
    ["क़", "क़"], ["ख़‌", "ख़"], ["ग़", "ग़"], ["ज़", "ज़"], ["ड़", "ड़"], 
    ["ढ़", "ढ़"], ["ऩ", "ऩ"], ["फ़", "फ़"], ["य़", "य़"], ["ऱ", "ऱ"]
  ];
  for (const pair of nuktas) {
    out = replaceAll(out, pair[0], pair[1]);
  }

  let posI = out.indexOf("ि");
  while (posI !== -1) {
    if (posI > 0) {
      const charLeft = out.charAt(posI - 1);
      out = out.substring(0, posI - 1) + "f" + charLeft + out.substring(posI + 1);
      let newPos = posI - 1;
      while (newPos > 1 && out.charAt(newPos - 1) === "्") {
        const halfCons = out.charAt(newPos - 2);
        out = out.substring(0, newPos - 2) + "f" + halfCons + "्" + out.substring(newPos + 1);
        newPos -= 2;
      }
      posI = out.indexOf("ि", newPos + 2);
    } else {
      posI = out.indexOf("ि", posI + 1);
    }
  }

  const setOfMatras = "ािीुूृेैोौं:ँॅ";
  const matrasSet = new Set(setOfMatras.split(""));
  let posR = out.indexOf("र्");
  while (posR !== -1) {
    let probZ = posR + 2;
    while (probZ + 1 < out.length && matrasSet.has(out.charAt(probZ + 1))) {
      probZ++;
    }
    const cluster = out.substring(posR + 2, probZ + 1);
    out = out.substring(0, posR) + cluster + "Z" + out.substring(probZ + 1);
    posR = out.indexOf("र्");
  }

  for (let i = 0; i < UNICODE_TO_KRUTIDEV_ONE.length; i++) {
    out = replaceAll(out, UNICODE_TO_KRUTIDEV_ONE[i], UNICODE_TO_KRUTIDEV_TWO[i]);
  }

  return out;
}

function clientPreetiToUnicode(text: string): string {
  if (!text) return "";
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    out += PREETI_TO_UNICODE_DICT[c] || c;
  }

  out = replaceAll(out, "्ा", "");

  // Simulated Javascript regex logic from original library
  // (त्र|त्त)([^उभप]+?)m -> \1m\2
  out = out.replace(/(त्र|त्त)([^उभप]+?)m/g, "$1m$2");
  out = replaceAll(out, "त्रm", "क्र");
  out = replaceAll(out, "त्तm", "क्त");
  out = out.replace(/([^उभप]+?)m/g, "m$1");
  out = replaceAll(out, "उm", "ऊ");
  out = replaceAll(out, "भm", "झ");
  out = replaceAll(out, "पm", "फ");
  out = replaceAll(out, "इ{", "ई");

  // Vowel direction fix (ि)
  out = out.replace(/ि((?:.्)*[^्])/g, "$1ि");
  out = out.replace(/((?:.[ािीुूृेैोौंःँ]*?)){/g, "{$1");
  out = out.replace(/((?:.्)*){/g, "{$1");
  out = replaceAll(out, "{", "र्");
  out = out.replace(/([ाीुूृेैोौंःँ]+?)(्(?:.्)*[^्])/g, "$2$1");
  out = out.replace(/्([ाीुूृेैोौंःँ]+?)((?:.्)*[^्])/g, "्$2$1");
  out = out.replace(/([ंँ])([ािीुूृेैोौः]*)/g, "$2$1");

  // clean double characters
  out = replaceAll(out, "ँँ", "ँ");
  out = replaceAll(out, "ंं", "ं");
  out = replaceAll(out, "ेे", "े");
  out = replaceAll(out, "ैै", "ै");
  out = replaceAll(out, "ुु", "ु");
  out = replaceAll(out, "ूू", "ू");

  // final correction rules
  out = out.replace(/^ः/g, ":");
  out = replaceAll(out, "टृ", "ट्ट");
  out = replaceAll(out, "ेा", "ाे");
  out = replaceAll(out, "ैा", "ाै");
  out = replaceAll(out, "अाे", "ओ");
  out = replaceAll(out, "अाै", "औ");
  out = replaceAll(out, "अा", "आ");
  out = replaceAll(out, "एे", "ऐ");
  out = replaceAll(out, "ाे", "ो");
  out = replaceAll(out, "ाै", "ौ");

  return out;
}

function clientUnicodeToPreeti(text: string): string {
  if (!text) return "";
  let index = -1;
  let normalized = "";
  const preetiSet = new Set("wertyuxasdghjkzvn".split(""));

  // 1. normalizeUnicode
  while (index + 1 < text.length) {
    index++;
    const character = text.charAt(index);
    try {
      if (character !== "र") {
        if (index + 2 < text.length && text.charAt(index + 1) === "्" && ![" ", "।", ","].includes(text.charAt(index + 2))) {
          if (text.charAt(index + 2) !== "र") {
            const preetiVal = PREETI_UNICODE_DICT[character];
            if (preetiVal && preetiSet.has(preetiVal)) {
              normalized += String.fromCharCode(preetiVal.charCodeAt(0) - 32);
              index++;
              continue;
            } else if (character === "स") {
              normalized += ":";
              index++;
              continue;
            } else if (character === "ष") {
              normalized += "i";
              index++;
              continue;
            }
          }
        }
      }
      if (index > 0 && index + 1 < text.length && text.charAt(index - 1) !== "र" && character === "्" && text.charAt(index + 1) === "र") {
        if (!["ट", "ठ", "ड"].includes(text.charAt(index - 1))) {
          normalized += "|";
          index++;
          continue;
        } else {
          normalized += "«";
          index++;
          continue;
        }
      }
    } catch {
      /* ignore */
    }
    normalized += character;
  }

  normalized = replaceAll(normalized, "त|", "q");

  // 2. convert
  let converted = "";
  index = -1;
  while (index + 1 < normalized.length) {
    index++;
    const character = normalized.charAt(index);
    if (character === "\ufeff") {
      continue;
    }
    try {
      if (index + 1 < normalized.length && normalized.charAt(index + 1) === "ि") {
        if (character === "q") {
          converted += "l" + character;
        } else {
          converted += "l" + (PREETI_UNICODE_DICT[character] || character);
        }
        index++;
        continue;
      }

      if (index + 2 < normalized.length && normalized.charAt(index + 2) === "ि") {
        if ("WERTYUXASDGHJK:ZVN".includes(character)) {
          if (normalized.charAt(index + 1) !== "q") {
            converted += "l" + character + (PREETI_UNICODE_DICT[normalized.charAt(index + 1)] || normalized.charAt(index + 1));
            index += 2;
            continue;
          } else {
            converted += "l" + character + "q";
            index += 2;
            continue;
          }
        }
      }

      if (index + 2 < normalized.length && normalized.charAt(index + 1) === "्" && character === "र") {
        const nextChar = normalized.charAt(index + 3);
        if (["ा", "ो", "ौ", "े", "ै", "ी"].includes(nextChar)) {
          converted += (PREETI_UNICODE_DICT[normalized.charAt(index + 2)] || normalized.charAt(index + 2)) + (PREETI_UNICODE_DICT[nextChar] || nextChar) + "{";
          index += 3;
          continue;
        } else if (nextChar === "ि") {
          converted += (PREETI_UNICODE_DICT[nextChar] || nextChar) + (PREETI_UNICODE_DICT[normalized.charAt(index + 2)] || normalized.charAt(index + 2)) + "{";
          index += 3;
          continue;
        }
        converted += (PREETI_UNICODE_DICT[normalized.charAt(index + 2)] || normalized.charAt(index + 2)) + "{";
        index += 2;
        continue;
      }

      if (index + 3 < normalized.length && normalized.charAt(index + 3) === "ि") {
        if (["|", "«"].includes(normalized.charAt(index + 2))) {
          if ("WERTYUXASDGHJK:ZVNIi".includes(character)) {
            converted += "l" + character + (PREETI_UNICODE_DICT[normalized.charAt(index + 1)] || normalized.charAt(index + 1)) + normalized.charAt(index + 2);
            index += 3;
            continue;
          }
        }
      }
    } catch {
      /* ignore */
    }
    converted += PREETI_UNICODE_DICT[character] || character;
  }

  converted = replaceAll(converted, "Si", "I");
  converted = replaceAll(converted, "H`", "1");
  converted = replaceAll(converted, "b\\w", "4");
  converted = replaceAll(converted, "z|", ">");
  converted = replaceAll(converted, "/'", "?");
  converted = replaceAll(converted, '/"', "¿");
  converted = replaceAll(converted, "Tt", "Q");
  converted = replaceAll(converted, "b\\lj", "lå");
  converted = replaceAll(converted, "b\\j", "å");
  converted = replaceAll(converted, "0f\\", "0");
  converted = replaceAll(converted, "`\\", "~");
  return converted;
}


// ==============================================================================
// 2. FRONTEND REACT COMPONENT
// ==============================================================================

type ConversionType = 
  | "krutidev_to_unicode" 
  | "unicode_to_krutidev" 
  | "devlys_to_unicode"
  | "unicode_to_devlys" 
  | "preeti_to_unicode" 
  | "unicode_to_preeti";

export default function FontConverter() {
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [conversionType, setConversionType] = useState<ConversionType>("krutidev_to_unicode");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [fileParsing, setFileParsing] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setFileParsing(true);
    try {
      if (file.name.toLowerCase().endsWith(".txt")) {
        const text = await file.text();
        setSourceText(text);
      } else if (file.name.toLowerCase().endsWith(".pdf")) {
        const text = await extractTextFromPDF(file);
        setSourceText(text);
      } else {
        alert("Unsupported file format! Please upload a .txt or .pdf file.");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error parsing file: " + (err.message || String(err)));
    } finally {
      setFileParsing(false);
      e.target.value = "";
    }
  };

  // Run Conversion instantly on sourceText change
  useEffect(() => {
    if (!sourceText) {
      setTargetText("");
      return;
    }

    let result = "";
    switch (conversionType) {
      case "krutidev_to_unicode":
      case "devlys_to_unicode":
        result = clientKrutidevToUnicode(sourceText);
        break;
      case "unicode_to_krutidev":
      case "unicode_to_devlys":
        result = clientUnicodeToKrutidev(sourceText);
        break;
      case "preeti_to_unicode":
        result = clientPreetiToUnicode(sourceText);
        break;
      case "unicode_to_preeti":
        result = clientUnicodeToPreeti(sourceText);
        break;
      default:
        break;
    }
    setTargetText(result);
  }, [sourceText, conversionType]);

  // Copy to Clipboard helper
  const handleCopy = async () => {
    if (!targetText) return;
    try {
      await navigator.clipboard.writeText(targetText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Failed to copy text");
    }
  };

  // Swap Conversion direction helper
  const handleSwap = () => {
    let nextType = conversionType;
    if (conversionType === "krutidev_to_unicode") nextType = "unicode_to_krutidev";
    else if (conversionType === "unicode_to_krutidev") nextType = "krutidev_to_unicode";
    else if (conversionType === "devlys_to_unicode") nextType = "unicode_to_devlys";
    else if (conversionType === "unicode_to_devlys") nextType = "devlys_to_unicode";
    else if (conversionType === "preeti_to_unicode") nextType = "unicode_to_preeti";
    else if (conversionType === "unicode_to_preeti") nextType = "preeti_to_unicode";

    setConversionType(nextType);
    setSourceText(targetText);
  };

  // Trigger backend-supported verification
  const handleBackendConvert = async () => {
    if (!sourceText) return;
    setLoading(true);
    try {
      const res = await axios.post(
        api("/converters/font-convert"),
        { text: sourceText, conversion_type: conversionType },
        { headers: optionalAuthHeaders() }
      );
      if (res.data && res.data.converted_text) {
        setTargetText(res.data.converted_text);
      }
    } catch {
      alert("Backend conversion failed. Using local high-fidelity converter instead.");
    } finally {
      setLoading(false);
    }
  };

  // Download converted text as .txt file helper
  const handleDownloadTxt = () => {
    if (!targetText) return;
    const blob = new Blob([targetText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Converted_${conversionType}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSourceLabel = () => {
    if (conversionType.startsWith("unicode_")) return "Unicode Devanagari (Mangal/Arial)";
    if (conversionType.startsWith("krutidev_")) return "Kruti Dev 010 (Remington Keyboard)";
    if (conversionType.startsWith("devlys_")) return "DevLys 010 (Remington Keyboard)";
    return "Preeti (Traditional Nepali)";
  };

  const getTargetLabel = () => {
    if (conversionType.endsWith("_unicode")) return "Unicode Devanagari (Mangal/Arial)";
    if (conversionType.endsWith("_krutidev")) return "Kruti Dev 010 (Remington Keyboard)";
    if (conversionType.endsWith("_devlys")) return "DevLys 010 (Remington Keyboard)";
    return "Preeti (Traditional Nepali)";
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 animate-fade-in">
      {/* --- Premium Header Section --- */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-red-600 rounded-2xl p-6 md:p-8 mb-8 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 text-white">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold flex items-center gap-3">
            <Sparkles className="w-9 h-9 animate-pulse text-amber-200" />
            Hindi & Nepali Font Converter
          </h1>
          <p className="text-orange-100 mt-2 text-sm md:text-base font-medium">
            Remington Layout (Kruti Dev, DevLys, Preeti) ⇄ High-Fidelity Unicode (Mangal)
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowHelp(true)}
            className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-sm"
          >
            <HelpCircle size={18} />
            <span>Help Guide</span>
          </button>
          <div className="hidden lg:block bg-black/20 border border-white/10 px-4 py-2.5 rounded-xl text-xs font-semibold text-orange-200">
            🛡️ Zero-Latency Offline Processing
          </div>
        </div>
      </div>

      {/* --- Main Workspace Layout --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
        
        {/* ================= LEFT SIDE: INPUT ================= */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-5 flex flex-col hover:shadow-lg transition-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-100 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="bg-orange-500/20 text-orange-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">A</span>
                <span className="font-bold text-gray-800 text-sm">{getSourceLabel()}</span>
              </div>
              
              {/* File Import Button */}
              <label 
                className={`flex items-center gap-1.5 px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-bold cursor-pointer transition select-none ${fileParsing ? "opacity-60 cursor-not-allowed" : ""}`}
                title="Import content from local text (.txt) or digital PDF (.pdf) file"
              >
                <Download size={13} className="rotate-180 text-orange-600" />
                <span>{fileParsing ? "Extracting..." : "Import File (.txt, .pdf)"}</span>
                <input 
                  type="file" 
                  accept=".txt,.pdf" 
                  onChange={handleFileUpload} 
                  disabled={fileParsing} 
                  className="hidden" 
                />
              </label>
            </div>
            
            {/* Conversion Selector Dropdown */}
            <select
              value={conversionType}
              onChange={(e) => setConversionType(e.target.value as ConversionType)}
              className="px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="krutidev_to_unicode">Kruti Dev 010 ➜ Unicode (Mangal)</option>
              <option value="unicode_to_krutidev">Unicode (Mangal) ➜ Kruti Dev 010</option>
              <option value="devlys_to_unicode">DevLys 010 ➜ Unicode (Mangal)</option>
              <option value="unicode_to_devlys">Unicode (Mangal) ➜ DevLys 010</option>
              <option value="preeti_to_unicode">Preeti (Nepali) ➜ Unicode (Mangal)</option>
              <option value="unicode_to_preeti">Unicode (Mangal) ➜ Preeti (Nepali)</option>
            </select>
          </div>

          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder={
              conversionType.startsWith("unicode_") 
                ? "यहाँ हिंदी / नेपाली यूनिकोड (जैसे मंगल) टेक्स्ट टाइप या पेस्ट करें..." 
                : "Type or paste legacy text here (e.g., dkj produces कार in Kruti Dev)..."
            }
            className="w-full h-80 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none text-slate-900 font-medium placeholder-gray-400 text-base resize-none bg-gray-50/50"
            style={{
              fontFamily: conversionType.startsWith("unicode_") ? "inherit" : "remington, Courier, monospace"
            }}
          />

          <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
            <span>Characters: <strong className="text-gray-800 font-semibold">{sourceText.length}</strong></span>
            {sourceText && (
              <button 
                onClick={() => setSourceText("")}
                className="text-red-500 hover:text-red-700 font-bold transition flex items-center gap-1"
              >
                <Trash2 size={13} /> Clear Input
              </button>
            )}
          </div>
        </div>

        {/* ================= MIDDLE SWAP CONTROL ================= */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden lg:block">
          <button 
            onClick={handleSwap}
            className="bg-white hover:bg-orange-500 text-gray-700 hover:text-white p-3 rounded-full shadow-lg border border-gray-200 hover:border-orange-400 transition-all transform hover:rotate-180 duration-500 flex items-center justify-center"
            title="Swap conversion inputs"
          >
            <ArrowLeftRight className="w-5 h-5" />
          </button>
        </div>

        {/* ================= RIGHT SIDE: OUTPUT ================= */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-5 flex flex-col hover:shadow-lg transition-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="bg-green-500/20 text-green-700 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs">B</span>
              <span className="font-bold text-gray-800 text-sm">{getTargetLabel()}</span>
            </div>

            {/* Quick Swap for Mobile */}
            <button 
              onClick={handleSwap}
              className="lg:hidden self-start px-3 py-1 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg text-xs font-bold border border-orange-200 flex items-center gap-1 transition"
            >
              <ArrowLeftRight size={12} /> Swap Mappings
            </button>
          </div>

          <textarea
            value={targetText}
            readOnly
            placeholder="Converted text will appear here automatically..."
            className="w-full h-80 px-4 py-3 border border-gray-200 rounded-xl outline-none text-slate-900 bg-gray-50/30 text-base resize-none font-medium focus:ring-1 focus:ring-gray-300"
            style={{
              fontFamily: conversionType.endsWith("_unicode") ? "inherit" : "remington, Courier, monospace"
            }}
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-500">Characters: <strong className="text-gray-800 font-semibold">{targetText.length}</strong></span>
            
            <div className="flex items-center gap-2 flex-wrap">

              {targetText && (
                <>
                  <button 
                    onClick={handleDownloadTxt}
                    className="bg-orange-50 border border-orange-200 hover:bg-orange-100 text-orange-600 px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1"
                  >
                    <Download size={13} /> Download .txt
                  </button>
                  
                  <button 
                    onClick={handleCopy}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm ${
                      copied 
                        ? "bg-green-600 text-white" 
                        : "bg-orange-600 hover:bg-orange-700 text-white"
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={13} /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={13} /> Copy Output
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* --- Educational Remington Typing Helper Panel --- */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mt-8 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
          <Keyboard className="text-orange-500 w-5 h-5" /> Remington Layout & Vowels Conversion Reference
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-slate-650">
          <div className="bg-white border rounded-xl p-4 shadow-subtle hover:border-orange-500/25 transition">
            <h4 className="font-bold text-orange-700 mb-2">Key Mappings (Kruti Dev)</h4>
            <ul className="space-y-1.5 text-xs">
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">d</kbd> ➜ <span className="font-semibold text-slate-800">क</span> (Ka)</li>
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">k</kbd> ➜ <span className="font-semibold text-slate-800">ा</span> (aa matra)</li>
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">f</kbd> ➜ <span className="font-semibold text-slate-800">ि</span> (chhoti-i matra)</li>
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">s</kbd> ➜ <span className="font-semibold text-slate-800">ए</span> / <span className="font-semibold text-slate-800">े</span> (e / matra)</li>
            </ul>
          </div>
          <div className="bg-white border rounded-xl p-4 shadow-subtle hover:border-orange-500/25 transition">
            <h4 className="font-bold text-orange-700 mb-2">Key Mappings (Preeti)</h4>
            <ul className="space-y-1.5 text-xs">
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">s</kbd> ➜ <span className="font-semibold text-slate-800">क</span> (Ka)</li>
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">f</kbd> ➜ <span className="font-semibold text-slate-800">ा</span> (aa matra)</li>
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">l</kbd> ➜ <span className="font-semibold text-slate-800">ि</span> (chhoti-i matra)</li>
              <li><kbd className="px-1.5 py-0.5 border rounded bg-slate-100">]</kbd> ➜ <span className="font-semibold text-slate-800">े</span> (e matra)</li>
            </ul>
          </div>
          <div className="bg-white border rounded-xl p-4 shadow-subtle hover:border-orange-500/25 transition">
            <h4 className="font-bold text-orange-700 mb-2">Important Instructions</h4>
            <p className="text-xs leading-relaxed text-slate-500">
              Legacy fonts use ASCII keyboards to represent Devanagari shapes. In legacy systems, matras are typed before characters. Our converter solves this by automatically reordering conjuncts, matras and half-R (reph) tags into correct Unicode sequence format.
            </p>
          </div>
        </div>
      </div>

      {/* ❓ Help / Explanation Modal */}
      {showHelp && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-6" onClick={() => setShowHelp(false)}>
          <div className="bg-white p-6 rounded-xl shadow-2xl text-left w-full max-w-lg relative z-60" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 text-slate-850 flex items-center gap-2">
              <Sparkles className="text-orange-500" /> Font Converters Guide
            </h2>
            <div className="space-y-4 text-slate-650 text-sm">
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-orange-600 font-bold">1</span>
                <div>
                  <p className="font-semibold text-slate-800">Kruti Dev ⇄ Unicode</p>
                  <p className="text-xs text-slate-500">Converts Remington Hindi layout typed files into standardized digital Hindi (Unicode / Mangal font) readable on the web.</p>
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-orange-600 font-bold">2</span>
                <div>
                  <p className="font-semibold text-slate-800">Preeti ⇄ Unicode</p>
                  <p className="text-xs text-slate-500">Translates standard traditional Nepali Preeti layouts to Unicode Nepali text (readably formatted on smartphones and screens).</p>
                </div>
              </div>
              <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex items-start gap-3">
                <span className="text-orange-600 font-bold">3</span>
                <div>
                  <p className="font-semibold text-slate-800">Vowel & Conjunct Support</p>
                  <p className="text-xs text-slate-500">Corrects the positional typing offset of "chhoti-i" vowel matras and handles complex joint character ligatures natively.</p>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full bg-orange-600 text-white font-semibold py-2.5 rounded-lg hover:bg-orange-700 transition"
            >
              Continue Typing
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
