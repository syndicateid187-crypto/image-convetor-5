import React, { useState, useRef, useEffect, useMemo } from "react";
import axios from "axios";
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "tsparticles-slim";

// Refined Particle Background with v3 Init
const PremiumBackground = () => {
  const [init, setInit] = useState(false);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  const options = useMemo(() => ({
    background: { color: { value: "transparent" } },
    fpsLimit: 120,
    particles: {
      number: { value: 80, density: { enable: true, area: 1000 } },
      color: { value: ["#a78bfa", "#c084fc", "#60a5fa", "#ffffff"] },
      links: { enable: true, distance: 180, opacity: 0.2, color: "#8b5cf6", width: 0.5 },
      move: { enable: true, speed: 0.4, direction: "none", random: true, straight: false, outModes: { default: "out" } },
      size: { value: { min: 0.5, max: 2.5 } },
      opacity: { value: { min: 0.2, max: 0.7 } },
      shape: { type: "circle" }
    },
    interactivity: {
      events: { onHover: { enable: true, mode: "grab" }, onClick: { enable: true, mode: "push" } },
      modes: { grab: { distance: 250, links: { opacity: 0.4 } }, push: { quantity: 3 } }
    },
    detectRetina: true
  }), []);

  if (!init) return null;
  return <Particles id="tsparticles" className="fixed inset-0 -z-10" options={options} />;
};

