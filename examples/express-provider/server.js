import express from 'express';

const app = express();
const port = Number(process.env.PORT || 8787);

app.get('/forecast', (_req, res) => {
  res.json({
    provider: 'Example Weather API',
    unit: 'forecast lookup',
    forecast: 'sunny',
  });
});

app.listen(port, () => {
  console.log(`Example provider API listening on http://localhost:${port}`);
});
