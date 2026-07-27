"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { clearToken, fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithAuth(api("/documents"))
      .then((res) => {
        if (res.status === 401) {
          clearToken();
          router.replace("/login");
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        setDocs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch documents", err);
        setLoading(false);
      });
  }, [router]);

  return (
    <RequireAuth>
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">📂 Uploaded Documents</h1>

      {loading ? (
        <p className="text-gray-500">Loading documents...</p>
      ) : docs.length === 0 ? (
        <p className="text-gray-500">No documents uploaded yet.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="border rounded-lg shadow-md p-4 bg-white hover:shadow-lg transition"
            >
              <h2 className="text-lg font-semibold text-gray-800">
                {doc.original_filename}
              </h2>
              <p className="text-sm text-gray-600">
                Language: <span className="font-medium">{doc.language}</span>
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Uploaded:{" "}
                <span className="font-medium">
                  {new Date(doc.created_at).toLocaleString()}
                </span>
              </p>
              <Link
                href={`/documents/${doc.id}`}
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
              >
                View Extracted Text →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
    </RequireAuth>
  );
}
