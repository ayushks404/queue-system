import React, { useState, useEffect, useRef } from 'react';
import type { Branch, Service, Reservation, Appointment } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { SlotHoldTimer } from './SlotHoldTimer';
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  ArrowLeft,
  DollarSign,
} from 'lucide-react';

interface BookingWizardProps {
  onSuccessNavigate?: () => void;
  onOpenAuth?: () => void;
}

export const BookingWizard: React.FC<BookingWizardProps> = ({ onSuccessNavigate, onOpenAuth }) => {
  const { user } = useAuth();
  const idempotencyKeyRef = useRef<string | null>(null);

  // Data state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Wizard selections
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [waitlistJoined, setWaitlistJoined] = useState<boolean>(false);

  // Fetch branches and services on mount
  useEffect(() => {
    async function loadCatalog() {
      try {
        setLoadingBranches(true);
        const [branchesData, servicesData] = await Promise.all([
          api.get<{ branches: Branch[] }>('/branches'),
          api.get<{ services: Service[] }>('/services'),
        ]);
        setBranches(branchesData.branches || []);
        setServices(servicesData.services || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load catalog');
      } finally {
        setLoadingBranches(false);
      }
    }
    loadCatalog();
  }, []);

  // Fetch slots whenever branch, service, or date changes in step 3
  useEffect(() => {
    if (!selectedBranch || !selectedService || !selectedDate) return;

    async function fetchSlots() {
      try {
        setLoadingSlots(true);
        setError(null);
        setSelectedSlot(null);
        const data = await api.get<{ available_slots: string[] }>(
          `/availability?branchId=${selectedBranch!.id}&serviceId=${selectedService!.id}&date=${selectedDate}`
        );
        setAvailableSlots(data.available_slots || []);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch available slots');
        setAvailableSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    }

    if (step === 3) {
      fetchSlots();
    }
  }, [selectedBranch, selectedService, selectedDate, step]);

  // Handle slot reservation
  const handleHoldSlot = async (slot: string) => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await api.post<{ reservation: Reservation }>('/reservations', {
        branch_id: selectedBranch!.id,
        service_id: selectedService!.id,
        slot_date: selectedDate,
        slot_time: slot,
      });
      setSelectedSlot(slot);
      setReservation(res.reservation);
      idempotencyKeyRef.current = null; // fresh reservation -> fresh key
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Slot is no longer available. Please select another slot.');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle final appointment confirmation
  const handleConfirmAppointment = async () => {
    if (!reservation) return;

    try {
      setSubmitting(true);
      setError(null);
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
      const idempotencyKey = idempotencyKeyRef.current;
      const data = await api.post<{ appointment: Appointment }>(
        '/appointments',
        {
          reservation_id: reservation.id,
          notes,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      );
      setConfirmedAppointment(data.appointment);
      setStep(5);
    } catch (err: any) {
      setError(err.message || 'Failed to confirm appointment');
    } finally {
      setSubmitting(false);
    }
  };

  // Join waitlist for full date
  const handleJoinWaitlist = async () => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await api.post('/waitlist', {
        branch_id: selectedBranch!.id,
        service_id: selectedService!.id,
        preferred_date: selectedDate,
      });
      setWaitlistJoined(true);
    } catch (err: any) {
      setError(err.message || 'Failed to join waitlist');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '850px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Wizard Progress Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', gap: '0.5rem' }}>
        {[
          { num: 1, label: 'Branch' },
          { num: 2, label: 'Service' },
          { num: 3, label: 'Time & Slot' },
          { num: 4, label: 'Confirm' },
        ].map((s, idx) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <React.Fragment key={s.num}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isDone
                    ? 'var(--accent-emerald)'
                    : isActive
                    ? 'var(--accent-primary)'
                    : 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  boxShadow: isActive ? 'var(--glow-indigo)' : 'none',
                }}>
                  {isDone ? '✓' : s.num}
                </div>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
                }}>
                  {s.label}
                </span>
              </div>
              {idx < 3 && (
                <div style={{
                  flex: 1,
                  height: '2px',
                  background: isDone ? 'var(--accent-emerald)' : 'rgba(255, 255, 255, 0.08)',
                  margin: '0 0.5rem',
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1.25rem',
          color: '#fb7185',
          fontSize: '0.9rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
        }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Select Branch */}
      {step === 1 && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2>Select Branch</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
              Choose a facility location for your appointment
            </p>
          </div>

          {loadingBranches ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Loading branches...
            </div>
          ) : branches.length === 0 ? (
            <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
              <MapPin size={36} color="var(--text-faint)" style={{ margin: '0 auto 1rem' }} />
              <p>No active branches found. Please check back later.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {branches.map((b) => (
                <div
                  key={b.id}
                  className={`glass-card glass-card-interactive ${selectedBranch?.id === b.id ? 'active-border' : ''}`}
                  onClick={() => {
                    setSelectedBranch(b);
                    setStep(2);
                  }}
                  style={{
                    cursor: 'pointer',
                    borderColor: selectedBranch?.id === b.id ? 'var(--accent-primary)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', marginBottom: '0.75rem' }}>
                      <MapPin size={20} />
                    </div>
                    <ChevronRight size={18} color="var(--text-faint)" />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>{b.name}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{b.address || 'Central Location'}</p>
                  <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                    Timezone: {b.timezone}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Select Service */}
      {step === 2 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Back
            </button>
            <div>
              <h2>Select Service</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Branch: <strong>{selectedBranch?.name}</strong>
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {services.map((s) => (
              <div
                key={s.id}
                className="glass-card glass-card-interactive"
                onClick={() => {
                  setSelectedService(s);
                  setStep(3);
                }}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                    <Sparkles size={20} />
                  </div>
                  {s.price && (
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                      <DollarSign size={14} />{s.price}
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.35rem' }}>{s.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  {s.description || 'Standard service appointment'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-faint)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={14} /> {s.duration_minutes} min
                  </span>
                  <span>Cap: {s.capacity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: Select Date & Slot */}
      {step === 3 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>
              <ArrowLeft size={16} /> Back
            </button>
            <div>
              <h2>Choose Date & Slot</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {selectedBranch?.name} · {selectedService?.name} ({selectedService?.duration_minutes}m)
              </p>
            </div>
          </div>

          {/* Date Picker Ribbon */}
          <div className="glass-card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
              Select Appointment Date
            </label>
            <input
              type="date"
              className="form-input"
              value={selectedDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{ maxWidth: '240px' }}
            />
          </div>

          {/* Slots View */}
          <div className="glass-card">
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} color="var(--accent-primary)" />
              Available Time Slots for {selectedDate}
            </h3>

            {loadingSlots ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                Calculating availability engine slots...
              </div>
            ) : availableSlots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <AlertCircle size={32} color="var(--accent-amber)" style={{ margin: '0 auto 0.75rem' }} />
                <h4 style={{ marginBottom: '0.25rem' }}>No Slots Available</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  All slots are booked or the branch is closed on this date.
                </p>

                {/* Waitlist Call-to-Action */}
                {waitlistJoined ? (
                  <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '0.75rem', borderRadius: 'var(--radius-md)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <CheckCircle2 size={16} /> You have joined the Waitlist for this date!
                  </div>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleJoinWaitlist}
                    disabled={submitting}
                  >
                    {submitting ? 'Joining...' : 'Join Waitlist for This Day'}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.65rem' }}>
                {availableSlots.map((slot) => (
                  <button
                    key={slot}
                    className="btn btn-secondary"
                    onClick={() => handleHoldSlot(slot)}
                    disabled={submitting}
                    style={{
                      padding: '0.75rem 0.5rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      background: 'rgba(99, 102, 241, 0.08)',
                      borderColor: 'rgba(99, 102, 241, 0.25)',
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 4: Reservation Hold & Final Confirmation */}
      {step === 4 && reservation && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep(3)}>
              <ArrowLeft size={16} /> Choose Another Slot
            </button>
            <div>
              <h2>Confirm Appointment</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Review details and finalize your booking
              </p>
            </div>
          </div>

          {/* 5-Min Hold Countdown */}
          <div style={{ marginBottom: '1.5rem' }}>
            <SlotHoldTimer
              expiresAt={reservation.expires_at}
              onExpired={() => {
                setError('Your 5-minute reservation hold has expired. Please select a slot again.');
                setStep(3);
              }}
            />
          </div>

          <div className="glass-card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
              Booking Summary
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <div className="form-label">Branch</div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{selectedBranch?.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedBranch?.address}</div>
              </div>
              <div>
                <div className="form-label">Service</div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{selectedService?.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedService?.duration_minutes} minutes</div>
              </div>
              <div>
                <div className="form-label">Date & Time</div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--accent-primary)' }}>
                  {selectedDate} at {selectedSlot}
                </div>
              </div>
              <div>
                <div className="form-label">Customer</div>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{user?.name || user?.email}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user?.phone || 'No phone'}</div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Special Notes / Requests (Optional)</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Any special accommodations or details for the staff..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleConfirmAppointment}
              disabled={submitting}
              style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}
            >
              {submitting ? 'Confirming Appointment...' : 'Confirm & Book Appointment'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Success Confirmed State */}
      {step === 5 && confirmedAppointment && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--accent-emerald)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}>
            <CheckCircle2 size={36} />
          </div>

          <h2 style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>Appointment Confirmed!</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
            Your booking is secured. You will receive real-time notifications as your slot approaches.
          </p>

          <div style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            maxWidth: '380px',
            margin: '0 auto 2rem',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Appointment Number:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {confirmedAppointment.appointment_number}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Date:</span>
              <span style={{ fontWeight: 600 }}>
                {confirmedAppointment.appointment_date?.split('T')[0] || confirmedAppointment.slot_date || selectedDate}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Time Slot:</span>
              <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                {confirmedAppointment.start_time || confirmedAppointment.slot_time || selectedSlot}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStep(1);
                setSelectedSlot(null);
                setReservation(null);
                setConfirmedAppointment(null);
              }}
            >
              Book Another
            </button>
            {onSuccessNavigate && (
              <button className="btn btn-primary" onClick={onSuccessNavigate}>
                View My Appointments
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
