# 04. Đặc Tả Backend API (`apps/api`) & AI Service (`apps/ai-service`)

## PHẦN I: NGUYÊN TẮC GIAO TIẾP, BẢO MẬT & ĐỊNH DẠNG DỮ LIỆU

### 1.1. Kiến Trúc Giao Tiếp Giữa Các Dịch Vụ
- **Cổng giao tiếp duy nhất với Trình duyệt (`apps/web`):** Trình duyệt chỉ gửi yêu cầu tới **Backend Core API (`apps/api` — Cổng `4000`)** dưới tiền tố `/api/v1/...`.
- **Giao tiếp nội bộ từ `apps/api` sang `apps/ai-service` (Cổng `8000`):**
  - Mọi yêu cầu từ Backend sang AI Service đều phải đính kèm Header xác thực nội bộ `X-Internal-Key` (được kiểm tra chống tấn công thời gian bằng `hmac.compare_digest`) và mã truy vết `X-Request-ID`.
  - Các tác vụ nặng (như trích xuất phụ đề video bài giảng, băm nhỏ tài liệu PDF và tạo vector `pgvector`) được đẩy vào hàng đợi **Redis (`ARQ Worker`)** để xử lý bất đồng bộ, không làm nghẽn luồng HTTP chính.

### 1.2. Chuẩn Xác Thực & Phân Quyền (RBAC Middleware)
- **`requireAuth`:** Kiểm tra chữ ký `Bearer <JWT_ACCESS_TOKEN>` (hạn 15 phút) và gắn thông tin `req.user = { id, email, role }`.
- **`requireRole(['STUDENT' | 'INSTRUCTOR' | 'ADMIN'])`:** Kiểm tra vai trò tài khoản hệ thống.
- **`requireCohortInstructor`:** Kiểm tra người dùng hiện tại có phải là Giảng viên phụ trách lớp học đó (`cohorts.instructor_id === req.user.id` hoặc `class_sessions.instructor_id === req.user.id`) hay là `ADMIN`.

---

## PHẦN II: DANH SÁCH REST & SSE ENDPOINTS CỦA BACKEND (`apps/api` — PORT 4000)

### 1. Module Xác Thực & Tài Khoản (`/api/v1/auth`)
- `POST /api/v1/auth/register`: Đăng ký tài khoản học viên mới (băm mật khẩu bằng `Argon2id`, tạo bản ghi `accounts` và `user_profiles`).
- `POST /api/v1/auth/login`: Đăng nhập bằng Email & Mật khẩu ➔ Trả về `accessToken` trong JSON và gắn `refreshToken` vào `HttpOnly Cookie`.
- `POST /api/v1/auth/google`: Đăng nhập/Đăng ký nhanh bằng Google OAuth 2.0 (tự động liên kết `account_identities` nếu trùng email đã xác thực).
- `POST /api/v1/auth/refresh`: Cấp mới `accessToken` và xoay vòng `refreshToken` qua Redis.
- `POST /api/v1/auth/logout`: Thu hồi phiên đăng nhập và xóa Cookie.
- `GET /api/v1/auth/me`: Lấy thông tin tài khoản đang đăng nhập kèm hồ sơ cá nhân và số lượt phỏng vấn (`interview_credits`).

---

### 2. Module Danh Mục, Kỹ Năng, Khóa Học & Đợt Khai Giảng (`/api/v1/catalog` & `/api/v1/courses` & `/api/v1/cohorts`)
- `GET /api/v1/catalog/categories`: Lấy danh sách lĩnh vực đào tạo.
- `GET /api/v1/catalog/skills`: Lấy danh sách từ điển kỹ năng chuẩn của Học viện (`Python`, `Pandas`, `FastAPI`, `PostgreSQL & SQL`, `RAG & Vector Search`, `AI Agents`, `Fine-tuning`, `Redis`, `Docker`, `ReactJS`, `AWS`).
- `GET /api/v1/courses`: Tìm kiếm và lọc danh sách khóa học công khai (lọc theo danh mục, độ khó, mã kỹ năng, từ khóa `search_tsv`, chỉ hiện khóa đang mở đợt học).
- `GET /api/v1/courses/:slug`: Lấy chi tiết khóa học, kỹ năng đầu vào/đầu ra, khung đề cương mẫu (`syllabus_template`), danh sách các đợt khai giảng (`cohorts`) kèm thông tin Giảng viên phụ trách (`instructor_id`) và đánh giá của học viên.
- `GET /api/v1/cohorts/:cohortId/workspace`: *(Yêu cầu đã ghi danh)* Lấy thông tin không gian lớp học của học viên: danh sách buổi học (`class_sessions`), trạng thái hoàn thành từng buổi (`session_progress`), danh sách bài kiểm tra và tài liệu chung của lớp.

