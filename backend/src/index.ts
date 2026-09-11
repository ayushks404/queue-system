import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const server = app.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
});

export default app;
export { server };
