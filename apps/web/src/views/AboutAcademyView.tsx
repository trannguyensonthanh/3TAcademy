import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  BookOpen,
  Users,
  Clock,
  CheckSquare,
  Award,
  HeartHandshake,
  ArrowRight,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import {
  AiTutorCompanionSticker,
  CompetencyVerifiedShield,
} from '../components/BotanicalStickers';
import { useAsyncData } from '../hooks/useAsyncData';
import { catalogApi } from '../services/catalog.api';

const ACADEMY_STORY_STEPS = [
  {
    step: 'Bước 1',
    title: 'Hiểu đúng xuất phát điểm để chọn lớp học vừa sức',
    description:
      'Trước khi đăng ký bất kỳ khóa học nào, chúng mình luôn khuyên bạn nhìn lại những kỹ năng mình đã có và mục tiêu công việc sắp tới. Từ đó, bạn sẽ biết mình nên bắt đầu từ lớp nền tảng hay vào thẳng lớp làm dự án chuyên sâu mà không tốn thời gian học lan man.',
    icon: BookOpen,
  },
  {
    step: 'Bước 2',
    title: 'Học trực tuyến buổi tối cùng Giảng viên và Trợ giảng theo sát',
    description:
      'Mỗi tuần lớp học gặp nhau 2 buổi tối cố định. Thầy cô giảng giải trực tiếp và cùng bạn viết mã nguồn ngay trên lớp. Nếu hôm nào bạn đi làm về muộn vào lớp trễ 10–15 phút, chỉ cần bấm xem tóm tắt nhanh là nắm được ngay những ý chính thầy vừa nói.',
    icon: Users,
  },
  {
    step: 'Bước 3',
    title: 'Tự ôn bài đêm khuya vẫn luôn có người chỉ dẫn tận tình',
    description:
      'Những lúc xem lại bản ghi buổi học lúc khuya mà gặp chỗ chưa hiểu, bạn có thể đặt câu hỏi ngay tại đó. Hệ thống trợ giảng sẽ giải thích cặn kẽ và chỉ cho bạn đúng phút, đúng giây trong video cũng như trang tài liệu mà thầy đã giảng về phần kiến thức ấy.',
    icon: Clock,
  },
  {
    step: 'Bước 4',
    title: 'Làm bài tập thực hành sau mỗi buổi và được góp ý chi tiết',
    description:
      'Để kiến thức thực sự biến thành kỹ năng của riêng bạn, cuối mỗi buổi đều có một bài tập ngắn vừa sức. Với các dự án thực hành lớn hơn, giảng viên và trợ giảng sẽ đọc và nhận xét từng phần bạn làm tốt, đồng thời chỉ rõ đoạn bài giảng cần xem lại nếu bạn còn nhầm lẫn.',
    icon: CheckSquare,
  },
  {
    step: 'Bước 5',
    title: 'Hoàn thành đồ án, làm đẹp CV và luyện trả lời phỏng vấn trước khi đi làm',
    description:
      'Kết thúc khóa học, toàn bộ kỹ năng và đồ án thực tế bạn vừa hoàn thành sẽ được tổng hợp lại vào bản CV mới sạch đẹp, sẵn sàng gửi nhà tuyển dụng. Bạn cũng có thêm những buổi luyện phỏng vấn 1-1 bằng giọng nói để rèn sự tự tin trước khi bước vào các buổi phỏng vấn thật.',
    icon: Award,
  },
];

