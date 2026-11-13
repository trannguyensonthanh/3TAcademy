export interface McqQuestionItem {
  id?: string;
  number: number;
  scenarioTag: string;
  prompt: string;
  options: [string, string, string, string] | string[];
  correctIndex: number;
  explanation: string;
  skillCode: string;
  skillName: string;
  reviewTimestampLabel: string;
  reviewJumpSec: number;
  reviewSegmentRangeSec?: [number, number];
  slideLabel: string;
}

export interface StudentSafePromptConfigItem {
  id?: string;
  number: number;
  scenarioTag: string;
  prompt: string;
  options: [string, string, string, string] | string[];
  skillCode: string;
  skillName: string;
  slideLabel: string;
}

export type StudentSafeMcqPromptItem = StudentSafePromptConfigItem;

export type AssessmentPublishStatus = 'DRAFT' | 'PUBLISHED';

/**
 * 10 Câu hỏi Trắc nghiệm 4 đáp án (A, B, C, D) chuẩn cho Bài Kiểm Tra Mở Khóa Cuối Mỗi Buổi Học
 */
export const SESSION_4_MCQ_QUESTIONS: McqQuestionItem[] = [
  {
    number: 1,
    scenarioTag: 'Câu 1/10 · Giữ nguyên cấu trúc bảng biểu PDF',
    prompt:
      'Khi đọc một báo cáo tài chính PDF dài 80 trang có nhiều bảng số liệu, cách cắt văn bản nào giúp Trợ lý AI trả lời chính xác từng con số mà không bị đứt gãy dòng?',
    options: [
      'Nhận diện tiêu đề mục và chuyển nguyên bảng số liệu sang Markdown kèm số trang gốc',
      'Cắt cố định cứ đúng 300 ký tự một đoạn bất kể đang ở giữa bảng số liệu',
      'Xóa toàn bộ các con số trong bảng trước khi lưu vào cơ sở dữ liệu',
      'Gộp toàn bộ 80 trang PDF thành một chuỗi ký tự duy nhất không ngắt đoạn',
    ],
    correctIndex: 0,
    explanation:
      'Giữ nguyên cấu trúc bảng Markdown kèm tiêu đề mục cha giúp mô hình ngôn ngữ đọc đúng hàng và cột mà không bị trộn lẫn số liệu giữa các trang.',
    skillCode: 'DOCLING-CHUNK',
    skillName: 'Đọc & Chia nhỏ tài liệu thông minh',
    reviewTimestampLabel: '00:10 - 00:25',
    reviewJumpSec: 10,
    reviewSegmentRangeSec: [10, 25],
    slideLabel: 'Slide Trang 8',
  },
  {
    number: 2,
    scenarioTag: 'Câu 2/10 · Kết hợp tìm kiếm từ khóa & tìm kiếm ngữ nghĩa',
    prompt:
      'Vì sao trong bài giảng thầy Khoa khuyên nên kết hợp cả tìm kiếm từ khóa chính xác lẫn tìm kiếm theo ý nghĩa câu hỏi?',
    options: [
      'Để vừa bắt trúng các mã hợp đồng, tên riêng chính xác vừa hiểu đúng ý câu hỏi tự nhiên của người dùng',
      'Để tăng gấp đôi dung lượng ổ cứng lưu trữ không cần thiết',
      'Vì tìm kiếm theo ý nghĩa câu hỏi không thể hoạt động trên tiếng Việt',
      'Để bắt người dùng phải nhập câu hỏi bằng tiếng Anh',
    ],
    correctIndex: 0,
    explanation:
      'Tìm kiếm từ khóa rất mạnh với mã số, ký hiệu; trong khi tìm kiếm ngữ nghĩa hiểu được các cách diễn đạt đồng nghĩa.',
    skillCode: 'HYBRID-RAG',
    skillName: 'Tìm kiếm kết hợp từ khóa & ngữ nghĩa',
    reviewTimestampLabel: '00:25 - 00:40',
    reviewJumpSec: 25,
    reviewSegmentRangeSec: [25, 40],
    slideLabel: 'Slide Trang 12',
  },
  {
    number: 3,
    scenarioTag: 'Câu 3/10 · Chống trả lời sai lệch (Trích dẫn nguồn)',
    prompt:
      'Khi kho tài liệu nội bộ không có thông tin cho câu hỏi của khách hàng, Trợ lý AI cần phản hồi như thế nào để đảm bảo an toàn?',
    options: [
      'Thông báo lịch sự rằng tài liệu hiện tại chưa có thông tin này và gợi ý chuyển câu hỏi cho nhân viên hỗ trợ',
      'Tự suy đoán câu trả lời gần đúng để khách hàng không phải chờ',
      'Lấy đại một con số từ trang bất kỳ trong tài liệu để trả lời',
      'Tự động xóa câu hỏi của khách hàng khỏi lịch sử trò chuyện',
    ],
    correctIndex: 0,
    explanation:
      'Nguyên tắc quan trọng nhất của Trợ lý AI doanh nghiệp là chỉ trả lời dựa trên tài liệu được cung cấp kèm số trang trích dẫn rõ ràng.',
    skillCode: 'FAITHFULNESS',
    skillName: 'Kiểm soát độ chính xác & Trích dẫn nguồn',
    reviewTimestampLabel: '00:10 - 00:25',
    reviewJumpSec: 10,
    reviewSegmentRangeSec: [10, 25],
    slideLabel: 'Slide Trang 8',
  },
  {
    number: 4,
    scenarioTag: 'Câu 4/10 · Xử lý bất đồng bộ & Tối ưu tốc độ phản hồi',
    prompt:
      'Để giữ thời gian phản hồi của hệ thống tìm kiếm dưới 1 giây khi có nhiều học viên hỏi cùng lúc, bước nào sau đây là hiệu quả nhất?',
    options: [
      'Chạy song song bước tìm từ khóa và tìm ngữ nghĩa bằng xử lý bất đồng bộ (Promise.all), sau đó chỉ chấm điểm tinh lọc trên 20 đoạn phù hợp nhất',
      'Chấm điểm lại toàn bộ 100.000 đoạn văn bản trong cơ sở dữ liệu ở mỗi lần hỏi',
      'Tắt hoàn toàn bộ nhớ đệm (Cache) của máy chủ',
      'Đợi người trước hỏi xong 5 phút mới cho người tiếp theo gửi câu hỏi',
    ],
    correctIndex: 0,
    explanation:
      'Xử lý bất đồng bộ song song và lọc sơ bộ 20 đoạn đầu giúp giảm hơn 70% thời gian chờ mà vẫn giữ nguyên độ chính xác.',
    skillCode: 'ASYNC-LATENCY',
    skillName: 'Xử lý bất đồng bộ & Tối ưu tốc độ',
    reviewTimestampLabel: '00:45 - 01:05',
    reviewJumpSec: 45,
    reviewSegmentRangeSec: [45, 65],
    slideLabel: 'Slide Trang 18',
  },
  {
    number: 5,
    scenarioTag: 'Câu 5/10 · Phân quyền truy cập tài liệu nội bộ',
    prompt:
      'Khi nhân viên phòng Kinh doanh đặt câu hỏi cho Trợ lý AI, làm thế nào để đảm bảo hệ thống không vô tình trích dẫn tài liệu mật của phòng Nhân sự?',
    options: [
      'Kiểm tra và lọc quyền truy cập theo phòng ban của người hỏi ngay trong câu lệnh tìm kiếm cơ sở dữ liệu trước khi đưa văn bản cho AI tổng hợp',
      'Đưa toàn bộ tài liệu mật cho AI đọc rồi dặn AI đừng tiết lộ',
      'Chỉ ẩn tên file tài liệu trên màn hình giao diện người dùng',
      'Yêu cầu nhân viên tự cam kết không hỏi về lương thưởng',
    ],
    correctIndex: 0,
    explanation:
      'Phân quyền phải được thực hiện ngay ở bước truy vấn dữ liệu để những đoạn tài liệu không thuộc quyền hạn tuyệt đối không đi vào bước tổng hợp câu trả lời.',
    skillCode: 'DATA-SECURITY',
    skillName: 'Bảo mật & Phân quyền tài liệu AI',
    reviewTimestampLabel: '00:25 - 00:45',
    reviewJumpSec: 25,
    reviewSegmentRangeSec: [25, 45],
    slideLabel: 'Slide Trang 12',
  },
  {
    number: 6,
    scenarioTag: 'Câu 6/10 · Lưu trữ siêu dữ liệu (Metadata) cho từng đoạn văn',
    prompt:
      'Khi lưu từng đoạn văn bản đã tách vào bảng PostgreSQL, thông tin đính kèm (Metadata) nào sau đây là bắt buộc phải có để học viên/nhân viên kiểm chứng nguồn?',
    options: [
      'Tên file tài liệu gốc, số trang PDF và tiêu đề mục cha của đoạn văn bản đó',
      'Màu sắc hình nền của máy tính người tải file',
      'Dung lượng RAM còn trống của máy chủ lúc tải file',
      'Tên trình duyệt web của người dùng',
    ],
    correctIndex: 0,
    explanation:
      'Lưu kèm tên file, số trang và tiêu đề mục cha giúp hiển thị nút trích dẫn chính xác tới từng trang tài liệu gốc.',
    skillCode: 'DOCLING-CHUNK',
    skillName: 'Đọc & Chia nhỏ tài liệu thông minh',
    reviewTimestampLabel: '00:10 - 00:22',
    reviewJumpSec: 10,
    reviewSegmentRangeSec: [10, 22],
    slideLabel: 'Slide Trang 8',
  },
  {
    number: 7,
    scenarioTag: 'Câu 7/10 · Độ chồng lấp ngữ cảnh (Chunk Overlap)',
    prompt:
      'Vì sao khi tách các đoạn văn bản dài, chúng ta thường giữ lại một phần nhỏ câu cuối của đoạn trước lặp lại ở đầu đoạn tiếp theo (Overlap)?',
    options: [
      'Để câu văn ở ranh giới giữa hai đoạn không bị mất chủ ngữ hoặc đứt mạch ý nghĩa khi tìm kiếm',
      'Để làm cho file cơ sở dữ liệu nặng gấp 10 lần',
      'Để thay thế hoàn toàn việc đánh chỉ mục cơ sở dữ liệu',
      'Vì cơ sở dữ liệu không cho phép lưu các đoạn văn khác nhau hoàn toàn',
    ],
    correctIndex: 0,
    explanation:
      'Giữ độ gối đầu hợp lý (10% - 15%) giúp bảo toàn mạch ngữ nghĩa ở điểm cắt giữa hai đoạn liên tiếp.',
    skillCode: 'DOCLING-CHUNK',
    skillName: 'Đọc & Chia nhỏ tài liệu thông minh',
    reviewTimestampLabel: '00:15 - 00:30',
    reviewJumpSec: 15,
    reviewSegmentRangeSec: [15, 30],
    slideLabel: 'Slide Trang 9',
  },
  {
    number: 8,
    scenarioTag: 'Câu 8/10 · Chuẩn hóa câu hỏi đầu vào của người dùng',
    prompt:
      'Nếu người dùng gửi câu hỏi tiếp nối ngắn gọn như "Còn phí phạt trả chậm thì sao?", bước xử lý nào giúp hệ thống tìm kiếm hiểu đúng ngữ cảnh?',
    options: [
      'Kết hợp lịch sử câu hỏi ngay trước đó để viết lại thành câu hỏi đầy đủ chủ ngữ trước khi đem đi tìm kiếm tài liệu',
      'Bắt người dùng phải thoát ra đăng nhập lại từ đầu',
      'Chỉ lấy đúng chữ "sao" để tìm kiếm trong cơ sở dữ liệu',
      'Trả về ngẫu nhiên một trang tài liệu bất kỳ',
    ],
    correctIndex: 0,
    explanation:
      'Làm rõ ngữ cảnh câu hỏi dựa trên lịch sử hội thoại giúp truy vấn tìm kiếm bám sát chủ đề đang trao đổi.',
    skillCode: 'HYBRID-RAG',
    skillName: 'Tìm kiếm kết hợp từ khóa & ngữ nghĩa',
    reviewTimestampLabel: '00:25 - 00:40',
    reviewJumpSec: 25,
    reviewSegmentRangeSec: [25, 40],
    slideLabel: 'Slide Trang 14',
  },
  {
    number: 9,
    scenarioTag: 'Câu 9/10 · Kiểm soát ngưỡng độ tin cậy (Similarity Threshold)',
    prompt:
      'Khi tất cả các đoạn tài liệu tìm được đều có điểm tương đồng rất thấp so với câu hỏi, hệ thống nên xử lý thế nào?',
    options: [
      'Dừng ngay bước sinh câu trả lời và báo rõ chưa tìm thấy tài liệu phù hợp để tránh suy diễn sai',
      'Vẫn ép mô hình ngôn ngữ bịa ra câu trả lời dài 5 trang',
      'Tự động xóa bảng dữ liệu trong PostgreSQL',
      'Đổi mật khẩu tài khoản của người hỏi',
    ],
    correctIndex: 0,
    explanation:
      'Chặn sớm khi điểm tương đồng dưới ngưỡng an toàn giúp tiết kiệm chi phí gọi mô hình và ngăn chặn trả lời sai sự thật.',
    skillCode: 'FAITHFULNESS',
    skillName: 'Kiểm soát độ chính xác & Trích dẫn nguồn',
    reviewTimestampLabel: '00:45 - 01:00',
    reviewJumpSec: 45,
    reviewSegmentRangeSec: [45, 60],
    slideLabel: 'Slide Trang 18',
  },
  {
    number: 10,
    scenarioTag: 'Câu 10/10 · Giám sát chất lượng phản hồi thực tế',
    prompt:
      'Thông số nào cần được ghi nhận sau mỗi lượt Trợ lý AI trả lời để đội ngũ kỹ thuật kịp thời phát hiện bài toán chậm hoặc thiếu tài liệu?',
    options: [
      'Thời gian phản hồi (ms), danh sách đoạn tài liệu đã trích dẫn và nút đánh giá Hữu ích / Chưa chính xác của người dùng',
      'Hình nền màn hình máy tính cá nhân của người dùng',
      'Danh sách các phần mềm nghe nhạc đang mở trên máy khách',
      'Mật khẩu email cá nhân của nhân viên',
    ],
    correctIndex: 0,
    explanation:
      'Theo dõi thời gian phản hồi, nguồn trích dẫn và phản hồi người dùng giúp cải thiện kho tài liệu liên tục.',
    skillCode: 'ASYNC-LATENCY',
    skillName: 'Xử lý bất đồng bộ & Tối ưu tốc độ',
    reviewTimestampLabel: '00:45 - 01:15',
    reviewJumpSec: 45,
    reviewSegmentRangeSec: [45, 75],
    slideLabel: 'Slide Trang 20',
  },
];

