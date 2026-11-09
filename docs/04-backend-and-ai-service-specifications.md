# 04. Đặc Tả Kỹ Thuật Backend API & AI Service (EduTech AI Platform)

> **Tài liệu này quy định chi tiết danh sách Endpoints của `apps/api` (Node.js 22 + Express 5 + Drizzle ORM), 6 Trụ cột Trí tuệ Nhân tạo của `apps/ai-service` (Python 3.12 + FastAPI + ARQ), và Bảng Ánh Xạ Kế Thừa Thuật Toán từ dự án cũ (`Dự_án_CNPM`).**

---

## PHẦN I: ĐẶC TẢ CÁC MODULE BACKEND API (`apps/api`)

Toàn bộ API được đặt dưới tiền tố `/api/v1`. Mọi phản hồi lỗi đều tuân thủ chuẩn **RFC 9457 Problem Details** kèm `requestId` (`X-Request-ID`).

### 1. Module Xác thực & Định danh (`src/modules/auth/`)
| Phương thức & Đường dẫn | Quyền | Chức năng & Yêu cầu Nghiệp vụ |
| :--- | :---: | :--- |
| `POST /api/v1/auth/register` | Public | Đăng ký tài khoản `STUDENT`, băm mật khẩu bằng **Argon2id**, tạo `user_profiles`, gửi mã kích hoạt email. |
| `POST /api/v1/auth/login` | Public | Đăng nhập Email/Password, kiểm tra khóa tài khoản (`LOCKED`), cấp `accessToken` (RAM) và `refreshToken` (`HttpOnly Cookie`). |
| `POST /api/v1/auth/google` | Public | Xác thực `idToken` từ Google OAuth 2.0. Tự động liên kết vào tài khoản cùng Email nếu đã tồn tại, hoặc tạo tài khoản `STUDENT` mới. |
| `POST /api/v1/auth/refresh` | Cookie | Xoay vòng Refresh Token (Token Rotation) trong Redis, cấp Access Token mới. |
| `POST /api/v1/auth/logout` | Auth | Thu hồi Refresh Token hiện tại trong Redis và xóa Cookie. |
| `POST /api/v1/auth/forgot-password` | Public | Sinh token đặt lại mật khẩu có hạn 15 phút lưu trong Redis. |
| `POST /api/v1/auth/reset-password` | Public | Xác minh token khôi phục, cập nhật `password_hash` mới và thu hồi mọi phiên cũ. |
| `GET /api/v1/auth/me` | Auth | Trả về thông tin `Account`, `UserProfile` và `InstructorProfile` (nếu là Giảng viên). |

### 2. Module Danh mục, Kỹ năng & Khóa học (`src/modules/courses/`)
| Phương thức & Đường dẫn | Quyền | Chức năng & Yêu cầu Nghiệp vụ |
| :--- | :---: | :--- |
| `GET /api/v1/categories` | Public | Lấy cây danh mục đào tạo đa lĩnh vực. |
| `GET /api/v1/skills` | Public | Lấy từ điển kỹ năng chuẩn hóa (`skills`). |
| `GET /api/v1/courses` | Public | Tìm kiếm lai (Full-text + Bộ lọc danh mục, độ khó, kỹ năng, trạng thái mở lớp). |
| `GET /api/v1/courses/:slug` | Public | Chi tiết khóa học, chuẩn kỹ năng (`PREREQUISITE`, `LEARNING_OUTCOME`), khung chương trình mẫu, danh sách các đợt mở lớp (`cohorts`) và đánh giá. Nếu đã đăng nhập, trả thêm độ sẵn sàng kỹ năng của học viên. |
| `POST /api/v1/admin/courses` | `ADMIN` | Tạo khóa học mới, gán `course_skills` và `syllabus_template`, đẩy job tạo vector embedding cho khóa học. |
| `PATCH /api/v1/admin/courses/:id` | `ADMIN` | Cập nhật trực tiếp thông tin khóa học và trạng thái (`DRAFT`, `PUBLISHED`, `ARCHIVED`). |

