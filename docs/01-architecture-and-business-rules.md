# 01. Kiến Trúc Tổng Thể & 14 Quyết Định Nghiệp Vụ Cốt Lõi (EduTech AI Platform — 3T Academy)

Tài liệu này là nguồn sự thật duy nhất (Single Source of Truth) về mô hình kinh doanh, phân quyền, luồng nghiệp vụ và kiến trúc kỹ thuật của hệ thống sau khi đã tinh gọn và tối ưu hóa thực tế. Mọi kỹ sư và công cụ hỗ trợ lập trình khi triển khai Frontend, Backend hay AI Service đều bắt buộc phải tuân thủ nghiêm ngặt tài liệu này.

---

## 1. Mục Tiêu Dự Án & Kiến Trúc Hệ Thống

Dự án EduTech AI Platform (3T Academy) là nền tảng Học viện đào tạo trực tuyến kết hợp hệ sinh thái AI đa phương thức, được thiết kế tối ưu để vận hành mượt mà ngay cả trên môi trường phần cứng phổ thông (16GB RAM, GPU 4GB VRAM) lẫn môi trường Production thực tế.

### Nguyên tắc công nghệ cốt lõi:
- Chuẩn hóa toàn bộ hệ thống bằng TypeScript (`strict`), Node.js 22 + Express 5, Drizzle ORM, PostgreSQL 16 + `pgvector` (32 bảng chuẩn hóa), Redis 7 + `ARQ` Worker, FastAPI Python 3.12 và React 18 + Vite.
- Loại bỏ hoàn toàn các tính năng rườm rà, nặng nề nhưng ít giá trị thực tế (như giỏ hàng chợ khóa học, chấm bài tự luận thủ công kéo dài, biên dịch LaTeX nặng nề trên server, băm nhỏ HLS AES-128 phức tạp hay xếp lịch OR-Tools rườm rà) để tập trung 100% nguồn lực vào luồng học tập thực chất và các tính năng AI cốt lõi.

---

## 2. Mô Hình Kinh Doanh Cốt Lõi: Học Viện Tổ Chức (First-Party Live Cohort Academy)

Hệ thống KHÔNG PHẢI là chợ khóa học tự do kiểu Udemy (nơi giảng viên tự tạo tài khoản, tự đăng bán video lẻ, có giỏ hàng hay ví chia doanh thu). Hệ thống vận hành theo mô hình Học viện Đào tạo Trực tuyến do Tổ chức Quản lý (First-Party Cohort Academy) theo cấu trúc 3 cấp:

Course (Khóa học gốc) ➔ Cohort (Đợt mở lớp: K01, K02...) ➔ ClassSession (Buổi học trực tuyến / Bản ghi Replay) + Final Exam (Thi tốt nghiệp cuối khóa).

1. **Course (Khóa học gốc):**
   - Là chương trình đào tạo của Học viện (ví dụ: Kỹ Sư AI Thực Chiến, Backend High Performance).
   - Gắn với các Kỹ năng đầu vào (`PREREQUISITE`) và Kỹ năng đầu ra (`LEARNING_OUTCOME`) từ Từ điển Kỹ năng (`skills`) của Học viện.
   - Sở hữu khung chương trình mẫu (`syllabus_template`).

2. **Cohort (Đợt khai giảng / Lớp học):**
   - Là một đợt mở lớp cụ thể của một Course (ví dụ: Khóa K01 năm 2025, Khóa K02 năm 2026).
   - Mỗi Cohort có mã phiên bản chương trình riêng (`curriculum_version`), học phí (`tuition_vnd`), số học viên đã ghi danh (`enrolled_count`), thời điểm mở đăng ký (`enrollment_open_at`), ngày khai giảng/bế giảng (`start_date`, `end_date`), lịch học cố định hàng tuần và 1 Giảng viên phụ trách chính (`instructor_id`).
   - Học viên đăng ký và thanh toán trực tiếp cho từng Cohort.

