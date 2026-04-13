import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { 
  Users, 
  FileText, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  PieChart,
  Pie
} from 'recharts';

export default function Dashboard() {
  const { profile, isAdmin, isSM, isPartner } = useAuth();
  const [stats, setStats] = useState({
    totalLeads: 0,
    convertedLeads: 0,
    pendingLeads: 0,
    activePartners: 0
  });
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;

    const leadsRef = collection(db, 'leads');
    let leadsQuery = query(leadsRef, orderBy('createdAt', 'desc'), limit(10));

    if (isPartner) {
      leadsQuery = query(leadsRef, where('partnerId', '==', profile.uid), orderBy('createdAt', 'desc'), limit(10));
    } else if (isSM) {
      leadsQuery = query(leadsRef, where('smId', '==', profile.uid), orderBy('createdAt', 'desc'), limit(10));
    }

    const unsubscribeLeads = onSnapshot(leadsQuery, (snapshot) => {
      const leads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentLeads(leads);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    // Overall stats listener
    const unsubscribeStats = onSnapshot(collection(db, 'leads'), (snapshot) => {
      const allLeads = snapshot.docs.map(doc => doc.data());
      const filteredLeads = isPartner 
        ? allLeads.filter(l => l.partnerId === profile.uid)
        : isSM 
          ? allLeads.filter(l => l.smId === profile.uid)
          : allLeads;

      setStats({
        totalLeads: filteredLeads.length,
        convertedLeads: filteredLeads.filter(l => l.status === 'converted').length,
        pendingLeads: filteredLeads.filter(l => ['new', 'assigned', 'contacted'].includes(l.status)).length,
        activePartners: new Set(allLeads.map(l => l.partnerId)).size
      });

      // Prepare chart data (status distribution)
      const statusCounts = filteredLeads.reduce((acc: any, lead: any) => {
        acc[lead.status] = (acc[lead.status] || 0) + 1;
        return acc;
      }, {});

      const formattedChartData = Object.keys(statusCounts).map(status => ({
        name: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
        value: statusCounts[status]
      }));
      setChartData(formattedChartData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads/stats'));

    return () => {
      unsubscribeLeads();
      unsubscribeStats();
    };
  }, [profile, isPartner, isSM]);

  const statCards = [
    { label: 'Total Leads', value: stats.totalLeads, icon: FileText, color: 'blue' },
    { label: 'Converted', value: stats.convertedLeads, icon: CheckCircle2, color: 'green' },
    { label: 'Pending', value: stats.pendingLeads, icon: Clock, color: 'amber' },
    { label: 'Active Partners', value: stats.activePartners, icon: Users, color: 'purple', show: !isPartner },
  ];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#6B7280'];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Welcome back, {profile?.displayName}</h1>
        <p className="text-gray-500 mt-1">Here's what's happening with your leads today.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.filter(card => card.show !== false).map((card, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl bg-${card.color}-50 text-${card.color}-600`}>
                <card.icon className="w-6 h-6" />
              </div>
              <div className="flex items-center text-green-600 text-sm font-medium">
                <TrendingUp className="w-4 h-4 mr-1" />
                12%
              </div>
            </div>
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">{card.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Lead Status Distribution</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#FFF', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  cursor={{ fill: '#F9FAFB' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-6">Recent Leads</h3>
          <div className="space-y-6">
            {recentLeads.length > 0 ? recentLeads.map((lead, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className={`w-2 h-2 mt-2 rounded-full bg-${lead.status === 'converted' ? 'green' : 'blue'}-500`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{lead.customerName || 'Unnamed Customer'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">ID: {lead.enquiryId}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-gray-900 uppercase tracking-wider">{lead.status}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {lead.createdAt?.toDate ? new Date(lead.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-500 text-center py-8">No recent leads found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
