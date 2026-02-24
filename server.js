import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fileRoutes from './server/routes/fileRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1024mb' }));
app.use(express.urlencoded({ limit: '1024mb', extended: true }));

// Simple logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Serve static files from the React app
const clientDistPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientDistPath));

// API Routes
app.use('/api', fileRoutes);

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Local listener
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production' || import.meta.url === `file:///${__filename.replace(/\\/g, '/')}`) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Unified Server running at http://localhost:${PORT}`);
    });
}

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("GLOBAL ERROR:", err);
    res.status(500).json({ error: "Global Server Error: " + err.message });
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

// Export for Vercel Serverless
export default app;
