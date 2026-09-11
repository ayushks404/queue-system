import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

export async function createService(req: Request, res: Response) {
  try {
    const { name, duration_minutes, price, capacity, is_active } = req.body;
    if (!name || duration_minutes === undefined || price === undefined) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'name, duration_minutes, and price are required'
        }
      });
    }

    const service = await prisma.service.create({
      data: {
        name,
        duration_minutes: Number(duration_minutes),
        price: Number(price),
        capacity: capacity !== undefined ? Number(capacity) : 1,
        is_active: is_active !== undefined ? Boolean(is_active) : true
      }
    });

    return res.status(201).json({
      success: true,
      data: service
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

export async function getServicesAdmin(req: Request, res: Response) {
  try {
    const services = await prisma.service.findMany({
      include: {
        service_resources: true
      },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: services
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

export async function getServiceById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        service_resources: true
      }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Service not found'
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: service
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

export async function updateService(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, duration_minutes, price, capacity, is_active } = req.body;

    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Service not found'
        }
      });
    }

    const service = await prisma.service.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(duration_minutes !== undefined && { duration_minutes: Number(duration_minutes) }),
        ...(price !== undefined && { price: Number(price) }),
        ...(capacity !== undefined && { capacity: Number(capacity) }),
        ...(is_active !== undefined && { is_active: Boolean(is_active) })
      }
    });

    return res.status(200).json({
      success: true,
      data: service
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

export async function deleteService(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Service not found'
        }
      });
    }

    await prisma.service.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      data: { message: 'Service deleted successfully' }
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
