function errorHandler(err, req, res, next) {
  // Prisma known error codes
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] ?? 'field';
    return res.status(409).json({ error: `${field} already exists` });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Related record not found' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (status >= 500) {
    console.error('[ERROR]', err.stack ?? err);
  }

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
