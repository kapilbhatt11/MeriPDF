"use client";

import Link from "next/link";
import { ArrowLeft, ShieldAlert, HeartHandshake, Server, FileLock2, HelpCircle } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* Back Link & Header */}
        <div className="space-y-4">
          <Link 
            href="/pricing"
            className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Pricing
          </Link>
          <div className="flex items-center gap-3">
            <span className="bg-indigo-50 text-indigo-700 text-xs font-black px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-indigo-100">
              Legal Policy & Terms
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Privacy Policy & Terms of Service
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm font-semibold max-w-2xl">
            Effective Date: July 25, 2026. Please read this summary of our terms, developer motivations, and technical disclaimer guidelines carefully.
          </p>
        </div>

        {/* Introduction / Message from Developer */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-md">
          <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
          <div className="relative z-10 space-y-3">
            <h4 className="text-lg font-black flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-pink-300" /> Public Utility & Cost-Recovery Mission
            </h4>
            <p className="text-xs sm:text-sm text-indigo-50/90 leading-relaxed font-semibold">
              DocIntel is built as a non-commercial, low-budget public utility to provide individuals and developers with an affordable, high-quality, and ad-free PDF workspace.
            </p>
            <p className="text-xs text-indigo-100/80 leading-relaxed font-medium">
              We do not run this service to generate corporate profits. Our subscription options (₹149/monthly and ₹1,490/yearly) are calculated strictly to cover monthly infrastructure overhead—such as database hosting, CPU-intensive document processing servers, security certificates, and network bandwidth. By subscribing, you are directly supporting the server bills that keep this public utility alive for everyone.
            </p>
          </div>
        </div>

        {/* Detailed Sections Stack */}
        <div className="space-y-6">
          
          {/* Section 1: Server Charges & Cost Model */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-2.5 text-slate-950 font-black text-sm">
              <Server className="w-5 h-5 text-indigo-600 shrink-0" />
              <h2>1. Cost-Recovery Pricing & Platform Intent</h2>
            </div>
            <div className="text-xs text-slate-600 font-semibold leading-relaxed space-y-3">
              <p>
                subscription payments are processed strictly to offset computing expenses. The plan is designed to be affordable for student, freelancer, and individual workflows:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li>**₹149 (Monthly Plan):** Applied to offset active monthly runtime CPU/GPU cycles and server traffic bandwidth.</li>
                <li>**₹1,490 (Yearly Plan):** Helps fund standard database storage maintenance and long-term project longevity.</li>
              </ul>
              <p className="text-slate-500">
                Because this is a cost-recovery public utility, payments are final and non-refundable once resources are allocated.
              </p>
            </div>
          </div>

          {/* Section 2: Task Tokens & Daily Limits Enforcement */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-2.5 text-slate-950 font-black text-sm">
              <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0" />
              <h2>2. Task Tokens & Daily Usage Limits</h2>
            </div>
            <div className="text-xs text-slate-600 font-semibold leading-relaxed space-y-3">
              <p>
                To maintain reliable performance and prevent resource abuse on our backend servers, we enforce a daily task quota token system:
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium text-slate-650">
                <li>**Guest Users (Anonymous):** Limited to **5 task tokens per day** tracked by IP address.</li>
                <li>**Registered Free Users:** Limited to **5 task tokens per day** tracked by user account.</li>
                <li>**PRO Subscriber Accounts:** Enjoy a high ceiling of **200 task tokens per day** to cover intensive productivity runs.</li>
              </ul>
              <p className="text-slate-500">
                Token counters decrease dynamically as operations (e.g. Merge, Split, Rotate, Compress, Repair) conclude successfully. All task limits reset daily at 00:00 midnight local server time.
              </p>
            </div>
          </div>

          {/* Section 3: "AS IS" & Limitation of Liability */}
          <div className="bg-rose-50/20 rounded-2xl border border-rose-100 p-6 sm:p-8 space-y-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-2.5 text-rose-950 font-black text-sm">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              <h2 className="text-rose-900">3. Ironclad Liability Disclaimer & Class-Action Waiver</h2>
            </div>
            <div className="text-xs text-slate-600 font-semibold leading-relaxed space-y-3">
              <p className="text-rose-850 font-bold bg-rose-50 border border-rose-150 p-4 rounded-xl leading-normal">
                ⚠️ **CRITICAL LEGAL AGREEMENT: PLEASE READ CAREFULLY** <br />
                By using DocIntel, you explicitly agree that all services, automated PDF tools, custom converters, script outputs, and billing features are provided strictly on an **"AS IS"** and **"AS AVAILABLE"** basis, without any warranties or guarantees of any kind, whether express or implied.
              </p>
              <p>
                Because PDF format structures are highly complex, some corrupted, protected, or non-standard documents cannot be processed successfully by automated scripts. 
              </p>
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium text-slate-600">
                <li>**Zero Fault & Damage Liability:** The application host, owners, and developers shall under no circumstances be liable for any direct, indirect, incidental, punitive, or consequential damages (including but not limited to data loss, corrupted files, security breaches, system downtime, or financial loss).</li>
                <li>**User Precaution Requirement:** You are solely responsible for retaining offline copies and backups of your original documents before uploading them to our servers.</li>
                <li>**Indemnification:** You agree to defend, indemnify, and hold harmless DocIntel's administrators and developers from any claims, suits, liabilities, losses, damages, or costs arising out of your usage of the app.</li>
                <li>**Waiver of Class-Actions & Lawsuits:** You agree that any disputes must be resolved solely through individual binding arbitration, and you waive all rights to file, present, or participate in any lawsuit, class-action suit, or collective legal action against the developers.</li>
                <li>**Refund and Claim Cap:** The absolute maximum liability for any issue or claim of any nature is strictly capped at the exact subscription fee paid by you during the active billing cycle.</li>
              </ul>
            </div>
          </div>

          {/* Section 4: Data Safety & Retention Policies */}
          <div className="bg-white rounded-2xl border border-slate-205 p-6 sm:p-8 space-y-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-2.5 text-slate-950 font-black text-sm">
              <FileLock2 className="w-5 h-5 text-indigo-600 shrink-0" />
              <h2>4. Strict File Privacy & Zero AI-Training Guarantee</h2>
            </div>
            <div className="text-xs text-slate-600 font-semibold leading-relaxed space-y-3">
              <div className="bg-emerald-50 border border-emerald-250 p-4 rounded-xl text-emerald-850 font-bold mb-3 flex items-start gap-3">
                <FileLock2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-sm font-black block text-emerald-990 leading-tight">🔒 GUARANTEED ZERO-RETENTION & NO AI TRAINING</span>
                  <span className="block font-medium text-xs text-slate-705 mt-1">
                    Unlike commercial giants (such as Adobe or other free online converters) that scan your uploads to train proprietary Artificial Intelligence models, DocIntel maintains complete telemetry isolation. We do not harvest, read, or catalog your PDF contents.
                  </span>
                </div>
              </div>
              
              <ul className="list-disc list-inside space-y-1.5 pl-2 font-medium">
                <li>**Zero Persistent Storage:** Files uploaded to our utilities are processed in temporary container runtime directories and are permanently deleted immediately upon conversion. We hold zero persistent copies of your data.</li>
                <li>**No AI Model Training:** Your documents are never accessed, parsed, or processed for data mining, AI model fine-tuning, or algorithm training.</li>
                <li>**Private Library Isolation:** If you choose to save conversion history to your Private Library (logged-in accounts), files remain entirely under your encrypted workspace context. They are never shared, publicly exposed, or accessible by staff.</li>
              </ul>
            </div>
          </div>

          {/* Section 5: General Terms & Questions */}
          <div className="bg-white rounded-2xl border border-slate-205 p-6 sm:p-8 space-y-4 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-2.5 text-slate-950 font-black text-sm">
              <HelpCircle className="w-5 h-5 text-slate-500 shrink-0" />
              <h2>5. Policy Acceptance & Future Roadmap</h2>
            </div>
            <div className="text-xs text-slate-605 text-slate-600 font-semibold leading-relaxed">
              <p>
                By logging into DocIntel, requesting conversions, or subscribing to our Pro Plans, you express full understanding and acceptance of these Terms. We continuously refine the tools based on user feedback to deliver a better document processing workflow.
              </p>
              <p className="mt-3 text-slate-400">
                If you have questions regarding the hosting servers or require assistance with payment sandboxes, please reach out to us via support channels or check your account settings.
              </p>
            </div>
          </div>

        </div>

        {/* Clean Footer Link */}
        <div className="text-center pt-8 border-t border-slate-200">
          <p className="text-[10px] text-slate-400 font-semibold">
            Copyright &copy; 2026 DocIntel Suite. Developed purely to fuel smart document productivity workflows.
          </p>
        </div>

      </div>
    </div>
  );
}
