// v6 - single upload button + mic input
import { useState, useRef } from "react";
import { Camera, ArrowLeft, Check, Plus, Minus, Home, X, FileImage, Images, Share2, Mic, RefreshCw } from "lucide-react";

const formatCLP = (n) => "$" + Math.round(n).toLocaleString("es-CL");

export default function App() {
  const [step, setStep] = useState("upload");
  const [imageFiles, setImageFiles] = useState([]);
  const [userDescription, setUserDescription] = useState("");
  const [billData, setBillData] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [splitOpen, setSplitOpen] = useState({});
  const [tipPercentage, setTipPercentage] = useState(10);
  const [customTip, setCustomTip] = useState("");
  const [globalSplit, setGlobalSplit] = useState(1);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [shareStatus, setShareStatus] = useState(null);
  const [shareText, setShareText] = useState(null);
  const [showImageSheet, setShowImageSheet] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micLocked, setMicLocked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const micStartYRef = useRef(null);

  const speechSupported = typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startSpeech = () => {
    if (!speechSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    // Use device language, fallback to es-CL
    rec.lang = navigator.language || "es-CL";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (ev) => {
      const transcript = Array.from(ev.results)
        .map(r => r[0].transcript).join(" ").trim();
      if (transcript) setUserDescription((prev) => prev ? prev + " " + transcript : transcript);
    };
    rec.onerror = () => { setIsListening(false); setMicLocked(false); };
    rec.onend = () => { setIsListening(false); };
    recognitionRef.current = rec;
    rec.start();
  };

  const stopSpeech = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setMicLocked(false);
  };

  const handleMicDown = (e) => {
    e.preventDefault();
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    micStartYRef.current = y;
    startSpeech();
  };

  const handleMicMove = (e) => {
    if (!isListening || micLocked) return;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    if (micStartYRef.current - y > 60) {
      // Slid up enough — lock
      setMicLocked(true);
    }
  };

  const handleMicUp = (e) => {
    e.preventDefault();
    if (micLocked) return; // locked = don't stop on release
    stopSpeech();
  };

  const sendLockedMic = () => {
    stopSpeech();
  };

  const getItemContribution = (item, sel) =>
    (item.unitPrice * sel.qty) / (sel.splitBy || 1);

  // ── image management ──────────────────────────────────────────────────────────
  const addImages = (files) => {
    if (!files?.length) return;
    setImageFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const newOnes = Array.from(files).filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...newOnes];
    });
    setError(null);
  };

  const removeImage = (idx) => {
    setImageFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setUserDescription("");
      return next;
    });
  };

  // ── analyze ───────────────────────────────────────────────────────────────────
  const analyzeImages = async () => {
    if (!imageFiles.length) return;
    setAnalyzing(true);
    setError(null);

    try {
      // Convert all images to base64
      const images = await Promise.all(
        imageFiles.map(async (file) => {
          const base64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(",")[1]);
            r.onerror = rej;
            r.readAsDataURL(file);
          });
          return { mediaType: file.type || "image/jpeg", data: base64 };
        })
      );

      const hasDesc = userDescription.trim().length > 0;
      const descSection = hasDesc ? `\n\nADEMÁS el usuario describió lo que consumió: "${userDescription.trim()}"
Usando esa descripción, completa el campo "mySelection" de cada ítem con tu mejor interpretación:
- "qty": cuántas unidades consumió el usuario de ese ítem (0 si no lo consumió)
- "splitBy": entre cuántos se divide ese ítem (1 = lo paga solo, 2 = entre dos, etc.)
Interpreta sinónimos, genéricos y fracciones en lenguaje natural. Ejemplos:
- "un schop" puede ser "Cerveza Austral 500cc" o similar
- "una bebida" puede ser cualquier bebida — elige la más probable
- "papas a medias" → qty:1, splitBy:2
- "unas papas entre 3" → qty:1, splitBy:3
Si hay ambigüedad (ej: "una bebida" con 3 opciones), elige la más probable y ponla con qty:1.
Si no hay descripción o no puedes inferir, deja qty:0.` : "";

      const multiHint = imageFiles.length > 1
        ? `\nSon ${imageFiles.length} fotos de la MISMA boleta. Combina todos los ítems en un solo JSON unificado, sin duplicar ítems que aparezcan en más de una foto.`
        : "";

      const prompt = `Analiza esta boleta de restaurante. Responde SOLO con JSON exacto, sin backticks ni texto adicional.${multiHint}

{
  "restaurant": "nombre o null",
  "items": [
    {
      "name": string,
      "qty": int,
      "unitPrice": int,
      "subtotal": int,
      "mySelection": { "qty": int, "splitBy": int }
    }
  ],
  "consumoTotal": int,
  "tipPct": int|null,
  "tipAmount": int|null,
  "grandTotal": int|null
}

Reglas:
- Precios en CLP, enteros sin separadores ni símbolos
- Si qty > 1: unitPrice = subtotal / qty (redondea)
- Extrae TODOS los ítems sin excepción
- consumoTotal = suma de todos los subtotales
- mySelection.qty por defecto: igual al qty del ítem (pre-seleccionar todo)
- mySelection.splitBy por defecto: 1${descSection}`;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, prompt }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      const text = data.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/gi, "").trim());

      setBillData(parsed);

      // Build selection directly from AI's mySelection field
      const initialSel = {};
      parsed.items.forEach((item, i) => {
        const sel = item.mySelection || { qty: item.qty, splitBy: 1 };
        if (sel.qty > 0) {
          initialSel[i] = {
            qty: Math.min(sel.qty, item.qty),
            splitBy: Math.max(1, sel.splitBy || 1)
          };
        }
      });

      setSelectedItems(initialSel);
      setSplitOpen({});
      setGlobalSplit(1);
      if (parsed.tipPct) { setTipPercentage(parsed.tipPct); setCustomTip(""); }
      setStep("selection");
    } catch (err) {
      console.error("[Splitr] analyze error:", err);
      setError(err.message);
      setToast(true);
      setTimeout(() => setToast(false), 4000);
    } finally {
      setAnalyzing(false);
    }
  };

  // ── item controls ─────────────────────────────────────────────────────────────
  const toggleItem = (i) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      else next[i] = { qty: 1, splitBy: 1 };
      return next;
    });
    setSplitOpen((prev) => ({ ...prev, [i]: false }));
  };

  const updateQty = (i, delta) => {
    const maxQty = billData.items[i].qty;
    setSelectedItems((prev) => {
      const cur = prev[i]?.qty || 0;
      const nxt = Math.max(0, Math.min(maxQty, cur + delta));
      const updated = { ...prev };
      if (nxt === 0) { delete updated[i]; setSplitOpen((s) => ({ ...s, [i]: false })); }
      else updated[i] = { qty: nxt, splitBy: prev[i]?.splitBy || 1 };
      return updated;
    });
  };

  const updateSplit = (i, value) => {
    const splitBy = Math.max(1, parseInt(value) || 1);
    setSelectedItems((prev) => ({ ...prev, [i]: { ...prev[i], splitBy } }));
  };

  const toggleSplit = (i, e) => {
    e.stopPropagation();
    if (!selectedItems[i]) return;
    setSplitOpen((prev) => ({ ...prev, [i]: !prev[i] }));
  };

  // ── select all ────────────────────────────────────────────────────────────────
  const selectedCount = Object.keys(selectedItems).length;
  const totalItems = billData?.items?.length || 0;
  const allSelected = selectedCount === totalItems && totalItems > 0;

  const handleSelectAllToggle = () => {
    if (allSelected) { setSelectedItems({}); setSplitOpen({}); }
    else {
      const all = {};
      billData.items.forEach((item, i) => { all[i] = { qty: item.qty, splitBy: 1 }; });
      setSelectedItems(all);
    }
  };

  // ── totals ────────────────────────────────────────────────────────────────────
  const activeTipPct = customTip ? parseInt(customTip) || 0 : tipPercentage;
  const mySubtotalBeforeGlobal = billData
    ? Object.entries(selectedItems).reduce((s, [i, sel]) =>
        s + getItemContribution(billData.items[+i], sel), 0)
    : 0;
  const mySubtotal = mySubtotalBeforeGlobal / (globalSplit || 1);
  const myTip = Math.round(mySubtotal * activeTipPct / 100);
  const myTotal = mySubtotal + myTip;

  const buildShareText = () => {
    const restaurant = billData?.restaurant ? `📍 ${billData.restaurant}\n` : "";
    const itemLines = Object.entries(selectedItems).map(([i, sel]) => {
      const item = billData.items[+i];
      const perItem = getItemContribution(item, sel);
      const final = perItem / (globalSplit || 1);
      let detail = "";
      if (item.qty > 1 && sel.qty < item.qty) detail = ` (${sel.qty} de ${item.qty} u.)`;
      else if (sel.qty > 1) detail = ` ${sel.qty}×`;
      const splitNote = sel.splitBy > 1 ? ` ÷${sel.splitBy}` : "";
      const globalNote = globalSplit > 1 ? ` ÷${globalSplit} global` : "";
      return `• ${item.name}${detail}${splitNote}${globalNote} → ${formatCLP(final)}`;
    }).join("\n");

    return [
      `🧾 *Splitr*`,
      restaurant,
      `*Tus ítems:*`,
      itemLines,
      ``,
      `Subtotal: ${formatCLP(mySubtotal)}`,
      `Propina ${activeTipPct}%: ${formatCLP(myTip)}`,
      `━━━━━━━━━━━━`,
      `*Total a pagar: ${formatCLP(myTotal)}*`,
    ].join("\n");
  };

  const handleShare = async () => {
    const text = buildShareText();
    if (navigator.share) {
      try { await navigator.share({ text }); } catch (_) { /* cancelled */ }
    } else {
      // Fallback: try clipboard, otherwise show text in UI
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus("copied");
        setTimeout(() => setShareStatus(null), 2500);
      } catch (_) {
        setShareText(text);
      }
    }
  };

  const resetApp = () => {
    setStep("upload"); setImageFiles([]); setUserDescription(""); setBillData(null);
    setSelectedItems({}); setSplitOpen({}); setTipPercentage(10); setCustomTip("");
    setGlobalSplit(1); setError(null); setAnalyzing(false); setShareStatus(null);
    setShareText(null); setShowImageSheet(false); setIsListening(false); setMicLocked(false);
    setShowResetModal(false);
  };

  const handleBackFromSelection = () => {
    if (billData) setShowResetModal(true);
    else setStep("upload");
  };

  // ── item controls component ───────────────────────────────────────────────────
  const ItemControls = ({ i, item }) => {
    const isSel = selectedItems[i] !== undefined;
    const sel = selectedItems[i] || { qty: 0, splitBy: 1 };
    const isSplitOpen = splitOpen[i] || false;
    const hasSplit = sel.splitBy > 1;
    const contribution = isSel ? getItemContribution(item, sel) : null;

    return (
      <div>
        <div className="flex items-center gap-2 px-3.5 pb-3" onClick={(e) => e.stopPropagation()}>
          {/* − qty + */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => updateQty(i, -1)}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors
                ${isSel ? "bg-blue-100 hover:bg-blue-200 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className={`text-sm font-semibold min-w-[3.5rem] text-center
              ${isSel ? "text-blue-700" : "text-gray-400"}`}>
              {sel.qty} de {item.qty}
            </span>
            <button onClick={() => updateQty(i, 1)}
              disabled={isSel && sel.qty >= item.qty}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors
                ${isSel ? "bg-blue-100 hover:bg-blue-200 disabled:opacity-30 text-blue-700" : "bg-gray-100 text-gray-400"}`}>
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Split chip */}
          <button onClick={(e) => toggleSplit(i, e)} disabled={!isSel}
            className={`ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all
              ${!isSel
                ? "bg-gray-50 text-gray-300 border border-gray-100 cursor-default"
                : hasSplit || isSplitOpen
                  ? "bg-amber-100 text-amber-700 border border-amber-300"
                  : "bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200"}`}>
            <span className="text-sm leading-none">÷</span>
            <span>{hasSplit ? sel.splitBy : "dividir"}</span>
          </button>
        </div>

        {/* Split panel */}
        {isSel && isSplitOpen && (
          <div className="mx-3.5 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl"
            onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-amber-800 mb-2">Dividir entre cuántos</p>
            <div className="flex items-center gap-2">
              <button onClick={() => updateSplit(i, (sel.splitBy || 1) - 1)}
                className="w-8 h-8 rounded-full bg-amber-200 hover:bg-amber-300 text-amber-800 flex items-center justify-center font-bold">−</button>
              <div className="flex-1 text-center">
                <span className="text-2xl font-bold text-amber-800">{sel.splitBy || 1}</span>
                <span className="text-sm text-amber-600 ml-1">persona{(sel.splitBy || 1) !== 1 ? "s" : ""}</span>
              </div>
              <button onClick={() => updateSplit(i, (sel.splitBy || 1) + 1)}
                className="w-8 h-8 rounded-full bg-amber-200 hover:bg-amber-300 text-amber-800 flex items-center justify-center font-bold">+</button>
            </div>
            {sel.splitBy > 1 && (
              <p className="text-xs text-amber-600 text-center mt-2">
                Pagas 1/{sel.splitBy} de {sel.qty > 1 ? `${sel.qty} × ` : ""}{formatCLP(item.unitPrice * sel.qty)} = <strong>{formatCLP(contribution)}</strong>
              </p>
            )}
            <div className="flex gap-2 mt-2">
              <button onClick={() => { updateSplit(i, 1); setSplitOpen((p) => ({ ...p, [i]: false })); }}
                className="flex-1 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-lg">
                Sin división
              </button>
              <button onClick={() => setSplitOpen((p) => ({ ...p, [i]: false }))}
                className="flex-1 py-1.5 text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 rounded-lg">
                Listo
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── step indicator ────────────────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="bg-white border-b px-4 py-2.5 sticky top-[60px] z-30">
      <div className="flex items-center justify-center gap-0">
        {["Subir", "Seleccionar", "Resumen"].map((label, i) => {
          const stepMap = ["upload", "selection", "summary"];
          const isActive = step === stepMap[i] || (analyzing && i === 0);
          const isDone = (step === "selection" && i === 0) || (step === "summary" && i <= 1);
          return (
            <div key={i} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${isDone ? "bg-green-500 text-white" : isActive ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                  {isDone ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span className={`text-xs font-medium whitespace-nowrap
                  ${isActive ? "text-blue-600" : isDone ? "text-green-600" : "text-gray-400"}`}>
                  {label}
                </span>
              </div>
              {i < 2 && <div className={`w-8 h-0.5 mx-2 flex-shrink-0 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );

  // trigger mount on next tick
  if (!mounted) setTimeout(() => setMounted(true), 0);

  if (!mounted) return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-blue-600 px-4 py-3 flex items-center justify-center">
        <div className="text-center space-y-1.5">
          <div className="h-5 w-16 bg-blue-500 rounded-md mx-auto animate-pulse" />
          <div className="h-3 w-32 bg-blue-500 rounded-md mx-auto animate-pulse" />
        </div>
      </div>
      <div className="bg-white border-b px-4 py-2.5 flex items-center justify-center gap-2">
        {[8, 16, 12].map((w, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse" />
            <div className={`h-3 w-${w} bg-gray-200 rounded animate-pulse`} />
            {i < 2 && <div className="w-8 h-0.5 mx-1 bg-gray-200" />}
          </div>
        ))}
      </div>
      <div className="max-w-lg mx-auto w-full p-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="w-full h-28 bg-gray-100 rounded-2xl animate-pulse" />
          <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
          <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* HEADER */}
      <div className="bg-blue-600 text-white px-4 py-3 shadow-md flex items-center gap-3 sticky top-0 z-40">
        {(step === "selection" || step === "summary") ? (
          <button
            onClick={() => step === "summary" ? setStep("selection") : handleBackFromSelection()}
            className="p-1.5 rounded-lg hover:bg-blue-500 transition-colors flex-shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : <div className="w-8" />}
        <div className="flex-1 text-center">
          <h1 className="text-lg font-bold tracking-tight leading-none">Splitr</h1>
          <p className="text-xs text-blue-200 mt-0.5">La cuenta, resuelta.</p>
        </div>
        {step === "upload" && billData ? (
          <button onClick={() => setShowResetModal(true)}
            className="p-1.5 rounded-lg hover:bg-blue-500 transition-colors flex-shrink-0 opacity-70 hover:opacity-100">
            <RefreshCw className="w-4 h-4" />
          </button>
        ) : <div className="w-8" />}
      </div>

      <StepIndicator />

      {/* CONTENT */}
      <div className="flex-1 max-w-lg mx-auto w-full p-4 pb-24 space-y-4">

        {/* ── UPLOAD ── */}
        {step === "upload" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">

            <button onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 bg-white hover:bg-blue-50 border-2 border-dashed border-blue-200 hover:border-blue-400 py-7 px-6 rounded-2xl transition-colors">
              <Camera className="w-8 h-8 text-gray-400" />
              <p className="text-gray-500 text-xs text-center leading-relaxed">
                Agrega una boleta desde la<br/>cámara o tu galería
              </p>
            </button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
              onChange={(e) => e.target.files?.[0] && addImages(e.target.files)} className="hidden" />
            <input ref={fileInputRef} type="file" accept="image/*" multiple
              onChange={(e) => addImages(e.target.files)} className="hidden" />

            {/* Image list */}
            {imageFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Images className="w-3.5 h-3.5" />
                  {imageFiles.length} imagen{imageFiles.length > 1 ? "es" : ""}
                  {imageFiles.length > 1 && <span className="text-blue-500 normal-case font-normal">· se analizarán juntas</span>}
                </p>
                {imageFiles.map((file, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-xl p-3 bg-gray-50 flex items-center gap-3">
                    <FileImage className="w-7 h-7 text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button onClick={() => removeImage(idx)}
                      className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Description + WhatsApp-style mic */}
            {imageFiles.length > 0 && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    ¿Qué consumiste? <span className="font-normal text-gray-400">(opcional)</span>
                  </label>

                  {/* Locked mic mode UI */}
                  {micLocked ? (
                    <div className="border-2 border-red-400 bg-red-50 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                      <span className="text-sm text-red-600 font-medium flex-1">Escuchando...</span>
                      <button onClick={sendLockedMic}
                        className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <textarea value={userDescription} onChange={(e) => setUserDescription(e.target.value)}
                        placeholder="Ej: un schop, un completo italiano y unas papas a medias..."
                        className="w-full px-3 py-2.5 pr-12 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                        rows={4} />
                      {/* Mic button — WhatsApp style */}
                      <button
                        onMouseDown={handleMicDown}
                        onMouseUp={handleMicUp}
                        onMouseMove={handleMicMove}
                        onTouchStart={handleMicDown}
                        onTouchEnd={handleMicUp}
                        onTouchMove={handleMicMove}
                        disabled={!speechSupported}
                        className={`absolute right-2 bottom-3 w-6 h-6 rounded-full flex items-center justify-center transition-all select-none
                          ${isListening
                            ? "bg-red-500 text-white shadow-lg scale-125"
                            : speechSupported
                              ? "bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600"
                              : "bg-gray-50 text-gray-300 cursor-not-allowed"}`}>
                        <Mic className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Slide-up hint while pressing */}
                  {isListening && !micLocked && (
                    <p className="text-xs text-center text-red-400 mt-1 animate-pulse">
                      ↑ Desliza arriba para bloquear
                    </p>
                  )}
                </div>

                {billData && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                    <span className="text-amber-500 text-sm mt-0.5">⚠️</span>
                    <p className="text-xs text-amber-800">
                      Ya tienes una boleta analizada. Puedes <strong>volver al paso 2</strong> sin re-analizar o presionar el botón para analizarla nuevamente.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {billData && (
                    <button onClick={() => setStep("selection")}
                      className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-3 rounded-xl font-semibold transition-colors text-sm">
                      Continuar con la boleta anterior →
                    </button>
                  )}
                  <button onClick={analyzeImages} disabled={analyzing}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white py-3.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2">
                    {analyzing
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Analizando {imageFiles.length > 1 ? `${imageFiles.length} fotos` : "boleta"}...</>
                      : `Analizar ${imageFiles.length > 1 ? `${imageFiles.length} fotos` : "boleta"} →`}
                  </button>
                </div>
              </>
            )}

          </div>
        )}

        {/* ── SELECTION ── */}
        {step === "selection" && billData && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Tu consumo</h2>
                  {billData.restaurant && <p className="text-sm text-gray-500 mt-0.5">{billData.restaurant}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Total boleta</p>
                  <p className="font-bold text-gray-900">{formatCLP(billData.consumoTotal)}</p>
                </div>
              </div>

              {/* Select all */}
              <button onClick={handleSelectAllToggle}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all
                  ${allSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300 bg-gray-50"}`}>
                <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center
                  ${allSelected ? "bg-blue-600 border-blue-600" : selectedCount > 0 ? "border-gray-400" : "border-gray-300"}`}>
                  {allSelected ? <Check className="w-3 h-3 text-white" /> : selectedCount > 0 ? <div className="w-2 h-2 rounded-sm bg-gray-400" /> : null}
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
                </span>
                <span className="ml-auto text-xs text-gray-400">{selectedCount}/{totalItems}</span>
              </button>

              {/* Items */}
              <div className="space-y-2">
                {billData.items.map((item, i) => {
                  const isSel = selectedItems[i] !== undefined;
                  const sel = selectedItems[i] || { qty: 0, splitBy: 1 };
                  const contribution = isSel ? getItemContribution(item, sel) : null;
                  return (
                    <div key={i} className={`border-2 rounded-xl transition-all ${isSel ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"}`}>
                      <div className="flex items-start gap-3 p-3.5 cursor-pointer" onClick={() => toggleItem(i)}>
                        <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center
                          ${isSel ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}>
                          {isSel && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <p className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</p>
                            <div className="text-right flex-shrink-0">
                              <p className={`font-bold text-sm ${isSel ? "text-blue-700" : "text-gray-900"}`}>
                                {isSel ? formatCLP(contribution) : formatCLP(item.subtotal)}
                              </p>
                              {isSel && (sel.qty !== item.qty || sel.splitBy > 1) && (
                                <p className="text-xs text-gray-400">de {formatCLP(item.subtotal)}</p>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.qty > 1 ? `${item.qty} × ${formatCLP(item.unitPrice)}` : formatCLP(item.unitPrice)}
                          </p>
                        </div>
                      </div>
                      <ItemControls i={i} item={item} />
                    </div>
                  );
                })}
              </div>

              {/* Tip */}
              <div className="border-t pt-4">
                <p className="font-bold text-gray-900 mb-3 text-sm">Propina</p>
                <div className="flex gap-2 flex-wrap mb-2">
                  {[0, 5, 10, 15].map((pct) => (
                    <button key={pct} onClick={() => { setTipPercentage(pct); setCustomTip(""); }}
                      className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors
                        ${tipPercentage === pct && !customTip ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" value={customTip}
                    onChange={(e) => { setCustomTip(e.target.value); if (e.target.value) setTipPercentage(parseInt(e.target.value) || 0); }}
                    placeholder="Otro %" min="0" max="100"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  <span className="text-gray-500 text-sm">%</span>
                </div>
              </div>
            </div>

            {/* Total card */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-5 shadow-lg space-y-4">
              <h3 className="font-bold text-base">Tu cuenta</h3>

              {/* Global split */}
              <div className="bg-white/15 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Dividir todo entre</p>
                    <p className="text-xs text-blue-200 mt-0.5">
                      {globalSplit > 1 ? `Pagas 1/${globalSplit} del total` : "Solo tú pagas lo seleccionado"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setGlobalSplit((s) => Math.max(1, s - 1))}
                      className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="text-center min-w-[2.5rem]">
                      <span className="text-xl font-bold">{globalSplit}</span>
                      <span className="text-xs text-blue-200 ml-1">p.</span>
                    </div>
                    <button onClick={() => setGlobalSplit((s) => s + 1)}
                      className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {globalSplit > 1 && (
                  <p className="text-xs text-blue-100 text-center bg-white/10 rounded-lg py-1.5 px-3">
                    {formatCLP(mySubtotalBeforeGlobal)} ÷ {globalSplit} = <strong className="text-white">{formatCLP(mySubtotal)}</strong>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-100">Subtotal</span>
                  <span className="font-semibold">{formatCLP(mySubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-100">Propina ({activeTipPct}%)</span>
                  <span className="font-semibold">{formatCLP(myTip)}</span>
                </div>
                <div className="border-t border-blue-400 pt-2 flex justify-between text-lg">
                  <span className="font-bold">Total a pagar</span>
                  <span className="font-bold">{formatCLP(myTotal)}</span>
                </div>
              </div>

              <button onClick={() => setStep("summary")}
                className="w-full bg-white text-blue-600 hover:bg-blue-50 py-3 rounded-xl font-bold transition-colors">
                Ver resumen final →
              </button>
            </div>
          </>
        )}

        {/* ── SUMMARY ── */}
        {step === "summary" && billData && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Resumen final</h2>

            <div className="space-y-3">
              {Object.entries(selectedItems).map(([i, sel]) => {
                const item = billData.items[+i];
                const perItem = getItemContribution(item, sel);
                const final = perItem / (globalSplit || 1);

                // Build contextual detail lines
                const details = [];

                // Line 1: quantity context
                if (item.qty > 1 && sel.qty < item.qty) {
                  details.push(
                    <span key="qty" className="text-gray-500">
                      {sel.qty} de {item.qty} unidades {formatCLP(item.unitPrice)} c/u
                    </span>
                  );
                } else {
                  details.push(
                    <span key="qty" className="text-gray-500">
                      {sel.qty > 1 ? `${sel.qty} × ` : ""}{formatCLP(item.unitPrice * sel.qty)}
                    </span>
                  );
                }

                // Line 2: per-item split — space before ·
                if (sel.splitBy > 1) {
                  details.push(
                    <span key="split" className="text-amber-600 font-medium">
                      {" "}· entre {sel.splitBy} → {formatCLP(perItem)}
                    </span>
                  );
                }

                // Line 3: global split — space before ·
                if (globalSplit > 1) {
                  details.push(
                    <span key="global" className="text-blue-500 font-medium">
                      {" "}· ÷{globalSplit} global
                    </span>
                  );
                }

                return (
                  <div key={i} className="flex justify-between items-start pb-2.5 border-b border-gray-100 last:border-0 gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                      <p className="text-xs mt-0.5 flex items-center gap-0.5 flex-wrap leading-relaxed">
                        {details}
                      </p>
                    </div>
                    <p className="font-bold text-gray-900 text-sm flex-shrink-0">{formatCLP(final)}</p>
                  </div>
                );
              })}
            </div>

            {globalSplit > 1 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 text-center">
                División global activa: ÷{globalSplit} personas
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Subtotal</span>
                <span className="font-semibold text-gray-900">{formatCLP(mySubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Propina ({activeTipPct}%)</span>
                <span className="font-semibold text-gray-900">{formatCLP(myTip)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="font-bold text-gray-900">Total a pagar</span>
                <span className="font-bold text-blue-600 text-xl">{formatCLP(myTotal)}</span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-400">Total completo de la boleta</p>
                <p className="text-sm font-semibold text-gray-700">
                  {formatCLP(billData.grandTotal || billData.consumoTotal)}
                </p>
              </div>
              {billData.restaurant && <p className="text-xs text-gray-400">{billData.restaurant}</p>}
            </div>

            <button onClick={() => setStep("selection")}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold transition-colors text-sm">
              ← Editar selección
            </button>

            {/* Share button */}
            <button onClick={handleShare}
              className="w-full bg-green-500 hover:bg-green-600 text-white py-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2.5 text-base shadow-sm">
              {shareStatus === "copied"
                ? <><Check className="w-5 h-5" />Copiado al portapapeles</>
                : <><Share2 className="w-5 h-5" />Compartir resumen</>}
            </button>
            {/* Fallback: show text to copy manually — always fresh */}
            {shareText !== null && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Texto para copiar</p>
                  <button onClick={() => setShareText(null)}
                    className="text-gray-400 hover:text-gray-600 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed select-all">
                  {buildShareText()}
                </pre>
                <p className="text-xs text-gray-400">Mantén presionado para seleccionar y copiar</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RESET MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowResetModal(false)} />
          <div className="relative bg-white w-full max-w-lg rounded-t-3xl p-6 space-y-4 shadow-xl">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto -mt-1 mb-2" />
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <RefreshCw className="w-6 h-6 text-blue-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900">¿Qué quieres hacer?</h3>
              <p className="text-sm text-gray-500 mt-1">Tienes una boleta ya analizada</p>
            </div>
            <button onClick={() => { setShowResetModal(false); setStep("upload"); }}
              className="w-full py-3.5 rounded-2xl border-2 border-blue-200 bg-blue-50 text-blue-700 font-semibold text-sm">
              Volver a editar la misma boleta
            </button>
            <button onClick={resetApp}
              className="w-full py-3.5 rounded-2xl bg-gray-900 text-white font-semibold text-sm">
              Empezar de cero
            </button>
            <button onClick={() => setShowResetModal(false)}
              className="w-full py-2 text-sm text-gray-400">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ backgroundColor: "rgb(255,127,127)" }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 border border-red-400 text-red-900 text-sm font-semibold px-5 py-3 rounded-2xl shadow-lg">
          ¡Oops! Ocurrió un error
        </div>
      )}

      {/* BOTTOM NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-lg mx-auto flex items-center justify-center px-6 py-3">
          <button onClick={resetApp}
            className="flex flex-col items-center gap-1 px-8 py-1 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors">
            <Home className="w-6 h-6" />
            <span className="text-xs font-semibold">Inicio</span>
          </button>
        </div>
      </div>
    </div>
  );
}
