import express from 'express';
import cors from 'cors';
import fileRoutes from './server/routes/fileRoutes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// API Routes
app.use('/api', fileRoutes);

// Export for Vercel Serverless
export default app;