---

### 3. Module Đơn Hàng & Thanh Toán Tự Động VietQR SePay (`/api/v1/orders` & `/api/v1/webhooks/sepay`)
- `POST /api/v1/orders`:
  - Tạo đơn đăng ký đợt học (`cohort_id`) với khóa chống trùng `idempotency_key`.
  - Sinh mã đơn duy nhất `order_code` (ví dụ: `ET20268891`) và trả về thông tin tạo **Mã QR Ngân hàng (`VietQR`)**: Tên ngân hàng, Số tài khoản, Chủ tài khoản, Số tiền chính xác `amount_vnd`, Nội dung chuyển khoản bắt buộc `ET20268891` và đường dẫn ảnh QR (`https://img.vietqr.io/image/...`).
- `GET /api/v1/orders/:orderCode/status`: Kiểm tra trạng thái đơn hàng (`PENDING`, `PAID`, `EXPIRED`) để giao diện tự động chuyển sang màn hình nhập học thành công ngay khi tiền vào.
- `POST /api/v1/webhooks/sepay`:
  - Nhận thông báo giao dịch chuyển khoản thời gian thực từ **SePay** (xác thực qua Header `Authorization: Apikey <SEPAY_WEBHOOK_SECRET>`).
  - Bóc tách mã đơn `ET2026...` từ nội dung chuyển khoản (`content`) và số tiền nhận được (`transferAmount`).
  - Mở Transaction PostgreSQL với khóa hàng `SELECT * FROM orders WHERE order_code = $1 FOR UPDATE`:
    1. Nếu đơn đã `PAID` thì trả về `200 OK` ngay (Idempotent).
    2. Kiểm tra `transferAmount >= orders.amount_vnd`.
    3. Cập nhật `orders.status = 'PAID'`, chèn bản ghi `payment_transactions` (`gateway = 'SEPAY_VIETQR'`), tạo bản ghi nhập học `enrollments` (`status = 'ACTIVE'`), và cộng `cohorts.enrolled_count = enrolled_count + 1`.
- *(Hỗ trợ môi trường Dev/Demo)* `POST /api/v1/orders/:orderCode/simulate-sepay`: Endpoint dành riêng cho môi trường `development` để giả lập bắn tín hiệu Webhook SePay giúp kiểm thử luồng mở khóa lớp học tức thì.

---

### 4. Module Buổi Học, Phòng LiveKit & Trình Phát Video (`/api/v1/sessions`)
- `GET /api/v1/sessions/:sessionId`: *(Yêu cầu đã ghi danh lớp)* Lấy thông tin chi tiết buổi học: đường dẫn phát video bài giảng, phụ đề `.vtt` theo từng mốc giây, tóm tắt trọng tâm buổi học (`ai_summary_md`), danh sách tài liệu Slide PDF đính kèm (`session_attachments`), và thông tin bài kiểm tra 5 câu trắc nghiệm của buổi học.
- `POST /api/v1/sessions/:sessionId/progress`: Lưu lại vị trí giây video học viên đang xem dở (`last_position_sec`).
- `POST /api/v1/sessions/:sessionId/live-token`: Cấp JWT Token kết nối vào phòng học trực tuyến WebRTC `LiveKit` (phân quyền `isHost = true` nếu là Giảng viên phụ trách của lớp/buổi học hoặc Admin, `isHost = false` nếu là Học viên).
- `POST /api/v1/sessions/:sessionId/guest-invite`: *(Chỉ Giảng viên phụ trách/Admin)* Tạo đường dẫn mời Diễn giả khách mời dùng 1 lần (`/live/guest?token=...`) có quyền bật Mic/Camera/Chia sẻ màn hình trong 24h mà không cần tài khoản DB.

---

### 5. Module Bài Kiểm Tra Trắc Nghiệm (A, B, C, D) & Thi Cuối Khóa (`/api/v1/assessments`)
*(Chuẩn hóa 100% Trắc nghiệm 4 lựa chọn A, B, C, D — Chấm điểm tự động tức thì).*
- `POST /api/v1/assessments/:assessmentId/start`:
  - Khởi tạo lượt làm bài (`assessment_attempts`) và trả về danh sách câu hỏi từ bảng `assessment_items`.
  - **Bảo mật bắt buộc:** Chỉ trả về `id, item_order, item_type, skill_id, points, prompt_config` (gồm câu hỏi và 4 phương án A, B, C, D). **Tuyệt đối không trả về `grading_config` hay `explanation_md`**.