const EXTRA_FINAL_EXAM_TOPICS: {
  tag: string;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  skillCode: string;
  skillName: string;
  jumpSec: number;
  rangeSec: [number, number];
  timeLabel: string;
  slideLabel: string;
}[] = [
  {
    tag: 'Thiết kế chỉ mục tìm kiếm trên PostgreSQL',
    prompt:
      'Khi bảng tài liệu đạt trên 500.000 đoạn văn bản, loại chỉ mục nào trên PostgreSQL giúp tìm kiếm các đoạn gần nghĩa nhất trong vài chục mili-giây?',
    options: [
      'Chỉ mục đồ thị phân층 HNSW trên cột vector kết hợp chỉ mục B-Tree cho cột mã phòng ban',
      'Không dùng chỉ mục nào cả, quét tuần tự từng dòng mỗi khi có người hỏi',
      'Lưu toàn bộ dữ liệu ra file văn bản .txt trên màn hình Desktop',
      'Xóa bớt 90% tài liệu của công ty mỗi tuần',
    ],
    correctIndex: 0,
    explanation:
      'Chỉ mục HNSW kết hợp lọc B-Tree giúp tìm kiếm nhanh gấp hàng chục lần so với quét tuần tự toàn bảng.',
    skillCode: 'PGVECTOR-INDEX',
    skillName: 'Tối ưu cơ sở dữ liệu PostgreSQL',
    jumpSec: 25,
    rangeSec: [25, 45],
    timeLabel: '00:25 - 00:45',
    slideLabel: 'Slide Trang 12',
  },
  {
    tag: 'Truyền phản hồi từng chữ (Streaming)',
    prompt:
      'Để người dùng nhìn thấy chữ đầu tiên của câu trả lời chỉ sau 0.4 giây thay vì phải đợi 5 giây cho toàn bộ văn bản, kỹ thuật nào được sử dụng?',
    options: [
      'Truyền dữ liệu theo luồng thời gian thực (Server-Sent Events / Streaming) từ máy chủ xuống trình duyệt',
      'Bắt trình duyệt tải lại toàn bộ trang web mỗi 1 giây',
      'Gửi câu trả lời qua đường bưu điện',
      'Chỉ cho phép câu trả lời dài tối đa 3 từ',
    ],
    correctIndex: 0,
    explanation:
      'Streaming giúp hiển thị từng cụm từ ngay khi mô hình vừa sinh ra, mang lại cảm giác phản hồi tức thì.',
    skillCode: 'FASTAPI-STREAM',
    skillName: 'Xây dựng dịch vụ API tốc độ cao',
    jumpSec: 45,
    rangeSec: [45, 70],
    timeLabel: '00:45 - 01:10',
    slideLabel: 'Slide Trang 18',
  },
  {
    tag: 'Bảo vệ thông tin cá nhân nhạy cảm (PII)',
    prompt:
      'Trước khi gửi nội dung câu hỏi hoặc tài liệu ra dịch vụ AI bên ngoài, bước xử lý an toàn nào cần được thực hiện tự động?',
    options: [
      'Nhận diện và che mờ các thông tin nhạy cảm như số căn cước, số thẻ ngân hàng, mật khẩu',
      'Đính kèm thêm mật khẩu quản trị viên vào câu hỏi',
      'Công khai toàn bộ câu hỏi lên mạng xã hội',
      'Tắt tường lửa của máy chủ doanh nghiệp',
    ],
    correctIndex: 0,
    explanation:
      'Che mờ dữ liệu nhạy cảm (PII Masking) giúp bảo vệ quyền riêng tư của khách hàng và tuân thủ quy định an toàn thông tin.',
    skillCode: 'DATA-SECURITY',
    skillName: 'Bảo mật & Phân quyền tài liệu AI',
    jumpSec: 10,
    rangeSec: [10, 30],
    timeLabel: '00:10 - 00:30',
    slideLabel: 'Slide Trang 8',
  },
  {
    tag: 'Tối ưu bộ nhớ đệm (Semantic Caching)',
    prompt:
      'Khi có 500 nhân viên cùng hỏi một câu phổ biến như "Quy định nghỉ phép năm 2026 như thế nào?", giải pháp nào giúp tiết kiệm 95% chi phí gọi AI?',
    options: [
      'Lưu câu trả lời đã xác thực vào bộ nhớ đệm Redis để trả về ngay cho các câu hỏi trùng nội dung',
      'Gọi lại mô hình ngôn ngữ lớn đủ 500 lần và tính phí từng lần',
      'Khóa tính năng hỏi đáp vào giờ hành chính',
      'Yêu cầu nhân viên tự viết lại quy định nghỉ phép',
    ],
    correctIndex: 0,
    explanation:
      'Bộ nhớ đệm cho các câu hỏi lặp lại giúp phản hồi trong vài mili-giây và giảm mạnh chi phí vận hành.',
    skillCode: 'ASYNC-LATENCY',
    skillName: 'Xử lý bất đồng bộ & Tối ưu tốc độ',
    jumpSec: 45,
    rangeSec: [45, 75],
    timeLabel: '00:45 - 01:15',
    slideLabel: 'Slide Trang 18',
  },
  {
    tag: 'Đánh giá tự động chất lượng câu trả lời',
    prompt:
      'Tiêu chí nào quan trọng nhất khi kiểm tra tự động chất lượng của một hệ thống Trợ lý AI tra cứu tài liệu nội bộ trước khi đưa vào vận hành?',
    options: [
      'Độ trung thực với tài liệu gốc (không tự bịa thông tin) và độ chính xác của trang trích dẫn',
      'Câu trả lời càng dùng nhiều từ hoa mỹ, dài dòng càng tốt',
      'Tốc độ gõ phím của người dùng cuối',
      'Số lượng màu sắc trên giao diện trang chủ',
    ],
    correctIndex: 0,
    explanation:
      'Độ trung thực với tài liệu gốc và trích dẫn đúng số trang là thước đo sống còn của hệ thống AI doanh nghiệp.',
    skillCode: 'FAITHFULNESS',
    skillName: 'Kiểm soát độ chính xác & Trích dẫn nguồn',
    jumpSec: 25,
    rangeSec: [25, 50],
    timeLabel: '00:25 - 00:50',
    slideLabel: 'Slide Trang 12',
  },
];

