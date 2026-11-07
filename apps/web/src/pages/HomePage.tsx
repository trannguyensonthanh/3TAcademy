import React from 'react';
import { Button } from '../shared/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../shared/ui/card';
import { Badge } from '../shared/ui/badge';
import { Sparkles, Video, Users, Award, ShieldCheck, ChevronRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <a href="/" className="font-bold text-xl text-primary tracking-tight">
              3T ACADEMY
            </a>
            <nav className="hidden md:flex gap-6 text-sm font-medium text-muted-foreground">
              <a href="/courses" className="hover:text-foreground">Khóa học</a>
              <a href="/instructors" className="hover:text-foreground">Giảng viên</a>
              <a href="/advisor" className="hover:text-foreground flex items-center gap-1">
                Tư vấn AI <Badge variant="ai">AI</Badge>
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login">
              <Button variant="ghost" size="sm">Đăng nhập</Button>
            </a>
            <a href="/courses">
              <Button size="sm">Đăng ký học</Button>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 text-center max-w-4xl mx-auto">
        <Badge variant="outline" className="mb-4">Học viện Đào tạo Trực tuyến Thế Hệ Mới</Badge>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6">
          Làm Chủ Kỹ Năng Công Nghệ Thực Chiến Qua Lớp Học Trực Tiếp & AI Đa Phương Thức
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          Học trực tiếp cùng Chuyên gia đầu ngành theo từng Đợt (Cohort), xem lại bản ghi mã hóa AES-128 chống rò rỉ, và được hỗ trợ 24/7 bởi Trợ giảng AI bám sát từng mốc thời gian bài giảng.
        </p>
        <div className="flex justify-center gap-4">
          <a href="/courses">
            <Button size="lg" className="gap-2">
              Khám phá các đợt mở lớp <ChevronRight className="w-4 h-4" />
            </Button>
          </a>
          <a href="/advisor">
            <Button variant="outline" size="lg">Hỏi đáp với AI Advisor</Button>
          </a>
        </div>
      </section>

      {/* Highlights Grid */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <Video className="w-8 h-8 text-primary mb-2" />
              <CardTitle className="text-lg">Live Classroom</CardTitle>
              <CardDescription>
                Học trực tuyến LiveKit mượt mà, hỏi đáp trực tiếp, điểm danh tự động và AI Live Copilot tóm tắt 10 phút.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="w-8 h-8 text-primary mb-2" />
              <CardTitle className="text-lg">Bảo Vệ Bản Quyền</CardTitle>
              <CardDescription>
                Bản ghi mã hóa HLS AES-128 và Watermark động chuyển động liên tục chống rò rỉ tài liệu học tập.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Sparkles className="w-8 h-8 text-primary mb-2" />
              <CardTitle className="text-lg">Hybrid RAG AI</CardTitle>
              <CardDescription>
                Trợ giảng AI đối chiếu tri thức theo từng giây video (mm:ss) và từng trang tài liệu PDF của lớp học.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Award className="w-8 h-8 text-primary mb-2" />
              <CardTitle className="text-lg">Chứng Chỉ Xác Thực</CardTitle>
              <CardDescription>
                Thi cuối khóa có giám sát Computer Vision 2 tầng, cấp chứng chỉ số có chữ ký HMAC và QR tra cứu.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
}