- `POST /api/v1/assessments/:assessmentId/attempts/:attemptId/submit`:
  - Nhận mảng đáp án đã chọn của học viên (`[{ itemId, selectedOptionId: 'A' | 'B' | 'C' | 'D' }]`).
  - **Chấm điểm tức thì ngay trong Transaction:**
    1. Đối chiếu `selectedOptionId` với `grading_config.correct_option_id` của từng câu để tính `total_score`, `score_pct` và `is_passed` ($\ge \text{pass\_score\_pct}$).
    2. Cập nhật điểm kỹ năng tham khảo của học viên trong bảng `student_skill_states` (`mastery_score` và `evidence_count`) tương ứng với `skill_id` của từng câu hỏi.
    3. **Nếu là Bài kiểm tra cuối buổi học (`SESSION_ASSIGNMENT`) và `is_passed = true`:** Tự động cập nhật `session_progress.is_completed = true` để mở khóa hoàn thành buổi học đó.
    4. **Nếu là Đề thi tốt nghiệp cuối khóa (`FINAL_EXAM`) và `is_passed = true`:** Tự động cập nhật `enrollments.final_exam_passed = true` và **cộng thêm `+4 Credits` vào `user_profiles.interview_credits`**.
    5. **Với các câu học viên chọn sai:** Truy vấn tương đồng vector (`item_embedding <=> knowledge_chunks.embedding`) để tìm đoạn phút:giây video bài giảng (`start_sec`, `end_sec`) và trang tài liệu PDF cần xem lại, lưu vào `remedial_recommendations` và trả về ngay cho học viên.
- `POST /api/v1/assessments/attempts/:attemptId/proctoring-events`: Ghi nhận sự kiện cảnh báo từ Camera AI trong kỳ thi cuối khóa.

---

### 6. Module Hồ Sơ CV, Kỹ Năng & Luyện Phỏng Vấn Giọng Nói 2 Vòng (`/api/v1/profile` & `/api/v1/mock-interviews`)
- `GET /api/v1/profile/resume-and-skills`:
  - Lấy thông tin Hồ sơ cá nhân dạng Resume (`cv_parsed_data`, `career_goal`, `interview_credits`).
  - Lấy danh sách **Kỹ năng đào tạo tại Học viện** (từ `student_skill_states` kèm điểm tham khảo `0–100`) tách biệt với danh sách **Kỹ năng ngoài ghi nhận từ CV** (`cv_parsed_data.external_skills`).
- `POST /api/v1/profile/upload-cv`:
  - Nhận file PDF CV của học viên (hoặc cập nhật mục tiêu nghề nghiệp `career_goal`).
  - Gọi sang `apps/ai-service` (`Gemini Multimodal PDF`) để trích xuất thông tin cá nhân, kinh nghiệm, dự án và danh sách kỹ năng lưu vào `user_profiles.cv_parsed_data`.
- `POST /api/v1/mock-interviews/screen-cv-jd` *(VÒNG 1: Duyệt Hồ sơ CV & Đối chiếu JD — Chưa trừ Credit)*:
  - Kiểm tra điều kiện học viên có `user_profiles.interview_credits > 0`.
  - Nhận `target_level` (`INTERN` | `FRESHER` | `JUNIOR` | `SENIOR`), `target_role` và nội dung tờ JD mục tiêu (`jd_raw_text`).
  - Lấy bản CV hiện tại trong `user_profiles.cv_parsed_data` cùng danh sách khóa học học viên đã hoàn thành tại Học viện gửi sang `apps/ai-service` để phân tích và trả về:
    1. Độ khớp giữa CV và JD (`match_score`).
    2. Lời nhắc bổ sung nếu học viên đã tốt nghiệp khóa học nhưng quên chưa ghi kỹ năng/dự án mới vào CV.
    3. Nhận xét cách trình bày bố cục CV và khoảng cách kỹ năng so với JD.
  - Tạo bản ghi `mock_interviews` ở trạng thái `IN_PROGRESS` (chưa trừ Credit).
- `POST /api/v1/mock-interviews/:id/turn` *(VÒNG 2: Đối thoại Phỏng vấn Giọng nói)*:
  - Nhận câu trả lời bằng giọng nói (hoặc văn bản đã nhận diện từ Mic) của học viên, cập nhật vào `transcript_log` và trả về câu hỏi xoáy tiếp theo của Senior AI (kèm âm thanh giọng đọc đa ngôn ngữ tự nhiên).