/**
 * 25 Câu hỏi Trắc nghiệm 4 đáp án (A, B, C, D) chuẩn cho Bài Thi Tốt Nghiệp Cuối Khóa
 */
export const FINAL_EXAM_25_MCQ_QUESTIONS: McqQuestionItem[] = Array.from(
  { length: 25 },
  (_, idx) => {
    const num = idx + 1;
    if (idx < SESSION_4_MCQ_QUESTIONS.length) {
      const base = SESSION_4_MCQ_QUESTIONS[idx];
      return {
        ...base,
        number: num,
        scenarioTag: `Câu ${num}/25 · Kiến thức cốt lõi toàn khóa`,
      };
    }
    const topic = EXTRA_FINAL_EXAM_TOPICS[(idx - SESSION_4_MCQ_QUESTIONS.length) % EXTRA_FINAL_EXAM_TOPICS.length];
    const cycle = Math.floor((idx - SESSION_4_MCQ_QUESTIONS.length) / EXTRA_FINAL_EXAM_TOPICS.length) + 1;
    return {
      number: num,
      scenarioTag: `Câu ${num}/25 · ${topic.tag}${cycle > 1 ? ` (Tình huống ${cycle})` : ''}`,
      prompt: topic.prompt,
      options: topic.options,
      correctIndex: topic.correctIndex,
      explanation: topic.explanation,
      skillCode: topic.skillCode,
      skillName: topic.skillName,
      reviewTimestampLabel: topic.timeLabel,
      reviewJumpSec: topic.jumpSec,
      reviewSegmentRangeSec: topic.rangeSec,
      slideLabel: topic.slideLabel,
    };
  }
);

