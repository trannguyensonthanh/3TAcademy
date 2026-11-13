# TÀI LIỆU ĐẶC TẢ API BACKEND — HỆ THỐNG ĐÀO TẠO 3T ACADEMY (EDUTECH AI PLATFORM)

**Phiên bản tài liệu:** `v3.1 (Production Handover — Đồng bộ 1:1 với Frontend Refactor Nghiệp vụ Thực tế & PostgreSQL 16 + pgvector 32 Bảng)`  
**Mục đích:** Tài liệu bàn giao chính thức cho đội ngũ phát triển Backend để triển khai toàn bộ hệ thống RESTful API phục vụ Frontend 3T Academy mà không cần chỉnh sửa lại bất kỳ logic hiển thị hay xử lý dữ liệu nào trên Frontend.

---

## MỤC LỤC

1. [Tổng quan Kiến trúc Giao tiếp HTTP & Quy ước Chung](#1-tổng-quan-kiến-trúc-giao-tiếp-http--quy-ước-chung)
   - 1.1. Cấu hình Base URL & Biến môi trường Frontend
   - 1.2. Chuẩn Request Headers tự động từ `apiClient.ts`
   - 1.3. Chuẩn JSON Response Envelope & Xử lý Lỗi HTTP
   - 1.4. Phân quyền Truy cập (RBAC) & Bảo mật JWT
   - 1.5. Các Ràng buộc Đồng bộ 1:1 với Schema PostgreSQL 32 Bảng
2. [Nhóm 1: Xác thực & Quản lý Phiên đăng nhập (`auth.api.ts`)](#2-nhóm-1-xác-thực--quản-lý-phiên-đăng-nhập-authapits)
   - `POST /auth/login` — Đăng nhập bằng Email & Mật khẩu
   - `POST /auth/register` — Đăng ký tài khoản Học viên mới
   - `POST /auth/google` — Đăng nhập / Đăng ký một chạm qua Google OAuth ID Token
   - `GET /auth/me` — Lấy thông tin định danh của phiên đăng nhập hiện tại
   - `POST /auth/logout` — Đăng xuất và hủy phiên làm việc
3. [Nhóm 2: Danh mục Đào tạo, Lớp khai giảng, Tra cứu Chứng chỉ & Tư vấn Lộ trình AI (`catalog.api.ts`)](#3-nhóm-2-danh-mục-đào-tạo-lớp-khai-giảng-tra-cứu-chứng-chỉ--tư-vấn-lộ-trình-ai-catalogapits)
   - `GET /categories` — Lấy danh sách Danh mục khóa học
   - `GET /skills` — Lấy danh sách Kỹ năng chuẩn đầu ra & Tiên quyết
   - `GET /courses` — Lấy danh sách Chương trình đào tạo (hỗ trợ lọc & tìm kiếm)
   - `GET /courses/:slug` — Lấy chi tiết Chương trình đào tạo, Đề cương & các Đợt mở lớp
   - `GET /cohorts` — Lấy danh sách toàn bộ Đợt mở lớp (Cohorts)
   - `GET /faqs` — Lấy danh sách Câu hỏi thường gặp (FAQ)
   - `GET /certificates` — Lấy danh sách Chứng chỉ cá nhân của Học viên đang đăng nhập
   - `GET /certificates/verify/:code` — Tra cứu & Xác thực Chứng chỉ số
   - `POST /advisor/ask` — Trợ lý AI tư vấn chọn khóa học & đợt khai giảng phù hợp
4. [Nhóm 3: Không gian Học tập Học viên, Phòng học Video, Livestream, AI Tutor & Hỏi đáp theo Mốc thời gian (`learning.api.ts`)](#4-nhóm-3-không-gian-học-tập-học-viên-phòng-học-video-ai-tutor--hỏi-đáp-theo-mốc-thời-gian-learningapits)
   - `GET /me/dashboard` — Tổng quan Góc học tập Học viên hôm nay
   - `GET /me/enrollments` — Danh sách Lớp học đã ghi danh & Biên lai của Học viên
   - `GET /cohorts/:cohortId/workspace` — Không gian Lớp học (Lộ trình buổi học, Tài liệu, Kỳ thi cuối khóa — Có kiểm soát quyền ghi danh)
   - `GET /cohorts/:cohortId/sessions/:sessionId` — Chi tiết Phòng học Video của một Buổi học (Kèm `chapters`, `transcript`, `aiChatHistory`)
   - `PUT /sessions/:sessionId/progress` — Cập nhật tiến độ xem Video bài giảng định kỳ mỗi 10 giây (`lastPositionSec`)
   - `POST /sessions/:sessionId/quiz-submit` — Nộp nhanh bài kiểm tra mở khóa trong trình phát thu nhỏ
   - `POST /ai/tutor/ask` — Hỏi Trợ giảng AI 24/7 kèm trích dẫn mốc thời gian Video, trang Slide & Tóm tắt 10 phút vừa qua cho học viên vào muộn
   - `GET /sessions/:sessionId/discussions` — Lấy danh sách Thảo luận / Hỏi đáp của Buổi học
   - `POST /sessions/:sessionId/discussions` — Tạo câu hỏi thảo luận mới gắn mốc thời gian Video
   - `GET /sessions/:sessionId/chat-messages` — Lấy danh sách Tin nhắn Trò chuyện Trực tiếp (Live Chat) trong phòng Livestream
   - `POST /sessions/:sessionId/chat-messages` — Gửi Tin nhắn Trò chuyện Trực tiếp (Live Chat) trong phòng Livestream
   - `POST /live/guest/verify` — Xác thực Token tham gia nhanh 1 chạm của Diễn giả khách mời (`/live/guest`)
5. [Nhóm 4: Bài kiểm tra Mở khóa (10 câu), Thi Tốt nghiệp Cuối khóa (25 câu) & Giám sát Camera AI (`assessment.api.ts`)](#5-nhóm-4-bài-kiểm-tra-mở-khóa-10-câu-thi-tốt-nghiệp-cuối-khóa-25-câu--giám-sát-camera-ai-assessmentapits)
   - `GET /assessments/:assessmentId` — Lấy đề kiểm tra / đề thi cho Học viên (Đã lọc bỏ đáp án đúng)
   - `POST /assessments/:assessmentId/submit` — Nộp bài trắc nghiệm & Chấm điểm tức thì (0 giây)
   - `GET /assessments/:assessmentId/result` — Xem kết quả chi tiết, giải thích đáp án & chỉ dẫn ôn tập mốc Video
   - `POST /assessments/:assessmentId/proctoring-events` — Ghi nhận sự kiện Giám sát Camera AI trong ca thi
6. [Nhóm 5: Hồ sơ Năng lực 6 Khối, Thiết lập Hồ sơ Khởi đầu (`/onboarding`), Đối soát CV Thông minh & Luyện Phỏng vấn Giọng nói AI (`profile-interview.api.ts`)](#6-nhóm-5-hồ-sơ-năng-lực-6-khối-đối-soát-cv-thông-minh--luyện-phỏng-vấn-giọng-nói-ai-profile-interviewapits)
   - `GET /me/profile-skills` — Lấy Hồ sơ CV 6 khối, Bản đồ kỹ năng (`0–100`) & Số lượt phỏng vấn (`interviewCredits`)
   - `PUT /me/profile` — Cập nhật Hồ sơ Khởi đầu & Mục tiêu Nghề nghiệp (`fullName`, `avatarUrl`, `phone`, `bio`, `careerGoal`) từ bước `/onboarding` hoặc Hồ sơ cá nhân
   - `POST /me/cv/upload` — Tải lên file CV PDF để bóc tách (`PARSE_PDF`) hoặc Lưu Hồ sơ Năng lực (`SAVE_RESUME`)
   - `POST /interviews/screen-cv` — Vòng 1: Chấm độ khớp Hồ sơ CV với JD mục tiêu (Không trừ Credit)
   - `POST /interviews/:interviewId/start` — Vòng 2: Bắt đầu vào Phòng phỏng vấn giọng nói trực tiếp
   - `POST /interviews/:interviewId/turn` — Vòng 2: Gửi câu trả lời giọng nói (Transcript) của từng lượt hỏi
   - `POST /interviews/:interviewId/complete` — Chặng 3: Hoàn tất phỏng vấn, trừ 1 Credit & Nhận Báo cáo Đánh giá
   - `DELETE /interviews/:interviewId` — Hủy / Thoát phiên phỏng vấn giữa chừng (Xóa bản nháp, trừ `0` Credit)
7. [Nhóm 6: Đơn hàng Học phí & Thanh toán Tự động VietQR SePay (`order.api.ts`)](#7-nhóm-6-đơn-hàng-học-phí--thanh-toán-tự-động-vietqr-sepay-orderapits)
   - `POST /orders` — Khởi tạo đơn ghi danh Lớp học & Sinh mã VietQR (Có `Idempotency-Key`)
   - `GET /orders/:orderCode` — Kiểm tra trạng thái thanh toán của Đơn hàng
   - `GET /orders/my-history` — Lấy lịch sử Biên lai đóng học phí của Học viên
   - `POST /webhooks/sepay/simulate` — Webhook đối soát giao dịch chuyển khoản ngân hàng SePay
8. [Nhóm 7: Cổng Giảng viên — Lịch dạy, Quản lý Lớp 3 Cấp, Soạn đề & Duyệt Ca thi (`teach.api.ts`)](#8-nhóm-7-cổng-giảng-viên--lịch-dạy-quản-lý-lớp-3-cấp-soạn-đề--duyệt-ca-thi-teachapits)
   - `GET /teach/schedule` — Dữ liệu tổng hợp Lịch dạy hôm nay, Học viên chậm tiến độ, Hỏi đáp & Thống kê lớp
   - `GET /teach/cohorts` — Danh sách các Đợt mở lớp mà Giảng viên phụ trách
   - `GET /teach/cohorts/:cohortId` — Cấp 2: Chi tiết Lớp học, Đề thi tốt nghiệp 25 câu & Tiến độ học viên
   - `GET /teach/cohorts/:cohortId/sessions/:sessionId` — Cấp 3: Chi tiết Buổi học, Tài liệu & Bộ đề 10 câu
   - `PUT /teach/sessions/:sessionId/materials` — Cập nhật Tóm tắt buổi học, Đổi lịch buổi học & Tải lên Tài liệu mới
   - `POST /teach/sessions/:sessionId/generate-quiz` — AI tạo tự động 10 câu hỏi trắc nghiệm từ nội dung buổi học (`DRAFT`)
   - `PUT /teach/assessments/:assessmentId/publish` — Lưu bản nháp câu hỏi (`DRAFT`) hoặc Duyệt & Xuất bản đề (`PUBLISHED`)
   - `POST /teach/sessions/:sessionId/guest-link` — Tạo đường dẫn tham gia nhanh 1 chạm cho Diễn giả khách mời
   - `POST /teach/discussions/:threadId/reply` — Giảng viên trả lời & Xác nhận câu trả lời chuẩn (`verifiedByStaff`)
   - `PUT /teach/exam-reviews/:reviewId` — Giảng viên duyệt hoặc yêu cầu thi lại đối với ca thi có cờ cảnh báo Camera
   - `POST /teach/enrollments/:enrollmentId/ai-reminder` — Gửi thông báo nhắc nhở học tập cá nhân hóa cho Học viên chậm tiến độ
9. [Nhóm 8: Cổng Quản trị Học viện — Chương trình Đào tạo, Mở lớp, Tài khoản RBAC, Tài chính & Chứng chỉ (`admin.api.ts`)](#9-nhóm-8-cổng-quản-trị-học-viện--chương-trình-đào-tạo-mở-lớp-tài-khoản-rbac-tài-chính--chứng-chỉ-adminapits)
   - `GET /admin/overview` — Dữ liệu tổng quan toàn Học viện, Doanh thu, Thống kê AI, Tài khoản & Học viên đủ điều kiện tốt nghiệp
   - `POST /admin/courses` — Tạo mới Chương trình đào tạo hoặc Lưu cập nhật Phiên bản đề cương (`syllabusTemplate`)
   - `POST /admin/cohorts` — Mở lớp khai giảng mới hoặc Cập nhật khung lịch học hàng tuần (`scheduleSlots`)
   - `PUT /admin/users` — Khóa / Mở khóa tài khoản hoặc Cập nhật phân quyền người dùng
   - `POST /admin/accounts` — Tạo tài khoản mới (Học viên / Giảng viên / Quản trị viên) khớp chuẩn 3 bảng `accounts`, `user_profiles`, `instructor_profiles`
   - `GET /admin/sepay-transactions` — Lấy danh sách Giao dịch biến động số dư SePay để đối soát học phí
   - `POST /admin/certificates/issue` — Cấp chứng chỉ tốt nghiệp (Đơn lẻ hoặc Hàng loạt) & Cộng `+4` lượt phỏng vấn AI
   - `PUT /admin/certificates/:certificateCode/revoke` — Thu hồi hoặc Khôi phục hiệu lực Chứng chỉ số
10. [Tổng hợp Luồng Nghiệp vụ Liên kết Giữa các API (End-to-End Flows)](#10-tổng-hợp-luồng-nghiệp-vụ-liên-kết-giữa-các-api-end-to-end-flows)

---

## 1. Tổng quan Kiến trúc Giao tiếp HTTP & Quy ước Chung

### 1.1. Cấu hình Base URL & Biến môi trường Frontend
Toàn bộ các lệnh gọi HTTP trong hệ thống Frontend được quản lý tập trung tại `src/services/apiClient.ts`:

```env
VITE_API_BASE_URL=http://localhost:4000/api/v1
VITE_USE_MOCKS=false
```

- Khi biến môi trường `VITE_API_BASE_URL` được khai báo trong `.env`, `API_CONFIG.USE_MOCK_FALLBACK` sẽ **tự động chuyển sang `false`** và mọi request sẽ được gửi trực tiếp qua `fetch()` tới `${VITE_API_BASE_URL}${endpoint}`.
- Đội ngũ Backend chỉ cần triển khai các endpoint dưới prefix `/api/v1` (hoặc bất kỳ Base URL nào được khai báo trong `VITE_API_BASE_URL`).

### 1.2. Chuẩn Request Headers tự động từ `apiClient.ts`
Mọi HTTP request gửi từ `httpRequest<T>(endpoint, options)` trong `src/services/apiClient.ts` đều tự động đính kèm:

| Header | Giá trị / Quy tắc | Mô tả |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Tự động đính kèm cho mọi request (trừ khi `body` là `FormData`). |
| `X-Request-ID` | UUID v4 (VD: `550e8400-e29b-41d4-a716-446655440000`) | Mã định danh duy nhất cho mỗi HTTP Request để phục vụ Distributed Tracing và ghi log trên Backend. |
| `Authorization` | `Bearer <accessToken>` | Tự động lấy từ `localStorage.getItem('3t_academy_access_token')` nếu người dùng đã đăng nhập. |
| `Idempotency-Key` | Chuỗi định danh duy nhất (VD: `idem-checkout-cohort-ai-k01`) | Đính kèm riêng ở endpoint `POST /orders` để chống tạo trùng đơn hàng khi mạng chập chờn. |

Đồng thời, `fetch` luôn được gọi với tùy chọn `credentials: 'include'` để hỗ trợ cả mô hình HttpOnly Refresh Token Cookie từ phía Backend.

### 1.3. Chuẩn JSON Response Envelope & Xử lý Lỗi HTTP
Hàm `httpRequest<T>` trên Frontend (dòng 85–89 của `src/services/apiClient.ts`) hỗ trợ linh hoạt **cả 2 định dạng trả về** từ Backend:

1. **Định dạng bọc chuẩn (Recommended Envelope):**
```json
{
  "success": true,
  "data": { ... }
}
```
Khi Backend trả về object có `"success": true` và trường `"data"`, `httpRequest<T>` sẽ tự động trích xuất `json.data` và trả về đúng kiểu `T` cho các View/Component.

2. **Định dạng trả trực tiếp (Direct Payload):**
Trả thẳng payload kiểu `T` ở cấp cao nhất của JSON.

3. **Định dạng khi xảy ra lỗi (`HTTP Status >= 400`):**
Khi `!response.ok`, Frontend sẽ ném lỗi hoặc đọc thông báo lỗi. Khuyến nghị Backend trả về cấu trúc lỗi thống nhất:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email tài khoản không được để trống (accounts.email NOT NULL)."
  }
}
```

### 1.4. Phân quyền Truy cập (RBAC) & Bảo mật JWT
Hệ thống sử dụng đúng 3 vai trò trong cơ sở dữ liệu (`account_role` ENUM trong PostgreSQL):
- `'STUDENT'`: Học viên.
- `'INSTRUCTOR'`: Giảng viên phụ trách lớp.
- `'ADMIN'`: Quản trị viên học viện.
- *(Trên giao diện Frontend có thêm trạng thái `'GUEST'` dành cho khách vãng lai chưa đăng nhập).*

### 1.5. Các Ràng buộc Đồng bộ 1:1 với Schema PostgreSQL 32 Bảng
1. **Không có vai trò Trợ giảng (TA) ở cấp độ Lớp học (`cohorts`)**:
   - Bảng `cohorts` chỉ lưu duy nhất 1 Giảng viên phụ trách chính (`instructor_id`).
   - Mảng `cohort.staff` trên Frontend chỉ chứa phần tử có `role: "INSTRUCTOR"`.
2. **`iconName` trong `CourseCategoryItem` là Optional/Nullable (`iconName?: string | null`)**:
   - Bảng `categories` dưới Database không lưu cột `icon_name`. Backend có thể trả về `iconName: null` hoặc lược bỏ trường này; Frontend tự động ánh xạ icon theo `slug` / `name`.
3. **Thảo luận theo mốc thời gian Video (`discussion_threads`)**:
   - Bảng `discussion_threads` lưu cả `title` (`questionTitle`), `content_md` (`contentMd` / `questionBody`) và `video_timestamp_sec` (`videoTimestampSec` / `timestampSec`).
4. **Thang điểm Kỹ năng (`student_skill_states.mastery_score`)**:
   - Đồng bộ thống nhất trên thang điểm `0–100` (`score` / `masteryScore`).
5. **Phiên bản đề cương của Lớp học (`cohorts.curriculum_version`)**:
   - Hỗ trợ chuỗi tối đa `120` ký tự (`VARCHAR(120)`), ví dụ: `"Phiên bản 2026 mới (v2026 — 7 buổi cập nhật mới)"` hoặc `"v2.5"`.

---

## 2. Nhóm 1: Xác thực & Quản lý Phiên đăng nhập (`auth.api.ts`)

File dịch vụ Frontend: `src/services/auth.api.ts`

---

### API 1.1: Đăng nhập bằng Email & Mật khẩu
- **Tên API:** `authApi.login`
- **HTTP Method:** `POST`
- **Endpoint:** `/auth/login`
- **Nhóm chức năng:** Authentication & Authorization
- **Nơi sử dụng trên Frontend:** `src/views/AuthView.tsx`
- **Yêu cầu xác thực:** Public (Không yêu cầu token).

#### Request – Dữ liệu đầu vào
- **Path / Query Parameters:** Không có.
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giới hạn / Giá trị hợp lệ | Ý nghĩa & Mục đích sử dụng |
| :--- | :--- | :---: | :--- | :--- |
| `email` | `string` | Có | Email hợp lệ (`CITEXT` trong DB) | Địa chỉ email đăng nhập của tài khoản (`accounts.email`). |
| `password` | `string` | Có | Tối thiểu 6 ký tự | Mật khẩu đăng nhập để đối chiếu với `accounts.password_hash`. |

**JSON Request mẫu:**
```json
{
  "email": "an.nguyen.dev@gmail.com",
  "password": "Password@2026"
}
```

#### Response – Dữ liệu đầu ra (`AuthSessionResponse`)
- **HTTP Status Code:** `200 OK` (Thành công), `401 Unauthorized` (Sai thông tin đăng nhập), `403 Forbidden` (Tài khoản bị khóa `status = 'LOCKED'`).

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `accessToken` | `string` | Có | Chuỗi JWT Access Token. Frontend sẽ lưu vào `localStorage` qua `setAuthAccessToken(res.accessToken)`. |
| `user` | `AuthUserProfile` | Có | Thông tin định danh cơ bản của người dùng vừa đăng nhập. |
| `user.id` | `string` (UUID) | Có | ID tài khoản (`accounts.id`). |
| `user.fullName` | `string` | Có | Họ và tên hiển thị (`user_profiles.full_name`). |
| `user.email` | `string` | Có | Địa chỉ email của tài khoản (`accounts.email`). |
| `user.role` | `'STUDENT' \| 'INSTRUCTOR' \| 'ADMIN'` | Có | Vai trò tài khoản (`accounts.role`). |
| `user.avatarUrl` | `string` | Không | Đường dẫn ảnh đại diện (`user_profiles.avatar_url`). |

**JSON Response mẫu (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr-student-an",
      "fullName": "Nguyễn Văn An",
      "email": "an.nguyen.dev@gmail.com",
      "role": "STUDENT",
      "avatarUrl": "/assets/aistudio/image_087a245c.png"
    }
  }
}
```

**JSON Response lỗi mẫu (401 Unauthorized):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email hoặc mật khẩu không chính xác."
  }
}
```

#### Mô tả nghiệp vụ
- Khi người dùng nhập email và mật khẩu tại `/login` (`AuthView.tsx`), Frontend gọi `authApi.login(email, password)`.
- Lưu ý: Backend có thể phân quyền theo `accounts.role` thực tế trong DB. Sau khi nhận `res`, `AuthView.tsx` gọi `setAuthAccessToken(res.accessToken)`, `setRole(res.user.role)` và điều hướng người dùng tới `/app` (nếu `STUDENT`), `/teach` (nếu `INSTRUCTOR`), hoặc `/admin` (nếu `ADMIN`).

---

### API 1.2: Đăng ký tài khoản Học viên mới
- **Tên API:** `authApi.register`
- **HTTP Method:** `POST`
- **Endpoint:** `/auth/register`
- **Nhóm chức năng:** Authentication & Authorization
- **Nơi sử dụng trên Frontend:** `src/views/AuthView.tsx`
- **Yêu cầu xác thực:** Public.

#### Request – Dữ liệu đầu vào
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giới hạn / Giá trị hợp lệ | Ý nghĩa & Mục đích sử dụng |
| :--- | :--- | :---: | :--- | :--- |
| `fullName` | `string` | Có | 2–120 ký tự | Họ và tên thật của học viên (dùng để in lên Chứng chỉ tốt nghiệp). |
| `email` | `string` | Có | Email hợp lệ, chưa tồn tại | Email đăng ký tài khoản mới. |
| `password` | `string` | Có | Tối thiểu 8 ký tự | Mật khẩu khởi tạo tài khoản. |

**JSON Request mẫu:**
```json
{
  "fullName": "Nguyễn Văn An",
  "email": "an.nguyen.dev@gmail.com",
  "password": "StrongPassword@2026"
}
```

#### Response – Dữ liệu đầu ra (`AuthSessionResponse`)
- **HTTP Status Code:** `201 Created` hoặc `200 OK`, `409 Conflict` (Email đã tồn tại).
- Cấu trúc giống hệt `AuthSessionResponse` của API `POST /auth/login` (với `user.role = "STUDENT"` và cấp mặc định `interview_credits = 2` trong bảng `user_profiles`).

**JSON Response mẫu (201 Created):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "usr-student-new-01",
      "fullName": "Nguyễn Văn An",
      "email": "an.nguyen.dev@gmail.com",
      "role": "STUDENT"
    }
  }
}
```

#### Mô tả nghiệp vụ
- Sau khi tạo tài khoản thành công trong bảng `accounts` và `user_profiles`, Backend trả về `accessToken` và `user`.
- `AuthView.tsx` tự động lưu `accessToken`, đặt `role = 'STUDENT'` và chuyển người dùng sang trang `/onboarding` (Thiết lập lộ trình học cá nhân 4 bước).

---

### API 1.3: Đăng nhập / Đăng ký qua Google OAuth
- **Tên API:** `authApi.googleAuth` / `authApi.googleLogin`
- **HTTP Method:** `POST`
- **Endpoint:** `/auth/google`
- **Nhóm chức năng:** Authentication & Authorization
- **Nơi sử dụng trên Frontend:** `src/views/AuthView.tsx`
- **Yêu cầu xác thực:** Public.

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `idToken` | `string` | Có | Google ID Token nhận được từ Google Identity Services ở phía Client. |

**JSON Request mẫu:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."
}
```

#### Response – Dữ liệu đầu ra (`AuthSessionResponse`)
- **HTTP Status Code:** `200 OK`.
- Cấu trúc trả về giống hệt `AuthSessionResponse` (`accessToken` và `user`).

---

### API 1.4: Lấy thông tin người dùng hiện tại
- **Tên API:** `authApi.getMe`
- **HTTP Method:** `GET`
- **Endpoint:** `/auth/me`
- **Nhóm chức năng:** Authentication & Session Hydration
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx` (khi khởi động ứng dụng và khi đồng bộ tài khoản Học viên).
- **Yêu cầu xác thực:** Yêu cầu `Authorization: Bearer <accessToken>`.

#### Request – Dữ liệu đầu vào
- Không có tham số Path/Query/Body. Đọc danh tính từ JWT Header.

#### Response – Dữ liệu đầu ra (`AuthUserProfile`)
- **HTTP Status Code:** `200 OK`, `401 Unauthorized`.

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "id": "usr-student-an",
    "fullName": "Nguyễn Văn An",
    "email": "an.nguyen.dev@gmail.com",
    "role": "STUDENT",
    "avatarUrl": "/assets/aistudio/image_087a245c.png"
  }
}
```

#### Mô tả nghiệp vụ
- Được gọi trong `AcademyContext.tsx` lúc khởi chạy ứng dụng để khôi phục phiên đăng nhập và vai trò (`role`) của người dùng.

---

### API 1.5: Đăng xuất tài khoản
- **Tên API:** `authApi.logout`
- **HTTP Method:** `POST`
- **Endpoint:** `/auth/logout`
- **Nhóm chức năng:** Authentication & Authorization
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/components/TopNavbar.tsx`, `src/views/InstructorPortalView.tsx`, `src/views/AdminPortalView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (hoặc Cookie phiên hiện tại).

#### Request – Dữ liệu đầu vào
- Không có Request Body.

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `success` | `boolean` | Có | Trạng thái đăng xuất thành công (`true`). |
| `loggedOutAt` | `string` (ISO 8601) | Có | Thời điểm đăng xuất. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "loggedOutAt": "2026-11-12T15:30:00.000Z"
  }
}
```

#### Mô tả nghiệp vụ
- Khi người dùng bấm nút "Đăng xuất", Frontend xóa `accessToken` trong `localStorage` (`setAuthAccessToken(null)`), gọi `authApi.logout()` để Backend thu hồi Refresh Token trong bảng `refresh_tokens`, và chuyển trạng thái về `'GUEST'`.

---

## 3. Nhóm 2: Danh mục Đào tạo, Lớp khai giảng, Tra cứu Chứng chỉ & Tư vấn Lộ trình AI (`catalog.api.ts`)

File dịch vụ Frontend: `src/services/catalog.api.ts`

---

### API 2.1: Lấy danh sách Danh mục khóa học
- **Tên API:** `catalogApi.getCategories`
- **HTTP Method:** `GET`
- **Endpoint:** `/categories`
- **Nhóm chức năng:** Catalog & Learning Content
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/views/HomeView.tsx`, `src/views/CoursesCatalogView.tsx`.
- **Yêu cầu xác thực:** Public.

#### Request – Dữ liệu đầu vào
- Không có tham số.

#### Response – Dữ liệu đầu ra (`CourseCategoryItem[]`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string \| number` | Có | ID danh mục (`categories.id`). |
| `name` | `string` | Có | Tên hiển thị danh mục (VD: `'AI & Dữ liệu'`, `'Kỹ thuật Phần mềm & Cloud'`, `'Phân tích Dữ liệu'`). |
| `slug` | `string` | Không | Đường dẫn tĩnh của danh mục (`categories.slug`). |
| `description` | `string \| null` | Không | Mô tả ngắn về nhóm ngành đào tạo (`categories.description`). |
| `parentId` | `string \| number \| null` | Không | ID danh mục cha nếu phân cấp (`categories.parent_id`). |
| `courseCount` | `number` | Không | Số lượng chương trình đào tạo thuộc danh mục. |
| `count` | `number` | Không | Alias dự phòng cho `courseCount` trên thẻ danh mục ở Trang chủ. |
| `iconName` | `string \| null` | **Không (Nullable)** | Đã chuyển sang Optional/Nullable vì bảng `categories` dưới DB không lưu cột `icon_name`. Khi nhận `null`, Frontend tự động dùng hàm `resolveCategoryIcon` để hiển thị icon phù hợp. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cat-ai",
      "name": "AI & Dữ liệu",
      "slug": "ai-va-du-lieu",
      "description": "Xây dựng hệ thống RAG, Multi-Agent và ứng dụng LLM thực chiến.",
      "parentId": null,
      "courseCount": 1,
      "count": 1,
      "iconName": null
    },
    {
      "id": "cat-swe",
      "name": "Kỹ thuật Phần mềm & Cloud",
      "slug": "ky-thuat-phan-mem-cloud",
      "description": "Thiết kế hệ thống phân tán, cổng thanh toán bất đồng bộ và Cloud Native.",
      "parentId": null,
      "courseCount": 1,
      "count": 1,
      "iconName": null
    },
    {
      "id": "cat-data",
      "name": "Phân tích Dữ liệu",
      "slug": "phan-tich-du-lieu",
      "description": "Python, SQL, Data Warehouse chuẩn Medallion và BI Dashboard.",
      "parentId": null,
      "courseCount": 2,
      "count": 2,
      "iconName": null
    }
  ]
}
```

---

### API 2.2: Lấy danh sách Kỹ năng chuẩn đầu ra & Tiên quyết
- **Tên API:** `catalogApi.getSkills`
- **HTTP Method:** `GET`
- **Endpoint:** `/skills`
- **Nhóm chức năng:** Catalog & Competency Taxonomy
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Public.

#### Response – Dữ liệu đầu ra (`CourseSkill[]`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Không | ID kỹ năng (`skills.id`). |
| `type` | `'PREREQUISITE' \| 'LEARNING_OUTCOME'` | Có | Vai trò của kỹ năng (`course_skills.relation_role`). |
| `code` | `string` | Có | Mã kỹ năng chuẩn (VD: `'HYBRID-RAG'`, `'DOCLING-CHUNK'`). |
| `name` | `string` | Có | Tên hiển thị tiếng Việt của kỹ năng. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": [
    {
      "id": "sk-01",
      "type": "LEARNING_OUTCOME",
      "code": "HYBRID-RAG",
      "name": "Xây dựng Tìm kiếm Kết hợp (Hybrid RAG)"
    },
    {
      "id": "sk-02",
      "type": "PREREQUISITE",
      "code": "PYTHON-ASYNC",
      "name": "Lập trình Python & Xử lý Bất đồng bộ"
    }
  ]
}
```