- `POST /api/v1/mock-interviews/:id/complete` *(Hoàn thành Phỏng vấn & Xuất Báo Cáo — Trừ `1 Credit`)*:
  - Sinh báo cáo đánh giá tổng kết buổi phỏng vấn (`evaluation_report`), đổi trạng thái sang `COMPLETED` và thực thi câu lệnh trừ `1 Credit` trong `user_profiles.interview_credits`.

---

### 7. Module Cổng Giảng Viên (`/api/v1/teach`) & Cổng Quản Trị Học Viện (`/api/v1/admin`)
- **Dành cho Giảng viên (`/api/v1/teach`):**
  - `GET /api/v1/teach/cohorts`: Lấy danh sách các lớp (`cohorts`) mà giảng viên đang phụ trách (`instructor_id`).
  - `GET /api/v1/teach/cohorts/:cohortId/sessions/:sessionId`: Xem chi tiết buổi học, danh sách học viên đã làm bài kiểm tra của buổi đó và bộ câu hỏi trắc nghiệm.
  - `PUT /api/v1/teach/sessions/:sessionId/materials`: Cập nhật tóm tắt buổi học, tải lên Slide PDF (tự động đẩy job vào Redis để lập chỉ mục RAG).
  - `POST /api/v1/teach/sessions/:sessionId/generate-quiz`: Gọi AI tự động sinh bộ câu hỏi trắc nghiệm A-B-C-D từ lời giảng buổi học ở trạng thái nháp (`DRAFT`).
  - `PUT /api/v1/teach/assessments/:assessmentId/publish`: Giảng viên duyệt và xuất bản bộ đề kiểm tra (`PUBLISHED`) cho học viên làm bài.
  - `POST /api/v1/teach/discussions/:postId/verify`: Xác nhận câu trả lời đúng trong mục hỏi đáp của học viên.
  - `POST /api/v1/teach/proctoring/:attemptId/verdict`: Duyệt kết quả ca thi cuối khóa có cảnh báo Camera (`CLEAN`, `CLEARED_BY_INSTRUCTOR`, `CONFIRMED_CHEAT`).
- **Dành cho Quản trị viên Học viện (`/api/v1/admin`):**
  - `GET /api/v1/admin/overview`: Thống kê tổng học viên, học phí tháng qua VietQR, số lớp đang mở và số chứng chỉ đã cấp.
  - `POST /api/v1/admin/courses` & `PUT /api/v1/admin/courses/:id`: Tạo/sửa khóa học gốc và khung đề cương chuẩn (`syllabus_template`).
  - `POST /api/v1/admin/cohorts`: Mở đợt khai giảng mới (`K01`, `K02`...), thiết lập phiên bản đề cương (`curriculum_version`), học phí, lịch học cố định hàng tuần, phân công Giảng viên phụ trách (`instructor_id`) và tự động khởi tạo danh sách các buổi học (`class_sessions` kèm kiểm tra chống trùng lịch `EXCLUDE USING gist`).
  - `PUT /api/v1/admin/cohorts/:cohortId/sessions`: Admin chỉnh sửa đề cương (tên buổi học, thứ tự buổi học, lịch học, giảng viên dạy thay) cho đợt khai giảng mới mà không ảnh hưởng tới các đợt cũ.
  - `POST /api/v1/admin/users/instructors`: Tạo tài khoản mới cho Giảng viên.
  - `POST /api/v1/admin/certificates/issue`: Duyệt cấp Chứng chỉ tốt nghiệp số (tạo mã `certificate_code` và chữ ký `hmac_signature`).

---

## PHẦN III: ĐẶC TẢ 5 TRỤ CỘT AI TRONG `apps/ai-service` (PYTHON 3.12 + FASTAPI — PORT 8000)

Toàn bộ các endpoint bên trong `apps/ai-service` đều yêu cầu Header `X-Internal-Key`:

### Trụ cột 1: Kho Tri Thức Hybrid RAG & Trợ Giảng Bám Sát Từng Giây Video (`/api/v1/ai/rag`)
- **Nạp học liệu nền (`ARQ Worker` — `ingest_session_material` & `process_live_recording`):**
  - Đọc phụ đề video (`.vtt` / `faster-whisper`) và tài liệu Slide PDF (`pymupdf`), chia thành các phân đoạn (`chunk_text`) giữ nguyên mốc giây `start_sec`, `end_sec` và số trang `page_number`.
  - Tạo vector 1024 chiều (`fastembed`) và lưu vào bảng `knowledge_chunks`.
