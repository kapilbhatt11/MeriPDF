"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { fetchWithAuth } from "@/lib/auth";
import RequireAuth from "@/components/RequireAuth";
import { ShieldAlert, Users, CreditCard, ChevronDown } from "lucide-react";

type User = {
  id: number;
  email: string;
  full_name: string | null;
  mobile_number: string | null;
  is_admin: boolean;
  email_verified: boolean;
  date_of_birth: string | null;
  created_at: string;
  subscription: {
    plan: string;
    status: string;
    label: string;
    is_pro: boolean;
    current_period_end: string | null;
    is_expired: boolean;
  };
};

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form states
  const [editName, setEditName] = useState("");
  const [editMobile, setEditMobile] = useState("");
  const [editAdmin, setEditAdmin] = useState(false);
  const [editPlan, setEditPlan] = useState("free");
  const [editStatus, setEditStatus] = useState("none");
  const [editDays, setEditDays] = useState(30);

  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    try {
      const res = await fetchWithAuth(api("/admin/users"));
      if (!res.ok) throw new Error("Not authorized");
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load admin panel.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function openEditModal(u: User) {
    setEditingUser(u);
    setEditName(u.full_name || "");
    setEditMobile(u.mobile_number || "");
    setEditAdmin(u.is_admin);
    setEditPlan(u.subscription.plan || "free");
    setEditStatus(u.subscription.status || "none");
    setEditDays(30);
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      // 1. Update basic info
      await fetchWithAuth(api(`/admin/users/${editingUser.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editName,
          mobile_number: editMobile,
          is_admin: editAdmin,
        }),
      });

      // 2. Update subscription if needed
      await fetchWithAuth(api(`/admin/subscriptions/${editingUser.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: editPlan,
          status: editStatus,
          days_to_add: editDays,
        }),
      });

      setEditingUser(null);
      loadUsers();
    } catch {
      alert("Failed to update user.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-10 text-center">Loading Admin Panel...</div>;
  if (error) return <div className="p-10 text-center text-red-500 font-bold">{error}</div>;

  return (
    <RequireAuth>
      <div className="max-w-7xl mx-auto mt-6 mb-12 px-4">
        
        {/* Header */}
        <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ShieldAlert className="w-8 h-8 text-yellow-400" />
              Admin Dashboard
            </h1>
            <p className="text-slate-400 mt-1">Manage users, roles, and manual subscription overrides.</p>
          </div>
          <div className="flex bg-slate-800 rounded-lg p-3 gap-6 shadow-inner mt-4 md:mt-0 border border-slate-700">
            <div className="text-center">
              <span className="block text-2xl font-black text-blue-400">{users.length}</span>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Users</span>
            </div>
            <div className="w-px bg-slate-700"></div>
            <div className="text-center">
              <span className="block text-2xl font-black text-green-400">
                {users.filter(u => u.subscription.is_pro).length}
              </span>
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Pro Users</span>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white border text-sm border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                  <th className="p-4">User</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Mobile</th>
                  <th className="p-4">Subscription</th>
                  <th className="p-4">Joined</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{u.full_name || "N/A"}</div>
                      <div className="text-slate-500 text-xs">{u.email}</div>
                    </td>
                    <td className="p-4">
                      {u.is_admin ? (
                        <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-bold">Admin</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs font-medium">User</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-600">
                      {u.mobile_number || "Not set"}
                    </td>
                    <td className="p-4">
                      {u.subscription.is_pro ? (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">PRO - {u.subscription.label}</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs font-medium">Free</span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500 whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={() => openEditModal(u)}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline bg-blue-50 px-3 py-1.5 rounded-lg"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">Edit User: {editingUser.email}</h2>
            
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Full Name</label>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full border rounded p-2" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Mobile</label>
                  <input type="text" value={editMobile} onChange={e => setEditMobile(e.target.value)} className="w-full border rounded p-2" />
                </div>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 border p-3 rounded-lg">
                <input type="checkbox" id="isAdmin" checked={editAdmin} onChange={e => setEditAdmin(e.target.checked)} className="w-4 h-4 cursor-pointer" />
                <label htmlFor="isAdmin" className="font-semibold text-sm cursor-pointer">Grant Admin Privileges</label>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-bold text-slate-800 mb-2">Subscription Override</h3>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Plan Level</label>
                    <select value={editPlan} onChange={e => setEditPlan(e.target.value)} className="w-full border rounded p-2">
                        <option value="free">Free</option>
                        <option value="monthly">Monthly Pro</option>
                        <option value="yearly">Yearly Pro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Status</label>
                    <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full border rounded p-2">
                        <option value="none">None / Expired</option>
                        <option value="active">Active</option>
                    </select>
                  </div>
                </div>

                {editStatus === "active" && (
                  <div>
                    <label className="block text-xs font-semibold mb-1">Extend Access By (Days)</label>
                    <input type="number" value={editDays} onChange={e => setEditDays(Number(e.target.value))} className="w-full border rounded p-2" min="1" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setEditingUser(null)} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 font-bold bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </RequireAuth>
  );
}
