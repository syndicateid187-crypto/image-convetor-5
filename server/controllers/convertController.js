import os from 'os';
import multer from 'multer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import pdf from 'pdf-poppler';

const uploadsDir = os.tmpdir();

// No need to ensure uploadsDir exists as it's the system temp dir, 
// but we can check if it's writable if needed.

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
}).single('file');

const convertController = (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

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
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".jfif", ".bmp", ".tiff"].includes(ext);

    try {
      let processedBuffer = isImage ? fs.readFileSync(inputPath) : null;

      // IMAGE → PDF
      if (format === "pdf" && isImage) {
        const pdfDoc = await PDFDocument.create();
        const target = targetSize ? parseInt(targetSize) : null;

        let compressedBuffer;
        if (target) {
          // Use iterative compression for PDF embedding as well
          let currentQuality = quality ? parseInt(quality) : 80;
          let scaleFactor = 1.0;
          let attempts = 0;
          let sharpInstance = sharp(processedBuffer);

          while (attempts < 15) {
            let instance = sharpInstance.clone();
            if (scaleFactor < 1.0) {
              const meta = await sharpInstance.metadata();
              instance = instance.resize({ width: Math.round((meta.width || 1000) * scaleFactor), withoutEnlargement: true });
            }
            compressedBuffer = await instance.jpeg({ quality: currentQuality, mozjpeg: true }).toBuffer();
            if (compressedBuffer.length <= target) break;
            if (currentQuality > 10) currentQuality -= 10;
            else { scaleFactor *= 0.8; currentQuality = 70; }
            attempts++;
          }
        } else {
          compressedBuffer = await sharp(processedBuffer)
            .jpeg({ quality: quality ? parseInt(quality) : 80, mozjpeg: true })
            .toBuffer();
        }

        const image = await pdfDoc.embedJpg(compressedBuffer);
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });

        const pdfBytes = await pdfDoc.save();
        const outputPath = inputPath + ".pdf";
        fs.writeFileSync(outputPath, pdfBytes);

        return res.download(outputPath, "converted.pdf", () => {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        });
      }

      // PDF → IMAGE
      if (ext === ".pdf" && ["png", "jpg", "jpeg", "webp"].includes(format)) {
        try {
          const opts = {
            format: format === "webp" ? "png" : format,
            out_dir: uploadsDir,
            out_prefix: path.basename(inputPath, ".pdf") + "_" + Date.now(),
            page: 1
          };

          await pdf.convert(inputPath, opts);
          let tempOutputPath = path.join(uploadsDir, `${opts.out_prefix}-1.${opts.format}`);

          if (!fs.existsSync(tempOutputPath)) {
            throw new Error("PDF conversion failed: output file not generated. This might be due to missing system dependencies (poppler-utils) on the server.");
          }

          let finalOutputPath = tempOutputPath;
          if (format === "webp") {
            finalOutputPath = tempOutputPath + ".webp";
            await sharp(tempOutputPath).webp().toFile(finalOutputPath);
            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
          }

          return res.download(finalOutputPath, `converted.${format}`, () => {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(finalOutputPath)) fs.unlinkSync(finalOutputPath);
          });
        } catch (pdfErr) {
          console.error("PDF Poppler Error:", pdfErr);
          throw new Error("PDF to Image conversion is not supported in this server environment (requires poppler-utils). Please use another format or tool.");
        }
      }

      // PDF COMPRESSION (Basic Re-save/Optimize)
      if (ext === ".pdf" && format === "pdf" && pdfCompress === "true") {
        const pdfDoc = await PDFDocument.load(fs.readFileSync(inputPath));
        // pdf-lib doesn't have a built-in "compress images" command easily,
        // but re-saving with optimization flags helps a bit.
        const pdfBytes = await pdfDoc.save({ useObjectStreams: false });
        const outputPath = inputPath + "_compressed.pdf";
        fs.writeFileSync(outputPath, pdfBytes);

        return res.download(outputPath, "compressed.pdf", () => {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        });
      }

      // IMAGE → IMAGE (Crop + Resize + Target Size)
      if (isImage) {
        let sharpInstance = sharp(processedBuffer);

        // CROP
        if (cropX && cropY && cropW && cropH) {
          sharpInstance = sharpInstance.extract({
            left: parseInt(cropX),
            top: parseInt(cropY),
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

        const outputPath = inputPath + "_final." + format;
        const target = targetSize ? parseInt(targetSize) : null;

        if (target) {
          let buffer;
          let currentQuality = quality ? parseInt(quality) : 80;
          let scaleFactor = 1.0;
          let attempts = 0;

          // Multi-variable iterative approach: Quality reduction -> Dimension reduction
          while (attempts < 15) {
            let instance = sharpInstance.clone();

            if (scaleFactor < 1.0) {
              const meta = await sharpInstance.metadata();
              instance = instance.resize({
                width: Math.round((meta.width || 1000) * scaleFactor),
                withoutEnlargement: true
              });
            }

            buffer = await instance
              .toFormat(format === "jpg" ? "jpeg" : format, {
                quality: currentQuality,
                mozjpeg: format === "jpg" || format === "jpeg"
              })
              .toBuffer();

            if (buffer.length <= target) break;

            if (currentQuality > 10) {
              currentQuality -= 10;
            } else {
              scaleFactor *= 0.8; // Shrink dimensions by 20%
              currentQuality = 70; // Reset quality for the new smaller size
            }
            attempts++;
          }
          fs.writeFileSync(outputPath, buffer);
        } else {
          await sharpInstance
            .toFormat(format === "jpg" ? "jpeg" : format, {
              quality: quality ? parseInt(quality) : 80,
              mozjpeg: format === "jpg" || format === "jpeg"
            })
            .toFile(outputPath);
        }

        return res.download(outputPath, `converted.${format}`, () => {
          fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        });
      }

      res.status(400).json({ error: "Unsupported operation" });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Processing failed: " + error.message });
    }
  });
};

export default convertController;