---

### API 2.3: Lấy danh sách Chương trình đào tạo (Courses)
- **Tên API:** `catalogApi.getCourses`
- **HTTP Method:** `GET`
- **Endpoint:** `/courses`
- **Nhóm chức năng:** Course Management & Public Catalog
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/views/CoursesCatalogView.tsx`, `src/views/AdminPortalView.tsx`.
- **Yêu cầu xác thực:** Public.

#### Request – Dữ liệu đầu vào (Query Parameters)
| Tên Query Param | Kiểu dữ liệu | Bắt buộc | Giá trị hợp lệ / Ví dụ | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `category` | `string` | Không | `'AI & Dữ liệu'`, `'ALL'` hoặc rỗng `''` | Lọc theo tên danh mục khóa học. |
| `level` | `string` | Không | `'1'`, `'2'`, `'3'`, `'4'`, `'5'` hoặc `''` | Lọc theo độ khó (`difficultyLevel`). |
| `q` | `string` | Không | `'RAG'`, `'Python'`, `''` | Từ khóa tìm kiếm theo tiêu đề, mô tả hoặc tên kỹ năng. |

#### Response – Dữ liệu đầu ra (`Course[]`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | ID chương trình đào tạo (`courses.id`). |
| `slug` | `string` | Có | Đường dẫn URL tĩnh (`courses.slug`). |
| `title` | `string` | Có | Tên chương trình đào tạo (`courses.title`). |
| `shortDescription` | `string` | Có | Mô tả tóm tắt hiển thị trên thẻ khóa học. |
| `descriptionMd` | `string` | Có | Mô tả chi tiết định dạng Markdown (`courses.description_md`). |
| `category` | `'AI & Dữ liệu' \| 'Kỹ thuật Phần mềm & Cloud' \| 'Phân tích Dữ liệu'` | Có | Tên danh mục của khóa học. |
| `difficultyLevel` | `1 \| 2 \| 3 \| 4 \| 5` | Có | Cấp độ khó từ 1 đến 5. |
| `durationWeeks` | `number` | Không | Thời lượng khóa học tính theo tuần. |
| `totalHours` | `number` | Không | Tổng số giờ học thực hành. |
| `skills` | `CourseSkill[]` | Có | Danh sách kỹ năng đầu vào (`PREREQUISITE`) và chuẩn đầu ra (`LEARNING_OUTCOME`). |
| `syllabusTemplate` | `SyllabusTemplateItem[]` | Có | Danh sách các buổi học chuẩn trong đề cương. |
| `syllabusTemplate[].order` | `number` | Có | Số thứ tự buổi học (1, 2, 3...). |
| `syllabusTemplate[].title` | `string` | Có | Tiêu đề buổi học. |
| `syllabusTemplate[].summary` | `string` | Có | Tóm tắt nội dung trọng tâm của buổi học. |
| `syllabusTemplate[].activityTags` | `('THEORY' \| 'LIVE_CODING' \| 'EXERCISE_REVIEW' \| 'WORKSHOP')[]` | Có | Nhãn hoạt động trong buổi học. |
| `ratingAvg` | `number` | Có | Điểm đánh giá trung bình (VD: `4.9`). |
| `reviewCount` | `number` | Có | Tổng số lượt đánh giá từ học viên (VD: `128`). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": [
    {
      "id": "course-ai-eng",
      "slug": "ky-su-ai-thuc-chien-rag-agents",
      "title": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "shortDescription": "Làm chủ quy trình bóc tách PDF phức tạp, tìm kiếm kết hợp Hybrid Search trên PostgreSQL pgvector và triển khai AI Agent có trích dẫn nguồn chính xác.",
      "descriptionMd": "Chương trình thực chiến dành cho kỹ sư phần mềm muốn làm chủ kiến trúc AI doanh nghiệp...",
      "category": "AI & Dữ liệu",
      "difficultyLevel": 3,
      "durationWeeks": 8,
      "totalHours": 36,
      "skills": [
        {
          "type": "PREREQUISITE",
          "code": "PYTHON-BASE",
          "name": "Lập trình Python & RESTful API cơ bản"
        },
        {
          "type": "LEARNING_OUTCOME",
          "code": "HYBRID-RAG",
          "name": "Xây dựng Tìm kiếm Kết hợp (Hybrid RAG)"
        }
      ],
      "syllabusTemplate": [
        {
          "order": 1,
          "title": "Buổi 1: Kiến trúc tổng thể hệ thống Trợ lý AI doanh nghiệp",
          "summary": "Thiết kế luồng xử lý dữ liệu và chỉ mục tìm kiếm.",
          "activityTags": ["THEORY", "LIVE_CODING"]
        }
      ],
      "ratingAvg": 4.9,
      "reviewCount": 128
    }
  ]
}
```

---

### API 2.4: Lấy chi tiết Chương trình đào tạo theo `slug`
- **Tên API:** `catalogApi.getCourseBySlug`
- **HTTP Method:** `GET`
- **Endpoint:** `/courses/:slug`
- **Nhóm chức năng:** Course Detail & Cohort Selection
- **Nơi sử dụng trên Frontend:** `src/views/CourseDetailView.tsx`
- **Yêu cầu xác thực:** Public.

#### Request – Dữ liệu đầu vào
- **Path Parameters:**
  - `slug` (`string`, bắt buộc): Đường dẫn tĩnh của khóa học (VD: `ky-su-ai-thuc-chien-rag-agents`).

#### Response – Dữ liệu đầu ra (`CourseDetailWithCohortsResponse`)
- **HTTP Status Code:** `200 OK`, `404 Not Found`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `course` | `Course` | Có | Thông tin chi tiết khóa học. |
| `cohorts` | `Cohort[]` | Có | Danh sách các đợt mở lớp (`cohorts`) thuộc khóa học này. |
| `syllabusTemplate` | `object` | Có | Thông tin phiên bản đề cương áp dụng. |
| `syllabusTemplate.version` | `string` | Có | Mã phiên bản đề cương (VD: `"v2.5"`). |
| `syllabusTemplate.totalWeeks` | `number` | Có | Tổng số tuần học (VD: `8`). |
| `syllabusTemplate.sessionsPerWeek` | `number` | Có | Số buổi học mỗi tuần (VD: `2`). |
| `syllabusTemplate.modules` | `SyllabusTemplateItem[]` | Có | Danh sách các buổi học trong đề cương. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "course": {
      "id": "course-ai-eng",
      "slug": "ky-su-ai-thuc-chien-rag-agents",
      "title": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "shortDescription": "Xây dựng hệ thống tra cứu tài liệu nội bộ chính xác cao.",
      "descriptionMd": "Chi tiết chương trình đào tạo...",
      "category": "AI & Dữ liệu",
      "difficultyLevel": 3,
      "skills": [
        { "type": "LEARNING_OUTCOME", "code": "HYBRID-RAG", "name": "Tìm kiếm Kết hợp (Hybrid RAG)" }
      ],
      "syllabusTemplate": [
        {
          "order": 1,
          "title": "Buổi 1: Kiến trúc tổng thể hệ thống Trợ lý AI doanh nghiệp",
          "summary": "Khởi tạo chỉ mục và luồng dữ liệu.",
          "activityTags": ["THEORY", "LIVE_CODING"]
        }
      ],
      "ratingAvg": 4.9,
      "reviewCount": 128
    },
    "cohorts": [
      {
        "id": "cohort-ai-k01",
        "courseId": "course-ai-eng",
        "instructorId": "usr-inst-khoa",
        "code": "AI-ENG-2026-K01",
        "name": "Kỹ Sư AI Thực Chiến — Khóa K01",
        "curriculumVersion": "v2.4",
        "tuitionVnd": 8500000,
        "enrolledCount": 48,
        "maxSeats": 50,
        "enrollmentOpenAt": "01/10/2026",
        "startDate": "15/10/2026",
        "endDate": "15/12/2026",
        "scheduleSlots": [
          { "dayOfWeek": 2, "startTime": "19:30", "endTime": "21:30" },
          { "dayOfWeek": 5, "startTime": "19:30", "endTime": "21:30" }
        ],
        "status": "ONGOING",
        "staff": [
          {
            "id": "usr-inst-khoa",
            "role": "INSTRUCTOR",
            "fullName": "TS. Trần Minh Khoa",
            "headline": "Giảng viên chính · Chuyên gia Hệ thống AI & Tìm kiếm Dữ liệu lớn",
            "avatarUrl": "/src/assets/images/instructor_minh_khoa_1794209569290.jpg",
            "organization": "3T Academy"
          }
        ]
      }
    ],
    "syllabusTemplate": {
      "version": "v2.5",
      "totalWeeks": 8,
      "sessionsPerWeek": 2,
      "modules": [
        {
          "order": 1,
          "title": "Buổi 1: Kiến trúc tổng thể hệ thống Trợ lý AI doanh nghiệp",
          "summary": "Khởi tạo chỉ mục và luồng dữ liệu.",
          "activityTags": ["THEORY", "LIVE_CODING"]
        }
      ]
    }
  }
}
```

---

### API 2.5: Lấy danh sách toàn bộ Đợt mở lớp (Cohorts)
- **Tên API:** `catalogApi.getCohorts`
- **HTTP Method:** `GET`
- **Endpoint:** `/cohorts`
- **Nhóm chức năng:** Class & Cohort Management
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`
- **Yêu cầu xác thực:** Public.

#### Response – Dữ liệu đầu ra (`Cohort[]`)
- **HTTP Status Code:** `200 OK`.
- Mỗi phần tử trong mảng có cấu trúc `Cohort` (như đã mô tả ở API 2.4). Lưu ý quan trọng:
  - `curriculumVersion`: Chuỗi tối đa `120` ký tự (`VARCHAR(120)`).
  - `scheduleSlots`: Mảng JSONB `CohortScheduleSlot[]` gồm `{ dayOfWeek: 0..6, startTime: "HH:mm", endTime: "HH:mm" }`.
  - `staff`: Chỉ chứa 1 phần tử duy nhất có `role: "INSTRUCTOR"` (ánh xạ từ `cohorts.instructor_id` sang `user_profiles` + `instructor_profiles`).

---

### API 2.6: Lấy danh sách Câu hỏi thường gặp (FAQs)
- **Tên API:** `catalogApi.getFaqs`
- **HTTP Method:** `GET`
- **Endpoint:** `/faqs`
- **Nhóm chức năng:** Public Catalog & About Academy
- **Nơi sử dụng trên Frontend:** `src/views/AboutAcademyView.tsx`
- **Yêu cầu xác thực:** Public.

#### Response – Dữ liệu đầu ra (`AcademyFaqItem[]`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | Mã định danh câu hỏi FAQ. |
| `question` | `string` | Có | Nội dung câu hỏi thường gặp. |
| `answer` | `string` | Có | Nội dung câu trả lời chi tiết. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": [
    {
      "id": "faq-1",
      "question": "Mỗi buổi học tại 3T Academy diễn ra như thế nào?",
      "answer": "Mỗi buổi học kéo dài 120 phút trực tuyến cùng Giảng viên chính, kết hợp viết code thực tế và hoàn thành bài kiểm tra 10 câu trắc nghiệm cuối buổi để mở khóa buổi tiếp theo."
    }
  ]
}
```

---

### API 2.7: Lấy danh sách Chứng chỉ của Học viên đang đăng nhập
- **Tên API:** `catalogApi.getCertificates`
- **HTTP Method:** `GET`
- **Endpoint:** `/certificates`
- **Nhóm chức năng:** Certificate Management
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/views/StudentDashboardView.tsx`, `src/views/CohortWorkspaceView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Response – Dữ liệu đầu ra (`Record<string, CertificateRecord>`)
- **HTTP Status Code:** `200 OK`.
- Trả về một Dictionary (Object map theo khóa là `certificateCode`) chỉ chứa các chứng chỉ thuộc về học viên đang đăng nhập.

| Tên trường trong `CertificateRecord` | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `certificateCode` | `string` | Có | Mã định danh chứng chỉ (VD: `"CERT-3T-2026-8891"`). |
| `studentName` | `string` | Có | Họ và tên học viên trên văn bằng. |
| `studentEmail` | `string` | Có | Email của học viên sở hữu chứng chỉ. |
| `courseTitle` | `string` | Có | Tên chương trình đào tạo hoàn thành. |
| `cohortCode` | `string` | Có | Mã đợt mở lớp (VD: `"AI-ENG-2026-K01"`). |
| `issuedAt` | `string` | Có | Ngày cấp chứng chỉ (VD: `"12/11/2026"`). |
| `verificationSignature` | `string` | Có | Chữ ký băm SHA-256 xác thực văn bằng. |
| `finalScore` | `number` | Có | Điểm tổng kết toàn khóa trên thang 100 (VD: `94`). |
| `proctoringIntegrity` | `string` | Có | Ghi chú xác nhận tính minh bạch giám thị AI của kỳ thi cuối khóa. |
| `isRevoked` | `boolean` | Có | Trạng thái thu hồi chứng chỉ (`false` = Hợp lệ, `true` = Đã thu hồi). |
| `revokedReason` | `string` | Không | Lý do thu hồi (nếu `isRevoked === true`). |
| `skillsMastered` | `{ code: string; name: string; score: number }[]` | Có | Danh sách các kỹ năng đạt chuẩn đầu ra kèm điểm số (`0–100`). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "CERT-3T-2026-8891": {
      "certificateCode": "CERT-3T-2026-8891",
      "studentName": "Nguyễn Văn An",
      "studentEmail": "an.nguyen.dev@gmail.com",
      "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "cohortCode": "AI-ENG-2026-K01",
      "issuedAt": "12/11/2026",
      "verificationSignature": "3T-SHA256-VERIFIED-8891",
      "finalScore": 94,
      "proctoringIntegrity": "Đã xác thực hợp lệ 100% qua hệ thống giám thị Camera AI",
      "isRevoked": false,
      "skillsMastered": [
        {
          "code": "HYBRID-RAG",
          "name": "Xây dựng Tìm kiếm Kết hợp (Hybrid RAG)",
          "score": 94
        }
      ]
    }
  }
}
```

---

### API 2.8: Tra cứu & Xác thực Chứng chỉ theo Mã (`verifyCertificateByCode`)
- **Tên API:** `catalogApi.verifyCertificateByCode` / `catalogApi.verifyCertificate`
- **HTTP Method:** `GET`
- **Endpoint:** `/certificates/verify/:code`
- **Nhóm chức năng:** Certificate Verification & Privacy Protection
- **Nơi sử dụng trên Frontend:** `src/services/catalog.api.ts`, `src/services/services.test.ts`.
- **Yêu cầu xác thực:** Bearer Token (Kiểm tra quyền sở hữu chứng chỉ cá nhân hoặc quyền Admin).

#### Request – Dữ liệu đầu vào
- **Path Parameters:**
  - `code` (`string`, bắt buộc): Mã chứng chỉ cần tra cứu (VD: `CERT-3T-2026-8891`).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `found` | `boolean` | Có | `true` nếu tìm thấy và được phép xem; `false` nếu không tồn tại hoặc bị chặn quyền riêng tư. |
