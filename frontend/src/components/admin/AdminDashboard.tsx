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
  BarChart2,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Users,
} from 'lucide-react';

interface ReportSummary {
  total_bookings: number;
  completed: number;
  cancelled: number;
  no_shows: number;
  confirmed: number;
  checked_in: number;
  in_service: number;
  total_queue_entries: number;
  avg_wait_time: number;
  avg_service_time: number;
  daily_breakdown: { slot_date: string; count: number }[];
}

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'analytics' | 'branches' | 'services' | 'resources' | 'schedules' | 'users'>('analytics');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Reports state
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [reportBranchId, setReportBranchId] = useState<string>('');
  const [reportsLoading, setReportsLoading] = useState<boolean>(false);

  // Branch Modal state
  const [showBranchModal, setShowBranchModal] = useState<boolean>(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState<string>('');
  const [branchAddress, setBranchAddress] = useState<string>('');
  const [branchPhone, setBranchPhone] = useState<string>('');

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
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const [selectedScheduleBranchId, setSelectedScheduleBranchId] = useState<string>('');
  const [holidayDate, setHolidayDate] = useState<string>('');
  const [holidayReason, setHolidayReason] = useState<string>('');
  const [businessHours, setBusinessHoursState] = useState(
    DAYS.map((_, i) => ({ day_of_week: i, open_time: '09:00', close_time: '17:00', break_start: '', break_end: '' }))
  );
  const [hoursLoading, setHoursLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [branchesRes, servicesRes, resourcesRes] = await Promise.all([
        api.get<any>('/branches/admin').catch(() => api.get<any>('/branches')).catch(() => ({ data: [] })),
        api.get<any>('/services/admin').catch(() => api.get<any>('/services')).catch(() => ({ data: [] })),
        api.get<any>('/resources').catch(() => ({ data: [] })),
      ]);

      const bList = Array.isArray(branchesRes)
        ? branchesRes
        : (branchesRes?.data || branchesRes?.branches || []);
      const sList = Array.isArray(servicesRes)
        ? servicesRes
        : (servicesRes?.data || servicesRes?.services || []);
      const rList = Array.isArray(resourcesRes)
        ? resourcesRes
        : (resourcesRes?.data || resourcesRes?.resources || []);

      setBranches(bList);
      setServices(sList);
      setResources(rList);
      if (bList.length > 0 && !selectedScheduleBranchId) {
        setSelectedScheduleBranchId(bList[0].id);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedScheduleBranchId]);

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.get<any>('/admin/users');
      setUsers(data.data || data.items || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setReportsLoading(true);
      const query = reportBranchId ? `?branchId=${reportBranchId}` : '';
      const data = await api.get<{ summary: ReportSummary }>(`/reports/summary${query}`);
      setReportSummary(data.summary);
    } catch (err) {
      console.error('Failed to load reports summary:', err);
    } finally {
      setReportsLoading(false);
    }
  }, [reportBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      loadReports();
    } else if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab, loadReports, loadUsers]);

  useEffect(() => {
    if (!selectedScheduleBranchId) return;
    (async () => {
      try {
        const data = await api.get<any>(`/branches/${selectedScheduleBranchId}/business-hours`);
        const existing = data.data || data.business_hours || [];
        if (Array.isArray(existing) && existing.length > 0) {
          setBusinessHoursState(
            DAYS.map((_, i) => {
              const found = existing.find((h: any) => h.day_of_week === i);
              return found
                ? { day_of_week: i, open_time: found.open_time, close_time: found.close_time,
                    break_start: found.break_start || '', break_end: found.break_end || '' }
                : { day_of_week: i, open_time: '09:00', close_time: '17:00', break_start: '', break_end: '' };
            })
          );
        }
      } catch (err) {
        console.error('Failed to load business hours:', err);
      }
    })();
  }, [selectedScheduleBranchId]);

  const handleChangeUserRole = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update role');
    }
  };

  const handleSaveBusinessHours = async () => {
    if (!selectedScheduleBranchId) return;
    setHoursLoading(true);
    try {
      await api.post(`/branches/${selectedScheduleBranchId}/business-hours`, {
        hours: businessHours.map((h) => ({
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          break_start: h.break_start || null,
          break_end: h.break_end || null,
        })),
      });
      alert('Business hours saved.');
    } catch (err: any) {
      alert(err.message || 'Failed to save business hours');
    } finally {
      setHoursLoading(false);
    }
  };

  // Branch CRUD handlers
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingBranch) {
        await api.patch(`/branches/${editingBranch.id}`, {
          name: branchName,
          address: branchAddress,
          phone: branchPhone,
        });
      } else {
        await api.post('/branches', {
          name: branchName,
          address: branchAddress,
          phone: branchPhone,
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
          <h2>System Administration & Intelligence</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Live performance analytics, catalog configuration, and operational schedules
          </p>
        </div>
      </div>

      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart2 size={15} /> Analytics & Reports
        </button>
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
        <button
          className={`btn btn-sm ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={15} /> Users ({users.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading catalog...</div>
      ) : (
        <>
          {/* ANALYTICS & REPORTS TAB */}
          {activeTab === 'analytics' && (
            <div>
              {/* Filter Bar */}
              <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <MapPin size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Filter Branch:</span>
                  <select
                    className="form-select"
                    value={reportBranchId}
                    onChange={(e) => setReportBranchId(e.target.value)}
                    style={{ width: 'auto', minWidth: '180px' }}
                  >
                    <option value="">All Branches (System-wide)</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <button className="btn btn-secondary btn-sm" onClick={loadReports} disabled={reportsLoading}>
                  <RefreshCw size={14} /> Refresh Analytics
                </button>
              </div>

              {reportsLoading && !reportSummary ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  Calculating aggregates...
                </div>
              ) : reportSummary ? (
                <>
                  {/* KPI Stat Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="glass-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Bookings</span>
                        <TrendingUp size={16} color="var(--accent-primary)" />
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                        {reportSummary.total_bookings}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '0.2rem' }}>
                        Confirmed & Historical
                      </div>
                    </div>

                    <div className="glass-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Completed</span>
                        <CheckCircle2 size={16} color="var(--accent-emerald)" />
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#34d399' }}>
                        {reportSummary.completed}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Successfully Served
                      </div>
                    </div>

                    <div className="glass-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cancelled & No-Shows</span>
                        <XCircle size={16} color="var(--accent-rose)" />
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fb7185' }}>
                        {reportSummary.cancelled + reportSummary.no_shows}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {reportSummary.cancelled} Cancelled · {reportSummary.no_shows} No-show
                      </div>
                    </div>

                    <div className="glass-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Avg Wait Time</span>
                        <Clock size={16} color="var(--accent-amber)" />
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fbbf24' }}>
                        {Number(reportSummary.avg_wait_time || 0).toFixed(4)}m
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Queue to Service Counter
                      </div>
                    </div>
                  </div>

                  {/* Visual Breakdown Bar Chart */}
                  <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <BarChart2 size={18} color="var(--accent-primary)" />
                      Appointment Status Distribution
                    </h3>

                    {reportSummary.total_bookings === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-faint)' }}>
                        No appointment data available for the selected filters.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {[
                          { label: 'Completed', count: reportSummary.completed, color: 'var(--accent-emerald)' },
                          { label: 'Confirmed / Pending', count: reportSummary.confirmed + reportSummary.checked_in, color: 'var(--accent-primary)' },
                          { label: 'In Service', count: reportSummary.in_service, color: 'var(--accent-cyan)' },
                          { label: 'Cancelled', count: reportSummary.cancelled, color: 'var(--accent-rose)' },
                          { label: 'No Shows', count: reportSummary.no_shows, color: 'var(--text-faint)' },
                        ].map((stat) => {
                          const percent = Math.round((stat.count / (reportSummary.total_bookings || 1)) * 100);
                          return (
                            <div key={stat.label}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                <span>{stat.label}</span>
                                <span style={{ fontWeight: 600 }}>{stat.count} ({percent}%)</span>
                              </div>
                              <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${percent}%`, background: stat.color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}

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
                    setBranchPhone('');
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
                      <span>Phone: {b.phone || 'N/A'}</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setEditingBranch(b);
                          setBranchName(b.name);
                          setBranchAddress(b.address || '');
                          setBranchPhone(b.phone || '');
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

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', marginBottom: '1rem' }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Weekly Business Hours</h4>
                  {businessHours.map((h, idx) => (
                    <div key={h.day_of_week} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ width: '90px', fontSize: '0.85rem' }}>{DAYS[h.day_of_week]}</span>
                      <input type="time" className="form-input" value={h.open_time}
                        onChange={(e) => { const next = [...businessHours]; next[idx] = { ...next[idx], open_time: e.target.value }; setBusinessHoursState(next); }} />
                      <span>to</span>
                      <input type="time" className="form-input" value={h.close_time}
                        onChange={(e) => { const next = [...businessHours]; next[idx] = { ...next[idx], close_time: e.target.value }; setBusinessHoursState(next); }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Break (optional):</span>
                      <input type="time" className="form-input" value={h.break_start}
                        onChange={(e) => { const next = [...businessHours]; next[idx] = { ...next[idx], break_start: e.target.value }; setBusinessHoursState(next); }} />
                      <span>to</span>
                      <input type="time" className="form-input" value={h.break_end}
                        onChange={(e) => { const next = [...businessHours]; next[idx] = { ...next[idx], break_end: e.target.value }; setBusinessHoursState(next); }} />
                    </div>
                  ))}
                  <button type="button" className="btn btn-primary" onClick={handleSaveBusinessHours} disabled={hoursLoading} style={{ marginTop: '0.5rem' }}>
                    {hoursLoading ? 'Saving…' : 'Save Business Hours'}
                  </button>
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

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="glass-card">
              <h3 style={{ marginBottom: '1rem' }}>All Users</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td style={{ padding: '0.5rem' }}>{u.name}</td>
                      <td style={{ padding: '0.5rem' }}>{u.email}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <select
                          className="form-select"
                          value={u.role}
                          onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                        >
                          <option value="CUSTOMER">CUSTOMER</option>
                          <option value="STAFF">STAFF</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  required
                  className="form-input"
                  placeholder="e.g. 100 Main St, Suite 400"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. +1 555 0100"
                  value={branchPhone}
                  onChange={(e) => setBranchPhone(e.target.value)}
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
