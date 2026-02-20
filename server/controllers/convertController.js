import os from 'os';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

// pdf-poppler often fails on Vercel due to missing system binary. 
// We'll import it safely later only if absolutely needed, or skip it.
// import pdf from 'pdf-poppler';

const uploadsDir = os.tmpdir();

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, `upload_${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for internal processing
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
      format,
      quality,
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

    console.log(`Processing file: ${originalName} (${req.file.size} bytes) to ${format}`);

    const filesToCleanup = [inputPath];

    try {
      // IMAGE → PDF
      if (format === "pdf" && isImage) {
        const pdfDoc = await PDFDocument.create();
        const target = targetSize ? parseInt(targetSize) : null;

        let imageBuffer;
        if (target || quality || width || height) {
          // Process with sharp first if any resize/quality/target is requested
          let sharpInstance = sharp(inputPath);
          if (width || height) {
            sharpInstance = sharpInstance.resize({ width: width ? parseInt(width) : null, height: height ? parseInt(height) : null, fit: 'inside' });
          }
          // Embedding into PDF requires JPG/PNG. We'll use JPG for better compression.
          imageBuffer = await sharpInstance.jpeg({ quality: quality ? parseInt(quality) : 80 }).toBuffer();
        } else {
          imageBuffer = fs.readFileSync(inputPath);
        }

        const image = await pdfDoc.embedJpg(imageBuffer);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

        const pdfBytes = await pdfDoc.save();
        const outputPath = path.join(uploadsDir, `output_${Date.now()}.pdf`);
        fs.writeFileSync(outputPath, pdfBytes);
        filesToCleanup.push(outputPath);

        return res.download(outputPath, "converted.pdf", (downloadErr) => {
          if (downloadErr) console.error("Download error:", downloadErr);
          filesToCleanup.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        });
      }

      // PDF → IMAGE (SKIPPED ON VERCEL DUE TO DEPENDENCY ISSUES)
      if (ext === ".pdf" && ["png", "jpg", "jpeg", "webp"].includes(format)) {
        throw new Error("PDF to Image conversion is temporarily disabled on Vercel due to missing system dependencies. Please use local version for this feature.");
      }

      // PDF COMPRESSION
      if (ext === ".pdf" && format === "pdf" && pdfCompress === "true") {
        const pdfDoc = await PDFDocument.load(fs.readFileSync(inputPath));
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        const outputPath = path.join(uploadsDir, `compressed_${Date.now()}.pdf`);
        fs.writeFileSync(outputPath, pdfBytes);
        filesToCleanup.push(outputPath);

        return res.download(outputPath, "compressed.pdf", () => {
          filesToCleanup.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        });
      }

      // IMAGE → IMAGE
      if (isImage) {
        let sharpInstance = sharp(inputPath);

        // CROP
        if (cropX && cropY && cropW && cropH) {
          sharpInstance = sharpInstance.extract({
            left: Math.max(0, parseInt(cropX)),
            top: Math.max(0, parseInt(cropY)),
            width: parseInt(cropW),
            height: parseInt(cropH)
          });
        }

        // RESIZE
        if (width || height) {
          sharpInstance = sharpInstance.resize({
            width: width ? parseInt(width) : null,
            height: height ? parseInt(height) : null,
            fit: 'inside'
          });
        }

        const target = targetSize ? parseInt(targetSize) : null;
        const outputPath = path.join(uploadsDir, `output_${Date.now()}.${format}`);
        filesToCleanup.push(outputPath);

        if (target) {
          let buffer;
          let currentQuality = quality ? parseInt(quality) : 80;
          let scaleFactor = 1.0;
          let attempts = 0;

          while (attempts < 10) {
            let instance = sharpInstance.clone();
            if (scaleFactor < 1.0) {
              const meta = await sharpInstance.metadata();
              instance = instance.resize({ width: Math.round((meta.width || 1000) * scaleFactor), withoutEnlargement: true });
            }

            buffer = await instance
              .toFormat(format === "jpg" ? "jpeg" : format, { quality: currentQuality })
              .toBuffer();

            if (buffer.length <= target) break;
            if (currentQuality > 20) currentQuality -= 15;
            else { scaleFactor *= 0.7; currentQuality = 60; }
            attempts++;
          }
          fs.writeFileSync(outputPath, buffer);
        } else {
          await sharpInstance
            .toFormat(format === "jpg" ? "jpeg" : format, { quality: quality ? parseInt(quality) : 80 })
            .toFile(outputPath);
        }

        return res.download(outputPath, `converted.${format}`, (dErr) => {
          if (dErr) console.error("Download error:", dErr);
          filesToCleanup.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
        });
      }

      res.status(400).json({ error: "Unsupported conversion type" });

    } catch (error) {
      console.error("Processing Error:", error);
      res.status(500).json({ error: "Processing failed: " + error.message });
      filesToCleanup.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
    }
  });
};

export default convertController;
