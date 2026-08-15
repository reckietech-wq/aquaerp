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

  if (status >= 500) {
    // Log full detail server-side, but never leak internal error messages
    // (stack traces, raw DB/ORM errors) to the client on unexpected failures
    // — only deliberately-thrown, controller-authored 4xx errors get their
    // message passed through below.
    console.error('[ERROR]', err.stack ?? err);
    return res.status(status).json({ error: 'Internal Server Error' });
  }

  res.status(status).json({ error: err.message || 'Internal Server Error' });
}

module.exports = errorHandler;
