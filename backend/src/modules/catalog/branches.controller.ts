import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

export async function getActiveBranches(req: Request, res: Response) {
  try {
    const branches = await prisma.branch.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' }
    });
    return res.status(200).json({
      success: true,
      data: branches
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    });
  }
}

export async function createBranch(req: Request, res: Response) {
  try {
    const { name, address, phone, is_active } = req.body;
    if (!name || !address || !phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, address, and phone are required'
        }
      });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        address,
        phone,
        is_active: is_active !== undefined ? Boolean(is_active) : true,
        business_hours: {
          create: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            day_of_week: day,
            open_time: '09:00',
            close_time: '17:00'
          }))
        },
        resources: {
          create: [
            { name: 'Consultation Room 1', type: 'ROOM', is_active: true },
            { name: 'Consultation Room 2', type: 'ROOM', is_active: true },
            { name: 'Dental Chair 1', type: 'CHAIR', is_active: true },
            { name: 'X-Ray Bay', type: 'BAY', is_active: true },
            { name: 'Lab Counter 1', type: 'COUNTER', is_active: true },
            { name: 'Lab Counter 2', type: 'COUNTER', is_active: true },
            { name: 'Vaccination Booth', type: 'BOOTH', is_active: true }
          ]
        }
      }
    });

    return res.status(201).json({
      success: true,
      data: branch
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    });
  }
}

export async function getBranchesAdmin(req: Request, res: Response) {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { name: 'asc' }
    });
    return res.status(200).json({
      success: true,
      data: branches
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    });
  }
}

export async function getBranchById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        business_hours: true,
        holidays: true,
        resources: true
      }
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Branch not found'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    });
  }
}

export async function updateBranch(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, address, phone, is_active } = req.body;

    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Branch not found'
        }
      });
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(is_active !== undefined && { is_active: Boolean(is_active) })
      }
    });

    return res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Internal server error'
      }
    });
  }
}