export const AboutAcademyView: React.FC = () => {
  const { navigate } = useAcademy();
  const { data: faqsData } = useAsyncData(() => catalogApi.getFaqs(), []);
  const ACADEMY_FAQS = faqsData ?? [];
  const [openFaqIds, setOpenFaqIds] = useState<string[]>([
    'faq-1',
    'faq-2',
    'faq-3',
    'faq-4',
    'faq-5',
    'faq-6',
  ]);

  const toggleFaq = (id: string) => {
    setOpenFaqIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-[1120px] mx-auto px-6 pt-10 pb-28 space-y-16">
      {/* 1. Câu chuyện về Học viện — Chân thành, gần gũi, không có nút quét CV hay phỏng vấn AI */}
      <section className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-8 sm:p-10 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300 text-xs font-semibold">
          <HeartHandshake className="w-3.5 h-3.5 text-[#10B981]" />
          <span>Về 3T Academy · Triết lý đào tạo tử tế &amp; thực chất</span>
        </div>

        <h1 className="text-2xl sm:text-4xl font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-tight max-w-3xl">
          Nơi Bạn Không Phải Tự Bơi Một Mình Trên Con Đường Học Công Nghệ
        </h1>

        <div className="space-y-4 text-sm sm:text-base text-[#475569] dark:text-[#94A3B8] leading-relaxed max-w-3xl">
          <p>
            Chúng mình hiểu cảm giác quen thuộc của rất nhiều bạn khi mua một khóa học video thu sẵn: tuần đầu tiên rất hào hứng, nhưng tới tuần thứ hai gặp một lỗi nhỏ không biết hỏi ai, công việc trên công ty lại bận rộn, thế là bỏ dở lúc nào không hay.
          </p>
          <p>
            3T Academy ra đời để thay đổi điều đó. Tại đây, bạn học theo từng đợt khai giảng cố định cùng những người thầy đang làm nghề thực tế, có trợ giảng theo sát chữa bài, và có các công cụ học tập vừa đủ thông minh để đỡ đần bạn lúc đêm khuya — giúp bạn đi trọn vẹn từ buổi học đầu tiên cho tới ngày cầm sản phẩm trên tay đi ứng tuyển.
          </p>
        </div>

        <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
          <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1">
            <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
              Cam kết chất lượng đầu ra
            </div>
            <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Học thật, làm đồ án thật, không chạy theo lý thuyết suông
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1">
            <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
              Sự đồng hành sát sao
            </div>
            <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Mỗi lớp đều có Giảng viên chính &amp; Trợ giảng chữa bài từng tuần
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1">
            <div className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
              Linh hoạt cho người đi làm
            </div>
            <div className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Học buổi tối, có bản ghi nét cao và tóm tắt nhanh khi bận việc
            </div>
          </div>
        </div>
      </section>

      {/* 2. Cách chúng mình đồng hành cùng học viên qua 5 bước */}
      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            Cách 3T Academy Đồng Hành Cùng Bạn Trong Suốt Khóa Học
          </h2>
          <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
            Một lộ trình học tập mạch lạc, vừa vặn với quỹ thời gian buổi tối của sinh viên và người đi làm.
          </p>
        </div>

        <div className="space-y-4">
          {ACADEMY_STORY_STEPS.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.step}
                className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 sm:p-7 flex items-start gap-4"
              >
                <div className="w-11 h-11 rounded-2xl bg-[#D1FAE5] dark:bg-emerald-950/90 text-[#065F46] dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <div className="inline-block font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-[#10B981] text-white">
                    {item.step}
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5] leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. CÂU HỎI THƯỜNG GẶP (ĐẶT ĐỘC QUYỀN TẠI TRANG VỀ HỌC VIỆN) */}
      <section className="space-y-6">
        <div className="flex items-center gap-3">
          <AiTutorCompanionSticker className="w-10 h-10 shrink-0" />
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Những Câu Hỏi Thường Gặp
            </h2>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8]">
              Giải đáp rõ ràng những băn khoăn phổ biến nhất của các bạn trước khi bắt đầu một đợt học mới.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {ACADEMY_FAQS.map((faq) => {
            const isOpen = openFaqIds.includes(faq.id);
            return (
              <div
                key={faq.id}
                className="rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] overflow-hidden"
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-[#F7FBF9] dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    {faq.question}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-[#10B981] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#475569] shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 border-t border-[#E2ECE7] dark:border-[#1E2D24] text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Simple Course Exploration Link */}
      <section className="rounded-xl bg-[#D1FAE5]/70 dark:bg-emerald-950/80 border border-[#10B981] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <CompetencyVerifiedShield className="w-12 h-12 shrink-0" />
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Sẵn sàng tìm lớp học phù hợp với thời gian biểu của bạn?
            </h3>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8]">
              Xem lịch khai giảng chi tiết và nội dung từng buổi học của các đợt sắp mở trong tháng này nhé.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/courses')}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap shrink-0"
        >
          <span>Xem Danh Mục Khóa Học</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </section>
    </div>
  );
};
