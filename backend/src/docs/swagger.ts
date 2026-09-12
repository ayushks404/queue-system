import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'MediQ API Documentation',
    version: '1.0.0',
    description: 'REST API for MediQ — a multi-branch hospital OPD appointment and queue management system.'
  },
  servers: [
    {
      url: '/api',
      description: 'API base path'
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      StandardResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid input' }
            }
          }
        }
      }
    }
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new customer or staff account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  role: { type: 'string', enum: ['CUSTOMER', 'STAFF', 'ADMIN'], default: 'CUSTOMER' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'User registered successfully' },
          400: { description: 'Validation error' },
          409: { description: 'Email already exists' }
        }
      }
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and receive JWT tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Authenticated successfully' },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token using refresh token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  refreshToken: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'New access token granted' },
          401: { description: 'Invalid or expired refresh token' }
        }
      }
    },
    '/branches': {
      get: {
        tags: ['Catalog - Branches'],
        summary: 'List all active branches',
        responses: {
          200: { description: 'List of branches' }
        }
      },
      post: {
        tags: ['Catalog - Branches'],
        summary: 'Create a branch (Admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'address', 'phone'],
                properties: {
                  name: { type: 'string' },
                  address: { type: 'string' },
                  phone: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Branch created' },
          403: { description: 'Forbidden' }
        }
      }
    },
    '/services': {
      get: {
        tags: ['Catalog - Services'],
        summary: 'List all active services',
        responses: {
          200: { description: 'List of services' }
        }
      },
      post: {
        tags: ['Catalog - Services'],
        summary: 'Create a new service (Admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'duration_minutes', 'price'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  duration_minutes: { type: 'integer' },
                  price: { type: 'number' },
                  capacity: { type: 'integer', default: 1 },
                  buffer_time_minutes: { type: 'integer', default: 0 },
                  requiredResourceTypes: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Service created' }
        }
      }
    },
    '/resources': {
      get: {
        tags: ['Catalog - Resources'],
        summary: 'List resources (Staff/Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'branchId', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'List of resources' }
        }
      },
      post: {
        tags: ['Catalog - Resources'],
        summary: 'Create a resource (Admin only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['branchId', 'name', 'type'],
                properties: {
                  branchId: { type: 'string' },
                  name: { type: 'string' },
                  type: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Resource created' }
        }
      }
    },
    '/availability': {
      get: {
        tags: ['Booking - Availability'],
        summary: 'Calculate real-time available time slots for a branch, service, and date',
        parameters: [
          { name: 'branchId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'serviceId', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'date', in: 'query', required: true, schema: { type: 'string', example: '2026-09-15' } }
        ],
        responses: {
          200: { description: 'Available slot strings (e.g. ["09:00", "09:30", ...])' },
          404: { description: 'Branch or service not found' }
        }
      }
    },
    '/reservations': {
      post: {
        tags: ['Booking - Reservations'],
        summary: 'Hold a temporary reservation slot for 5-10 minutes',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['branchId', 'serviceId', 'slotDate', 'slotTime'],
                properties: {
                  branchId: { type: 'string' },
                  serviceId: { type: 'string' },
                  slotDate: { type: 'string', example: '2026-09-15' },
                  slotTime: { type: 'string', example: '09:00' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Reservation hold created' },
          409: { description: 'Slot unavailable' }
        }
      }
    },
    '/appointments': {
      get: {
        tags: ['Booking - Appointments'],
        summary: 'List user or branch appointments',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'branchId', in: 'query', schema: { type: 'string' } },
          { name: 'date', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'List of appointments' }
        }
      },
      post: {
        tags: ['Booking - Appointments'],
        summary: 'Confirm reservation and convert into confirmed appointment',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reservationId'],
                properties: {
                  reservationId: { type: 'string' },
                  idempotencyKey: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Appointment confirmed' },
          400: { description: 'Reservation expired' },
          409: { description: 'Resource unavailable' }
        }
      }
    },
    '/appointments/{id}/reschedule': {
      patch: {
        tags: ['Booking - Appointments'],
        summary: 'Reschedule an existing confirmed appointment to a new slot',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['newSlotDate', 'newSlotTime'],
                properties: {
                  newSlotDate: { type: 'string' },
                  newSlotTime: { type: 'string' },
                  newBranchId: { type: 'string' },
                  newServiceId: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Appointment rescheduled' },
          409: { description: 'Slot or resource unavailable' }
        }
      }
    },
    '/appointments/{id}/cancel': {
      patch: {
        tags: ['Booking - Appointments'],
        summary: 'Cancel an appointment and free its slot for waitlist candidates',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Appointment cancelled' }
        }
      }
    },
    '/waitlist': {
      post: {
        tags: ['Waitlist'],
        summary: 'Join waitlist for a booked-out date/time',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['branchId', 'serviceId', 'requestedDate'],
                properties: {
                  branchId: { type: 'string' },
                  serviceId: { type: 'string' },
                  requestedDate: { type: 'string' },
                  requestedTime: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Joined waitlist' },
          409: { description: 'Already on waitlist' }
        }
      }
    },
    '/waitlist/{id}/position': {
      get: {
        tags: ['Waitlist'],
        summary: 'Get current position in waitlist and estimated wait minutes',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Waitlist position and ETA details' }
        }
      }
    },
    '/queue/walk-in': {
      post: {
        tags: ['Queue Management'],
        summary: 'Create walk-in queue ticket (Staff only)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['branchId', 'customerName'],
                properties: {
                  branchId: { type: 'string' },
                  customerName: { type: 'string' },
                  phone: { type: 'string' },
                  priority: { type: 'string', enum: ['NORMAL', 'PRIORITY', 'EMERGENCY'], default: 'NORMAL' },
                  appointmentId: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Walk-in queue ticket created' }
        }
      }
    },
    '/queue/{branchId}/call-next': {
      post: {
        tags: ['Queue Management'],
        summary: 'Call next waiting ticket according to priority tier and FIFO order (Staff only)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'branchId', in: 'path', required: true, schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Next customer called' }
        }
      }
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get current user notifications',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'List of notifications' }
        }
      }
    },
    '/reports/summary': {
      get: {
        tags: ['Reports & Analytics'],
        summary: 'Get system-wide analytics, wait times, service times, and utilization (Admin only)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'branchId', in: 'query', schema: { type: 'string' } },
          { name: 'startDate', in: 'query', schema: { type: 'string' } },
          { name: 'endDate', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Analytics and report summary' }
        }
      }
    }
  }
};

const router = Router();
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(openApiSpec));
router.get('/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(openApiSpec);
});

export default router;