- **Truy xuất Lai (`POST /api/v1/ai/rag/chat`):**
  - Kết hợp điểm tìm kiếm ngữ nghĩa (`pgvector <=>`) và tìm kiếm từ khóa (`tsvector @@`) bằng công thức **Reciprocal Rank Fusion (RRF)**: $\text{score} = \frac{1}{60 + \text{rank}_{\text{vector}}} + \frac{1}{60 + \text{rank}_{\text{fts}}}$.
  - Luôn lọc cứng theo `cohort_id` của lớp học (nếu là `SESSION_TUTOR`) hoặc `visibility = 'PUBLIC'` (nếu là `ADVISOR_GLOBAL`).
  - Trả về câu trả lời kèm mảng `citations` chứa chính xác `start_sec`, `end_sec`, `page_number` để trình phát video tua tới đúng giây đó.

### Trụ cột 2: AI Live Copilot Tóm Tắt Phòng Học Trực Tuyến (`/api/v1/ai/copilot`)
- `POST /api/v1/ai/copilot/catch-me-up`:
  - Nhận đoạn văn bản lời giảng trong 10 phút gần nhất của phòng học trực tuyến (`text transcript` — cực nhẹ, tiết kiệm tối đa token).
  - Tóm tắt thành 3–4 gạch đầu dòng súc tích giúp học viên vào lớp muộn nắm bắt ngay mạch bài giảng.

### Trụ cột 3: AI Quiz Generator — Tự Động Sinh Câu Hỏi Trắc Nghiệm A-B-C-D (`/api/v1/ai/assessments/generate-quiz`)
- `POST /api/v1/ai/assessments/generate-quiz`:
  - Nhận tiêu đề buổi học, nội dung lời giảng (`transcript_text`), danh sách `skill_ids` của khóa học và số lượng câu hỏi (5 câu cho buổi học hoặc 20 câu cho thi cuối khóa).
  - Yêu cầu `LLMGateway` (Gemini 2.5 Flash với Structured JSON Output) sinh ra mảng câu hỏi chuẩn định dạng `SINGLE_CHOICE` (4 phương án A, B, C, D, 1 đáp án đúng `correct_option_id`, lời giải thích `explanation_md` và `skill_id`), đồng thời tạo sẵn vector `item_embedding` cho từng câu hỏi để phục vụ việc tìm đoạn video ôn tập khi học viên làm sai.

### Trụ cột 4: Thẩm Định CV Đa Phương Thức & Phòng Phỏng Vấn Giọng Nói 2 Vòng (`/api/v1/ai/career`)
- `POST /api/v1/ai/career/parse-cv`:
  - Sử dụng `Gemini Multimodal` đọc file PDF CV của học viên (tốn ~258 tokens/trang), trích xuất cấu trúc JSON gồm: Thông tin cá nhân, Kinh nghiệm, Dự án đã làm, Kỹ năng thuộc Học viện và Kỹ năng bên ngoài (`external_skills`).
- `POST /api/v1/ai/career/screen-cv-jd` *(Vòng 1)*:
  - Đối chiếu bản CV hiện tại của học viên với tờ JD công ty mục tiêu, cấp bậc ứng tuyển (`INTERN` / `FRESHER` / `JUNIOR` / `SENIOR`) và danh sách khóa học đã tốt nghiệp để đánh giá bố cục CV, nhắc bổ sung kiến thức mới học và tính điểm khớp `match_score`.
- `POST /api/v1/ai/career/interview-turn` & `POST /api/v1/ai/career/interview-evaluate` *(Vòng 2)*:
  - Đóng vai Senior/Tech Lead của công ty trong JD, đặt câu hỏi xoáy sâu vào các dự án trong CV và yêu cầu của JD (hỗ trợ xử lý âm thanh / văn bản song ngữ Việt–Anh tự nhiên) và xuất báo cáo đánh giá chi tiết cuối buổi.

### Trụ cột 5: Giám Sát Thi Cuối Khóa Bằng Thị Giác Máy Tính (`/api/v1/ai/proctoring`)
- `POST /api/v1/ai/proctoring/verify-snapshot`:
  - Nhận ảnh chụp JPEG từ Webcam khi trình duyệt phát hiện dấu hiệu bất thường trong kỳ thi cuối khóa.
  - Chạy mô hình nhẹ `YOLO11n ONNX` (phát hiện điện thoại/người thứ hai) và `ArcFace ONNX` (so khớp với vector khuôn mặt gốc `user_profiles.face_embedding` của học viên) để trả về mức độ rủi ro.

