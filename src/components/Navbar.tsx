import React from 'react';
import {
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  Database,
  FileCheck,
  FileSpreadsheet,
  Flame,
  HelpCircle,
  Layers,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Organization, UserRole } from '../types';
import { getSupabaseConfig } from '../services/supabaseClient';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  organization: Organization;
  setOrganization: (org: Organization) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  onOpenSupabaseModal: () => void;
  onResetBenchmark: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  organization,
  setOrganization,
  userRole,
  setUserRole,
  onOpenSupabaseModal,
  onResetBenchmark,
}) => {
  const { isConfigured } = getSupabaseConfig();

  const navTabs = [
    { id: 'dashboard', label: 'GST Dashboard', icon: Layers },
    { id: 'agent', label: 'AI Invoice Agent', icon: Bot },
    { id: 'register', label: 'Purchase Register', icon: FileSpreadsheet },
    { id: 'upload', label: 'Batch Upload & OCR', icon: Upload },
    { id: 'gstr2b', label: 'GSTR-2B Import', icon: FileCheck },
    { id: 'reconciliation', label: 'Reconciliation Engine', icon: ShieldCheck },
    { id: 'tests', label: 'Benchmark Test Suite', icon: Flame },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      {/* Top tier brand and org selector */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-tight text-white">Biznexco</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  GST Enterprise
                </span>
              </div>
              <p className="text-xs text-slate-400">Purchase Invoice Automation & 2B Reconciliation</p>
            </div>
          </div>

          {/* Org GSTIN & Period Details */}
          <div className="hidden lg:flex items-center space-x-6">
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
              <span className="text-xs font-semibold text-slate-400">GSTIN:</span>
              <span className="text-xs font-mono text-emerald-300 font-medium">{organization.gstin}</span>
              <span className="text-slate-600">|</span>
              <span className="text-xs text-slate-300 truncate max-w-[160px]">{organization.name}</span>
            </div>

            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-400">Period:</span>
              <select
                aria-label="GST Return Period"
                value={organization.currentReturnPeriod}
                onChange={(e) =>
                  setOrganization({ ...organization, currentReturnPeriod: e.target.value })
                }
                className="bg-transparent text-xs font-medium text-white focus:outline-none cursor-pointer"
              >
                <option value="04-2024" className="bg-slate-900 text-white">Apr 2024 (FY 2024-25)</option>
                <option value="05-2024" className="bg-slate-900 text-white">May 2024 (FY 2024-25)</option>
                <option value="06-2024" className="bg-slate-900 text-white">Jun 2024 (FY 2024-25)</option>
                <option value="03-2024" className="bg-slate-900 text-white">Mar 2024 (FY 2023-24)</option>
              </select>
            </div>

            {/* Role Switcher */}
            <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
              <span className="text-xs text-slate-400">Role:</span>
              <select
                aria-label="User Permission Role"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as UserRole)}
                className="bg-transparent text-xs font-semibold text-indigo-300 focus:outline-none cursor-pointer"
              >
                <option value="ADMIN" className="bg-slate-900 text-white">Admin</option>
                <option value="ACCOUNTANT" className="bg-slate-900 text-white">Accountant</option>
                <option value="AUDITOR" className="bg-slate-900 text-white">Auditor</option>
                <option value="VIEWER" className="bg-slate-900 text-white">Viewer</option>
              </select>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onResetBenchmark}
              title="Reset to official 9-scenario GST test dataset"
              className="hidden sm:flex items-center space-x-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Reset Test Data</span>
            </button>

            <button
              onClick={onOpenSupabaseModal}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                isConfigured
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/50'
                  : 'bg-indigo-950/40 text-indigo-300 border-indigo-700/60 hover:bg-indigo-900/50'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>{isConfigured ? 'Supabase Connected' : 'Supabase Setup'}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  isConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Tab Navigation Navigation */}
        <nav className="flex space-x-1 overflow-x-auto py-2 border-t border-slate-800/80 scrollbar-none">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