| `accessDenied` | `boolean` | Không | `true` nếu mã chứng chỉ tồn tại nhưng thuộc về một học viên khác. |
| `isOwner` | `boolean` | Không | `true` nếu chứng chỉ thuộc về chính học viên đang đăng nhập. |
| `errorCode` | `'FORBIDDEN_OTHER_STUDENT' \| 'NOT_FOUND'` | Không | Mã phân loại lỗi khi `found === false`. |
| `message` | `string` | Không | Thông báo giải thích hiển thị cho người dùng. |
| `certificate` | `CertificateRecord \| null` | Có | Bản ghi chứng chỉ (trả về `null` nếu không tìm thấy hoặc `accessDenied === true`). |

**JSON Response mẫu (Khi tra cứu đúng chứng chỉ của mình):**
```json
{
  "success": true,
  "data": {
    "found": true,
    "accessDenied": false,
    "isOwner": true,
    "certificate": {
      "certificateCode": "CERT-3T-2026-8891",
      "studentName": "Nguyễn Văn An",
      "studentEmail": "an.nguyen.dev@gmail.com",
      "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "cohortCode": "AI-ENG-2026-K01",
      "issuedAt": "12/11/2026",
      "verificationSignature": "3T-SHA256-VERIFIED-8891",
      "finalScore": 94,
      "proctoringIntegrity": "Đã xác thực hợp lệ 100% qua hệ thống giám thị AI",
      "isRevoked": false,
      "skillsMastered": [
        { "code": "HYBRID-RAG", "name": "Xây dựng Tìm kiếm Kết hợp (Hybrid RAG)", "score": 94 }
      ]
    }
  }
}
```

**JSON Response mẫu (Khi tra cứu mã chứng chỉ của học viên khác — Bảo vệ quyền riêng tư):**
```json
{
  "success": true,
  "data": {
    "found": false,
    "accessDenied": true,
    "isOwner": false,
    "errorCode": "FORBIDDEN_OTHER_STUDENT",
    "message": "Không thể hiển thị chứng chỉ của học viên khác. Tính năng này chỉ cho phép xem văn bằng cá nhân thuộc tài khoản của bạn.",
    "certificate": null
  }
}
```

---

### API 2.9: Trợ lý AI Tư vấn chọn Khóa học & Đợt khai giảng
- **Tên API:** `catalogApi.askCareerAdvisor` / `catalogApi.askPublicAdvisor`
- **HTTP Method:** `POST`
- **Endpoint:** `/advisor/ask`
- **Nhóm chức năng:** AI Career & Course Advisor
- **Nơi sử dụng trên Frontend:** `src/views/AiAdvisorView.tsx`, `src/views/OnboardingWizardView.tsx`.
- **Yêu cầu xác thực:** Public (Hỗ trợ cả khách `GUEST` đang tìm hiểu khóa học và `STUDENT`).

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `goal` | `string` | Có | Câu hỏi tư vấn của người dùng hoặc mã mục tiêu nghề nghiệp (`'AI_ENGINEER' \| 'CLOUD_BACKEND' \| 'DATA_ANALYTICS'`). |
| `background` | `string` | Không | Thông tin nền tảng hiện tại hoặc kết quả 3 câu hỏi chẩn đoán ở `/onboarding`. |

**JSON Request mẫu:**
```json
{
  "goal": "Mình biết Python cơ bản, muốn chuyển sang AI Engineer trong 4 tháng thì học đợt nào?",
  "background": "Học viên 3T Academy"
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `replyText` | `string` | Có | Nội dung phản hồi tư vấn lộ trình học từ AI. |
| `recommendedCourseSlug` | `string` | Có | `slug` của khóa học được đề xuất (VD: `"ky-su-ai-thuc-chien-rag-agents"`). |
| `recommendedCohortId` | `string` | Có | `id` của đợt mở lớp phù hợp nhất (VD: `"cohort-ai-k01"`). |
| `recommendedCohortCodes` | `string[]` | Không | Danh sách mã đợt học (`cohorts.code`) được AI đề xuất để Frontend hiển thị thẻ gợi ý lộ trình trực tiếp (VD: `["AI-ENG-2026-K01", "PY-SQL-2026-K04"]`). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "replyText": "Dựa trên mục tiêu của bạn, lộ trình phù hợp nhất là khóa Kỹ Sư AI Thực Chiến (Đợt K01 khai giảng tối Thứ 3 & Thứ 7, 19:30 - 21:30) do TS. Trần Minh Khoa trực tiếp giảng dạy.",
    "recommendedCourseSlug": "ky-su-ai-thuc-chien-rag-agents",
    "recommendedCohortId": "cohort-ai-k01",
    "recommendedCohortCodes": ["AI-ENG-2026-K01", "PY-SQL-2026-K04"]
  }
}
```

---

## 4. Nhóm 3: Không gian Học tập Học viên, Phòng học Video, AI Tutor & Hỏi đáp theo Mốc thời gian (`learning.api.ts`)

File dịch vụ Frontend: `src/services/learning.api.ts` (Export cả `learningApi` và alias `studentLearningApi`).

---

### API 3.1: Tổng quan Góc học tập Học viên hôm nay
- **Tên API:** `learningApi.getStudentDashboard` / `learningApi.getDashboardSummary`
- **HTTP Method:** `GET`
- **Endpoint:** `/me/dashboard`
- **Nhóm chức năng:** Student Learning Management
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/views/StudentDashboardView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- Không có tham số. Định danh học viên lấy từ JWT.

#### Response – Dữ liệu đầu ra (`StudentDashboardSummaryResponse`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `liveSession` | `ClassSession` | Có | Buổi học đang phát trực tiếp (`status = 'LIVE'`) hoặc buổi học sắp diễn ra gần nhất. |
| `resumeSession` | `ClassSession` | Có | Buổi học có video bản ghi (`REPLAY_READY`) mà học viên đang xem dở để bấm "Học tiếp". |
| `upcomingTasks` | `UpcomingTaskItem[]` | Có | Danh sách bài kiểm tra mở khóa cuối buổi hoặc cột mốc dự án cần hoàn thành. |
| `upcomingTasks[].id` | `string` | Có | Mã nhiệm vụ học tập. |
| `upcomingTasks[].sessionId` | `string` | Có | ID buổi học gắn với bài kiểm tra. |
| `upcomingTasks[].cohortId` | `string` | Có | ID lớp học (`cohorts.id`). |
| `upcomingTasks[].cohortCode` | `string` | Có | Mã đợt học (VD: `"AI-ENG-2026-K01"`). |
| `upcomingTasks[].title` | `string` | Có | Tên bài tập / bài kiểm tra mở khóa. |
| `upcomingTasks[].type` | `'SESSION_ASSIGNMENT' \| 'PROJECT_MILESTONE'` | Có | Loại nhiệm vụ học tập. |
| `upcomingTasks[].dueText` | `string` | Có | Thời hạn hoàn thành hiển thị (VD: `"Hạn: Trước Buổi 5"`, `"Đã hoàn thành"`). |
| `upcomingTasks[].urgency` | `'SAFE' \| 'WARNING' \| 'URGENT'` | Có | Mức độ khẩn cấp để hiển thị nhãn màu trên Dashboard. |
| `upcomingTasks[].score` | `number \| null` | Không | Điểm số đã đạt (thang 100), hoặc `null` nếu chưa làm. |
| `upcomingTasks[].statusLabel` | `string` | Có | Nhãn trạng thái hiển thị (VD: `"Đã làm xong bài tập (90/100) · Hoàn thành buổi học"`). |
| `streakDays` | `number` | Có | Số ngày học liên tiếp của học viên (VD: `7`). |
| `attemptTrend` | `{ label: string; subLabel: string; value: number; detailText: string }[]` | Không | Chuỗi dữ liệu lịch sử điểm kiểm tra qua từng buổi học để vẽ biểu đồ đường (`SmoothAreaLineChart`) trên tab Kỹ năng & Tiến độ. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "liveSession": {
      "id": "sess-k01-05",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 5,
      "title": "Buổi 5: Kết hợp tìm kiếm từ khóa & tìm kiếm ngữ nghĩa trên PostgreSQL",
      "activityTags": ["LIVE_CODING", "WORKSHOP"],
      "hostInstructorName": "TS. Trần Minh Khoa",
      "scheduledStart": "Hôm nay · 19:30",
      "scheduledEnd": "Hôm nay · 21:30",
      "status": "LIVE",
      "videoR2Key": "cohorts/k01/sess-05/live.m3u8",
      "videoProvider": "R2_HLS_AES128",
      "durationSeconds": 7200,
      "isCompleted": false,
      "lastPositionSec": 0,
      "aiSummaryMd": "Thực hành kết hợp tìm kiếm từ khóa chính xác và ngữ nghĩa câu hỏi.",
      "attachmentsCount": 2,
      "quizStatus": "NOT_STARTED",
      "quizScore": null,
      "quizQuestions": [],
      "aiCitations": []
    },
    "resumeSession": {
      "id": "sess-k01-04",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 4,
      "title": "Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu",
      "activityTags": ["LIVE_CODING", "EXERCISE_REVIEW"],
      "hostInstructorName": "TS. Trần Minh Khoa",
      "scheduledStart": "05/11/2026 · 19:30",
      "scheduledEnd": "05/11/2026 · 21:30",
      "status": "REPLAY_READY",
      "videoR2Key": "cohorts/k01/sess-04/master.m3u8",
      "videoProvider": "R2_HLS_AES128",
      "durationSeconds": 5400,
      "isCompleted": true,
      "lastPositionSec": 4920,
      "aiSummaryMd": "Nhận diện bảng biểu PDF và giữ nguyên cấu trúc Markdown kèm số trang gốc.",
      "attachmentsCount": 3,
      "quizStatus": "PASSED",
      "quizScore": 90,
      "quizQuestions": [],
      "aiCitations": []
    },
    "upcomingTasks": [
      {
        "id": "task-sess-04",
        "sessionId": "sess-k01-04",
        "cohortId": "cohort-ai-k01",
        "cohortCode": "AI-ENG-2026-K01",
        "title": "Bài kiểm tra mở khóa Buổi 4 (10 câu trắc nghiệm A, B, C, D)",
        "type": "SESSION_ASSIGNMENT",
        "dueText": "Đã hoàn thành",
        "urgency": "SAFE",
        "score": 90,
        "statusLabel": "Đã làm xong bài tập (90/100) · Hoàn thành buổi học"
      }
    ],
    "streakDays": 7
  }
}
```

---

### API 3.2: Danh sách Lớp học đã ghi danh & Biên lai của Học viên
- **Tên API:** `learningApi.getMyEnrollments`
- **HTTP Method:** `GET`
- **Endpoint:** `/me/enrollments`
- **Nhóm chức năng:** Student Learning Management
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/views/StudentDashboardView.tsx`, `src/views/VietQrCheckoutView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `enrolledCohortIds` | `string[]` | Có | Danh sách `id` các đợt mở lớp (`cohorts.id`) mà học viên đã ghi danh thành công (`enrollments.status IN ('ACTIVE', 'COMPLETED')`). |
| `cohorts` | `Cohort[]` | Có | Danh sách chi tiết các đối tượng `Cohort` tương ứng. |
| `receipts` | `OrderReceipt[]` | Có | Danh sách biên lai đóng học phí (`orders` đã `PAID`) của học viên. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "enrolledCohortIds": ["cohort-ai-k01"],
    "cohorts": [
      {
        "id": "cohort-ai-k01",
        "courseId": "course-ai-eng",
        "instructorId": "usr-inst-khoa",
        "code": "AI-ENG-2026-K01",
        "name": "Kỹ Sư AI Thực Chiến — Khóa K01",
        "curriculumVersion": "v2.4",
        "tuitionVnd": 8500000,
        "enrolledCount": 48,
        "enrollmentOpenAt": "01/10/2026",
        "startDate": "15/10/2026",
        "endDate": "15/12/2026",
        "scheduleSlots": [
          { "dayOfWeek": 2, "startTime": "19:30", "endTime": "21:30" },
          { "dayOfWeek": 5, "startTime": "19:30", "endTime": "21:30" }
        ],
        "status": "ONGOING",
        "staff": [
          {
            "id": "usr-inst-khoa",
            "role": "INSTRUCTOR",
            "fullName": "TS. Trần Minh Khoa",
            "headline": "Giảng viên chính",
            "avatarUrl": "/src/assets/images/instructor_minh_khoa_1794209569290.jpg",
            "organization": "3T Academy"
          }
        ]
      }
    ],
    "receipts": [
      {
        "orderCode": "ET20268891",
        "cohortCode": "AI-ENG-2026-K01",
        "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
        "amountVnd": 8500000,
        "paidAt": "10/10/2026 · 14:22",
        "bankName": "MBBank — Ngân hàng Quân Đội (Chuyển khoản QR 24/7)",
        "transactionRef": "MB-QR-99881204"
      }
    ]
  }
}
```

---

### API 3.3: Không gian Lớp học của Học viên (`getCohortWorkspace`)
- **Tên API:** `learningApi.getCohortWorkspace`
- **HTTP Method:** `GET`
- **Endpoint:** `/cohorts/:cohortId/workspace`
- **Nhóm chức năng:** Student Learning Management & Classroom Workspace
- **Nơi sử dụng trên Frontend:** `src/views/CohortWorkspaceView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT` đã ghi danh vào lớp hoặc `INSTRUCTOR`/`ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:**
  - `cohortId` (`string`, bắt buộc): ID hoặc mã `code` của đợt mở lớp (VD: `cohort-ai-k01`).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`, `403 Forbidden` (Chưa ghi danh lớp học này).

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `cohort` | `Cohort` | Có | Thông tin đợt mở lớp (bao gồm `staff` chỉ có 1 Giảng viên chính `INSTRUCTOR`). |
| `course` | `Course` | Có | Thông tin chương trình đào tạo của lớp. |
| `sessions` | `ClassSession[]` | Có | Danh sách toàn bộ các buổi học của lớp kèm trạng thái hoàn thành (`isCompleted`, `quizScore`, `lastPositionSec`) của học viên hiện tại. |
| `materials` | `CohortMaterial[]` | Có | Danh sách tài liệu học tập (Slide, PDF, Repo, Notebook) của lớp. |
| `finalExamId` | `string` | Không | Mã bài thi tốt nghiệp cuối khóa (VD: `"final-exam-cohort-ai-k01"`). |
| `finalExamPassed` | `boolean` | Không | `true` nếu học viên đã vượt qua kỳ thi tốt nghiệp cuối khóa (để khóa nút thi lại và mở tab Bằng tốt nghiệp). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "cohort": {
      "id": "cohort-ai-k01",
      "courseId": "course-ai-eng",
      "instructorId": "usr-inst-khoa",
      "code": "AI-ENG-2026-K01",
      "name": "Kỹ Sư AI Thực Chiến — Khóa K01",
      "curriculumVersion": "v2.4",
      "tuitionVnd": 8500000,
      "enrolledCount": 48,
      "enrollmentOpenAt": "01/10/2026",
      "startDate": "15/10/2026",
      "endDate": "15/12/2026",
      "scheduleSlots": [
        { "dayOfWeek": 2, "startTime": "19:30", "endTime": "21:30" },
        { "dayOfWeek": 5, "startTime": "19:30", "endTime": "21:30" }
      ],
      "status": "ONGOING",
      "staff": [
        {
          "id": "usr-inst-khoa",
          "role": "INSTRUCTOR",
          "fullName": "TS. Trần Minh Khoa",
          "headline": "Giảng viên chính",
          "avatarUrl": "/src/assets/images/instructor_minh_khoa_1794209569290.jpg",
          "organization": "3T Academy"
        }
      ]
    },
    "course": {
      "id": "course-ai-eng",
      "slug": "ky-su-ai-thuc-chien-rag-agents",
      "title": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "shortDescription": "Làm chủ hệ thống RAG & AI Agent.",
      "descriptionMd": "Chi tiết khóa học...",
      "category": "AI & Dữ liệu",
      "difficultyLevel": 3,
      "skills": [],
      "syllabusTemplate": [],
      "ratingAvg": 4.9,
      "reviewCount": 128
    },
    "sessions": [],
    "materials": [
      {
        "id": "mat-k01-04-slide",
        "cohortId": "cohort-ai-k01",
        "sessionOrder": 4,
        "title": "Slide Buổi 4: Bóc tách PDF & Bảng biểu tài chính",
        "fileType": "SLIDE",
        "fileSize": "4.2 MB",
        "updatedAt": "05/11/2026",
        "downloadUrl": "https://cdn.3tacademy.vn/materials/k01-sess04-slides.pdf"
      }
    ],
    "finalExamId": "final-exam-cohort-ai-k01",
    "finalExamPassed": false
  }
}
```

---

### API 3.4: Chi tiết Phòng học Video của một Buổi học (`getSessionDetail`)
- **Tên API:** `learningApi.getSessionDetail`
- **HTTP Method:** `GET`
- **Endpoint:** `/cohorts/:cohortId/sessions/:sessionId`
- **Nhóm chức năng:** Session & Learning Resources
- **Nơi sử dụng trên Frontend:** `src/views/SessionVideoRoomView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT` / `INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:**
  - `cohortId` (`string`, bắt buộc): ID đợt mở lớp.
  - `sessionId` (`string`, bắt buộc): ID buổi học (`class_sessions.id`).

#### Response – Dữ liệu đầu ra (`SessionDetailPayload`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `session` | `ClassSession` | Có | Thông tin buổi học và tiến độ xem của học viên. |
| `videoUrl` | `string` | Có | Đường dẫn luồng phát Video HLS/MP4 đã ký (`signed URL`). |
| `transcript` | `TranscriptLine[]` | Có | Danh sách lời thoại (Transcript) theo mốc thời gian video. |
| `transcript[].sec` | `number` | Có | Giây bắt đầu của đoạn thoại (VD: `10`, `25`, `45`). |
| `transcript[].timeLabel` | `string` | Có | Nhãn thời gian `MM:SS` (VD: `"00:25"`). |
| `transcript[].speaker` | `string` | Có | Tên giảng viên đang giảng (VD: `"TS. Trần Minh Khoa"`). |
| `transcript[].text` | `string` | Có | Nội dung lời giảng tại mốc thời gian đó. |
| `transcript[].slidePage` | `number` | Có | Số trang Slide tương ứng (VD: `12`). |
| `attachments` | `CohortMaterial[]` | Có | Danh sách tài liệu đính kèm của buổi học. |
| `quizSummary` | `object` | Có | Tóm tắt bài kiểm tra 10 câu cuối buổi học. |
| `quizSummary.assessmentId` | `string` | Có | Mã bài kiểm tra của buổi học (VD: `"quiz-sess-k01-04"`). |
| `quizSummary.questionCount` | `number` | Có | Số câu hỏi trắc nghiệm (Mặc định: `10`). |
| `quizSummary.passingScoreOutOf10` | `number` | Có | Điểm đạt tối thiểu trên thang 10 (Mặc định: `7.0`). |
| `quizSummary.isCompleted` | `boolean` | Có | `true` nếu học viên đã vượt qua bài kiểm tra của buổi này. |
| `quizSummary.bestScorePercent` | `number \| null` | Không | Điểm cao nhất đã đạt (thang 100). |
| `discussions` | `DiscussionThread[]` | Có | Danh sách các câu hỏi thảo luận của học viên gắn với buổi học này. |
| `chapters` | `SessionChapterItem[]` | Không | Danh sách phân đoạn nội dung chính của video (`{ id, timeSec, timeLabel, title, summary, slideLabel }`) để hiển thị ở cột Chương mục và nhảy thời gian nhanh. |
| `aiChatHistory` | `SessionAiChatMessageItem[]` | Không | Lịch sử hội thoại giữa học viên với Trợ giảng AI trong buổi học này (`{ id, role: 'USER' \| 'AI_TUTOR', createdAt, content, citations }`). |

> **Quy tắc Kiểm soát Truy cập (Access Control Guard):** Đối với cả `GET /cohorts/:cohortId/workspace` và `GET /cohorts/:cohortId/sessions/:sessionId`, nếu người dùng có vai trò `STUDENT` nhưng **chưa ghi danh** vào đợt học (`cohortId` không nằm trong `enrollments` hợp lệ của học viên), Backend trả về `403 Forbidden` với mã lỗi `"NOT_ENROLLED_IN_COHORT"`. Frontend cũng đã có lớp bảo vệ `EnrollmentAccessGuard` chặn truy cập trái phép và điều hướng học viên về trang đăng ký khóa học.

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "sess-k01-04",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 4,
      "title": "Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu",
      "activityTags": ["LIVE_CODING", "EXERCISE_REVIEW"],
      "hostInstructorName": "TS. Trần Minh Khoa",
      "scheduledStart": "05/11/2026 · 19:30",
      "scheduledEnd": "05/11/2026 · 21:30",
      "status": "REPLAY_READY",
      "videoR2Key": "cohorts/k01/sess-04/master.m3u8",
      "videoProvider": "R2_HLS_AES128",
      "durationSeconds": 5400,
      "isCompleted": true,
      "lastPositionSec": 4920,
      "aiSummaryMd": "Nhận diện bảng biểu PDF và giữ nguyên cấu trúc Markdown kèm số trang gốc.",
      "attachmentsCount": 3,
      "quizStatus": "PASSED",
      "quizScore": 90,
      "quizQuestions": [],
      "aiCitations": []
    },
    "videoUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    "transcript": [
      {
        "sec": 10,
        "timeLabel": "00:10",
        "speaker": "TS. Trần Minh Khoa",
        "text": "Để giữ nguyên ý nghĩa, mình nhận diện các dòng tiêu đề mục lớn và đóng gói toàn bộ bảng số liệu thành một khối nguyên vẹn kèm theo số trang gốc.",
        "slidePage": 8
      }
    ],
    "attachments": [],
    "quizSummary": {
      "assessmentId": "quiz-sess-k01-04",
      "questionCount": 10,
      "passingScoreOutOf10": 7.0,
      "isCompleted": true,
      "bestScorePercent": 90
    },
    "discussions": []
  }
}
```

---

### API 3.5: Cập nhật tiến độ xem Video bài giảng
- **Tên API:** `learningApi.updateVideoProgress`
- **HTTP Method:** `PUT`
- **Endpoint:** `/sessions/:sessionId/progress`
- **Nhóm chức năng:** Learning Progress & Results
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/views/SessionVideoRoomView.tsx`, `src/components/SessionPlayerQuizModal.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giới hạn / Quy tắc | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `lastPositionSec` | `number` | Có | Số nguyên `>= 0` | Vị trí giây hiện tại học viên vừa xem hoặc vừa tua tới trên trình phát `<video>` (`session_attendances.last_position_sec`). |

**JSON Request mẫu:**
```json
{
  "lastPositionSec": 1420
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string` | Có | ID buổi học vừa lưu tiến độ. |
| `lastPositionSec` | `number` | Có | Số giây đã lưu thành công. |
| `savedAt` | `string` (ISO 8601) | Có | Thời điểm cập nhật. |
| `updatedSession` | `ClassSession` | Không | Đối tượng `ClassSession` sau khi cập nhật `lastPositionSec` (Lưu ý quy tắc nghiệp vụ: Xem hết 100% thời lượng video **không** tự động mở khóa `isCompleted = true` nếu chưa vượt qua bài kiểm tra trắc nghiệm cuối buổi). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "sessionId": "sess-k01-04",
    "lastPositionSec": 1420,
    "savedAt": "2026-11-12T15:40:00.000Z"
  }
}
```

---

### API 3.6: Nộp nhanh bài kiểm tra buổi học (`submitSessionQuiz`)
- **Tên API:** `learningApi.submitSessionQuiz`
- **HTTP Method:** `POST`
- **Endpoint:** `/sessions/:sessionId/quiz-submit`
- **Nhóm chức năng:** Assessment & Quiz Management
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/components/SessionPlayerQuizModal.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).
- **Request Body:**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `answers` | `number[]` | Có | Mảng chỉ số đáp án đã chọn (`0` = A, `1` = B, `2` = C, `3` = D) theo thứ tự câu hỏi. |