### 3. Module Đợt học, Đội ngũ Giảng dạy & Quản lý Lịch học (`src/modules/cohorts/`)
| Phương thức & Đường dẫn | Quyền | Chức năng & Yêu cầu Nghiệp vụ |
| :--- | :---: | :--- |
| `GET /api/v1/cohorts/:id` | Enrolled / Staff | Lấy thông tin không gian lớp học: tiến độ, danh sách buổi học, lịch học, đội ngũ giảng viên/trợ giảng. |
| `POST /api/v1/admin/cohorts` | `ADMIN` | Mở đợt học mới từ một `Course`: tự động sinh danh sách `class_sessions` từ `syllabus_template`. |
| `PUT /api/v1/admin/cohorts/:id/staff` | `ADMIN` | Phân công Giảng viên (`INSTRUCTOR`) hoặc Trợ giảng (`TA`) vào đợt học. |
| `PATCH /api/v1/admin/sessions/:id/schedule` | `ADMIN` / `INSTRUCTOR` | Cập nhật lịch dự kiến (`scheduled_start`, `scheduled_end`) khi cần dời lịch buổi học hoặc đổi `host_instructor_id`, tự động kiểm tra chống trùng giờ dạy bằng `EXCLUDE USING gist`. |

### 4. Module Buổi học, Video HLS Chống Leak & Phòng LiveKit (`src/modules/sessions/`)
| Phương thức & Đường dẫn | Quyền | Chức năng & Yêu cầu Nghiệp vụ |
| :--- | :---: | :--- |
| `GET /api/v1/sessions/:id` | Enrolled / Staff | Chi tiết buổi học, danh sách tài liệu (`session_attachments`), phụ đề (`.vtt`), bản tóm tắt AI và bài kiểm tra hiểu bài (`SESSION_ASSIGNMENT`). |
| `POST /api/v1/sessions/:id/playback` | Enrolled / Staff | Kiểm tra quyền truy cập, trả về đường dẫn Manifest HLS R2 ngắn hạn, khóa giải mã AES-128 và thông tin `watermark` (`email`, `shortId`). |
| `POST /api/v1/sessions/:id/progress` | `STUDENT` | Lưu vị trí đang xem video (`last_position_sec`). Cờ `is_completed = TRUE` được kích hoạt tự động khi học viên vượt qua bài kiểm tra ngắn của buổi học (`is_passed = TRUE`). |
| `POST /api/v1/sessions/:id/live/token` | Enrolled / Staff | Cấp LiveKit Token: Nếu `user.role === 'ADMIN' \|\| session.host_instructor_id === user.id` (hoặc `TA` của lớp) thì cấp quyền `canPublish: true, roomAdmin: true`; nếu là `STUDENT` thì cấp quyền người học. |
| `POST /api/v1/sessions/:id/live/guest-link` | Host / `ADMIN` | **Sinh Link Mời Diễn Giả 1 chạm (`createGuestSpeakerToken`):** Tạo URL `/live/guest?token=...` có hiệu lực 24h cho phép chuyên gia khách mời bên ngoài vào thẳng phòng Live chia sẻ màn hình/bật mic mà không cần tạo tài khoản DB. |
| `POST /api/v1/sessions/:id/live/start` | Host / `ADMIN` | Bắt đầu buổi học trực tiếp (`status = 'LIVE'`). |
| `POST /api/v1/sessions/:id/live/end` | Host / `ADMIN` | Kết thúc buổi học, chuyển sang `PROCESSING_REPLAY` và đẩy job hậu kỳ vào `ARQ Worker`. |
| `POST /api/v1/sessions/:id/video` | Host / `TA` / `ADMIN` | Tải lên hoặc thay thế Video quay sẵn cho buổi học -> Đẩy job chuyển mã HLS AES-128, tạo phụ đề `.vtt` và **xóa + lập chỉ mục lại `knowledge_chunks`** của buổi học đó. |
| `POST /api/v1/sessions/:id/replay/approve` | Host / `TA` / `ADMIN` | Duyệt xuất bản bản ghi buổi học (`status = 'REPLAY_READY'`) và kích hoạt nạp kiến thức vào RAG. |

