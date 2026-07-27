"use client";

import React, { use } from "react";
import Link from "next/link";
import { BLOG_POSTS } from "@/lib/blog-data";
import { ArrowLeft, Clock, Calendar, User, BookOpen, AlertCircle } from "lucide-react";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Simple custom component to render basic markdown paragraphs, headers, and bullet lists without external packages
function MarkdownRenderer({ content }: { content: string }) {
  const blocks = content.split("\n\n");

  return (
    <div className="space-y-6 text-slate-700 leading-relaxed font-medium text-sm sm:text-base">
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Render H3 Headers (starts with ###)
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={index} className="text-xl sm:text-2xl font-black text-slate-900 pt-6 tracking-tight">
              {trimmed.substring(4)}
            </h3>
          );
        }

        // Render H4 Headers (starts with ####)
        if (trimmed.startsWith("#### ")) {
          return (
            <h4 key={index} className="text-base sm:text-lg font-black text-slate-900 pt-4 uppercase tracking-wider text-emerald-600">
              {trimmed.substring(5)}
            </h4>
          );
        }

        // Render Horizontal Rule (starts with ---)
        if (trimmed === "---") {
          return <hr key={index} className="border-t border-slate-200 my-8" />;
        }

        // Render Bullet Lists (starting with *)
        if (trimmed.startsWith("* ") || trimmed.includes("\n* ")) {
          const items = trimmed.split("\n").map(item => item.replace(/^\* /, "").trim()).filter(Boolean);
          return (
            <ul key={index} className="list-disc pl-5 space-y-2 text-slate-650 my-4 font-semibold text-xs sm:text-sm">
              {items.map((it, idx) => {
                // Parse simple bold markers if present
                const parts = it.split("**");
                return (
                  <li key={idx} className="leading-relaxed">
                    {parts.map((part, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} className="text-slate-900 font-extrabold">{part}</strong> : part)}
                  </li>
                );
              })}
            </ul>
          );
        }

        // Render standard paragraph with support for bold **Text**
        const boldParts = trimmed.split("**");
        if (boldParts.length > 1) {
          return (
            <p key={index} className="leading-relaxed">
              {boldParts.map((part, idx) => {
                if (idx % 2 === 1) {
                  return <strong key={idx} className="text-slate-950 font-black">{part}</strong>;
                }
                return part;
              })}
            </p>
          );
        }

        return <p key={index} className="leading-relaxed">{trimmed}</p>;
      })}
    </div>
  );
}

export default function BlogPostDetailPage({ params }: PageProps) {
  const { slug } = use(params);
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8">
      
      {/* Back Link */}
      <Link 
        href="/blog"
        className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-emerald-600 transition"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Articles
      </Link>

      {/* --- Article Header --- */}
      <div className="space-y-4 border-b border-slate-200 pb-8">
        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-full inline-block">
          {post.category}
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">
          {post.title}
        </h1>
        
        {/* Meta Author / Date / Time row */}
        <div className="flex flex-wrap items-center gap-6 pt-4 text-xs font-bold text-slate-500">
          <div className="flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-400" />
            <span>By {post.author}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>{post.date}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{post.readTime}</span>
          </div>
        </div>
      </div>

      {/* --- Article Excerpt Card --- */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 flex gap-3.5 items-start">
        <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm font-bold text-slate-600 leading-relaxed italic">
          {post.excerpt}
        </p>
      </div>

      {/* --- Main Content Render --- */}
      <article className="prose max-w-none">
        <MarkdownRenderer content={post.content} />
      </article>

      {/* --- Footer Signature Segment --- */}
      <div className="border-t border-slate-200 pt-8 mt-12 flex flex-col sm:flex-row justify-between items-center gap-4 text-slate-400 text-xs font-bold">
        <span>Published by {post.author}</span>
        <Link 
          href="/blog"
          className="text-emerald-600 hover:text-emerald-700 transition flex items-center gap-1 hover:underline"
        >
          Read more articles <ArrowLeft className="w-3 h-3 rotate-180" />
        </Link>
      </div>

    </div>
  );
}