**JSON Request mẫu:**
```json
{
  "answers": [0, 0, 0]
}
```

#### Response – Dữ liệu đầu ra (`QuizEvaluationOutput`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `scorePercent` | `number` | Có | Điểm phần trăm đạt được (`0–100`). |
| `correctCount` | `number` | Có | Số câu trả lời đúng. |
| `totalQuestions` | `number` | Có | Tổng số câu hỏi. |
| `passed` | `boolean` | Có | `true` nếu đạt ngưỡng qua bài (`>= 67%`). |
| `feedbackMessage` | `string` | Có | Thông báo kết quả chấm điểm hiển thị cho học viên. |
| `updatedSession` | `ClassSession` | Có | Trạng thái buổi học sau khi cập nhật (`isCompleted: true`, `quizStatus: 'PASSED'`, `quizScore`). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "scorePercent": 100,
    "correctCount": 3,
    "totalQuestions": 3,
    "passed": true,
    "feedbackMessage": "Xuất sắc! Bạn đạt 3/3 câu (100%) — Đã mở khóa hoàn thành buổi học.",
    "updatedSession": {
      "id": "sess-k01-04",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 4,
      "title": "Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu",
      "activityTags": ["LIVE_CODING"],
      "hostInstructorName": "TS. Trần Minh Khoa",
      "scheduledStart": "05/11/2026 · 19:30",
      "scheduledEnd": "05/11/2026 · 21:30",
      "status": "REPLAY_READY",
      "videoR2Key": "cohorts/k01/sess-04/master.m3u8",
      "videoProvider": "R2_HLS_AES128",
      "durationSeconds": 5400,
      "isCompleted": true,
      "lastPositionSec": 4920,
      "aiSummaryMd": "Tóm tắt buổi học...",
      "attachmentsCount": 3,
      "quizStatus": "PASSED",
      "quizScore": 100,
      "quizQuestions": [],
      "aiCitations": []
    }
  }
}
```

---

### API 3.7: Hỏi Trợ giảng AI 24/7 trong Phòng học Video (`askSessionAiTutor`)
- **Tên API:** `learningApi.askSessionAiTutor`
- **HTTP Method:** `POST`
- **Endpoint:** `/ai/tutor/ask`
- **Nhóm chức năng:** AI Features & RAG Video Citation
- **Nơi sử dụng trên Frontend:** `src/views/SessionVideoRoomView.tsx`, `src/components/SessionPlayerQuizModal.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `sessionId` | `string` | Có | ID buổi học học viên đang xem (`chat_sessions.session_id`). |
| `question` | `string` | Có | Nội dung câu hỏi kỹ thuật của học viên (`chat_messages.content`). |
| `currentTimestampSec` | `number` | Không | Giây hiện tại trên trình phát video khi học viên bấm đặt câu hỏi. |

**JSON Request mẫu:**
```json
{
  "sessionId": "sess-k01-04",
  "question": "Tại sao chỗ này phải kết hợp tìm kiếm từ khóa và tìm kiếm ngữ nghĩa vậy ạ?",
  "currentTimestampSec": 25
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `answerMd` | `string` | Có | Câu trả lời giải thích chi tiết từ AI Tutor (định dạng Markdown). |
| `detectedTopic` | `string` | Không | Chủ đề kỹ thuật được AI phân loại tự động (VD: `'RAG & Vector Search'`, `'PostgreSQL & SQL'`, `'FastAPI'`). Lưu vào `chat_messages.detected_topic` để thống kê trên Cổng Giảng viên & Quản trị. |
| `citations` | `{ label: string; jumpSec: number; slideLabel: string }[]` | Có | Danh sách các nút trích dẫn mốc thời gian Video & trang Slide. Khi học viên bấm vào nút này trên UI, trình phát `<video>` sẽ tự động nhảy (`seek`) tới đúng giây `jumpSec`. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "answerMd": "Với câu hỏi của bạn, thầy Trần Minh Khoa đã minh họa trực tiếp cách tách bảng biểu an toàn ở giây [00:10], cách kết hợp tìm kiếm từ khóa & ngữ nghĩa ở [00:25] và xử lý bất đồng bộ bằng Promise.all ở [00:45]. Bạn bấm vào nút mốc thời gian bên dưới để trình phát video nhảy thẳng tới đúng giây đó nhé!",
    "detectedTopic": "RAG & Vector Search",
    "citations": [
      { "label": "[00:10]", "jumpSec": 10, "slideLabel": "Slide Trang 8" },
      { "label": "[00:25]", "jumpSec": 25, "slideLabel": "Slide Trang 12" },
      { "label": "[00:45]", "jumpSec": 45, "slideLabel": "Slide Trang 18" }
    ]
  }
}
```

---

### API 3.8: Lấy danh sách Thảo luận / Hỏi đáp của Buổi học
- **Tên API:** `learningApi.getSessionDiscussions`
- **HTTP Method:** `GET`
- **Endpoint:** `/sessions/:sessionId/discussions`
- **Nhóm chức năng:** Session Discussions & Q&A
- **Nơi sử dụng trên Frontend:** `src/views/SessionVideoRoomView.tsx`, `src/views/LivestreamClassView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT` / `INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra (`DiscussionThread[]`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | ID chủ đề thảo luận (`discussion_threads.id`). |
| `cohortId` | `string` | Có | ID đợt mở lớp. |
| `sessionId` | `string` | Không | ID buổi học (`discussion_threads.session_id`). |
| `sessionOrder` | `number` | Có | Số thứ tự buổi học (VD: `4`). |
| `sessionTitle` | `string` | Có | Tiêu đề buổi học. |
| `timestampLabel` | `string` | Có | Nhãn mốc thời gian video `MM:SS` (VD: `"14:20"`). |
| `videoTimestampSec` | `number` | Không | Số giây trong video (`discussion_threads.video_timestamp_sec`). |
| `authorName` | `string` | Có | Họ tên người đặt câu hỏi. |
| `createdAt` | `string` | Có | Thời điểm đăng câu hỏi. |
| `questionTitle` | `string` | Có | Tiêu đề câu hỏi (`discussion_threads.title`). |
| `questionBody` | `string` | Có | Nội dung chi tiết câu hỏi (`discussion_threads.content_md`). |
| `contentMd` | `string` | Không | Alias đồng bộ 1:1 với cột `discussion_threads.content_md`. |
| `isResolved` | `boolean` | Có | Trạng thái đã được giải đáp (`discussion_threads.is_resolved`). |
| `verifiedByStaff` | `boolean` | Có | `true` nếu đã có câu trả lời được Giảng viên xác thực (`discussion_posts.is_official_answer`). |
| `hasAiSuggestion` | `boolean` | Có | `true` nếu có phản hồi gợi ý ban đầu từ Trợ giảng AI. |
| `replies` | `DiscussionReply[]` | Có | Danh sách các phản hồi (`discussion_posts`). |
| `replies[].id` | `string` | Có | ID phản hồi (`discussion_posts.id`). |
| `replies[].authorName` | `string` | Có | Tên người phản hồi. |
| `replies[].authorRole` | `'STUDENT' \| 'INSTRUCTOR' \| 'AI_TUTOR'` | Có | Vai trò người phản hồi. |
| `replies[].createdAt` | `string` | Có | Thời gian phản hồi. |
| `replies[].content` | `string` | Có | Nội dung phản hồi (`discussion_posts.content_md`). |
| `replies[].isVerifiedByStaff` | `boolean` | Không | `true` nếu được xác nhận bởi Giảng viên chính. |
| `replies[].aiCitationSec` | `string` | Không | Mốc thời gian trích dẫn của AI (VD: `"14:20"`). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": [
    {
      "id": "disc-01",
      "cohortId": "cohort-ai-k01",
      "sessionId": "sess-k01-04",
      "sessionOrder": 4,
      "sessionTitle": "Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu",
      "timestampLabel": "14:20",
      "videoTimestampSec": 860,
      "authorName": "Nguyễn Văn An",
      "createdAt": "10 phút trước",
      "questionTitle": "Làm sao giữ nguyên cấu trúc bảng biểu tài chính khi cắt trang PDF?",
      "questionBody": "Em thấy nếu cắt theo số ký tự cố định thì bảng cân đối kế toán bị đứt làm đôi. Thầy hướng dẫn thêm giúp em cách cấu hình với ạ.",
      "contentMd": "Em thấy nếu cắt theo số ký tự cố định thì bảng cân đối kế toán bị đứt làm đôi. Thầy hướng dẫn thêm giúp em cách cấu hình với ạ.",
      "isResolved": true,
      "verifiedByStaff": true,
      "hasAiSuggestion": true,
      "replies": [
        {
          "id": "rep-01",
          "authorName": "TS. Trần Minh Khoa (Giảng viên)",
          "authorRole": "INSTRUCTOR",
          "createdAt": "5 phút trước",
          "isVerifiedByStaff": true,
          "content": "Em dùng bộ nhận diện cấu trúc bảng sang Markdown trước rồi mới đóng gói từng bảng kèm tiêu đề mục cha nhé!"
        }
      ]
    }
  ]
}
```

---

### API 3.9: Tạo câu hỏi Thảo luận mới gắn Mốc thời gian Video
- **Tên API:** `learningApi.createSessionQuestion`
- **HTTP Method:** `POST`
- **Endpoint:** `/sessions/:sessionId/discussions`
- **Nhóm chức năng:** Session Discussions & Q&A
- **Nơi sử dụng trên Frontend:** `src/views/SessionVideoRoomView.tsx`, `src/views/CohortWorkspaceView.tsx`, `src/views/LivestreamClassView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giới hạn / Quy tắc | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `title` | `string` | Không | Tối đa 255 ký tự | Tiêu đề câu hỏi (`discussion_threads.title`). Nếu bỏ trống, Backend có thể lấy từ `contentMd`. |
| `contentMd` | `string` | Có | Văn bản Markdown | Nội dung chi tiết câu hỏi (`discussion_threads.content_md`). |
| `videoTimestampSec` | `number` | Có | Số nguyên `>= 0` | Giây trên video bài giảng mà học viên đang thắc mắc (`discussion_threads.video_timestamp_sec`). |

**JSON Request mẫu:**
```json
{
  "title": "Cách đặt ngưỡng điểm tương đồng cho Hybrid Search?",
  "contentMd": "Em đang xem lại video ở mốc thời gian này và mong thầy giải đáp thêm giúp em cách chọn trọng số kết hợp giữa BM25 và Vector Search ạ.",
  "videoTimestampSec": 860
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `201 Created` hoặc `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `threadId` | `string` | Có | ID của chủ đề thảo luận vừa tạo. |
| `status` | `'CREATED'` | Có | Trạng thái tạo mới thành công. |
| `videoTimestampSec` | `number` | Có | Mốc thời gian video đã gắn. |
| `thread` | `DiscussionThread` | Không | Toàn bộ đối tượng `DiscussionThread` vừa được tạo (bao gồm cả câu trả lời gợi ý tức thì từ `AI_TUTOR` nếu có). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "threadId": "disc-1762958400",
    "status": "CREATED",
    "videoTimestampSec": 860,
    "thread": {
      "id": "disc-1762958400",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 4,
      "sessionTitle": "Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu",
      "timestampLabel": "14:20",
      "videoTimestampSec": 860,
      "authorName": "Nguyễn Văn An",
      "createdAt": "Vừa xong",
      "questionTitle": "Cách đặt ngưỡng điểm tương đồng cho Hybrid Search?",
      "questionBody": "Em đang xem lại video ở mốc thời gian này và mong thầy giải đáp thêm giúp em cách chọn trọng số kết hợp giữa BM25 và Vector Search ạ.",
      "isResolved": true,
      "verifiedByStaff": false,
      "hasAiSuggestion": true,
      "replies": [
        {
          "id": "rep-ai-1762958401",
          "authorName": "Trợ giảng AI 3T (Hỗ trợ 24/7)",
          "authorRole": "AI_TUTOR",
          "createdAt": "Tức thì",
          "aiCitationSec": "14:20",
          "content": "Trợ giảng AI đã tìm thấy nội dung liên quan tại phút 14:20 (Trang 8 tài liệu Buổi 4)..."
        }
      ]
    }
  }
}
```

---

### API 3.10: Lấy danh sách Tin nhắn Trò chuyện Trực tiếp (Live Chat) trong Phòng Livestream
- **Tên API:** `learningApi.getLiveSessionChat`
- **HTTP Method:** `GET`
- **Endpoint:** `/sessions/:sessionId/chat-messages`
- **Nhóm chức năng:** Livestream Classroom Real-time Interaction
- **Nơi sử dụng trên Frontend:** `src/views/LivestreamClassView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT` đã ghi danh / `INSTRUCTOR` / `ADMIN` hoặc Guest Speaker Token).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra (`LiveSessionChatMessage[]`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | Mã tin nhắn chat trực tiếp. |
| `sender` | `string` | Có | Tên hiển thị của người gửi. |
| `roleLabel` | `string` | Không | Nhãn vai trò nếu là `'Giảng viên'` hoặc `'Khách mời'`. |
| `time` | `string` | Có | Nhãn thời gian gửi tin nhắn (`HH:mm`). |
| `text` | `string` | Có | Nội dung tin nhắn trao đổi trên lớp. |

---

### API 3.11: Gửi Tin nhắn Trò chuyện Trực tiếp (Live Chat) trong Phòng Livestream
- **Tên API:** `learningApi.sendLiveSessionChat`
- **HTTP Method:** `POST`
- **Endpoint:** `/sessions/:sessionId/chat-messages`
- **Nhóm chức năng:** Livestream Classroom Real-time Interaction
- **Nơi sử dụng trên Frontend:** `src/views/LivestreamClassView.tsx`
- **Yêu cầu xác thực:** Bearer Token hoặc Guest Speaker Token.

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `text` | `string` | Có | Nội dung tin nhắn gửi vào phòng học trực tuyến. |
| `sender` | `string` | Không | Tên người gửi (nếu là Diễn giả khách mời). |
| `roleLabel` | `string` | Không | Nhãn vai trò hiển thị (`'Giảng viên'`, `'Khách mời'`). |

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `201 Created` hoặc `200 OK`.
- Trả về `{ "message": LiveSessionChatMessage }`.

---

### API 3.12: Xác thực Token Tham gia nhanh 1 chạm của Diễn giả Khách mời (`verifyGuestSpeakerToken`)
- **Tên API:** `learningApi.verifyGuestSpeakerToken`
- **HTTP Method:** `POST`
- **Endpoint:** `/live/guest/verify`
- **Nhóm chức năng:** Livestream Classroom Guest Speaker Access
- **Nơi sử dụng trên Frontend:** `src/views/LivestreamClassView.tsx` (`/live/guest`)
- **Yêu cầu xác thực:** Public (Xác thực bằng `inviteToken` do Giảng viên tạo từ `POST /teach/sessions/:sessionId/guest-link`).

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `inviteToken` | `string` | Có | Mã token mời diễn giả khách mời (`guest_speaker_Constraint` / `live_guest_tokens`). |
| `guestDisplayName` | `string` | Có | Họ tên và học vị hiển thị của diễn giả trên sân khấu lớp học. |
| `guestRoleHeadline` | `string` | Không | Chức danh / Đơn vị công tác của diễn giả. |

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`, `401 Unauthorized` (Token hết hạn hoặc không hợp lệ).

```json
{
  "success": true,
  "data": {
    "verified": true,
    "sessionId": "sess-k01-05",
    "cohortId": "cohort-ai-k01",
    "guestDisplayName": "ThS. Lê Quốc Bảo (Chuyên gia Khách mời)",
    "guestRoleHeadline": "Kiến trúc sư Hệ thống AI Doanh nghiệp",
    "joinedAt": "2026-11-12T19:35:00.000Z"
  }
}
```

---

## 5. Nhóm 4: Bài kiểm tra Mở khóa (10 câu), Thi Tốt nghiệp Cuối khóa (25 câu) & Giám sát Camera AI (`assessment.api.ts`)

File dịch vụ Frontend: `src/services/assessment.api.ts`

---

### API 4.1: Lấy Đề kiểm tra / Đề thi cho Học viên (`getAssessmentForStudent`)
- **Tên API:** `assessmentApi.getAssessmentForStudent`
- **HTTP Method:** `GET`
- **Endpoint:** `/assessments/:assessmentId`
- **Nhóm chức năng:** Assessment & Quiz Management
- **Nơi sử dụng trên Frontend:** `src/views/AssessmentRoomView.tsx`, `src/views/ProctoredExamRoomView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:**
  - `assessmentId` (`string`, bắt buộc): Mã bài kiểm tra buổi học (VD: `quiz-sess-k01-04`) hoặc mã đề thi tốt nghiệp cuối khóa (VD: `exam-final-k01`, `final-exam-cohort-ai-k01`).

#### Response – Dữ liệu đầu ra (`StudentAssessmentPayload`)
- **HTTP Status Code:** `200 OK`, `403 Forbidden` (Nếu đề đang ở trạng thái `'DRAFT'` chưa được Giảng viên xuất bản).
- **Bảo mật dữ liệu:** Mảng `promptConfig` trả về cho Học viên **tuyệt đối không chứa** `correctIndex` và `explanation` (để chống lộ đáp án qua DevTools Network).

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `assessmentId` | `string` | Có | Mã định danh bài đánh giá. |
| `isFinalExam` | `boolean` | Có | `true` nếu là Kỳ thi Tốt nghiệp Cuối khóa (25 câu, 45 phút, có Camera giám sát); `false` nếu là Bài kiểm tra mở khóa cuối buổi học (10 câu, 15 phút). |
| `status` | `'DRAFT' \| 'PUBLISHED'` | Không | Trạng thái xuất bản của bộ đề (`assessments.status`). |
| `title` | `string` | Có | Tiêu đề bài kiểm tra / kỳ thi. |
| `questionCount` | `number` | Có | Tổng số câu hỏi (`10` hoặc `25`). |
| `timeLimitMinutes` | `number` | Có | Thời gian làm bài tính bằng phút (`15` hoặc `45`). |
| `isRetakeLocked` | `boolean` | Có | `true` nếu đây là Kỳ thi Cuối khóa và học viên **đã thi Đạt trước đó** (Khóa thi lại để không cộng trùng lặp `+4` lượt phỏng vấn AI). |
| `hasPassedFinalExam` | `boolean` | Không | Cờ xác nhận học viên đã vượt qua kỳ thi cuối khóa. |
| `promptConfig` | `StudentSafePromptConfigItem[]` | Có | Danh sách câu hỏi trắc nghiệm 4 lựa chọn A, B, C, D (đã ẩn đáp án đúng). |
| `promptConfig[].number` | `number` | Có | Số thứ tự câu hỏi (`1..10` hoặc `1..25`). |
| `promptConfig[].scenarioTag` | `string` | Có | Nhãn tình huống thực tế của câu hỏi. |
| `promptConfig[].prompt` | `string` | Có | Nội dung câu hỏi. |
| `promptConfig[].options` | `[string, string, string, string]` | Có | 4 phương án trả lời A, B, C, D. |
| `promptConfig[].skillCode` | `string` | Có | Mã kỹ năng được đánh giá bởi câu hỏi này. |
| `promptConfig[].skillName` | `string` | Có | Tên hiển thị của kỹ năng. |
| `promptConfig[].slideLabel` | `string` | Có | Nhãn trang Slide bài giảng liên quan. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "assessmentId": "quiz-sess-k01-04",
    "isFinalExam": false,
    "status": "PUBLISHED",
    "title": "Bài Kiểm Tra Mở Khóa Cuối Buổi Học (10 câu Trắc nghiệm A, B, C, D)",
    "questionCount": 10,
    "timeLimitMinutes": 15,
    "isRetakeLocked": false,
    "hasPassedFinalExam": false,
    "promptConfig": [
      {
        "number": 1,
        "scenarioTag": "Câu 1/10 · Giữ nguyên cấu trúc bảng biểu PDF",
        "prompt": "Khi đọc một báo cáo tài chính PDF dài 80 trang có nhiều bảng số liệu, cách cắt văn bản nào giúp Trợ lý AI trả lời chính xác từng con số mà không bị đứt gãy dòng?",
        "options": [
          "Nhận diện tiêu đề mục và chuyển nguyên bảng số liệu sang Markdown kèm số trang gốc",
          "Cắt cố định cứ đúng 300 ký tự một đoạn bất kể đang ở giữa bảng số liệu",
          "Xóa toàn bộ các con số trong bảng trước khi lưu vào cơ sở dữ liệu",
          "Gộp toàn bộ 80 trang PDF thành một chuỗi ký tự duy nhất không ngắt đoạn"
        ],
        "skillCode": "DOCLING-CHUNK",
        "skillName": "Đọc & Chia nhỏ tài liệu thông minh",
        "slideLabel": "Slide Trang 8"
      }
    ]
  }
}
```

---

### API 4.2: Nộp bài Trắc nghiệm & Chấm điểm Tức thì (`submitAssessmentAttempt`)
- **Tên API:** `assessmentApi.submitAssessmentAttempt`
- **HTTP Method:** `POST`
- **Endpoint:** `/assessments/:assessmentId/submit`
- **Nhóm chức năng:** Assessment & Instant Grading
- **Nơi sử dụng trên Frontend:** `src/views/AssessmentRoomView.tsx`, `src/views/ProctoredExamRoomView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `assessmentId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `answers` | `Record<number, number>` | Có | Object ánh xạ từ `questionNumber` (`1..25`) sang chỉ số phương án học viên đã chọn (`0` = A, `1` = B, `2` = C, `3` = D). |
| `telemetryLog` | `unknown` | Không | Dữ liệu nhật ký quá trình làm bài (nếu có). |

**JSON Request mẫu:**
```json
{
  "answers": {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 1,
    "5": 0,
    "6": 0,
    "7": 0,
    "8": 0,
    "9": 0,
    "10": 0
  }
}
```

#### Response – Dữ liệu đầu ra (`StoredMcqAttemptResult`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `assessmentId` | `string` | Có | Mã bài đánh giá vừa nộp. |
| `isFinalExam` | `boolean` | Có | `true` nếu là kỳ thi tốt nghiệp cuối khóa. |
| `totalQuestions` | `number` | Có | Tổng số câu hỏi (`10` hoặc `25`). |
| `correctCount` | `number` | Có | Số câu trả lời đúng. |
| `scoreOutOf10` | `number` | Có | Điểm số quy đổi trên thang 10 (VD: `9.0`). Đạt khi `scoreOutOf10 >= 7.0`. |
| `passed` | `boolean` | Có | `true` nếu đạt điểm chuẩn (`>= 7.0`). |
| `submittedAt` | `string` | Có | Thời điểm chấm điểm xong. |
| `selectedAnswers` | `Record<number, number>` | Có | Đáp án học viên đã chọn. |
| `updatedSkills` | `{ code: string; name: string; previousScore: number; newScore: number; delta: string }[]` | Có | Danh sách các kỹ năng vừa được cập nhật điểm `mastery_score` (thang `0–100`) trong bảng `student_skill_states`. |
| `wrongItems` | `WrongQuestionReviewItem[]` | Có | Danh sách các câu học viên chọn sai kèm `correctIndex`, `explanation`, `reviewTimestampLabel`, `reviewJumpSec` và `slideLabel` để học viên bấm tua thẳng về đúng đoạn Video bài giảng. |
| `bonusInterviewCreditsAdded` | `number` | Không | Số lượt phỏng vấn AI cộng thưởng (`+4`) khi học viên vượt qua kỳ thi tốt nghiệp cuối khóa lần đầu tiên. |
| `updatedInterviewCredits` | `number` | Không | Tổng số lượt phỏng vấn AI mới nhất của học viên sau khi cộng thưởng (`user_profiles.interview_credits`). |
| `issuedCertificateCode` | `string \| null` | Không | Mã chứng chỉ tốt nghiệp vừa được cấp tự động khi học viên đỗ kỳ thi cuối khóa (VD: `"CERT-3T-2026-8891"`). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "assessmentId": "quiz-sess-k01-04",
    "isFinalExam": false,
    "totalQuestions": 10,
    "correctCount": 9,
    "scoreOutOf10": 9.0,
    "passed": true,
    "submittedAt": "Vừa nộp xong · Chấm điểm tự động 0 giây",
    "selectedAnswers": { "1": 0, "2": 0, "3": 0, "4": 1, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0, "10": 0 },
    "updatedSkills": [
      {
        "code": "HYBRID-RAG",
        "name": "Tìm kiếm kết hợp từ khóa & ngữ nghĩa",
        "previousScore": 80,
        "newScore": 92,
        "delta": "+12 điểm"
      }
    ],
    "wrongItems": [
      {
        "number": 4,
        "prompt": "Khi hai nhánh tìm kiếm chạy đồng thời, hàm nào trong JavaScript/TypeScript giúp chạy song song để giảm độ trễ?",
        "chosenIndex": 1,
        "correctIndex": 0,
        "options": [
          "Promise.all([keywordSearch(), vectorSearch()])",
          "Chạy tuần tự từng hàm và chờ kết quả",
          "Dùng vòng lặp vô hạn",
          "Tắt kết nối cơ sở dữ liệu"
        ],
        "explanation": "Promise.all thực thi song song cả hai truy vấn nên tổng thời gian chỉ bằng nhánh chậm nhất.",
        "reviewTimestampLabel": "00:45 - 01:00",
        "reviewJumpSec": 45,
        "reviewSegmentRangeSec": [45, 60],
        "slideLabel": "Slide Trang 18"
      }
    ]
  }
}
```

