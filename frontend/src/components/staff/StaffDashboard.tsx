import React, { useState, useEffect, useCallback } from 'react';
import type { Branch, Service, QueueEntry, Appointment } from '../../types';
import { api } from '../../api/client';
import { useSocket } from '../../context/SocketContext';
import {
  Users,
  UserPlus,
  Play,
  CheckCircle,
  PhoneCall,
  Volume2,
  Clock,
  MapPin,
  RefreshCw,
  Info,
  Trash2,
  AlertCircle,
  X,
} from 'lucide-react';

const PRIORITY_LABELS: Record<string, string> = {
  NORMAL: 'Routine',
  PRIORITY: 'Senior / Expecting Mother',
  EMERGENCY: 'Emergency',
};

export const StaffDashboard: React.FC = () => {
  const { socket, joinBranch } = useSocket();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [callingNext, setCallingNext] = useState<boolean>(false);
  const [activeTicket, setActiveTicket] = useState<QueueEntry | null>(null);

  // Removal Confirmation & Informational Card states
  const [ticketToRemove, setTicketToRemove] = useState<QueueEntry | null>(null);
  const [removingTicket, setRemovingTicket] = useState<boolean>(false);
  const [removedTicketInfo, setRemovedTicketInfo] = useState<{
    id: string;
    queueNumber: number;
    customerName: string;
    serviceName?: string;
    priority?: string;
    timestamp: Date;
  } | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  // Walk-in modal state
  const [showWalkInModal, setShowWalkInModal] = useState<boolean>(false);
  const [walkInName, setWalkInName] = useState<string>('');
  const [walkInPhone, setWalkInPhone] = useState<string>('');
  const [walkInServiceId, setWalkInServiceId] = useState<string>('');
  const [walkInPriority, setWalkInPriority] = useState<'NORMAL' | 'PRIORITY' | 'EMERGENCY'>('NORMAL');
  const [walkInSubmitting, setWalkInSubmitting] = useState<boolean>(false);
  const [walkInError, setWalkInError] = useState<string | null>(null);

  // Auto dismiss removed ticket informational card after 10s
  useEffect(() => {
    if (removedTicketInfo) {
      const timer = setTimeout(() => {
        setRemovedTicketInfo(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [removedTicketInfo]);

  // Auto dismiss feedback banner after 6s
  useEffect(() => {
    if (feedbackMessage) {
      const timer = setTimeout(() => {
        setFeedbackMessage(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [feedbackMessage]);

  // Load catalog on mount
  useEffect(() => {
    async function loadCatalog() {
      try {
        const [branchesData, servicesData] = await Promise.all([
          api.get<{ branches: Branch[] }>('/branches'),
          api.get<{ services: Service[] }>('/services'),
        ]);
        const activeBranches = branchesData.branches || [];
        setBranches(activeBranches);
        setServices(servicesData.services || []);
        if (activeBranches.length > 0 && !selectedBranchId) {
          setSelectedBranchId(activeBranches[0].id);
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
      }
    }
    loadCatalog();
  }, []);

  // Fetch branch queue and appointments
  const fetchBranchData = useCallback(async () => {
    if (!selectedBranchId) return;
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const [queueData, apptsData] = await Promise.all([
        api.get<{ queue: QueueEntry[] }>(`/queue/branch/${selectedBranchId}`).catch(() => ({ queue: [] })),
        api.get<{ appointments: Appointment[] }>(`/appointments?branchId=${selectedBranchId}&date=${today}`).catch(() => ({ appointments: [] })),
      ]);

      setQueueEntries(queueData.queue || []);
      setAppointments(apptsData.appointments || []);

      // Check if any ticket is currently CALLED or IN_PROGRESS
      const active = (queueData.queue || []).find((q: QueueEntry) => q.status === 'CALLED' || q.status === 'IN_PROGRESS');
      if (active) setActiveTicket(active);
    } catch (err) {
      console.error('Failed to fetch branch data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (selectedBranchId) {
      joinBranch(selectedBranchId);
      fetchBranchData();
    }
  }, [selectedBranchId, joinBranch, fetchBranchData]);

  // Socket.IO real-time listener for live queue updates
  useEffect(() => {
    if (!socket) return;

    const handleQueueUpdate = (data: any) => {
      if (!data.branchId || data.branchId === selectedBranchId) {
        fetchBranchData();
      }
    };

    socket.on('queue:updated', handleQueueUpdate);

    return () => {
      socket.off('queue:updated', handleQueueUpdate);
    };
  }, [socket, selectedBranchId, fetchBranchData]);

  // Handle Call Next Patient
  const handleCallNext = async () => {
    if (!selectedBranchId) return;
    try {
      setCallingNext(true);
      const data = await api.post<{ queueEntry: QueueEntry }>(`/queue/${selectedBranchId}/call-next`);
      if (data.queueEntry) {
        setActiveTicket(data.queueEntry);
        await fetchBranchData();
      } else {
        setFeedbackMessage({ type: 'info', text: 'No waiting patients in the queue.' });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'info', text: err.message || 'No waiting patients in the queue.' });
    } finally {
      setCallingNext(false);
    }
  };

  // Handle Update Queue Ticket Status
  const handleUpdateQueueStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/queue/${id}/status`, { status });
      if (activeTicket?.id === id && (status === 'COMPLETED' || status === 'CANCELLED' || status === 'SKIPPED')) {
        setActiveTicket(null);
      }
      await fetchBranchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to update ticket status' });
    }
  };

  // Handle Confirm Remove Queue Ticket
  const handleConfirmRemoveTicket = async () => {
    if (!ticketToRemove) return;
    setRemovingTicket(true);
    try {
      await api.patch(`/queue/${ticketToRemove.id}/status`, { status: 'CANCELLED' });
      if (activeTicket?.id === ticketToRemove.id) {
        setActiveTicket(null);
      }
      const info = {
        id: ticketToRemove.id,
        queueNumber: ticketToRemove.queue_number,
        customerName: ticketToRemove.customer_name,
        serviceName: ticketToRemove.service?.name,
        priority: ticketToRemove.priority,
        timestamp: new Date()
      };
      setTicketToRemove(null);
      setRemovedTicketInfo(info);
      await fetchBranchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to remove ticket from queue' });
    } finally {
      setRemovingTicket(false);
    }
  };

  // Handle Update Appointment Status
  const handleUpdateApptStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/appointments/${id}/status`, { status });
      await fetchBranchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to update appointment status' });
    }
  };

  // Handle Create Walk-In Ticket
  const handleCreateWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalkInError(null);
    setWalkInSubmitting(true);
    try {
      await api.post('/queue/walk-in', {
        branch_id: selectedBranchId,
        service_id: walkInServiceId || undefined,
        customer_name: walkInName,
        phone: walkInPhone || undefined,
        priority: walkInPriority,
      });
      setShowWalkInModal(false);
      setWalkInName('');
      setWalkInPhone('');
      await fetchBranchData();
    } catch (err: any) {
      setWalkInError(err.message || 'Failed to create walk-in ticket');
    } finally {
      setWalkInSubmitting(false);
    }
  };

  const waitingTickets = queueEntries.filter((q) => q.status === 'WAITING');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Top Header & Branch Switcher */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2>Staff Operations Dashboard</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Real-time queue dispatch and appointment lifecycle management
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <MapPin size={16} color="var(--accent-primary)" />
            <select
              className="form-select"
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{ width: 'auto', minWidth: '180px' }}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <button className="btn btn-secondary btn-sm" onClick={fetchBranchData} title="Refresh Data">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className="glass-card"
          style={{
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            borderRadius: '10px',
            border: `1px solid ${feedbackMessage.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)'}`,
            background: feedbackMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem' }}>
            {feedbackMessage.type === 'error' ? (
              <AlertCircle size={18} color="#f87171" />
            ) : (
              <Info size={18} color="#818cf8" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Main Action Bar: Call Next & Add Walk-in */}
      <div className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(6, 182, 212, 0.12))' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-cyan)', fontWeight: 700 }}>
              Live Counter Dispatch
            </span>
            <span className="badge badge-confirmed" style={{ fontSize: '0.7rem' }}>
              {waitingTickets.length} Waiting
            </span>
          </div>
          <h3 style={{ fontSize: '1.35rem' }}>
            {activeTicket
              ? `Currently Serving Token #${activeTicket.queue_number}`
              : 'Counter Available'}
          </h3>
          {activeTicket && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Patient: <strong>{activeTicket.customer_name}</strong> · Priority: <strong>{PRIORITY_LABELS[activeTicket.priority] || activeTicket.priority}</strong>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowWalkInModal(true)}
            style={{ padding: '0.75rem 1.25rem' }}
          >
            <UserPlus size={18} /> New Walk-In Patient
          </button>

          {activeTicket ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {activeTicket.status === 'CALLED' && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateQueueStatus(activeTicket.id, 'IN_PROGRESS')}
                  style={{ background: 'var(--accent-cyan)' }}
                >
                  <Play size={16} /> Start Service
                </button>
              )}
              <button
                className="btn btn-success"
                onClick={() => handleUpdateQueueStatus(activeTicket.id, 'COMPLETED')}
              >
                <CheckCircle size={16} /> Complete Ticket
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleUpdateQueueStatus(activeTicket.id, 'SKIPPED')}
              >
                Skip / No-Show
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setTicketToRemove(activeTicket)}
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleCallNext}
              disabled={callingNext || waitingTickets.length === 0}
              style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', fontWeight: 700 }}
            >
              <Volume2 size={18} />
              {callingNext ? 'Calling Next...' : 'Call Next Patient'}
            </button>
          )}
        </div>
      </div>

      {/* Grid Layout: Live Queue Board & Today's Appointments */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        {/* LIVE QUEUE COLUMN */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} color="var(--accent-primary)" /> Live Queue Tickets
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {queueEntries.length} Total
            </span>
          </div>

          {/* Removed Ticket Informational Card */}
          {removedTicketInfo && (
            <div
              className="glass-card"
              style={{
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(15, 23, 42, 0.65))',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                animation: 'fadeIn 0.25s ease-out'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f87171',
                  flexShrink: 0
                }}>
                  <Info size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                    Token #{removedTicketInfo.queueNumber} Removed from Live Queue
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Patient: <strong>{removedTicketInfo.customerName}</strong>
                    {removedTicketInfo.serviceName ? ` · Department: ${removedTicketInfo.serviceName}` : ''}
                    {removedTicketInfo.priority ? ` · Priority: ${PRIORITY_LABELS[removedTicketInfo.priority] || removedTicketInfo.priority}` : ''}
                    {' · '}
                    <span style={{ color: 'var(--text-faint)' }}>
                      {removedTicketInfo.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setRemovedTicketInfo(null)}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading queue...</div>
          ) : queueEntries.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <p style={{ color: 'var(--text-faint)' }}>Queue is empty for today.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {queueEntries.map((ticket) => (
                <div
                  key={ticket.id}
                  className="glass-card"
                  style={{
                    padding: '1rem',
                    borderLeft: `4px solid ${
                      ticket.priority === 'EMERGENCY'
                        ? 'var(--accent-rose)'
                        : ticket.priority === 'PRIORITY'
                        ? 'var(--accent-amber)'
                        : 'var(--accent-primary)'
                    }`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: 'var(--text-main)',
                      }}>
                        #{ticket.queue_number}
                      </span>
                      <span className={`badge badge-priority-${ticket.priority.toLowerCase()}`}>
                        {PRIORITY_LABELS[ticket.priority] || ticket.priority}
                      </span>
                    </div>

                    <span className={`badge badge-${ticket.status.toLowerCase()}`}>
                      {ticket.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ticket.customer_name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {ticket.service?.name || 'Walk-in Service'} {ticket.phone ? `· ${ticket.phone}` : ''}
                      </div>
                    </div>

                    {ticket.status === 'WAITING' && (
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleUpdateQueueStatus(ticket.id, 'CALLED')}
                        >
                          <PhoneCall size={13} /> Call
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setTicketToRemove(ticket)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TODAY'S APPOINTMENTS COLUMN */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="var(--accent-cyan)" /> Today's Scheduled Appointments
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {appointments.length} Total
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading appointments...</div>
          ) : appointments.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <p style={{ color: 'var(--text-faint)' }}>No booked appointments for today.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {appointments.map((appt) => (
                <div key={appt.id} className="glass-card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        {appt.slot_time}
                      </span>
                      <span className={`badge badge-${appt.status.toLowerCase()}`}>
                        {appt.status.replace('_', ' ')}
                      </span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                      {appt.appointment_number}
                    </span>
                  </div>

                  <div style={{ marginTop: '0.4rem', marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{appt.user?.name || appt.user?.email}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{appt.service?.name}</div>
                  </div>

                  {/* Status transitions */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {appt.status === 'CONFIRMED' && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleUpdateApptStatus(appt.id, 'CHECKED_IN')}
                      >
                        Check In
                      </button>
                    )}
                    {appt.status === 'CHECKED_IN' && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleUpdateApptStatus(appt.id, 'IN_PROGRESS')}
                      >
                        Start Service
                      </button>
                    )}
                    {appt.status === 'IN_PROGRESS' && (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleUpdateApptStatus(appt.id, 'COMPLETED')}
                      >
                        Complete
                      </button>
                    )}
                    {(appt.status === 'CONFIRMED' || appt.status === 'CHECKED_IN') && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleUpdateApptStatus(appt.id, 'NO_SHOW')}
                      >
                        Mark No-Show
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* WALK-IN CREATION MODAL */}
      {showWalkInModal && (
        <div className="modal-overlay" onClick={() => setShowWalkInModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <UserPlus size={20} color="var(--accent-primary)" />
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Register Walk-In Patient</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Issue a sequential daily token with optional priority tier.
            </p>

            {walkInError && (
              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--accent-rose)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                border: '1px solid rgba(239, 68, 68, 0.2)',
              }}>
                {walkInError}
              </div>
            )}

            <form onSubmit={handleCreateWalkIn}>
              <div className="form-group">
                <label className="form-label">Patient Name</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. John Doe"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Patient Phone (Optional)</label>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="e.g. +1 555 0199"
                  value={walkInPhone}
                  onChange={(e) => setWalkInPhone(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Department / Consultation (Optional)</label>
                <select
                  className="form-select"
                  value={walkInServiceId}
                  onChange={(e) => setWalkInServiceId(e.target.value)}
                >
                  <option value="">General Triage / OPD</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes}m)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority Tier</label>
                <select
                  className="form-select"
                  value={walkInPriority}
                  onChange={(e) => setWalkInPriority(e.target.value as any)}
                >
                  <option value="NORMAL">Routine (Standard FIFO)</option>
                  <option value="PRIORITY">Senior Citizen / Expecting Mother</option>
                  <option value="EMERGENCY">Emergency (Immediate Dispatch)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowWalkInModal(false)}
                  disabled={walkInSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={walkInSubmitting}
                >
                  {walkInSubmitting ? 'Issuing Ticket...' : 'Issue Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REMOVAL CONFIRMATION MODAL CARD */}
      {ticketToRemove && (
        <div className="modal-overlay" onClick={() => !removingTicket && setTicketToRemove(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-rose, #f43f5e)',
                flexShrink: 0
              }}>
                <Trash2 size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>Remove Queue Ticket</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  Confirm removing this ticket from the active live queue.
                </p>
              </div>
            </div>

            <div className="glass-card" style={{ padding: '1rem', marginBottom: '1.25rem', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Token Number</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-main)' }}>
                  #{ticketToRemove.queue_number}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Patient</span>
                <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{ticketToRemove.customer_name}</span>
              </div>
              {ticketToRemove.phone && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Phone</span>
                  <span style={{ fontSize: '0.85rem' }}>{ticketToRemove.phone}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Priority</span>
                <span className={`badge badge-priority-${ticketToRemove.priority.toLowerCase()}`}>
                  {PRIORITY_LABELS[ticketToRemove.priority] || ticketToRemove.priority}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTicketToRemove(null)}
                disabled={removingTicket}
              >
                Keep Ticket
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmRemoveTicket}
                disabled={removingTicket}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Trash2 size={16} />
                {removingTicket ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
