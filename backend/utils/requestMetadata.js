const truncate = (value, length) => String(value || '').slice(0, length)

export const requestSecurityMetadata = (req) => ({
  ipAddress: truncate(
    req.ip || req.socket?.remoteAddress || 'unknown',
    80,
  ),
  userAgent: truncate(req.headers?.['user-agent'], 240),
})