3. **ClassSession (Buổi học):**
   - Là đơn vị học tập bên trong một Cohort (không có cờ học thử miễn phí `is_free_preview` và không dùng link YouTube ngoài `external_youtube_id`).
   - Mặc định là buổi học trực tuyến (Livestream qua LiveKit Cloud); sau khi kết thúc buổi học sẽ có bản ghi video (`.mp4` lưu trên Cloudflare R2 qua cột `video_r2_key`) để học viên xem lại (`REPLAY_READY`), hoặc là buổi học bổ trợ dùng video quay sẵn.
   - Mỗi buổi học đi kèm: Tài liệu đính kèm (Slide PDF, tài liệu hướng dẫn), Phụ đề đồng bộ kèm mốc thời gian, Bản tóm tắt trọng tâm buổi học (`ai_summary_md`), Hỏi đáp gắn mốc giây video (`discussion_threads`), và Bài kiểm tra trắc nghiệm cuối buổi học (`SESSION_ASSIGNMENT`).

---

## 3. Ma Trận Phân Quyền Tinh Gọn & Không Gian Làm Việc Độc Lập

Hệ thống tách biệt hoàn toàn giao diện và quyền hạn của 3 nhóm vai trò tài khoản (Giảng viên và Admin sử dụng giao diện quản trị Left Sidebar riêng biệt, tuyệt đối không dùng chung hay nhảy nhầm sang giao diện Góc học tập của Học viên):

### 3.1. Vai trò Tài khoản Hệ thống (`accounts.role`)
- **STUDENT (Học viên):** Tự đăng ký qua Email/Mật khẩu hoặc Google OAuth. Học tập tại `/app`, tham gia phòng học trực tuyến `/live/:sessionId`, xem lại video bài giảng, hỏi Trợ giảng AI, làm bài kiểm tra trắc nghiệm mở khóa buổi học, thi cuối khóa nhận Chứng chỉ và sử dụng Credit để luyện phỏng vấn giọng nói với AI.
- **INSTRUCTOR (Giảng viên):** Do Admin cấp tài khoản. Làm việc độc lập tại cổng `/teach`: Quản lý các lớp (`Cohort`) được phân công phụ trách (`cohorts.instructor_id`), mở phòng dạy trực tuyến, tạo link mời Diễn giả khách mời, tải tài liệu bài giảng, tạo/duyệt bộ câu hỏi trắc nghiệm từ bài giảng bằng AI, giải đáp thắc mắc của học viên và xem xét cảnh báo ca thi cuối khóa.
- **ADMIN (Ban Tổ Chức / Quản trị viên Học viện):** Đại diện cho Học viện, làm việc tại cổng `/admin`: Quản lý danh mục, từ điển kỹ năng, thiết kế khung chương trình học (`Course`), mở đợt học mới (`Cohort`) kèm lịch học cố định hàng tuần, phân công Giảng viên phụ trách, quản lý tài khoản, đối soát học phí chuyển khoản tự động và duyệt cấp/thu hồi chứng chỉ.

### 3.2. Phân công Giảng viên Tinh gọn (1 Giảng viên / Cohort & Chống trùng lịch Buổi học)
- Mặc định mỗi Đợt học (`Cohort`) do **1 Giảng viên chính (`cohorts.instructor_id`)** trực tiếp phụ trách xuyên suốt (lược bỏ bảng trung gian `cohort_instructors` và vai trò `TA` ở giai đoạn đầu để tinh gọn).
- Mỗi buổi học (`class_sessions`) lưu `instructor_id` (mặc định gán theo `cohorts.instructor_id`, và cho phép Admin đổi sang giảng viên khác nếu có buổi cần dạy thay đột xuất) kèm ràng buộc `EXCLUDE USING gist` chống trùng lịch dạy dưới DB.

### 3.3. Cơ chế Mời Diễn Giả Khách Mời Ngoài (LiveKit One-Time Guest Link)
- Không tạo role `GUEST` trong CSDL. Khi buổi học có chuyên gia khách mời tham gia chia sẻ, Giảng viên bấm tạo Link mời khách mời (`/live/guest?token=...`).
- Hệ thống sinh JWT LiveKit có hiệu lực tạm thời. Khách mời bấm vào link, nhập tên hiển thị là vào thẳng phòng học trực tuyến với quyền bật Mic/Camera/Chia sẻ màn hình mà không cần tạo tài khoản.

