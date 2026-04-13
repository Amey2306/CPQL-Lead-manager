import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { Users, FileText, CheckCircle, TrendingUp } from 'lucide-react';

export default function VendorList() {
  const { isAdmin, isSM } = useAuth();
  const [vendors, setVendors] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdmin && !isSM) return;

    const unsubscribeVendors = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['partner', 'vendor'])), (snapshot) => {
      setVendors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/vendors'));

    const unsubscribeLeads = onSnapshot(collection(db, 'leads'), (snapshot) => {
      setLeads(snapshot.docs.map(doc => doc.data()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    return () => {
      unsubscribeVendors();
      unsubscribeLeads();
    };
  }, [isAdmin, isSM]);

  const getVendorStats = (vendorId: string) => {
    const vendorLeads = leads.filter(l => l.partnerId === vendorId);
    const converted = vendorLeads.filter(l => l.status === 'converted').length;
    const conversionRate = vendorLeads.length > 0 ? ((converted / vendorLeads.length) * 100).toFixed(1) : '0';
    
    return {
      total: vendorLeads.length,
      converted,
      rate: conversionRate
    };
  };

  if (!isAdmin && !isSM) return <div className="p-8 text-center text-gray-500">Access Denied</div>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Partners & Vendors</h1>
        <p className="text-gray-500 mt-1">Monitor performance and manage external lead providers.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-50 rounded-xl">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Partners</p>
              <p className="text-2xl font-bold text-gray-900">{vendors.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-50 rounded-xl">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Total Leads Provided</p>
              <p className="text-2xl font-bold text-gray-900">{leads.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-purple-50 rounded-xl">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Avg. Conversion Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {(leads.filter(l => l.status === 'converted').length / (leads.length || 1) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Partner / Vendor</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Total Leads</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Converted</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Conversion %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vendors.map((vendor) => {
              const stats = getVendorStats(vendor.uid);
              return (
                <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600">
                        {vendor.displayName?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{vendor.displayName}</p>
                        <p className="text-xs text-gray-500">{vendor.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      vendor.role === 'partner' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {vendor.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-medium text-gray-900">{stats.total}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-green-600 font-bold">
                      <CheckCircle className="w-4 h-4" />
                      {stats.converted}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="w-full bg-gray-100 rounded-full h-2 max-w-[100px] mx-auto mb-1">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${Math.min(Number(stats.rate), 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-600">{stats.rate}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