// Giữ alias tương thích ngược với các module đang import FINAL_EXAM_20_MCQ_QUESTIONS
export const FINAL_EXAM_20_MCQ_QUESTIONS: McqQuestionItem[] = FINAL_EXAM_25_MCQ_QUESTIONS;

/**
 * Trả về danh sách câu hỏi an toàn cho Học viên làm bài (`promptConfig`: CHỈ chứa câu hỏi + 4 đáp án A, B, C, D,
 * TUYỆT ĐỐI ẩn `correctIndex` và `explanation` trước khi nộp bài).
 */
export function toStudentSafePromptConfig(
  questions: McqQuestionItem[]
): StudentSafePromptConfigItem[] {
  return questions.map((q) => ({
    number: q.number,
    scenarioTag: q.scenarioTag,
    prompt: q.prompt,
    options: q.options,
    skillCode: q.skillCode,
    skillName: q.skillName,
    slideLabel: q.slideLabel,
  }));
}

export interface StoredMcqAttemptResult {
  assessmentId: string;
  title?: string;
  isFinalExam: boolean;
  totalQuestions: number;
  correctCount: number;
  scoreOutOf10: number;
  scorePercent?: number;
  passed: boolean;
  submittedAt: string;
  selectedAnswers: Record<number, number>;
  selectedIndices?: number[];
  updatedSkills: {
    code: string;
    name: string;
    previousScore: number;
    newScore: number;
    delta: string;
  }[];
  wrongItems: {
    number: number;
    prompt: string;
    chosenIndex: number;
    correctIndex: number;
    options: [string, string, string, string] | string[];
    explanation: string;
    reviewTimestampLabel: string;
    reviewJumpSec: number;
    reviewSegmentRangeSec: [number, number];
    slideLabel: string;
  }[];
}