---

## 4. Mười Bốn (14) Quyết Định Nghiệp Vụ & Kỹ Thuật Đã Chốt

### Quyết định 1: Xác thực Tinh gọn & Bảo mật Phiên
- Hỗ trợ đăng nhập bằng Email + Mật khẩu (băm `Argon2id`) và Google OAuth 2.0. Tự động liên kết (`account_identities`) nếu trùng Email đã xác thực.
- `Access Token` (JWT 15 phút) lưu trên RAM trình duyệt; `Refresh Token` lưu trong `HttpOnly Cookie` có xoay vòng token.
- Bắt buộc người dùng đăng nhập trước khi sử dụng các tính năng Chat AI (`chat_sessions.account_id NOT NULL`) để chống spam và kiểm soát chi phí API.

### Quyết định 2: Thanh toán Chuyển khoản Ngân hàng Tự động qua Mã VietQR & SePay Webhook
- Thay thế hoàn toàn cổng thẻ VNPay truyền thống bằng hình thức quét mã **VietQR chuyển khoản ngân hàng 24/7 tích hợp SePay Webhook**.
- Học viên chọn Đợt học (`Cohort`) ➔ Hệ thống tạo đơn hàng (`orders`) với mã đơn duy nhất (`order_code`, ví dụ `ET20268891`) và hiển thị mã VietQR điền sẵn chính xác số tiền `amount_vnd` cùng nội dung chuyển khoản bắt buộc là `order_code`.
- Khi học viên chuyển khoản thành công, SePay bắn Webhook về Backend (`POST /api/v1/webhooks/sepay`):
  - Bảng `payment_transactions` cho phép `order_id NULL` và có cột `match_status` (`'MATCHED'`, `'UNMATCHED_ORDER'`, `'AMOUNT_MISMATCH'`) để ghi nhật ký 100% mọi giao dịch tiền vào kể cả khi học viên ghi sai nội dung chuyển khoản hoặc đơn đến muộn.
  - Nếu khớp mã đơn và đủ số tiền, Backend mở Transaction nguyên tử (`SELECT ... FOR UPDATE`), chuyển `orders.status = 'PAID'`, tạo bản ghi `enrollments`, cộng `cohorts.enrolled_count + 1` và mở khóa lớp học tức thì trong 3 giây.

### Quyết định 3: Quản lý Lịch học Cố định Theo Đợt & Chống Trùng Giờ Giảng Viên
- Loại bỏ hoàn toàn bảng đăng ký lịch rảnh giảng viên (`instructor_availabilities`), loại bỏ bộ xếp lịch OR-Tools phức tạp và loại bỏ chức năng giảng viên tự đổi lịch từng buổi học.
- Khi Admin mở một Đợt học mới (`Cohort`), Admin chọn trực tiếp lịch học cố định hàng tuần của lớp (ví dụ: Tối Thứ 3 & Thứ 7, 19:30 - 21:30) và gán Giảng viên phụ trách (`cohorts.instructor_id`), hệ thống tự động gán `class_sessions.instructor_id` tương ứng.
- Ràng buộc `EXCLUDE USING gist (instructor_id WITH =, tstzrange(scheduled_start, scheduled_end, '[)') WITH &&)` trên bảng `class_sessions` dưới PostgreSQL tự động đảm bảo một giảng viên không bao giờ bị xếp trùng giờ dạy ở 2 lớp khác nhau.

### Quyết định 4: Quản lý Phiên bản Đề cương Theo Đợt (`curriculum_version`) & Quyền Chỉnh sửa
- Chỉ có Admin mới có quyền thiết lập cấu trúc đề cương và tên các buổi học. Giảng viên không tự ý đổi tên buổi học mà chỉ cập nhật tài liệu, bản tóm tắt và bộ câu hỏi kiểm tra bên trong buổi học thuộc lớp mình phụ trách.
- Khi sang năm mới (ví dụ từ khóa 2025 sang khóa 2026) cần cập nhật công nghệ mới, Admin mở một `Cohort` mới với `curriculum_version` mới (ví dụ `v2026.1`) và danh sách `class_sessions` mới dành riêng cho Cohort đó. Toàn bộ đề cương, video, tài liệu và kho tri thức RAG của các Cohort cũ (`K01 - 2025`) được bảo toàn nguyên vẹn 100%.

