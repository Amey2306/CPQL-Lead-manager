import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, UserPlus, Shield, Mail, Trash2, Upload, Edit2, Info } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { showToast } from './ErrorBoundary';

const roleDescriptions: Record<string, string> = {
  partner: "Can view and manage their own leads.",
  vendor: "Main vendor account. Can manage all leads for their company.",
  vendor_manager: "Can manage leads and users for their assigned vendor company.",
  vendor_editor: "Can edit leads for their assigned vendor company.",
  vendor_viewer: "Can view leads for their assigned vendor company.",
  sm: "Sales Manager. Can manage leads assigned to them.",
  admin: "Full system access. Can manage all users, leads, and settings."
};

export default function UserManagement() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', displayName: '', role: 'partner' as any, vendorCompanyId: '', companyName: '' });
  const [editUser, setEditUser] = useState<any>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdmin) return;

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubscribe();
  }, [isAdmin]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // In a real app, we'd use Firebase Admin SDK or a cloud function to create the auth user
      // For this demo, we'll just pre-create the profile which will be linked when they sign in
      await addDoc(collection(db, 'users'), {
        ...newUser,
        uid: 'pending_' + Math.random().toString(36).substr(2, 9),
        createdAt: serverTimestamp()
      });
      setIsModalOpen(false);
      setNewUser({ email: '', displayName: '', role: 'partner', vendorCompanyId: '', companyName: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      await updateDoc(doc(db, 'users', editUser.id), {
        displayName: editUser.displayName,
        email: editUser.email,
        role: editUser.role,
        vendorCompanyId: editUser.vendorCompanyId || '',
        companyName: editUser.companyName || ''
      });
      setEditUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editUser.id}`);
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
        complete: (results) => processBulkUsers(results.data),
        error: (error) => console.error('CSV Parse Error:', error)
      });
    } else if (extension === 'xlsx' || extension === 'xls') {
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        processBulkUsers(jsonData);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const processBulkUsers = async (data: any[]) => {
    const batch = writeBatch(db);
    const usersRef = collection(db, 'users');

    data.forEach((row) => {
      if (!row.email || !row.displayName) return;
      
      const newDocRef = doc(usersRef);
      batch.set(newDocRef, {
        email: String(row.email).toLowerCase(),
        displayName: String(row.displayName),
        role: (row.role || 'partner').toLowerCase(),
        vendorCompanyId: row.vendorCompanyId || '',
        companyName: row.companyName || '',
        uid: 'pending_' + Math.random().toString(36).substr(2, 9),
        createdAt: serverTimestamp()
      });
    });

    try {
      await batch.commit();
      setIsBulkModalOpen(false);
      showToast('Bulk user upload successful!', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users/bulk');
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const updateVendorCompany = async (userId: string, vendorCompanyId: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { vendorCompanyId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const vendors = users.filter(u => u.role === 'vendor');

  const deleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
    }
  };

  if (!isAdmin) return <div className="p-8 text-center text-gray-500">Access Denied</div>;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 md:space-y-8"
    >
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">User Management</h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">Manage partners, vendors, sales managers, and administrators.</p>
        </div>
        <div className="flex w-full md:w-auto gap-3">
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-900 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-gray-50 transition-all shadow-sm"
          >
            <Upload className="w-5 h-5" />
            <span className="hidden md:inline">Bulk Upload</span>
            <span className="md:hidden">Bulk</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-gray-900 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            <UserPlus className="w-5 h-5" />
            <span className="hidden md:inline">Add User</span>
            <span className="md:hidden">Add</span>
          </button>
        </div>
      </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 md:px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-4 md:px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 md:px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="px-4 md:px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Vendor Company</th>
                <th className="px-4 md:px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user, i) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={user.id} 
                  className="hover:bg-gray-50 transition-colors"
                >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600">
                      {user.displayName?.charAt(0)}
                    </div>
                    <span className="font-medium text-gray-900">{user.displayName}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600">{user.email}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <select
                      value={user.role}
                      onChange={(e) => updateRole(user.id, e.target.value)}
                      className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-gray-900 focus:border-gray-900 block w-full p-2"
                    >
                      <option value="partner">Partner</option>
                      <option value="vendor">Vendor (Main)</option>
                      <option value="vendor_manager">Vendor Manager</option>
                      <option value="vendor_editor">Vendor Editor</option>
                      <option value="vendor_viewer">Vendor Viewer</option>
                      <option value="sm">Sales Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <div className="relative group flex-shrink-0">
                      <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl text-center">
                        {roleDescriptions[user.role] || 'No description available.'}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {['vendor_manager', 'vendor_editor', 'vendor_viewer'].includes(user.role) ? (
                    <select
                      value={user.vendorCompanyId || ''}
                      onChange={(e) => updateVendorCompany(user.id, e.target.value)}
                      className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-gray-900 focus:border-gray-900 block w-full p-2"
                    >
                      <option value="">Select Vendor...</option>
                      {vendors.map(v => (
                        <option key={v.uid} value={v.uid}>{v.companyName || v.displayName}</option>
                      ))}
                    </select>
                  ) : user.role === 'vendor' ? (
                    <span className="text-gray-900 font-medium">{user.companyName || '-'}</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setEditUser(user)}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => deleteUser(user.id)}
                      className="text-red-600 hover:text-red-800 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Bulk Upload Modal */}
      <AnimatePresence>
        {isBulkModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Bulk Upload Users</h2>
            <p className="text-sm text-gray-500 mb-6">
              Upload a CSV or Excel file with columns: <br/>
              <code className="bg-gray-100 px-1 rounded">email, displayName, role, vendorCompanyId, companyName</code>
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

      {/* Add User Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New User</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUser.displayName}
                  onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              {newUser.role === 'vendor' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Company Name / Vendor Name</label>
                  <input
                    type="text"
                    required
                    value={newUser.companyName}
                    onChange={(e) => setNewUser({ ...newUser, companyName: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value as any })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="partner">Partner</option>
                  <option value="vendor">Vendor (Main)</option>
                  <option value="vendor_manager">Vendor Manager</option>
                  <option value="vendor_editor">Vendor Editor</option>
                  <option value="vendor_viewer">Vendor Viewer</option>
                  <option value="sm">Sales Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {['vendor_manager', 'vendor_editor', 'vendor_viewer'].includes(newUser.role) && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Vendor Company</label>
                  <select
                    required
                    value={newUser.vendorCompanyId}
                    onChange={(e) => setNewUser({ ...newUser, vendorCompanyId: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                    <option value="">Select Vendor...</option>
                    {vendors.map(v => (
                      <option key={v.uid} value={v.uid}>{v.companyName || v.displayName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-4 mt-8">
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
                  Create User
                </button>
              </div>
            </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Edit User Modal */}
      <AnimatePresence>
        {editUser && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit User</h2>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editUser.displayName}
                  onChange={(e) => setEditUser({ ...editUser, displayName: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              {editUser.role === 'vendor' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Company Name / Vendor Name</label>
                  <input
                    type="text"
                    required
                    value={editUser.companyName || ''}
                    onChange={(e) => setEditUser({ ...editUser, companyName: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Role</label>
                <select
                  value={editUser.role}
                  onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                >
                  <option value="partner">Partner</option>
                  <option value="vendor">Vendor (Main)</option>
                  <option value="vendor_manager">Vendor Manager</option>
                  <option value="vendor_editor">Vendor Editor</option>
                  <option value="vendor_viewer">Vendor Viewer</option>
                  <option value="sm">Sales Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {['vendor_manager', 'vendor_editor', 'vendor_viewer'].includes(editUser.role) && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Vendor Company</label>
                  <select
                    required
                    value={editUser.vendorCompanyId || ''}
                    onChange={(e) => setEditUser({ ...editUser, vendorCompanyId: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                    <option value="">Select Vendor...</option>
                    {vendors.map(v => (
                      <option key={v.uid} value={v.uid}>{v.companyName || v.displayName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-4 mt-8">
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800"
                >
                  Save Changes
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