### 5. Module Đơn hàng Trực tiếp, VNPay Lũy đẳng & Chứng chỉ (`src/modules/orders/`)
| Phương thức & Đường dẫn | Quyền | Chức năng & Yêu cầu Nghiệp vụ |
| :--- | :---: | :--- |
| `POST /api/v1/orders/checkout` | `STUDENT` | Tạo đơn hàng trực tiếp cho 1 `Cohort` (kiểm tra đã tới `enrollment_open_at` và đợt học chưa `COMPLETED`, áp dụng `idempotencyKey`) và trả về URL thanh toán VNPay ký `HMAC-SHA512`. |
| `GET /api/v1/payments/vnpay-ipn` | Public (Webhook) | Xác minh chữ ký `HMAC-SHA512` bằng `crypto.timingSafeEqual`, khóa dòng đơn hàng `FOR UPDATE`, kiểm tra khớp số tiền `amount_vnd`, cập nhật `PAID`, tạo `enrollments` và tăng `enrolled_count`. |
| `POST /api/v1/admin/certificates/issue` | `ADMIN` | Cấp chứng chỉ số ký `HMAC-SHA256` cho học viên đủ điều kiện (hoàn thành các buổi học + đỗ `FINAL_EXAM` + `integrity_status = 'CLEAN'`). |
| `GET /api/v1/certificates/verify/:code` | Public | Tra cứu công khai tính hợp lệ của chứng chỉ và kiểm tra trạng thái thu hồi (`revoked_at`). |

### 6. Module Khảo thí 6 Dạng, AI Co-Grader & Giám sát Thi (`src/modules/assessments/`)
| Phương thức & Đường dẫn | Quyền | Chức năng & Yêu cầu Nghiệp vụ |
| :--- | :---: | :--- |
| `POST /api/v1/assessments/:id/start` | `STUDENT` | Tạo lượt làm bài (`assessment_attempts`), trả về danh sách câu hỏi **đã lọc bỏ hoàn toàn `grading_config`**. |
| `PUT /api/v1/attempts/:id/answers` | `STUDENT` | Lưu tự động (Autosave) câu trả lời của học viên (Trắc nghiệm, Tự luận Markdown / Code snippet / Link GitHub, hoặc File đính kèm). |
| `POST /api/v1/attempts/:id/submit` | `STUDENT` | Nộp bài: Chấm tự động các câu trắc nghiệm (`5ms`); đẩy các câu tự luận/dự án cần chấm tay sang AI Service (`/api/v1/ai/assessments/co-grade`) để tạo `ai_suggestion`; nếu đạt `SESSION_ASSIGNMENT` thì tự động cập nhật `session_progress.is_completed = TRUE`, cập nhật `student_skill_states` và gọi Micro-RecSys tạo lộ trình video ôn tập (`remedial_recommendations`). |
| `POST /api/v1/teach/answers/:id/grade` | `INSTRUCTOR` / `TA` | Giảng viên duyệt hoặc điều chỉnh điểm từ gợi ý của AI (`ai_suggestion`), lưu nhận xét `feedback_md` chỉ với 1 chạm. |
| `POST /api/v1/attempts/:id/proctor-events` | `STUDENT` | Ghi nhận sự kiện cảnh báo từ MediaPipe (Edge) hoặc gửi ảnh chụp bất thường sang AI Service (Server) để kiểm tra bằng YOLO11n + ArcFace. |
| `PATCH /api/v1/teach/attempts/:id/verdict` | `INSTRUCTOR` / `ADMIN` | Giảng viên duyệt bằng chứng giám sát thi và chốt phán quyết (`CLEAN`, `CONFIRMED_CHEAT`, `CLEARED_BY_INSTRUCTOR`). |