### Quyết định 5: Lưu trữ Video `.mp4` Tinh gọn & Pipeline Phiên âm Chuẩn Thuật ngữ
- Sử dụng LiveKit Cloud cho phòng học trực tuyến (không tiêu tốn RAM/CPU máy cục bộ).
- Bản ghi buổi học hoặc video bài giảng được lưu trực tiếp dưới định dạng `.mp4` trên Cloudflare R2 (`class_sessions.video_r2_key`), loại bỏ bước băm nhỏ HLS AES-128 nặng nề.
- Để trích xuất phụ đề tiếng Việt pha thuật ngữ tiếng Anh chuyên ngành (như *Pandas, FastAPI, pgvector, Overfitting*) chính xác tuyệt đối mà không làm tràn VRAM máy cục bộ, hệ thống sử dụng mô hình Whisper Large qua Cloud API (hoặc `faster-whisper` có truyền danh sách từ khóa chuyên ngành `initial_prompt`), sau đó băm đoạn kèm mốc giây (`start_sec`, `end_sec`) lưu vào bảng `knowledge_chunks`.

### Quyết định 6: Hoàn thành Buổi học Dựa trên Bài Kiểm tra Hiểu bài (Competency-Based Completion)
- Không đếm thời gian treo máy xem video. Bảng `session_progress` chỉ lưu vị trí xem dở (`last_position_sec`) và cờ `is_completed`.
- Học viên vượt qua bài kiểm tra trắc nghiệm của buổi học (`SESSION_ASSIGNMENT` đạt từ 70% trở lên) thì hệ thống tự động đánh dấu hoàn thành buổi học đó (`is_completed = TRUE`).

### Quyết định 7: Chuẩn hóa 100% Khảo thí về Dạng Trắc Nghiệm 4 Đáp Án (A, B, C, D) Chấm Tức Thì
- Thống nhất toàn bộ Bài kiểm tra cuối buổi học (`SESSION_ASSIGNMENT`, 10–15 câu) và Bài thi tốt nghiệp cuối khóa (`FINAL_EXAM`, 25–30 câu) về **1 dạng duy nhất: Trắc nghiệm chọn 1 đáp án đúng (A, B, C, D)**. Loại bỏ các dạng tự luận/nộp file phức tạp và loại bỏ hàng đợi chờ chấm tay.
- **Quy trình duyệt đề (`assessments.status`):** Giảng viên bấm nút nhờ AI tự động sinh bộ câu hỏi trắc nghiệm A, B, C, D từ nội dung lời giảng của buổi học. Đề mới sinh có trạng thái `'DRAFT'` (Nháp). Sau khi Giảng viên kiểm tra và bấm lưu xuất bản, đề mới chuyển sang `'PUBLISHED'` để học viên làm bài.
- **Bảo mật đáp án & Chấm điểm 0 giây:** API trả đề cho học viên tuyệt đối không trả về cột `grading_config`. Ngay khi học viên bấm nộp bài, Backend chấm điểm tự động ngay lập tức:
  - Cập nhật điểm kỹ năng vào `student_skill_states`.
  - Với các câu chọn sai, hệ thống dùng Vector Search đối chiếu nội dung câu hỏi với `knowledge_chunks` của buổi học để chỉ ra chính xác khoảng phút:giây (`start_sec` – `end_sec`) trong video bài giảng mà học viên cần bấm vào xem lại.

### Quyết định 8: Chống Cày Lậu Credit & Quy tắc Cấp Chứng Chỉ Tốt Nghiệp
- Khi học viên hoàn thành các buổi học và vượt qua kỳ thi trắc nghiệm cuối khóa (`FINAL_EXAM`) lần đầu tiên:
  - Hệ thống đánh dấu `enrollments.final_exam_passed = TRUE`, cấp Chứng chỉ số (`certificates`) và **tặng 1 lần duy nhất `+4 Interview Credits`** vào `user_profiles.interview_credits`.
  - Ngay khi `final_exam_passed = TRUE`, hệ thống **khóa không cho thi lại kỳ thi cuối khóa đó nữa** để bảo toàn kết quả chứng chỉ và chống việc nộp bài nhiều lần để trục lợi cộng dồn Credit phỏng vấn.

