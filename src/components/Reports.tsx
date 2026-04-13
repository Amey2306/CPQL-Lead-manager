import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { Download, Filter } from 'lucide-react';

export default function Reports() {
  const { isAdmin, isSM } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribeLeads = onSnapshot(collection(db, 'leads'), (snapshot) => {
      setLeads(snapshot.docs.map(doc => doc.data()));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    const unsubscribePartners = onSnapshot(collection(db, 'users'), (snapshot) => {
      setPartners(snapshot.docs.map(doc => doc.data()).filter(u => u.role === 'partner'));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubscribeLeads();
      unsubscribePartners();
    };
  }, []);

  // Performance by Partner
  const partnerPerformance = partners.map(partner => {
    const partnerLeads = leads.filter(l => l.partnerId === partner.uid);
    const converted = partnerLeads.filter(l => l.status === 'converted').length;
    return {
      name: partner.displayName,
      total: partnerLeads.length,
      converted: converted,
      rate: partnerLeads.length > 0 ? Math.round((converted / partnerLeads.length) * 100) : 0
    };
  }).sort((a, b) => b.rate - a.rate);

  // Conversion Funnel
  const funnelData = [
    { name: 'Total Leads', value: leads.length },
    { name: 'Assigned', value: leads.filter(l => l.status !== 'new').length },
    { name: 'Site Visits', value: leads.filter(l => ['site_visit', 'converted'].includes(l.status)).length },
    { name: 'Converted', value: leads.filter(l => l.status === 'converted').length },
  ];

  const COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981'];

  if (!isAdmin && !isSM) return <div className="p-8 text-center text-gray-500">Access Denied</div>;

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">Track partner performance and conversion metrics.</p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-gray-200 text-gray-900 px-6 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm">
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Partner Performance Chart */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Partner Conversion Rates (%)</h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={partnerPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} width={100} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFF', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="rate" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Funnel Chart */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Conversion Funnel</h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={funnelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFF', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Partner Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-900">Partner Performance Details</h3>
          <button className="text-gray-400 hover:text-gray-900">
            <Filter className="w-5 h-5" />
          </button>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Partner Name</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Total Leads</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Converted</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Conversion Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {partnerPerformance.map((p, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{p.name}</td>
                <td className="px-6 py-4 text-gray-600">{p.total}</td>
                <td className="px-6 py-4 text-gray-600">{p.converted}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-green-500 h-full rounded-full" 
                        style={{ width: `${p.rate}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-900">{p.rate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
