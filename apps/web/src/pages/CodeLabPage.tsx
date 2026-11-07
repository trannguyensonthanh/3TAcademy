import React, { useState } from 'react';
import { Button } from '../shared/ui/button';
import { Badge } from '../shared/ui/badge';
import { Play, RotateCcw, Terminal, Code2 } from 'lucide-react';

export default function CodeLabPage() {
  const [language, setLanguage] = useState<'python' | 'javascript' | 'sql'>('python');
  const [code, setCode] = useState<string>(
    `# Viết hàm tính cosine similarity giữa 2 vector\nimport math\n\ndef cosine_similarity(v1, v2):\n    dot = sum(a * b for a, b in zip(v1, v2))\n    norm_v1 = math.sqrt(sum(a * a for a in v1))\n    norm_v2 = math.sqrt(sum(b * b for b in v2))\n    return dot / (norm_v1 * norm_v2) if norm_v1 and norm_v2 else 0.0\n\nprint("Cosine sim:", cosine_similarity([1.0, 2.0], [2.0, 4.0]))`
  );
  const [output, setOutput] = useState<string>('Cosine sim: 1.0\n[Thực thi hoàn tất trong 32ms]');
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    try {
      const res = await fetch('/api/v1/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, stdin: '' }),
      });
      const data = await res.json();
      setOutput(data.stdout || data.stderr || 'Không có output');
    } catch {
      setOutput('Lỗi khi gửi yêu cầu thực thi mã tới Sandbox Server');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col bg-background">
      {/* Code Lab Header */}
      <div className="h-14 border-b px-6 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <Code2 className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-base">Code Lab & Sân Chơi Lập Trình</h1>
          <Badge variant="outline">Sandbox Stateless</Badge>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm font-medium"
          >
            <option value="python">Python 3.12</option>
            <option value="javascript">Node.js (JavaScript)</option>
            <option value="sql">PostgreSQL SQL</option>
          </select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCode('')}>
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleRun} disabled={isRunning}>
            <Play className="w-4 h-4" /> {isRunning ? 'Đang chạy...' : 'Chạy code (Ctrl+Enter)'}
          </Button>
        </div>
      </div>

      {/* Editor & Console Split */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Code Editor Area */}
        <div className="flex-1 border-r flex flex-col bg-stone-950 text-stone-100 font-mono text-sm p-4 overflow-auto">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-full bg-transparent resize-none outline-none font-mono text-sm leading-relaxed"
            placeholder="Viết mã nguồn tại đây..."
            spellCheck={false}
          />
        </div>

        {/* Output Console */}
        <div className="w-full md:w-96 bg-stone-900 text-stone-100 flex flex-col border-t md:border-t-0">
          <div className="h-10 border-b border-stone-800 px-4 flex items-center gap-2 text-xs font-semibold text-stone-400">
            <Terminal className="w-4 h-4" /> Bảng điều khiển Console (Stdout / Stderr)
          </div>
          <pre className="flex-1 p-4 font-mono text-xs text-stone-300 overflow-auto whitespace-pre-wrap">
            {output}
          </pre>
        </div>
      </div>
    </div>
  );
}

