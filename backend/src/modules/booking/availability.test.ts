import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAvailableSlots } from './availability';

test('Step 4.1: computeAvailableSlots returns correct slots for 9-5 day with a break and 30-min service', () => {
  // Tuesday, 2026-09-15 (day of week 2)
  const branch = {
    business_hours: [
      {
        day_of_week: 2,
        open_time: '09:00',
        close_time: '17:00',
        break_start: '13:00',
        break_end: '14:00'
      }
    ]
  };

  const service = {
    duration_minutes: 30,
    capacity: 1
  };

  const slots = computeAvailableSlots(branch, service, '2026-09-15', [], []);

  const expectedSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
  ];

  assert.deepStrictEqual(slots, expectedSlots);
});

test('Step 4.2: computeAvailableSlots returns empty array on holiday date', () => {
  const branch = {
    business_hours: [
      {
        day_of_week: 2,
        open_time: '09:00',
        close_time: '17:00'
      }
    ],
    holidays: [
      { holiday_date: '2026-09-15' }
    ]
  };

  const service = {
    duration_minutes: 30,
    capacity: 1
  };

  const slots = computeAvailableSlots(branch, service, '2026-09-15', [], []);
  assert.deepStrictEqual(slots, []);
});

test('Step 4.3: computeAvailableSlots subtracts existing appointments respecting capacity', () => {
  const branch = {
    business_hours: [
      {
        day_of_week: 2,
        open_time: '09:00',
        close_time: '11:00'
      }
    ]
  };

  // Capacity 1: 09:00 booked removes 09:00
  const serviceCap1 = {
    duration_minutes: 30,
    capacity: 1
  };

  const appointments = [
    { start_time: '09:00', status: 'CONFIRMED' },
    { start_time: '09:30', status: 'CANCELLED' } // Cancelled should NOT block slot
  ];

  const slotsCap1 = computeAvailableSlots(branch, serviceCap1, '2026-09-15', appointments, []);
  assert.deepStrictEqual(slotsCap1, ['09:30', '10:00', '10:30']);

  // Capacity 2: 1 appointment at 09:00 still allows 09:00; 2 appointments remove it
  const serviceCap2 = {
    duration_minutes: 30,
    capacity: 2
  };

  const slotsCap2OneBooking = computeAvailableSlots(branch, serviceCap2, '2026-09-15', [{ start_time: '09:00', status: 'CONFIRMED' }], []);
  assert.ok(slotsCap2OneBooking.includes('09:00'));

  const slotsCap2TwoBookings = computeAvailableSlots(branch, serviceCap2, '2026-09-15', [
    { start_time: '09:00', status: 'CONFIRMED' },
    { start_time: '09:00', status: 'CONFIRMED' }
  ], []);
  assert.strictEqual(slotsCap2TwoBookings.includes('09:00'), false);
});
