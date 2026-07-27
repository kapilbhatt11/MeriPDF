"use client";

import { useEffect, useState } from "react";
import { Copy, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";

export default function DocumentDetail({ params }: { params: Promise<{ id: string }> }) {
  const [doc, setDoc] = useState<any>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDoc() {
      const { id } = await params;
      fetchWithAuth(api(`/documents/${id}`))
        .then((res) => res.json())
        .then((data) => {
          if (data.document) {
            setDoc(data.document);
            if (data.text) {
              const rawPages = data.text.split(/--- Page \d+ ---/).filter(Boolean);
              setPages(rawPages);
            }
          } else {
            setDoc(null);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error fetching document:", err);
          setLoading(false);
        });
    }
    fetchDoc();
  }, [params]);

  const handleCopy = () => {
    if (pages.length > 0) {
      navigator.clipboard.writeText(pages[currentPage]).then(() => {
        toast.success("✅ Copied to clipboard!");
      });
    }
  };

  return (
    <RequireAuth>
      {loading ? (
        <p className="p-6 text-gray-500">Loading document...</p>
      ) : !doc ? (
        <p className="p-6 text-red-500">Document not found!</p>
      ) : (
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-2 text-white-800">
            📄 {doc.original_filename}
          </h1>
          <p className="text-blue-500 mb-4">
            Language: {doc.language} | File: {doc.filepath}
          </p>

          {pages.length > 0 && (
            <div className="mt-4 relative">
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-gray-800 text-white p-2 rounded hover:bg-gray-700"
              >
                <Copy size={18} />
              </button>

              <div className="bg-gray-900 text-green-300 p-4 rounded-lg shadow-inner whitespace-pre-wrap leading-relaxed min-h-[200px]">
                {pages[currentPage]}
              </div>

              {pages.length > 1 && (
                <div className="flex justify-end mt-3 gap-3 text-gray-700">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="p-2 bg-gray-200 rounded disabled:opacity-50 text-gray-700"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-yellow-700 self-center">
                    Page {currentPage + 1} / {pages.length}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((p) => Math.min(pages.length - 1, p + 1))
                    }
                    disabled={currentPage === pages.length - 1}
                    className="p-2 bg-gray-200 rounded disabled:opacity-50"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </RequireAuth>
  );
}
