import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { Settings as SettingsIcon, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';

import { showToast } from './ErrorBoundary';

export default function Settings() {
  const { isAdmin } = useAuth();
  const [statuses, setStatuses] = useState<string[]>([]);
  const [lostReasons, setLostReasons] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [newReason, setNewReason] = useState('');

  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = onSnapshot(doc(db, 'settings', 'leads'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStatuses(data.statuses || []);
        setLostReasons(data.lostReasons || []);
      } else {
        // Initialize with defaults if not exists
        const defaults = {
          statuses: ['new', 'assigned', 'contacted', 'site_visit_proposed', 'site_visit_done', 'converted', 'lost'],
          lostReasons: ['not contacted', 'not interested', 'budget not matched', 'location not matched', 'purchased elsewhere'],
          updatedAt: serverTimestamp()
        };
        setDoc(doc(db, 'settings', 'leads'), defaults);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/leads'));

    return () => unsubscribe();
  }, [isAdmin]);

  const handleAddStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatus.trim()) return;
    try {
      await updateDoc(doc(db, 'settings', 'leads'), {
        statuses: arrayUnion(newStatus.trim().toLowerCase().replace(/\s+/g, '_')),
        updatedAt: serverTimestamp()
      });
      setNewStatus('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/leads');
    }
  };

  const handleRemoveStatus = async (status: string) => {
    if (['new', 'assigned', 'lost'].includes(status)) {
      showToast('Default statuses cannot be removed.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'settings', 'leads'), {
        statuses: arrayRemove(status),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/leads');
    }
  };

  const handleAddReason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReason.trim()) return;
    try {
      await updateDoc(doc(db, 'settings', 'leads'), {
        lostReasons: arrayUnion(newReason.trim()),
        updatedAt: serverTimestamp()
      });
      setNewReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/leads');
    }
  };

  const handleRemoveReason = async (reason: string) => {
    try {
      await updateDoc(doc(db, 'settings', 'leads'), {
        lostReasons: arrayRemove(reason),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/leads');
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-gray-500">Access Denied</div>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <SettingsIcon className="w-8 h-8" />
          System Settings
        </h1>
        <p className="text-gray-500 mt-1">Configure lead statuses and lost reasons.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Lead Statuses */}
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            Lead Statuses
          </h2>
          
          <form onSubmit={handleAddStatus} className="flex gap-2 mb-6">
            <input
              type="text"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              placeholder="Add new status..."
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
            />
            <button
              type="submit"
              className="bg-gray-900 text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-6 h-6" />
            </button>
          </form>

          <div className="space-y-2">
            {statuses.map((status) => (
              <div key={status} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group">
                <span className="font-medium text-gray-700 capitalize">{status.replace(/_/g, ' ')}</span>
                {!['new', 'assigned', 'lost'].includes(status) && (
                  <button
                    onClick={() => handleRemoveStatus(status)}
                    className="text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Lost Reasons */}
        <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600" />
            Lost Reasons
          </h2>
          
          <form onSubmit={handleAddReason} className="flex gap-2 mb-6">
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Add new reason..."
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
            />
            <button
              type="submit"
              className="bg-gray-900 text-white p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-6 h-6" />
            </button>
          </form>

          <div className="space-y-2">
            {lostReasons.map((reason) => (
              <div key={reason} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group">
                <span className="font-medium text-gray-700">{reason}</span>
                <button
                  onClick={() => handleRemoveReason(reason)}
                  className="text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


