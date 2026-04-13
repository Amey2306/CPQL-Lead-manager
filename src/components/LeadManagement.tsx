import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, where, arrayUnion, writeBatch, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { Plus, Search, Filter, MessageSquare, Edit3, CheckCircle, XCircle, Upload, FileSpreadsheet, FileText as FileIcon, Check, User, Calendar, Clock, CheckSquare, Trash2 } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function LeadManagement() {
  const { profile, isAdmin, isSM, isPartner, isVendor, isVendorManager, isVendorEditor } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [sms, setSMs] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({
    statuses: ['new', 'assigned', 'contacted', 'site_visit_proposed', 'site_visit_done', 'converted', 'lost'],
    lostReasons: ['not contacted', 'not interested', 'budget not matched', 'location not matched', 'purchased elsewhere']
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editLeadData, setEditLeadData] = useState<any>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [lostLeadIds, setLostLeadIds] = useState<string[]>([]);
  const [selectedLostReason, setSelectedLostReason] = useState('');
  const [lostNotes, setLostNotes] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [newLead, setNewLead] = useState({
    enquiryId: '',
    projectId: '',
    customerName: '',
    customerPhone: '',
    budget: 0,
    possession: '',
    status: 'new',
    vendorNotes: '',
    partnerId: ''
  });
  const [statusUpdate, setStatusUpdate] = useState({
    leadIds: [] as string[],
    status: '',
    notes: ''
  });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackView, setFeedbackView] = useState<'vendor' | 'sm' | 'tasks'>('vendor');
  const [smViewMode, setSmViewMode] = useState<'all' | 'my'>('my');
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState({ title: '', dueDate: '', assignedTo: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;

    // Fetch Settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'leads'), (docSnap) => {
      if (docSnap.exists()) setSettings(docSnap.data());
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/leads'));

    // Fetch Leads
    const leadsRef = collection(db, 'leads');
    let leadsQuery = query(leadsRef);
    if (isPartner || isVendor) leadsQuery = query(leadsRef, where('partnerId', '==', profile.vendorCompanyId || profile.uid));
    else if (isSM && smViewMode === 'my') leadsQuery = query(leadsRef, where('smId', '==', profile.uid));

    const unsubscribeLeads = onSnapshot(leadsQuery, (snapshot) => {
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // If SM and in "My Leads" mode, filter locally if query didn't (though query should have)
      setLeads(docs);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'leads'));

    // Fetch Projects
    const unsubscribeProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'projects'));

    // Fetch SMs for assignment
    let unsubscribeSMs: () => void = () => {};
    let unsubscribePartners: () => void = () => {};

    if (isAdmin || isPartner || isVendor || isSM) {
      unsubscribeSMs = onSnapshot(query(collection(db, 'users'), where('role', '==', 'sm')), (snapshot) => {
        setSMs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/sm'));
    }

    if (isAdmin || isSM) {
      unsubscribePartners = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['partner', 'vendor'])), (snapshot) => {
        setPartners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/partners'));
    }

    return () => {
      unsubscribeSettings();
      unsubscribeLeads();
      unsubscribeProjects();
      unsubscribeSMs();
      unsubscribePartners();
    };
  }, [profile, isAdmin, isSM, isPartner, isVendor, smViewMode]);

  useEffect(() => {
    if (selectedLead) {
      if (isSM || isAdmin) setFeedbackView('sm');
      else setFeedbackView('vendor');

      // Fetch Tasks for selected lead
      const tasksRef = collection(db, 'tasks');
      const q = query(tasksRef, where('leadId', '==', selectedLead.id));
      const unsubscribeTasks = onSnapshot(q, (snapshot) => {
        setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));

      return () => unsubscribeTasks();
    }
  }, [selectedLead, isSM, isAdmin]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !newTask.title || !newTask.assignedTo) return;

    try {
      await addDoc(collection(db, 'tasks'), {
        leadId: selectedLead.id,
        title: newTask.title,
        dueDate: newTask.dueDate,
        assignedTo: newTask.assignedTo,
        completed: false,
        createdBy: profile?.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setNewTask({ title: '', dueDate: '', assignedTo: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const toggleTaskCompletion = async (taskId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        completed: !currentStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const calculateLeadScore = (lead: any) => {
    let score = 0;
    const breakdown = { budget: 0, engagement: 0, status: 0 };

    // 1. Budget (Max 40 points)
    const budget = Number(lead.budget) || 0;
    if (budget > 10000000) breakdown.budget = 40;
    else if (budget > 5000000) breakdown.budget = 30;
    else if (budget > 2000000) breakdown.budget = 20;
    else if (budget > 0) breakdown.budget = 10;
    score += breakdown.budget;

    // 2. Engagement (Max 30 points)
    const historyCount = lead.statusHistory?.length || 0;
    const feedbackCount = lead.partnerFeedback?.length || 0;
    const histPts = Math.min(historyCount * 5, 15);
    const feedPts = Math.min(feedbackCount * 5, 15);
    breakdown.engagement = histPts + feedPts;
    score += breakdown.engagement;

    // 3. Status (Max 30 points)
    const statusScores: { [key: string]: number } = {
      'converted': 30,
      'site_visit_done': 25,
      'site_visit_proposed': 20,
      'contacted': 15,
      'assigned': 12,
      'new': 10,
      'lost': 0
    };
    breakdown.status = statusScores[lead.status] || 0;
    score += breakdown.status;

    return { total: Math.min(score, 100), breakdown };
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedPartner = (isAdmin || isSM) && newLead.partnerId 
        ? partners.find(p => p.uid === newLead.partnerId) 
        : { uid: profile?.vendorCompanyId || profile?.uid, displayName: profile?.displayName };

      await addDoc(collection(db, 'leads'), {
        ...newLead,
        partnerId: selectedPartner?.uid,
        partnerName: selectedPartner?.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        partnerFeedback: [],
        statusHistory: [{
          status: 'new',
          notes: newLead.vendorNotes,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        }]
      });
      setIsModalOpen(false);
      setNewLead({ enquiryId: '', projectId: '', customerName: '', customerPhone: '', budget: 0, possession: '', status: 'new', vendorNotes: '', partnerId: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'leads');
    }
  };

  const handleBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'csv') {
      Papa.parse(file, {
        header: true,
        complete: (results) => processBulkData(results.data),
        error: (error) => console.error('CSV Parse Error:', error)
      });
    } else if (extension === 'xlsx' || extension === 'xls') {
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        processBulkData(jsonData);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const processBulkData = async (data: any[]) => {
    if (!profile) return;
    const batch = writeBatch(db);
    const leadsRef = collection(db, 'leads');

    data.forEach((row) => {
      if (!row.enquiryId || !row.projectId) return;
      
      const newDocRef = doc(leadsRef);
      batch.set(newDocRef, {
        enquiryId: String(row.enquiryId),
        projectId: String(row.projectId),
        customerName: String(row.customerName || ''),
        customerPhone: String(row.customerPhone || ''),
        budget: Number(row.budget) || 0,
        possession: String(row.possession || ''),
        status: 'new',
        vendorNotes: String(row.vendorNotes || ''),
        partnerId: profile.vendorCompanyId || profile.uid,
        partnerName: profile.displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        partnerFeedback: [],
        statusHistory: [{
          status: 'new',
          notes: 'Bulk uploaded',
          updatedAt: new Date(),
          updatedBy: profile.displayName
        }]
      });
    });

    try {
      await batch.commit();
      setIsBulkModalOpen(false);
      alert('Bulk upload successful!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/bulk');
    }
  };

  const handleEditLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLeadData) return;
    try {
      await updateDoc(doc(db, 'leads', editLeadData.id), {
        customerName: editLeadData.customerName,
        customerPhone: editLeadData.customerPhone,
        budget: editLeadData.budget,
        possession: editLeadData.possession,
        updatedAt: serverTimestamp()
      });
      setIsEditModalOpen(false);
      setEditLeadData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${editLeadData.id}`);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!window.confirm('Are you sure you want to delete this lead?')) return;
    try {
      await deleteDoc(doc(db, 'leads', leadId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `leads/${leadId}`);
    }
  };

  const handleUpdateStatus = (leadId: string, status: string) => {
    if (status === 'lost') {
      setLostLeadIds([leadId]);
      setIsLostModalOpen(true);
      return;
    }
    setStatusUpdate({ leadIds: [leadId], status, notes: '' });
    setIsStatusModalOpen(true);
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { leadIds, status, notes } = statusUpdate;
    const batch = writeBatch(db);
    
    leadIds.forEach(id => {
      const leadRef = doc(db, 'leads', id);
      batch.update(leadRef, { 
        status, 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status,
          notes,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
    });

    try {
      await batch.commit();
      setIsStatusModalOpen(false);
      setStatusUpdate({ leadIds: [], status: '', notes: '' });
      if (leadIds.length > 1) setSelectedLeadIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/status-update');
    }
  };

  const handleLostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLostReason || lostLeadIds.length === 0) return;

    const batch = writeBatch(db);
    lostLeadIds.forEach(id => {
      const leadRef = doc(db, 'leads', id);
      batch.update(leadRef, { 
        status: 'lost', 
        lostReason: selectedLostReason, 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'lost',
          notes: `Reason: ${selectedLostReason}. ${lostNotes}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
    });

    try {
      await batch.commit();
      setIsLostModalOpen(false);
      setLostLeadIds([]);
      setSelectedLostReason('');
      setLostNotes('');
      if (lostLeadIds.length > 1) setSelectedLeadIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/lost-status');
    }
  };

  const handleAssignSM = async (leadId: string, smId: string) => {
    try {
      const selectedSM = sms.find(s => s.uid === smId);
      await updateDoc(doc(db, 'leads', leadId), { 
        smId, 
        status: 'assigned', 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'assigned',
          notes: `Assigned to SM: ${selectedSM?.displayName || 'Unknown'}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedLeadIds.length === 0) return;
    
    if (status === 'lost') {
      setLostLeadIds(selectedLeadIds);
      setIsLostModalOpen(true);
      return;
    }

    setStatusUpdate({ leadIds: selectedLeadIds, status, notes: '' });
    setIsStatusModalOpen(true);
  };

  const handleBulkAssignSM = async (smId: string) => {
    if (selectedLeadIds.length === 0 || !smId) return;
    const selectedSM = sms.find(s => s.uid === smId);
    const batch = writeBatch(db);
    selectedLeadIds.forEach(id => {
      const leadRef = doc(db, 'leads', id);
      batch.update(leadRef, { 
        smId, 
        status: 'assigned', 
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'assigned',
          notes: `Bulk assigned to SM: ${selectedSM?.displayName || 'Unknown'}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
    });
    try {
      await batch.commit();
      setSelectedLeadIds([]);
      alert('Bulk SM assignment successful!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/bulk-assign');
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(leads.map(l => l.id));
    }
  };

  const handleAddFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !feedback) return;

    try {
      const leadRef = doc(db, 'leads', selectedLead.id);
      if (isSM || isAdmin) {
        await updateDoc(leadRef, { smFeedback: feedback, updatedAt: serverTimestamp() });
      } else if (isPartner || isVendor) {
        await updateDoc(leadRef, { 
          partnerFeedback: arrayUnion(`${new Date().toLocaleString()}: ${feedback}`),
          updatedAt: serverTimestamp() 
        });
      }
      setFeedback('');
      setSelectedLead(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    }
  };

  if (!profile) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const myLeadsCount = leads.filter(l => l.smId === profile.uid).length;
  const pendingLeadsCount = leads.filter(l => l.smId === profile.uid && l.status === 'new').length;

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lead Management</h1>
          <p className="text-gray-500 mt-1">
            {isSM ? `Manage your assigned leads and track progress.` : `Track and manage leads across all projects.`}
          </p>
        </div>
        <div className="flex gap-3">
          {isSM && (
            <div className="flex bg-gray-100 p-1 rounded-xl mr-4">
              <button
                onClick={() => setSmViewMode('my')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  smViewMode === 'my' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                My Leads ({myLeadsCount})
              </button>
              <button
                onClick={() => setSmViewMode('all')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  smViewMode === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Leads
              </button>
            </div>
          )}
          {(isPartner || isVendor || isAdmin) && (
            <>
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-900 px-6 py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
              >
                <Upload className="w-5 h-5" />
                Bulk Upload
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg"
              >
                <Plus className="w-5 h-5" />
                Drop a Lead
              </button>
            </>
          )}
        </div>
      </header>

      {isSM && smViewMode === 'my' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-xl shadow-blue-200">
            <p className="text-blue-100 text-sm font-bold uppercase tracking-wider mb-1">My Total Leads</p>
            <p className="text-4xl font-black">{myLeadsCount}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <p className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-1">New / Pending</p>
            <p className="text-4xl font-black text-gray-900">{pendingLeadsCount}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <p className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-1">Converted</p>
            <p className="text-4xl font-black text-green-600">{leads.filter(l => l.smId === profile.uid && l.status === 'converted').length}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <p className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-1">Conversion Rate</p>
            <p className="text-4xl font-black text-blue-600">
              {myLeadsCount > 0 ? ((leads.filter(l => l.smId === profile.uid && l.status === 'converted').length / myLeadsCount) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedLeadIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 pr-6 border-r border-gray-700">
            <div className="bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
              {selectedLeadIds.length}
            </div>
            <span className="text-sm font-medium">Leads Selected</span>
          </div>
          
          <div className="flex items-center gap-4">
            {(isAdmin || isSM) && (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-gray-400" />
                <select
                  onChange={(e) => handleBulkStatusUpdate(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>Update Status</option>
                  {settings.statuses.map((s: string) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            )}

            {(isAdmin || isSM || isPartner || isVendor) && (
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <select
                  onChange={(e) => handleBulkAssignSM(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-sm rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>Assign SM</option>
                  {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                </select>
              </div>
            )}

            <button
              onClick={() => setSelectedLeadIds([])}
              className="text-sm text-gray-400 hover:text-white transition-colors ml-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white p-2 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/50">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search leads by name or ID"
              className="w-full pl-12 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-gray-900 focus:bg-white outline-none transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-white text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all font-medium">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-5">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    checked={leads.length > 0 && selectedLeadIds.length === leads.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Enquiry ID</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Customer</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Project</th>
                {(isAdmin || isSM) && <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Partner/Vendor</th>}
                {isSM && <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Vendor Notes</th>}
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Score</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Status</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Assigned SM</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className={`hover:bg-gray-50 transition-colors ${selectedLeadIds.includes(lead.id) ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      checked={selectedLeadIds.includes(lead.id)}
                      onChange={() => toggleSelectLead(lead.id)}
                    />
                  </td>
                  <td className="px-6 py-4 font-mono text-sm">{lead.enquiryId}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900">{lead.customerName}</p>
                    <p className="text-xs text-gray-500">{lead.customerPhone}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700">
                      {projects.find(p => p.id === lead.projectId)?.name || 'Unknown Project'}
                    </span>
                  </td>
                  {(isAdmin || isSM) && (
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-gray-900">{lead.partnerName || 'Direct'}</p>
                    </td>
                  )}
                  {isSM && (
                    <td className="px-6 py-4">
                      <p className="text-xs text-gray-600 line-clamp-2 max-w-[200px]" title={lead.vendorNotes}>
                        {lead.vendorNotes || 'No notes'}
                      </p>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    {(() => {
                      const score = calculateLeadScore(lead).total;
                      return (
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full border-2 border-gray-100 flex items-center justify-center relative">
                            <svg className="w-full h-full -rotate-90">
                              <circle
                                cx="20" cy="20" r="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                className="text-gray-100"
                              />
                              <circle
                                cx="20" cy="20" r="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeDasharray={100}
                                strokeDashoffset={100 - score}
                                className={`${
                                  score > 70 ? 'text-green-500' :
                                  score > 40 ? 'text-blue-500' :
                                  'text-orange-500'
                                }`}
                              />
                            </svg>
                            <span className="absolute text-[10px] font-black">{score}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit ${
                        lead.status === 'converted' ? 'bg-green-100 text-green-700' :
                        lead.status === 'lost' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {lead.status.replace(/_/g, ' ')}
                      </span>
                      {lead.status === 'lost' && lead.lostReason && (
                        <span className="text-[10px] text-red-500 font-medium italic">Reason: {lead.lostReason}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {isAdmin || isPartner || isVendor ? (
                      <select
                        value={lead.smId || ''}
                        onChange={(e) => handleAssignSM(lead.id, e.target.value)}
                        className="text-sm bg-gray-50 border border-gray-200 rounded p-1"
                      >
                        <option value="">Unassigned</option>
                        {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                      </select>
                    ) : (
                      <span className="text-sm text-gray-600">
                        {sms.find(s => s.uid === lead.smId)?.displayName || (lead.smId ? 'Assigned' : 'Unassigned')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setSelectedLead(lead)}
                        className="p-2 bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                        title="View Feedback & Notes"
                      >
                        <MessageSquare className="w-5 h-5" />
                      </button>
                      {(isAdmin || isSM || isVendorEditor || isVendorManager) && (
                        <button 
                          onClick={() => {
                            setEditLeadData(lead);
                            setIsEditModalOpen(true);
                          }}
                          className="p-2 bg-gray-50 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Edit Lead"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                      )}
                      {(isAdmin || isVendorManager) && (
                        <button 
                          onClick={() => handleDeleteLead(lead.id)}
                          className="p-2 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete Lead"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                      {(isSM || isAdmin) && (
                        <div className="relative group">
                          <select
                            value={lead.status}
                            onChange={(e) => handleUpdateStatus(lead.id, e.target.value)}
                            className="text-xs font-bold bg-gray-900 text-white border-none rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-800 transition-all appearance-none"
                          >
                            {settings.statuses.map((s: string) => (
                              <option key={s} value={s} className="bg-white text-gray-900">{s.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Plus className="w-3 h-3 text-white/50" />
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Lead Modal */}
      {isEditModalOpen && editLeadData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Lead</h2>
            <form onSubmit={handleEditLeadSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={editLeadData.customerName}
                    onChange={(e) => setEditLeadData({ ...editLeadData, customerName: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Customer Phone</label>
                  <input
                    type="tel"
                    required
                    value={editLeadData.customerPhone}
                    onChange={(e) => setEditLeadData({ ...editLeadData, customerPhone: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Budget (₹)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editLeadData.budget}
                    onChange={(e) => setEditLeadData({ ...editLeadData, budget: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Possession Timeline</label>
                  <select
                    required
                    value={editLeadData.possession}
                    onChange={(e) => setEditLeadData({ ...editLeadData, possession: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  >
                    <option value="">Select timeline...</option>
                    <option value="immediate">Immediate</option>
                    <option value="3_months">Within 3 Months</option>
                    <option value="6_months">Within 6 Months</option>
                    <option value="1_year">Within 1 Year</option>
                    <option value="1_year_plus">More than 1 Year</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-6 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditLeadData(null);
                  }}
                  className="flex-1 px-6 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/20"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {isLostModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Mark as Lost</h2>
            <p className="text-sm text-gray-500 mb-6">Please select a reason for marking {lostLeadIds.length > 1 ? 'these leads' : 'this lead'} as lost.</p>
            
            <form onSubmit={handleLostSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Reason</label>
                <select
                  required
                  value={selectedLostReason}
                  onChange={(e) => setSelectedLostReason(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="">Select Reason</option>
                  {settings.lostReasons.map(reason => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Additional Notes</label>
                <textarea
                  rows={3}
                  value={lostNotes}
                  onChange={(e) => setLostNotes(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="Any extra details about why this lead was lost..."
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setIsLostModalOpen(false);
                    setLostLeadIds([]);
                    setSelectedLostReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
                >
                  Confirm Lost
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Bulk Upload Leads</h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload a CSV or Excel file with columns: <br/>
              <code className="bg-gray-100 px-1 rounded">enquiryId, projectId, customerName, customerPhone, budget, possession, vendorNotes</code>
            </p>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-gray-900 transition-colors group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv,.xlsx,.xls" 
                onChange={handleBulkUpload}
              />
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-gray-100">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-gray-900" />
              </div>
              <p className="text-sm font-bold text-gray-900">Click to upload file</p>
              <p className="text-xs text-gray-500 mt-1">CSV, XLSX or XLS (Max 5MB)</p>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drop Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Drop a New Lead</h2>
            <form onSubmit={handleAddLead} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Enquiry ID</label>
                <input
                  type="text"
                  required
                  value={newLead.enquiryId}
                  onChange={(e) => setNewLead({ ...newLead, enquiryId: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Project</label>
                <select
                  required
                  value={newLead.projectId}
                  onChange={(e) => setNewLead({ ...newLead, projectId: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="">Select Project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {(isAdmin || isSM) && (
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Assign to Partner/Vendor</label>
                  <select
                    required
                    value={newLead.partnerId}
                    onChange={(e) => setNewLead({ ...newLead, partnerId: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                    <option value="">Select Partner/Vendor</option>
                    {partners.map(p => <option key={p.uid} value={p.uid}>{p.displayName} ({p.role})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  required
                  value={newLead.customerName}
                  onChange={(e) => setNewLead({ ...newLead, customerName: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={newLead.customerPhone}
                  onChange={(e) => setNewLead({ ...newLead, customerPhone: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Budget (₹)</label>
                <input
                  type="number"
                  required
                  value={newLead.budget}
                  onChange={(e) => setNewLead({ ...newLead, budget: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Possession</label>
                <input
                  type="text"
                  placeholder="e.g. 2025"
                  value={newLead.possession}
                  onChange={(e) => setNewLead({ ...newLead, possession: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Vendor Notes (Initial Comments)</label>
                <textarea
                  rows={3}
                  value={newLead.vendorNotes}
                  onChange={(e) => setNewLead({ ...newLead, vendorNotes: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="Any initial notes about this lead..."
                />
              </div>
              <div className="col-span-2 flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800"
                >
                  Submit Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Update Status</h2>
            <p className="text-sm text-gray-500 mb-6">Updating status to: <span className="font-bold text-gray-900 uppercase">{statusUpdate.status.replace(/_/g, ' ')}</span></p>
            
            <form onSubmit={handleStatusSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">SM Notes / Comments</label>
                <textarea
                  required
                  rows={4}
                  value={statusUpdate.notes}
                  onChange={(e) => setStatusUpdate({ ...statusUpdate, notes: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="Provide details about this status change..."
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800"
                >
                  Update Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Lead Feedback</h2>
            <div className="flex justify-between items-center mb-6">
              <p className="text-sm text-gray-500">For: {selectedLead.customerName} ({selectedLead.enquiryId})</p>
              {(() => {
                const { total, breakdown } = calculateLeadScore(selectedLead);
                return (
                  <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Lead Score</span>
                    <span className={`text-sm font-black ${
                      total > 70 ? 'text-green-600' : total > 40 ? 'text-blue-600' : 'text-orange-600'
                    }`}>{total}/100</span>
                  </div>
                );
              })()}
            </div>
            
            {/* View Toggle Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
              <button
                onClick={() => setFeedbackView('vendor')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  feedbackView === 'vendor' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Vendor View
              </button>
              <button
                onClick={() => setFeedbackView('sm')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  feedbackView === 'sm' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                SM View
              </button>
              <button
                onClick={() => setFeedbackView('tasks')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  feedbackView === 'tasks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Tasks ({tasks.length})
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto mb-6 space-y-4">
              {feedbackView === 'tasks' ? (
                <div className="space-y-6">
                  <form onSubmit={handleAddTask} className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase">Create New Task</p>
                    <input
                      required
                      type="text"
                      placeholder="Task title (e.g. Call back)"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={newTask.dueDate}
                        onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <select
                        required
                        value={newTask.assignedTo}
                        onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                      >
                        <option value="">Assign to...</option>
                        {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                        {isAdmin && <option value={profile?.uid}>Me (Admin)</option>}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-gray-800 transition-all"
                    >
                      Add Task
                    </button>
                  </form>

                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase px-1">Active Tasks</p>
                    {tasks.length > 0 ? (
                      tasks.sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1)).map((task) => (
                        <div key={task.id} className={`p-3 rounded-xl border transition-all flex items-center gap-3 ${
                          task.completed ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200 shadow-sm'
                        }`}>
                          <button
                            onClick={() => toggleTaskCompletion(task.id, task.completed)}
                            className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                              task.completed ? 'bg-green-500 text-white' : 'border-2 border-gray-300 hover:border-gray-900'
                            }`}
                          >
                            {task.completed && <Check className="w-3 h-3" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${task.completed ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {sms.find(s => s.uid === task.assignedTo)?.displayName || 'Assigned'}
                              </span>
                              {task.dueDate && (
                                <span className={`text-[10px] flex items-center gap-1 ${
                                  !task.completed && new Date(task.dueDate) < new Date() ? 'text-red-500 font-bold' : 'text-gray-400'
                                }`}>
                                  <Calendar className="w-3 h-3" />
                                  {new Date(task.dueDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <CheckSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-xs text-gray-400 font-medium">No tasks found for this lead.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : feedbackView === 'vendor' ? (
                <>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs font-bold text-blue-700 uppercase mb-1">Initial Vendor Notes</p>
                    <p className="text-sm text-gray-700">{selectedLead.vendorNotes || 'No initial notes.'}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase px-1">Partner/Vendor History</p>
                    {selectedLead.partnerFeedback?.length > 0 ? (
                      selectedLead.partnerFeedback.map((f: string, i: number) => (
                        <div key={i} className="p-2 bg-gray-50 rounded text-sm text-gray-600 border border-gray-100">{f}</div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 px-1 italic">No partner history yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-gray-500 uppercase px-1">Status History & SM Notes</p>
                    {selectedLead.statusHistory?.length > 0 ? (
                      selectedLead.statusHistory.map((h: any, i: number) => (
                        <div key={i} className="p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{h.status.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] text-gray-400">{new Date(h.updatedAt?.toDate ? h.updatedAt.toDate() : h.updatedAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-gray-700">{h.notes}</p>
                          <p className="text-[10px] text-gray-400 mt-1">By: {h.updatedBy}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 px-1 italic">No status history yet.</p>
                    )}
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs font-bold text-gray-700 uppercase mb-1">SM General Feedback</p>
                    <p className="text-sm text-gray-700">{selectedLead.smFeedback || 'No general feedback yet.'}</p>
                  </div>
                </>
              )}
            </div>

            <form onSubmit={handleAddFeedback} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  {isSM || isAdmin ? 'Update SM Feedback' : 'Add Partner Feedback'}
                </label>
                <textarea
                  required
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="Enter your update here..."
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800"
                >
                  Save Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