const STORAGE_KEY_PREFIX = '3t_mcq_result_';
const FINAL_EXAM_PASSED_LOCK_KEY = '3t_final_exam_passed_locked';

export function hasStudentPassedFinalExam(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(FINAL_EXAM_PASSED_LOCK_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markStudentPassedFinalExam(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(FINAL_EXAM_PASSED_LOCK_KEY, 'true');
  } catch {
    // Ignore storage error
  }
}

export function evaluateMcqSubmission(
  assessmentId: string,
  isFinalExam: boolean,
  questions: McqQuestionItem[],
  selectedAnswers: Record<number, number>
): StoredMcqAttemptResult {
  let correctCount = 0;
  const wrongItems: StoredMcqAttemptResult['wrongItems'] = [];

  questions.forEach((q) => {
    const chosen = selectedAnswers[q.number] ?? 0;
    if (chosen === q.correctIndex) {
      correctCount += 1;
    } else {
      wrongItems.push({
        number: q.number,
        prompt: q.prompt,
        chosenIndex: chosen,
        correctIndex: q.correctIndex,
        options: q.options,
        explanation: q.explanation,
        reviewTimestampLabel: q.reviewTimestampLabel,
        reviewJumpSec: q.reviewJumpSec,
        reviewSegmentRangeSec: q.reviewSegmentRangeSec ?? [
          q.reviewJumpSec,
          q.reviewJumpSec + 18,
        ],
        slideLabel: q.slideLabel,
      });
    }
  });

  const totalQuestions = questions.length;
  const scoreOutOf10 = Number(((correctCount / totalQuestions) * 10).toFixed(1));
  const passed = scoreOutOf10 >= 7.0;

  if (isFinalExam && passed) {
    markStudentPassedFinalExam();
  }

  const result: StoredMcqAttemptResult = {
    assessmentId,
    isFinalExam,
    totalQuestions,
    correctCount,
    scoreOutOf10,
    passed,
    submittedAt: 'Vừa nộp xong · Chấm điểm tự động 0 giây',
    selectedAnswers,
    updatedSkills: [
      {
        code: 'DOCLING-CHUNK',
        name: 'Đọc & Chia nhỏ tài liệu thông minh',
        previousScore: 76,
        newScore: passed ? 88 : 78,
        delta: passed ? '+12 điểm' : '+2 điểm',
      },
      {
        code: 'HYBRID-RAG',
        name: 'Tìm kiếm kết hợp từ khóa & ngữ nghĩa',
        previousScore: 80,
        newScore: passed ? 92 : 82,
        delta: passed ? '+12 điểm' : '+2 điểm',
      },
      {
        code: 'ASYNC-LATENCY',
        name: 'Xử lý bất đồng bộ & Tối ưu tốc độ',
        previousScore: 72,
        newScore: passed ? 85 : 74,
        delta: passed ? '+13 điểm' : '+2 điểm',
      },
    ],
    wrongItems,
  };

  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${assessmentId}`,
        JSON.stringify(result)
      );
    }
  } catch {
    // Ignore storage quota errors
  }

  return result;
}

export function loadStoredMcqResult(assessmentId: string): StoredMcqAttemptResult {
  try {
    if (typeof window !== 'undefined') {
      const raw = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${assessmentId}`);
      if (raw) {
        return JSON.parse(raw) as StoredMcqAttemptResult;
      }
    }
  } catch {
    // Fallback below
  }

  const isFinal =
    assessmentId.toLowerCase().includes('final') ||
    assessmentId.toLowerCase().includes('exam');
  const questions = isFinal ? FINAL_EXAM_25_MCQ_QUESTIONS : SESSION_4_MCQ_QUESTIONS;

  const defaultAnswers: Record<number, number> = {};
  questions.forEach((q) => {
    defaultAnswers[q.number] = q.number === 4 ? (q.correctIndex + 1) % 4 : q.correctIndex;
  });

  const evaluated = evaluateMcqSubmission(assessmentId, isFinal, questions, defaultAnswers);
  return {
    ...evaluated,
    title: isFinal
      ? 'Đề thi Tốt nghiệp Cuối khóa (25 câu trắc nghiệm)'
      : 'Bài kiểm tra Mở khóa Cuối buổi học (10 câu trắc nghiệm)',
    scorePercent: Math.round(evaluated.scoreOutOf10 * 10),
    selectedIndices: questions.map((q) => defaultAnswers[q.number] ?? 0),
  };
}

