import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../shared/ui/card';
import { Badge } from '../shared/ui/badge';
import { Button } from '../shared/ui/button';
import { Video, BookOpen, Clock, AlertTriangle, ArrowRight } from 'lucide-react';

export default function StudentDashboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Banner Live Event Today */}
      <div className="p-6 rounded-lg bg-live/10 border border-live/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="live">ĐANG LIVE</Badge>
            <span className="text-sm font-semibold text-live">Lớp học đang diễn ra</span>
          </div>
          <h2 className="text-2xl font-bold">Buổi 5: Xây dựng Kiến Trúc RAG Hybrid Search với pgvector</h2>
          <p className="text-sm text-muted-foreground">Đợt học: AI-ENG-2026-K01 · Giảng viên: Thầy B (Dạy thay Thầy A)</p>
        </div>
        <a href="/live/5">
          <Button size="lg" className="bg-live hover:bg-live/90 text-white gap-2 font-semibold">
            <Video className="w-5 h-5" /> Vào phòng Live ngay
          </Button>
        </a>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Continue Learning */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" /> Tiếp Tục Học Tập
            </CardTitle>
            <CardDescription>Tiếp tục từ buổi học xem gần nhất của bạn</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border rounded-md flex items-center justify-between">
              <div>
                <h4 className="font-semibold">Buổi 4: Kỹ thuật Chunking & Parsing Tài liệu Chống Zip-bomb</h4>
                <p className="text-sm text-muted-foreground">Đã xem 45:10 / 01:30:00 (50%)</p>
                <div className="w-full bg-muted h-2 rounded-full mt-2 overflow-hidden">
                  <div className="bg-primary h-full w-1/2"></div>
                </div>
              </div>
              <a href="/app/cohorts/1/sessions/4">
                <Button size="sm">Học tiếp</Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Deadlines & Quizzes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" /> Bài Tập Sắp Đến Hạn
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 bg-muted/40 rounded border space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Còn 18 giờ
                </span>
                <Badge variant="outline">Coding</Badge>
              </div>
              <h5 className="font-medium text-sm">Thực hành Token Bucket Rate Limiter</h5>
              <a href="/app/code" className="text-xs text-primary font-medium hover:underline inline-block mt-1">
                Làm bài ngay →
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Recommendations */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Khóa Học Đề Xuất Tiếp Theo</CardTitle>
            <Badge variant="ai">AI REC</Badge>
          </div>
          <CardDescription>
            Đề xuất dựa trên mức độ làm chủ kỹ năng (ZPD) từ hồ sơ học tập của bạn
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 border rounded-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h4 className="font-semibold text-base">Backend High Performance với Node.js & PostgreSQL</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Vì bạn đã vững kiến thức Python Core và SQL Modeling (85%), khóa học này sẽ giúp bạn hoàn thiện kỹ năng thiết kế hệ thống phân tán quy mô lớn.
              </p>
            </div>
            <a href="/courses/backend-nodejs-postgresql">
              <Button variant="outline" className="gap-2 whitespace-nowrap">
                Xem lộ trình <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