export default function Converter() {
  const [files, setFiles] = useState([]);
  const [format, setFormat] = useState("png");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState(null);

  const [targetValue, setTargetValue] = useState("");
  const [targetUnit, setTargetUnit] = useState("KB");

  const [showCrop, setShowCrop] = useState(false);
  const [activeCropIndex, setActiveCropIndex] = useState(0);
  const [fileCrops, setFileCrops] = useState({});

  const imgRef = useRef(null);
  const fileInputRef = useRef(null);
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const newPreviews = files.map(file => {
      if (file.type.startsWith("image/")) {
        return { url: URL.createObjectURL(file), name: file.name, size: file.size, type: file.type };
      }
      return { url: "pdf-placeholder", name: file.name, size: file.size, type: file.type };
    });
    setPreviews(newPreviews);
    return () => {
      newPreviews.forEach(p => { if (p.url !== "pdf-placeholder") URL.revokeObjectURL(p.url); });
    };
  }, [files]);

  const onImageLoad = (e) => {
    const { width: imgW, height: imgH } = e.currentTarget;
    const initialCrop = centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, imgW, imgH), imgW, imgH);
    if (!fileCrops[activeCropIndex]) {
      setFileCrops(prev => ({ ...prev, [activeCropIndex]: { crop: initialCrop, completedCrop: null } }));
    }
  };

  const handleCropChange = (c) => {
    setFileCrops(prev => ({ ...prev, [activeCropIndex]: { ...prev[activeCropIndex], crop: c } }));
  };

  const handleCropComplete = (c) => {
    if (imgRef.current) {
      const image = imgRef.current;
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      setFileCrops(prev => ({
        ...prev,
        [activeCropIndex]: {
          ...prev[activeCropIndex],
          completedCrop: {
            x: Math.round(c.x * scaleX),
            y: Math.round(c.y * scaleY),
            width: Math.round(c.width * scaleX),
            height: Math.round(c.height * scaleY)
          }
        }
      }));
    }
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
    return Math.floor(val * (units[targetUnit] || 1024));
  };

  const handleFiles = (newFiles) => {
    const validFiles = Array.from(newFiles).filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
    setFiles(prev => [...prev, ...validFiles]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = ""; // Allow duplicate uploads
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setFileCrops(prev => {
      const n = { ...prev };
      delete n[index];
      return n;
    });
    if (files.length === 1) setShowCrop(false);
  };

  const handleConvert = async () => {
    if (files.length === 0) return;
    setLoading(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      formData.append("format", format);
      formData.append("width", width);
      formData.append("height", height);
      const computedTargetSize = getTargetSizeInBytes();
      if (computedTargetSize) formData.append("targetSize", computedTargetSize);
      const cropsData = {};
      Object.entries(fileCrops).forEach(([idx, data]) => {
        if (data.completedCrop) cropsData[idx] = data.completedCrop;
      });
      if (Object.keys(cropsData).length > 0) formData.append("crops", JSON.stringify(cropsData));
      const res = await axios.post("/api/convert", formData, { responseType: "blob" });
      const blob = new Blob([res.data]);
      setResult({
        url: window.URL.createObjectURL(blob),
        size: blob.size,
        format: files.length > 1 ? "zip" : format
      });
    } catch (err) {
      console.error("Conversion Error:", err);
      if (err.response && err.response.data instanceof Blob) {
        // If the error response is a blob, we need to read it as text
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const errorData = JSON.parse(reader.result);
            alert(`Conversion failed: ${errorData.error || "Unknown server error"}`);
          } catch (e) {
            alert("Processing failed. Please check your network or try a smaller batch.");
          }
        };
        reader.readAsText(err.response.data);
      } else {
        alert("Processing failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white font-sans selection:bg-indigo-500/30 overflow-x-hidden relative">
      <PremiumBackground />

      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10 transition-all duration-1000">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)]">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
            <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 tracking-tighter">Converter<span className="text-white">Pro</span></h1>
          </div>
          <div className="glass px-6 py-2 text-xs font-bold border-white/5 opacity-60 uppercase tracking-widest">1GB Batch Processing Enabled</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* MAIN UPLOAD ZONE */}
          <div className="lg:col-span-8">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => files.length === 0 && fileInputRef.current.click()}
              className={`glass min-h-[500px] flex flex-col p-8 transition-all duration-700 cursor-pointer group ${dragActive ? 'scale-[0.98] border-indigo-400 bg-indigo-400/5' : 'hover:bg-white/[0.015] border-white/5'}`}
            >
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(e) => handleFiles(e.target.files)} accept="image/*,.pdf" />

              {files.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-10">
                  <div className="relative">
                    <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-20 -z-10 animate-pulse"></div>
                    <div className="w-36 h-36 bg-white/5 rounded-[3rem] flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-all duration-700 border border-white/10 shadow-2xl">
                      <svg className="w-16 h-16 text-indigo-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h2 className="text-3xl font-black tracking-tight">Drop your files here</h2>
                    <p className="text-slate-400/80 text-sm font-medium">Support images and PDFs up to 1GB</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in zoom-in duration-700">
                  {previews.map((preview, idx) => (
                    <div key={idx} className={`glass group/item relative overflow-hidden aspect-square border-white/10 hover:border-white/20 transition-all ${showCrop && activeCropIndex === idx ? 'ring-2 ring-indigo-500/50' : ''}`}>
                      <div className="w-full h-full flex items-center justify-center p-3 relative overflow-hidden">
                        {preview.url === "pdf-placeholder" ? (
                          <div className="flex flex-col items-center opacity-40 group-hover/item:opacity-80 transition-opacity"><svg className="w-14 h-14 text-red-500/60" fill="currentColor" viewBox="0 0 24 24"><path d="M7 2v20h10V2H7zm8 18H9V4h6v16zM11 8h2v2h-2V8zm0 4h2v4h-2v-4z" /></svg><span className="text-[10px] mt-2 font-black tracking-widest">PDF</span></div>
                        ) : (
                          showCrop && activeCropIndex === idx ? (
                            <div className="w-full h-full flex items-center justify-center p-1">
                              <ReactCrop crop={fileCrops[idx]?.crop} onChange={handleCropChange} onComplete={handleCropComplete}>
                                <img ref={imgRef} src={preview.url} onLoad={onImageLoad} className="max-h-full object-contain" alt="Crop" />
                              </ReactCrop>
                            </div>
                          ) : (
                            <img src={preview.url} className="w-full h-full object-cover rounded-xl shadow-lg ring-1 ring-white/5" alt="Preview" />
                          )
                        )}
                      </div>
                      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover/item:opacity-100 transition-all duration-300 transform translate-y-[-10px] group-hover/item:translate-y-0">
                        {preview.url !== "pdf-placeholder" && (
                          <button onClick={(e) => { e.stopPropagation(); setActiveCropIndex(idx); setShowCrop(true); }} className="w-9 h-9 glass flex items-center justify-center hover:bg-indigo-600 transition-all rounded-xl shadow-xl border-white/10" title="Crop">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 16v6h2v-6h6v-2h-6V4h-2v10H4v2h10z" /></svg>
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); removeFile(idx); }} className="w-9 h-9 glass flex items-center justify-center hover:bg-red-600 transition-all rounded-xl shadow-xl border-white/10" title="Remove">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      {fileCrops[idx]?.completedCrop && !showCrop && <div className="absolute bottom-3 left-3 px-2 py-0.5 bg-indigo-500/80 backdrop-blur-md text-[8px] font-black rounded-lg shadow-lg">CROPPED</div>}
                      <div className="absolute bottom-3 right-3 text-[10px] font-black opacity-40 bg-black/40 px-2 py-0.5 rounded-md backdrop-blur-sm pointer-events-none">
                        {formatSize(preview.size)}
                      </div>
                    </div>
                  ))}
                  <button onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }} className="glass flex flex-col items-center justify-center aspect-square border-dashed border-white/10 hover:border-indigo-400 group/add transition-all duration-500 hover:bg-white/[0.01]">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover/add:rotate-90 group-hover/add:bg-indigo-500 group-hover/add:text-white transition-all duration-700">
                      <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                    </div>
                  </button>
                </div>
              )}
            </div>
            {files.length > 0 && (
              <div className="mt-8 flex justify-between items-center px-4">
                <span className="text-[10px] font-black opacity-30 tracking-[0.4em] uppercase">{files.length} Items Indexed</span>
                <button onClick={() => { setFiles([]); setResult(null); setFileCrops({}); }} className="text-[10px] font-extrabold text-red-400/40 hover:text-red-400 transition-colors uppercase tracking-widest">Clear Pipeline</button>
              </div>
            )}
          </div>

          {/* SIDEBAR SETTINGS */}
          <div className="lg:col-span-4 space-y-10">
            <div className="glass p-8 space-y-12 border-white/5 sticky top-12">
              <div className="space-y-8">
                <h3 className="text-xs font-black uppercase tracking-[0.4em] text-indigo-400/80">Global Configuration</h3>

                <div className="space-y-5">
                  <label className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em]">Output Engine</label>
                  <div className="grid grid-cols-4 gap-2">
                    {["png", "jpg", "webp", "pdf"].map((fmt) => (
                      <button key={fmt} onClick={() => setFormat(fmt)} className={`py-4 rounded-xl text-xs font-black transition-all ${format === fmt ? "bg-indigo-600 shadow-[0_0_20px_rgba(99,102,241,0.5)] border-t border-white/20" : "bg-white/5 hover:bg-white/10 border border-white/5"}`}>
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {showCrop && (
                  <div className="p-6 bg-indigo-500/10 border border-indigo-500/20 rounded-[1.5rem] animate-in slide-in-from-right-4 duration-500 shadow-inner">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-black text-indigo-400 uppercase tracking-tighter">Item #{activeCropIndex + 1} Matrix</span>
                      <button onClick={() => setShowCrop(false)} className="px-4 py-1.5 bg-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-500 shadow-xl border-t border-white/10 transition-colors">SAVE</button>
                    </div>
                    <p className="text-[10px] opacity-40 font-medium italic">Define the extraction boundaries manually.</p>
                  </div>
                )}

                <div className="space-y-5">
                  <label className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em]">Data Size Constraint</label>
                  <div className="flex gap-2">
                    <input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="0.00" className="flex-1 glass bg-white/5 border-white/10 p-5 text-sm font-bold focus:border-indigo-500 outline-none transition-all placeholder:opacity-20" />
                    <select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} className="glass bg-slate-900/80 border-white/10 px-5 text-[10px] font-black outline-none appearance-none cursor-pointer hover:bg-slate-800 transition-colors">
                      {["B", "KB", "MB", "GB"].map(u => <option key={u} value={u} className="bg-slate-900">{u}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {!result ? (
                <button
                  onClick={handleConvert}
                  disabled={files.length === 0 || loading}
                  className="w-full premium-button h-20 shadow-2xl relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]"></div>
                  {loading ? (
                    <div className="flex items-center justify-center gap-4">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span className="tracking-[0.2em]">PROCESSING...</span>
                    </div>
                  ) : <span className="tracking-[0.2em]">PROCEED</span>}
                </button>
              ) : (
                <div className="space-y-5 animate-in slide-in-from-bottom-6 duration-700">
                  <div className="glass p-8 border-emerald-500/20 bg-emerald-500/5 shadow-inner">
                    <label className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em] block mb-4">Payload Generated</label>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black tabular-nums">{formatSize(result.size).split(' ')[0]}</span>
                      <span className="text-xs opacity-50 font-black uppercase tracking-widest">{formatSize(result.size).split(' ')[1]}</span>
                    </div>
                  </div>
                  <button onClick={() => { const link = document.createElement("a"); link.href = result.url; link.download = `converted_${Date.now()}.${result.format}`; link.click(); }} className="w-full py-6 bg-white text-black rounded-2xl font-black text-sm uppercase hover:bg-indigo-50 transition-all shadow-2xl flex items-center justify-center gap-4 hover:scale-[1.02] active:scale-95 duration-300 group">
                    <svg className="w-5 h-5 group-hover:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    DOWNLOAD
                  </button>
                  <button onClick={() => { setFiles([]); setResult(null); setFileCrops({}); }} className="w-full text-[9px] font-black opacity-20 hover:opacity-100 tracking-[0.4em] uppercase transition-all mt-4">DESTROY SESSION</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