#### Mô tả nghiệp vụ
- Khi học viên nộp bài kiểm tra buổi học (`!isFinalExam`) và `passed === true`: Backend đánh dấu hoàn thành buổi học (`session_attendances`) và cập nhật điểm kỹ năng trong `student_skill_states` (`mastery_score` thang `0–100`).
- Khi học viên nộp kỳ thi tốt nghiệp cuối khóa (`isFinalExam === true`) và `passed === true` lần đầu tiên: Backend khóa quyền thi lại (`isRetakeLocked = true`), cấp Chứng chỉ tốt nghiệp và cộng thêm `+4` lượt phỏng vấn AI (`user_profiles.interview_credits += 4`).

---

### API 4.3: Xem Kết quả Chi tiết & Chỉ dẫn Ôn tập Thông minh (`getAssessmentResult`)
- **Tên API:** `assessmentApi.getAssessmentResult`
- **HTTP Method:** `GET`
- **Endpoint:** `/assessments/:assessmentId/result`
- **Nhóm chức năng:** Learning Progress & Results
- **Nơi sử dụng trên Frontend:** `src/views/AssessmentResultView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `assessmentId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra (`AssessmentResultWithMeta`)
- **HTTP Status Code:** `200 OK`.
- Bao gồm toàn bộ các trường của `StoredMcqAttemptResult` (API 4.2), cộng thêm:

| Tên trường bổ sung | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `hasStoredAttempt` | `boolean` | Không | `true` nếu học viên đã có lượt nộp bài được lưu. |
| `hasPassedFinalExam` | `boolean` | Không | `true` nếu đã đỗ kỳ thi cuối khóa. |
| `questionsWithExplanations` | `McqQuestionItem[]` | Có | Toàn bộ danh sách câu hỏi kèm `correctIndex`, `explanation`, `reviewTimestampLabel`, `reviewJumpSec`, `slideLabel` để hiển thị bảng đối chiếu từng câu trên trang Kết quả. |
| `submission` | `StoredMcqAttemptResult` | Có | Bản ghi kết quả lượt nộp bài của học viên. |

---

### API 4.4: Ghi nhận sự kiện Giám sát Camera AI (`reportProctoringEvent`)
- **Tên API:** `assessmentApi.reportProctoringEvent`
- **HTTP Method:** `POST`
- **Endpoint:** `/assessments/:assessmentId/proctoring-events`
- **Nhóm chức năng:** Proctored Exam Integrity
- **Nơi sử dụng trên Frontend:** `src/views/ProctoredExamRoomView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `assessmentId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giá trị hợp lệ | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `eventType` | `string` | Có | `'CAMERA_NORMAL' \| 'LOOK_AWAY_WARNING' \| 'TAB_SWITCH_OR_MULTI_FACE_ALERT'` | Loại sự kiện giám sát được ghi nhận từ Webcam trong ca thi cuối khóa. |
| `snapshotNote` | `string` | Không | Chuỗi mô tả ngắn | Ghi chú chi tiết kèm theo sự kiện (`proctoring_events.details`). |

**JSON Request mẫu:**
```json
{
  "eventType": "LOOK_AWAY_WARNING",
  "snapshotNote": "Hệ thống chưa nhìn rõ khuôn mặt bạn, bạn vui lòng hướng mắt về màn hình làm bài nhé."
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "assessmentId": "exam-final-k01",
    "recorded": true,
    "eventType": "LOOK_AWAY_WARNING",
    "timestamp": "2026-11-12T15:45:10.000Z"
  }
}
```

---

## 6. Nhóm 5: Hồ sơ Năng lực 6 Khối, Đối soát CV Thông minh & Luyện Phỏng vấn Giọng nói AI (`profile-interview.api.ts`)

File dịch vụ Frontend: `src/services/profile-interview.api.ts` (Export `profileInterviewApi` và alias `profileAndInterviewApi`).

---

### API 5.1: Lấy Hồ sơ CV 6 Khối, Bản đồ Kỹ năng (`0–100`) & Số lượt Phỏng vấn
- **Tên API:** `profileAndInterviewApi.getMyProfileAndSkills`
- **HTTP Method:** `GET`
- **Endpoint:** `/me/profile-skills`
- **Nhóm chức năng:** User & Profile Management / Competency Skill Map
- **Nơi sử dụng trên Frontend:** `src/components/StudentProfileCvWorkspace.tsx`, `src/views/StudentDashboardView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Response – Dữ liệu đầu ra (`ProfileAndSkillsResponse`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `userProfile` | `object` | Có | Thông tin hồ sơ năng lực của học viên (tổng hợp từ `accounts` và `user_profiles`). |
| `userProfile.userId` | `string` | Không | ID tài khoản của học viên. |
| `userProfile.fullName` | `string` | Có | Họ và tên thật của học viên (`user_profiles.full_name`). |
| `userProfile.headline` | `string` | Có | Chức danh / Vị trí mục tiêu (VD: `"Kỹ Sư Backend Python & Ứng Dụng AI"`). |
| `userProfile.email` | `string` | Có | Email liên hệ. |
| `userProfile.phone` | `string` | Có | Số điện thoại liên hệ. |
| `userProfile.githubUrl` | `string` | Có | Liên kết GitHub cá nhân. |
| `userProfile.linkedinUrl` | `string` | Có | Liên kết LinkedIn cá nhân. |
| `userProfile.careerObjective` | `string` | Có | Mục tiêu nghề nghiệp (`user_profiles.career_goal`). |
| `userProfile.latestCvFileName` | `string` | Có | Tên file CV PDF gần nhất đã tải lên. |
| `userProfile.latestCvUpdatedAt` | `string` | Có | Thời điểm cập nhật CV gần nhất. |
| `userProfile.interviewCredits` | `number` | Có | Số lượt phỏng vấn giọng nói AI còn lại (`user_profiles.interview_credits`). |
| `userProfile.cvParsedData` | `CvParsedData` | Có | Dữ liệu JSONB 6 khối của Hồ sơ Năng lực (`user_profiles.cv_parsed_data`): Thông tin liên hệ, Kỹ năng (`skills`), Dự án thực tế (`projects`), Kinh nghiệm làm việc (`workExperience`), Học vấn (`education`), Chứng chỉ & Giải thưởng (`awardsAndCerts`). |
| `studentSkillStates` | `StudentSkillStateRecord[]` | Có | Danh sách điểm năng lực thực tế (`score` / `masteryScore` trên **thang điểm 0–100**) từ bảng `student_skill_states` để vẽ Biểu đồ Radar (`RadarSkillChart`). |
| `externalCvSkills` | `{ name: string; note: string }[]` | Có | Danh sách kỹ năng trích xuất từ CV bên ngoài (ngoài các khóa học tại 3T Academy). |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "userProfile": {
      "userId": "usr-student-an",
      "fullName": "Nguyễn Văn An",
      "headline": "Kỹ Sư Backend Python & Ứng Dụng AI (AI Engineer)",
      "email": "an.nguyen.dev@gmail.com",
      "phone": "0908 123 456",
      "githubUrl": "github.com/nguyenvanan-dev",
      "linkedinUrl": "linkedin.com/in/nguyenvanan",
      "careerObjective": "Trở thành Kỹ sư AI thực chiến xây dựng hệ thống RAG & Multi-Agent cho doanh nghiệp.",
      "latestCvFileName": "CV_Nguyen_Van_An_2026.pdf",
      "latestCvUpdatedAt": "10/11/2026",
      "interviewCredits": 4,
      "cvParsedData": {
        "fileName": "CV_Nguyen_Van_An_2026.pdf",
        "updatedAt": "10/11/2026",
        "fullName": "Nguyễn Văn An",
        "headline": "Kỹ Sư Backend Python & Ứng Dụng AI (AI Engineer)",
        "email": "an.nguyen.dev@gmail.com",
        "phone": "0908 123 456",
        "githubUrl": "github.com/nguyenvanan-dev",
        "linkedinUrl": "linkedin.com/in/nguyenvanan",
        "careerObjective": "Trở thành Kỹ sư AI thực chiến...",
        "skills": ["Python", "FastAPI", "PostgreSQL & pgvector", "Hybrid RAG", "Docker"],
        "projects": [
          {
            "id": "proj-1",
            "name": "Hệ thống Trợ lý AI Tra cứu Tài liệu Nội bộ (Hybrid RAG)",
            "role": "Backend & AI Developer",
            "period": "09/2026 – 11/2026",
            "techStack": "Python, FastAPI, PostgreSQL pgvector, Docling",
            "highlights": [
              "Xây dựng luồng bóc tách báo cáo tài chính PDF giữ nguyên cấu trúc bảng biểu Markdown.",
              "Kết hợp tìm kiếm từ khóa và ngữ nghĩa đạt độ chính xác trích dẫn trang gốc 94%."
            ],
            "bullets": [
              "Xây dựng luồng bóc tách báo cáo tài chính PDF giữ nguyên cấu trúc bảng biểu Markdown.",
              "Kết hợp tìm kiếm từ khóa và ngữ nghĩa đạt độ chính xác trích dẫn trang gốc 94%."
            ]
          }
        ],
        "workExperience": [
          {
            "id": "exp-1",
            "company": "FPT Software",
            "position": "Junior Python Backend Developer",
            "period": "06/2025 – Nay",
            "summary": "Phát triển các microservice xử lý dữ liệu và RESTful API với FastAPI và PostgreSQL."
          }
        ],
        "education": [
          {
            "id": "edu-1",
            "school": "Đại học Bách Khoa",
            "degree": "Kỹ sư Khoa học Máy tính",
            "period": "2021 – 2025",
            "gpaOrHonors": "GPA: 3.45 / 4.0 (Loại Giỏi)"
          }
        ],
        "awardsAndCerts": [
          {
            "id": "aw-1",
            "title": "Chứng chỉ Kỹ Sư AI Thực Chiến (Hạng Xuất sắc — 94/100)",
            "issuer": "3T Academy",
            "dateOrCode": "CERT-3T-2026-8891",
            "detail": "Xác thực qua kỳ thi tốt nghiệp cuối khóa có giám thị AI."
          }
        ],
        "externalSkills": [
          { "name": "Docker & Linux", "note": "Trích xuất từ kinh nghiệm dự án trong CV" }
        ]
      }
    },
    "studentSkillStates": [
      {
        "userId": "usr-student-an",
        "code": "HYBRID-RAG",
        "name": "Tìm kiếm Kết hợp (Hybrid RAG)",
        "score": 92,
        "masteryScore": 92,
        "evidenceCount": 6,
        "cohortId": "cohort-ai-k01",
        "cohortCode": "AI-ENG-2026-K01",
        "courseTitle": "Kỹ Sư AI Thực Chiến",
        "sourceLabel": "Đã xác thực qua Bài kiểm tra & Dự án lớp K01",
        "updatedAt": "12/11/2026"
      }
    ],
    "externalCvSkills": [
      { "name": "Docker & Linux", "note": "Trích xuất từ kinh nghiệm dự án trong CV" }
    ]
  }
}
```

---

### API 5.1B: Cập nhật Hồ sơ Khởi đầu & Mục tiêu Nghề nghiệp (`updateMyProfile`)
- **Tên API:** `profileInterviewApi.updateMyProfile` / `profileAndInterviewApi.updateMyProfile`
- **HTTP Method:** `PUT`
- **Endpoint:** `/me/profile`
- **Nhóm chức năng:** Initial Onboarding Profile Setup (`/onboarding`) & User Profile Synchronization
- **Nơi sử dụng trên Frontend:** `src/views/OnboardingWizardView.tsx`, `src/components/StudentProfileCvWorkspace.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào (`UpdateMyProfilePayload`)
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa & Ánh xạ Database |
| :--- | :--- | :---: | :--- |
| `fullName` | `string` | Có | Họ và tên thật có dấu dùng để in trên Chứng chỉ tốt nghiệp và Danh sách lớp học (`user_profiles.full_name`). |
| `avatarUrl` | `string` | Không | Ảnh đại diện học viên (file ảnh cá nhân tải lên dạng Data URL / R2 URL hoặc bộ Avatar Tech/AI chọn nhanh — lưu vào `user_profiles.avatar_url`). |
| `phone` | `string` | Không | Số điện thoại / Zalo liên hệ để Giáo vụ và Giảng viên hỗ trợ kỹ thuật hoặc thông báo lịch học khẩn cấp (`user_profiles.phone` / `cv_parsed_data.phone`). |
| `bio` | `string` | Có | Giới thiệu bản thân ngắn gọn 1–2 câu (`user_profiles.bio` & đồng bộ làm `headline` khởi đầu trong `cv_parsed_data`). |
| `careerGoal` | `string` | Có | Mục tiêu nghề nghiệp cốt lõi (`user_profiles.career_goal` & đồng bộ làm `careerObjective` khởi đầu trong `cv_parsed_data`). |

**JSON Request mẫu:**
```json
{
  "fullName": "Nguyễn Văn An",
  "avatarUrl": "data:image/svg+xml;utf8,...",
  "phone": "0908 123 456",
  "bio": "Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI",
  "careerGoal": "AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning triển khai thực tế tại doanh nghiệp."
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "success": true,
    "userProfile": {
      "userId": "usr-student-an",
      "fullName": "Nguyễn Văn An",
      "avatarUrl": "data:image/svg+xml;utf8,...",
      "headline": "Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI",
      "bio": "Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI",
      "email": "an.nguyen.dev@gmail.com",
      "phone": "0908 123 456",
      "githubUrl": "",
      "linkedinUrl": "",
      "careerObjective": "AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning triển khai thực tế tại doanh nghiệp.",
      "careerGoal": "AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning triển khai thực tế tại doanh nghiệp.",
      "latestCvFileName": "Chưa tải lên file CV",
      "latestCvUpdatedAt": "Vừa cập nhật",
      "interviewCredits": 2,
      "cvParsedData": {
        "fullName": "Nguyễn Văn An",
        "avatarUrl": "data:image/svg+xml;utf8,...",
        "phone": "0908 123 456",
        "headline": "Backend Developer muốn nâng cấp kỹ năng tích hợp mô hình AI",
        "careerObjective": "AI Engineer — Chuyên sâu RAG, LLM Agents, Vector Search & Fine-tuning triển khai thực tế tại doanh nghiệp.",
        "projects": [],
        "externalSkills": []
      }
    }
  }
}
```

#### Mô tả nghiệp vụ
- Ngay sau khi học viên đăng ký bằng Email/Mật khẩu (`POST /auth/register`) hoặc đăng nhập lần đầu qua Google One-Tap (`POST /auth/google`), `AuthView.tsx` tự động điều hướng học viên tới `/onboarding` (`OnboardingWizardView.tsx`).
- Tại `/onboarding`, học viên hoàn tất 5 trường (`avatarUrl`, `fullName`, `phone`, `careerGoal`, `bio`) và bấm **"Hoàn tất Hồ sơ & Vào Góc Học Tập"**.
- Frontend gọi `await profileInterviewApi.updateMyProfile(...)`, cập nhật `currentUser` trong `AcademyContext` và điều hướng vào `/app`. Khi học viên mở tab **"Hồ sơ của tôi"** (`StudentProfileCvWorkspace.tsx`), toàn bộ dữ liệu vừa thiết lập ở `/onboarding` được hiển thị đầy đủ từ cơ sở dữ liệu mà không bị trống.

---

### API 5.2: Tải lên file CV PDF để Bóc tách (`PARSE_PDF`) hoặc Lưu Hồ sơ Năng lực (`SAVE_RESUME`)
- **Tên API:** `profileAndInterviewApi.uploadAndParseCv`
- **HTTP Method:** `POST`
- **Endpoint:** `/me/cv/upload`
- **Nhóm chức năng:** User & Profile Management / Smart CV Diff & Sync
- **Nơi sử dụng trên Frontend:** `src/components/StudentProfileCvWorkspace.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Giá trị hợp lệ | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `fileName` | `string` | Có | Tên file `.pdf` | Tên tệp CV được tải lên hoặc đang lưu (VD: `"CV_Nguyen_Van_An_2026.pdf"`). |
| `size` | `number` | Có | Số nguyên (bytes) | Kích thước file (VD: `245000`). |
| `mode` | `'PARSE_PDF' \| 'SAVE_RESUME'` | Có | `'PARSE_PDF'` hoặc `'SAVE_RESUME'` | - `'PARSE_PDF'`: Khi học viên chọn file PDF từ máy tính để Backend trích xuất dữ liệu trả về cho hộp thoại **Đối soát Thông minh (Smart Diff & Sync Modal)** (chưa ghi đè mù quáng vào hồ sơ).<br>- `'SAVE_RESUME'`: Khi học viên xác nhận đồng bộ hoặc bấm nút **"Lưu thông tin"** trên trình chỉnh sửa Hồ sơ 6 khối. |
| `resumeData` | `Partial<StudentResumeData>` | Khi `mode === 'SAVE_RESUME'` | Object 6 khối | Dữ liệu Hồ sơ Năng lực đã chỉnh sửa/hợp nhất cần lưu bền vững vào `user_profiles.cv_parsed_data`. |

**JSON Request mẫu (Trường hợp 1: `mode = "PARSE_PDF"` khi vừa chọn file PDF):**
```json
{
  "fileName": "CV_Ung_Tuyen_AI_Engineer_2026.pdf",
  "size": 312400,
  "mode": "PARSE_PDF"
}
```

**JSON Request mẫu (Trường hợp 2: `mode = "SAVE_RESUME"` khi lưu hồ sơ 6 khối):**
```json
{
  "fileName": "CV_Ung_Tuyen_AI_Engineer_2026.pdf",
  "size": 245000,
  "mode": "SAVE_RESUME",
  "resumeData": {
    "fullName": "Nguyễn Văn An",
    "headline": "Kỹ Sư AI Thực Chiến & Python Backend",
    "email": "an.nguyen.dev@gmail.com",
    "phone": "0908 123 456",
    "githubUrl": "github.com/nguyenvanan-dev",
    "linkedinUrl": "linkedin.com/in/nguyenvanan",
    "careerObjective": "Xây dựng các hệ thống RAG & AI Agent hiệu năng cao.",
    "skills": ["Python", "FastAPI", "PostgreSQL", "Hybrid RAG", "Docker"],
    "projects": [],
    "workExperience": [],
    "education": [],
    "awardsAndCerts": []
  }
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `fileName` | `string` | Có | Tên file CV đã xử lý. |
| `updatedAt` | `string` | Có | Thời điểm cập nhật (VD: `"Hôm nay · Vừa cập nhật"`). |
| `cvParsedData` | `CvParsedData` | Có | Toàn bộ cấu trúc dữ liệu CV đã được bóc tách (ở chế độ `PARSE_PDF`) hoặc đã lưu vào DB (ở chế độ `SAVE_RESUME`). |

---

### API 5.3: Vòng 1 — Chấm độ khớp Hồ sơ CV với JD mục tiêu (`screenCvAgainstJd`)
- **Tên API:** `profileAndInterviewApi.screenCvAgainstJd`
- **HTTP Method:** `POST`
- **Endpoint:** `/interviews/screen-cv`
- **Nhóm chức năng:** AI Voice Mock Interview (Round 1 CV Screening)
- **Nơi sử dụng trên Frontend:** `src/components/StudentVoiceInterviewWorkspace.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Giá trị hợp lệ | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `targetLevel` | `'INTERN' \| 'FRESHER' \| 'JUNIOR' \| 'SENIOR'` | Có | 4 cấp bậc | Cấp bậc ứng tuyển mục tiêu (`mock_interviews.target_level`). |
| `targetRole` | `string` | Có | Chuỗi văn bản | Vị trí công việc mục tiêu (`mock_interviews.target_role`). |
| `jdRawText` | `string` | Có | Chuỗi văn bản | Toàn bộ nội dung bản mô tả công việc (JD) (`mock_interviews.jd_raw_text`). |
| `scenarioMode` | `'READY_78' \| 'MISSING_COURSE_45'` | Không | Mặc định `'READY_78'` | Tham số hỗ trợ kiểm thử kịch bản CV đạt chuẩn (`>= 60%`) hoặc CV quên liệt kê dự án khóa học (`45%`). |

