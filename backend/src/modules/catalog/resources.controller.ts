import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

export async function createResource(req: Request, res: Response) {
  try {
    const branch_id = req.params.branchId || req.body.branch_id;
    const { name, type, is_active } = req.body;

    if (!branch_id || !name || !type) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'branch_id, name, and type are required'
        }
      });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branch_id } });
    if (!branch) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Branch not found' }
      });
    }

    const resource = await prisma.resource.create({
      data: {
        branch_id,
        name,
        type,
        is_active: is_active !== undefined ? Boolean(is_active) : true
      }
    });

    return res.status(201).json({
      success: true,
      data: resource
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function getAllResources(req: Request, res: Response) {
  try {
    const resources = await prisma.resource.findMany({
      include: {
        branch: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: resources
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function getResourcesByBranch(req: Request, res: Response) {
  try {
    const { branchId } = req.params;
    const resources = await prisma.resource.findMany({
      where: { branch_id: branchId },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json({
      success: true,
      data: resources
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function updateResource(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, type, is_active } = req.body;

    const existing = await prisma.resource.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' }
      });
    }

    const resource = await prisma.resource.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(is_active !== undefined && { is_active: Boolean(is_active) })
      }
    });

    return res.status(200).json({
      success: true,
      data: resource
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function deleteResource(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.resource.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Resource not found' }
      });
    }

    await prisma.resource.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      data: { message: 'Resource deleted successfully' }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function setServiceResources(req: Request, res: Response) {
  try {
    const { serviceId } = req.params;
    const { resource_types } = req.body; // Array of strings e.g. ["ROOM", "DOCTOR"]

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Service not found' }
      });
    }

    if (!Array.isArray(resource_types)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'resource_types must be an array of strings' }
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceResource.deleteMany({ where: { service_id: serviceId } });
      if (resource_types.length > 0) {
        await tx.serviceResource.createMany({
          data: resource_types.map((type: string) => ({
            service_id: serviceId,
            resource_type: String(type)
          }))
        });
      }
    });

    const links = await prisma.serviceResource.findMany({
      where: { service_id: serviceId }
    });

    return res.status(201).json({
      success: true,
      data: links
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}

export async function getServiceResources(req: Request, res: Response) {
  try {
    const { serviceId } = req.params;
    const links = await prisma.serviceResource.findMany({
      where: { service_id: serviceId }
    });

    return res.status(200).json({
      success: true,
      data: links
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' }
    });
  }
}
