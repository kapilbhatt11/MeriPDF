"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, fetchWithAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Check, ShieldCheck, Zap, Sparkles, Star, Award, BadgeCheck, ChevronRight } from "lucide-react";

type Catalog = {
  currency: string;
  free: { title: string; subtitle?: string; features: string[] };
  pro_monthly: { id: string; label: string; price_inr: number; interval: string };
  pro_yearly: {
    id: string;
    label: string;
    price_inr: number;
    interval: string;
    savings_note?: string;
  };
  pro_features: string[];
};

export default function PricingPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [yearly, setYearly] = useState(false);
  const router = useRouter();

  // Load Razorpay Script dynamically
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    fetch(api("/billing/plans"))
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  const pro = yearly ? catalog?.pro_yearly : catalog?.pro_monthly;
  const savingsNote =
    pro && "savings_note" in pro && typeof pro.savings_note === "string"
      ? pro.savings_note
      : null;

  const handleSubscribe = async () => {
    if (!getToken()) {
      router.push("/login?callbackUrl=/pricing");
      return;
    }

    try {
      const planId = yearly ? "pro_yearly" : "pro_monthly";
      const res = await fetchWithAuth(api("/billing/checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      
      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.detail || "Checkout Failed");
      }
      const orderData = await res.json();
      
      // Mock flow if keys are not ready
      if (orderData.mock_mode) {
         toast.loading("Testing Mock Payment...", { id: "mock" });
         const verifyRes = await fetchWithAuth(api("/billing/verifyPayment"), {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({
                 razorpay_order_id: orderData.order_id,
                 razorpay_payment_id: "mock_payment_id",
                 razorpay_signature: "mock_signature",
                 plan_id: planId
             })
         });
         if (!verifyRes.ok) throw new Error("Mock verify failed");
         toast.success("Test Payment Successful! Subscription Upgraded.", { id: "mock" });
         router.push("/profile"); 
         return;
      }

      // Real Razorpay Flow
      const options = {
          key: orderData.key_id,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "DocIntel Pro",
          description: yearly ? "Yearly Subscription" : "Monthly Subscription",
          order_id: orderData.order_id,
          handler: async function (response: any) {
              const loadingToast = toast.loading("Verifying Payment...");
              try {
                  const verifyRes = await fetchWithAuth(api("/billing/verifyPayment"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                          razorpay_order_id: response.razorpay_order_id,
                          razorpay_payment_id: response.razorpay_payment_id,
                          razorpay_signature: response.razorpay_signature,
                          plan_id: planId
                      })
                  });
                  if (!verifyRes.ok) throw new Error("Payment Verification Failed");
                  toast.success("Payment Successful! Subscription Upgraded.", { id: loadingToast });
                  router.push("/profile");
              } catch (e: any) {
                  toast.error(e.message, { id: loadingToast });
              }
          },
          theme: { color: "#4f46e5" }
      };
      
      const rzp1 = new (window as any).Razorpay(options);
      rzp1.on('payment.failed', function (response: any) {
          toast.error(response.error.description || "Payment Failed");
      });
      rzp1.open();

    } catch (e: any) {
        toast.error(e.message || "Failed to initiate checkout");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* Page Header */}
        <div className="text-center space-y-4">
          <span className="bg-indigo-50 text-indigo-700 text-xs font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-indigo-120">
            Subscription pricing
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Plans for Everyone
          </h1>
          <p className="mt-2 text-slate-650 text-slate-500 max-w-2xl mx-auto text-xs sm:text-sm font-semibold leading-relaxed">
            Upgrade to Pro to unlock unlimited smart OCR parameters, priority server queues, and our premium mobile viewfinder. Easily manage documents in multiple layouts.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid md:grid-cols-2 gap-8 items-stretch max-w-4xl mx-auto">
          
          {/* Free Tier Card */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 flex flex-col hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Default Access</p>
                <h2 className="text-2xl font-black text-slate-900 mt-1">
                  {catalog?.free?.title ?? "Free Plan"}
                </h2>
              </div>
              <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase">Standard</span>
            </div>
            <p className="text-slate-500 text-[11px] font-semibold mt-1">{catalog?.free?.subtitle || "Essential tools for personal document needs"}</p>
            
            <div className="mt-6">
              <span className="text-4xl font-black text-slate-900">₹0</span>
              <span className="text-slate-400 text-xs font-bold"> / permanently</span>
            </div>
            
            <div className="border-t border-slate-105 my-6"></div>

            <ul className="space-y-3.5 text-xs text-slate-600 flex-1 font-semibold">
              {(catalog?.free?.features ?? []).map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>
            
            <Link
              href="/signup"
              className="mt-8 block text-center rounded-xl bg-slate-900 text-white hover:bg-slate-800 py-3 text-xs font-bold border border-transparent shadow hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              Sign Up For Free
            </Link>
          </div>

          {/* Pro Premium Card */}
          <div className="bg-slate-900 text-white rounded-3xl shadow-xl border-2 border-indigo-500 p-8 flex flex-col relative overflow-hidden transform hover:scale-[1.01] transition-all">
            <div className="absolute top-0 right-0 bg-indigo-650 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-xl flex items-center gap-1 shadow-sm z-10">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400 animate-spin" /> Best Value
            </div>
            
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-550/10 rounded-full filter blur-3xl pointer-events-none"></div>

            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-indigo-400">Recommended</p>
                <h2 className="text-2xl font-black text-white mt-1">DocIntel Pro</h2>
              </div>
            </div>

            {/* Toggle Monthly/Yearly */}
            <div className="mt-6 flex items-center justify-start">
              <div className="inline-flex rounded-xl bg-slate-800/80 p-0.5 border border-white/5">
                <button
                  type="button"
                  onClick={() => setYearly(false)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                    !yearly ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setYearly(true)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                    yearly ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Yearly (Save)
                </button>
              </div>
            </div>

            {pro && (
              <div className="mt-6">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-black text-white">₹{pro.price_inr}</span>
                  <span className="text-slate-400 text-xs font-semibold">
                    /{pro.interval === "year" ? "year" : "month"}
                  </span>
                </div>
                {savingsNote ? (
                  <p className="text-[10px] text-indigo-350 text-indigo-300 font-bold bg-indigo-900/50 border border-indigo-800/40 rounded-md py-1 px-3 mt-2 inline-block">
                    ⚡ {savingsNote}
                  </p>
                ) : <div className="h-6"></div>}
              </div>
            )}

            <div className="border-t border-slate-800 my-6"></div>

            <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">All Free Features, Plus:</p>
            
            <ul className="space-y-3 text-xs text-slate-200 flex-1 font-semibold">
              {(catalog?.pro_features ?? []).map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 mt-6 text-[10px] text-slate-300 font-medium">
              <span className="font-extrabold text-white text-xs block mb-1">Developer Sandbox:</span>
              Payment configuration is active in sandbox. Clicking below redirects to profile automatically in mock environment.
            </div>

            <button
              onClick={handleSubscribe}
              className="mt-6 block w-full text-center rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 active:scale-[0.99] transition-all cursor-pointer"
            >
              Unlock Pro Premium
            </button>

            {/* Small card disclaimer check */}
            <p className="text-[10px] text-slate-400 mt-4 leading-normal text-center">
              By subscribing, you agree to our <Link href="/privacy" className="underline hover:text-slate-350 font-bold block mb-1">Privacy Policy & Terms</Link> Advanced tools (like OCR extraction and PDF Repair) are delivered on a best-effort basis.
            </p>
          </div>
        </div>

        {/* Feature Comparison Table (Desktop Viewport) & stacked lists (Mobile Viewport) */}
        <div className="space-y-6 pt-12">
          <div className="text-center">
            <h3 className="text-xl font-black text-slate-900">Side-by-Side Comparison</h3>
            <p className="text-xs text-slate-500 font-semibold mt-1">Review the features available on each subscription plan</p>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden bg-white border border-slate-205 rounded-2xl shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200">
                  <th className="py-4 px-6 text-xs font-bold text-slate-400 uppercase tracking-widest">Task utilities</th>
                  <th className="py-4 px-6 text-xs font-black text-slate-700 uppercase tracking-wider text-center">Free Tier</th>
                  <th className="py-4 px-6 text-xs font-black text-indigo-600 uppercase tracking-wider text-center">Pro Monthly (₹149)</th>
                  <th className="py-4 px-6 text-xs font-black text-indigo-700 uppercase tracking-wider text-center">Pro Yearly (₹1490)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-750">
                <tr>
                  <td className="py-4 px-6 font-bold text-slate-800">Basic Tasks (Merge, Split, Rotate)</td>
                  <td className="py-4 px-6 text-center text-slate-600">5 actions daily limit</td>
                  <td className="py-4 px-6 text-center text-emerald-600 font-bold">200 actions daily limit</td>
                  <td className="py-4 px-6 text-center text-emerald-600 font-bold">200 actions daily limit</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold text-slate-800">Mobile Document Scanning</td>
                  <td className="py-4 px-6 text-center text-slate-500 flex justify-center items-center gap-1.5"><BadgeCheck className="w-4 h-4 text-slate-400" /> Native Photo Tray</td>
                  <td className="py-4 px-6 text-center text-indigo-600 font-black"><BadgeCheck className="w-4 h-4 text-indigo-600 inline mr-1" /> Live Camera Stream</td>
                  <td className="py-4 px-6 text-center text-indigo-605 font-black"><BadgeCheck className="w-4 h-4 text-indigo-600 inline mr-1" /> Live Camera Stream</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold text-slate-800">OCR Text Extraction</td>
                  <td className="py-4 px-6 text-center text-slate-500">Basic Conversion</td>
                  <td className="py-4 px-6 text-center text-indigo-600 font-black">High Precision (Multi-Language)</td>
                  <td className="py-4 px-6 text-center text-indigo-605 font-black">High Precision (Multi-Language)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold text-slate-800">Advanced PDF Repair (pikepdf)</td>
                  <td className="py-4 px-6 text-center text-slate-400">✕ Not Available</td>
                  <td className="py-4 px-6 text-center text-emerald-600">Full Structural Recovery</td>
                  <td className="py-4 px-6 text-center text-emerald-600">Full Structural Recovery</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold text-slate-800">Server Queue Processing Speed</td>
                  <td className="py-4 px-6 text-center text-slate-500">Standard Speed</td>
                  <td className="py-4 px-6 text-center text-indigo-600 font-black">Supercharged Priority (5x speed)</td>
                  <td className="py-4 px-6 text-center text-indigo-605 font-black">Supercharged Priority (5x speed)</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold text-slate-800">Customer Support Ticket Priority</td>
                  <td className="py-4 px-6 text-center text-slate-500">Standard Support</td>
                  <td className="py-4 px-6 text-center text-slate-700">Priority Ticket Response</td>
                  <td className="py-4 px-6 text-center text-slate-700">Dedicated Account VIP Priority</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-bold text-slate-800">New Beta Features Access</td>
                  <td className="py-4 px-6 text-center text-slate-400">✕ Not Available</td>
                  <td className="py-4 px-6 text-center text-slate-400">✕ Not Available</td>
                  <td className="py-4 px-6 text-center text-indigo-600 font-black">Early access (e-sign, API keys)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile Accordion/Cards View (Collapsed list representation) */}
          <div className="block md:hidden space-y-4">
            
            {/* Free detailed list */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Free tier specifications</span>
              <ul className="mt-3 space-y-2 text-xs font-semibold text-slate-650">
                <li className="flex justify-between">
                  <span className="text-slate-550">Basic Tasks (Merge/Split)</span>
                  <span className="text-slate-800 font-bold">5 Daily Actions Limit</span>
                </li>
                <li className="flex justify-between border-t border-slate-100 pt-2">
                  <span className="text-slate-550">Document Scanning</span>
                  <span className="text-slate-800 font-bold">Native File Tray Only</span>
                </li>
                <li className="flex justify-between border-t border-slate-100 pt-2">
                  <span className="text-slate-550">OCR Text Extraction</span>
                  <span className="text-slate-850 text-slate-800">Basic conversion</span>
                </li>
                <li className="flex justify-between border-t border-slate-100 pt-2">
                  <span className="text-slate-550">PDF Repairs</span>
                  <span className="text-slate-400">Not Available</span>
                </li>
              </ul>
            </div>

            {/* Pro Detailed List */}
            <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-150">
              <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Pro tier (monthly/yearly) specifications</span>
              <ul className="mt-3 space-y-2 text-xs font-semibold text-slate-650">
                <li className="flex justify-between">
                  <span className="text-slate-550">Basic Tasks (Merge/Split)</span>
                  <span className="text-indigo-650 text-indigo-600 font-extrabold font-black">200 Daily Actions Limit</span>
                </li>
                <li className="flex justify-between border-t border-indigo-120 pt-2">
                  <span className="text-slate-550">Document Scanning</span>
                  <span className="text-indigo-655 text-indigo-600 font-extrabold font-black">Smart Live Viewfinder</span>
                </li>
                <li className="flex justify-between border-t border-indigo-120 pt-2">
                  <span className="text-slate-550">OCR Text Translation</span>
                  <span className="text-indigo-655 text-indigo-600 font-extrabold font-black">High Precision</span>
                </li>
                <li className="flex justify-between border-t border-indigo-120 pt-2">
                  <span className="text-slate-550">Advanced PDF Repair</span>
                  <span className="text-emerald-700 font-black">Active (pikepdf)</span>
                </li>
                <li className="flex justify-between border-t border-indigo-120 pt-2">
                  <span className="text-slate-550 font-bold text-slate-700">Cloud queue speeds</span>
                  <span className="text-indigo-655 text-indigo-600 font-extrabold font-black">Supercharged (5x faster)</span>
                </li>
                <li className="flex justify-between border-t border-indigo-120 pt-2">
                  <span className="text-slate-550">VIP Support Query</span>
                  <span className="text-slate-750 font-bold block">First in Priority queue</span>
                </li>
              </ul>
            </div>

          </div>

        </div>

        {/* Legal Policy Shield Disclaimer */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-xs text-slate-500 max-w-4xl mx-auto space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-800 font-bold text-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
              <h4>Service Disclaimer & Terms of Use Summary</h4>
            </div>
            <Link href="/privacy" className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 font-bold transition">
              Read Full Policies <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <p className="leading-relaxed">
            <b>1. Disclaimer of Warranties:</b> All document processing services (including but not limited to PDF Repair, OCR, Compression, and Merging) are provided <b>"AS IS"</b> and on an <b>"AS AVAILABLE"</b> basis. DocIntel makes no representations or warranties of any kind, express or implied, regarding the accuracy, completeness, viability, or success of any file restoration or utility execution.
          </p>
          <p className="leading-relaxed">
            <b>2. Limitation of Liability:</b> Under no circumstances shall DocIntel or its developers be liable for any direct, indirect, incidental, special, or consequential damages resulting from data loss, corrupted documents, or service failures. The maximum liability under any subscription claim shall be strictly capped at the exact amount paid for the active subscription cycle.
          </p>
          <p className="leading-relaxed flex items-center gap-1.5 text-[11px] text-slate-650 font-semibold bg-slate-50 p-2.5 rounded-lg border border-slate-155">
            ⚠️ <b>Processing Advisory:</b> Some damaged files may be irreparable by automated scripts. Please always keep backups of your original documents before uploading them to the platform.
          </p>
        </div>

      </div>
    </div>
  );
}