**JSON Request mẫu:**
```json
{
  "targetLevel": "FRESHER",
  "targetRole": "AI Engineer (RAG & LLM Applications)",
  "jdRawText": "Yêu cầu: Thành thạo Python, FastAPI, xây dựng hệ thống tìm kiếm kết hợp Hybrid Search trên PostgreSQL pgvector, tối ưu độ trễ bằng Promise.all/asyncio...",
  "scenarioMode": "READY_78"
}
```

#### Response – Dữ liệu đầu ra (`Round1CvScreeningResponse`)
- **HTTP Status Code:** `200 OK`.
- **Quy tắc nghiệp vụ bắt buộc:** Ở Vòng 1 (`CV_SCREENING`), hệ thống **chưa trừ lượt phỏng vấn** (`creditDeducted: 0`).

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `interviewId` | `string` | Có | ID phiên phỏng vấn vừa khởi tạo ở trạng thái `'CV_SCREENING'`. |
| `status` | `'CV_SCREENING'` | Có | Trạng thái Vòng 1. |
| `creditDeducted` | `0` | Có | Luôn bằng `0` ở Vòng 1. |
| `availableCredits` | `number` | Có | Số lượt phỏng vấn hiện có của học viên. |
| `cvScreeningResult` | `CvScreeningResult` | Có | Kết quả phân tích độ khớp giữa CV và JD (`mock_interviews.cv_screening_result`). |
| `cvScreeningResult.matchPercent` | `number` | Có | Tỷ lệ phần trăm độ khớp (`0–100`). Nếu `matchPercent >= 60`, học viên được mở khóa vào Vòng 2. |
| `cvScreeningResult.passedGate` | `boolean` | Có | `true` nếu đạt ngưỡng qua Vòng 1 (`matchPercent >= 60`). |
| `cvScreeningResult.layoutAndPresentationFeedback` | `string` | Có | Nhận xét về bố cục, trình bày và cách viết bullet-point trong CV. |
| `cvScreeningResult.jdMatchEvaluation` | `string` | Có | Nhận xét chi tiết mức độ đáp ứng của CV đối với từng yêu cầu trong JD. |
| `cvScreeningResult.missingKeywordsOrGaps` | `string[]` | Có | Danh sách từ khóa công nghệ hoặc dự án còn thiếu cần bổ sung vào CV. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "interviewId": "intv-2026-01",
    "status": "CV_SCREENING",
    "creditDeducted": 0,
    "availableCredits": 4,
    "cvScreeningResult": {
      "matchPercent": 78,
      "passedGate": true,
      "layoutAndPresentationFeedback": "Bố cục CV 6 khối rõ ràng, các dự án nêu bật được số liệu kết quả thực tế.",
      "jdMatchEvaluation": "Hồ sơ đáp ứng tốt 78% yêu cầu vị trí AI Engineer (Fresher): Đã có dự án Hybrid RAG trên PostgreSQL pgvector và FastAPI.",
      "missingKeywordsOrGaps": [
        "Nên bổ sung thêm thông số độ trễ (latency ms) và cách giám sát chất lượng câu trả lời (Evaluation)."
      ]
    }
  }
}
```

---

### API 5.4: Vòng 2 — Bắt đầu vào Phòng Phỏng vấn Giọng nói (`startVoiceInterview`)
- **Tên API:** `profileAndInterviewApi.startVoiceInterview`
- **HTTP Method:** `POST`
- **Endpoint:** `/interviews/:interviewId/start`
- **Nhóm chức năng:** AI Voice Mock Interview (Round 2 Voice Room)
- **Nơi sử dụng trên Frontend:** `src/components/StudentVoiceInterviewWorkspace.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `interviewId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `interviewId` | `string` | Có | ID phiên phỏng vấn. |
| `status` | `'IN_PROGRESS'` | Có | Trạng thái bắt đầu phỏng vấn Vòng 2. |
| `startedAt` | `string` (ISO 8601) | Có | Thời điểm bắt đầu cuộc gọi. |
| `turnIndex` | `number` | Không | Chỉ số lượt hỏi đầu tiên (`0`). |
| `totalTurns` | `number` | Không | Tổng số lượt hỏi trong phiên (`3`). |
| `stageTag` | `string` | Không | Nhãn giai đoạn của câu hỏi mở đầu (VD: `"Câu 1/3 · Hỏi xoáy vào Đồ án trong CV của bạn"`). |
| `questionText` | `string` | Không | Nội dung câu hỏi mở đầu do AI sinh dựa trên CV & JD của học viên. |
| `interviewerName` | `string` | Không | Tên người phỏng vấn AI. |
| `interviewerTitle` | `string` | Không | Chức danh người phỏng vấn AI. |

```json
{
  "success": true,
  "data": {
    "interviewId": "intv-2026-01",
    "status": "IN_PROGRESS",
    "startedAt": "2026-11-12T15:50:00.000Z",
    "turnIndex": 0,
    "totalTurns": 3,
    "stageTag": "Câu 1/3 · Hỏi xoáy vào Đồ án trong CV của bạn",
    "questionText": "Chào bạn, mình đã đọc kỹ tờ CV trong Hồ sơ của bạn. Trong đồ án Trợ lý AI tra cứu hơn 500 tài liệu nội bộ, làm sao bạn giữ nguyên được các bảng biểu tài chính nhiều cột trong file PDF mà không bị vỡ dòng khi cắt nhỏ văn bản?",
    "interviewerName": "Anh Trần Minh Khoa",
    "interviewerTitle": "Principal AI Architect · Hội đồng Tuyển dụng Kỹ thuật"
  }
}
```

---

### API 5.5: Vòng 2 — Gửi Câu trả lời Giọng nói của Học viên theo từng Lượt (`sendVoiceTurn`)
- **Tên API:** `profileAndInterviewApi.sendVoiceTurn`
- **HTTP Method:** `POST`
- **Endpoint:** `/interviews/:interviewId/turn`
- **Nhóm chức năng:** AI Voice Mock Interview (Round 2 Voice Room)
- **Nơi sử dụng trên Frontend:** `src/components/StudentVoiceInterviewWorkspace.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `interviewId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `transcript` | `string` | Có | Nội dung câu trả lời bằng giọng nói của học viên đã được chuyển thành văn bản (Speech-to-Text qua Web Speech API hoặc nhập trực tiếp) ở lượt hỏi hiện tại. |

**JSON Request mẫu:**
```json
{
  "transcript": "Trong dự án Hybrid RAG của em, em sử dụng Docling để nhận diện cấu trúc bảng biểu trong file PDF và chuyển sang Markdown kèm theo số trang gốc trước khi lưu vào PostgreSQL pgvector."
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `interviewId` | `string` | Có | ID phiên phỏng vấn. |
| `recordedTranscript` | `string` | Có | Văn bản câu trả lời vừa được lưu vào `interview_turns`. |
| `acknowledged` | `boolean` | Có | `true` xác nhận đã lưu và chấm điểm lượt trả lời. |
| `turnIndex` | `number` | Không | Chỉ số lượt hỏi tiếp theo. |
| `turnEvaluation` | `string` | Không | Nhận xét nhanh của AI về câu trả lời vừa rồi. |
| `betterAnswerTip` | `string` | Không | Gợi ý cải thiện cách trả lời cho câu hỏi vừa rồi. |
| `nextStageTag` | `string` | Không | Nhãn giai đoạn của câu hỏi tiếp theo. |
| `nextQuestionText` | `string` | Không | Nội dung câu hỏi tiếp theo do AI sinh động (hoặc lời kết thúc khi đã đủ 3 lượt hỏi). |
| `isCompleted` | `boolean` | Không | `true` nếu đã hoàn thành toàn bộ các lượt hỏi của Vòng 2. |

```json
{
  "success": true,
  "data": {
    "interviewId": "intv-2026-01",
    "recordedTranscript": "Trong dự án Hybrid RAG của em, em sử dụng Docling để nhận diện cấu trúc bảng biểu trong file PDF và chuyển sang Markdown kèm theo số trang gốc trước khi lưu vào PostgreSQL pgvector.",
    "acknowledged": true,
    "turnIndex": 1,
    "turnEvaluation": "Trả lời đúng trọng tâm kỹ thuật xử lý tài liệu thực tế, giải thích rõ lý do giữ tiêu đề mục cha.",
    "betterAnswerTip": "Nêu thêm cách xử lý những bảng dài kéo qua 2 trang PDF liên tiếp sẽ giúp câu trả lời đạt điểm tuyệt đối.",
    "nextStageTag": "Câu 2/3 · Kiểm tra kỹ năng PostgreSQL & FastAPI trong CV",
    "nextQuestionText": "Khi kết hợp tìm kiếm vector và lọc quyền truy cập theo phòng ban, bạn đặt bước kiểm tra quyền ở đâu để không bị lộ tài liệu nhạy cảm?",
    "isCompleted": false
  }
}
```

---

### API 5.6: Chặng 3 — Hoàn tất Phỏng vấn, Trừ `1` Credit & Nhận Báo cáo Đánh giá (`completeInterview`)
- **Tên API:** `profileAndInterviewApi.completeInterview`
- **HTTP Method:** `POST`
- **Endpoint:** `/interviews/:interviewId/complete`
- **Nhóm chức năng:** AI Voice Mock Interview (Stage 3 Report & Credit Deduction)
- **Nơi sử dụng trên Frontend:** `src/components/StudentVoiceInterviewWorkspace.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `interviewId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `interviewId` | `string` | Có | ID phiên phỏng vấn. |
| `status` | `'COMPLETED'` | Có | Trạng thái hoàn tất phỏng vấn. |
| `creditDeducted` | `1` | Có | Số lượt phỏng vấn bị trừ (Chính thức trừ `1` Credit khi hoàn tất Vòng 2). |
| `remainingCredits` | `number` | Có | Số lượt phỏng vấn còn lại của học viên sau khi trừ (`user_profiles.interview_credits`). Frontend dùng trực tiếp giá trị này để cập nhật `setInterviewCredits(res.remainingCredits)`. |
| `evaluationReport` | `InterviewEvaluationReport` | Có | Báo cáo đánh giá năng lực phỏng vấn (`mock_interviews.evaluation_report`). |
| `evaluationReport.overallScore` | `number` | Có | Điểm tổng kết buổi phỏng vấn (`0–100`). |
| `evaluationReport.projectDepthScore` | `number` | Có | Điểm độ sâu hiểu biết dự án thực tế (`0–100`). |
| `evaluationReport.communicationScore` | `number` | Có | Điểm kỹ năng trình bày & phản biện tình huống (`0–100`). |
| `evaluationReport.strengths` | `string[]` | Có | Danh sách các điểm mạnh thể hiện trong buổi phỏng vấn. |
| `evaluationReport.improvements` | `string[]` | Có | Danh sách các điểm cần cải thiện trước khi đi phỏng vấn thật. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "interviewId": "intv-2026-01",
    "status": "COMPLETED",
    "creditDeducted": 1,
    "remainingCredits": 3,
    "evaluationReport": {
      "overallScore": 89,
      "projectDepthScore": 92,
      "communicationScore": 88,
      "strengths": [
        "Nắm vững kiến trúc kỹ thuật của dự án trong CV, giải thích rõ cách giữ nguyên bảng biểu PDF.",
        "Trình bày mạch lạc, trả lời đúng trọng tâm câu hỏi tình huống của JD."
      ],
      "improvements": [
        "Nên nêu rõ hơn thông số độ trễ (latency) khi chạy song song hai nhánh tìm kiếm."
      ]
    }
  }
}
```

---

### API 5.7: Hủy / Thoát Phỏng vấn giữa chừng (`cancelDraftInterview`)
- **Tên API:** `profileAndInterviewApi.cancelDraftInterview`
- **HTTP Method:** `DELETE`
- **Endpoint:** `/interviews/:interviewId`
- **Nhóm chức năng:** AI Voice Mock Interview
- **Nơi sử dụng trên Frontend:** `src/components/StudentVoiceInterviewWorkspace.tsx`
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `interviewId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.
- **Quy tắc nghiệp vụ:** Khi học viên thoát giữa chừng ở Vòng 2 trước khi hoàn thành, Backend xóa bản ghi phỏng vấn nháp (`DELETE FROM mock_interviews WHERE id = :id AND status != 'COMPLETED'`) và **không trừ Credit** (`creditDeducted: 0`).

```json
{
  "success": true,
  "data": {
    "interviewId": "intv-2026-01",
    "deleted": true,
    "creditDeducted": 0
  }
}
```

---

## 7. Nhóm 6: Đơn hàng Học phí & Thanh toán Tự động VietQR SePay (`order.api.ts`)

File dịch vụ Frontend: `src/services/order.api.ts` (Export `orderApi` và alias `orderSepayApi`).

---

### API 6.1: Khởi tạo Đơn ghi danh Lớp học & Sinh mã VietQR (`createCohortOrder`)
- **Tên API:** `orderApi.createCohortOrder`
- **HTTP Method:** `POST`
- **Endpoint:** `/orders`
- **Nhóm chức năng:** Order & Payment Management
- **Nơi sử dụng trên Frontend:** `src/views/VietQrCheckoutView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Request Headers:**
  - `Idempotency-Key` (`string`, bắt buộc): Khóa chống tạo trùng đơn hàng (VD: `idem-checkout-cohort-ai-k01`).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `cohortId` | `string` | Có | ID của đợt mở lớp học viên đăng ký (`orders.cohort_id`). |
| `idempotencyKey` | `string` | Có | Khóa chống trùng lặp đơn hàng (`orders.idempotency_key`). |

**JSON Request mẫu:**
```json
{
  "cohortId": "cohort-ai-k01",
  "idempotencyKey": "idem-checkout-cohort-ai-k01"
}
```

#### Response – Dữ liệu đầu ra (`SepayOrderCreatedResponse`)
- **HTTP Status Code:** `201 Created` hoặc `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `orderCode` | `string` | Có | Mã đơn hàng duy nhất dùng làm nội dung chuyển khoản bắt buộc (VD: `"ET20268891"`). |
| `cohortId` | `string` | Có | ID đợt mở lớp. |
| `cohortCode` | `string` | Có | Mã đợt mở lớp (VD: `"AI-ENG-2026-K01"`). |
| `courseTitle` | `string` | Không | Tên khóa học. |
| `amountVnd` | `number` | Có | Số tiền học phí cần chuyển khoản (VNĐ). |
| `status` | `'PENDING' \| 'PAID'` | Có | Trạng thái đơn hàng (`orders.status`). |
| `bankName` | `string` | Có | Tên ngân hàng thụ hưởng (VD: `"MBBank (Ngân hàng Quân Đội)"`). |
| `accountNumber` | `string` | Có | Số tài khoản ngân hàng nhận học phí. |
| `accountHolder` | `string` | Có | Tên chủ tài khoản thụ hưởng. |
| `transferContent` | `string` | Có | Nội dung chuyển khoản bắt buộc để SePay đối soát tự động (trùng với `orderCode`). |
| `qrImageUrl` | `string` | Có | Đường dẫn ảnh mã VietQR Napas247. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "orderCode": "ET20268891",
    "cohortId": "cohort-ai-k01",
    "cohortCode": "AI-ENG-2026-K01",
    "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
    "amountVnd": 8500000,
    "status": "PENDING",
    "bankName": "MBBank (Ngân hàng Quân Đội)",
    "accountNumber": "098877665544",
    "accountHolder": "CONG TY CO PHAN CONG NGHE GIAO DUC 3T ACADEMY",
    "transferContent": "ET20268891",
    "qrImageUrl": "https://img.vietqr.io/image/MB-098877665544-compact2.png?amount=8500000&addInfo=ET20268891"
  }
}
```

---

### API 6.2: Kiểm tra Trạng thái Đơn hàng (`getOrderStatus` — Polling 3 giây/lần)
- **Tên API:** `orderApi.getOrderStatus`
- **HTTP Method:** `GET`
- **Endpoint:** `/orders/:orderCode`
- **Nhóm chức năng:** Order & Payment Management
- **Nơi sử dụng trên Frontend:** `src/views/VietQrCheckoutView.tsx` (Vòng lặp `setInterval` mỗi `3000ms` khi đang ở trạng thái chờ chuyển khoản `WAITING`, cũng như khi bấm kiểm tra thủ công).
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `orderCode` (`string`, bắt buộc, VD: `ET20268891`).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.
- Khi Backend nhận được Webhook thật từ SePay và cập nhật `orders.status = 'PAID'`, lần polling tiếp theo (sau tối đa 3 giây) của `VietQrCheckoutView.tsx` sẽ nhận được `status: "PAID"`, tự động dừng polling, gọi `refreshEnrollments()` (`GET /me/enrollments` + `GET /orders/my-history`) và chuyển màn hình sang biên lai xác nhận thành công.

```json
{
  "success": true,
  "data": {
    "orderCode": "ET20268891",
    "status": "PAID",
    "paidAt": "12/11/2026 · 15:52",
    "transactionRef": "MB-QR-99881204"
  }
}
```

---

### API 6.3: Lấy lịch sử Biên lai Đóng học phí của Học viên (`getMyOrderHistory`)
- **Tên API:** `orderApi.getMyOrderHistory`
- **HTTP Method:** `GET`
- **Endpoint:** `/orders/my-history`
- **Nhóm chức năng:** Order & Payment Management
- **Nơi sử dụng trên Frontend:** `src/context/AcademyContext.tsx`, `src/views/StudentDashboardView.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`STUDENT`).

#### Response – Dữ liệu đầu ra (`OrderReceipt[]`)
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": [
    {
      "orderCode": "ET20268891",
      "cohortCode": "AI-ENG-2026-K01",
      "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "amountVnd": 8500000,
      "paidAt": "12/11/2026 · 15:52",
      "bankName": "MBBank — Ngân hàng Quân Đội (Chuyển khoản QR 24/7)",
      "transactionRef": "MB-QR-99881204"
    }
  ]
}
```

---

### API 6.4: Giả lập / Nhận Webhook Đối soát Giao dịch SePay (`simulateSepayWebhook`)
- **Tên API:** `orderApi.simulateSepayWebhook`
- **HTTP Method:** `POST`
- **Endpoint:** `/webhooks/sepay/simulate`
- **Nhóm chức năng:** Order & Payment Webhook Reconciliation
- **Nơi sử dụng trên Frontend:** `src/views/VietQrCheckoutView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (trên môi trường Dev/Staging) hoặc Webhook API Key từ SePay.

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `orderCode` | `string` | Có | Mã đơn hàng cần xác nhận thanh toán thành công (VD: `"ET20268891"`). |

**JSON Request mẫu:**
```json
{
  "orderCode": "ET20268891"
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.
- **Nghiệp vụ Backend:** Ghi nhận bản ghi vào bảng `payment_transactions` (`gateway = 'SEPAY_VIETQR'`, `match_status = 'MATCHED'`), chuyển `orders.status = 'PAID'`, tự động tạo bản ghi `enrollments` (`status = 'ACTIVE'`) và tăng `cohorts.enrolled_count += 1`.

```json
{
  "success": true,
  "data": {
    "orderCode": "ET20268891",
    "status": "PAID",
    "gateway": "SEPAY_VIETQR",
    "matchStatus": "MATCHED",
    "transactionRef": "MB-SEPAY-8891",
    "paidAt": "Vừa xong · Đối soát tự động qua SePay Webhook",
    "receipt": {
      "orderCode": "ET20268891",
      "cohortCode": "AI-ENG-2026-K01",
      "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "amountVnd": 8500000,
      "paidAt": "Vừa xong · Đối soát tự động qua SePay Webhook",
      "bankName": "MBBank — Ngân hàng Quân Đội (Chuyển khoản QR 24/7)",
      "transactionRef": "MB-SEPAY-8891"
    }
  }
}
```

---

## 8. Nhóm 7: Cổng Giảng viên — Lịch dạy, Quản lý Lớp 3 Cấp, Soạn đề & Duyệt Ca thi (`teach.api.ts`)

File dịch vụ Frontend: `src/services/teach.api.ts`

---

### API 7.1: Lấy dữ liệu Tổng hợp Lịch dạy, Học viên, Hỏi đáp & Thống kê của Giảng viên (`getInstructorSchedule`)
- **Tên API:** `teachApi.getInstructorSchedule`
- **HTTP Method:** `GET`
- **Endpoint:** `/teach/schedule`
- **Nhóm chức năng:** Instructor & Teaching Management
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `liveSession` | `ClassSession` | Có | Buổi học đang phát trực tiếp hoặc sắp diễn ra hôm nay của Giảng viên. |
| `upcomingSessions` | `ClassSession[]` | Có | Danh sách các buổi học sắp tới (`status !== 'REPLAY_READY'`). |
| `allSessions` | `ClassSession[]` | Có | Toàn bộ danh sách buổi học thuộc các lớp Giảng viên phụ trách. |
| `examReviews` | `ExamCameraReviewItem[]` | Có | Danh sách các ca thi tốt nghiệp cuối khóa có cờ cảnh báo từ Camera AI cần Giảng viên xem xét (`decision: 'PENDING' \| 'APPROVED' \| 'RETAKE_REQUIRED'`). |
| `enrollments` | `Enrollment[]` | Có | Danh sách học viên ghi danh trong các lớp (kèm `completedSessionsCount`, `missingQuizzesCount`, `avgScorePct`, `dropoutRiskScore`, `riskLevel`) để hiển thị danh sách học viên chậm tiến độ và biểu đồ thống kê lớp học. |
| `chatMessages` | `ChatMessage[]` | Có | Lịch sử câu hỏi học viên hỏi AI Tutor (kèm `detectedTopic`) để thống kê các chủ đề học viên hay thắc mắc nhất. |
| `notifications` | `Notification[]` | Có | Danh sách thông báo nhắc học tập đã gửi (kèm `readAt`, `actedAt`). |
| `discussions` | `DiscussionThread[]` | Có | Danh sách các câu hỏi thảo luận của học viên cần Giảng viên giải đáp. |
| `materials` | `CohortMaterial[]` | Có | Danh sách tài liệu học tập của các lớp. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": {
    "liveSession": {
      "id": "sess-k01-05",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 5,
      "title": "Buổi 5: Kết hợp tìm kiếm từ khóa & tìm kiếm ngữ nghĩa trên PostgreSQL",
      "activityTags": ["LIVE_CODING", "WORKSHOP"],
      "hostInstructorName": "TS. Trần Minh Khoa",
      "scheduledStart": "Hôm nay · 19:30",
      "scheduledEnd": "Hôm nay · 21:30",
      "status": "LIVE",
      "videoR2Key": "cohorts/k01/sess-05/live.m3u8",
      "videoProvider": "R2_HLS_AES128",
      "durationSeconds": 7200,
      "isCompleted": false,
      "lastPositionSec": 0,
      "aiSummaryMd": "Tóm tắt nội dung Buổi 5...",
      "attachmentsCount": 2,
      "quizStatus": "NOT_STARTED",
      "quizScore": null,
      "quizQuestions": [],
      "aiCitations": []
    },
    "upcomingSessions": [],
    "allSessions": [],
    "examReviews": [
      {
        "id": "exr-01",
        "studentName": "Trần Minh Quân",
        "studentEmail": "quan.tran.dev@gmail.com",
        "cohortCode": "AI-ENG-2026-K01",
        "examTitle": "Thi cuối khóa Kỹ Sư AI Thực Chiến (25 câu trắc nghiệm)",
        "mcqScore": "22/25 câu (8.8 điểm)",
        "submittedAt": "Hôm nay · 18:45",
        "cameraFlagReason": "Học viên rời mắt khỏi màn hình khoảng 15 giây tại phút thứ 18",
        "cameraTimestamp": "Phút 18:20 của ca thi",
        "snapshotNote": "Ảnh chụp tự động: Học viên cúi xuống nhặt bút, không phát hiện thiết bị lạ.",
        "decision": "PENDING"
      }
    ],
    "enrollments": [
      {
        "id": "enr-03",
        "userId": "usr-student-quan",
        "studentName": "Trần Minh Quân",
        "studentEmail": "quan.tran.dev@gmail.com",
        "cohortId": "cohort-ai-k01",
        "cohortCode": "AI-ENG-2026-K01",
        "status": "ACTIVE",
        "completedSessionsCount": 2,
        "totalSessionsCount": 5,
        "missingQuizzesCount": 2,
        "avgScorePct": 72,
        "lastActivityAt": "2 ngày trước",
        "dropoutRiskScore": 0.68,
        "riskLevel": "HIGH"
      }
    ],
    "chatMessages": [],
    "notifications": [],
    "discussions": [],
    "materials": []
  }
}
```