---

## PHẦN II: SÁU (6) TRỤ CỘT TRÍ TUỆ NHÂN TẠO TRONG `apps/ai-service`

### Trụ cột 1: Hybrid RAG + Cross-Encoder Reranker + Clickable Citations (`src/rag/`)
1. **Bóc tách tài liệu an toàn (`parser.py`):** Hỗ trợ PDF, DOCX, PPTX, Markdown và phụ đề VTT. Chặn tấn công XXE và giới hạn kích thước giải nén chống Zip-bomb.
2. **Chia đoạn giữ ngữ cảnh (`chunker.py`):** Giữ nguyên tiêu đề chương mục, không cắt đôi khối mã nguồn (`code blocks`), gán chính xác `start_sec`, `end_sec` (đối với video) hoặc `page_number` (đối với PDF).
3. **Truy xuất Lai (`retriever.py`):**
   - Kết hợp tìm kiếm ngữ nghĩa Vector Cosine (`embedding <=> $1`) trên chỉ mục HNSW và tìm kiếm từ khóa chính xác (`search_tsv @@ plainto_tsquery($2)`) trên chỉ mục GIN.
   - Hợp nhất kết quả bằng công thức **Reciprocal Rank Fusion (RRF)**:
     $$\text{RRF\_Score}(d) = \frac{1}{60 + \text{rank}_{\text{vector}}(d)} + \frac{1}{60 + \text{rank}_{\text{fts}}(d)}$$
   - Chấm điểm xếp hạng lại top 15 đoạn bằng **Cross-Encoder Reranker** lấy top 5 đoạn chuẩn nhất đưa vào ngữ cảnh LLM.
4. **Trích dẫn tương tác (`tutor_chain.py`):** Bắt buộc LLM trả về câu trả lời kèm danh sách `citations`. Trên giao diện học viên, bấm vào citation video sẽ tua trình phát HLS tới đúng `startSec`, bấm vào citation tài liệu sẽ mở đúng trang PDF.

### Trụ cột 2: AI Live Copilot & Post-Session Pipeline (`src/live_copilot/`)
1. **Phiên âm trực tiếp (`transcriber.py`):** Lọc bỏ khoảng lặng bằng **Silero VAD**, phiên âm tiếng Việt thời gian thực bằng **`faster-whisper`**.
2. **Bắt kịp bài giảng (`copilot.py` - Catch-Me-Up):** Khi học viên vào lớp muộn và bấm nút *"Tóm tắt 10 phút vừa qua"*, hệ thống lấy toàn bộ lời giảng trong cửa sổ 10 phút gần nhất để tóm tắt các ý chính mà giảng viên vừa trình bày.
3. **Gom cụm câu hỏi cho Giảng viên:** Phân cụm các câu hỏi trùng lặp trong khung chat trực tiếp để giảng viên giải đáp một lần.
4. **Hậu kỳ sau buổi học (`post_session.py`):** Tự động sinh bản tóm tắt Markdown (`ai_summary_md`), trích xuất các mốc chương bài học (Chapters), và tạo 5 câu hỏi trắc nghiệm nháp từ nội dung buổi học.

### Trụ cột 3: Hệ Gợi Ý Nhận Thức Kiến Thức 2 Tầng (`src/rag/` & RecSys)
1. **Cập nhật trạng thái kỹ năng (`student_skill_states`):** Sau mỗi bài tập/bài thi, điểm thành thạo `mastery_score` của từng kỹ năng được cập nhật bằng trung bình trượt có trọng số theo độ khó và độ mới của bằng chứng.
2. **Tầng 1 — Macro RecSys (Gợi ý Khóa học theo Vùng Phát Triển Gần Nhất - ZPD):**
   - Tính điểm sẵn sàng đầu vào: trung bình có trọng số `mastery_score` của các kỹ năng `PREREQUISITE` của khóa học.
   - Tính khoảng trống kiến thức cần học: $1 - \text{mastery\_score}$ của các kỹ năng `LEARNING_OUTCOME`.
   - Khóa học có điểm sẵn sàng cao ($\ge 0.70$) và nhiều kỹ năng mới chưa biết sẽ được đề xuất kèm lời giải thích cụ thể.
