"use client";

import { useState, useEffect, useRef } from "react";
import { 
  FiFolder, FiCpu, FiFileText, FiPlay, FiCheckCircle, 
  FiAlertCircle, FiDownload, FiActivity, FiLock, FiSearch, FiBox, FiDollarSign, FiSquare, FiClock,
  FiSettings, FiChevronDown, FiChevronUp, FiStar, FiCode, FiX, FiEye, FiEyeOff, FiFile, FiChevronRight
} from "react-icons/fi";

export default function AuditorDashboard() {
  const [path, setPath] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-1.5-flash");
  const [availableModels, setAvailableModels] = useState<{id: string, label: string}[]>([]);
  const [keyInfo, setKeyInfo] = useState<{label: string, balance: any, valid: boolean, error?: string, is_free?: boolean, isFree?: boolean} | null>(null);
  const [format, setFormat] = useState("md");
  const [availableTemplates, setAvailableTemplates] = useState<{id: string, name: string, preview: string | null}[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [fontName, setFontName] = useState("Calibri");
  const [fontSize, setFontSize] = useState(11);
  const [blockSize, setBlockSize] = useState(100);
  const [diffMode, setDiffMode] = useState(false);
  const [structureOnly, setStructureOnly] = useState(false);
  const [codeTheme, setCodeTheme] = useState("monokai");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [favoriteModels, setFavoriteModels] = useState<string[]>([]);
  const [liveContent, setLiveContent] = useState("");
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [files, setFiles] = useState<Map<string, {blocksTotal: number, blocksDone: number, status: string}>>(new Map());
  const [totalLines, setTotalLines] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [projectFiles, setProjectFiles] = useState<{path: string, size: number}[]>([]);
  const [fileBrowserLoading, setFileBrowserLoading] = useState(false);
  const [fileBrowserTree, setFileBrowserTree] = useState<any>(null);
  const [excludeDirFilter, setExcludeDirFilter] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [customPrompt, setCustomPrompt] = useState(`Actúa como Arquitecto de Software Senior y Revisor de Código.
Proyecto: {{PROJECT}}
Archivo: {{FILE}}
Rango de líneas: {{RANGE}}

TAREA:
Realiza una explicación técnica exhaustiva "línea por línea" del código proporcionado. 
Debes agrupar las líneas por bloques lógicos (ej: una función, un ciclo, una validación) pero sin saltarte ninguna línea.

ESTRUCTURA DE RESPUESTA REQUERIDA:
Para cada bloque lógico, utiliza el siguiente formato:
- **[Líneas X - Y]**: [Nombre del componente/lógica]
- **Propósito**: Explicación breve de qué intenta resolver este segmento.
- **Análisis**: Explicación detallada de la lógica, mencionando variables clave y cómo interactúan.

REGLAS CRÍTICAS:
1. Si una función comienza en la línea 50 y termina en la 60, el bloque debe abarcar exactamente esas líneas y explicar la firma, el cuerpo y el retorno.
2. Identifica patrones de diseño de Laravel (Inyección de dependencias, Eloquent, Middlewares, etc.) donde aparezcan.
3. Sé técnico: habla de complejidad, tipos de datos y flujo de control.

CÓDIGO CON NÚMEROS DE LÍNEA:
{{CODE}}`);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const [eta, setEta] = useState<string>("");
  const [status, setStatus] = useState("Listo para comenzar");
  const [logs, setLogs] = useState<string[]>([]);
  const [finalFile, setFinalFile] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ... (states and other code)

  const stopAudit = () => {
    if (sessionId) {
      fetch(`http://localhost:8000/cancel-audit?session_id=${encodeURIComponent(sessionId)}`).catch(() => {});
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
    setSessionId(null);
    addLog("⚠️ Auditoría detenida por el usuario.");
    setStatus("Detenido");
  };

  // Cargar config y API key al inicio
  useEffect(() => {
    fetchTemplates();
    const savedConfig = localStorage.getItem('auditor_config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.provider) setProvider(config.provider);
        if (config.path) setPath(config.path);
        if (config.format) setFormat(config.format);
        if (config.model) setModel(config.model);
        if (config.selectedTemplate) setSelectedTemplate(config.selectedTemplate);
        if (config.customPrompt) setCustomPrompt(config.customPrompt);
        if (config.fontName) setFontName(config.fontName);
        if (config.fontSize) setFontSize(config.fontSize);
        if (config.blockSize) setBlockSize(config.blockSize);
        if (config.diffMode !== undefined) setDiffMode(config.diffMode);
        if (config.structureOnly !== undefined) setStructureOnly(config.structureOnly);
        if (config.favoriteModels) setFavoriteModels(config.favoriteModels);
        if (config.codeTheme) setCodeTheme(config.codeTheme);
        if (config.excludePatterns !== undefined) setExcludePatterns(config.excludePatterns);
      } catch (e) { console.error("Error loading config", e); }
    }
    const savedKey = localStorage.getItem(`${provider}_api_key`);
    if (savedKey) {
      setApiKey(savedKey);
      fetchModels(savedKey, provider);
      fetchKeyStatus(savedKey, provider);
    }
  }, []);

  // Cuando cambia el proveedor, cargar su API key
  useEffect(() => {
    const savedKey = localStorage.getItem(`${provider}_api_key`);
    if (savedKey) {
      setApiKey(savedKey);
      fetchModels(savedKey, provider);
      fetchKeyStatus(savedKey, provider);
    } else {
      setApiKey("");
      setAvailableModels([]);
      setKeyInfo(null);
    }
  }, [provider]);

  // Auto-guardar config cuando cambien las settings
  useEffect(() => {
    const config = { path, format, model, provider, selectedTemplate, customPrompt, fontName, fontSize, blockSize, diffMode, structureOnly, codeTheme, excludePatterns, favoriteModels };
    localStorage.setItem('auditor_config', JSON.stringify(config));
  }, [path, format, model, provider, selectedTemplate, customPrompt, fontName, fontSize, blockSize, diffMode, structureOnly, codeTheme, excludePatterns, favoriteModels]);

  // Auto-scroll del panel de logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch("http://localhost:8000/templates");
      const data = await res.json();
      setAvailableTemplates(data.templates || []);
    } catch (err) {
      console.error("Error al obtener plantillas:", err);
    }
  };

  const fetchKeyStatus = async (key: string, prov: string) => {
    if (!key) return;
    try {
      const res = await fetch(`http://localhost:8000/key-status?api_key=${encodeURIComponent(key)}&provider=${prov}`);
      const data = await res.json();
      setKeyInfo(data);
    } catch (err) {
      console.error("Error al obtener estado:", err);
    }
  };

  const fetchModels = async (key: string, prov: string) => {
    if (!key) return;
    try {
      const res = await fetch(`http://localhost:8000/models?api_key=${encodeURIComponent(key)}&provider=${prov}`);
      const data = await res.json();
      if (data.models) {
        setAvailableModels(data.models);
        if (!data.models.find((m: any) => m.id === model) && data.models.length > 0) {
          setModel(data.models[0].id);
        }
      }
    } catch (err) {
      console.error("Error al obtener modelos:", err);
    }
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(`${provider}_api_key`, key);
    if (key.length > 10) {
      fetchModels(key, provider);
      fetchKeyStatus(key, provider);
    }
  };

  const selectFolder = async () => {
    try {
      const res = await fetch("http://localhost:8000/select-folder");
      const data = await res.json();
      if (data.path) setPath(data.path);
    } catch (err) {
      console.error("Error seleccionando carpeta:", err);
      alert("No se pudo abrir el selector. Asegúrate de que el backend esté corriendo.");
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const openFileBrowser = async () => {
    if (!path) return alert("Primero ingresa una ruta de proyecto");
    setFileBrowserLoading(true);
    setShowFileBrowser(true);
    try {
      const res = await fetch(`http://localhost:8000/project-files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) { alert(data.error); setShowFileBrowser(false); return; }
      setProjectFiles(data.files || []);
      setFileBrowserTree(data.tree || {});
    } catch (err) {
      console.error("Error fetching project files:", err);
      alert("No se pudieron cargar los archivos del proyecto");
      setShowFileBrowser(false);
    } finally {
      setFileBrowserLoading(false);
    }
  };

  const toggleExclude = (pattern: string) => {
    setExcludePatterns(prev => {
      const items = prev.split(",").map(s => s.trim()).filter(Boolean);
      const pLower = pattern.toLowerCase();
      // Find any existing pattern that matches (exact or parent match)
      const matching = items.filter(i => {
        const iLower = i.toLowerCase();
        return iLower === pLower || pLower.startsWith(iLower + "/") || iLower.startsWith(pLower + "/");
      });
      if (matching.length > 0) {
        // Remove the most specific match (longest)
        const toRemove = matching.sort((a, b) => b.length - a.length)[0];
        return items.filter(i => i !== toRemove).join(", ");
      }
      return [...items, pattern].join(", ");
    });
  };

  const removeExclude = (pattern: string) => {
    setExcludePatterns(prev => {
      const items = prev.split(",").map(s => s.trim()).filter(Boolean);
      return items.filter(i => i.toLowerCase() !== pattern.toLowerCase()).join(", ");
    });
  };

  const getExcludeList = () => excludePatterns.split(",").map(s => s.trim()).filter(Boolean);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const startAudit = async () => {
    if (!path) return alert("Por favor ingresa una ruta");
    
    setIsRunning(true);
    setProgress(0);
    startTimeRef.current = null;
    setEta("");
    setLogs([]);
    setFinalFile(null);
    setSummary(null);
    setFiles(new Map());
    setTotalLines(0);
    setLiveContent("");
    setStatus("Conectando con el motor...");
    
    const sid = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSessionId(sid);
    
    const url = `http://localhost:8000/audit?path=${encodeURIComponent(path)}&model=${model}&format=${format}&api_key=${encodeURIComponent(apiKey)}&provider=${provider}${selectedTemplate ? `&template=${encodeURIComponent(selectedTemplate)}` : ''}&custom_prompt=${encodeURIComponent(customPrompt)}&font_name=${encodeURIComponent(fontName)}&font_size=${fontSize}&block_size=${blockSize}&diff_mode=${diffMode}&structure_only=${structureOnly}&code_theme=${codeTheme}&exclude_patterns=${encodeURIComponent(excludePatterns)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.status) setStatus(data.status);
      
      if (data.progress) {
        setProgress(data.progress);
        if (data.progress > 1 && startTimeRef.current) {
          const elapsed = Date.now() - startTimeRef.current;
          const totalEstimated = (elapsed / data.progress) * 100;
          const remaining = totalEstimated - elapsed;
          if (remaining > 0) {
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            setEta(`${mins}m ${secs}s restantes`);
          }
        }
      }

      if (data.total_bloques) {
        startTimeRef.current = Date.now();
      }

      if (data.total_lineas) setTotalLines(data.total_lineas);

      if (data.file && typeof data.file === 'object') {
        setFiles(prev => {
          const next = new Map(prev);
          const f = next.get(data.file.name) || {blocksTotal: data.file.blocks_total || 0, blocksDone: 0, status: 'pending'};
          if (data.file.blocks_total) f.blocksTotal = data.file.blocks_total;
          if (data.file.blocks_done) f.blocksDone = data.file.blocks_done;
          if (data.file.blocks_total && f.blocksDone >= f.blocksTotal) f.status = 'done';
          else f.status = 'processing';
          next.set(data.file.name, f);
          return next;
        });
      }
      
      if (data.streaming && data.log) {
        setLogs(prev => {
          const lastLog = prev[prev.length - 1];
          if (lastLog && lastLog.startsWith("  [IA]:")) {
            const newLogs = [...prev];
            newLogs[newLogs.length - 1] = lastLog + data.log.replace("  [IA]:", "");
            return newLogs;
          } else {
            return [...prev, `[${new Date().toLocaleTimeString()}] ${data.log}`];
          }
        });
      } else if (data.log) {
        const tokenSuffix = data.tokens ? ` [${data.tokens} tokens]` : '';
        addLog(data.log + tokenSuffix);
      }

      if (data.live_content) {
        setLiveContent(prev => prev + data.live_content);
      }

      if (data.file && typeof data.file === 'string') {
        setFinalFile(data.file);
        if (data.summary) setSummary(data.summary);
        setIsRunning(false);
        eventSource.close();
        eventSourceRef.current = null;
      }
      
      if (data.error) {
        addLog(`❌ ERROR: ${data.error}`);
        if (data.fatal) {
          setIsRunning(false);
          setSessionId(null);
          eventSource.close();
          eventSourceRef.current = null;
        }
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      addLog("❌ Error de conexión con el servidor.");
      setIsRunning(false);
      setSessionId(null);
      eventSource.close();
      eventSourceRef.current = null;
    };
  };

  return (
    <main className="min-h-screen bg-[#050505] text-gray-200 font-sans selection:bg-cyan-500/30">
      {/* Background Glow */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-2">
              Laravel Auditor <span className="text-white/20 font-light">PRO</span>
            </h1>
            <p className="text-gray-400">Generador inteligente de documentación técnica</p>
          </div>
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl backdrop-blur-md">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isRunning ? 'bg-cyan-400' : 'bg-gray-500'}`} />
            <span className="text-sm font-medium">{isRunning ? 'Analizando Sistema' : 'Sistema en Espera'}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Config Panel */}
          <section className="lg:col-span-1 space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <FiFolder className="text-cyan-400" /> Configuración
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Proveedor de IA</label>
                  <div className="flex bg-white/5 rounded-xl p-1 border border-white/10">
                    <button 
                      onClick={() => setProvider("gemini")}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${provider === 'gemini' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'hover:bg-white/5'}`}
                    >
                      <FiCpu /> Gemini
                    </button>
                    <button 
                      onClick={() => setProvider("openrouter")}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 ${provider === 'openrouter' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'hover:bg-white/5'}`}
                    >
                      <FiBox /> OpenRouter
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">{provider === 'gemini' ? 'Gemini API Key' : 'OpenRouter API Key'}</label>
                  <div className="relative">
                    <input 
                      type="password" 
                      value={apiKey}
                      onChange={(e) => saveApiKey(e.target.value)}
                      placeholder={provider === 'gemini' ? 'AIzaSy...' : 'sk-or-...'}
                      className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 focus:outline-none transition-all text-sm ${provider === 'gemini' ? 'focus:border-cyan-500/50' : 'focus:border-purple-500/50'}`}
                    />
                    <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  </div>
                  
                  {/* Key Status Card */}
                  {keyInfo && (
                    <div className={`mt-3 p-3 rounded-xl border backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 ${keyInfo.valid ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {keyInfo.valid ? <FiCheckCircle className="text-green-400" /> : <FiAlertCircle className="text-red-400" />}
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${keyInfo.valid ? 'text-green-400' : 'text-red-400'}`}>
                          {keyInfo.valid ? 'Llave Activa' : 'Error de Llave'}
                        </span>
                      </div>
                      {keyInfo.valid ? (
                        <div className="space-y-1">
                          <p className="text-xs text-white/80 font-medium truncate">{keyInfo.label}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[9px] text-gray-500 uppercase">Balance</span>
                            <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                              <FiDollarSign className="text-[8px]" /> {typeof keyInfo.balance === 'number' ? keyInfo.balance.toFixed(4) : keyInfo.balance}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-red-400/70 leading-tight">{keyInfo.error || 'La llave fue rechazada por el servidor.'}</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Ruta del Proyecto</label>
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="/ruta/del/proyecto"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 pr-12 focus:outline-none focus:border-cyan-500/50 transition-all text-sm"
                    />
                    <FiFolder className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <button 
                      onClick={selectFolder}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-lg text-cyan-400 transition-colors"
                      title="Explorar carpeta"
                    >
                      <FiSearch />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Modelo de IA</label>
                  <div className="relative group">
                    <select 
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 transition-all text-sm appearance-none cursor-pointer"
                    >
                      {availableModels.length === 0 ? (
                        <option>Ingresa tu API Key para listar modelos...</option>
                      ) : (
                        [...availableModels]
                          .sort((a, b) => {
                            const aFav = favoriteModels.includes(a.id) ? 0 : 1;
                            const bFav = favoriteModels.includes(b.id) ? 0 : 1;
                            return aFav - bFav || a.label.localeCompare(b.label);
                          })
                          .map((m) => (
                            <option key={m.id} value={m.id} className="bg-[#0A0A0A]">
                              {favoriteModels.includes(m.id) ? '★ ' : '  '}{m.label}
                            </option>
                          ))
                      )}
                    </select>
                    {availableModels.length > 0 && (
                      <button
                        onClick={() => {
                          setFavoriteModels(prev =>
                            prev.includes(model)
                              ? prev.filter(id => id !== model)
                              : [...prev, model]
                          );
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                        title={favoriteModels.includes(model) ? "Quitar de favoritos" : "Agregar a favoritos"}
                      >
                        <FiStar className={favoriteModels.includes(model) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-500'} />
                      </button>
                    )}
                  </div>
                  {favoriteModels.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {favoriteModels.map(fid => (
                        <span key={fid} className="text-[9px] bg-yellow-500/10 text-yellow-400/70 px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">{fid}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Formato de Salida</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setFormat("md")}
                      className={`flex-1 py-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${format === 'md' ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-white/5 text-gray-500 hover:border-white/20'}`}
                    >
                      <span className="text-sm font-bold">MD</span>
                      <span className="text-[10px]">Markdown</span>
                    </button>
                    <button 
                      onClick={() => setFormat("pdf")}
                      className={`flex-1 py-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${format === 'pdf' ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-white/5 text-gray-500 hover:border-white/20'}`}
                    >
                      <span className="text-sm font-bold">PDF</span>
                      <span className="text-[10px]">Documento</span>
                    </button>
                    <button 
                      onClick={() => setFormat("docx")}
                      className={`flex-1 py-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${format === 'docx' ? 'bg-white/10 border-white/30 text-white' : 'bg-transparent border-white/5 text-gray-500 hover:border-white/20'}`}
                    >
                      <span className="text-sm font-bold">DOCX</span>
                      <span className="text-[10px]">MS Word</span>
                    </button>
                  </div>
                </div>

                {format === 'docx' && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Plantilla Personalizada</label>
                    <select 
                      value={selectedTemplate}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-cyan-500/50 transition-all text-sm appearance-none cursor-pointer mb-3"
                    >
                      <option value="" className="bg-[#0A0A0A]">Ninguna (Estándar)</option>
                      {availableTemplates.map((t) => (
                        <option key={t.id} value={t.id} className="bg-[#0A0A0A]">
                          {t.name}
                        </option>
                      ))}
                    </select>

                    {/* Template Preview Card */}
                    {selectedTemplate && availableTemplates.find(t => t.id === selectedTemplate)?.preview && (
                      <div className="relative group overflow-hidden rounded-xl border border-white/10 bg-black/40 aspect-[4/3]">
                        <img 
                          src={availableTemplates.find(t => t.id === selectedTemplate)?.preview || ''} 
                          alt="Preview" 
                          className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-duration-700"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-3">
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                            <FiCheckCircle className="text-cyan-400" /> Diseño Seleccionado
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3 block">Tipografía del Documento</label>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <select
                            value={fontName}
                            onChange={(e) => setFontName(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500/50 transition-all text-xs appearance-none cursor-pointer"
                          >
                            <option className="bg-[#0A0A0A]" value="Calibri">Calibri</option>
                            <option className="bg-[#0A0A0A]" value="Arial">Arial</option>
                            <option className="bg-[#0A0A0A]" value="Times New Roman">Times New Roman</option>
                            <option className="bg-[#0A0A0A]" value="Verdana">Verdana</option>
                            <option className="bg-[#0A0A0A]" value="Courier New">Courier New</option>
                            <option className="bg-[#0A0A0A]" value="Georgia">Georgia</option>
                            <option className="bg-[#0A0A0A]" value="Tahoma">Tahoma</option>
                            <option className="bg-[#0A0A0A]" value="Segoe UI">Segoe UI</option>
                          </select>
                        </div>
                        <div className="w-20">
                          <input
                            type="number"
                            min={8}
                            max={20}
                            value={fontSize}
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500/50 transition-all text-xs text-center"
                          />
                        </div>
                      </div>
                      <p className="text-[9px] text-gray-500 mt-2">Fuente: {fontName} · Tamaño: {fontSize}pt</p>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-white/5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">Excluir Archivos/Carpetas</label>
                  <button
                    onClick={openFileBrowser}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-gray-400 hover:text-white hover:border-cyan-500/50 transition-all flex items-center justify-center gap-2"
                  >
                    <FiSearch /> Explorar y Seleccionar
                  </button>
                  {getExcludeList().length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {getExcludeList().map(p => (
                        <span key={p} className="inline-flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-lg">
                          <span className="max-w-[160px] truncate">{p}</span>
                          <button onClick={() => removeExclude(p)} className="hover:text-red-300 transition-colors">
                            <FiX size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[9px] text-gray-500 mt-1.5">Los archivos que coincidan con estas rutas serán ignorados en el análisis</p>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center justify-between w-full text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] hover:text-gray-300 transition-colors py-2"
                  >
                    <span className="flex items-center gap-2"><FiSettings className="text-xs" /> Configuración Avanzada</span>
                    {showAdvanced ? <FiChevronUp /> : <FiChevronDown />}
                  </button>
                  
                  {showAdvanced && (
                    <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">Instrucciones de la IA (Prompt)</label>
                        <textarea 
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-gray-300 font-mono h-48 focus:outline-none focus:border-purple-500/50 transition-all leading-relaxed"
                          placeholder="Escribe tu prompt aquí..."
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {['{{PROJECT}}', '{{FILE}}', '{{RANGE}}', '{{CODE}}'].map(tag => (
                            <span key={tag} className="text-[9px] bg-white/5 border border-white/5 px-2 py-1 rounded text-gray-500 font-mono cursor-help hover:border-purple-500/30 transition-all" title="Se reemplazará automáticamente">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="pt-3 border-t border-white/5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">Tema de Capturas de Código</label>
                        <select
                          value={codeTheme}
                          onChange={(e) => setCodeTheme(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500/50 transition-all text-xs appearance-none cursor-pointer"
                        >
                          <option className="bg-[#0A0A0A]" value="monokai">Monokai</option>
                          <option className="bg-[#0A0A0A]" value="dracula">Dracula</option>
                          <option className="bg-[#0A0A0A]" value="one-dark">One Dark</option>
                          <option className="bg-[#0A0A0A]" value="nord">Nord</option>
                          <option className="bg-[#0A0A0A]" value="nord-darker">Nord Darker</option>
                          <option className="bg-[#0A0A0A]" value="material">Material</option>
                          <option className="bg-[#0A0A0A]" value="github-dark">GitHub Dark</option>
                          <option className="bg-[#0A0A0A]" value="gruvbox-dark">Gruvbox Dark</option>
                          <option className="bg-[#0A0A0A]" value="native">Native</option>
                          <option className="bg-[#0A0A0A]" value="solarized-dark">Solarized Dark</option>
                          <option className="bg-[#0A0A0A]" value="zenburn">Zenburn</option>
                        </select>
                        <p className="text-[9px] text-gray-500 mt-1.5">Tema visual para las capturas de código en DOCX</p>
                      </div>
                      <div className="pt-3 border-t border-white/5">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">Líneas por Bloque</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={20}
                            max={300}
                            step={10}
                            value={blockSize}
                            onChange={(e) => setBlockSize(Number(e.target.value))}
                            className="flex-1 accent-cyan-500"
                          />
                          <span className="text-xs font-mono text-cyan-400 w-12 text-right">{blockSize}</span>
                        </div>
                      </div>
                      <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Modo Diff</label>
                        <button
                          onClick={() => setDiffMode(!diffMode)}
                          className={`relative w-10 h-5 rounded-full transition-all ${diffMode ? 'bg-cyan-500' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${diffMode ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {diffMode && <p className="text-[9px] text-amber-400/60">Solo procesa archivos modificados desde la última auditoría</p>}
                      <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-500 uppercase">Solo Estructura</label>
                        <button
                          onClick={() => setStructureOnly(!structureOnly)}
                          className={`relative w-10 h-5 rounded-full transition-all ${structureOnly ? 'bg-cyan-500' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${structureOnly ? 'left-5' : 'left-0.5'}`} />
                        </button>
                      </div>
                      {structureOnly && <p className="text-[9px] text-amber-400/60">Genera solo el árbol de estructura sin llamar a la IA</p>}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      const config = {
                        path, format, model, provider, apiKey,
                        selectedTemplate, customPrompt, fontName, fontSize,
                        blockSize, diffMode, structureOnly, codeTheme,
                        excludePatterns, favoriteModels
                      };
                      const blob = new Blob([JSON.stringify(config, null, 2)], {type: 'application/json'});
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `auditor-config-${new Date().toISOString().slice(0,10)}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 text-[10px] font-bold text-gray-400 hover:text-white hover:border-cyan-500/50 transition-all"
                  >
                    Exportar Config
                  </button>
                  <button
                    onClick={() => document.getElementById('import-config-input')?.click()}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 text-[10px] font-bold text-gray-400 hover:text-white hover:border-cyan-500/50 transition-all"
                  >
                    Importar Config
                  </button>
                  <input
                    id="import-config-input"
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        try {
                          const cfg = JSON.parse(ev.target?.result as string);
                          if (cfg.path) setPath(cfg.path);
                          if (cfg.apiKey) { setApiKey(cfg.apiKey); localStorage.setItem(`${cfg.provider || provider}_api_key`, cfg.apiKey); }
                          if (cfg.provider) setProvider(cfg.provider);
                          if (cfg.model) setModel(cfg.model);
                          if (cfg.format) setFormat(cfg.format);
                          if (cfg.selectedTemplate) setSelectedTemplate(cfg.selectedTemplate);
                          if (cfg.customPrompt) setCustomPrompt(cfg.customPrompt);
                          if (cfg.fontName) setFontName(cfg.fontName);
                          if (cfg.fontSize) setFontSize(cfg.fontSize);
                          if (cfg.blockSize) setBlockSize(cfg.blockSize);
                          if (cfg.diffMode !== undefined) setDiffMode(cfg.diffMode);
                          if (cfg.structureOnly !== undefined) setStructureOnly(cfg.structureOnly);
                          if (cfg.codeTheme) setCodeTheme(cfg.codeTheme);
                          if (cfg.excludePatterns !== undefined) setExcludePatterns(cfg.excludePatterns);
                          if (cfg.favoriteModels) setFavoriteModels(cfg.favoriteModels);
                        } catch { alert("El archivo no tiene un formato válido"); }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                <button 
                  onClick={isRunning ? stopAudit : startAudit}
                  className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all mt-4 ${isRunning ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30' : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] text-white border border-white/10'}`}
                >
                  {isRunning ? <FiSquare /> : <FiPlay />}
                  {isRunning ? 'Detener Auditoría' : 'Iniciar Auditoría'}
                </button>
              </div>
            </div>

            {/* Quota Info */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-2">
                <FiCpu className="text-purple-400" />
                <span className="text-sm font-semibold">
                  {provider === 'openrouter' ? 'Balance OpenRouter' : 'Cuota Gemini'}
                </span>
              </div>
              {keyInfo && keyInfo.valid ? (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {provider === 'openrouter'
                      ? `Balance restante: $${typeof keyInfo.balance === 'number' ? keyInfo.balance.toFixed(4) : keyInfo.balance}`
                      : 'No es posible consultar el uso restante de Gemini vía API. Podés verificar tu cuota en Google AI Studio.'}
                  </p>
                  {provider === 'openrouter' && keyInfo.is_free && (
                    <p className="text-[10px] text-amber-400/70">Tier gratuito activo</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500 leading-relaxed">
                  Ingresá una API Key válida para ver el estado de tu cuenta.
                </p>
              )}
            </div>
          </section>

          {/* Progress & Logs */}
          <section className="lg:col-span-2 space-y-6">
            {/* Progress Card */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">{status}</h3>
                  <p className="text-sm text-gray-400">Progreso total del proyecto</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-4xl font-black text-cyan-400">{progress}%</div>
                  {isRunning && (
                    <div className="flex items-center gap-2 text-sm font-black text-cyan-400 bg-cyan-400/10 px-4 py-2 rounded-2xl border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)] animate-pulse mt-2">
                      <FiClock className="text-lg" /> 
                      <span className="tracking-tighter">{eta || "Sincronizando reloj..."}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="w-full h-3 bg-white/5 rounded-full mb-2 overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {totalLines > 0 && (
                <p className="text-[10px] text-gray-500 mt-1">
                  ~{totalLines.toLocaleString()} líneas en total
                  {files.size > 0 && ` · ${files.size} archivos`}
                </p>
              )}

              {/* File Progress List */}
              {files.size > 0 && !finalFile && (
                <div className="mt-6 max-h-36 overflow-y-auto space-y-1 custom-scrollbar">
                  {Array.from(files.entries()).map(([name, f]) => (
                    <div key={name} className="flex items-center gap-2 text-[10px]">
                      <span className="w-3 text-center text-[8px]">
                        {f.status === 'done' ? '✅' : f.status === 'skipped' ? '⏭️' : '🔄'}
                      </span>
                      <span className="flex-1 truncate text-gray-400">{name}</span>
                      <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className={`h-full transition-all duration-300 ${f.status === 'done' ? 'bg-green-500' : 'bg-cyan-500'}`}
                          style={{width: f.blocksTotal > 0 ? `${Math.min(100, (f.blocksDone/f.blocksTotal)*100)}%` : '0%'}}
                        />
                      </div>
                      <span className="text-gray-500 w-12 text-right tabular-nums">{f.blocksDone}/{f.blocksTotal}</span>
                    </div>
                  ))}
                </div>
              )}

              {finalFile && (
                <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <FiCheckCircle className="text-green-400 text-xl" />
                        <div>
                          <p className="text-sm font-bold text-white">Manual Generado</p>
                          <p className="text-xs text-green-400/70">{finalFile}</p>
                        </div>
                      </div>
                      <button onClick={() => window.open(`http://localhost:8000/download?file=${encodeURIComponent(finalFile)}`, '_blank')} className="bg-green-500 hover:bg-green-600 text-black px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                        <FiDownload /> Descargar
                      </button>
                    </div>
                    {summary && (
                      <div className="flex gap-4 pt-3 border-t border-green-500/20 text-[11px]">
                        <span className="text-gray-400">Archivos: <strong className="text-white">{summary.archivos}</strong></span>
                        {summary.archivos_saltados > 0 && <span className="text-gray-400">Saltados: <strong className="text-amber-400">{summary.archivos_saltados}</strong></span>}
                        <span className="text-gray-400">Bloques: <strong className="text-white">{summary.bloques}</strong></span>
                        <span className="text-gray-400">Tiempo: <strong className="text-white">{summary.segundos > 60 ? `${Math.floor(summary.segundos / 60)}m ${summary.segundos % 60}s` : `${summary.segundos}s`}</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Console Logs / Live Preview */}
            <div className="bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden flex flex-col">
              <div className="bg-white/5 px-6 py-3 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setShowLivePreview(false)}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${!showLivePreview ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    <FiActivity className="inline mr-1.5" /> Logs
                  </button>
                  <button
                    onClick={() => setShowLivePreview(true)}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${showLivePreview ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    <FiCode className="inline mr-1.5" /> Vista Previa
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/50" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                  <div className="w-2 h-2 rounded-full bg-green-500/50" />
                </div>
              </div>
              {showLivePreview ? (
                <div className="p-6 overflow-y-auto flex-1 font-mono text-xs space-y-2 custom-scrollbar" style={{ height: '400px' }}>
                  {!liveContent ? (
                    <div className="text-white/10 h-full flex items-center justify-center italic">
                      Esperando contenido...
                    </div>
                  ) : (
                    <pre className="text-gray-300 whitespace-pre-wrap leading-relaxed">{liveContent}</pre>
                  )}
                </div>
              ) : (
                <div className="p-6 overflow-y-auto flex-1 font-mono text-xs space-y-2 custom-scrollbar" style={{ height: '400px' }}>
                  {logs.length === 0 && (
                    <div className="text-white/10 h-full flex items-center justify-center italic">
                      Esperando actividad...
                    </div>
                  )}
                  {logs.map((log, i) => (
                    <div key={i} className={`${log.includes('[IA]:') ? 'text-purple-400 font-medium italic' : 'text-gray-400'} animate-in fade-in slide-in-from-left-2 duration-300`}>
                      <span className="text-cyan-500/50 mr-3">{i+1}</span>
                      {log}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Modal: Explorador de Archivos */}
      {showFileBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowFileBrowser(false)}>
          <div className="bg-[#0A0A0A] border border-white/10 rounded-3xl w-[90vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <FiFolder className="text-cyan-400" /> Archivos del Proyecto
              </h3>
              <button onClick={() => setShowFileBrowser(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <FiX size={16} />
              </button>
            </div>
            <div className="px-6 py-3 border-b border-white/5">
              <input
                type="text"
                value={excludeDirFilter}
                onChange={e => setExcludeDirFilter(e.target.value)}
                placeholder="Filtrar archivos..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              {fileBrowserLoading ? (
                <div className="text-center text-gray-500 py-8 text-sm">Cargando archivos...</div>
              ) : (
                (() => {
                  const filter = excludeDirFilter.toLowerCase();
                  const excluded = getExcludeList();

                  const isExcluded = (path: string) => excluded.some(e => {
                    const pLower = path.toLowerCase();
                    const eLower = e.toLowerCase();
                    return pLower === eLower || pLower.startsWith(eLower + "/");
                  });

                  const toggleExpand = (path: string) => {
                    setExpandedDirs(prev => {
                      const next = new Set(prev);
                      if (next.has(path)) next.delete(path);
                      else next.add(path);
                      return next;
                    });
                  };

                  const renderTree = (node: any, path: string, depth: number) => {
                    const entries = Object.entries(node).sort(([, a]: any, [, b]: any) => {
                      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                      return (a as any).path || '' > (b as any).path || '' ? 1 : -1;
                    });

                    return entries.flatMap(([name, data]: [string, any]) => {
                      const fullPath = path ? `${path}/${name}` : name;
                      const nodeExcluded = isExcluded(fullPath);
                      const isExpanded = expandedDirs.has(fullPath);

                      if (data.type === 'dir') {
                        const childCount = Object.keys(data.children || {}).length;
                        const hasFilterMatch = !filter || fullPath.toLowerCase().includes(filter);
                        const hasChildMatch = !filter || Object.keys(data.children || {}).some(k =>
                          `${fullPath}/${k}`.toLowerCase().includes(filter)
                        );
                        if (filter && !hasFilterMatch && !hasChildMatch) return [];
                        const showChildren = isExpanded || (filter && hasChildMatch);

                        return (
                          <div key={fullPath}>
                            <div
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-all group ${
                                nodeExcluded
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : 'text-gray-400 hover:bg-white/5 border border-transparent'
                              }`}
                              style={{ paddingLeft: `${12 + depth * 16}px` }}
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExpand(fullPath); }}
                                className="shrink-0 p-0.5 hover:bg-white/10 rounded transition-transform"
                              >
                                <FiChevronRight size={10} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </button>
                              <div
                                onClick={() => toggleExclude(fullPath)}
                                className="flex items-center gap-2 flex-1 min-w-0"
                              >
                                <FiFolder className={`shrink-0 text-[10px] ${nodeExcluded ? 'text-red-400' : 'text-cyan-400'}`} />
                                <span className="truncate flex-1">{name}</span>
                                <span className="shrink-0 text-[9px] text-gray-600">{childCount}</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExclude(fullPath); }}
                                className="shrink-0 p-0.5 hover:bg-white/10 rounded"
                              >
                                {nodeExcluded ? <FiEyeOff size={10} className="text-red-400" /> : <FiEye size={10} className="text-gray-600 opacity-0 group-hover:opacity-100" />}
                              </button>
                            </div>
                            {showChildren && renderTree(data.children || {}, fullPath, depth + 1)}
                          </div>
                        );
                      }

                      if (filter && !fullPath.toLowerCase().includes(filter)) return [];

                      return (
                        <div
                          key={fullPath}
                          onClick={() => toggleExclude(fullPath)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-all group ${
                            nodeExcluded
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'text-gray-400 hover:bg-white/5 border border-transparent'
                          }`}
                          style={{ paddingLeft: `${12 + depth * 16}px` }}
                        >
                          <FiFile className="shrink-0 text-[10px] text-gray-500" />
                          <span className="truncate flex-1">{name}</span>
                          <span className="shrink-0 text-[9px] text-gray-600">{formatSize(data.size)}</span>
                          <span className={`shrink-0 text-[9px] ${nodeExcluded ? 'text-red-400' : 'text-gray-600 opacity-0 group-hover:opacity-100'}`}>
                            {nodeExcluded ? <FiEyeOff size={10} /> : <FiEye size={10} />}
                          </span>
                        </div>
                      );
                    });
                  };

                  const items = renderTree(fileBrowserTree, "", 0);
                  return items.length === 0 ? (
                    <div className="text-center text-gray-500 py-8 text-sm">No se encontraron archivos</div>
                  ) : items;
                })()
              )}
            </div>
            <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-[10px] text-gray-500">{projectFiles.length} archivos analizables</span>
              <button
                onClick={() => setShowFileBrowser(false)}
                className="bg-white/10 hover:bg-white/20 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </main>
  );
}
