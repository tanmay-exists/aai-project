import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, ShieldCheck, Code, FileText, 
  Loader2, ArrowRight, Cpu, ArrowDown, CheckCircle, Download 
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function App() {
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]); 
  const scrollEndRef = useRef(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleGenerate = async () => {
    if (!idea) return;
    setLoading(true);
    setLogs([]); 

    try {
      const response = await fetch('http://localhost:3000/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.replace('data: ', ''));
              setLogs(prev => {
                const lastLog = prev[prev.length - 1];
                if (lastLog && lastLog.agent === data.agent && lastLog.iteration === data.iteration) {
                  const updatedLogs = [...prev];
                  updatedLogs[updatedLogs.length - 1] = { ...lastLog, content: lastLog.content + data.chunk };
                  return updatedLogs;
                } else {
                  return [...prev, { agent: data.agent, content: data.chunk, iteration: data.iteration || 1 }];
                }
              });
            } catch (e) {}
          }
        });
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleDownload = async () => {
    const zip = new JSZip();
    
    const devLogs = logs.filter(l => l.agent === 'dev');
    const finalCodeMarkdown = devLogs[devLogs.length - 1]?.content || "";
    const spec = logs.find(l => l.agent === 'pm')?.content || "No spec provided";

    // 1. Build the README
    const readmeContent = `# Project: ${idea}\n\n## Overview\nGenerated via Spec-To-Code Pipeline.\n\n## Setup\n1. Run \`npm install\`\n2. Configure your \`.env\` file.\n3. Run \`npm start\`\n\n## Original Specification\n${spec}`;
    zip.file("README.md", readmeContent);

    // 2. Extract actual code files from Markdown
    const blocks = finalCodeMarkdown.split('```');
    let fileCount = 1;
    let hasFiles = false;

    // Every odd index in the split array is the content inside a markdown code block
    for (let i = 1; i < blocks.length; i += 2) {
      const codeBlock = blocks[i];
      const textBeforeBlock = blocks[i - 1];

      // Remove the language tag (e.g., "javascript", "json", "html")
      const firstNewlineIndex = codeBlock.indexOf('\n');
      if (firstNewlineIndex === -1) continue; 
      
      const actualCode = codeBlock.substring(firstNewlineIndex + 1).trim();

      // Look at the text immediately preceding the block to find a filename
      const linesBefore = textBeforeBlock.trim().split('\n');
      const lastLineBefore = linesBefore[linesBefore.length - 1] || "";
      
      // Matches standard filenames like server.js, package.json, App.jsx, etc.
      const nameMatch = lastLineBefore.match(/([a-zA-Z0-9_-]+\.[a-zA-Z0-9]+)/);
      
      let filename = nameMatch ? nameMatch[1] : `generated_module_${fileCount}.js`;
      if (!nameMatch) fileCount++;

      zip.file(filename, actualCode);
      hasFiles = true;
    }

    // Fallback in case no markdown blocks were generated at all
    if (!hasFiles) {
      zip.file("raw_output.txt", finalCodeMarkdown);
    }
    
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "ai-project-export.zip");
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-blue-500/30 pb-20">
      <div className="max-w-6xl mx-auto px-6 py-12">
        
        <header className="text-center mb-16">
          <h1 className="text-5xl font-black tracking-tighter mb-8 bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
            SPEC-TO-CODE PIPELINE
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-4 bg-slate-900/50 p-6 rounded-3xl border border-slate-800 backdrop-blur-sm">
            <FlowStep icon={<FileText size={20}/>} label="PM Agent" color="text-amber-400" />
            <ArrowRight className="text-slate-600 hidden sm:block" />
            <FlowStep icon={<Code size={20}/>} label="Dev Agent" color="text-blue-400" />
            <ArrowRight className="text-slate-600 hidden sm:block" />
            <FlowStep icon={<ShieldCheck size={20}/>} label="Security Auditor" color="text-emerald-400" />
          </div>
        </header>

        <div className="relative group max-w-3xl mx-auto mb-16">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-emerald-600 rounded-3xl blur opacity-10 group-focus-within:opacity-25 transition duration-1000"></div>
          <textarea 
            className="relative w-full bg-slate-900/80 border-2 border-slate-800 rounded-3xl p-6 h-32 focus:border-blue-500/50 outline-none transition-all resize-none shadow-2xl text-lg"
            placeholder="What are we building today, Tanmay?"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
          />
          <button 
            onClick={handleGenerate}
            disabled={loading || !idea}
            className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 p-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2 px-6"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Cpu size={24} />}
            <span className="font-bold uppercase tracking-widest text-xs">Generate</span>
          </button>
        </div>

        {/* LOGS RENDERED FIRST */}
        <div className="flex flex-col items-center gap-4 mb-12">
          <AnimatePresence mode="popLayout">
            {logs.map((log, index) => (
              <React.Fragment key={`${log.agent}-${log.iteration}-${index}`}>
                {index > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-2">
                    <ArrowDown size={24} className="text-blue-800" />
                  </motion.div>
                )}
                <AgentCard log={log} />
              </React.Fragment>
            ))}
          </AnimatePresence>
        </div>
        
        {/* DOWNLOAD BUTTON MOVED TO THE BOTTOM */}
        {!loading && logs.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="flex justify-center"
          >
            <button 
              onClick={handleDownload}
              className="group relative flex items-center gap-3 bg-emerald-600/20 border-2 border-emerald-500/50 hover:bg-emerald-600/30 text-emerald-400 px-8 py-4 rounded-full transition-all shadow-[0_0_20px_rgba(16,185,129,0.1)] hover:shadow-[0_0_30px_rgba(16,185,129,0.2)]"
            >
              <Download size={20} className="group-hover:bounce" />
              <span className="font-black uppercase tracking-widest text-sm">Download Project (.zip)</span>
            </button>
          </motion.div>
        )}

        <div ref={scrollEndRef} className="h-4" />
      </div>
    </div>
  );
}