---

### API 7.2: Lấy danh sách các Đợt mở lớp Giảng viên phụ trách (`getInstructorCohorts`)
- **Tên API:** `teachApi.getInstructorCohorts`
- **HTTP Method:** `GET`
- **Endpoint:** `/teach/cohorts`
- **Nhóm chức năng:** Instructor & Teaching Management (Level 1 Cohort List)
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Response – Dữ liệu đầu ra (`Cohort[]`)
- **HTTP Status Code:** `200 OK`.
- Trả về mảng `Cohort[]` mà giảng viên đang đăng nhập là Giảng viên phụ trách chính (`cohorts.instructor_id = currentUserId`).

---

### API 7.3: Chi tiết Cấp 2 của một Lớp học & Đề thi Tốt nghiệp 25 câu (`getInstructorCohortDetail`)
- **Tên API:** `teachApi.getInstructorCohortDetail`
- **HTTP Method:** `GET`
- **Endpoint:** `/teach/cohorts/:cohortId`
- **Nhóm chức năng:** Instructor & Teaching Management (Level 2 Cohort Detail)
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `cohortId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `cohort` | `Cohort` | Có | Thông tin lớp học đang chọn. |
| `sessions` | `ClassSession[]` | Có | Danh sách toàn bộ buổi học của lớp. |
| `finalExamQuestions` | `McqQuestionItem[]` | Có | Danh sách 25 câu hỏi trắc nghiệm của Đề thi tốt nghiệp cuối khóa (bao gồm đầy đủ `correctIndex` và `explanation` để Giảng viên rà soát/chỉnh sửa). |
| `finalExamPublishStatus` | `'DRAFT' \| 'PUBLISHED'` | Không | Trạng thái xuất bản của đề thi cuối khóa. |
| `enrollments` | `Enrollment[]` | Không | Danh sách tiến độ học viên thuộc lớp học này. |
| `discussions` | `DiscussionThread[]` | Không | Danh sách câu hỏi thảo luận của lớp. |
| `materials` | `CohortMaterial[]` | Không | Danh sách tài liệu của lớp. |

---

### API 7.4: Chi tiết Cấp 3 của một Buổi học & Bộ đề 10 câu (`getInstructorSessionDetail`)
- **Tên API:** `teachApi.getInstructorSessionDetail`
- **HTTP Method:** `GET`
- **Endpoint:** `/teach/cohorts/:cohortId/sessions/:sessionId`
- **Nhóm chức năng:** Instructor & Teaching Management (Level 3 Session Detail)
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:**
  - `cohortId` (`string`, bắt buộc)
  - `sessionId` (`string`, bắt buộc)

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `session` | `ClassSession` | Có | Thông tin chi tiết buổi học. |
| `questions` | `McqQuestionItem[]` | Có | Bộ 10 câu hỏi trắc nghiệm mở khóa của buổi học (gồm cả `correctIndex` và `explanation`). |
| `publishStatus` | `'DRAFT' \| 'PUBLISHED'` | Có | Trạng thái của bộ đề buổi học (`DRAFT` = Bản nháp chờ duyệt, `PUBLISHED` = Đã mở cho học viên làm bài). |
| `materials` | `CohortMaterial[]` | Không | Tài liệu đính kèm của buổi học. |
| `discussions` | `DiscussionThread[]` | Không | Thảo luận của buổi học. |

---

### API 7.5: Cập nhật Tóm tắt Buổi học, Đổi lịch & Tải lên Tài liệu (`updateSessionMaterials`)
- **Tên API:** `teachApi.updateSessionMaterials`
- **HTTP Method:** `PUT`
- **Endpoint:** `/teach/sessions/:sessionId/materials`
- **Nhóm chức năng:** Instructor & Teaching Management
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `title` | `string` | Không | Tiêu đề mới của buổi học (`class_sessions.title`). |
| `aiSummaryMd` | `string` | Không | Nội dung tóm tắt kiến thức trọng tâm định dạng Markdown (`class_sessions.ai_summary_md`). |
| `scheduledStart` | `string` | Không | Thời gian bắt đầu mới khi dời lịch buổi học. |
| `cohortId` | `string` | Không | ID đợt mở lớp (khi tải lên tài liệu mới). |
| `sessionOrder` | `number` | Không | Số thứ tự buổi học (khi tải lên tài liệu mới). |
| `materialTitle` | `string` | Không | Tên tài liệu mới cần đính kèm vào buổi học (`session_materials.title`). |
| `fileType` | `'SLIDE' \| 'PDF' \| 'REPO' \| 'NOTEBOOK'` | Không | Loại tài liệu đính kèm (`session_materials.material_type`). |

**JSON Request mẫu:**
```json
{
  "cohortId": "cohort-ai-k01",
  "sessionOrder": 5,
  "aiSummaryMd": "Tóm tắt trọng tâm Buổi 5: Kết hợp tìm kiếm từ khóa BM25 và Vector Search trên PostgreSQL.",
  "materialTitle": "Slide Buổi 5 — Hybrid Search Thực Chiến.pdf",
  "fileType": "SLIDE"
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "sessionId": "sess-k01-05",
    "updated": true,
    "updatedAt": "2026-11-12T16:00:00.000Z",
    "session": {
      "id": "sess-k01-05",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 5,
      "title": "Buổi 5: Kết hợp tìm kiếm từ khóa & tìm kiếm ngữ nghĩa trên PostgreSQL",
      "aiSummaryMd": "Tóm tắt trọng tâm Buổi 5: Kết hợp tìm kiếm từ khóa BM25 và Vector Search trên PostgreSQL."
    },
    "material": {
      "id": "mat-1762959000",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 5,
      "title": "Slide Buổi 5 — Hybrid Search Thực Chiến.pdf",
      "fileType": "SLIDE",
      "fileSize": "3.2 MB",
      "updatedAt": "Vừa tải lên hôm nay",
      "downloadUrl": "https://cdn.3tacademy.vn/materials/slide-buoi-5.pdf"
    }
  }
}
```

---

### API 7.6: AI Tự động Gợi ý 10 Câu hỏi Trắc nghiệm cho Buổi học (`generateSessionQuizByAi`)
- **Tên API:** `teachApi.generateSessionQuizByAi`
- **HTTP Method:** `POST`
- **Endpoint:** `/teach/sessions/:sessionId/generate-quiz`
- **Nhóm chức năng:** AI Quiz Generation & Assessment Management
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.
- **Quy tắc nghiệp vụ:** Bộ câu hỏi do AI sinh ra luôn ở trạng thái `'DRAFT'` (Bản nháp) để Giảng viên rà soát trước khi bấm xuất bản.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `assessmentId` | `string` | Có | Mã bài kiểm tra (VD: `"quiz-sess-k01-05"`). |
| `sessionId` | `string` | Có | ID buổi học. |
| `status` | `'DRAFT'` | Có | Trạng thái mặc định sau khi AI sinh đề là `'DRAFT'`. |
| `items` | `McqQuestionItem[]` | Có | Danh sách 10 câu hỏi trắc nghiệm 4 lựa chọn A, B, C, D kèm `correctIndex` và `explanation`. |

---

### API 7.7: Lưu Bản nháp (`DRAFT`) hoặc Duyệt & Xuất bản Đề kiểm tra / Đề thi (`publishAssessment`)
- **Tên API:** `teachApi.publishAssessment`
- **HTTP Method:** `PUT`
- **Endpoint:** `/teach/assessments/:assessmentId/publish`
- **Nhóm chức năng:** Assessment & Quiz Management
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `assessmentId` (`string`, bắt buộc, VD: `quiz-sess-k01-05` hoặc `final-exam-cohort-ai-k01`).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giá trị hợp lệ | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `status` | `'DRAFT' \| 'PUBLISHED'` | Có | `'DRAFT'` hoặc `'PUBLISHED'` | - `'DRAFT'`: Khi giảng viên thêm/sửa câu hỏi và lưu bản nháp.<br>- `'PUBLISHED'`: Khi giảng viên bấm "Duyệt & Xuất bản đề (PUBLISHED)" để mở chính thức cho học viên làm bài. |
| `items` | `McqQuestionItem[]` | Có | Mảng câu hỏi | Toàn bộ danh sách câu hỏi trắc nghiệm của bài kiểm tra / đề thi. |

**JSON Request mẫu:**
```json
{
  "status": "PUBLISHED",
  "items": [
    {
      "number": 1,
      "scenarioTag": "Câu 1/10 · Buổi 5",
      "prompt": "Phương pháp nào kết hợp cả điểm tìm kiếm từ khóa và điểm tìm kiếm vector?",
      "options": [
        "Reciprocal Rank Fusion (RRF) kết hợp BM25 và Cosine Similarity",
        "Chỉ dùng toán tử LIKE trong SQL",
        "Xóa chỉ mục vector",
        "Sắp xếp ngẫu nhiên"
      ],
      "correctIndex": 0,
      "explanation": "RRF chuẩn hóa thứ hạng từ cả hai nhánh tìm kiếm giúp kết quả chính xác và ổn định.",
      "skillCode": "HYBRID-RAG",
      "skillName": "Tìm kiếm kết hợp từ khóa & ngữ nghĩa",
      "reviewTimestampLabel": "14:20 - 16:05",
      "reviewJumpSec": 25,
      "slideLabel": "Slide Trang 12"
    }
  ]
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "assessmentId": "quiz-sess-k01-05",
    "status": "PUBLISHED",
    "publishedCount": 10,
    "publishedAt": "Vừa duyệt & xuất bản chính thức cho học viên"
  }
}
```

---

### API 7.8: Tạo Link Tham gia Nhanh 1 chạm cho Diễn giả Khách mời (`createGuestSpeakerLink`)
- **Tên API:** `teachApi.createGuestSpeakerLink`
- **HTTP Method:** `POST`
- **Endpoint:** `/teach/sessions/:sessionId/guest-link`
- **Nhóm chức năng:** Livestream Classroom & Guest Speaker Access
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `sessionId` (`string`, bắt buộc).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "sessionId": "sess-k01-05",
    "oneTimeGuestUrl": "https://3tacademy.vn/live/guest?token=K01-GUEST-8492",
    "expiresInHours": 4
  }
}
```

---

### API 7.9: Giảng viên Trả lời & Xác thực Câu hỏi Thảo luận (`replyAndVerifyDiscussion`)
- **Tên API:** `teachApi.replyAndVerifyDiscussion`
- **HTTP Method:** `POST`
- **Endpoint:** `/teach/discussions/:threadId/reply`
- **Nhóm chức năng:** Session Discussions & Q&A Verification
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `threadId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `content` | `string` | Có | Nội dung câu trả lời của Giảng viên (`discussion_posts.content_md`). Nếu rỗng `""`, Backend chỉ đánh dấu xác thực câu trả lời gợi ý của AI là chính xác (`verifiedByStaff = true`). |

**JSON Request mẫu:**
```json
{
  "content": "Thầy xác nhận hướng dẫn trên là chính xác. Các em lưu ý luôn lọc theo department_id ngay trong mệnh đề WHERE trước khi tính khoảng cách vector nhé!"
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "threadId": "disc-01",
    "verifiedByStaff": true,
    "repliedAt": "Vừa xong",
    "thread": {
      "id": "disc-01",
      "cohortId": "cohort-ai-k01",
      "sessionOrder": 4,
      "sessionTitle": "Buổi 4: Bóc tách PDF an toàn & Phân quyền truy cập tài liệu",
      "timestampLabel": "14:20",
      "authorName": "Nguyễn Văn An",
      "createdAt": "10 phút trước",
      "questionTitle": "Làm sao giữ nguyên cấu trúc bảng biểu tài chính khi cắt trang PDF?",
      "questionBody": "Em thấy nếu cắt theo số ký tự cố định thì bảng cân đối kế toán bị đứt làm đôi.",
      "isResolved": true,
      "verifiedByStaff": true,
      "hasAiSuggestion": true,
      "replies": []
    }
  }
}
```

---

### API 7.10: Duyệt hoặc Yêu cầu Thi lại đối với Ca thi Cuối khóa có Cờ Camera (`reviewExamProctoring`)
- **Tên API:** `teachApi.reviewExamProctoring`
- **HTTP Method:** `PUT`
- **Endpoint:** `/teach/exam-reviews/:reviewId`
- **Nhóm chức năng:** Proctored Exam Review
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `reviewId` (`string`, bắt buộc).
- **Request Body (`application/json`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giá trị hợp lệ | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `decision` | `'APPROVED' \| 'RETAKE_REQUIRED'` | Có | `'APPROVED'` hoặc `'RETAKE_REQUIRED'` | Quyết định của Giảng viên sau khi xem lại ảnh chụp Camera: Công nhận kết quả thi (`APPROVED`) hoặc Yêu cầu học viên thi lại (`RETAKE_REQUIRED`). |

**JSON Request mẫu:**
```json
{
  "decision": "APPROVED"
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "reviewId": "exr-01",
    "decision": "APPROVED",
    "updatedAt": "2026-11-12T16:05:00.000Z"
  }
}
```

---

### API 7.11: Gửi Thông báo Nhắc nhở Học tập Cá nhân hóa bằng AI (`sendAiPersonalizedReminder`)
- **Tên API:** `teachApi.sendAiPersonalizedReminder`
- **HTTP Method:** `POST`
- **Endpoint:** `/teach/enrollments/:enrollmentId/ai-reminder`
- **Nhóm chức năng:** Student Retention & AI Study Reminder
- **Nơi sử dụng trên Frontend:** `src/views/InstructorPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`INSTRUCTOR` / `ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `enrollmentId` (`string`, bắt buộc — ID bản ghi `enrollments.id` của học viên chậm tiến độ).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.
- **Nghiệp vụ Backend:** Tạo một bản ghi mới trong bảng `notifications` (`type = 'AI_STUDY_REMINDER'`) gửi tới học viên tương ứng.

```json
{
  "success": true,
  "data": {
    "notificationId": "notif-ai-1762959200",
    "enrollmentId": "enr-03",
    "type": "AI_STUDY_REMINDER",
    "title": "Nhắc nhở học tập cá nhân hóa cho Trần Minh Quân (AI-ENG-2026-K01)",
    "createdAt": "2026-11-12T16:06:40.000Z"
  }
}
```

---

## 9. Nhóm 8: Cổng Quản trị Học viện — Chương trình Đào tạo, Mở lớp, Tài khoản RBAC, Tài chính & Chứng chỉ (`admin.api.ts`)

File dịch vụ Frontend: `src/services/admin.api.ts`

---

### API 8.1: Lấy Dữ liệu Tổng quan Toàn Học viện (`getAdminOverview`)
- **Tên API:** `adminApi.getAdminOverview`
- **HTTP Method:** `GET`
- **Endpoint:** `/admin/overview`
- **Nhóm chức năng:** Admin Management & Executive Analytics
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`ADMIN`).

#### Response – Dữ liệu đầu ra (`AdminOverviewResponse`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `totalRevenueVnd` | `number` | Có | Tổng doanh thu học phí đã đối soát của Học viện (VNĐ). |
| `activeCohortsCount` | `number` | Có | Số lượng đợt mở lớp đang hoạt động. |
| `totalStudentsCount` | `number` | Có | Tổng số lượt học viên ghi danh trên toàn hệ thống. |
| `issuedCertificatesCount` | `number` | Có | Tổng số chứng chỉ tốt nghiệp đã cấp. |
| `cohorts` | `Cohort[]` | Có | Danh sách toàn bộ các đợt mở lớp (`cohorts`). |
| `certificates` | `Record<string, CertificateRecord>` | Có | Toàn bộ chứng chỉ đã cấp trên hệ thống để Quản trị viên quản lý / thu hồi. |
| `enrollments` | `Enrollment[]` | Có | Danh sách toàn bộ bản ghi `enrollments` để phân tích rủi ro bỏ học (`dropoutRiskScore`, `riskLevel`). |
| `chatMessages` | `ChatMessage[]` | Có | Danh sách tin nhắn hỏi đáp AI Tutor (kèm `detectedTopic`, `latencyMs`, `tokensUsed`) để vẽ biểu đồ phân tích chủ đề học tập. |
| `notifications` | `Notification[]` | Có | Danh sách thông báo nhắc học tập (kèm `sentAt`, `readAt`, `actedAt`) để đo lường tỷ lệ học viên quay lại học sau khi nhận nhắc nhở. |
| `accounts` | `AdminUserAccountItem[]` | Có | Danh sách toàn bộ tài khoản Học viên, Giảng viên và Quản trị viên trên hệ thống. |
| `eligibleGraduates` | `EligibleGraduateItem[]` | Có | Danh sách các học viên đã hoàn thành đầy đủ buổi học và vượt qua kỳ thi tốt nghiệp cuối khóa, đủ điều kiện cấp chứng chỉ. |

**Cấu trúc `AdminUserAccountItem`:**
```json
{
  "id": "acc-inst-01",
  "fullName": "TS. Trần Minh Khoa",
  "email": "khoa.tran@3tacademy.vn",
  "roleCategory": "Giảng viên",
  "roleDetail": "Giảng viên chính · Chuyên gia Hệ thống AI",
  "cohortAssigned": "AI-ENG-2026-K01",
  "locked": false,
  "instructorHeadline": "Giảng viên chính · Chuyên gia Hệ thống AI",
  "instructorOrganization": "3T Academy",
  "instructorYearsOfExperience": 10
}
```

**Cấu trúc `EligibleGraduateItem`:**
```json
{
  "id": "grad-enr-01",
  "studentName": "Nguyễn Văn An",
  "studentEmail": "an.nguyen.dev@gmail.com",
  "cohortCode": "AI-ENG-2026-K01",
  "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
  "completedSessionsText": "6/6 buổi (100%)",
  "finalExamScore": 94,
  "issuedCertCode": "CERT-3T-2026-8891"
}
```

---

### API 8.2: Tạo mới Chương trình Đào tạo hoặc Cập nhật Phiên bản Đề cương (`manageCourses`)
- **Tên API:** `adminApi.manageCourses`
- **HTTP Method:** `POST`
- **Endpoint:** `/admin/courses`
- **Nhóm chức năng:** Course & Curriculum Version Management
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`ADMIN`).

#### Request – Dữ liệu đầu vào
- **Request Body (`Partial<Course> & { versionId?: string }`):**

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Không | ID chương trình đào tạo (nếu cập nhật đề cương cho khóa học đã có, hoặc tạo mới). |
| `versionId` | `string` | Không | Mã phiên bản đề cương theo năm học (VD: `"v2026"`, `"v2027"`). |
| `slug` | `string` | Khi tạo mới | Đường dẫn tĩnh của khóa học. |
| `title` | `string` | Khi tạo mới | Tên chương trình đào tạo. |
| `category` | `CourseCategory` | Khi tạo mới | Danh mục khóa học (`'AI & Dữ liệu' \| 'Kỹ thuật Phần mềm & Cloud' \| 'Phân tích Dữ liệu'`). |
| `shortDescription` | `string` | Khi tạo mới | Mô tả ngắn. |
| `descriptionMd` | `string` | Khi tạo mới | Mô tả chi tiết Markdown. |
| `difficultyLevel` | `1 \| 2 \| 3 \| 4 \| 5` | Khi tạo mới | Độ khó khóa học. |
| `skills` | `CourseSkill[]` | Không | Danh sách kỹ năng chuẩn đầu ra. |
| `syllabusTemplate` | `SyllabusTemplateItem[]` | Có | Danh sách các buổi học trong đề cương (theo thứ tự `order: 1, 2, 3...`). |

**JSON Request mẫu:**
```json
{
  "id": "course-ai-eng",
  "versionId": "v2026",
  "syllabusTemplate": [
    {
      "order": 1,
      "title": "Kiến trúc Hệ thống AI Đa tác vụ & Chuẩn giao tiếp dữ liệu 2026",
      "summary": "Cập nhật bộ thư viện mới nhất năm 2026 và thiết kế luồng xử lý tốc độ cao.",
      "activityTags": ["THEORY", "LIVE_CODING"]
    }
  ]
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK` hoặc `201 Created`.

```json
{
  "success": true,
  "data": {
    "courseId": "course-ai-eng",
    "status": "SAVED",
    "course": {
      "id": "course-ai-eng",
      "title": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp"
    }
  }
}
```

---

### API 8.3: Mở Lớp Khai giảng mới hoặc Cập nhật Khung Lịch học (`manageCohorts`)
- **Tên API:** `adminApi.manageCohorts`
- **HTTP Method:** `POST`
- **Endpoint:** `/admin/cohorts`
- **Nhóm chức năng:** Class & Cohort Management
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`ADMIN`).

#### Request – Dữ liệu đầu vào
- **Đồng bộ 1:1 với bảng `cohorts` trong PostgreSQL:**
  - Chỉ nhận duy nhất 1 Giảng viên phụ trách chính (`instructorId`, `instructorName`), **không có** trường Trợ giảng (`taName`).
  - Trường `curriculumVersion` hỗ trợ chuỗi tối đa `120` ký tự (`VARCHAR(120)`).
  - Trường `scheduleSlots` lưu mảng JSONB `CohortScheduleSlot[]`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Giới hạn / Giá trị hợp lệ | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `cohortId` | `string` | Không | UUID / String | Nếu truyền `cohortId`, Backend thực hiện cập nhật đợt mở lớp hiện có (`UPDATED`); nếu không truyền, tạo đợt mở lớp mới (`CREATED`). |
| `courseId` | `string` | Có | ID khóa học hợp lệ | ID chương trình đào tạo (`cohorts.course_id`). |
| `instructorId` | `string` | Có | ID giảng viên hợp lệ | ID Giảng viên phụ trách chính (`cohorts.instructor_id`). |
| `instructorName` | `string` | Không | Họ tên giảng viên | Tên hiển thị của Giảng viên phụ trách chính. |
| `curriculumVersion` | `string` | Có | Tối đa `120` ký tự (`VARCHAR(120)`) | Phiên bản đề cương áp dụng cho đợt mở lớp này (`cohorts.curriculum_version`). |
| `code` | `string` | Có | Tối đa 64 ký tự, Unique | Mã đợt mở lớp (VD: `"AI-ENG-2026-K02"`). |
| `name` | `string` | Có | Tối đa 255 ký tự | Tên đợt mở lớp (VD: `"Khóa K02 — Khai giảng Năm 2026"`). |
| `tuitionVnd` | `number` | Có | Số nguyên `>= 0` | Học phí của đợt mở lớp (VNĐ). |
| `startDate` | `string` | Có | Ngày khai giảng | Ngày bắt đầu khóa học (VD: `"15/12/2026"`). |
| `scheduleSlots` | `CohortScheduleSlot[]` | Có | Mảng `>= 1` ca học | Khung lịch học hàng tuần lưu vào cột JSONB `cohorts.schedule_slots`. Mỗi phần tử gồm `{ dayOfWeek: 0..6, startTime: "HH:mm", endTime: "HH:mm" }`. |

**JSON Request mẫu:**
```json
{
  "courseId": "course-ai-eng",
  "instructorId": "usr-inst-khoa",
  "instructorName": "TS. Trần Minh Khoa",
  "curriculumVersion": "Phiên bản 2026 mới (v2026 — 7 buổi cập nhật mới)",
  "code": "AI-ENG-2026-K02",
  "name": "Khóa K02 — Khai giảng Năm 2026",
  "tuitionVnd": 8900000,
  "startDate": "15/12/2026",
  "scheduleSlots": [
    { "dayOfWeek": 1, "startTime": "19:30", "endTime": "21:30" },
    { "dayOfWeek": 5, "startTime": "16:30", "endTime": "18:30" }
  ]
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `201 Created` hoặc `200 OK`.

```json
{
  "success": true,
  "data": {
    "cohortId": "cohort-1762959500",
    "status": "CREATED",
    "instructorId": "usr-inst-khoa",
    "curriculumVersion": "Phiên bản 2026 mới (v2026 — 7 buổi cập nhật mới)",
    "scheduleSlots": [
      { "dayOfWeek": 1, "startTime": "19:30", "endTime": "21:30" },
      { "dayOfWeek": 5, "startTime": "16:30", "endTime": "18:30" }
    ],
    "cohort": {
      "id": "cohort-1762959500",
      "courseId": "course-ai-eng",
      "instructorId": "usr-inst-khoa",
      "code": "AI-ENG-2026-K02",
      "name": "Khóa K02 — Khai giảng Năm 2026",
      "curriculumVersion": "Phiên bản 2026 mới (v2026 — 7 buổi cập nhật mới)",
      "tuitionVnd": 8900000,
      "enrolledCount": 1,
      "enrollmentOpenAt": "Hôm nay",
      "startDate": "15/12/2026",
      "endDate": "28/02/2027",
      "scheduleSlots": [
        { "dayOfWeek": 1, "startTime": "19:30", "endTime": "21:30" },
        { "dayOfWeek": 5, "startTime": "16:30", "endTime": "18:30" }
      ],
      "status": "OPENING",
      "staff": [
        {
          "id": "usr-inst-khoa",
          "role": "INSTRUCTOR",
          "fullName": "TS. Trần Minh Khoa",
          "headline": "Giảng viên chính phụ trách lớp",
          "avatarUrl": "/src/assets/images/instructor_minh_khoa_1794209569290.jpg",
          "organization": "3T Academy"
        }
      ]
    }
  }
}
```

---

### API 8.4: Khóa / Mở khóa Tài khoản hoặc Cập nhật Phân quyền (`manageUsers`)
- **Tên API:** `adminApi.manageUsers`
- **HTTP Method:** `PUT`
- **Endpoint:** `/admin/users`
- **Nhóm chức năng:** User & RBAC Account Management
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`ADMIN`).

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `userId` | `string` | Có | ID tài khoản cần cập nhật (`accounts.id`). |
| `role` | `'STUDENT' \| 'INSTRUCTOR' \| 'ADMIN'` | Có | Vai trò của tài khoản (`accounts.role`). |
| `isActive` | `boolean` | Không | `true` = Hoạt động (`accounts.status = 'ACTIVE'`), `false` = Tạm khóa (`accounts.status = 'LOCKED'`). |
| `fullName` | `string` | Không | Họ và tên cập nhật. |
| `email` | `string` | Không | Email cập nhật. |
| `roleDetail` | `string` | Không | Chức danh chi tiết. |
| `cohortAssigned` | `string` | Không | Mã lớp phân công. |

**JSON Request mẫu:**
```json
{
  "userId": "acc-stu-02",
  "role": "STUDENT",
  "isActive": false
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "userId": "acc-stu-02",
    "role": "STUDENT",
    "isActive": false,
    "updated": true,
    "account": {
      "id": "acc-stu-02",
      "fullName": "Trần Minh Quân",
      "email": "quan.tran.dev@gmail.com",
      "roleCategory": "Học viên",
      "roleDetail": "Học viên",
      "cohortAssigned": "AI-ENG-2026-K01",
      "locked": true
    }
  }
}
```

---

### API 8.5: Tạo Tài khoản Mới (`createAccount` — Khớp 3 bảng `accounts`, `user_profiles`, `instructor_profiles`)
- **Tên API:** `adminApi.createAccount`
- **HTTP Method:** `POST`
- **Endpoint:** `/admin/accounts`
- **Nhóm chức năng:** User & RBAC Account Management
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`ADMIN`).

