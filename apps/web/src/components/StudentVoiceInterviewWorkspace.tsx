import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Play,
  VolumeX,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Award,
  Clock,
  FileText,
  ArrowRight,
  RotateCcw,
  Copy,
  Check,
  Building2,
} from 'lucide-react';
import { useAcademy } from '../context/AcademyContext';
import {
  AvatarWithFallback,
  AVATAR_MINH_KHOA,
  AVATAR_HOANG_NAM,
  AVATAR_THU_HA,
} from './BotanicalStickers';
import { profileAndInterviewApi } from '../services/profile-interview.api';
import { API_CONFIG } from '../services/apiClient';
import { CvScreeningResult, InterviewEvaluationReport } from '../types/domain';

type TargetLevel = 'INTERN' | 'FRESHER' | 'JUNIOR' | 'SENIOR';

interface TargetLevelOption {
  id: TargetLevel;
  label: string;
  expectation: string;
}

const TARGET_LEVELS: TargetLevelOption[] = [
  {
    id: 'INTERN',
    label: 'Intern',
    expectation: 'Hỏi nền tảng Python, SQL cơ bản và hiểu biết về đồ án đã làm.',
  },
  {
    id: 'FRESHER',
    label: 'Fresher',
    expectation: 'Hỏi kỹ luồng xử lý dữ liệu trong đồ án CV, cách viết API và tối ưu truy vấn cơ bản.',
  },
  {
    id: 'JUNIOR',
    label: 'Junior',
    expectation: 'Hỏi sâu về thiết kế RAG, xử lý lỗi thực tế, phân quyền tài liệu và tối ưu độ trễ.',
  },
  {
    id: 'SENIOR',
    label: 'Middle/Senior',
    expectation: 'Hỏi kiến trúc chịu tải cao, kiểm soát chi phí vận hành AI và bảo mật đa tầng.',
  },
];

interface InterviewTurnItem {
  stageTag: string;
  questionText: string;
  sampleSpokenAnswer: string;
  evaluationNote: string;
  betterAnswerTip: string;
}

interface CompanyJdPreset {
  id: string;
  companyName: string;
  roleTitle: string;
  jdFileName: string;
  interviewerName: string;
  interviewerTitle: string;
  interviewerAvatar: string;
  jdDefaultText: string;
  interviewFocusTags: string[];
  questionsByTurn: InterviewTurnItem[];
}

