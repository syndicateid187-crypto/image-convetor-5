
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import fileRoutes from './server/routes/fileRoutes.js';

const __dirname = path.resolve();

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploads as static
const uploadsPath = path.join(__dirname, 'server', 'uploads');
if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// Serve static frontend build
const clientBuildPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientBuildPath));

// API Routes
app.use('/api', fileRoutes);

// Catch-all for SPA
app.get('*', (req, res) => {
    const indexPath = path.join(clientBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`Frontend not built yet. Run "npm run build" first.`);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app; // Export for Vercel