3. **Tầng 2 — Micro RecSys (Gợi ý Đoạn Video Ôn Tập Tức Thì):**
   - Với mỗi câu hỏi học viên làm sai, lấy `item_embedding` của câu hỏi đó truy vấn vào `knowledge_chunks` trong cùng `cohort_id` để trả về chính xác đoạn video bài giảng (`sessionId`, `start_sec`, `end_sec`) và trang tài liệu giảng về kiến thức đó.

### Trụ cột 4: Giám Sát Thi Computer Vision 2 Tầng (`src/proctoring_cv/`)
1. **Đối sánh danh tính (`face_verify.py`):** Dùng mô hình **ArcFace ONNX (512 chiều)** tính khoảng cách Cosine giữa ảnh chụp học viên lúc bắt đầu thi cuối khóa và `face_embedding` đã đăng ký lúc Onboarding.
2. **Phát hiện vật cấm & người lạ (`detector_yolo.py`):** Dùng **YOLO11n ONNX** phát hiện điện thoại di động (`cell phone`), sách vở, hoặc người thứ hai trong khung hình khi nhận ảnh chụp cảnh báo từ trình duyệt.
3. **Chấm điểm rủi ro cửa sổ trượt (`risk_scorer.py`):** Cộng dồn `risk_delta` có suy giảm theo thời gian để tránh báo động giả khi học viên chỉ cúi đầu thoáng qua 1–2 giây.

### Trụ cột 5: AI Scheduler Xếp Lịch Bằng Ràng Buộc (`src/scheduler_ai/`)
1. **Phân tích yêu cầu ngôn ngữ tự nhiên (`nl_parser.py`):** Chuyển câu lệnh tiếng Việt của Admin (VD: *"Không xếp lịch tối Chủ nhật, mỗi giảng viên dạy tối đa 3 buổi/tuần"*) thành cấu trúc JSON ràng buộc.
2. **Bộ giải tối ưu (`solver.py`):** Dùng **Google OR-Tools CP-SAT** giải bài toán phân bổ lịch học thỏa mãn:
   - Ràng buộc cứng: Không trùng giờ giảng viên giữa các lớp, nằm trong khung giờ rảnh `instructor_availabilities`.
   - Ràng buộc mềm: Phân bổ đều các buổi học trong tuần, tối ưu tải giảng dạy.
   - Nếu bài toán vô nghiệm (`INFEASIBLE`), trả về nguyên nhân xung đột cụ thể bằng tiếng Việt để Admin điều chỉnh.

### Trụ cột 6: AI Quiz Generator & AI Co-Grader (`LLM-as-a-Judge` - `src/api/routes/grading_ai.py`)
1. **AI Session Quiz Generator (`/api/v1/ai/assessments/generate-quiz`):** Tự động đọc phụ đề/nội dung buổi học để sinh bộ câu hỏi kiểm tra hiểu bài gắn với `skill_id`, phục vụ xác nhận hoàn thành buổi học (`session_progress.is_completed = TRUE`).
2. **AI Co-Grader & Code/Project Reviewer (`/api/v1/ai/assessments/co-grade`):** Phân tích bài làm tự luận (`ESSAY` — bao gồm bài viết Markdown, đoạn code dán vào hoặc link GitHub Repo) và tệp đính kèm (`FILE_SUBMISSION`) theo `rubric` của giảng viên để sinh điểm đề xuất và nhận xét chi tiết vào `submission_answers.ai_suggestion` cho Giảng viên duyệt 1 chạm.