export function saveStoredMcqResult(assessmentId: string, result: StoredMcqAttemptResult): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${assessmentId}`,
        JSON.stringify(result)
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function gradeMcqSubmissionServerSide(
  assessmentId: string,
  questions: McqQuestionItem[],
  selectedIndices: number[],
  isFinalExam: boolean
): StoredMcqAttemptResult {
  const selectedAnswers: Record<number, number> = {};
  questions.forEach((q, idx) => {
    selectedAnswers[q.number] =
      typeof selectedIndices[idx] === 'number' ? selectedIndices[idx] : 0;
  });
  const res = evaluateMcqSubmission(assessmentId, isFinalExam, questions, selectedAnswers);
  return {
    ...res,
    title: isFinalExam
      ? 'Đề thi Tốt nghiệp Cuối khóa (25 câu trắc nghiệm)'
      : 'Bài kiểm tra Mở khóa Cuối buổi học (10 câu trắc nghiệm)',
    scorePercent: Math.round(res.scoreOutOf10 * 10),
    selectedIndices,
  };
}

const publishStatusMemoryMap: Record<string, AssessmentPublishStatus> = {};

export function getAssessmentPublishStatus(assessmentId: string): AssessmentPublishStatus {
  if (publishStatusMemoryMap[assessmentId]) {
    return publishStatusMemoryMap[assessmentId];
  }
  return 'PUBLISHED';
}

export function setAssessmentPublishStatus(
  assessmentId: string,
  status: AssessmentPublishStatus
): void {
  publishStatusMemoryMap[assessmentId] = status;
}

