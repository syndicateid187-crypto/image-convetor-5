import os from 'os';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
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
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit per file
}).array('files', 10);

const convertController = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({ error: "Upload failed: " + err.message });
    }

    console.log(`Received ${req.files ? req.files.length : 0} files for conversion to ${req.body.format}`);

    if (!req.files || req.files.length === 0) {
      console.warn("No files in request body");
      return res.status(400).json({ error: "No files uploaded" });
    }

    const {
      format = 'png',
      width,
      height,
      cropX,
      cropY,
      cropW,
      cropH,
      crops,
      targetSize
    } = req.body;

    let parsedCrops = {};
    if (crops) {
      try {
        parsedCrops = JSON.parse(crops);
      } catch (e) {
        console.error("Crops Parse Error:", e);
      }
    }

    const processedFiles = [];
    const cleanupFiles = [];

    try {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const inputPath = file.path;
        cleanupFiles.push(inputPath);

        try {
          const originalName = file.originalname;
          const ext = path.extname(originalName).toLowerCase();
          const isImage = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".jfif", ".bmp", ".tiff"].includes(ext);

          let finalBuffer;
          let finalFormat = format;

          // IMAGE PROCESSING (Extraction & Resize)
          console.log(`Processing file ${i}: ${originalName} (${ext})`);
          let sharpInstance = null;
          if (isImage) {
            console.log(`- Start Sharp instance for ${inputPath}`);
            sharpInstance = sharp(inputPath);
            console.log(`- Fetching metadata...`);
            const meta = await sharpInstance.metadata();
            console.log(`- Metadata fetched: ${meta.width}x${meta.height}`);

            // Apply CROP
            const indCrop = parsedCrops[i];
            if (indCrop && indCrop.width > 0 && indCrop.height > 0) {
              const left = Math.max(0, Math.min(Math.round(indCrop.x) || 0, (meta.width || 1) - 1));
              const top = Math.max(0, Math.min(Math.round(indCrop.y) || 0, (meta.height || 1) - 1));
              const extractWidth = Math.min(Math.round(indCrop.width), (meta.width || 0) - left);
              const extractHeight = Math.min(Math.round(indCrop.height), (meta.height || 0) - top);

              if (extractWidth > 0 && extractHeight > 0) {
                sharpInstance = sharpInstance.extract({ left, top, width: extractWidth, height: extractHeight });
              }
            } else if (i === 0) {
              const cx = parseInt(cropX);
              const cy = parseInt(cropY);
              const cw = parseInt(cropW);
              const ch = parseInt(cropH);
              if (!isNaN(cx) && !isNaN(cy) && !isNaN(cw) && !isNaN(ch)) {
                sharpInstance = sharpInstance.extract({
                  left: Math.max(0, Math.min(cx, (meta.width || 1) - 1)),
                  top: Math.max(0, Math.min(cy, (meta.height || 1) - 1)),
                  width: Math.min(cw, (meta.width || 0) - cx),
                  height: Math.min(ch, (meta.height || 0) - cy)
                });
              }
            }

            // RESIZE
            const targetW = parseInt(width);
            const targetH = parseInt(height);
            if (!isNaN(targetW) || !isNaN(targetH)) {
              sharpInstance = sharpInstance.resize({
                width: isNaN(targetW) ? null : targetW,
                height: isNaN(targetH) ? null : targetH,
                fit: 'inside'
              });
            }
          }

          // FORMAT SPECIFIC LOGIC
          if (format === "pdf" && isImage) {
            const pdfDoc = await PDFDocument.create();
            const targetBytes = parseInt(targetSize);

            let imageBuffer;
            if (!isNaN(targetBytes) && targetBytes > 0) {
              // Iterative compression for PDF embedding
              let currentQuality = 80;
              let scaleFactor = 1.0;
              let attempts = 0;
              while (attempts < 8) {
                let instance = sharpInstance.clone();
                if (scaleFactor < 1.0) {
                  const m = await instance.metadata();
                  instance = instance.resize({ width: Math.round((m.width || 1000) * scaleFactor), withoutEnlargement: true });
                }
                const buf = await instance.toFormat('jpeg', { quality: currentQuality }).toBuffer();
                imageBuffer = buf;
                // Since PDF adds some overhead, aim for slightly less than target
                if (buf.length <= (targetBytes * 0.9)) break;
                if (currentQuality > 20) currentQuality -= 15;
                else { scaleFactor *= 0.7; currentQuality = 60; }
                attempts++;
              }
            } else {
              imageBuffer = await sharpInstance.toFormat('jpeg', { quality: 90 }).toBuffer();
            }

            const image = await pdfDoc.embedJpg(imageBuffer);
            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            finalBuffer = Buffer.from(await pdfDoc.save());
          }
          else if (isImage) {
            const targetBytes = parseInt(targetSize);
            console.log(`- Target Size: ${targetBytes ? targetBytes + ' bytes' : 'None'}`);

            if (!isNaN(targetBytes) && targetBytes > 0) {
              // Iterative compression to match target size
              let currentQuality = 90;
              let scaleFactor = 1.0;
              let attempts = 0;
              let lastGoodBuffer = null;
              const maxAttempts = 15;

              while (attempts < maxAttempts) {
                let instance = sharpInstance.clone();
                if (scaleFactor < 1.0) {
                  const m = await instance.metadata();
                  instance = instance.resize({
                    width: Math.round((m.width || 1000) * scaleFactor),
                    withoutEnlargement: true
                  });
                }

                let outputOptions = { quality: Math.max(5, currentQuality) };
                if (format === 'png') {
                  // For PNG, use palette-based compression for significant size reduction
                  outputOptions = {
                    compressionLevel: 9,
                    palette: true,
                    colors: Math.max(16, Math.round(256 * (currentQuality / 100)))
                  };
                } else if (format === 'webp') {
                  outputOptions.quality = Math.max(5, currentQuality);
                  outputOptions.effort = 6; // Better compression
                }

                const buf = await instance
                  .toFormat(format === "jpg" ? "jpeg" : format, outputOptions)
                  .toBuffer();

                lastGoodBuffer = buf;
                console.log(`  - Attempt ${attempts}: Quality/Colors ~${currentQuality}, Scale ${scaleFactor.toFixed(2)}, Size ${buf.length} bytes`);

                if (buf.length <= targetBytes) break;

                // Be more aggressive if we are far from target
                const sizeRatio = buf.length / targetBytes;
                if (sizeRatio > 5) {
                  scaleFactor *= 0.5; // Drastic scale reduction
                } else if (sizeRatio > 2) {
                  scaleFactor *= 0.7; // Moderate scale reduction
                  currentQuality = Math.max(10, currentQuality - 20);
                } else if (currentQuality > 10) {
                  currentQuality -= 15;
                } else {
                  scaleFactor *= 0.8;
                  currentQuality = 50;
                }
                attempts++;
              }
              finalBuffer = lastGoodBuffer;
            } else {
              // Default conversion without size constraint
              console.log(`- Converting to format: ${format} (Default quality)`);
              finalBuffer = await sharpInstance
                .toFormat(format === "jpg" ? "jpeg" : format, { quality: 90 })
                .toBuffer();
              console.log(`- Buffer generated: ${finalBuffer.length} bytes`);
            }
          }

          if (finalBuffer) {
            processedFiles.push({
              buffer: finalBuffer,
              name: `${path.parse(originalName).name}.${finalFormat}`
            });
          }
        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
        }
      }

      cleanupFiles.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });

      if (processedFiles.length === 0) {
        return res.status(400).json({ error: "Processing failed for all files" });
      }

      if (processedFiles.length === 1) {
        const file = processedFiles[0];
        console.log(`- Sending single file: ${file.name}, Size: ${file.buffer.length} bytes`);
        res.set({
          'Content-Type': file.name.endsWith('.pdf') ? 'application/pdf' : `image/${format === 'jpg' ? 'jpeg' : format}`,
          'Content-Disposition': `attachment; filename="${file.name}"`
        });
        return res.send(file.buffer);
      } else {
        console.log(`- Sending ZIP archive with ${processedFiles.length} files`);
        const archive = archiver('zip', { zlib: { level: 9 } });
        res.set({
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="converted_files_${Date.now()}.zip"`
        });
        archive.pipe(res);
        processedFiles.forEach(f => archive.append(f.buffer, { name: f.name }));
        archive.finalize();
      }

    } catch (error) {
      console.error("Batch Processing Error:", error);
      cleanupFiles.forEach(p => { if (fs.existsSync(p)) fs.unlinkSync(p); });
      res.status(500).json({ error: "Internal Server Error: " + error.message });
    }
  });
};

export default convertController;