function FlowStep({ icon, label, color }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4">
      <div className={`p-3 rounded-xl bg-slate-800 border border-slate-700 ${color}`}>{icon}</div>
      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{label}</span>
    </div>
  );
}

function AgentCard({ log }) {
  const scrollRef = useRef(null);
  const isRefactor = log.iteration > 1;
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [log.content]);

  const config = {
    pm: { icon: <FileText className="text-amber-400"/>, title: "Technical Spec", color: "border-amber-500/30" },
    dev: { icon: <Code className="text-blue-400"/>, title: isRefactor ? `Refactored v${log.iteration}` : "Implementation", color: isRefactor ? "border-indigo-500/60 shadow-[0_0_20px_rgba(99,102,241,0.15)]" : "border-blue-500/30" },
    sec: { icon: <ShieldCheck className="text-emerald-400"/>, title: "Security Audit", color: "border-emerald-500/30" }
  }[log.agent];

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className={`bg-slate-900/40 border-2 ${config.color} rounded-[2rem] overflow-hidden backdrop-blur-md flex flex-col h-[500px] w-full max-w-4xl shadow-2xl relative`}>
      {isRefactor && (
        <div className="absolute top-4 right-4 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30 flex items-center gap-1.5 z-10">
          <CheckCircle size={12} className="text-indigo-400" />
          <span className="text-[10px] font-black text-indigo-300 uppercase tracking-tighter">Patched</span>
        </div>
      )}
      <div className="p-5 border-b border-slate-800 flex items-center gap-3 bg-slate-900/60">
        {config.icon}
        <h3 className="font-bold text-xs uppercase tracking-widest text-slate-300">{config.title}</h3>
      </div>
      <div ref={scrollRef} className="p-6 overflow-y-auto flex-grow custom-scrollbar">
        <div className="prose prose-invert prose-slate prose-sm max-w-none prose-headings:text-blue-400 prose-pre:bg-black/40 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-xl">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{log.content || "Processing..."}</ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}

export default App;
