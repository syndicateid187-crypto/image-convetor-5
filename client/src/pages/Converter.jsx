import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import removeBackground from "@imgly/background-removal";

export default function Converter() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [format, setFormat] = useState("png");
  const [quality, setQuality] = useState(80);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState(null);

  // Advanced Features
  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("KB");
  const [pdfCompress, setPdfCompress] = useState(false);

  // Visual Crop state
  const [showCrop, setShowCrop] = useState(false);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  const [removeBg, setRemoveBg] = useState(false);
  const imgRef = useRef(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
      return;
    }

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (file.type === "application/pdf") {
      setPreviewUrl("pdf-placeholder");
    }
  }, [file]);

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop(
        { unit: '%', width: 90 },
        1,
        width,
        height
      ),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getTargetSizeInBytes = () => {
    if (!targetValue) return null;
    const val = parseFloat(targetValue);
    const units = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    return Math.floor(val * units[targetUnit]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
    }
  };

  const handleConvert = async () => {
    if (!file) return;

    setLoading(true);
    try {
      let fileToUpload = file;

      // CLIENT-SIDE BACKGROUND REMOVAL
      if (removeBg && file.type.startsWith("image/")) {
        try {
          const bgRemovedBlob = await removeBackground(file);
          fileToUpload = new File([bgRemovedBlob], file.name, { type: "image/png" });
        } catch (bgErr) {
          console.error("Background Removal Error:", bgErr);
          alert("Background removal failed. Proceeding without it.");
        }
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("format", format);
      formData.append("quality", quality);
      formData.append("width", width);
      formData.append("height", height);
      formData.append("pdfCompress", pdfCompress);

      const tSize = getTargetSizeInBytes();
      if (tSize) formData.append("targetSize", tSize);

      if (showCrop && completedCrop && imgRef.current) {
        const image = imgRef.current;
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        formData.append("cropX", Math.round(completedCrop.x * scaleX));
        formData.append("cropY", Math.round(completedCrop.y * scaleY));
        formData.append("cropW", Math.round(completedCrop.width * scaleX));
        formData.append("cropH", Math.round(completedCrop.height * scaleY));
      }

      const backendUrl = "/api/convert";
      const res = await axios.post(backendUrl, formData, {
        responseType: "blob"
      });

      const blob = new Blob([res.data]);
      setResult({
        url: window.URL.createObjectURL(blob),
        size: blob.size,
        format
      });
    } catch (err) {
      const errorMsg = err.response ? await err.response.data.text() : err.message;
      alert(`Processing failed: ${errorMsg || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    const link = document.createElement("a");
    link.href = result.url;
    link.download = `smart_pro_${Date.now()}.${result.format}`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-cyan-500/30">
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* LEFT SECTION: Upload & Preview (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.5)]">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            </div>
            <h1 className="text-3xl font-black tracking-tight">SmartConverter <span className="text-cyan-400">Pro</span></h1>
          </div>

          <div
            className={`flex-1 border-2 border-dashed rounded-[2.5rem] p-8 transition-all duration-500 flex flex-col items-center justify-center relative overflow-hidden group
              ${dragActive ? "border-cyan-400 bg-cyan-400/5" : "border-slate-800 bg-slate-900/50 hover:border-slate-700"}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => !file && fileInputRef.current.click()}
          >
            <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { if (e.target.files[0]) { setFile(e.target.files[0]); setResult(null); } }} accept="image/*,.pdf" />

            {!file ? (
              <div className="text-center space-y-4">
                <div className="w-24 h-24 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto transition-transform group-hover:scale-110 duration-500">
                  <svg className="w-12 h-12 text-slate-400 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <p className="text-xl font-bold">Upload Original File</p>
                <p className="text-slate-500 text-sm">Drag and drop or click to browse</p>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center animate-in zoom-in-95 duration-500 overflow-auto max-h-[600px]">
                <div className="relative mb-6">
                  {previewUrl === "pdf-placeholder" ? (
                    <div className="w-48 h-64 bg-slate-800 rounded-2xl flex flex-col items-center justify-center border border-slate-700 shadow-2xl relative">
                      <div className="absolute top-4 left-4 w-8 h-2 bg-red-500 rounded-full opacity-50"></div>
                      <svg className="w-20 h-20 text-red-500 mb-4" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2v20h10V2H7zm8 18H9V4h6v16zM11 8h2v2h-2V8zm0 4h2v4h-2v-4z" /></svg>
                      <span className="font-black text-slate-500 text-xs">PDF DOCUMENT</span>
                    </div>
                  ) : (
                    showCrop ? (
                      <ReactCrop
                        crop={crop}
                        onChange={(c) => setCrop(c)}
                        onComplete={(c) => setCompletedCrop(c)}
                      >
                        <img
                          ref={imgRef}
                          src={previewUrl}
                          onLoad={onImageLoad}
                          className="max-h-[400px] w-auto rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] border border-slate-800"
                          alt="Preview"
                        />
                      </ReactCrop>
                    ) : (
                      <img src={previewUrl} className="max-h-[400px] w-auto rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] border border-slate-800" alt="Preview" />
                    )
                  )}
                  {!showCrop && previewUrl !== "pdf-placeholder" && (
                    <div className="absolute inset-0 border-2 border-transparent hover:border-cyan-400 border-dashed rounded-3xl pointer-events-none transition-colors"></div>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 justify-center">
                  <div className="bg-slate-800/80 backdrop-blur-md px-5 py-2 rounded-2xl border border-slate-700">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">FILENAME</p>
                    <p className="text-sm font-bold truncate max-w-[200px] text-cyan-100">{file.name}</p>
                  </div>
                  <div className="bg-slate-800/80 backdrop-blur-md px-5 py-2 rounded-2xl border border-slate-700">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">ORIGINAL SIZE</p>
                    <p className="text-sm font-bold text-cyan-400">{formatSize(file.size)}</p>
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null); }} className="mt-4 text-slate-500 hover:text-red-400 text-[10px] font-black uppercase tracking-widest">Change File</button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SECTION: Advanced Controls (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 flex flex-col space-y-8 h-fit">
          <div className="space-y-6">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-cyan-500">Processing Engine</h2>

            {/* Format Selection */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-3 block">Conversion Format</label>
              <div className="grid grid-cols-4 gap-2">
                {["png", "jpg", "webp", "pdf"].map((fmt) => (
                  <button key={fmt} onClick={() => setFormat(fmt)} className={`py-3 rounded-xl text-xs font-black transition-all ${format === fmt ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)]" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Tools */}
            {file && file.type.startsWith("image/") && (
              <div className="space-y-4">
                <button
                  onClick={() => setRemoveBg(!removeBg)}
                  className={`w-full py-3 rounded-xl text-xs font-black border transition-all flex items-center justify-center gap-2 ${removeBg ? "border-purple-500 bg-purple-500/10 text-purple-400Shadow-[0_0_15px_rgba(168,85,247,0.3)]" : "border-slate-800 text-slate-500 hover:border-slate-700"}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11l-7-7-7 7m14 0v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8m14 0l-7 7-7-7" /></svg>
                  {removeBg ? "REMOVE BG ENABLED" : "REMOVE BACKGROUND (AI)"}
                </button>

                <button onClick={() => setShowCrop(!showCrop)} className={`w-full py-3 rounded-xl text-xs font-black border transition-all ${showCrop ? "border-cyan-500 bg-cyan-500/10 text-cyan-400" : "border-slate-800 text-slate-500 hover:border-slate-700"}`}>
                  {showCrop ? "FINISH CROPPING" : "START VISUAL CROP"}
                </button>
                {showCrop && (
                  <p className="text-[10px] text-cyan-500/70 text-center font-bold">Drag the box on the image to select area</p>
                )}
              </div>
            )}

            {/* Manual Size Compression & Quality */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-400 uppercase">Compression Quality ({quality}%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    className="w-16 bg-slate-950 border border-slate-800 rounded-lg p-1 text-center text-xs font-black text-cyan-400 outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] font-bold text-slate-600">%</span>
                </div>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />

              <label className="text-[10px] font-black text-slate-400 uppercase block mt-4">Manual Size Target (Limit)</label>
              <div className="flex gap-2">
                <input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="Limit (e.g. 500)" className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-cyan-500 outline-none transition-all" />
                <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 text-xs font-bold outline-none">
                  <option>B</option>
                  <option>KB</option>
                  <option>MB</option>
                </select>
              </div>
              <p className="text-[9px] text-slate-600 italic leading-relaxed">System will auto-adjust quality iteratively to reach this target size.</p>
            </div>

            {/* PDF Compression Toggle */}
            {format === "pdf" && (
              <div className="flex items-center justify-between bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20">
                <div>
                  <h3 className="text-sm font-bold text-emerald-100">Optimize PDF</h3>
                  <p className="text-[10px] text-slate-500">Reduce internal structure size</p>
                </div>
                <button onClick={() => setPdfCompress(!pdfCompress)} className={`w-12 h-6 rounded-full transition-colors relative ${pdfCompress ? "bg-emerald-500" : "bg-slate-700"}`}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${pdfCompress ? "left-7" : "left-1"}`}></div>
                </button>
              </div>
            )}
          </div>

          {!result ? (
            <button
              onClick={handleConvert}
              disabled={!file || loading}
              className={`w-full py-5 rounded-[1.25rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all duration-500
                ${!file || loading ? "bg-slate-800 text-slate-600" : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:scale-[1.02] active:scale-95 shadow-cyan-500/20 hover:shadow-cyan-500/40"}`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Processing...
                </div>
              ) : "Ignite Conversion"}
            </button>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-700">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-3xl flex items-center justify-between">
                <div>
                  <label className="text-[9px] font-black text-emerald-500 uppercase tracking-widest block mb-1">DOWNLOAD SIZE</label>
                  <p className="text-xl font-black text-emerald-400">{formatSize(result.size)}</p>
                </div>
                <div className="bg-emerald-500/20 px-3 py-1 rounded-full">
                  <span className="text-[10px] font-bold text-emerald-400">-{Math.round(((file.size - result.size) / file.size) * 100)}%</span>
                </div>
              </div>
              <button onClick={downloadResult} className="w-full py-5 bg-white text-black rounded-[1.25rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-emerald-50 transition-colors shadow-2xl">
                Save Result
              </button>
              <button onClick={() => { setFile(null); setResult(null); }} className="w-full text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-slate-300 transition-colors">START NEW TASK</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