### Quyết định 9: Quản lý Kỹ năng Thực chất (Tách biệt Kỹ năng Học viện & Kỹ năng Ngoài CV)
- **Từ điển Kỹ năng của Học viện (`skills`):** Chỉ định nghĩa các kỹ năng công nghệ/chủ đề độc lập, rõ ràng mà Học viện có giảng dạy (ví dụ: *Python, Pandas, FastAPI, PostgreSQL & SQL, RAG & Vector Search, AI Agents, Fine-tuning, Redis, Docker, ReactJS, AWS*). Không chia vụn vặt theo từng hàm nhỏ và không gộp hỗn tạp.
- **Điểm Kỹ năng của Học viên (`student_skill_states`):**
  - Chỉ khởi tạo và tính điểm (`mastery_score` quy đổi ra thang `0–100` kèm `evidence_count` là số câu hỏi đã làm) cho **những kỹ năng thuộc các khóa học mà học viên đã đăng ký học tại Học viện** (bắt đầu từ 0 và tăng lên qua các bài kiểm tra thật, không bịa điểm khởi đầu từ CV).
  - Điểm số này được ghi chú rõ là *"Mức độ nắm bắt kiến thức theo tiêu chuẩn bài tập nội bộ của 3T Academy"*.
- **Kỹ năng bên ngoài từ CV (như *Golang, C++, TOEIC...*):** Được lưu dưới dạng mảng thẻ thông tin trong `user_profiles.cv_parsed_data` để hiển thị trên trang Hồ sơ và làm dữ liệu cho Phòng Phỏng Vấn AI, tuyệt đối không chấm điểm `%` ảo và không làm rác bảng `skills`.

### Quyết định 10: Hồ Sơ Cá Nhân Dạng Resume Chuẩn & Lưu Trữ CV Tập Trung
- Trang **Hồ sơ của tôi (`/app/profile-cv`)** chỉ đóng vai trò lưu trữ và hiển thị thông tin cá nhân + dữ liệu trích xuất từ CV theo đúng bố cục một tờ Resume chuyên nghiệp, gọn gàng với **1 nút tải lên/cập nhật file CV (PDF) duy nhất**.
- Khi học viên tải file PDF CV mới lên, hệ thống trích xuất và cập nhật thẳng vào `user_profiles.cv_parsed_data` (không sinh mã LaTeX, không tự vẽ lại PDF và không đặt bảng nhận xét dài dòng ở ngoài trang Hồ sơ).

### Quyết định 11: Phòng Luyện Phỏng Vấn Giọng Nói 2 Vòng Theo CV & JD (`mock_interviews`)
- Tính năng **Luyện phỏng vấn (`/app/mock-interview`)** yêu cầu học viên phải có `interview_credits > 0` (nhận được sau khi tốt nghiệp khóa học).
- Không bắt học viên tải lại file CV ở trang phỏng vấn mà tự động lấy bản CV hiện tại trong `user_profiles.cv_parsed_data` (kèm lời nhắc xác nhận xem đã là bản CV mới nhất chưa).
- **Quy trình diễn ra theo đúng 2 vòng tuyển dụng thực tế:**
  - **Vòng 1 — Duyệt Hồ sơ CV & Đối chiếu JD (`status = 'CV_SCREENING'` — Chưa trừ Credit):**
    - Học viên chọn Cấp bậc ứng tuyển (`INTERN`, `FRESHER`, `JUNIOR`, `SENIOR`), Vị trí ứng tuyển và dán nội dung **Tờ JD công ty mục tiêu**.
    - Hệ thống dùng Gemini Multimodal/LLM đối chiếu bản CV hiện tại (kể cả bố cục trình bày và nội dung) với tờ JD và các khóa học đã học để đưa ra nhận xét (`cv_screening_result`): đánh giá độ khớp CV–JD, góp ý cách sửa bố cục/câu chữ trong CV, và nhắc bổ sung kiến thức khóa học vừa tốt nghiệp nếu học viên quên chưa ghi vào CV.
    - Nếu thấy CV chưa đạt ngưỡng, học viên có thể thoát ra cập nhật lại CV rồi vào kiểm tra lại mà **không bị trừ Credit** (bản ghi chưa hoàn thành nếu hủy/bỏ dở sẽ được xóa sạch `DELETE` khỏi DB để làm lại từ đầu).
  - **Vòng 2 — Phỏng vấn Trực tiếp bằng Giọng nói (`status = 'IN_PROGRESS'` ➔ `'COMPLETED'`):**
    - Khi vượt qua Vòng 1, học viên bước vào phòng phỏng vấn giọng nói 1-1.
    - Người phỏng vấn AI sử dụng giọng nói tự nhiên đa ngôn ngữ (phát âm chuẩn cả tiếng Việt lẫn thuật ngữ tiếng Anh chuyên ngành) để hỏi xoáy sâu vào **các dự án ghi trong CV của học viên** trước, sau đó hỏi sang **kiến thức và tình huống theo đúng tờ JD & cấp bậc đã chọn** (không cần dùng công cụ Search Google ngoài gây tốn kém).
    - Khi kết thúc buổi phỏng vấn và xuất **Báo cáo đánh giá chi tiết (`evaluation_report`)**, hệ thống chuyển trạng thái sang `'COMPLETED'` và lúc này mới thực hiện trừ `1 Credit`.

