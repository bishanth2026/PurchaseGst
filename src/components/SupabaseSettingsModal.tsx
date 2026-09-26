import React, { useState } from 'react';
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  Key,
  Lock,
  Server,
  Shield,
  X,
} from 'lucide-react';
import {
  clearSupabaseConfig,
  getSupabaseConfig,
  saveSupabaseConfig,
} from '../services/supabaseClient';

interface SupabaseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged: () => void;
}

export const SupabaseSettingsModal: React.FC<SupabaseSettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  const currentConfig = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(currentConfig.url);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(currentConfig.anonKey);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'sql' | 'rls'>('config');

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig(supabaseUrl, supabaseAnonKey);
    onConfigChanged();
    onClose();
  };

  const handleClear = () => {
    clearSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseAnonKey('');
    onConfigChanged();
  };

  const sqlMigrationCode = `-- Biznexco Purchase Invoice & GST Reconciliation Schema
-- Execute in your Supabase SQL Editor:

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    gstin VARCHAR(15) NOT NULL UNIQUE,
    state_code VARCHAR(2) NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Organization Members (RBAC)
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('ADMIN', 'ACCOUNTANT', 'AUDITOR', 'VIEWER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(org_id, user_id)
);

-- 3. Invoices
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    supplier_name VARCHAR(255) NOT NULL,
    supplier_gstin VARCHAR(15) NOT NULL,
    buyer_gstin VARCHAR(15) NOT NULL,
    invoice_number VARCHAR(64) NOT NULL,
    normalized_invoice_number VARCHAR(64) NOT NULL,
    invoice_date DATE NOT NULL,
    document_type VARCHAR(10) NOT NULL CHECK (document_type IN ('INV', 'CRN', 'DBN')),
    place_of_supply VARCHAR(2) NOT NULL,
    taxable_value NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    cess_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    hsn_sac VARCHAR(20),
    itc_eligibility VARCHAR(30) DEFAULT 'ELIGIBLE',
    status VARCHAR(30) DEFAULT 'APPROVED',
    confidence_scores JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access invoices for their organizations"
    ON purchase_invoices FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM organization_members
        WHERE org_id = purchase_invoices.org_id AND user_id = auth.uid()
      )
    );`;

  const copySql = () => {
    navigator.clipboard.writeText(sqlMigrationCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">
              Supabase Backend & Security Architecture
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('config')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeTab === 'config'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Connection Settings
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeTab === 'sql'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            SQL Migrations
          </button>
          <button
            onClick={() => setActiveTab('rls')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              activeTab === 'rls'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Row Level Security (RLS)
          </button>
        </div>

        {/* Tab 1: Config */}
        {activeTab === 'config' && (
          <form onSubmit={handleSave} className="space-y-4 text-xs flex-1 overflow-y-auto">
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-white">
                <Server className="w-4 h-4 text-indigo-400" />
                <span>Zero Setup Local Sandbox Mode Active</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                The application works instantly out-of-the-box with persistent local storage
                and preloaded benchmark tax data. You can optionally link your live Supabase
                project below to enable persistent cloud Postgres and file storage.
              </p>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Supabase Project URL
              </label>
              <input
                type="url"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Supabase Anon / Public API Key
              </label>
              <input
                type="password"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClear}
                className="text-slate-400 hover:text-rose-400 text-xs"
              >
                Reset to Sandbox
              </button>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
                >
                  Save Connection
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 2: SQL */}
        {activeTab === 'sql' && (
          <div className="space-y-3 text-xs flex-1 overflow-y-auto">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">
                Run this script in the Supabase SQL Editor to provision tables & triggers:
              </span>
              <button
                onClick={copySql}
                className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded border border-slate-700 font-semibold"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[340px]">
              {sqlMigrationCode}
            </pre>
          </div>
        )}

        {/* Tab 3: RLS */}
        {activeTab === 'rls' && (
          <div className="space-y-3 text-xs flex-1 overflow-y-auto text-slate-300">
            <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-white">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Multi-Tenant Row Level Security Architecture</span>
              </div>
              <p className="leading-relaxed">
                Biznexco enforces strict tenant isolation using PostgreSQL RLS policies tied to{' '}
                <code className="text-emerald-300 font-mono">organization_members.org_id</code>.
              </p>
            </div>

            <div className="space-y-2">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="font-bold text-white block mb-0.5">Admin Role:</span>
                Full write, approval, deletion, and organization settings access.
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="font-bold text-white block mb-0.5">Accountant Role:</span>
                Uploads invoices, manages line items, and views GSTR-2B.
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="font-bold text-white block mb-0.5">Auditor Role:</span>
                Accepts/rejects reconciliation matches, creates manual links, and exports reports.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
