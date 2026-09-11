import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

export async function setBusinessHours(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const { hours } = req.body; // Array of { day_of_week, open_time, close_time, break_start, break_end }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Branch not found' }
      });
    }

    if (!Array.isArray(hours)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'hours must be an array' }
      });
    }

    // Replace existing business hours for this branch in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.businessHour.deleteMany({ where: { branch_id: branchId } });
      if (hours.length > 0) {
        await tx.businessHour.createMany({
          data: hours.map((h: any) => ({
            branch_id: branchId,
            day_of_week: Number(h.day_of_week),
            open_time: String(h.open_time),
            close_time: String(h.close_time),
            break_start: h.break_start ? String(h.break_start) : null,
            break_end: h.break_end ? String(h.break_end) : null
          }))
        });
      }
    });

    const updatedHours = await prisma.businessHour.findMany({
      where: { branch_id: branchId },
      orderBy: { day_of_week: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: updatedHours
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function getBusinessHours(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const hours = await prisma.businessHour.findMany({
      where: { branch_id: branchId },
      orderBy: { day_of_week: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: hours
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function createHoliday(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const { holiday_date, reason } = req.body;

    if (!holiday_date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'holiday_date is required (YYYY-MM-DD)' }
      });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Branch not found' }
      });
    }

    const holiday = await prisma.holiday.create({
      data: {
        branch_id: branchId,
        holiday_date: new Date(holiday_date),
        reason: reason || null
      }
    });

    return res.status(201).json({
      success: true,
      data: holiday
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function getHolidays(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const holidays = await prisma.holiday.findMany({
      where: { branch_id: branchId },
      orderBy: { holiday_date: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: holidays
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function deleteHoliday(req: Request, res: Response) {
  try {
    const { branchId, holidayId } = req.params;
    const holiday = await prisma.holiday.findFirst({
      where: { id: holidayId, branch_id: branchId }
    });

    if (!holiday) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Holiday not found' }
      });
    }

    await prisma.holiday.delete({ where: { id: holidayId } });

    return res.status(200).json({
      success: true,
      data: { message: 'Holiday deleted successfully' }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}
