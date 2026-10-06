import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LOGIN } from '../../auth/guard';
import { policyErrors } from '../../auth/passwordPolicy';

export default function ChangePasswordPanel({ className = '' }) {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.current || !form.next) return setError('Please fill in all fields.');
    if (form.next !== form.confirm) return setError('New passwords do not match.');
    if (form.next === form.current) return setError('New password must be different from the current password.');
    const problems = policyErrors(form.next, user?.email);
    if (problems.length) return setError(problems[0]);

    setBusy(true);
    const role = user?.role;
    const res = await changePassword(form.current, form.next);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    navigate(ROLE_LOGIN[role] || '/', { replace: true });
  };

  const input = 'w-full border border-[#E8E2D9] rounded-xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] bg-[#FAF7F2] text-gray-900 transition-all';

  return (
    <div className={`bg-white rounded-3xl shadow-xs border border-[#EADBCC] p-6 sm:p-8 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={18} className="text-[#9B7036]" />
        <h3 className="text-base font-serif font-bold text-gray-900">Account Security & Credentials</h3>
      </div>
      <p className="text-xs text-gray-500 font-light mb-5">
        Updating your password will revoke all active browser sessions across devices for security.
      </p>

      {error && (
        <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-[#800020] rounded-xl text-xs font-semibold" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1" htmlFor="cp-current">
            Current Password
          </label>
          <input
            id="cp-current"
            type="password"
            autoComplete="current-password"
            required
            value={form.current}
            onChange={(e) => update('current', e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1" htmlFor="cp-new">
            New Password
          </label>
          <input
            id="cp-new"
            type="password"
            autoComplete="new-password"
            required
            value={form.next}
            onChange={(e) => update('next', e.target.value)}
            className={input}
          />
          <p className="text-[11px] text-gray-400 mt-1 font-medium">Minimum 8 characters containing letters and numbers.</p>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1" htmlFor="cp-confirm">
            Confirm New Password
          </label>
          <input
            id="cp-confirm"
            type="password"
            autoComplete="new-password"
            required
            value={form.confirm}
            onChange={(e) => update('confirm', e.target.value)}
            className={input}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-3 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-60"
        >
          {busy ? 'Securing Account…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
