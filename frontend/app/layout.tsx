import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import Navbar from "../components/Navbar";  // ✅ Navbar import karo

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MeriPDF - Free OCR & PDF Tools",
  description: "Your ultimate online hub for PDF splitting, merging, conversion, and dynamic multi-lingual OCR extraction.",
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen flex flex-col`}
        suppressHydrationWarning
      >
        {/* ✅ Navbar from separate file */}
        <Navbar />

        {/* ✅ Page Content */}
        <main className="p-6 flex-grow">{children}</main>

        {/* ✅ Toast container */}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}



// import type { Metadata } from "next";
// import { Geist, Geist_Mono } from "next/font/google";
// import "./globals.css";
// import { Toaster } from "react-hot-toast";

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

// export const metadata: Metadata = {
//   title: "DocIntel OCR",
//   description: "OCR Extraction App",
// };

// export default function RootLayout({
//   children,
// }: {
//   children: React.ReactNode;
// }) {
//   return (
//     <html lang="en">
//       <body
//         className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
//       >
//         {/* ✅ Navbar */}
//         <nav className="bg-blue-600 text-white px-6 py-3 shadow-md flex justify-between items-center">
//           <h1 className="text-lg font-bold">📄 DocIntel OCR</h1>
//           <div className="space-x-6">
//             <a href="/" className="hover:underline">
//               Home
//             </a>
//             <a href="/upload" className="hover:underline">
//               Upload
//             </a>
//             <a href="/documents" className="hover:underline">
//               Documents
//             </a>
//             <a href="/merge-pdf" className="hover:underline">
//               Merge PDF
//             </a>
//           </div>
//         </nav>

//         {/* ✅ Page Content */}
//         <main className="p-6">{children}</main>

//         {/* ✅ Toast container */}
//         <Toaster position="top-right" />
//       </body>
//     </html>
//   );
// }