---

## PHẦN III: BẢNG ÁNH XẠ KẾ THỪA THUẬT TOÁN TỪ DỰ ÁN CŨ (`Dự_án_CNPM`)

Khi triển khai chi tiết từng module trong dự án mới, hãy tham chiếu các tệp sau đây ở thư mục cũ `d:\Lap_Trinh_ST\web\Dự_án_CNPM` để tái sử dụng các thuật toán đã kiểm chứng và khắc phục triệt để các lỗi cũ:

| Hạng mục triển khai ở hệ thống mới | File tham chiếu tại `d:\Lap_Trinh_ST\web\Dự_án_CNPM` | Logic cần kế thừa & Điểm điều chỉnh ở hệ thống mới |
| :--- | :--- | :--- |
| **1. Bóc tách PDF / DOCX / PPTX an toàn** | `ai-service/src/rag/document_parser.py`<br/>`ai-service/src/api/routes/extract.py` | **Kế thừa:** Logic đọc XML trong RAM, chặn thực thể ngoại lai (XXE) và giới hạn dung lượng giải nén chống Zip-bomb.<br/>**Nâng cấp:** Đưa toàn bộ tác vụ bóc tệp nặng vào `ARQ Worker` chạy nền. |
| **2. Điều phối đa mô hình Gemini ↔ vLLM Qwen** | `ai-service/src/core/llm_provider.py`<br/>`vllm-server/docker-compose.yml` | **Kế thừa:** Cơ chế tự động chuyển đổi dự phòng (`auto fallback`) kèm thời gian nghỉ (`cooldown`).<br/>**Nâng cấp:** Dùng chung 1 `httpx.AsyncClient` trong `lifespan`, truyền đầy đủ header xác thực khi kiểm tra healthcheck vLLM và hỗ trợ Structured JSON Output. |
| **3. Sinh câu hỏi bài tập từ nội dung bài học** | `ai-service/src/api/routes/generate.py` | **Kế thừa:** Kỹ thuật bọc nội dung bài giảng trong thẻ `<NOI_DUNG_BAI_HOC>` để chống Prompt Injection và hàm hậu kiểm đáp án.<br/>**Nâng cấp:** Ánh xạ từng câu hỏi sinh ra vào mã kỹ năng `skill_id` của khóa học. |
| **4. Phiên âm âm thanh Faster-Whisper** | `ai-service/src/core/transcription.py` | **Kế thừa:** Kỹ thuật `lazy import` và tự động chọn cấu hình model theo phần cứng (GPU/CPU).<br/>**Nâng cấp:** Thêm bộ lọc tiếng ồn/khoảng lặng `Silero VAD` phía trước và xuất mốc thời gian `start_sec`, `end_sec` cho từng câu. |
| **5. Ký số & Xác minh giao dịch VNPay** | `3t-edu-tech-backend/src/utils/vnpay.util.js` | **Kế thừa:** Thuật toán sắp xếp khóa tham số theo bảng chữ cái (`sortObject`) và ký `HMAC-SHA512`.<br/>**Nâng cấp:** Kiểm tra chữ ký bằng `crypto.timingSafeEqual` và bọc cập nhật đơn hàng trong Transaction `FOR UPDATE`. |
| **6. Cấp & Xác thực Chứng chỉ HMAC** | `3t-edu-tech-backend/src/api/certificates/certificates.service.js` | **Kế thừa:** Cách tạo chữ ký điện tử `HMAC-SHA256` chống làm giả mã chứng chỉ.<br/>**Nâng cấp:** Chỉ cho phép cấp khi học viên đạt cả tiến độ buổi học, đỗ kỳ thi cuối khóa và không vi phạm quy chế giám sát thi (`CLEAN` / `CLEARED_BY_INSTRUCTOR`). |

