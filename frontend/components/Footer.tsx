"use client";

import Link from "next/link";
import { FileText, Github, Mail, Globe, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 pt-16 pb-8 px-6 mt-auto">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Brand Info */}
        <div className="space-y-4">
          <Link href="/" className="text-xl flex items-center gap-2 font-bold text-white hover:text-orange-400 transition">
            <span className="bg-orange-600 text-white p-1 rounded-md text-sm">MP</span>
            MeriPDF
          </Link>
          <p className="text-sm text-slate-400 leading-relaxed">
            Ultimate cloud-based platform for advanced OCR document analysis and powerful PDF tools. Secure, fast, and completely private.
          </p>
          <div className="flex items-center gap-3 pt-2 text-slate-500">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition">
              <Github className="w-5 h-5" />
            </a>
            <a href="mailto:support@meripdf.com" className="hover:text-blue-400 transition">
              <Mail className="w-5 h-5" />
            </a>
            <a href="/" className="hover:text-blue-400 transition">
              <Globe className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* PDF Tools Links */}
        <div>
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">PDF Tools</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/merge-pdf" className="hover:text-white transition">Merge PDF</Link>
            </li>
            <li>
              <Link href="/split-pdf" className="hover:text-white transition">Split PDF</Link>
            </li>
            <li>
              <Link href="/compress" className="hover:text-white transition">Compress PDF</Link>
            </li>
            <li>
              <Link href="/protect-pdf" className="hover:text-white transition">Lock PDF</Link>
            </li>
            <li>
              <Link href="/unlock-pdf" className="hover:text-white transition">Unlock PDF</Link>
            </li>
            <li>
              <Link href="/watermark-pdf" className="hover:text-white transition">Watermark PDF</Link>
            </li>
          </ul>
        </div>

        {/* Company Links */}
        <div>
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Company</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/about" className="hover:text-white transition">About Us</Link>
            </li>
            <li>
              <Link href="/pricing" className="hover:text-white transition">Pricing Plans</Link>
            </li>
            <li>
              <a href="mailto:support@meripdf.com" className="hover:text-white transition">Contact Support</a>
            </li>
            <li>
              <Link href="/profile" className="hover:text-white transition">My Account</Link>
            </li>
          </ul>
        </div>

        {/* Security & Trust Info */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Security & Privacy</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            All file uploads are encrypted over SSL/TLS (HTTPS). Uploaded files are automatically processed and purged from our server after completion to protect your identity.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <span className="text-[10px] uppercase font-bold bg-slate-800 text-slate-300 px-2 py-1 rounded">SSL Secure</span>
            <span className="text-[10px] uppercase font-bold bg-slate-800 text-slate-300 px-2 py-1 rounded">Auto-Purged</span>
            <span className="text-[10px] uppercase font-bold bg-slate-800 text-slate-300 px-2 py-1 rounded">GDPR Compliant</span>
          </div>
        </div>

      </div>

      {/* Footer Bottom */}
      <div className="max-w-6xl mx-auto border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
        <div>
          &copy; {new Date().getFullYear()} MeriPDF. All rights reserved. Registered trademark of MeriPDF.com.
        </div>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-slate-300 transition">Privacy Policy</Link>
          <span>&middot;</span>
          <Link href="/terms" className="hover:text-slate-300 transition">Terms of Service</Link>
          <span>&middot;</span>
          <span className="flex items-center gap-1">
            Made with <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" /> globally
          </span>
        </div>
      </div>
    </footer>
  );
}
