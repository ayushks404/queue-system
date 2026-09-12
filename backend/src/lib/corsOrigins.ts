export const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost',
  'http://localhost:80',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1',
  'http://127.0.0.1:80',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
].filter(Boolean) as string[];

const LOCALHOST_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  if (
    allowedOrigins.includes(origin) ||
    LOCALHOST_REGEX.test(origin)
  ) {
    return true;
  }
  return false;
}
