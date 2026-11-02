const { Router } = require('express');

function createHealthRouter({ llmProvider }) {
  const router = Router();
  router.get('/', (req, res) => {
    res.json({ status: 'ok', provider: llmProvider.name, uptimeSec: Math.round(process.uptime()) });
  });
  return router;
}

module.exports = { createHealthRouter };
