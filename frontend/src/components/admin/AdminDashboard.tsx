import React, { useState, useEffect, useCallback } from 'react';
import type { Branch, Service, Resource } from '../../types';
import { api } from '../../api/client';
import {
  MapPin,
  Sparkles,
  Cpu,
  Calendar,
  Plus,
  Edit2,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'branches' | 'services' | 'resources' | 'schedules'>('branches');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Branch Modal state
  const [showBranchModal, setShowBranchModal] = useState<boolean>(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState<string>('');
  const [branchAddress, setBranchAddress] = useState<string>('');
  const [branchTimezone, setBranchTimezone] = useState<string>('UTC');

  // Service Modal state
  const [showServiceModal, setShowServiceModal] = useState<boolean>(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceName, setServiceName] = useState<string>('');
  const [serviceDesc, setServiceDesc] = useState<string>('');
  const [serviceDuration, setServiceDuration] = useState<number>(30);
  const [serviceBuffer, setServiceBuffer] = useState<number>(5);
  const [serviceCapacity, setServiceCapacity] = useState<number>(1);
  const [servicePrice, setServicePrice] = useState<number>(50);

  // Resource Modal state
  const [showResourceModal, setShowResourceModal] = useState<boolean>(false);
  const [resourceName, setResourceName] = useState<string>('');
  const [resourceType, setResourceType] = useState<string>('STAFF');
  const [resourceBranchId, setResourceBranchId] = useState<string>('');

  // Schedules state
  const [selectedScheduleBranchId, setSelectedScheduleBranchId] = useState<string>('');
  const [holidayDate, setHolidayDate] = useState<string>('');
  const [holidayReason, setHolidayReason] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [branchesData, servicesData, resourcesData] = await Promise.all([
        api.get<{ branches: Branch[] }>('/branches'),
        api.get<{ services: Service[] }>('/services'),
        api.get<{ resources: Resource[] }>('/resources'),
      ]);

      const bList = branchesData.branches || [];
      setBranches(bList);
      setServices(servicesData.services || []);
      setResources(resourcesData.resources || []);
      if (bList.length > 0 && !selectedScheduleBranchId) {
        setSelectedScheduleBranchId(bList[0].id);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedScheduleBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Branch CRUD handlers
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await api.patch(`/branches/${editingBranch.id}`, {
          name: branchName,
          address: branchAddress,
          timezone: branchTimezone,
        });
      } else {
        await api.post('/branches', {
          name: branchName,
          address: branchAddress,
          timezone: branchTimezone,
        });
      }
      setShowBranchModal(false);
      setEditingBranch(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save branch');
    }
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    try {
      await api.patch(`/branches/${branch.id}`, {
        is_active: !branch.is_active,
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update branch status');
    }
  };

  // Service CRUD handlers
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingService) {
        await api.patch(`/services/${editingService.id}`, {
          name: serviceName,
          description: serviceDesc,
          duration_minutes: Number(serviceDuration),
          buffer_time_minutes: Number(serviceBuffer),
          capacity: Number(serviceCapacity),
          price: Number(servicePrice),
        });
      } else {
        await api.post('/services', {
          name: serviceName,
          description: serviceDesc,
          duration_minutes: Number(serviceDuration),
          buffer_time_minutes: Number(serviceBuffer),
          capacity: Number(serviceCapacity),
          price: Number(servicePrice),
        });
      }
      setShowServiceModal(false);
      setEditingService(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save service');
    }
  };

  const handleToggleServiceStatus = async (service: Service) => {
    try {
      await api.patch(`/services/${service.id}`, {
        is_active: !service.is_active,
      });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update service status');
    }
  };

  // Resource CRUD handlers
  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/resources', {
        branch_id: resourceBranchId || branches[0]?.id,
        name: resourceName,
        type: resourceType,
      });
      setShowResourceModal(false);
      setResourceName('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save resource');
    }
  };

  // Add Holiday
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedScheduleBranchId || !holidayDate) return;
    try {
      await api.post(`/branches/${selectedScheduleBranchId}/holidays`, {
        holiday_date: holidayDate,
        reason: holidayReason || 'Branch Holiday',
      });
      setHolidayDate('');
      setHolidayReason('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to add holiday');
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2>System Catalog & Configuration</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage branches, services, resource allocations, and operating schedules
          </p>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <button
          className={`btn btn-sm ${activeTab === 'branches' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('branches')}
        >
          <MapPin size={15} /> Branches ({branches.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'services' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('services')}
        >
          <Sparkles size={15} /> Services ({services.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'resources' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('resources')}
        >
          <Cpu size={15} /> Resources ({resources.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'schedules' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('schedules')}
        >
          <Calendar size={15} /> Schedules & Holidays
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading catalog...</div>
      ) : (
        <>
          {/* BRANCHES TAB */}
          {activeTab === 'branches' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setEditingBranch(null);
                    setBranchName('');
                    setBranchAddress('');
                    setBranchTimezone('UTC');
                    setShowBranchModal(true);
                  }}
                >
                  <Plus size={15} /> Add Branch
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {branches.map((b) => (
                  <div key={b.id} className="glass-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.15rem' }}>{b.name}</h3>
                      <button
                        className={`badge ${b.is_active ? 'badge-completed' : 'badge-cancelled'}`}
                        onClick={() => handleToggleBranchStatus(b)}
                        style={{ cursor: 'pointer', border: 'none' }}
                      >
                        {b.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {b.address || 'No address set'}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-faint)' }}>
                      <span>TZ: {b.timezone}</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingBranch(b);
                          setBranchName(b.name);
                          setBranchAddress(b.address || '');
                          setBranchTimezone(b.timezone);
                          setShowBranchModal(true);
                        }}
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SERVICES TAB */}
          {activeTab === 'services' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setEditingService(null);
                    setServiceName('');
                    setServiceDesc('');
                    setServiceDuration(30);
                    setServiceBuffer(5);
                    setServiceCapacity(1);
                    setServicePrice(50);
                    setShowServiceModal(true);
                  }}
                >
                  <Plus size={15} /> Add Service
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                {services.map((s) => (
                  <div key={s.id} className="glass-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.15rem' }}>{s.name}</h3>
                      <button
                        className={`badge ${s.is_active ? 'badge-completed' : 'badge-cancelled'}`}
                        onClick={() => handleToggleServiceStatus(s)}
                        style={{ cursor: 'pointer', border: 'none' }}
                      >
                        {s.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      {s.description || 'Standard service'}
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                      <div>Duration: <strong>{s.duration_minutes}m</strong></div>
                      <div>Buffer: <strong>{s.buffer_time_minutes}m</strong></div>
                      <div>Capacity: <strong>{s.capacity}</strong></div>
                      <div>Price: <strong>${s.price || 0}</strong></div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingService(s);
                          setServiceName(s.name);
                          setServiceDesc(s.description || '');
                          setServiceDuration(s.duration_minutes);
                          setServiceBuffer(s.buffer_time_minutes);
                          setServiceCapacity(s.capacity);
                          setServicePrice(s.price || 0);
                          setShowServiceModal(true);
                        }}
                      >
                        <Edit2 size={13} /> Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RESOURCES TAB */}
          {activeTab === 'resources' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setResourceName('');
                    setResourceType('STAFF');
                    setShowResourceModal(true);
                  }}
                >
                  <Plus size={15} /> Add Resource
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                {resources.map((r) => (
                  <div key={r.id} className="glass-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.1rem' }}>{r.name}</h3>
                      <span className="badge badge-confirmed">{r.type}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Branch: {r.branch?.name || r.branch_id}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCHEDULES & HOLIDAYS TAB */}
          {activeTab === 'schedules' && (
            <div>
              <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Select Branch:</label>
                  <select
                    className="form-select"
                    value={selectedScheduleBranchId}
                    onChange={(e) => setSelectedScheduleBranchId(e.target.value)}
                    style={{ width: 'auto', minWidth: '200px' }}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Declare Branch Holiday</h4>
                  <form onSubmit={handleAddHoliday} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 180px' }}>
                      <label className="form-label">Date</label>
                      <input
                        type="date"
                        required
                        className="form-input"
                        value={holidayDate}
                        onChange={(e) => setHolidayDate(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: '2 1 250px' }}>
                      <label className="form-label">Reason</label>
                      <input
                        type="text"
                        required
                        className="form-input"
                        placeholder="e.g. National Holiday / Maintenance"
                        value={holidayReason}
                        onChange={(e) => setHolidayReason(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ padding: '0.7rem 1.25rem' }}>
                      Add Holiday
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* BRANCH MODAL */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={() => setShowBranchModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>
              {editingBranch ? 'Edit Branch' : 'Add New Branch'}
            </h3>
            <form onSubmit={handleSaveBranch}>
              <div className="form-group">
                <label className="form-label">Branch Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Downtown Medical Center"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Address</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 100 Main St, Suite 400"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Timezone</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="UTC"
                  value={branchTimezone}
                  onChange={(e) => setBranchTimezone(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBranchModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SERVICE MODAL */}
      {showServiceModal && (
        <div className="modal-overlay" onClick={() => setShowServiceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>
              {editingService ? 'Edit Service' : 'Add New Service'}
            </h3>
            <form onSubmit={handleSaveService}>
              <div className="form-group">
                <label className="form-label">Service Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. General Consultation"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Service details..."
                  value={serviceDesc}
                  onChange={(e) => setServiceDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Duration (minutes)</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    value={serviceDuration}
                    onChange={(e) => setServiceDuration(Number(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Buffer Time (minutes)</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    value={serviceBuffer}
                    onChange={(e) => setServiceBuffer(Number(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Capacity Per Slot</label>
                  <input
                    type="number"
                    required
                    className="form-input"
                    value={serviceCapacity}
                    onChange={(e) => setServiceCapacity(Number(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Price ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowServiceModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESOURCE MODAL */}
      {showResourceModal && (
        <div className="modal-overlay" onClick={() => setShowResourceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Add New Resource</h3>
            <form onSubmit={handleSaveResource}>
              <div className="form-group">
                <label className="form-label">Resource Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Dr. Emily Thorne / Consultation Room 3"
                  value={resourceName}
                  onChange={(e) => setResourceName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                >
                  <option value="STAFF">Staff (Doctor/Consultant)</option>
                  <option value="ROOM">Room / Office</option>
                  <option value="EQUIPMENT">Equipment / Device</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Branch</label>
                <select
                  className="form-select"
                  value={resourceBranchId}
                  onChange={(e) => setResourceBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowResourceModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