### Quyết định 12: Tinh gọn Hệ thống Hỏi Đáp & Trợ Giảng AI Hybrid RAG
- Xóa bỏ trang diễn đàn thảo luận chung rời rạc bên ngoài để tránh trùng lặp. Toàn bộ hoạt động hỏi đáp bài học được gom gọn vào cột tương tác bên phải của **Phòng Học Video (`/app/cohorts/:cohortId/sessions/:sessionId`)** gồm 3 tab rõ ràng:
  1. `Lời giảng (Transcript)`: Chữ chạy đồng bộ theo giây video, bấm vào để tua video.
  2. `Hỏi Trợ giảng AI`: Sử dụng **Hybrid RAG** (`pgvector` HNSW + `tsvector` GIN) cô lập theo `cohort_id` (`ENROLLED_ONLY`), trả lời tức thì và đính kèm nút trích dẫn nhảy tới đúng phút:giây video hoặc trang Slide PDF.
  3. `Hỏi đáp lớp học`: Đặt câu hỏi gắn trực tiếp với giây video đang xem (`discussion_threads.video_timestamp_sec`) để Giảng viên/Trợ giảng vào giải đáp và xác nhận câu trả lời đúng.

### Quyết định 13: Giám sát Thi Cuối Khóa Nhẹ Nhàng, Thực Tế
- Trong kỳ thi trắc nghiệm cuối khóa (`FINAL_EXAM`), để đảm bảo máy học viên chạy mượt mà và không bị báo nhầm do thiếu sáng, hệ thống sử dụng cơ chế giám sát nhẹ nhàng trên trình duyệt: kiểm tra Camera trước giờ thi, theo dõi sự kiện rời tab/thoát toàn màn hình và chụp ảnh định kỳ qua Webcam lưu vào `proctoring_events` để Giảng viên xem lại từ xa khi cần thiết.

---

## 5. Kiến Trúc Giao Tiếp Liên Dịch Vụ (Inter-Service Architecture)

Trình duyệt (`apps/web` :3000) ➔ Express 5 API (`apps/api` :4000) ➔ PostgreSQL 16 + `pgvector` (:5432) & Redis 7 (:6379) ➔ FastAPI AI Service (`apps/ai-service` :8000).

- **Quy tắc bảo mật mạng nội bộ:** Trình duyệt (`apps/web`) chỉ giao tiếp với `apps/api` (Port 4000), tuyệt đối không gọi trực tiếp sang `apps/ai-service` (Port 8000) hay gọi trực tiếp Gemini API. Mọi yêu cầu từ `apps/api` sang `apps/ai-service` đều phải đính kèm header `X-Internal-Key` được kiểm tra bằng `hmac.compare_digest` và truyền xuyên suốt mã vết `X-Request-ID`.

