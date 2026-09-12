import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';

export async function getReportsSummary(req: Request, res: Response): Promise<void> {
  try {
    const { branchId, startDate, endDate } = req.query;
    const branchFilter = branchId && typeof branchId === 'string' ? branchId : null;

    const apptFilters: Prisma.Sql[] = [];
    if (branchFilter) apptFilters.push(Prisma.sql`branch_id = ${branchFilter}::uuid`);
    if (startDate && typeof startDate === 'string') apptFilters.push(Prisma.sql`appointment_date >= ${new Date(startDate)}::date`);
    if (endDate && typeof endDate === 'string') apptFilters.push(Prisma.sql`appointment_date <= ${new Date(endDate)}::date`);
    const apptWhereClause = apptFilters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(apptFilters, ' AND ')}` : Prisma.empty;

    const apptStats: any[] = await prisma.$queryRaw`
      SELECT
        COUNT(*)::int AS total_bookings,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END)::int AS cancelled,
        COUNT(CASE WHEN status = 'NO_SHOW' THEN 1 END)::int AS no_shows,
        COUNT(CASE WHEN status = 'CONFIRMED' THEN 1 END)::int AS confirmed,
        COUNT(CASE WHEN status = 'CHECKED_IN' THEN 1 END)::int AS checked_in,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END)::int AS in_service
      FROM appointments ${apptWhereClause}
    `;

    const queueFilters: Prisma.Sql[] = [];
    if (branchFilter) queueFilters.push(Prisma.sql`branch_id = ${branchFilter}::uuid`);
    const queueWhereClause = queueFilters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(queueFilters, ' AND ')}` : Prisma.empty;

    const queueStats: any[] = await prisma.$queryRaw`
      SELECT
        COUNT(*)::int AS total_queue_entries,
        COUNT(CASE WHEN status = 'WAITING' THEN 1 END)::int AS waiting_entries,
        COUNT(CASE WHEN status = 'IN_PROGRESS' THEN 1 END)::int AS serving_entries,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)::int AS completed_entries
      FROM queue_entries ${queueWhereClause}
    `;

    const dailyFilters: Prisma.Sql[] = [...apptFilters, Prisma.sql`appointment_date >= (CURRENT_DATE - INTERVAL '14 days')`];
    const dailyWhereClause = Prisma.sql`WHERE ${Prisma.join(dailyFilters, ' AND ')}`;
    const dailyStats: any[] = await prisma.$queryRaw`
      SELECT to_char(appointment_date, 'YYYY-MM-DD') AS slot_date, COUNT(*)::int AS count
      FROM appointments ${dailyWhereClause}
      GROUP BY appointment_date ORDER BY appointment_date ASC LIMIT 14
    `;

    const waitTimeFilters: Prisma.Sql[] = [Prisma.sql`ci.new_status = 'CHECKED_IN'`, Prisma.sql`ip.new_status = 'IN_PROGRESS'`];
    if (branchFilter) waitTimeFilters.push(Prisma.sql`a.branch_id = ${branchFilter}::uuid`);
    const waitTimeResult: any[] = await prisma.$queryRaw`
      SELECT AVG(EXTRACT(EPOCH FROM (ip.created_at - ci.created_at)) / 60.0) AS avg_wait_minutes
      FROM audit_logs ci
      JOIN audit_logs ip ON ip.appointment_id = ci.appointment_id AND ip.created_at > ci.created_at
      JOIN appointments a ON a.id = ci.appointment_id
      WHERE ${Prisma.join(waitTimeFilters, ' AND ')}
    `;

    const serviceTimeFilters: Prisma.Sql[] = [Prisma.sql`ip.new_status = 'IN_PROGRESS'`, Prisma.sql`cp.new_status = 'COMPLETED'`];
    if (branchFilter) serviceTimeFilters.push(Prisma.sql`a.branch_id = ${branchFilter}::uuid`);
    const serviceTimeResult: any[] = await prisma.$queryRaw`
      SELECT AVG(EXTRACT(EPOCH FROM (cp.created_at - ip.created_at)) / 60.0) AS avg_service_minutes
      FROM audit_logs ip
      JOIN audit_logs cp ON cp.appointment_id = ip.appointment_id AND cp.created_at > ip.created_at
      JOIN appointments a ON a.id = ip.appointment_id
      WHERE ${Prisma.join(serviceTimeFilters, ' AND ')}
    `;

    const popularServices: any[] = await prisma.$queryRaw`
      SELECT s.id AS service_id, s.name AS service_name, COUNT(*)::int AS booking_count
      FROM appointments a JOIN services s ON s.id = a.service_id
      ${apptWhereClause}
      GROUP BY s.id, s.name ORDER BY booking_count DESC LIMIT 5
    `;

    const branchPerformance: any[] = await prisma.$queryRaw`
      SELECT b.id AS branch_id, b.name AS branch_name,
        COUNT(*)::int AS total,
        COUNT(CASE WHEN a.status = 'COMPLETED' THEN 1 END)::int AS completed,
        COUNT(CASE WHEN a.status = 'NO_SHOW' THEN 1 END)::int AS no_shows
      FROM appointments a JOIN branches b ON b.id = a.branch_id
      ${apptWhereClause}
      GROUP BY b.id, b.name ORDER BY total DESC
    `;

    const resourceUtilization: any[] = await prisma.$queryRaw`
      SELECT r.id AS resource_id, r.name AS resource_name, r.type AS resource_type,
        COUNT(ar.id)::int AS times_assigned
      FROM resources r
      LEFT JOIN appointment_resources ar ON ar.resource_id = r.id
      ${branchFilter ? Prisma.sql`WHERE r.branch_id = ${branchFilter}::uuid` : Prisma.empty}
      GROUP BY r.id, r.name, r.type ORDER BY times_assigned DESC
    `;

    const summary = {
      total_bookings: apptStats[0]?.total_bookings || 0,
      completed: apptStats[0]?.completed || 0,
      cancelled: apptStats[0]?.cancelled || 0,
      no_shows: apptStats[0]?.no_shows || 0,
      confirmed: apptStats[0]?.confirmed || 0,
      checked_in: apptStats[0]?.checked_in || 0,
      in_service: apptStats[0]?.in_service || 0,
      total_queue_entries: queueStats[0]?.total_queue_entries || 0,
      avg_wait_time: Number(waitTimeResult[0]?.avg_wait_minutes) || 0,
      avg_service_time: Number(serviceTimeResult[0]?.avg_service_minutes) || 0,
      daily_breakdown: dailyStats || [],
      popular_services: popularServices || [],
      branch_performance: branchPerformance || [],
      resource_utilization: resourceUtilization || [],
    };

    res.status(200).json({ summary });
  } catch (error) {
    console.error('Error fetching reports summary:', error);
    res.status(500).json({ error: 'Failed to generate report summary' });
  }
}
