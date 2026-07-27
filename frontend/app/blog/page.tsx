"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BLOG_POSTS, BlogPost } from "@/lib/blog-data";
import { ArrowRight, Search, BookOpen, Calendar, Clock, User, ShieldCheck } from "lucide-react";

export default function BlogListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = ["All", "Security", "PDF Tips", "Productivity", "Updates"];

  const filteredPosts = BLOG_POSTS.filter((post) => {
    const matchesSearch = 
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = 
      selectedCategory === "All" || post.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-6xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      
      {/* --- Page Header Banner --- */}
      <div className="text-center space-y-4 mb-16">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-wider border border-emerald-100">
          <BookOpen className="w-3.5 h-3.5" /> MeriPDF Knowledge Base
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight">
          Articles, Guides & <span className="text-emerald-600">Productivity Hacks</span>
        </h1>
        <p className="text-slate-500 text-sm sm:text-base font-semibold max-w-2xl mx-auto leading-relaxed">
          Learn how to accelerate your document workflows, preserve legal archives, and securely handle files without risking your privacy.
        </p>
      </div>

      {/* --- Search & Category Controls --- */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12 border-b border-slate-200 pb-8">
        
        {/* Category Pills */}
        <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start w-full md:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white shadow-md shadow-slate-950/15"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search Input Box */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search articles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* --- Blog Cards List Grid --- */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm max-w-xl mx-auto">
          <p className="text-slate-400 font-bold text-lg mb-2">No articles found</p>
          <p className="text-slate-500 text-xs font-semibold px-4">
            Try adjusting your search keywords or switching category filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPosts.map((post) => (
            <article 
              key={post.slug}
              className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col overflow-hidden group"
            >
              <div className="p-6 flex-grow flex flex-col justify-between space-y-4">
                
                {/* Meta details header */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <Clock className="w-3 h-3" /> {post.readTime}
                    </span>
                  </div>
                  
                  <Link href={`/blog/${post.slug}`}>
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-emerald-600 transition-colors leading-snug cursor-pointer">
                      {post.title}
                    </h3>
                  </Link>
                  
                  <p className="text-xs text-slate-500 font-semibold line-clamp-3 leading-relaxed">
                    {post.excerpt}
                  </p>
                </div>

                {/* Meta footer row */}
                <div className="border-t border-slate-100 pt-4 flex items-center justify-between text-[11px] font-bold text-slate-500 mt-2">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-slate-400" /> {post.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" /> {post.date}
                  </span>
                </div>

              </div>

              {/* Action read indicator bar */}
              <Link href={`/blog/${post.slug}`} className="block border-t border-slate-105 bg-slate-50 group-hover:bg-emerald-50 px-6 py-3.5 text-center text-xs font-black text-slate-700 group-hover:text-emerald-700 transition">
                <span className="flex items-center justify-center gap-1.5 cursor-pointer">
                  Read Full Article <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            </article>
          ))}
        </div>
      )}

      {/* --- Bottom Trust Banner --- */}
      <div className="mt-24 bg-gradient-to-r from-slate-900 to-indigo-950 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-lg flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="absolute right-0 bottom-0 opacity-5 pointer-events-none transform translate-y-1/4 translate-x-1/4">
          <BookOpen className="w-96 h-96" />
        </div>
        <div className="space-y-3 relative z-10 max-w-xl text-center md:text-left">
          <h4 className="text-xl sm:text-2xl font-black">
            Looking for a privacy-first workspace?
          </h4>
          <p className="text-indigo-200 text-xs sm:text-sm font-semibold leading-relaxed">
            MeriPDF processes all files structure-locally with automatic file cache removal immediately after downloads. Do not put your corporate secrets at risk.
          </p>
        </div>
        <div className="shrink-0 relative z-10 w-full md:w-auto text-center">
          <Link
            href="/"
            className="inline-block w-full md:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-8 py-3.5 rounded-xl shadow-lg shadow-emerald-500/10 active:scale-[0.98] text-xs transition-all"
          >
            Explore Free PDF Tools
          </Link>
        </div>
      </div>

    </div>
  );
}
