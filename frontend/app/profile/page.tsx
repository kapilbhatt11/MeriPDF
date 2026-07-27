"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Camera, 
  Sparkles, 
  ShieldCheck, 
  Clock, 
  Award,
  ArrowLeft,
  ChevronRight,
  UserCheck2
} from "lucide-react";

type Sub = {
  plan: string;
  status: string;
  label: string;
  is_pro: boolean;
  current_period_end: string | null;
  is_expired: boolean;
};

export default function ProfilePage() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [showBirthday, setShowBirthday] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Sub | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);

  function loadMe() {
    fetchWithAuth(api("/auth/me"))
      .then((res) => res.json())
      .then((data) => {
        setEmail(data.email || "");
        setFullName(data.full_name || "");
        setGender(data.gender || "");
        setMobileNumber(data.mobile_number || "");
        setIsAdmin(!!data.is_admin);
        
        if (data.date_of_birth) {
          const s = String(data.date_of_birth).slice(0, 10);
          setDob(s);
          
          // Check for Birthday
          const today = new Date();
          const birthDate = new Date(s);
          if (today.getMonth() === birthDate.getMonth() && today.getDate() === birthDate.getDate()) {
            setShowBirthday(true);
          }
        } else {
          setDob("");
        }
        setAvatarUrl(data.avatar_url || null);
        setSubscription(data.subscription || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      const res = await fetchWithAuth(api("/auth/me"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          mobile_number: mobileNumber.trim() || null,
          date_of_birth: dob ? dob : null,
          gender: gender || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.detail || "Could not save");
        return;
      }
      setMessage("Saved successfully.");
      loadMe();
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchWithAuth(api("/auth/me/avatar"), {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.detail || "Upload failed");
        return;
      }
      setAvatarUrl(data.avatar_url || null);
      setMessage("Profile photo updated.");
    } catch {
      setMessage("Upload failed");
    } finally {
      setAvatarBusy(false);
      e.target.value = "";
    }
  }

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <RequireAuth>
      {/* 🎉 Birthday Overlay Modal 🎉 */}
      {showBirthday && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center relative overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="absolute -top-10 -left-10 w-32 h-32 bg-pink-400 rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-blob"></div>
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-yellow-400 rounded-full mix-blend-multiply filter blur-2xl opacity-40 animate-blob animation-delay-2000"></div>
            
            <span className="text-6xl drop-shadow-md inline-block animate-bounce mb-4">🎂</span>
            <h2 className="text-2xl font-black text-slate-900 mb-2">
              Happy Birthday!
            </h2>
            <p className="text-slate-500 text-sm font-medium mb-6">
              Wishing you a fantastic day filled with joy and productivity from the MeriPDF team! 🎉
            </p>
            <button 
              onClick={() => setShowBirthday(false)}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl py-3.5 font-bold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              Thank you!
            </button>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-slate-50/50 pb-16">
        <div className="max-w-4xl mx-auto px-6 pt-8">
          
          <Link href="/documents" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-550 text-slate-500 hover:text-orange-600 transition mb-6">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to documents
          </Link>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Left Side: Avatar & Subscription Status Card */}
            <div className="md:col-span-1 space-y-6">
              
              {/* Profile Photo Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
                <div className="relative h-28 w-28 rounded-full overflow-hidden mx-auto border-4 border-slate-50 shadow-inner group">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="object-cover h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-orange-100 text-orange-600 font-black text-3xl">
                      {(fullName || email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  {avatarBusy && (
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center text-xs text-white font-bold">
                      Uploading...
                    </div>
                  )}
                </div>

                <label className="mt-4 inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-600 text-xs font-bold text-slate-700 px-4 py-2 rounded-xl cursor-pointer transition">
                  <Camera className="w-3.5 h-3.5" /> Change Photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onAvatarChange}
                    disabled={avatarBusy}
                  />
                </label>
                <p className="text-[10px] text-slate-400 mt-2">
                  JPG, PNG or WebP · Max 2 MB
                </p>
              </div>

              {/* Subscription Status Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-28 h-28 bg-orange-500/5 rounded-full filter blur-xl"></div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3 mb-4 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-orange-500 shrink-0" /> Plan & billing
                </h3>

                {subscription ? (
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active membership</span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-base font-black text-slate-900">{subscription.label}</span>
                        {subscription.is_pro ? (
                          <span className="text-[9px] bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                            Active
                          </span>
                        ) : (
                          <span className="text-[9px] bg-slate-100 text-slate-650 border border-slate-200 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Free Tier
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Period Info</span>
                      <div className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold mt-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {periodEnd ? (
                          <span>Expires: <strong>{periodEnd}</strong></span>
                        ) : (
                          <span className="text-slate-500">No expiration date set</span>
                        )}
                      </div>
                    </div>

                    <Link
                      href="/pricing"
                      className="inline-flex w-full items-center justify-between bg-orange-50 hover:bg-orange-100/80 border border-orange-200 text-orange-700 font-extrabold text-xs py-3 px-4 rounded-xl transition mt-2"
                    >
                      {subscription.is_expired || !subscription.is_pro
                        ? "Upgrade Premium Plans"
                        : "Modify Subscription Status"}
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Loading plan status...</p>
                )}
              </div>

            </div>

            {/* Right Side: Account and Profile Main Form */}
            <div className="md:col-span-2">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-50/50 rounded-full filter blur-2xl"></div>

                {showBirthday && (
                  <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 rounded-2xl p-6 text-white mb-6 relative overflow-hidden shadow-md z-10">
                    <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h4 className="text-lg font-black tracking-tight flex items-center gap-2">
                          🎂 Happy Birthday, {fullName || "User"}! 🎉
                        </h4>
                        <p className="text-xs text-pink-100/90 mt-1 font-medium max-w-sm">
                          Hope your day is filled with joy, success, and smart productivity! Enjoy your premium experience on MeriPDF today.
                        </p>
                      </div>
                      <span className="text-3xl shrink-0 mt-1 sm:mt-0 animate-bounce">🎁</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6 relative z-10">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-slate-800" />
                    <h2 className="text-lg font-black text-slate-900">Personal Details</h2>
                  </div>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1.5 text-[9px] bg-slate-900 text-white font-extrabold px-3 py-1.5 rounded-lg uppercase tracking-wider shadow-sm">
                      <ShieldCheck className="w-3.5 h-3.5 text-orange-400" /> System Admin
                    </span>
                  )}
                </div>

                {loading ? (
                  <p className="text-sm text-slate-400">Loading account status...</p>
                ) : (
                  <form onSubmit={handleSave} className="space-y-5 relative z-10">
                    
                    {/* Readonly Email Row */}
                    <div>
                      <label className="block text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest mb-1.5">
                        Email Address
                      </label>
                      <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-xs font-semibold select-none">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <span>{email}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-1">Logged emails are unchangeable.</span>
                    </div>

                    {/* Display Name Input */}
                    <div>
                      <label htmlFor="fullName" className="block text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest mb-1.5">
                        Display name
                      </label>
                      <div className="relative">
                        <UserCheck2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          id="fullName"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-250 border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition shadow-xs"
                          placeholder="e.g. Kapil Dev"
                        />
                      </div>
                    </div>

                    {/* Phone Number Input */}
                    <div>
                      <label htmlFor="mobileNumber" className="block text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest mb-1.5">
                        Mobile Number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          id="mobileNumber"
                          type="tel"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 bg-white border border-slate-250 border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition shadow-xs"
                          placeholder="+91 99999 99999"
                        />
                      </div>
                    </div>

                    {/* Birthday and Gender Column Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Birthday Input */}
                      <div>
                        <label htmlFor="dob" className="block text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest mb-1.5">
                          Date of birth
                        </label>
                        <div className="relative">
                          <input
                            id="dob"
                            type="date"
                            value={dob}
                            onChange={(e) => setDob(e.target.value)}
                            className="w-full px-4 py-3 bg-white border border-slate-250 border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 transition"
                          />
                        </div>
                      </div>

                      {/* Gender Dropdown */}
                      <div>
                        <label htmlFor="gender" className="block text-xs font-bold text-slate-550 text-slate-500 uppercase tracking-widest mb-1.5">
                          Gender
                        </label>
                        <select
                          id="gender"
                          value={gender}
                          onChange={(e) => setGender(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-350 border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 focus:ring-offset-0 transition"
                        >
                          <option value="">Select gender</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>

                    {/* Action messages */}
                    {message && (
                      <p className={`text-xs font-semibold ${message.toLowerCase().includes("saved") || message.toLowerCase().includes("updated") ? "text-green-600" : "text-rose-600"}`}>
                        {message}
                      </p>
                    )}

                    {/* Save Button */}
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] transition-all text-white font-bold text-xs py-3 px-6 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {saving ? (
                        <span>Saving details...</span>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-orange-400" />
                          <span>Save profile details</span>
                        </>
                      )}
                    </button>

                  </form>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>
    </RequireAuth>
  );
}
