import express, { Request, Response } from 'express';
import os from 'os';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? '8080', 10);
const SERVICE_NAME = process.env.SERVICE_NAME ?? 'microservice-demo';
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '1.0.0';

// ── Tipos ──────────────────────────────────────────────────────
interface Item {
  id: number;
  name: string;
}

// ── Rutas ─────────────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Microservicio K8s Demo con despliegue en la nube - v3 (pipeline corregido)',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    hostname: os.hostname(),
  });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: SERVICE_NAME, version: SERVICE_VERSION });
});

app.get('/items', (_req: Request, res: Response) => {
  const items: Item[] = [
    { id: 1, name: 'Item A' },
    { id: 2, name: 'Item B' },
    { id: 3, name: 'Item C' },
  ];
  res.json({ items });
});

// ── Arranque ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} escuchando en :${PORT}`);
});
