"use client";

import { useState, useEffect, useRef } from "react";
import { 
  FiFolder, FiCpu, FiFileText, FiPlay, FiCheckCircle, 
  FiAlertCircle, FiDownload, FiActivity, FiLock, FiSearch, FiBox, FiDollarSign, FiSquare, FiClock
} from "react-icons/fi";

export default function AuditorDashboard() {
  const [path, setPath] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-1.5-flash");
  const [availableModels, setAvailableModels] = useState<{id: string, label: string}[]>([]);
  const [keyInfo, setKeyInfo] = useState<{label: string, balance: any, valid: boolean, error?: string} | null>(null);
  const [format, setFormat] = useState("md");
  const [availableTemplates, setAvailableTemplates] = useState<{id: string, name: string, preview: string | null}[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [eta, setEta] = useState<string>("");
  const [status, setStatus] = useState("Listo para comenzar");
  const [logs, setLogs] = useState<string[]>([]);
  const [finalFile, setFinalFile] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ... (states and other code)

  const stopAudit = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
    addLog("⚠️ Auditoría detenida por el usuario.");
    setStatus("Detenido");
  };

  // Cargar datos al inicio
  useEffect(() => {
    fetchTemplates();
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

  const startAudit = async () => {
    if (!path) return alert("Por favor ingresa una ruta");
    
    setIsRunning(true);
    setProgress(0);
    setStartTime(null);
    setEta("");
    setLogs([]);
    setFinalFile(null);
    setStatus("Conectando con el motor...");
    
    const url = `http://localhost:8000/audit?path=${encodeURIComponent(path)}&model=${model}&format=${format}&api_key=${encodeURIComponent(apiKey)}&provider=${provider}${selectedTemplate ? `&template=${encodeURIComponent(selectedTemplate)}` : ''}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.status) setStatus(data.status);
      
      if (data.progress) {
        setProgress(data.progress);
        if (data.progress > 5 && startTime) {
          const elapsed = Date.now() - startTime;
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
        setStartTime(Date.now());
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
        addLog(data.log);
      }

      if (data.file) {
        setFinalFile(data.file);
        setIsRunning(false);
        eventSource.close();
        eventSourceRef.current = null;
      }
      
      if (data.error) {
        addLog(`❌ ERROR: ${data.error}`);
        setIsRunning(false);
        eventSource.close();
        eventSourceRef.current = null;
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      addLog("❌ Error de conexión con el servidor.");
      setIsRunning(false);
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
                  <select 
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/50 transition-all text-sm appearance-none cursor-pointer"
                  >
                    {availableModels.length === 0 ? (
                      <option>Ingresa tu API Key para listar modelos...</option>
                    ) : (
                      availableModels.map((m) => (
                        <option key={m.id} value={m.id} className="bg-[#0A0A0A]">
                          {m.label}
                        </option>
                      ))
                    )}
                  </select>
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
                  </div>
                )}

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
                <span className="text-sm font-semibold">Estado de Cuota</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Usando Free Tier. Los lotes se procesan con pausas de seguridad para evitar límites de RPM.
              </p>
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
                  {eta && isRunning && (
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 font-bold uppercase tracking-widest animate-pulse">
                      <FiClock className="text-cyan-500" /> {eta}
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

              {finalFile && (
                <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FiCheckCircle className="text-green-400 text-xl" />
                      <div>
                        <p className="text-sm font-bold text-white">Manual Generado</p>
                        <p className="text-xs text-green-400/70">{finalFile}</p>
                      </div>
                    </div>
                    <button className="bg-green-500 hover:bg-green-600 text-black px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                      <FiDownload /> Descargar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Console Logs */}
            <div className="bg-[#0A0A0A] border border-white/10 rounded-3xl overflow-hidden flex flex-col h-[400px]">
              <div className="bg-white/5 px-6 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Live Process Logs</span>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/50" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                  <div className="w-2 h-2 rounded-full bg-green-500/50" />
                </div>
              </div>
              <div className="p-6 overflow-y-auto flex-1 font-mono text-xs space-y-2 custom-scrollbar">
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
            </div>
          </section>
        </div>
      </div>

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
