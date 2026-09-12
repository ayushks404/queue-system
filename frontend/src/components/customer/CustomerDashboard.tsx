import React, { useState, useEffect, useCallback } from 'react';
import type { Appointment, WaitlistEntry } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  Calendar,
  Clock,
  MapPin,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Layers,
} from 'lucide-react';

export const CustomerDashboard: React.FC = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'waitlist'>('upcoming');

  // Cancel Modal state
  const [cancelModalAppt, setCancelModalAppt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Reschedule Modal state
  const [rescheduleModalAppt, setRescheduleModalAppt] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [selectedNewSlot, setSelectedNewSlot] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchUserData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [apptsData, waitlistData] = await Promise.all([
        api.get<{ appointments: Appointment[] }>('/appointments'),
        api.get<{ waitlist: WaitlistEntry[] }>('/waitlist/me').catch(() => ({ waitlist: [] })),
      ]);

      setAppointments(apptsData.appointments || []);
      setWaitlistEntries(waitlistData.waitlist || []);
    } catch (err) {
      console.error('Failed to load customer data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Handle Cancel Appointment
  const handleCancel = async () => {
    if (!cancelModalAppt) return;
    try {
      setActionLoading(true);
      await api.patch(`/appointments/${cancelModalAppt.id}/cancel`, {
        reason: cancelReason || 'Customer requested cancellation',
      });
      setCancelModalAppt(null);
      setCancelReason('');
      await fetchUserData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment');
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch slots for reschedule
  const handleDateChangeForReschedule = async (date: string) => {
    setRescheduleDate(date);
    setSelectedNewSlot(null);
    if (!rescheduleModalAppt) return;
    try {
      setSlotsLoading(true);
      const data = await api.get<{ available_slots: string[] }>(
        `/availability?branchId=${rescheduleModalAppt.branch_id}&serviceId=${rescheduleModalAppt.service_id}&date=${date}`
      );
      setRescheduleSlots(data.available_slots || []);
    } catch (err: any) {
      setRescheduleSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  // Handle Reschedule Appointment
  const handleReschedule = async () => {
    if (!rescheduleModalAppt || !rescheduleDate || !selectedNewSlot) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      await api.patch(`/appointments/${rescheduleModalAppt.id}/reschedule`, {
        new_slot_date: rescheduleDate,
        new_slot_time: selectedNewSlot,
      });
      setRescheduleModalAppt(null);
      setSelectedNewSlot(null);
      await fetchUserData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reschedule appointment. The selected slot may no longer be available.');
    } finally {
      setActionLoading(false);
    }
  };

  const upcomingAppointments = appointments.filter((a) =>
    ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_SERVICE'].includes(a.status)
  );

  const historyAppointments = appointments.filter((a) =>
    ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status)
  );

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2>Customer Dashboard</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Manage your upcoming appointments and active waitlists
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        <button
          className={`btn btn-sm ${activeTab === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming ({upcomingAppointments.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('history')}
        >
          History ({historyAppointments.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'waitlist' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('waitlist')}
        >
          Waitlist ({waitlistEntries.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Loading appointments...
        </div>
      ) : (
        <>
          {/* UPCOMING TAB */}
          {activeTab === 'upcoming' && (
            <div>
              {upcomingAppointments.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <Calendar size={36} color="var(--text-faint)" style={{ margin: '0 auto 1rem' }} />
                  <p>You have no upcoming appointments.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {upcomingAppointments.map((appt) => (
                    <div key={appt.id} className="glass-card" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                          <span className={`badge badge-${appt.status.toLowerCase()}`}>
                            {appt.status.replace('_', ' ')}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                            {appt.appointment_number}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
                          {appt.service?.name || 'General Service'}
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <MapPin size={15} color="var(--accent-primary)" /> {appt.branch?.name || 'Branch'}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Calendar size={15} color="var(--accent-cyan)" /> {appt.appointment_date?.split('T')[0] || appt.slot_date}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Clock size={15} color="var(--accent-emerald)" /> {appt.start_time || appt.slot_time}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            const dateStr = appt.appointment_date?.split('T')[0] || appt.slot_date || '';
                            setRescheduleModalAppt(appt);
                            setRescheduleDate(dateStr);
                            handleDateChangeForReschedule(dateStr);
                          }}
                        >
                          <RotateCcw size={14} /> Reschedule
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setCancelModalAppt(appt)}
                        >
                          <XCircle size={14} /> Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div>
              {historyAppointments.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <p>No past appointment history.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {historyAppointments.map((appt) => (
                    <div key={appt.id} className="glass-card" style={{ opacity: 0.85 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <span className={`badge badge-${appt.status.toLowerCase()}`}>
                          {appt.status.replace('_', ' ')}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-faint)' }}>
                          {appt.appointment_number}
                        </span>
                      </div>
                      <h4 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>
                        {appt.service?.name || 'Service'} · {appt.branch?.name || 'Branch'}
                      </h4>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>
                        Date: {appt.appointment_date?.split('T')[0] || appt.slot_date} at {appt.start_time || appt.slot_time}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WAITLIST TAB */}
          {activeTab === 'waitlist' && (
            <div>
              {waitlistEntries.length === 0 ? (
                <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
                  <Layers size={36} color="var(--text-faint)" style={{ margin: '0 auto 1rem' }} />
                  <p>You are not on any active waitlists.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {waitlistEntries.map((w) => (
                    <div key={w.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                          <span className={`badge badge-${w.status === 'OFFERED' ? 'in_service' : 'pending'}`}>
                            {w.status}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Date: {w.preferred_date}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '1rem' }}>
                          {w.service?.name || 'Service'} · {w.branch?.name || 'Branch'}
                        </h4>
                      </div>

                      {w.status === 'OFFERED' ? (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: '0.25rem' }}>
                            ★ Slot Offered!
                          </div>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                              // Accept offer
                              await api.post(`/waitlist/${w.id}/accept`);
                              fetchUserData();
                            }}
                          >
                            Accept Offer
                          </button>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Waitlist Status</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                            Active in FIFO Queue
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* CANCEL MODAL */}
      {cancelModalAppt && (
        <div className="modal-overlay" onClick={() => setCancelModalAppt(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={20} color="var(--accent-rose)" /> Cancel Appointment
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Are you sure you want to cancel appointment <strong>{cancelModalAppt.appointment_number}</strong> on {cancelModalAppt.slot_date} at {cancelModalAppt.slot_time}?
            </p>

            <div className="form-group">
              <label className="form-label">Reason for cancellation (optional)</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Let us know why you are cancelling..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setCancelModalAppt(null)} disabled={actionLoading}>
                Keep Appointment
              </button>
              <button className="btn btn-danger" onClick={handleCancel} disabled={actionLoading}>
                {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {rescheduleModalAppt && (
        <div className="modal-overlay" onClick={() => setRescheduleModalAppt(null)}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RotateCcw size={20} color="var(--accent-primary)" /> Reschedule Appointment
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Choose a new date and available slot. Your current slot will only be released if the new slot is successfully secured.
            </p>

            {errorMsg && (
              <div style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {errorMsg}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Select New Date</label>
              <input
                type="date"
                className="form-input"
                value={rescheduleDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => handleDateChangeForReschedule(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Select New Time Slot</label>
              {slotsLoading ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem 0' }}>
                  Checking availability...
                </div>
              ) : rescheduleSlots.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-faint)', padding: '1rem 0' }}>
                  No available slots for this date.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
                  {rescheduleSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`btn btn-sm ${selectedNewSlot === slot ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedNewSlot(slot)}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setRescheduleModalAppt(null)} disabled={actionLoading}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleReschedule}
                disabled={actionLoading || !selectedNewSlot}
              >
                {actionLoading ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