const COMPANY_JD_PRESETS: CompanyJdPreset[] = [
  {
    id: 'jd-vng',
    companyName: 'VNG Digital Business',
    roleTitle: 'AI Engineer (RAG & Enterprise Agents)',
    jdFileName: 'JD_VNG_AI_Engineer_2026.pdf',
    interviewerName: 'Anh Trần Minh Khoa',
    interviewerTitle: 'Principal AI Architect · Hội đồng Tuyển dụng Kỹ thuật',
    interviewerAvatar: AVATAR_MINH_KHOA,
    jdDefaultText:
      'Yêu cầu ứng viên thành thạo Python, FastAPI, PostgreSQL (pgvector); có kinh nghiệm thực tế xây dựng hệ thống RAG tra cứu tài liệu nội bộ, xử lý bảng biểu PDF phức tạp, phân quyền truy cập tài liệu theo phòng ban và triển khai bằng Docker.',
    interviewFocusTags: [
      'Tìm kiếm kết hợp (BM25 + Vector)',
      'Phân quyền tài liệu theo phòng ban',
      'Giữ cấu trúc bảng biểu PDF',
    ],
    questionsByTurn: [
      {
        stageTag: 'Câu 1/3 · Hỏi xoáy vào Đồ án trong CV của bạn',
        questionText:
          'Chào An, anh đã đọc kỹ tờ CV trong Hồ sơ của em. Trong đồ án Trợ lý AI tra cứu hơn 500 tài liệu nội bộ, làm sao em giữ nguyên được các bảng biểu tài chính nhiều cột trong file PDF mà không bị vỡ dòng khi cắt nhỏ văn bản?',
        sampleSpokenAnswer:
          'Dạ thưa anh, thay vì cắt văn bản thuần túy theo số ký tự cố định, em dùng bộ đọc tài liệu nhận diện cấu trúc bảng trước rồi chuyển nguyên bảng đó sang định dạng Markdown kèm theo tiêu đề mục cha. Nhờ vậy khi mô hình ngôn ngữ đọc vào, các con số trong hàng và cột vẫn giữ nguyên ngữ cảnh chính xác ạ.',
        evaluationNote:
          'Trả lời đúng trọng tâm kỹ thuật xử lý tài liệu thực tế, giải thích rõ lý do giữ tiêu đề mục cha.',
        betterAnswerTip:
          'Nêu thêm cách xử lý những bảng dài kéo qua 2 trang PDF liên tiếp sẽ giúp câu trả lời đạt điểm tuyệt đối.',
      },
      {
        stageTag: 'Câu 2/3 · Kiểm tra kỹ năng PostgreSQL & FastAPI trong CV',
        questionText:
          'Trong CV em có ghi kinh nghiệm tối ưu API FastAPI và PostgreSQL giảm thời gian phản hồi xuống 0.4 giây. Khi kết hợp tìm kiếm vector và lọc quyền truy cập theo phòng ban, em đặt bước kiểm tra quyền ở đâu để không bị lộ tài liệu nhạy cảm?',
        sampleSpokenAnswer:
          'Dạ em gắn nhãn phòng ban trực tiếp vào từng đoạn tài liệu ngay lúc lưu vào PostgreSQL. Khi nhân viên gửi câu hỏi, câu truy vấn SQL sẽ lọc điều kiện phòng ban ngay tại tầng cơ sở dữ liệu trước khi lấy ra các đoạn văn bản gần nghĩa nhất, tuyệt đối không để mô hình ngôn ngữ nhìn thấy tài liệu ngoài thẩm quyền ạ.',
        evaluationNote:
          'Tư duy bảo mật dữ liệu rất chắc chắn, lọc quyền ngay tại tầng truy vấn cơ sở dữ liệu.',
        betterAnswerTip:
          'Có thể đề cập thêm việc ghi nhật ký truy vấn (audit log) để phục vụ kiểm tra an toàn thông tin.',
      },
      {
        stageTag: 'Câu 3/3 · Tình huống thực tế theo JD VNG Digital Business',
        questionText:
          'Câu cuối cùng nhé: Nếu tài liệu nội bộ của công ty không có thông tin cho câu hỏi của người dùng, làm thế nào em kiểm soát để Trợ lý AI từ chối trả lời lịch sự thay vì tự suy diễn thông tin sai lệch?',
        sampleSpokenAnswer:
          'Dạ em thiết lập ngưỡng điểm tương đồng tối thiểu ở bước tìm kiếm. Nếu tất cả các đoạn tìm được đều dưới ngưỡng tin cậy, hệ thống trả về thông báo rõ ràng là chưa có quy định trong kho tài liệu hiện hành; đồng thời em buộc câu trả lời luôn phải đính kèm số trang trích dẫn gốc để người dùng đối chiếu ngay ạ.',
        evaluationNote:
          'Giải pháp thực tế, kết hợp cả ngưỡng chặn sớm (threshold) và bắt buộc trích dẫn nguồn.',
        betterAnswerTip: 'Câu trả lời rất trọn vẹn và thuyết phục.',
      },
    ],
  },
  {
    id: 'jd-fpt',
    companyName: 'FPT Smart Cloud',
    roleTitle: 'Backend & AI Platform Developer',
    jdFileName: 'JD_FPT_SmartCloud_Backend_AI.pdf',
    interviewerName: 'Anh Đặng Hoàng Nam',
    interviewerTitle: 'Senior Backend & Cloud Lead · Hội đồng Phỏng vấn',
    interviewerAvatar: AVATAR_HOANG_NAM,
    jdDefaultText:
      'Tuyển dụng Kỹ sư Backend Python & AI Platform: Xây dựng RESTful API bất đồng bộ với FastAPI, quản lý hàng đợi Redis Queue, tối ưu cơ sở dữ liệu PostgreSQL, đóng gói Docker và giám sát độ trễ dịch vụ AI.',
    interviewFocusTags: [
      'Xử lý bất đồng bộ Redis Queue',
      'Tối ưu PostgreSQL & Indexing',
      'Đóng gói & vận hành Docker',
    ],
    questionsByTurn: [
      {
        stageTag: 'Câu 1/3 · Hỏi sâu dự án Đồng bộ Kho vận trong CV',
        questionText:
          'Chào An, trong CV em có dự án dùng Redis Queue xử lý 50.000 bản ghi mỗi ngày. Nếu một tiến trình Worker đang xử lý dở mà gặp lỗi mạng tạm thời, em thiết kế cơ chế thử lại như thế nào để không bị nhân đôi dữ liệu?',
        sampleSpokenAnswer:
          'Dạ em gắn mã định danh duy nhất cho mỗi bản ghi đồng bộ và kiểm tra trạng thái trước khi ghi vào PostgreSQL. Khi gặp lỗi mạng tạm thời, Worker sẽ thử lại với khoảng thời gian chờ tăng dần và nếu quá 3 lần thất bại thì đẩy vào hàng đợi lỗi riêng để kiểm tra ạ.',
        evaluationNote: 'Hiểu rõ nguyên tắc chống trùng lặp dữ liệu (idempotency) và cơ chế retry.',
        betterAnswerTip: 'Nêu rõ hơn cách đặt khóa duy nhất (Unique Constraint) dưới bảng SQL.',
      },
      {
        stageTag: 'Câu 2/3 · Kiểm tra kỹ năng tối ưu API & SQL',
        questionText:
          'Khi ghép nối dịch vụ AI vào hệ thống Backend hiện có, thời gian chờ mô hình sinh câu trả lời thường mất vài giây. Em thiết kế API như thế nào để giao diện người dùng không bị đơ?',
        sampleSpokenAnswer:
          'Dạ em sử dụng cơ chế truyền luồng trực tiếp (Server-Sent Events) trên FastAPI để trả từng cụm từ ngay khi mô hình vừa sinh ra, giúp người dùng đọc được kết quả đầu tiên chỉ sau khoảng 0.4 giây mà không phải đợi toàn bộ văn bản hoàn tất ạ.',
        evaluationNote: 'Giải quyết tốt bài toán trải nghiệm người dùng và giảm thời gian chờ cảm nhận.',
        betterAnswerTip: 'Đề cập thêm cấu hình timeout hợp lý ở tầng Reverse Proxy.',
      },
      {
        stageTag: 'Câu 3/3 · Tình huống vận hành thực tế theo JD',
        questionText:
          'Làm sao em phát hiện sớm việc chất lượng câu trả lời của hệ thống giảm sút sau khi công ty cập nhật hàng loạt quy định mới?',
        sampleSpokenAnswer:
          'Dạ em xây dựng bộ 50 câu hỏi kiểm thử chuẩn kèm đáp án mẫu và chạy đánh giá tự động mỗi khi cập nhật kho tài liệu mới, kết hợp nút phản hồi nhanh của người dùng để phát hiện ngay các câu trả lời thiếu chính xác ạ.',
        evaluationNote: 'Tư duy kiểm thử tự động rất bài bản.',
        betterAnswerTip: 'Hoàn thành xuất sắc vòng phỏng vấn kỹ thuật.',
      },
    ],
  },
  {
    id: 'jd-shopee',
    companyName: 'Shopee Vietnam',
    roleTitle: 'Search & Data Engineer (Python / SQL)',
    jdFileName: 'JD_Shopee_Search_Data_2026.pdf',
    interviewerName: 'Chị Lê Thu Hà',
    interviewerTitle: 'Engineering Manager · Search & Recommendation',
    interviewerAvatar: AVATAR_THU_HA,
    jdDefaultText:
      'Tìm kiếm Kỹ sư Dữ liệu & Tìm kiếm thông minh: Thành thạo Python, Pandas, SQL hiệu năng cao, Redis Caching và các thuật toán kết hợp tìm kiếm từ khóa với tìm kiếm ngữ nghĩa quy mô lớn.',
    interviewFocusTags: [
      'Tìm kiếm tốc độ cao',
      'Tối ưu bộ nhớ đệm Redis',
      'Phân tích dữ liệu Python & SQL',
    ],
    questionsByTurn: [
      {
        stageTag: 'Câu 1/3 · Hỏi về hệ thống tìm kiếm trong CV',
        questionText:
          'Chào An, vì sao trong đồ án ở CV em lại kết hợp cả tìm kiếm từ khóa lẫn tìm kiếm theo ý nghĩa câu hỏi thay vì chỉ dùng một cách?',
        sampleSpokenAnswer:
          'Dạ vì tìm kiếm theo ý nghĩa rất giỏi hiểu các câu hỏi diễn đạt tự nhiên nhưng lại dễ nhầm khi người dùng gõ chính xác mã sản phẩm hoặc mã văn bản. Khi kết hợp cả hai và xếp hạng lại, hệ thống vừa bắt trúng mã chính xác vừa hiểu đúng ngữ cảnh câu hỏi dài ạ.',
        evaluationNote: 'Giải thích rõ ràng ưu nhược điểm của từng phương pháp tìm kiếm.',
        betterAnswerTip: 'Có thể lấy thêm 1 ví dụ cụ thể về từ khóa tiếng Việt.',
      },
      {
        stageTag: 'Câu 2/3 · Kiểm tra kỹ năng PostgreSQL thực tế',
        questionText:
          'Khi một câu truy vấn báo cáo trên bảng hàng triệu dòng bỗng nhiên chạy chậm, bước đầu tiên em làm để tìm nguyên nhân là gì?',
        sampleSpokenAnswer:
          'Dạ bước đầu tiên em kiểm tra kế hoạch thực thi thực tế của câu truy vấn (EXPLAIN ANALYZE) để xem cơ sở dữ liệu đang phải quét toàn bộ bảng ở bước nào, từ đó đánh lại chỉ mục phù hợp cho đúng cột lọc và cột sắp xếp ạ.',
        evaluationNote: 'Thói quen chẩn đoán có căn cứ rõ ràng, đúng tác phong kỹ sư thực chiến.',
        betterAnswerTip: 'Nêu thêm việc hạn chế lấy các cột văn bản dài không cần thiết.',
      },
      {
        stageTag: 'Câu 3/3 · Tình huống chịu tải cao theo JD Shopee',
        questionText:
          'Trong ngày hội siêu mua sắm, lượng truy vấn tìm kiếm tăng gấp 10 lần bình thường. Em sẽ ưu tiên tối ưu ở tầng nào trước để hệ thống không bị quá tải?',
        sampleSpokenAnswer:
          'Dạ em sẽ lưu sẵn kết quả của nhóm từ khóa phổ biến nhất vào bộ nhớ đệm Redis và giới hạn số lượng đoạn văn bản đưa vào bước chấm điểm sâu, nhờ đó giảm tải trực tiếp cho cơ sở dữ liệu chính trong khung giờ cao điểm ạ.',
        evaluationNote: 'Giải pháp thực tế, cân bằng tốt giữa tốc độ và độ chính xác.',
        betterAnswerTip: 'Hoàn hảo cho vị trí ứng tuyển.',
      },
    ],
  },
];