#### Request – Dữ liệu đầu vào (`CreateAccountPayload`)
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ánh xạ Cột Database | Ý nghĩa |
| :--- | :--- | :---: | :--- | :--- |
| `email` | `string` | **Có (`NOT NULL`)** | `accounts.email` | Email đăng nhập của tài khoản mới. |
| `password` | `string` | **Có (`NOT NULL`)** | `accounts.password_hash` | Mật khẩu khởi tạo (Backend băm bcrypt/argon2 trước khi lưu). |
| `role` | `'STUDENT' \| 'INSTRUCTOR' \| 'ADMIN'` | **Có (`NOT NULL`)** | `accounts.role` | Vai trò tài khoản. |
| `fullName` | `string` | **Có (`NOT NULL`)** | `user_profiles.full_name` | Họ và tên đầy đủ. |
| `avatarUrl` | `string` | Không | `user_profiles.avatar_url` | Đường dẫn ảnh đại diện. |
| `bio` | `string` | Không | `user_profiles.bio` | Giới thiệu ngắn. |
| `careerGoal` | `string` | Không | `user_profiles.career_goal` | Mục tiêu nghề nghiệp của học viên. |
| `interviewCredits` | `number` | Không | `user_profiles.interview_credits` | Số lượt phỏng vấn AI khởi tạo (Mặc định `2` cho `STUDENT`). |
| `instructorHeadline` | `string` | **Bắt buộc khi `role === 'INSTRUCTOR'`** | `instructor_profiles.headline` | Chức danh chuyên môn của Giảng viên (`NOT NULL` trong bảng `instructor_profiles`). |
| `instructorOrganization` | `string` | Không | `instructor_profiles.organization` | Đơn vị công tác của Giảng viên. |
| `instructorYearsOfExperience` | `number` | Không | `instructor_profiles.years_of_experience` | Số năm kinh nghiệm thực tế (`SMALLINT`). |
| `instructorExpertiseSummaryMd` | `string` | Không | `instructor_profiles.expertise_summary_md` | Tóm tắt thế mạnh chuyên môn định dạng Markdown. |
| `instructorSocialLinks` | `{ linkedin?: string; github?: string; website?: string }` | Không | `instructor_profiles.social_links` | Liên kết mạng xã hội chuyên môn (`JSONB`). |

**JSON Request mẫu (Tạo tài khoản Giảng viên mới):**
```json
{
  "email": "nam.hoang@3tacademy.vn",
  "password": "3T@Pass2026",
  "role": "INSTRUCTOR",
  "fullName": "TS. Hoàng Hải Nam",
  "instructorHeadline": "Chuyên gia Kiến trúc Cloud & Distributed Systems",
  "instructorOrganization": "3T Academy",
  "instructorYearsOfExperience": 9,
  "instructorExpertiseSummaryMd": "9 năm kinh nghiệm thiết kế hệ thống phân tán chịu tải cao.",
  "instructorSocialLinks": {
    "linkedin": "https://linkedin.com/in/hoanghainam",
    "github": "https://github.com/hoanghainam"
  }
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `201 Created` hoặc `200 OK`, `400 Bad Request` (Thiếu trường `NOT NULL`), `409 Conflict` (Trùng email).

```json
{
  "success": true,
  "data": {
    "success": true,
    "account": {
      "id": "acc-1762959600",
      "fullName": "TS. Hoàng Hải Nam",
      "email": "nam.hoang@3tacademy.vn",
      "roleCategory": "Giảng viên",
      "roleDetail": "Chuyên gia Kiến trúc Cloud & Distributed Systems",
      "cohortAssigned": "Chưa phân công lớp",
      "locked": false,
      "instructorHeadline": "Chuyên gia Kiến trúc Cloud & Distributed Systems",
      "instructorOrganization": "3T Academy",
      "instructorYearsOfExperience": 9
    }
  }
}
```

---

### API 8.6: Lấy Danh sách Giao dịch Biến động Số dư SePay (`getSepayTransactions`)
- **Tên API:** `adminApi.getSepayTransactions`
- **HTTP Method:** `GET`
- **Endpoint:** `/admin/sepay-transactions`
- **Nhóm chức năng:** Tuition Reconciliation & Finance Management
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`
- **Yêu cầu xác thực:** Bearer Token (`ADMIN`).

#### Response – Dữ liệu đầu ra (`PaymentTransactionRecord[]`)
- **HTTP Status Code:** `200 OK`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `id` | `string` | Có | ID giao dịch (`payment_transactions.id`). |
| `orderId` | `string \| null` | Có (Nullable) | ID đơn hàng khớp được (`payment_transactions.order_id`). Bằng `null` nếu khách chuyển khoản sai nội dung (`UNMATCHED_ORDER`). |
| `orderCode` | `string \| null` | Có (Nullable) | Mã đơn hàng tương ứng (VD: `"ET20268891"` hoặc `null`). |
| `gateway` | `'SEPAY_VIETQR'` | Có | Cổng thanh toán (`SEPAY_VIETQR`). |
| `amountVnd` | `number` | Có | Số tiền nhận được qua ngân hàng (VNĐ). |
| `transferContent` | `string` | Có | Nội dung chuyển khoản thực tế từ ngân hàng gửi về. |
| `referenceNumber` | `string` | Có | Mã tham chiếu giao dịch ngân hàng (`reference_number`). |
| `matchStatus` | `'MATCHED' \| 'UNMATCHED_ORDER' \| 'AMOUNT_MISMATCH'` | Có | Trạng thái đối soát tự động. |
| `processedAt` | `string` | Có | Thời điểm xử lý webhook. |

**JSON Response mẫu:**
```json
{
  "success": true,
  "data": [
    {
      "id": "tx-01",
      "orderId": "ord-8891",
      "orderCode": "ET20268891",
      "gateway": "SEPAY_VIETQR",
      "amountVnd": 8500000,
      "transferContent": "ET20268891 AI-ENG-2026-K01 Nguyen Van An",
      "referenceNumber": "MB-FT2631688910",
      "matchStatus": "MATCHED",
      "processedAt": "12/11/2026 · 14:22:05"
    },
    {
      "id": "tx-02",
      "orderId": null,
      "orderCode": null,
      "gateway": "SEPAY_VIETQR",
      "amountVnd": 8500000,
      "transferContent": "Chuyen khoan hoc phi khoa AI K01",
      "referenceNumber": "VCB-FT2631699201",
      "matchStatus": "UNMATCHED_ORDER",
      "processedAt": "12/11/2026 · 15:10:40"
    }
  ]
}
```

---

### API 8.7: Cấp Chứng chỉ Tốt nghiệp (Đơn lẻ hoặc Hàng loạt) & Cộng `+4` Credits Phỏng vấn (`issueCertificatesBatch`)
- **Tên API:** `adminApi.issueCertificatesBatch`
- **HTTP Method:** `POST`
- **Endpoint:** `/admin/certificates/issue`
- **Nhóm chức năng:** Certificate Management
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`ADMIN` hoặc hệ thống tự động khi học viên vượt qua kỳ thi tốt nghiệp cuối khóa).

#### Request – Dữ liệu đầu vào
| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `enrollmentIds` | `string[]` | Có | Danh sách `id` bản ghi ghi danh (`enrollments.id`) hoặc email học viên đủ điều kiện cấp chứng chỉ tốt nghiệp. |

**JSON Request mẫu:**
```json
{
  "enrollmentIds": ["grad-enr-02", "grad-enr-03"]
}
```

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK` hoặc `201 Created`.

| Tên trường | Kiểu dữ liệu | Bắt buộc | Ý nghĩa |
| :--- | :--- | :---: | :--- |
| `issuedCount` | `number` | Có | Số lượng chứng chỉ vừa được cấp. |
| `certificateCodes` | `string[]` | Có | Danh sách mã chứng chỉ vừa sinh (VD: `["CERT-3T-2026-8901", "CERT-3T-2026-8902"]`). |
| `issuedCertificates` | `Record<string, CertificateRecord>` | Không | Map các đối tượng `CertificateRecord` vừa được tạo. |
| `bonusInterviewCreditsAdded` | `number` | Có | Số lượt phỏng vấn AI cộng thưởng cho mỗi học viên tốt nghiệp (Mặc định: `4`). |

---

### API 8.8: Thu hồi hoặc Khôi phục Hiệu lực Chứng chỉ (`toggleCertificateRevoke`)
- **Tên API:** `adminApi.toggleCertificateRevoke`
- **HTTP Method:** `PUT`
- **Endpoint:** `/admin/certificates/:certificateCode/revoke`
- **Nhóm chức năng:** Certificate Management
- **Nơi sử dụng trên Frontend:** `src/views/AdminPortalView.tsx`, `src/context/AcademyContext.tsx`.
- **Yêu cầu xác thực:** Bearer Token (`ADMIN`).

#### Request – Dữ liệu đầu vào
- **Path Parameters:** `certificateCode` (`string`, bắt buộc, VD: `CERT-3T-2026-8891`).

#### Response – Dữ liệu đầu ra
- **HTTP Status Code:** `200 OK`.

```json
{
  "success": true,
  "data": {
    "certificateCode": "CERT-3T-2026-8891",
    "isRevoked": true,
    "certificate": {
      "certificateCode": "CERT-3T-2026-8891",
      "studentName": "Nguyễn Văn An",
      "studentEmail": "an.nguyen.dev@gmail.com",
      "courseTitle": "Kỹ Sư AI Thực Chiến: Xây Dựng Hệ Thống RAG & Đa Tác Tử Doanh Nghiệp",
      "cohortCode": "AI-ENG-2026-K01",
      "issuedAt": "12/11/2026",
      "verificationSignature": "3T-SHA256-VERIFIED-8891",
      "finalScore": 94,
      "proctoringIntegrity": "Đã xác thực hợp lệ 100% qua hệ thống giám thị AI",
      "isRevoked": true,
      "revokedReason": "Đang tạm khóa hiển thị theo yêu cầu kiểm tra từ Ban Đào Tạo.",
      "skillsMastered": [
        { "code": "HYBRID-RAG", "name": "Xây dựng Tìm kiếm Kết hợp (Hybrid RAG)", "score": 94 }
      ]
    }
  }
}
```

---

## 10. Tổng hợp Luồng Nghiệp vụ Liên kết Giữa các API (End-to-End Flows)

Để đội ngũ Backend dễ dàng kiểm thử tích hợp (Integration Testing), dưới đây là thứ tự gọi API thực tế trên Frontend theo 5 luồng nghiệp vụ cốt lõi:

### Luồng 1: Khởi động Ứng dụng & Khôi phục Phiên làm việc (`AcademyContext.tsx`)
1. Khi tải trang, `AcademyContext` gọi song song (`Promise.all`):
   - `GET /courses` (`catalogApi.getCourses`)
   - `GET /categories` (`catalogApi.getCategories`)
   - `GET /skills` (`catalogApi.getSkills`)
   - `GET /cohorts` (`catalogApi.getCohorts`)
   - `GET /certificates` (`catalogApi.getCertificates`)
   - `GET /teach/schedule` (`teachApi.getInstructorSchedule`)
   - `GET /auth/me` (`authApi.getMe`)
2. Nếu người dùng có vai trò `STUDENT`, `AcademyContext` gọi tiếp:
   - `GET /me/enrollments` (`learningApi.getMyEnrollments`)
   - `GET /orders/my-history` (`orderApi.getMyOrderHistory`)
   - `GET /me/dashboard` (`learningApi.getStudentDashboard`)

### Luồng 2: Đăng ký Khóa học & Thanh toán Chuyển khoản VietQR SePay (`VietQrCheckoutView.tsx`)
1. Học viên chọn đợt mở lớp tại `/courses/:slug` (`GET /courses/:slug`) và bấm **"Ghi danh ngay"** để vào `/checkout/:cohortCode`.
2. `VietQrCheckoutView` gọi `POST /orders` kèm `Idempotency-Key` để tạo đơn hàng `PENDING` và nhận mã VietQR (`orderCode`, `qrImageUrl`).
3. Khi giao dịch ngân hàng hoàn tất (hoặc bấm nút giả lập Webhook trên thanh Dev):
   - Gọi `POST /webhooks/sepay/simulate` (trên Production là Webhook thật từ SePay bắn về Backend).
   - Gọi `GET /orders/:orderCode` để xác nhận `status === 'PAID'`.
   - Gọi `GET /me/enrollments` để mở khóa quyền truy cập vào Không gian Lớp học `/app/cohorts/:cohortId`.

### Luồng 3: Học Video, Hỏi AI Tutor & Làm Bài kiểm tra Mở khóa Buổi học (`SessionVideoRoomView.tsx` -> `AssessmentRoomView.tsx` -> `AssessmentResultView.tsx`)
1. Học viên mở phòng học video: Gọi `GET /cohorts/:cohortId/sessions/:sessionId` và `GET /sessions/:sessionId/discussions`.
2. Trong khi xem video:
   - Tiến độ xem được gửi qua `PUT /sessions/:sessionId/progress`.
   - Khi hỏi Trợ giảng AI: Gọi `POST /ai/tutor/ask` -> Nhận câu trả lời kèm mảng `citations` (`jumpSec`) để bấm tua video tới đúng giây giảng viên giải thích.
   - Khi đăng câu hỏi thảo luận lớp học: Gọi `POST /sessions/:sessionId/discussions` kèm `videoTimestampSec` -> Gọi `GET /sessions/:sessionId/discussions` để làm mới danh sách.
3. Để hoàn thành buổi học, học viên bấm làm bài kiểm tra 10 câu:
   - Mở `/app/assessments/quiz-:sessionId` -> Gọi `GET /assessments/:assessmentId` (nhận đề đã ẩn đáp án).
   - Bấm **"Nộp bài"** -> Gọi `POST /assessments/:assessmentId/submit` -> Chấm điểm tức thì 0 giây, cập nhật `student_skill_states.mastery_score` (`0–100`) và mở khóa hoàn thành buổi học nếu đạt `>= 7.0/10`.
   - Chuyển sang `/app/assessments/:assessmentId/results` -> Gọi `GET /assessments/:assessmentId/result` để xem giải thích chi tiết và bấm tua lại đúng đoạn video của các câu làm sai.

### Luồng 4: Thi Tốt nghiệp Cuối khóa 25 câu (Có Camera Giám sát) & Nhận Chứng chỉ + 4 Credits Phỏng vấn (`ProctoredExamRoomView.tsx`)
1. Học viên vào `/app/exams/:assessmentId` -> Gọi `GET /assessments/:assessmentId`. Nếu `isRetakeLocked === true` (đã thi đỗ trước đó), giao diện khóa làm bài lại.
2. Trong quá trình làm bài với Webcam bật: Các sự kiện giám sát được gửi về `POST /assessments/:assessmentId/proctoring-events`.
3. Khi nộp bài thi cuối khóa: Gọi `POST /assessments/:assessmentId/submit`. Nếu đạt `>= 7.0/10` lần đầu tiên:
   - Cấp chứng chỉ tốt nghiệp (`POST /admin/certificates/issue` / tự động từ Backend).
   - Cộng `+4` lượt phỏng vấn AI vào `user_profiles.interview_credits`.
   - Khóa thi lại (`isRetakeLocked = true`).

### Luồng 5: Cập nhật Hồ sơ CV 6 Khối & Luyện Phỏng vấn Giọng nói 3 Chặng (`StudentProfileCvWorkspace.tsx` & `StudentVoiceInterviewWorkspace.tsx`)
1. Tại `/app/profile-cv`:
   - Gọi `GET /me/profile-skills` để nạp Hồ sơ CV 6 khối và Bản đồ kỹ năng Radar (`0–100`).
   - Khi tải lên file PDF mới: Gọi `POST /me/cv/upload` với `mode: 'PARSE_PDF'` -> Hiển thị Popup Đối soát Thông minh (Smart Diff & Sync Modal, mặc định không tích ghi đè Họ tên thật).
   - Khi bấm xác nhận đồng bộ hoặc lưu chỉnh sửa: Gọi `POST /me/cv/upload` với `mode: 'SAVE_RESUME'`.
2. Tại `/app/mock-interview`:
   - **Vòng 1 (Không trừ Credit):** Gọi `POST /interviews/screen-cv` để chấm độ khớp CV với JD (`matchPercent`). Nếu `matchPercent >= 60%`, mở khóa nút vào Vòng 2.
   - **Vòng 2 (Phòng phỏng vấn giọng nói):** Gọi `POST /interviews/:interviewId/start`, sau đó mỗi lượt trả lời gửi qua `POST /interviews/:interviewId/turn`.
   - **Thoát giữa chừng:** Gọi `DELETE /interviews/:interviewId` -> Xóa phiên nháp, trừ `0` Credit.
   - **Hoàn tất Vòng 2 -> Chặng 3:** Gọi `POST /interviews/:interviewId/complete` -> Chính thức trừ `1` Credit, trả về `remainingCredits` và `evaluationReport` (`overallScore`, `projectDepthScore`, `communicationScore`, `strengths`, `improvements`).
