import os from 'os';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const uploadsDir = os.tmpdir();

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, `upload_${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('file');

const convertController = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ error: "Upload failed: " + err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const {
      format = 'png',
      quality = '80',
      width,
      height,
      cropX,
      cropY,
      cropW,
      cropH,
      targetSize,
      pdfCompress
    } = req.body;

    const inputPath = req.file.path;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".jfif", ".bmp", ".tiff"].includes(ext);

    console.log(`Processing: ${originalName} -> ${format} (Quality: ${quality})`);

    const cleanup = () => {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    };

    try {
      // IMAGE → PDF
      if (format === "pdf" && isImage) {
        const pdfDoc = await PDFDocument.create();
        let sharpInstance = sharp(inputPath);

        if (width && !isNaN(parseInt(width))) {
          sharpInstance = sharpInstance.resize({ width: parseInt(width), fit: 'inside' });
        }

        const imageBuffer = await sharpInstance.jpeg({ quality: parseInt(quality) }).toBuffer();
        const image = await pdfDoc.embedJpg(imageBuffer);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

        const pdfBytes = await pdfDoc.save();
        cleanup();
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="converted.pdf"'
        });
        return res.send(Buffer.from(pdfBytes));
      }

      // PDF COMPRESSION (Simplistic)
      if (ext === ".pdf" && format === "pdf" && pdfCompress === "true") {
        const pdfDoc = await PDFDocument.load(fs.readFileSync(inputPath));
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        cleanup();
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="compressed.pdf"'
        });
        return res.send(Buffer.from(pdfBytes));
      }

      // IMAGE → IMAGE
      if (isImage) {
        let sharpInstance = sharp(inputPath);

        // Valid Numeric Check for Crop
        const cx = parseInt(cropX);
        const cy = parseInt(cropY);
        const cw = parseInt(cropW);
        const ch = parseInt(cropH);

        if (!isNaN(cx) && !isNaN(cy) && !isNaN(cw) && !isNaN(ch)) {
          sharpInstance = sharpInstance.extract({ left: cx, top: cy, width: cw, height: ch });
        }

        // Valid Numeric Check for Resize
        const targetW = parseInt(width);
        const targetH = parseInt(height);
        if (!isNaN(targetW) || !isNaN(targetH)) {
          sharpInstance = sharpInstance.resize({
            width: isNaN(targetW) ? null : targetW,
            height: isNaN(targetH) ? null : targetH,
            fit: 'inside'
          });
        }

        const targetKB = parseInt(targetSize);
        let finalBuffer;

        if (!isNaN(targetKB)) {
          let currentQuality = parseInt(quality) || 80;
          let scaleFactor = 1.0;
          let attempts = 0;

          while (attempts < 10) {
            let instance = sharpInstance.clone();
            if (scaleFactor < 1.0) {
              const meta = await sharpInstance.metadata();
              instance = instance.resize({ width: Math.round((meta.width || 1000) * scaleFactor), withoutEnlargement: true });
            }

            finalBuffer = await instance
              .toFormat(format === "jpg" ? "jpeg" : format, { quality: currentQuality })
              .toBuffer();

            if (finalBuffer.length <= targetKB * 1024) break;
            if (currentQuality > 20) currentQuality -= 15;
            else { scaleFactor *= 0.7; currentQuality = 60; }
            attempts++;
          }
        } else {
          finalBuffer = await sharpInstance
            .toFormat(format === "jpg" ? "jpeg" : format, { quality: parseInt(quality) || 80 })
            .toBuffer();
        }

        cleanup();
        res.set({
          'Content-Type': `image/${format === 'jpg' ? 'jpeg' : format}`,
          'Content-Disposition': `attachment; filename="converted.${format}"`
        });
        return res.send(finalBuffer);
      }

      cleanup();
      res.status(400).json({ error: "Unsupported conversion type" });

    } catch (error) {
      console.error("Processing Error:", error);
      cleanup();
      res.status(500).json({ error: "Internal Server Error: " + error.message });
    }
  });
};

export default convertController;
