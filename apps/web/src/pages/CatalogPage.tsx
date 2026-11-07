import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../shared/ui/card';
import { Badge } from '../shared/ui/badge';
import { Button } from '../shared/ui/button';
import { Input } from '../shared/ui/input';
import { Search, Calendar, Users, Star } from 'lucide-react';

export default function CatalogPage() {
  const sampleCourses = [
    {
      id: 1,
      slug: 'ai-engineering-production',
      title: 'AI Engineering & LLM Production',
      category: 'Trí Tuệ Nhân Tạo',
      difficulty: 4,
      rating: 4.9,
      cohortCode: 'AI-ENG-2026-K01',
      startDate: '15/11/2026',
      seatsLeft: 8,
      tuitionVnd: 8500000,
    },
    {
      id: 2,
      slug: 'backend-nodejs-postgresql',
      title: 'Backend High Performance với Node.js & PostgreSQL',
      category: 'Kỹ Thuật Phần Mềm',
      difficulty: 3,
      rating: 4.85,
      cohortCode: 'BE-NODE-2026-K02',
      startDate: '20/11/2026',
      seatsLeft: 5,
      tuitionVnd: 6900000,
    },
    {
      id: 3,
      slug: 'data-analysis-sql-python',
      title: 'Data Analysis Thực Chiến với SQL, Python & Tableau',
      category: 'Dữ Liệu',
      difficulty: 2,
      rating: 4.8,
      cohortCode: 'DA-2026-K01',
      startDate: '01/12/2026',
      seatsLeft: 12,
      tuitionVnd: 5500000,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Danh Mục Khóa Học & Đợt Khai Giảng</h1>
        <p className="text-muted-foreground">
          Lựa chọn chương trình đào tạo chuyên sâu và đợt học phù hợp với lịch trình của bạn.
        </p>
      </div>

      <div className="flex gap-4 mb-8">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Tìm kiếm theo tên khóa học hoặc kỹ năng (Python, SQL, RAG...)" className="pl-9" />
        </div>
        <Button variant="outline">Bộ lọc kỹ năng</Button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {sampleCourses.map((c) => (
          <Card key={c.id} className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline">{c.category}</Badge>
                <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                  <Star className="w-3.5 h-3.5 fill-current" /> {c.rating}
                </span>
              </div>
              <CardTitle className="text-xl leading-snug">{c.title}</CardTitle>
              <CardDescription>Mã đợt mở lớp: <span className="font-mono font-medium text-foreground">{c.cohortCode}</span></CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Khai giảng: {c.startDate}
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Còn trống: <span className="font-semibold text-foreground">{c.seatsLeft} chỗ</span>
              </div>
              <div className="text-xl font-bold text-primary pt-2">
                {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(c.tuitionVnd)}
              </div>
            </CardContent>
            <CardFooter>
              <a href={`/courses/${c.slug}`} className="w-full">
                <Button className="w-full">Xem chi tiết & Ghi danh</Button>
              </a>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

