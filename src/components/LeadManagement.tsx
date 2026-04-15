import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, where, arrayUnion, writeBatch, deleteDoc, getDocs, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { analyzeCallRecordingUrl, analyzeCallRecording } from '../services/geminiService';
import { useAuth } from '../AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Filter, MessageSquare, Edit3, CheckCircle, XCircle, Upload, FileSpreadsheet, FileText as FileIcon, Check, User, Calendar, Clock, CheckSquare, Trash2, ChevronUp, ChevronDown, RefreshCw, Link, CornerUpLeft } from 'lucide-react';
import Papa from 'papaparse';

import * as XLSX from 'xlsx';
import { showToast } from './ErrorBoundary';
export default function LeadManagement() {
  const { profile, isAdmin, isSM, isPartner, isVendor, isVendorManager, isVendorEditor } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [sms, setSMs] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
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
    partnerId: '',
    callRecordingUrl: '',
    callAnalysis: null as any
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{added: number, skipped: number} | null>(null);
  const [statusUpdate, setStatusUpdate] = useState({
    leadIds: [] as string[],
    status: '',
    notes: ''
  });
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnLeadId, setReturnLeadId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackRecordingFile, setFeedbackRecordingFile] = useState<File | null>(null);
  const [isUploadingFeedbackRecording, setIsUploadingFeedbackRecording] = useState(false);
  const [feedbackView, setFeedbackView] = useState<'vendor' | 'sm' | 'tasks'>('vendor');
  const [smViewMode, setSmViewMode] = useState<'all' | 'my'>('my');
  const [tasks, setTasks] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState({ title: '', dueDate: new Date().toISOString().split('T')[0], assignedTo: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    projectId: '',
    vendorId: '',
    smId: '',
    dateFrom: '',
    dateTo: '',
    status: '',
    scoreMin: '',
    scoreMax: '',
    taskDateFrom: '',
    taskDateTo: '',
  });
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  useEffect(() => {
    if (profile?.uid) {
      getDoc(doc(db, 'integrations', profile.uid)).then(docSnap => {
        if (docSnap.exists()) {
          setSheetUrl(docSnap.data().googleSheetUrl || '');
        }
      }).catch(error => {
        console.error("Error fetching integration settings:", error);
      });
    }
  }, [profile]);

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
    let unsubscribeAdmins: () => void = () => {};
    let unsubscribePartners: () => void = () => {};

    if (isAdmin || isPartner || isVendor || isSM) {
      unsubscribeSMs = onSnapshot(query(collection(db, 'users'), where('role', '==', 'sm')), (snapshot) => {
        setSMs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/sm'));
      
      unsubscribeAdmins = onSnapshot(query(collection(db, 'users'), where('role', '==', 'admin')), (snapshot) => {
        setAdmins(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/admin'));
    }

    if (isAdmin || isSM) {
      unsubscribePartners = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['partner', 'vendor', 'vendor_manager', 'vendor_editor', 'vendor_viewer'])), (snapshot) => {
        setPartners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users/partners'));
    }

    const unsubscribeAllTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      setAllTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'tasks'));

    return () => {
      unsubscribeSettings();
      unsubscribeLeads();
      unsubscribeProjects();
      unsubscribeSMs();
      unsubscribeAdmins();
      unsubscribePartners();
      unsubscribeAllTasks();
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
      setNewTask({ title: '', dueDate: new Date().toISOString().split('T')[0], assignedTo: '' });
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

    let finalScore = Math.min(score, 100);
    if (lead.callAnalysis?.suggestedScore) {
      finalScore = Math.round((finalScore + Number(lead.callAnalysis.suggestedScore)) / 2);
    }

    return { total: finalScore, breakdown };
  };

  const handleAnalyzeRecording = async () => {
    if (!newLead.callRecordingUrl && !recordingFile) {
      showToast('Please provide a URL or upload a file first.', 'info');
      return;
    }

    setIsAnalyzing(true);
    try {
      let analysis;
      
      if (recordingFile) {
        // Upload to storage first to get URL for the lead record
        const fileRef = ref(storage, `recordings/${Date.now()}_${recordingFile.name}`);
        await uploadBytes(fileRef, recordingFile);
        const urlToAnalyze = await getDownloadURL(fileRef);
        setNewLead(prev => ({ ...prev, callRecordingUrl: urlToAnalyze }));

        // Convert file to base64 for Gemini analysis
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(recordingFile);
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Remove data:audio/mp3;base64,
          };
          reader.onerror = error => reject(error);
        });
        
        analysis = await analyzeCallRecording(base64, recordingFile.type || 'audio/mp3');
      } else {
        analysis = await analyzeCallRecordingUrl(newLead.callRecordingUrl);
      }

      setNewLead(prev => ({ ...prev, callAnalysis: analysis }));
    } catch (error) {
      console.error('Error analyzing recording:', error);
      showToast('Failed to analyze recording. Please check the URL or file and try again.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let finalRecordingUrl = newLead.callRecordingUrl;

      // If there's a file but it wasn't analyzed yet, upload it now
      if (recordingFile && !finalRecordingUrl) {
        const fileRef = ref(storage, `recordings/${Date.now()}_${recordingFile.name}`);
        await uploadBytes(fileRef, recordingFile);
        finalRecordingUrl = await getDownloadURL(fileRef);
      }

      const selectedPartner = (isAdmin || isSM) && newLead.partnerId 
        ? partners.find(p => p.uid === newLead.partnerId) 
        : { uid: profile?.vendorCompanyId || profile?.uid, displayName: profile?.displayName };

      await addDoc(collection(db, 'leads'), {
        ...newLead,
        callRecordingUrl: finalRecordingUrl,
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
      setNewLead({ enquiryId: '', projectId: '', customerName: '', customerPhone: '', budget: 0, possession: '', status: 'new', vendorNotes: '', partnerId: '', callRecordingUrl: '', callAnalysis: null });
      setRecordingFile(null);
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
        callRecordingUrl: String(row.callRecordingUrl || ''),
        callAnalysis: null,
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
      showToast('Bulk upload successful!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads/bulk');
    }
  };

  const handleSyncSheet = async () => {
    if (!sheetUrl) return;
    setIsSyncing(true);
    setSyncResult(null);
    try {
      if (profile?.uid) {
        await setDoc(doc(db, 'integrations', profile.uid), { googleSheetUrl: sheetUrl }, { merge: true });
      }

      const response = await fetch(sheetUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const csvText = await response.text();

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const data = results.data;
          let added = 0;
          let skipped = 0;

          const leadsRef = collection(db, 'leads');
          let q;
          if (isAdmin || isSM) {
             q = query(leadsRef);
          } else {
             q = query(leadsRef, where('partnerId', '==', profile?.vendorCompanyId || profile?.uid));
          }
          const snapshot = await getDocs(q);
          const existingIds = new Set(snapshot.docs.map(d => (d.data() as any).enquiryId));

          let batch = writeBatch(db);
          let batchCount = 0;

          for (const row of data as any[]) {
            if (!row.enquiryId || !row.projectId) continue;
            if (existingIds.has(String(row.enquiryId))) {
              skipped++;
              continue;
            }

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
              callRecordingUrl: String(row.callRecordingUrl || ''),
              callAnalysis: null,
              partnerId: profile?.vendorCompanyId || profile?.uid,
              partnerName: profile?.displayName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              partnerFeedback: [],
              statusHistory: [{
                status: 'new',
                notes: 'Synced from Google Sheets',
                updatedAt: new Date(),
                updatedBy: profile?.displayName
              }]
            });
            added++;
            batchCount++;

            if (batchCount === 490) {
              await batch.commit();
              batch = writeBatch(db);
              batchCount = 0;
            }
          }
          
          if (batchCount > 0) {
            await batch.commit();
          }
          
          setSyncResult({ added, skipped });
          setIsSyncing(false);
        },
        error: (error) => {
          console.error('CSV Parse Error:', error);
          showToast('Failed to parse the Google Sheet. Please ensure it is published as a CSV.', 'error');
          setIsSyncing(false);
        }
      });
    } catch (error) {
      console.error("Sync error:", error);
      showToast("Failed to fetch the Google Sheet. Please check the URL and ensure it's published to the web as CSV.", 'error');
      setIsSyncing(false);
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

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    try {
      await deleteDoc(doc(db, 'leads', leadToDelete));
      setIsDeleteModalOpen(false);
      setLeadToDelete(null);
      showToast('Lead deleted successfully.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `leads/${leadToDelete}`);
    }
  };

  const confirmDeleteLead = (leadId: string) => {
    setLeadToDelete(leadId);
    setIsDeleteModalOpen(true);
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

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnReason || !returnLeadId) return;

    try {
      await updateDoc(doc(db, 'leads', returnLeadId), {
        smId: '',
        status: 'new',
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          status: 'returned_to_vendor',
          notes: `Returned by SM: ${returnReason}`,
          updatedAt: new Date(),
          updatedBy: profile?.displayName
        })
      });
      showToast('Lead returned to vendor successfully.', 'success');
      setIsReturnModalOpen(false);
      setReturnLeadId('');
      setReturnReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${returnLeadId}`);
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
      showToast('Bulk SM assignment successful!', 'success');
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
    if (!selectedLead || (!feedback && !feedbackRecordingFile)) return;

    try {
      let recordingUrl = '';
      if (feedbackRecordingFile) {
        setIsUploadingFeedbackRecording(true);
        const storageRef = ref(storage, `recordings/${Date.now()}_${feedbackRecordingFile.name}`);
        const snapshot = await uploadBytes(storageRef, feedbackRecordingFile);
        recordingUrl = await getDownloadURL(snapshot.ref);
        setIsUploadingFeedbackRecording(false);
      }

      const leadRef = doc(db, 'leads', selectedLead.id);
      
      const updateData: any = { updatedAt: serverTimestamp() };
      
      if (isSM || isAdmin) {
        if (feedback) updateData.smFeedback = feedback;
      } else if (isPartner || isVendor) {
        if (feedback) {
          updateData.partnerFeedback = arrayUnion(`${new Date().toLocaleString()}: ${feedback}`);
        }
      }

      if (recordingUrl) {
        updateData.additionalRecordings = arrayUnion({
          url: recordingUrl,
          addedAt: new Date().toISOString(),
          addedBy: profile?.displayName || 'Unknown'
        });
      }

      await updateDoc(leadRef, updateData);
      
      setFeedback('');
      setFeedbackRecordingFile(null);
      setSelectedLead(null);
    } catch (error) {
      setIsUploadingFeedbackRecording(false);
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredLeads = leads.filter(lead => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!lead.customerName?.toLowerCase().includes(searchLower) && 
          !lead.enquiryId?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    if (filters.projectId && lead.projectId !== filters.projectId) return false;
    if (filters.vendorId && lead.partnerId !== filters.vendorId) return false;
    if (filters.smId && lead.smId !== filters.smId) return false;
    if (filters.status && lead.status !== filters.status) return false;
    
    if (filters.dateFrom || filters.dateTo) {
      const leadDate = lead.createdAt?.toDate ? lead.createdAt.toDate() : new Date(lead.createdAt);
      if (filters.dateFrom && leadDate < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && leadDate > new Date(filters.dateTo + 'T23:59:59')) return false;
    }
    
    if (filters.scoreMin || filters.scoreMax) {
      const score = calculateLeadScore(lead).total;
      if (filters.scoreMin && score < Number(filters.scoreMin)) return false;
      if (filters.scoreMax && score > Number(filters.scoreMax)) return false;
    }
    
    if (filters.taskDateFrom || filters.taskDateTo) {
      const leadTasks = allTasks.filter(t => t.leadId === lead.id);
      const hasMatchingTask = leadTasks.some(task => {
        if (!task.dueDate) return false;
        const taskDate = new Date(task.dueDate);
        if (filters.taskDateFrom && taskDate < new Date(filters.taskDateFrom)) return false;
        if (filters.taskDateTo && taskDate > new Date(filters.taskDateTo + 'T23:59:59')) return false;
        return true;
      });
      if (!hasMatchingTask) return false;
    }
    return true;
  });

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    let valA, valB;
    switch (sortConfig.key) {
      case 'score':
        valA = calculateLeadScore(a).total;
        valB = calculateLeadScore(b).total;
        break;
      case 'date':
        valA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        valB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
        break;
      case 'status':
        valA = a.status;
        valB = b.status;
        break;
      case 'customer':
        valA = a.customerName?.toLowerCase();
        valB = b.customerName?.toLowerCase();
        break;
      default:
        valA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        valB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
    }
    
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  if (!profile) return <div className="p-8 text-center text-gray-500">Loading...</div>;

  const myLeadsCount = leads.filter(l => l.smId === profile.uid).length;
  const pendingLeadsCount = leads.filter(l => l.smId === profile.uid && l.status === 'new').length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 md:space-y-8"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Lead Management</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            {isSM ? `Manage your assigned leads and track progress.` : `Track and manage leads across all projects.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3 w-full md:w-auto">
          {isSM && (
            <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto mb-2 md:mb-0 md:mr-4">
              <button
                onClick={() => setSmViewMode('my')}
                className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  smViewMode === 'my' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                My Leads ({myLeadsCount})
              </button>
              <button
                onClick={() => setSmViewMode('all')}
                className={`flex-1 md:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                  smViewMode === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                All Leads
              </button>
            </div>
          )}
          {(isPartner || isVendor || isAdmin) && (
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <button
                onClick={() => setIsIntegrationModalOpen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-900 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-sm md:text-base"
              >
                <RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">Integrations</span>
              </button>
              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-900 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm text-sm md:text-base"
              >
                <Upload className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">Bulk Upload</span>
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-900 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl active:scale-95 text-sm md:text-base"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" />
                Drop Lead
              </button>
            </div>
          )}
        </div>
      </header>

      {isSM && smViewMode === 'my' && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6"
        >
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-4 md:p-6 rounded-2xl md:rounded-3xl text-white shadow-xl shadow-blue-200/50 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110"></div>
            <p className="text-blue-100 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">My Total Leads</p>
            <p className="text-3xl md:text-4xl font-black">{myLeadsCount}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-gray-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">New / Pending</p>
            <p className="text-3xl md:text-4xl font-black text-gray-900">{pendingLeadsCount}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-gray-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">Converted</p>
            <p className="text-3xl md:text-4xl font-black text-green-600">{leads.filter(l => l.smId === profile.uid && l.status === 'converted').length}</p>
          </div>
          <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-gray-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-1">Conversion Rate</p>
            <p className="text-3xl md:text-4xl font-black text-blue-600">
              {myLeadsCount > 0 ? ((leads.filter(l => l.smId === profile.uid && l.status === 'converted').length / myLeadsCount) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </motion.div>
      )}

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedLeadIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 100, opacity: 0, x: '-50%' }}
            className="fixed bottom-4 md:bottom-8 left-1/2 bg-gray-900 text-white px-4 md:px-6 py-3 md:py-4 rounded-2xl shadow-2xl flex flex-wrap items-center gap-4 md:gap-6 z-50 w-[90%] md:w-auto justify-center md:justify-start"
          >
            <div className="flex items-center gap-3 pr-4 md:pr-6 border-r border-gray-700">
              <div className="bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                {selectedLeadIds.length}
              </div>
              <span className="text-sm font-medium hidden sm:inline">Leads Selected</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              {(isAdmin || isSM) && (
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-gray-400 hidden sm:block" />
                  <select
                    onChange={(e) => handleBulkStatusUpdate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-xs md:text-sm rounded-lg px-2 md:px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none max-w-[120px] md:max-w-none"
                    value=""
                  >
                    <option value="" disabled>Status</option>
                    {settings.statuses.map((s: string) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              )}

              {(isAdmin || isSM || isPartner || isVendor) && (
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400 hidden sm:block" />
                  <select
                    onChange={(e) => handleBulkAssignSM(e.target.value)}
                    className="bg-gray-800 border border-gray-700 text-xs md:text-sm rounded-lg px-2 md:px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none max-w-[120px] md:max-w-none"
                    value=""
                  >
                    <option value="" disabled>Assign SM</option>
                    {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                  </select>
                </div>
              )}

              <button
                onClick={() => setSelectedLeadIds([])}
                className="text-xs md:text-sm text-gray-400 hover:text-white transition-colors ml-1 md:ml-2"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters & Search */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white p-2 md:p-3 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/50"
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search leads by name or ID"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-12 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-gray-900 focus:bg-white outline-none transition-all text-sm md:text-base"
            />
          </div>
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl border transition-all font-medium text-sm md:text-base ${
              isFilterOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        <AnimatePresence>
          {isFilterOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 mt-2 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Project</label>
              <select
                value={filters.projectId}
                onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            
            {(isAdmin || isSM) && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vendor/Partner</label>
                <select
                  value={filters.vendorId}
                  onChange={(e) => setFilters({ ...filters, vendorId: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">All Vendors</option>
                  {partners.map(p => <option key={p.uid} value={p.uid}>{p.companyName || p.displayName}</option>)}
                </select>
              </div>
            )}

            {(isAdmin || isVendor || isPartner) && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sales Manager</label>
                <select
                  value={filters.smId}
                  onChange={(e) => setFilters({ ...filters, smId: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">All SMs</option>
                  {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="">All Statuses</option>
                {settings.statuses.map((s: string) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Lead Date Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Score Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.scoreMin}
                  onChange={(e) => setFilters({ ...filters, scoreMin: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.scoreMax}
                  onChange={(e) => setFilters({ ...filters, scoreMax: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Task Followup Date</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.taskDateFrom}
                  onChange={(e) => setFilters({ ...filters, taskDateFrom: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="date"
                  value={filters.taskDateTo}
                  onChange={(e) => setFilters({ ...filters, taskDateTo: e.target.value })}
                  className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={() => setFilters({
                  search: '', projectId: '', vendorId: '', smId: '', dateFrom: '', dateTo: '', status: '', scoreMin: '', scoreMax: '', taskDateFrom: '', taskDateTo: ''
                })}
                className="w-full px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-200 transition-all"
              >
                Clear Filters
              </button>
            </div>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </motion.div>

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
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('date')}>
                  <div className="flex items-center gap-1">
                    Enquiry ID
                    {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('customer')}>
                  <div className="flex items-center gap-1">
                    Customer
                    {sortConfig.key === 'customer' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Project</th>
                {(isAdmin || isSM) && <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Partner/Vendor</th>}
                {isSM && <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Vendor Notes</th>}
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('score')}>
                  <div className="flex items-center gap-1">
                    Score
                    {sortConfig.key === 'score' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">
                    Status
                    {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Assigned SM</th>
                <th className="px-8 py-5 text-[11px] font-black text-gray-500 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedLeads.map((lead) => (
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
                      {(() => {
                        const partner = partners.find(p => p.uid === lead.partnerId);
                        return (
                          <p className="text-sm font-bold text-gray-900">{partner?.companyName || partner?.displayName || lead.partnerName || 'Direct'}</p>
                        );
                      })()}
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
                        <div className="flex items-center gap-3">
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
                          {lead.callAnalysis?.priority && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              lead.callAnalysis.priority === 'High' ? 'bg-red-100 text-red-700' :
                              lead.callAnalysis.priority === 'Medium' ? 'bg-orange-100 text-orange-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {lead.callAnalysis.priority}
                            </span>
                          )}
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
                      {(isSM || isAdmin) && lead.smId && (
                        <button 
                          onClick={() => {
                            setReturnLeadId(lead.id);
                            setIsReturnModalOpen(true);
                          }}
                          className="p-2 bg-gray-50 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all"
                          title="Return to Vendor"
                        >
                          <CornerUpLeft className="w-5 h-5" />
                        </button>
                      )}
                      {(isAdmin || isVendorManager) && (
                        <button 
                          onClick={() => confirmDeleteLead(lead.id)}
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
      <AnimatePresence>
        {isEditModalOpen && editLeadData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-2xl w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lost Reason Modal */}
      <AnimatePresence>
        {isLostModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Return to Vendor Modal */}
      <AnimatePresence>
        {isReturnModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Return Lead to Vendor</h2>
            <p className="text-sm text-gray-500 mb-6">Please provide a reason for returning this lead. It will be unassigned from you and its status reset to 'New'.</p>
            
            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Reason for Return</label>
                <textarea
                  required
                  rows={4}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="e.g. Unable to connect after 5 attempts, invalid number..."
                />
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700"
                >
                  Return Lead
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Delete Lead?</h2>
                <p className="text-sm text-gray-500 mb-8">
                  Are you sure you want to delete this lead? This action cannot be undone.
                </p>
                <div className="flex gap-4 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setLeadToDelete(null);
                    }}
                    className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteLead}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                  >
                    Delete Lead
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Integrations Modal */}
      <AnimatePresence>
        {isIntegrationModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl"
            >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Live Integrations</h2>
              <button onClick={() => setIsIntegrationModalOpen(false)} className="text-gray-400 hover:text-gray-900">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Google Sheets Sync</h3>
                    <p className="text-xs text-gray-500">Automatically pull leads from a published Google Sheet.</p>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600 mb-4 space-y-2">
                  <p className="font-bold text-gray-900 text-xs uppercase">How to set up:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-xs">
                    <li>Open your Google Sheet containing leads.</li>
                    <li>Go to <strong>File &gt; Share &gt; Publish to web</strong>.</li>
                    <li>Select the specific sheet and choose <strong>Comma-separated values (.csv)</strong>.</li>
                    <li>Click <strong>Publish</strong> and paste the link below.</li>
                  </ol>
                  <p className="text-[10px] text-gray-500 mt-2">
                    * Required columns: <code className="bg-gray-200 px-1 rounded">enquiryId</code>, <code className="bg-gray-200 px-1 rounded">projectId</code>. Optional: <code className="bg-gray-200 px-1 rounded">customerName</code>, <code className="bg-gray-200 px-1 rounded">customerPhone</code>, <code className="bg-gray-200 px-1 rounded">budget</code>, <code className="bg-gray-200 px-1 rounded">possession</code>, <code className="bg-gray-200 px-1 rounded">vendorNotes</code>, <code className="bg-gray-200 px-1 rounded">callRecordingUrl</code>.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Link className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                      type="url"
                      placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
                    />
                  </div>
                  
                  <button
                    onClick={handleSyncSheet}
                    disabled={isSyncing || !sheetUrl}
                    className="w-full py-2 bg-green-600 text-white font-bold rounded-lg text-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Sync Now
                      </>
                    )}
                  </button>
                </div>

                {syncResult && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-green-900">Sync Complete!</p>
                      <p className="text-xs text-green-700 mt-1">
                        Added {syncResult.added} new leads. Skipped {syncResult.skipped} existing leads.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 opacity-75">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Zapier / Webhook API</h3>
                    <p className="text-xs text-gray-500">Push leads directly from other CRMs.</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  To push leads programmatically, you can use the Firebase Admin SDK or set up a Cloud Function. For now, use the Google Sheets sync above for a no-code live integration.
                </p>
              </div>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bulk Upload Modal */}
      <AnimatePresence>
        {isBulkModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-8 shadow-2xl"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Bulk Upload Leads</h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload a CSV or Excel file with columns: <br/>
              <code className="bg-gray-100 px-1 rounded">enquiryId, projectId, customerName, customerPhone, budget, possession, vendorNotes, callRecordingUrl</code>
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Drop Lead Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
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
              <div className="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-sm font-bold text-gray-900 mb-2">Call Recording (Optional)</label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Upload File (MP3/WAV)</label>
                    <input
                      type="file"
                      accept="audio/mp3,audio/wav"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          setRecordingFile(e.target.files[0]);
                          setNewLead({ ...newLead, callRecordingUrl: '' });
                        }
                      }}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-800"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-px bg-gray-200 flex-1"></div>
                    <span className="text-xs text-gray-400 font-bold uppercase">OR</span>
                    <div className="h-px bg-gray-200 flex-1"></div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cloud URL</label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={newLead.callRecordingUrl}
                      onChange={(e) => {
                        setNewLead({ ...newLead, callRecordingUrl: e.target.value });
                        setRecordingFile(null);
                      }}
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none text-sm"
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleAnalyzeRecording}
                      disabled={isAnalyzing || (!newLead.callRecordingUrl && !recordingFile)}
                      className="w-full py-2 bg-blue-50 text-blue-600 font-bold rounded-lg text-sm hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isAnalyzing ? (
                        <>
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          Analyzing Recording...
                        </>
                      ) : (
                        'Analyze Recording'
                      )}
                    </button>
                  </div>
                  
                  {newLead.callAnalysis && (
                    <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                      <h4 className="text-sm font-bold text-gray-900 mb-2">Analysis Results</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-bold text-gray-700">Priority:</span> <span className={`font-bold ${newLead.callAnalysis.priority === 'High' ? 'text-red-600' : newLead.callAnalysis.priority === 'Medium' ? 'text-orange-500' : 'text-blue-500'}`}>{newLead.callAnalysis.priority}</span></p>
                        <p><span className="font-bold text-gray-700">Suggested Score:</span> {newLead.callAnalysis.suggestedScore}</p>
                        <p><span className="font-bold text-gray-700">Summary:</span> {newLead.callAnalysis.summary}</p>
                        {newLead.callAnalysis.keyTakeaways && (
                          <p><span className="font-bold text-gray-700">Takeaways:</span> {newLead.callAnalysis.keyTakeaways}</p>
                        )}
                        <div>
                          <span className="font-bold text-gray-700">Pain Points:</span>
                          <ul className="list-disc pl-5 mt-1 text-gray-600">
                            {newLead.callAnalysis.painPoints?.map((pt: string, i: number) => <li key={i}>{pt}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Status Update Modal */}
      <AnimatePresence>
        {isStatusModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl"
            >
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {selectedLead && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-2xl w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
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
              {selectedLead.callRecordingUrl && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Initial Call Recording</h4>
                  <audio controls src={selectedLead.callRecordingUrl} className="w-full h-8 mb-3" />
                  {selectedLead.callAnalysis && (
                    <div className="text-sm space-y-2 mt-3 pt-3 border-t border-blue-200">
                      <p><span className="font-bold text-gray-700">Priority:</span> <span className={`font-bold ${selectedLead.callAnalysis.priority === 'High' ? 'text-red-600' : selectedLead.callAnalysis.priority === 'Medium' ? 'text-orange-500' : 'text-blue-500'}`}>{selectedLead.callAnalysis.priority}</span></p>
                      <p><span className="font-bold text-gray-700">Suggested Score:</span> {selectedLead.callAnalysis.suggestedScore}</p>
                      <p><span className="font-bold text-gray-700">Summary:</span> {selectedLead.callAnalysis.summary}</p>
                      {selectedLead.callAnalysis.keyTakeaways && (
                        <p><span className="font-bold text-gray-700">Takeaways:</span> {selectedLead.callAnalysis.keyTakeaways}</p>
                      )}
                      <div>
                        <span className="font-bold text-gray-700">Pain Points:</span>
                        <ul className="list-disc pl-5 mt-1 text-gray-600">
                          {selectedLead.callAnalysis.painPoints?.map((pt: string, i: number) => <li key={i}>{pt}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedLead.additionalRecordings?.length > 0 && (
                <div className="space-y-3 mb-4">
                  <h4 className="text-sm font-bold text-gray-900">Additional Call Recordings</h4>
                  {selectedLead.additionalRecordings.map((rec: any, i: number) => (
                    <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-gray-500">Attempt {i + 2}</span>
                        <span className="text-[10px] text-gray-400">{new Date(rec.addedAt).toLocaleString()}</span>
                      </div>
                      <audio controls src={rec.url} className="w-full h-8" />
                      <p className="text-[10px] text-gray-400 mt-2 text-right">Added by: {rec.addedBy}</p>
                    </div>
                  ))}
                </div>
              )}

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
                        required
                        min={new Date().toISOString().split('T')[0]}
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
                        <optgroup label="Sales Managers">
                          {sms.map(sm => <option key={sm.uid} value={sm.uid}>{sm.displayName}</option>)}
                        </optgroup>
                        <optgroup label="Admins">
                          {admins.map(admin => <option key={admin.uid} value={admin.uid}>{admin.displayName} (Admin)</option>)}
                        </optgroup>
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
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none resize-none"
                  placeholder="Enter your update here..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Add Call Recording (Optional)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setFeedbackRecordingFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="feedback-recording-upload"
                  />
                  <label
                    htmlFor="feedback-recording-upload"
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 transition-all text-sm font-bold"
                  >
                    <Upload className="w-4 h-4" />
                    {feedbackRecordingFile ? 'Change File' : 'Upload Audio'}
                  </label>
                  {feedbackRecordingFile && (
                    <span className="text-xs text-gray-500 truncate max-w-[200px]">
                      {feedbackRecordingFile.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLead(null);
                    setFeedbackRecordingFile(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isUploadingFeedbackRecording || (!feedback && !feedbackRecordingFile)}
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploadingFeedbackRecording && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {isUploadingFeedbackRecording ? 'Saving...' : 'Save Update'}
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