const SUGGESTED_COURSE_BULLET_FOR_CV =
  'Đồ án Hệ thống Trợ lý AI Tra cứu Tài liệu Nội bộ (Khóa Kỹ Sư AI Thực Chiến K01 — 3T Academy): Xây dựng đường ống bóc tách 500+ tài liệu PDF bảo toàn bảng biểu, kết hợp tìm kiếm từ khóa & ngữ nghĩa trên PostgreSQL (pgvector) kèm phân quyền phòng ban, đạt độ chính xác trích dẫn 92%.';

export const StudentVoiceInterviewWorkspace: React.FC = () => {
  const {
    interviewCredits,
    setInterviewCredits,
    navigate,
    setStudentSidebarTab,
    latestCvFileName,
    latestCvUpdatedAt,
    currentUser,
  } = useAcademy();

  const studentFullName = currentUser?.fullName || 'Nguyễn Văn An';
  const studentShortName =
    studentFullName.trim().split(/\s+/).slice(-1)[0] || studentFullName;

  // 3 Chặng của quy trình tuyển dụng: ROUND_1_CV_SCREENING -> ROUND_2_VOICE_INTERVIEW -> STAGE_3_REPORT
  const [stage, setStage] = useState<
    'ROUND_1_CV_SCREENING' | 'ROUND_2_VOICE_INTERVIEW' | 'STAGE_3_REPORT'
  >('ROUND_1_CV_SCREENING');

  // Vòng 1: Chọn cấp bậc, JD & Kiểm tra Hồ sơ CV (CHƯA TRỪ CREDIT)
  const [targetLevel, setTargetLevel] = useState<TargetLevel>('FRESHER');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('jd-vng');
  const [uploadedJdName, setUploadedJdName] = useState<string | null>(null);
  const [jdText, setJdText] = useState<string>(COMPANY_JD_PRESETS[0].jdDefaultText);
  const [isScreeningCv, setIsScreeningCv] = useState<boolean>(false);
  const [hasScreenedCv, setHasScreenedCv] = useState<boolean>(true);
  // Cho phép kiểm thử cả 2 trạng thái CV ở Vòng 1: CV đã đầy đủ (78% - Đạt ngưỡng) hoặc CV quên ghi khóa học vừa học (45% - Cần bổ sung)
  const [cvScenarioMode, setCvScenarioMode] = useState<'READY_78' | 'MISSING_COURSE_45'>(
    'READY_78'
  );
  const [screeningResult, setScreeningResult] = useState<CvScreeningResult | null>(null);

  // Vòng 2: Phòng phỏng vấn giọng nói trực tiếp
  const [activeInterviewId, setActiveInterviewId] = useState<string>('intv-draft-01');
  const [currentTurnIdx, setCurrentTurnIdx] = useState<number>(0);
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [isStudentRecording, setIsStudentRecording] = useState<boolean>(false);
  const [liveSpokenDraft, setLiveSpokenDraft] = useState<string>('');
  const [callSeconds, setCallSeconds] = useState<number>(0);
  const [creditDeductedForCurrentSession, setCreditDeductedForCurrentSession] =
    useState<boolean>(false);
  const [transcriptHistory, setTranscriptHistory] = useState<
    {
      speaker: 'SENIOR_AI' | 'STUDENT';
      speakerLabel: string;
      stageTag?: string;
      text: string;
    }[]
  >([]);

  const recordingTimerRef = useRef<number | null>(null);

  const activeCompany =
    COMPANY_JD_PRESETS.find((c) => c.id === selectedCompanyId) ?? COMPANY_JD_PRESETS[0];
  const activeLevelObj =
    TARGET_LEVELS.find((l) => l.id === targetLevel) ?? TARGET_LEVELS[1];

  // Bộ đếm thời gian cuộc gọi khi đang ở Vòng 2
  useEffect(() => {
    if (stage !== 'ROUND_2_VOICE_INTERVIEW') return;
    const timer = window.setInterval(() => {
      setCallSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  // Phát giọng nói của Người phỏng vấn AI (Web Speech API + hiệu ứng sóng âm)
  const triggerAiVoiceSpeech = (textToSpeak: string) => {
    setIsAiSpeaking(true);
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(textToSpeak);
        utter.lang = 'vi-VN';
        utter.rate = 1.02;
        utter.onend = () => setIsAiSpeaking(false);
        utter.onerror = () => setIsAiSpeaking(false);
        window.speechSynthesis.speak(utter);
      }
    } catch {
      // Fallback sóng âm
    }
    const timer = window.setTimeout(() => {
      setIsAiSpeaking(false);
    }, 4500);
    return () => window.clearTimeout(timer);
  };

  // Bấm "Kiểm tra Hồ sơ CV với JD này" ở Vòng 1 (KHÔNG TRỪ CREDIT)
  const handleRunRound1Screening = async () => {
    setIsScreeningCv(true);
    try {
      const res = await profileAndInterviewApi.screenCvAgainstJd(
        targetLevel,
        activeCompany.roleTitle,
        jdText,
        cvScenarioMode
      );
      if (res?.interviewId) {
        setActiveInterviewId(res.interviewId);
      }
      if (res?.cvScreeningResult) {
        setScreeningResult(res.cvScreeningResult);
      }
      setHasScreenedCv(true);
    } finally {
      setIsScreeningCv(false);
    }
  };

  // Bước từ Vòng 1 sang Vòng 2 (Vẫn giữ Credit cho đến khi hoàn thành phỏng vấn ở Vòng 2)
  const handleEnterRound2VoiceRoom = async () => {
    const startRes = await profileAndInterviewApi.startVoiceInterview(activeInterviewId);
    const firstQ = activeCompany.questionsByTurn[0];
    const openingStageTag = startRes?.stageTag || firstQ.stageTag;
    const openingQuestionText = startRes?.questionText || firstQ.questionText;
    const interviewerLabel = startRes?.interviewerName
      ? `${startRes.interviewerName} (${startRes.interviewerTitle || activeCompany.interviewerTitle})`
      : `${activeCompany.interviewerName} (${activeCompany.interviewerTitle})`;

    setCurrentTurnIdx(0);
    setCallSeconds(0);
    setLiveSpokenDraft('');
    setCreditDeductedForCurrentSession(false);
    setTranscriptHistory([
      {
        speaker: 'SENIOR_AI',
        speakerLabel: interviewerLabel,
        stageTag: openingStageTag,
        text: openingQuestionText,
      },
    ]);
    setStage('ROUND_2_VOICE_INTERVIEW');
    triggerAiVoiceSpeech(openingQuestionText);
  };

  // Thoát / Hủy giữa chừng ở Vòng 2 -> Xóa phiên phỏng vấn nháp (DELETE /interviews/:id), 0 trừ Credit (Rule 4)
  const handleCancelRound2DraftInterview = async () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsAiSpeaking(false);
    setIsStudentRecording(false);
    setLiveSpokenDraft('');
    setTranscriptHistory([]);
    setCurrentTurnIdx(0);
    setCallSeconds(0);
    await profileAndInterviewApi.cancelDraftInterview(activeInterviewId);
    setStage('ROUND_1_CV_SCREENING');
  };

  const [completedReport, setCompletedReport] =
    useState<InterviewEvaluationReport | null>(null);

  // Hoàn tất Vòng 2 -> Chuyển sang Chặng 3 (Lúc này mới chính thức trừ 1 Credit!)
  const handleCompleteRound2AndOpenReport = async () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsAiSpeaking(false);
    setIsStudentRecording(false);
    const res = await profileAndInterviewApi.completeInterview(activeInterviewId);
    if (res.evaluationReport) {
      setCompletedReport(res.evaluationReport);
    }
    if (!creditDeductedForCurrentSession) {
      if (typeof res.remainingCredits === 'number') {
        setInterviewCredits(res.remainingCredits);
      } else {
        setInterviewCredits((prev) => Math.max(0, prev - 1));
      }
      setCreditDeductedForCurrentSession(true);
    }
    setStage('STAGE_3_REPORT');
  };

  const speechRecRef = useRef<{ stop?: () => void } | null>(null);

  const handleFillSampleSpokenAnswer = () => {
    const currentQ =
      activeCompany.questionsByTurn[currentTurnIdx] ??
      activeCompany.questionsByTurn[activeCompany.questionsByTurn.length - 1];
    setLiveSpokenDraft(currentQ.sampleSpokenAnswer);
  };

  // Thu âm giọng nói trả lời của học viên ở Vòng 2 (Web Speech API STT + Fallback cho môi trường không có Mic)
  const handleToggleStudentMic = async () => {
    const currentQ =
      activeCompany.questionsByTurn[currentTurnIdx] ??
      activeCompany.questionsByTurn[activeCompany.questionsByTurn.length - 1];

    if (!isStudentRecording) {
      setIsAiSpeaking(false);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsStudentRecording(true);

      // Thử kích hoạt Web Speech API (SpeechRecognition) nếu trình duyệt hỗ trợ
      const SpeechRecognitionCtor =
        typeof window !== 'undefined'
          ? (window as unknown as Record<string, unknown>).SpeechRecognition ||
            (window as unknown as Record<string, unknown>).webkitSpeechRecognition
          : null;

      if (typeof SpeechRecognitionCtor === 'function') {
        try {
          const recognition = new (SpeechRecognitionCtor as new () => {
            lang: string;
            continuous: boolean;
            interimResults: boolean;
            onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
            onerror: (() => void) | null;
            start: () => void;
            stop: () => void;
          })();
          recognition.lang = 'vi-VN';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i += 1) {
              transcript += event.results[i][0].transcript;
            }
            if (transcript.trim()) {
              setLiveSpokenDraft(transcript.trim());
            }
          };
          recognition.onerror = () => {
            // Giữ chế độ nhập / mẫu nếu trình duyệt chặn mic
          };
          recognition.start();
          speechRecRef.current = recognition;
          return;
        } catch {
          // Fallback bên dưới nếu không khởi tạo được SpeechRecognition
        }
      }

      // Nếu chưa có nội dung nháp và trình duyệt không có SpeechRecognition vật lý, hiển thị gợi ý từng từ
      if (!liveSpokenDraft.trim()) {
        const words = currentQ.sampleSpokenAnswer.split(' ');
        let idx = 0;
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
        }
        recordingTimerRef.current = window.setInterval(() => {
          idx += 3;
          if (idx >= words.length) {
            setLiveSpokenDraft(currentQ.sampleSpokenAnswer);
            if (recordingTimerRef.current) {
              window.clearInterval(recordingTimerRef.current);
            }
          } else {
            setLiveSpokenDraft(words.slice(0, idx).join(' ') + ' ...');
          }
        }, 170);
      }
    } else {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (speechRecRef.current?.stop) {
        try {
          speechRecRef.current.stop();
        } catch {
          // Ignore stop errors
        }
      }
      setIsStudentRecording(false);
      const cleanedDraft = liveSpokenDraft.replace(/\s*\.\.\.$/, '').trim();
      const finalSpokenText = cleanedDraft || currentQ.sampleSpokenAnswer;

      const turnRes = await profileAndInterviewApi.sendVoiceTurn(
        activeInterviewId,
        finalSpokenText
      );

      const nextIndex = currentTurnIdx + 1;
      const nextQuestionObj = activeCompany.questionsByTurn[nextIndex];
      const isFinished = turnRes?.isCompleted ?? !nextQuestionObj;

      if (!isFinished && (turnRes?.nextQuestionText || nextQuestionObj)) {
        const nextText = turnRes?.nextQuestionText || nextQuestionObj.questionText;
        const nextStage = turnRes?.nextStageTag || nextQuestionObj.stageTag;
        setTranscriptHistory((prev) => [
          ...prev,
          {
            speaker: 'STUDENT',
            speakerLabel: `${studentFullName} (Trả lời bằng giọng nói)`,
            text: finalSpokenText,
          },
          {
            speaker: 'SENIOR_AI',
            speakerLabel: `${activeCompany.interviewerName} (${activeCompany.interviewerTitle})`,
            stageTag: nextStage,
            text: nextText,
          },
        ]);
        setCurrentTurnIdx(nextIndex);
        setLiveSpokenDraft('');
        triggerAiVoiceSpeech(nextText);
      } else {
        const closingText =
          turnRes?.nextQuestionText ||
          `Cảm ơn ${studentShortName} rất nhiều! Em đã trả lời trọn vẹn cả 3 câu hỏi về đồ án trong CV cũng như tình huống thực tế theo JD. Bây giờ em hãy bấm nút "Hoàn tất phỏng vấn & Xem Kết quả đánh giá" để nhận bảng chấm điểm chi tiết nhé!`;
        setTranscriptHistory((prev) => [
          ...prev,
          {
            speaker: 'STUDENT',
            speakerLabel: `${studentFullName} (Trả lời bằng giọng nói)`,
            text: finalSpokenText,
          },
          {
            speaker: 'SENIOR_AI',
            speakerLabel: `${activeCompany.interviewerName} (${activeCompany.interviewerTitle})`,
            stageTag: turnRes?.nextStageTag || 'Hoàn tất phiên phỏng vấn trực tiếp',
            text: closingText,
          },
        ]);
        setLiveSpokenDraft('');
        triggerAiVoiceSpeech(closingText);
      }
    }
  };

  const formatCallTimer = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const matchPercent =
    screeningResult?.matchPercent ?? (cvScenarioMode === 'READY_78' ? 78 : 45);
  const isPassThreshold = screeningResult?.passedGate ?? matchPercent >= 65;

  return (
    <div className="space-y-6">
      {/* HEADER + QUY TẮC CREDIT THÔNG MINH */}
      <div className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
            Luyện Phỏng Vấn Theo Quy Trình Tuyển Dụng Thực Tế (2 Vòng)
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
            <strong>Vòng 1 (Duyệt Hồ sơ CV &amp; JD) hoàn toàn miễn phí Credit</strong> — bạn thoải mái kiểm tra độ khớp và qua trang Hồ sơ chỉnh sửa lại CV bao nhiêu lần tùy ý. Hệ thống chỉ trừ <strong>1 Credit</strong> khi bạn bước vào <strong>Vòng 2 và hoàn thành buổi phỏng vấn giọng nói</strong>.
          </p>
        </div>

        {/* Huy hiệu Credit + Nút kiểm thử trạng thái 0 Credit / Có Credit */}
        <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2 shrink-0">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-mono font-bold">
            <Award className="w-4 h-4 text-[#34D399]" />
            <span>
              Quỹ lượt phỏng vấn:{' '}
              <strong className={interviewCredits > 0 ? 'text-[#34D399]' : 'text-[#EF4444]'}>
                {interviewCredits} Credits
              </strong>
            </span>
          </div>

          {!API_CONFIG.HAS_EXPLICIT_BACKEND && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-[11px]">
              <span className="px-2 text-[#475569] dark:text-[#94A3B8]">Trạng thái:</span>
              <button
                type="button"
                onClick={() => {
                  setInterviewCredits(4);
                  setStage('ROUND_1_CV_SCREENING');
                }}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  interviewCredits > 0
                    ? 'bg-[#10B981] text-white'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                Đã tốt nghiệp (4 Credits)
              </button>
              <button
                type="button"
                onClick={() => {
                  setInterviewCredits(0);
                  setStage('ROUND_1_CV_SCREENING');
                }}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  interviewCredits === 0
                    ? 'bg-[#EF4444] text-white'
                    : 'text-[#475569] dark:text-[#94A3B8]'
                }`}
              >
                0 Credit (Khóa)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* TRƯỜNG HỢP 0 CREDIT: KHÓA TRANG & NHẮC HOÀN THÀNH KHÓA HỌC */}
      {interviewCredits === 0 && stage !== 'STAGE_3_REPORT' ? (
        <section className="rounded-2xl bg-white dark:bg-[#111A15] border-2 border-amber-500/60 p-8 sm:p-12 text-center space-y-5 max-w-3xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-[#F59E0B] flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
              Bạn hiện có 0 Credit luyện phỏng vấn
            </h2>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
              Chỉ những học viên đã hoàn thành khóa học và có Credit (&gt; 0) mới mở được phòng luyện phỏng vấn 2 vòng. Hãy hoàn thành các buổi học và kỳ thi cuối khóa để nhận ngay 4 Credits miễn phí nhé!
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setStudentSidebarTab('TODAY');
                navigate('/app');
              }}
              className="px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold cursor-pointer"
            >
              Quay lại học tiếp khóa học đang theo học →
            </button>
            <button
              type="button"
              onClick={() => setInterviewCredits(4)}
              className="px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-semibold cursor-pointer"
            >
              Mở thử với 4 Credits (Đã tốt nghiệp)
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* THANH TIẾN TRÌNH 3 CHẶNG (STEPPER RÕ RÀNG) */}
          <nav
            aria-label="Tiến trình luyện phỏng vấn 3 chặng"
            className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-4 sm:p-5"
          >
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: 'ROUND_1_CV_SCREENING' as const,
                  stepNum: '01',
                  title: 'Vòng 1: Duyệt Hồ sơ CV & JD',
                  subtitle: 'Miễn phí (0 Credit) · Kiểm tra độ khớp & góp ý CV',
                },
                {
                  id: 'ROUND_2_VOICE_INTERVIEW' as const,
                  stepNum: '02',
                  title: 'Vòng 2: Phỏng vấn trực tiếp',
                  subtitle: 'Hỏi đáp 1-1 bằng giọng nói theo CV & JD',
                },
                {
                  id: 'STAGE_3_REPORT' as const,
                  stepNum: '03',
                  title: 'Kết quả & Đánh giá',
                  subtitle: 'Trừ 1 Credit khi hoàn tất · Nhận xét từng câu',
                },
              ].map((st) => {
                const isActive = stage === st.id;
                const isCompleted =
                  (stage === 'ROUND_2_VOICE_INTERVIEW' && st.id === 'ROUND_1_CV_SCREENING') ||
                  (stage === 'STAGE_3_REPORT' && st.id !== 'STAGE_3_REPORT');
                return (
                  <li
                    key={st.id}
                    className={`p-3.5 rounded-xl border transition-all flex items-start gap-3 ${
                      isActive
                        ? 'bg-[#D1FAE5]/60 dark:bg-emerald-950/60 border-[#10B981]'
                        : isCompleted
                        ? 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#10B981]/40'
                        : 'bg-[#F7FBF9]/60 dark:bg-[#090F0C]/60 border-[#E2ECE7] dark:border-[#1E2D24] opacity-75'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                        isActive || isCompleted
                          ? 'bg-[#10B981] text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-[#475569] dark:text-[#94A3B8]'
                      }`}
                    >
                      {isCompleted ? '✓' : st.stepNum}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        {st.title}
                      </div>
                      <div className="text-[11px] text-[#475569] dark:text-[#94A3B8] mt-0.5">
                        {st.subtitle}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* ====================================================================
              VÒNG 1: DUYỆT HỒ SƠ CV & ĐỐI CHIẾU JD MỤC TIÊU (CV SCREENING GATE)
             ==================================================================== */}
          {stage === 'ROUND_1_CV_SCREENING' && (
            <div className="space-y-6">
              {/* Khung thiết lập Cấp bậc & Tờ JD công ty muốn nộp đơn */}
              <section className="rounded-2xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] p-6 space-y-5 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      Thiết lập vị trí ứng tuyển &amp; Tờ JD công ty mục tiêu
                    </h2>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                      Đang sử dụng tự động bản CV trong Hồ sơ của tôi:{' '}
                      <strong className="font-mono text-[#0F172A] dark:text-[#ECFDF5]">
                        {latestCvFileName}
                      </strong>{' '}
                      (Cập nhật ngày {latestCvUpdatedAt}) —{' '}
                      <span className="text-[#059669] dark:text-[#34D399] font-semibold">
                        Nhớ cập nhật bản CV mới nhất ở mục Hồ sơ của tôi trước khi bắt đầu đối chiếu nhé!
                      </span>
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#059669] dark:text-[#34D399]">
                    Vòng 1: Không trừ Credit
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Chọn Cấp bậc ứng tuyển */}
                  <div className="lg:col-span-5 space-y-3">
                    <label className="block text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      1. Chọn Cấp bậc ứng tuyển:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {TARGET_LEVELS.map((lvl) => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setTargetLevel(lvl.id)}
                          className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-left flex items-center justify-between ${
                            targetLevel === lvl.id
                              ? 'bg-[#10B981] text-white border-[#10B981]'
                              : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] text-[#0F172A] dark:text-[#ECFDF5]'
                          }`}
                        >
                          <span>{lvl.label}</span>
                          {targetLevel === lvl.id && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      <strong>Tiêu chí vòng phỏng vấn ({activeLevelObj.label}):</strong>{' '}
                      {activeLevelObj.expectation}
                    </p>
                  </div>

                  {/* Chọn / Dán / Tải lên Tờ JD công ty muốn nộp đơn */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        2. Dán hoặc tải lên Tờ JD công ty muốn nộp đơn:
                      </label>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#10B981] text-xs font-semibold text-[#059669] dark:text-[#34D399] cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadedJdName ? `Đã tải: ${uploadedJdName}` : 'Tải file JD (.pdf / ảnh)'}</span>
                        <input
                          type="file"
                          accept=".pdf,image/*,.txt,.doc,.docx"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) setUploadedJdName(f.name);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {COMPANY_JD_PRESETS.map((comp) => (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => {
                            setSelectedCompanyId(comp.id);
                            setJdText(comp.jdDefaultText);
                            setUploadedJdName(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                            selectedCompanyId === comp.id
                              ? 'bg-[#10B981] text-white border-[#10B981]'
                              : 'bg-[#F7FBF9] dark:bg-[#090F0C] border-[#E2ECE7] dark:border-[#1E2D24] text-[#475569] dark:text-[#94A3B8]'
                          }`}
                        >
                          {comp.companyName} · {comp.roleTitle}
                        </button>
                      ))}
                    </div>

                    <textarea
                      rows={3}
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      placeholder="Dán nội dung mô tả công việc (JD) của công ty bạn muốn ứng tuyển vào đây..."
                      className="w-full p-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] text-xs text-[#0F172A] dark:text-[#ECFDF5] leading-relaxed focus:outline-none focus:border-[#10B981]"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      {/* Công tắc xem thử 2 tình huống thẩm định CV (chỉ hiện ở chế độ Sandbox/Preview) */}
                      {!API_CONFIG.HAS_EXPLICIT_BACKEND ? (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-[#475569] dark:text-[#94A3B8]">Tình huống CV:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setCvScenarioMode('READY_78');
                              setScreeningResult(null);
                            }}
                            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                              cvScenarioMode === 'READY_78'
                                ? 'bg-[#D1FAE5] dark:bg-emerald-950 text-[#065F46] dark:text-emerald-300'
                                : 'text-[#475569] dark:text-[#94A3B8]'
                            }`}
                          >
                            Khớp 78% (Đạt ngưỡng)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCvScenarioMode('MISSING_COURSE_45');
                              setScreeningResult(null);
                            }}
                            className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                              cvScenarioMode === 'MISSING_COURSE_45'
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                : 'text-[#475569] dark:text-[#94A3B8]'
                            }`}
                          >
                            Khớp 45% (Cần bổ sung CV)
                          </button>
                        </div>
                      ) : (
                        <div />
                      )}

                      <button
                        type="button"
                        onClick={handleRunRound1Screening}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        <span>
                          {isScreeningCv
                            ? 'Đang phân tích Hồ sơ CV & JD...'
                            : 'Kiểm tra Hồ sơ CV với JD này'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* BẢNG THẨM ĐỊNH VÒNG HỒ SƠ (2 NỘI DUNG TRỌNG TÂM TỪ cvScreeningResult) */}
              {hasScreenedCv && (
                <section
                  aria-label="Bảng thẩm định vòng hồ sơ CV và JD"
                  className="rounded-2xl bg-white dark:bg-[#111A15] border-2 border-[#10B981] p-6 sm:p-8 space-y-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2ECE7] dark:border-[#1E2D24] pb-4">
                    <div>
                      <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        KẾT QUẢ THẨM ĐỊNH VÒNG 1 · ĐỐI CHIẾU TRỰC TIẾP CV &amp; JD
                      </div>
                      <h2 className="text-lg sm:text-xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        Bảng Thẩm Định Vòng Hồ Sơ — {activeCompany.companyName} ({activeLevelObj.label})
                      </h2>
                    </div>

                    <div className="inline-flex items-center gap-2 text-xs text-[#475569] dark:text-[#94A3B8]">
                      <Building2 className="w-4 h-4 text-[#10B981]" />
                      <span>Vị trí: {activeCompany.roleTitle}</span>
                    </div>
                  </div>

                  {/* NỘI DUNG 1: Bố cục, trình bày & cách triển khai ý trong CV */}
                  <div className="p-5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2.5">
                    <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                      1. Đánh giá Bố cục, Trình bày &amp; Cách triển khai ý trong CV ({latestCvFileName})
                    </h3>
                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      {screeningResult?.layoutAndPresentationFeedback ??
                        (isPassThreshold
                          ? `Bố cục CV 1 trang A4 gọn gàng, phân tách rõ Mục tiêu nghề nghiệp, Dự án thực tế và Kỹ năng công nghệ. Các ý trong phần dự án được triển khai mạch lạc theo cấu trúc Bài toán – Giải pháp kỹ thuật – Kết quả định lượng. Nên đặt dự án Trợ lý AI Tra cứu Tài liệu lên vị trí đầu tiên để nhà tuyển dụng ${activeCompany.companyName} nắm bắt ngay.`
                          : `Bố cục CV dễ nhìn nhưng cách triển khai ý trong mục Dự án còn liệt kê công nghệ chung chung, thiếu các gạch đầu dòng mô tả độ sâu kỹ thuật và kết quả đo lường cụ thể.`)}
                    </p>
                  </div>

                  {/* NỘI DUNG 2: Độ khớp giữa CV với tờ JD mục tiêu */}
                  <div className="p-5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        2. Độ khớp giữa CV với tờ JD mục tiêu ({activeCompany.companyName})
                      </h3>
                      <span
                        className={`font-mono text-xs sm:text-sm font-bold ${
                          isPassThreshold
                            ? 'text-[#059669] dark:text-[#34D399]'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isPassThreshold
                          ? `${matchPercent}% — Đạt ngưỡng vào vòng phỏng vấn`
                          : `${matchPercent}% — Cần bổ sung CV trước khi phỏng vấn`}
                      </span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isPassThreshold ? 'bg-[#10B981]' : 'bg-amber-500'
                        }`}
                        style={{ width: `${matchPercent}%` }}
                      />
                    </div>

                    <p className="text-xs text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                      {screeningResult?.jdMatchEvaluation ??
                        (isPassThreshold
                          ? `Bản CV hiện tại (${latestCvFileName}) đáp ứng tốt các yêu cầu cốt lõi của ${activeCompany.companyName} ở cấp bậc ${activeLevelObj.label} (${activeCompany.interviewFocusTags.join(', ')}).`
                          : `Bản CV hiện tại (${latestCvFileName}) mới thể hiện kinh nghiệm Backend Python & SQL cơ bản, còn thiếu các từ khóa và dự án thực tế về hệ thống RAG / Vector Search mà JD của ${activeCompany.companyName} yêu cầu.`)}
                    </p>

                    <div className="p-3.5 rounded-xl bg-white dark:bg-[#111A15] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1.5 text-xs">
                      <div className="font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                        • Các trọng tâm trong JD cần lưu ý ({activeCompany.interviewFocusTags.join(', ')}):
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-[#475569] dark:text-[#94A3B8]">
                        {(
                          screeningResult?.missingKeywordsOrGaps ?? [
                            `Nên nhấn mạnh rõ hơn kinh nghiệm xử lý: ${activeCompany.interviewFocusTags.join(', ')}.`,
                            'Trong Vòng 2, người phỏng vấn sẽ hỏi sâu vào các dự án đã ghi trong CV đối chiếu với yêu cầu của tờ JD này.',
                          ]
                        ).map((gap, gIdx) => (
                          <li key={gIdx}>{gap}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* 2 NÚT HÀNH ĐỘNG CUỐI VÒNG 1: QUA TRANG HỒ SƠ CẬP NHẬT CV (KHÔNG MẤT CREDIT) HOẶC BƯỚC VÀO VÒNG 2 */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setStudentSidebarTab('PROFILE_CV');
                        navigate('/app/profile-cv');
                      }}
                      className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs sm:text-sm font-semibold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer transition-colors"
                    >
                      <FileText className="w-4 h-4 text-[#10B981]" />
                      <span>Qua trang Hồ sơ để cập nhật lại CV (Không mất Credit)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEnterRound2VoiceRoom}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#10B981] hover:bg-[#059669] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer transition-colors"
                    >
                      <span>Vượt qua vòng CV — Bước vào Phòng Phỏng Vấn (Vòng 2)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ====================================================================
              VÒNG 2: PHÒNG PHỎNG VẤN TRỰC TIẾP BẰNG GIỌNG NÓI (VOICE INTERVIEW)
             ==================================================================== */}
          {stage === 'ROUND_2_VOICE_INTERVIEW' && (
            <section className="rounded-2xl bg-[#090F0C] text-white border-2 border-[#10B981] p-6 sm:p-8 space-y-6">
              {/* Thanh trạng thái cuộc gọi Vòng 2 */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-500/20 border border-[#10B981] text-[#34D399] font-mono text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                    <span>VÒNG 2 · PHỎNG VẤN TRỰC TIẾP BẰNG GIỌNG NÓI</span>
                  </span>
                  <span className="text-xs text-slate-300">
                    Công ty: <strong>{activeCompany.companyName}</strong> · Cấp bậc:{' '}
                    <strong>{activeLevelObj.label}</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-emerald-300">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatCallTimer(callSeconds)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCancelRound2DraftInterview}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                  >
                    ← Quay lại Vòng 1 (Hủy phiên nháp · Chưa mất Credit)
                  </button>

                  <button
                    type="button"
                    onClick={handleCompleteRound2AndOpenReport}
                    className="px-4 py-1.5 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold cursor-pointer"
                  >
                    Hoàn tất phỏng vấn &amp; Xem Kết quả đánh giá (-1 Credit)
                  </button>
                </div>
              </div>

              {/* Khung tương tác 2 cột: Trái (Sóng âm giọng nói AI & Mic thu âm học viên) | Phải (Phụ đề trực tiếp) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 flex flex-col items-center justify-between text-center space-y-6">
                  {/* Người phỏng vấn AI */}
                  <div className="space-y-3 w-full">
                    <div className="text-xs font-mono text-emerald-300">
                      {isAiSpeaking
                        ? 'NGƯỜI PHỎNG VẤN ĐANG ĐẶT CÂU HỎI BẰNG GIỌNG NÓI...'
                        : 'NGƯỜI PHỎNG VẤN ĐANG LẮNG NGHE PHẦN TRẢ LỜI CỦA BẠN'}
                    </div>

                    <div className="relative inline-block">
                      <AvatarWithFallback
                        src={activeCompany.interviewerAvatar}
                        name={activeCompany.interviewerName}
                        className={`w-24 h-24 rounded-full border-4 ${
                          isAiSpeaking ? 'border-[#10B981] scale-105' : 'border-slate-700'
                        } transition-transform`}
                      />
                    </div>

                    <div>
                      <div className="text-base font-bold text-white">
                        {activeCompany.interviewerName}
                      </div>
                      <div className="text-xs text-slate-400">
                        {activeCompany.interviewerTitle} · Đang hỏi từ{' '}
                        <span className="text-emerald-300">{latestCvFileName}</span>
                      </div>
                    </div>

                    {/* Sóng âm giọng nói của Người phỏng vấn */}
                    <div
                      aria-label="Sóng âm giọng nói của Người phỏng vấn"
                      className="h-10 flex items-center justify-center gap-1.5 px-4"
                    >
                      {[16, 30, 22, 38, 28, 40, 20, 34, 24, 38, 20, 28].map((h, i) => (
                        <span
                          key={i}
                          className={`w-1.5 rounded-full transition-all duration-300 ${
                            isAiSpeaking ? 'bg-[#10B981] animate-pulse' : 'bg-slate-700'
                          }`}
                          style={{ height: isAiSpeaking ? `${h}px` : '8px' }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const currentQ =
                            activeCompany.questionsByTurn[currentTurnIdx] ??
                            activeCompany.questionsByTurn[0];
                          triggerAiVoiceSpeech(currentQ.questionText);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-300 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Nghe lại câu hỏi</span>
                      </button>
                      {isAiSpeaking && (
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                              window.speechSynthesis.cancel();
                            }
                            setIsAiSpeaking(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                        >
                          <VolumeX className="w-3.5 h-3.5" />
                          <span>Tắt tiếng đọc</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="w-full border-t border-slate-800" />

                  {/* Micro thu âm trả lời trực tiếp của Học viên */}
                  <div className="space-y-4 w-full">
                    <div className="text-xs font-mono text-slate-300">
                      {isStudentRecording
                        ? 'ĐANG THU ÂM CÂU TRẢ LỜI CỦA BẠN... BẤM LẠI ĐỂ GỬI'
                        : 'BẤM VÀO MICRO ĐỂ TRẢ LỜI TRỰC TIẾP BẰNG GIỌNG NÓI'}
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleStudentMic}
                      className={`w-24 h-24 rounded-full mx-auto flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-lg ${
                        isStudentRecording
                          ? 'bg-[#EF4444] text-white ring-8 ring-red-500/30 scale-105'
                          : 'bg-[#10B981] hover:bg-[#059669] text-white ring-4 ring-emerald-500/20'
                      }`}
                    >
                      {isStudentRecording ? (
                        <>
                          <MicOff className="w-8 h-8" />
                          <span className="text-[10px] font-mono font-bold">GỬI CÂU TRẢ LỜI</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-8 h-8" />
                          <span className="text-[10px] font-mono font-bold">BẤM ĐỂ NÓI</span>
                        </>
                      )}
                    </button>

                    <div className="w-full space-y-2">
                      <textarea
                        rows={3}
                        value={liveSpokenDraft}
                        onChange={(e) => setLiveSpokenDraft(e.target.value)}
                        placeholder="Nội dung giọng nói tiếng Việt của bạn (hoặc bạn có thể nhập/chỉnh sửa trực tiếp câu trả lời tại đây trước khi gửi)..."
                        className="w-full p-3 rounded-xl bg-slate-950/90 border border-slate-800 focus:border-[#10B981] text-xs text-emerald-200 leading-relaxed focus:outline-none"
                      />
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={handleFillSampleSpokenAnswer}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold cursor-pointer"
                        >
                          ⚡ Điền câu trả lời mẫu để kiểm thử
                        </button>
                        <span className="text-slate-400">
                          Bấm nút đỏ <strong>GỬI CÂU TRẢ LỜI</strong> để chuyển sang câu tiếp theo
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cột phải: Nội dung câu hỏi & câu trả lời theo thời gian thực */}
                <div className="lg:col-span-6 rounded-2xl bg-slate-900/90 border border-slate-800 p-6 flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          NỘI DUNG HỎI ĐÁP TRỰC TIẾP ({activeLevelObj.label})
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Hỏi xoáy vào dự án trong CV &amp; yêu cầu JD {activeCompany.companyName}
                        </div>
                      </div>
                      <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-800 text-emerald-300">
                        Câu {Math.min(currentTurnIdx + 1, activeCompany.questionsByTurn.length)}/
                        {activeCompany.questionsByTurn.length}
                      </span>
                    </div>

                    <div className="space-y-3 max-h-[410px] overflow-y-auto pr-1">
                      {transcriptHistory.map((item, index) => (
                        <div
                          key={index}
                          className={`p-4 rounded-xl text-xs leading-relaxed space-y-1.5 ${
                            item.speaker === 'SENIOR_AI'
                              ? 'bg-slate-950 border border-slate-800 text-slate-100'
                              : 'bg-emerald-950/70 border border-[#10B981]/50 text-emerald-100 ml-5'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-emerald-400">{item.speakerLabel}</span>
                            {item.stageTag && (
                              <span className="font-mono text-[10px] text-amber-300">
                                {item.stageTag}
                              </span>
                            )}
                          </div>
                          <p>{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>Hoàn tất buổi phỏng vấn để nhận báo cáo chấm điểm chi tiết (Trừ 1 Credit).</span>
                    <button
                      type="button"
                      onClick={handleCompleteRound2AndOpenReport}
                      className="px-4 py-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white font-bold shrink-0 cursor-pointer"
                    >
                      Hoàn tất &amp; Xem đánh giá →
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ====================================================================
              CHẶNG 3: BÁO CÁO ĐÁNH GIÁ SAU PHỎNG VẤN (ĐÃ TRỪ 1 CREDIT KHI HOÀN TẤT)
             ==================================================================== */}
          {stage === 'STAGE_3_REPORT' && (
            <section className="rounded-2xl bg-white dark:bg-[#111A15] border-2 border-[#10B981] p-6 sm:p-8 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E2ECE7] dark:border-[#1E2D24]">
                <div className="space-y-1">
                  <div className="text-xs font-mono font-bold text-[#059669] dark:text-[#34D399]">
                    CHẶNG 3 · BÁO CÁO ĐÁNH GIÁ SAU PHỎNG VẤN (ĐÃ SỬ DỤNG 1 CREDIT · CÒN {interviewCredits} CREDITS)
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                    Kết Quả Phỏng Vấn Vòng 2 — {activeCompany.companyName} ({activeLevelObj.label})
                  </h2>
                  <p className="text-xs text-[#475569] dark:text-[#94A3B8]">
                    Người phỏng vấn: <strong>{activeCompany.interviewerName}</strong> · Hồ sơ đã dùng:{' '}
                    <strong>{latestCvFileName}</strong>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStage('ROUND_1_CV_SCREENING')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] hover:border-[#10B981] text-xs font-bold text-[#0F172A] dark:text-[#ECFDF5] cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Thử sức với JD công ty khác (Về Vòng 1)</span>
                </button>
              </div>

              {/* 3 Chỉ số chấm điểm tổng quát */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    label: `Điểm phỏng vấn cấp bậc ${activeLevelObj.label}`,
                    score: `${completedReport?.overallScore ?? 89} / 100`,
                    note:
                      completedReport?.strengths?.[0] ??
                      `Đáp ứng tốt kỳ vọng tuyển dụng của ${activeCompany.companyName} ở vị trí ${activeCompany.roleTitle}.`,
                  },
                  {
                    label: 'Độ sâu hiểu biết về Đồ án trong CV',
                    score: `${completedReport?.projectDepthScore ?? 92} / 100`,
                    note:
                      completedReport?.strengths?.[1] ??
                      'Giải thích rất thuyết phục cách bóc tách bảng biểu PDF và lọc phân quyền SQL.',
                  },
                  {
                    label: 'Sự mạch lạc & Phản xạ trả lời giọng nói',
                    score: `${completedReport?.communicationScore ?? 88} / 100`,
                    note:
                      completedReport?.improvements?.[0] ??
                      'Trình bày rõ ràng theo cấu trúc nguyên nhân — giải pháp — kết quả thực tế.',
                  },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-1.5"
                  >
                    <div className="text-xs text-[#475569] dark:text-[#94A3B8]">{metric.label}</div>
                    <div className="text-2xl font-mono font-bold text-[#059669] dark:text-[#34D399]">
                      {metric.score}
                    </div>
                    <p className="text-xs text-[#0F172A] dark:text-[#ECFDF5] leading-relaxed">
                      {metric.note}
                    </p>
                  </div>
                ))}
              </div>

              {/* Nhận xét chi tiết từng câu trả lời & Lời khuyên cải thiện */}
              <div className="space-y-3">
                <h3 className="text-sm sm:text-base font-bold text-[#0F172A] dark:text-[#ECFDF5]">
                  Nhận xét chi tiết từng câu trả lời &amp; Lời khuyên cải thiện
                </h3>
                <div className="space-y-3">
                  {activeCompany.questionsByTurn.map((turn, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-[#F7FBF9] dark:bg-[#090F0C] border border-[#E2ECE7] dark:border-[#1E2D24] space-y-2 text-xs"
                    >
                      <div className="font-mono font-bold text-[#059669] dark:text-[#34D399]">
                        {turn.stageTag}
                      </div>
                      <div className="font-bold text-sm text-[#0F172A] dark:text-[#ECFDF5]">
                        Câu hỏi: {turn.questionText}
                      </div>
                      <p className="text-[#475569] dark:text-[#94A3B8] italic">
                        Câu trả lời của bạn: “{turn.sampleSpokenAnswer}”
                      </p>
                      <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#E2ECE7] dark:border-[#1E2D24]">
                        <span className="text-[#0F172A] dark:text-[#ECFDF5]">
                          <strong>Nhận xét:</strong> {turn.evaluationNote}
                        </span>
                        <span className="text-[#059669] dark:text-[#34D399] font-semibold">
                          <strong>Lời khuyên:</strong> {turn.betterAnswerTip}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
