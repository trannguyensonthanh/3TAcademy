import React, { useState } from 'react';
import { Button } from '../shared/ui/button';
import { Badge } from '../shared/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../shared/ui/card';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  Hand,
  Smile,
  MessageSquare,
  Sparkles,
  HelpCircle,
  Users,
  LogOut,
} from 'lucide-react';

export default function LiveRoomPage() {
  const [micOn, setMicOn] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'qa' | 'copilot' | 'attendance'>('copilot');

  return (
    <div className="h-screen w-screen bg-stone-950 text-stone-100 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 border-b border-stone-800 px-4 flex items-center justify-between bg-stone-900/90 z-20">
        <div className="flex items-center gap-3">
          <Badge variant="live">LIVE</Badge>
          <span className="text-xs font-mono text-stone-400">01:14:22</span>
          <div className="h-4 w-px bg-stone-700" />
          <h1 className="text-sm font-semibold truncate max-w-md">
            Buổi 5: Xây dựng Kiến Trúc RAG Hybrid Search với pgvector
          </h1>
          <Badge variant="ai">AI COPILOT ACTIVE</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-stone-300">
            <Users className="w-4 h-4 text-primary-dark" /> 42 người tham gia
          </div>
          <a href="/app">
            <Button variant="destructive" size="sm" className="gap-1.5">
              <LogOut className="w-4 h-4" /> Rời lớp
            </Button>
          </a>
        </div>
      </header>

      {/* Main Stage & Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Stage Video Area */}
        <div className="flex-1 bg-stone-900 p-4 flex flex-col items-center justify-center relative">
          <div className="w-full h-full max-w-5xl rounded-lg bg-stone-800 flex flex-col items-center justify-center border border-stone-700 relative overflow-hidden shadow-2xl">
            <div className="text-center p-6">
              <div className="w-24 h-24 rounded-full bg-primary/20 border-2 border-primary mx-auto mb-4 flex items-center justify-center text-primary-dark font-bold text-2xl">
                GV
              </div>
              <h3 className="text-xl font-bold">Giảng viên đang chia sẻ màn hình</h3>
              <p className="text-sm text-stone-400 mt-1">Chuyên đề Hybrid Search SQL & pgvector</p>
            </div>

            {/* Dynamic Watermark simulation */}
            <div className="absolute top-8 right-12 text-stone-500/20 text-xs font-mono select-none pointer-events-none">
              student@edutech.vn · 2026-11-07
            </div>
          </div>
        </div>

        {/* Right Interaction Sidebar */}
        <div className="w-96 border-l border-stone-800 bg-stone-900 flex flex-col">
          {/* Tabs header */}
          <div className="grid grid-cols-4 border-b border-stone-800 text-xs font-medium text-stone-400">
            <button
              onClick={() => setActiveTab('copilot')}
              className={`p-3 flex flex-col items-center gap-1 hover:text-stone-100 ${
                activeTab === 'copilot' ? 'text-primary-dark border-b-2 border-primary-dark font-semibold' : ''
              }`}
            >
              <Sparkles className="w-4 h-4" /> Copilot
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`p-3 flex flex-col items-center gap-1 hover:text-stone-100 ${
                activeTab === 'chat' ? 'text-primary-dark border-b-2 border-primary-dark font-semibold' : ''
              }`}
            >
              <MessageSquare className="w-4 h-4" /> Chat
            </button>
            <button
              onClick={() => setActiveTab('qa')}
              className={`p-3 flex flex-col items-center gap-1 hover:text-stone-100 ${
                activeTab === 'qa' ? 'text-primary-dark border-b-2 border-primary-dark font-semibold' : ''
              }`}
            >
              <HelpCircle className="w-4 h-4" /> Hỏi đáp
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`p-3 flex flex-col items-center gap-1 hover:text-stone-100 ${
                activeTab === 'attendance' ? 'text-primary-dark border-b-2 border-primary-dark font-semibold' : ''
              }`}
            >
              <Users className="w-4 h-4" /> Điểm danh
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 text-sm">
            {activeTab === 'copilot' && (
              <div className="space-y-4">
                <div className="p-3 bg-stone-800/80 rounded-lg border border-stone-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-xs text-primary-dark flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Bắt kịp bài giảng (Catch-me-up)
                    </span>
                    <Badge variant="outline" className="text-[10px]">10 phút vừa qua</Badge>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Giảng viên vừa giải thích công thức Reciprocal Rank Fusion (RRF) để kết hợp kết quả tìm kiếm giữa pgvector HNSW và tsvector GIN. Điểm số chuẩn hóa bằng công thức: 1 / (60 + rank).
                  </p>
                  <Button size="sm" variant="outline" className="w-full mt-3 text-xs h-7">
                    Cập nhật tóm tắt mới nhất
                  </Button>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-stone-400 mb-2 uppercase tracking-wider">
                    Bản ghi lời giảng trực tiếp
                  </h4>
                  <div className="space-y-2 text-xs text-stone-300 font-mono bg-stone-950/60 p-3 rounded border border-stone-800">
                    <p className="text-stone-500">[01:13:40] Giảng viên:</p>
                    <p>"Bây giờ chúng ta sẽ chạy thử câu lệnh SELECT với toán tử cosine &lt;=&gt;..."</p>
                    <p className="text-stone-500 mt-2">[01:14:10] Giảng viên:</p>
                    <p>"Các bạn chú ý đặt chỉ mục HNSW với m=16 và ef_construction=64 để cân bằng tốc độ nhé."</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="text-xs space-y-3">
                <div>
                  <span className="font-bold text-primary-dark">Nguyễn Văn An:</span> Thầy cho em hỏi ef_search nên đặt bao nhiêu ở production ạ?
                </div>
                <div>
                  <span className="font-bold text-amber-500">Trợ giảng Hoàng:</span> Chào An, thường đặt 40 đến 100 là tối ưu nhé bạn.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <footer className="h-16 border-t border-stone-800 px-6 flex items-center justify-center gap-4 bg-stone-900/90 z-20">
        <Button
          variant={micOn ? 'default' : 'secondary'}
          size="icon"
          onClick={() => setMicOn(!micOn)}
          className="rounded-full w-11 h-11"
        >
          {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-destructive" />}
        </Button>
        <Button
          variant={cameraOn ? 'default' : 'secondary'}
          size="icon"
          onClick={() => setCameraOn(!cameraOn)}
          className="rounded-full w-11 h-11"
        >
          {cameraOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5 text-destructive" />}
        </Button>
        <Button variant="secondary" size="icon" className="rounded-full w-11 h-11">
          <ScreenShare className="w-5 h-5" />
        </Button>
        <Button variant="secondary" size="icon" className="rounded-full w-11 h-11">
          <Hand className="w-5 h-5" />
        </Button>
        <Button variant="secondary" size="icon" className="rounded-full w-11 h-11">
          <Smile className="w-5 h-5" />
        </Button>
      </footer>
    </div>
  );
}

