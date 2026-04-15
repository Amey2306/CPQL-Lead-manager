import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { motion } from 'motion/react';
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
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [allLeads, setAllLeads] = useState<any[]>([]);

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
      const leadsData = snapshot.docs.map(doc => doc.data());
      setAllLeads(leadsData);
      
      const filteredLeads = isPartner 
        ? leadsData.filter(l => l.partnerId === profile.uid)
        : isSM 
          ? leadsData.filter(l => l.smId === profile.uid)
          : leadsData;

      setStats({
        totalLeads: filteredLeads.length,
        convertedLeads: filteredLeads.filter(l => l.status === 'converted').length,
        pendingLeads: filteredLeads.filter(l => ['new', 'assigned', 'contacted'].includes(l.status)).length,
        activePartners: new Set(leadsData.map(l => l.partnerId)).size
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

    const unsubscribeProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'projects'));

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => {
      unsubscribeLeads();
      unsubscribeStats();
      unsubscribeProjects();
      unsubscribeUsers();
    };
  }, [profile, isPartner, isSM]);

  const statCards = [
    { label: 'Total Leads', value: stats.totalLeads, icon: FileText, colorClass: 'bg-blue-50 text-blue-600' },
    { label: 'Converted', value: stats.convertedLeads, icon: CheckCircle2, colorClass: 'bg-green-50 text-green-600' },
    { label: 'Pending', value: stats.pendingLeads, icon: Clock, colorClass: 'bg-amber-50 text-amber-600' },
    { label: 'Active Partners', value: stats.activePartners, icon: Users, colorClass: 'bg-purple-50 text-purple-600', show: !isPartner },
  ];

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#6B7280'];

  const filteredLeads = isPartner 
    ? allLeads.filter(l => l.partnerId === profile?.uid)
    : isSM 
      ? allLeads.filter(l => l.smId === profile?.uid)
      : allLeads;

  const projectSummary = projects.map(proj => {
    const projLeads = filteredLeads.filter(l => l.projectId === proj.id);
    return {
      name: proj.name,
      total: projLeads.length,
      converted: projLeads.filter(l => l.status === 'converted').length,
      pending: projLeads.filter(l => ['new', 'assigned', 'contacted'].includes(l.status)).length,
    };
  }).sort((a, b) => b.total - a.total).filter(p => p.total > 0);

  const vendorPerformance = users.filter(u => u.role === 'partner' || u.role === 'vendor').map(vendor => {
    const vendorLeads = allLeads.filter(l => l.partnerId === vendor.uid);
    return {
      name: vendor.displayName,
      total: vendorLeads.length,
      converted: vendorLeads.filter(l => l.status === 'converted').length,
      rate: vendorLeads.length > 0 ? Math.round((vendorLeads.filter(l => l.status === 'converted').length / vendorLeads.length) * 100) : 0
    };
  }).sort((a, b) => b.rate - a.rate);

  const smPerformance = users.filter(u => u.role === 'sm').map(sm => {
    const smLeads = allLeads.filter(l => l.smId === sm.uid);
    return {
      name: sm.displayName,
      assigned: smLeads.length,
      converted: smLeads.filter(l => l.status === 'converted').length,
      rate: smLeads.length > 0 ? Math.round((smLeads.filter(l => l.status === 'converted').length / smLeads.length) * 100) : 0
    };
  }).sort((a, b) => b.rate - a.rate);

  const insights = [];
  if (isAdmin) {
    const topVendor = vendorPerformance[0];
    if (topVendor && topVendor.total > 0) insights.push(`Top performing vendor is ${topVendor.name} with a ${topVendor.rate}% conversion rate.`);
    const topSM = smPerformance[0];
    if (topSM && topSM.assigned > 0) insights.push(`Top performing SM is ${topSM.name} with a ${topSM.rate}% conversion rate.`);
    const topProject = projectSummary[0];
    if (topProject && topProject.total > 0) insights.push(`${topProject.name} is the most active project with ${topProject.total} leads.`);
  } else if (isPartner) {
    const myLeads = allLeads.filter(l => l.partnerId === profile?.uid);
    const myConverted = myLeads.filter(l => l.status === 'converted').length;
    const myRate = myLeads.length > 0 ? Math.round((myConverted / myLeads.length) * 100) : 0;
    insights.push(`You have generated ${myLeads.length} leads with a ${myRate}% conversion rate.`);
  } else if (isSM) {
    const myLeads = allLeads.filter(l => l.smId === profile?.uid);
    const myConverted = myLeads.filter(l => l.status === 'converted').length;
    const myRate = myLeads.length > 0 ? Math.round((myConverted / myLeads.length) * 100) : 0;
    insights.push(`You have been assigned ${myLeads.length} leads with a ${myRate}% conversion rate.`);
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 md:space-y-8"
    >
      <header>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Welcome back, {profile?.displayName}</h1>
        <p className="text-sm md:text-base text-gray-500 mt-1">Here's what's happening with your leads today.</p>
      </header>

      {/* Stats Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6"
      >
        {statCards.filter(card => card.show !== false).map((card, i) => (
          <div key={i} className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className={`p-2.5 md:p-3 rounded-xl ${card.colorClass}`}>
                <card.icon className="w-5 h-5 md:w-6 md:h-6" />
              </div>
              <div className="flex items-center text-green-600 text-xs md:text-sm font-medium bg-green-50 px-2 py-1 rounded-lg">
                <TrendingUp className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                12%
              </div>
            </div>
            <p className="text-xs md:text-sm font-medium text-gray-500">{card.label}</p>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mt-1">{card.value}</h3>
          </div>
        ))}
      </motion.div>

      {/* Insights */}
      {insights.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-blue-50 border border-blue-100 p-4 md:p-6 rounded-2xl shadow-sm"
        >
          <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Performance Insights
          </h3>
          <ul className="space-y-1">
            {insights.map((insight, i) => (
              <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                {insight}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-gray-100"
        >
          <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">Lead Status Distribution</h3>
          <div className="h-[250px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} tickMargin={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} />
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
        </motion.div>

        {/* Recent Activity */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-gray-100"
        >
          <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">Recent Leads</h3>
          <div className="space-y-4 md:space-y-6">
            {recentLeads.length > 0 ? recentLeads.map((lead, i) => (
              <div key={i} className="flex items-start gap-3 md:gap-4">
                <div className={`w-2 h-2 mt-1.5 md:mt-2 rounded-full ${lead.status === 'converted' ? 'bg-green-500' : 'bg-blue-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm font-bold text-gray-900 truncate">{lead.customerName || 'Unnamed Customer'}</p>
                  <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">ID: {lead.enquiryId}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] md:text-xs font-medium text-gray-900 uppercase tracking-wider">{lead.status.replace(/_/g, ' ')}</p>
                  <p className="text-[9px] md:text-[10px] text-gray-400 mt-0.5">
                    {lead.createdAt?.toDate ? new Date(lead.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-xs md:text-sm text-gray-500 text-center py-8">No recent leads found.</p>
            )}
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        {/* Project Summary */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-gray-100"
        >
          <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">Project Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="pb-3 font-medium">Project</th>
                  <th className="pb-3 font-medium text-right">Total Leads</th>
                  <th className="pb-3 font-medium text-right">Converted</th>
                  <th className="pb-3 font-medium text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {projectSummary.map((proj, i) => (
                  <tr key={i}>
                    <td className="py-3 font-medium text-gray-900">{proj.name}</td>
                    <td className="py-3 text-right">{proj.total}</td>
                    <td className="py-3 text-right text-green-600 font-medium">{proj.converted}</td>
                    <td className="py-3 text-right text-amber-600">{proj.pending}</td>
                  </tr>
                ))}
                {projectSummary.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">No projects found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Admin Performance View */}
        {isAdmin && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white p-4 md:p-8 rounded-2xl shadow-sm border border-gray-100"
          >
            <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">Vendor Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="pb-3 font-medium">Vendor</th>
                    <th className="pb-3 font-medium text-right">Total Leads</th>
                    <th className="pb-3 font-medium text-right">Converted</th>
                    <th className="pb-3 font-medium text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {vendorPerformance.map((vendor, i) => (
                    <tr key={i}>
                      <td className="py-3 font-medium text-gray-900">{vendor.name}</td>
                      <td className="py-3 text-right">{vendor.total}</td>
                      <td className="py-3 text-right text-green-600 font-medium">{vendor.converted}</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          vendor.rate > 20 ? 'bg-green-50 text-green-700' : 
                          vendor.rate > 10 ? 'bg-blue-50 text-blue-700' : 
                          'bg-gray-50 text-gray-700'
                        }`}>
                          {vendor.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {vendorPerformance.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-gray-500">No vendors found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6 mt-8">SM Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-100">
                    <th className="pb-3 font-medium">Sales Manager</th>
                    <th className="pb-3 font-medium text-right">Total Leads Assigned</th>
                    <th className="pb-3 font-medium text-right">Converted</th>
                    <th className="pb-3 font-medium text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {smPerformance.map((sm, i) => (
                    <tr key={i}>
                      <td className="py-3 font-medium text-gray-900">{sm.name}</td>
                      <td className="py-3 text-right">{sm.assigned}</td>
                      <td className="py-3 text-right text-green-600 font-medium">{sm.converted}</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          sm.rate > 20 ? 'bg-green-50 text-green-700' : 
                          sm.rate > 10 ? 'bg-blue-50 text-blue-700' : 
                          'bg-gray-50 text-gray-700'
                        }`}>
                          {sm.rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {smPerformance.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-gray-500">No SMs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
