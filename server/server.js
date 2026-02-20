
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import fileRoutes from './routes/fileRoutes.js';

const __dirname = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)).replace(/^\/([a-zA-Z]:)/, '$1');

const app = express();
app.use(cors());
app.use(express.json());

// Serve uploads as static
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve static frontend build
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
console.log("Serving frontend from:", clientBuildPath);
app.use(express.static(clientBuildPath));

app.use('/api', fileRoutes);

// Catch-all for SPA (must be AFTER API routes)
app.get('*', (req, res) => {
    const indexPath = path.join(clientBuildPath, 'index.html');
    console.log("Catch-all hit. Serving:", indexPath);
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`Frontend not built yet. Looking at: ${indexPath}`);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



