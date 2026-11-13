
# 03. Đặc Tả Chức Năng & Thiết Kế Giao Diện Frontend (SRS Frontend)

## PHẦN I: NGUYÊN TẮC THIẾT KẾ, BẢNG MÀU & PHÂN TÁCH KHÔNG GIAN LÀM VIỆC

### 1.1. Phong Cách Thiết Kế & Ngôn Ngữ Giao Diện
1. **Ngôn từ Tự nhiên, Gần gũi, Không "Mùi AI":**
   - Sử dụng câu chữ đời thường, thân thiện, khích lệ người học (sử dụng *"bạn"*, *"mình"*, *"nhé"*).
   - Giấu toàn bộ thuật ngữ kỹ thuật phức tạp (`pgvector`, `RRF`, `HMAC-SHA256`, `Idempotency`, `ZPD`) xuống tầng Backend; trên giao diện chỉ thể hiện bằng lợi ích thực tế, dễ hiểu.
2. **Nguyên tắc "1 Màn Hình – 1 Mục Tiêu Trọng Tâm":**
   - Khoảng cách lưới tối thiểu `24px`, khoảng đệm trong thẻ `20px–24px`, tối đa 3–4 khối thông tin chính trên một màn hình, tuyệt đối không nhồi nhét hay lặp lại các nút bấm cùng chức năng.
3. **Bảng màu Chủ đạo (Botanical Emerald — Hỗ trợ Chế độ Sáng & Tối):**
   - **Light Mode:** Nền chính `#F7FBF9` (trắng bạc hà dịu mắt), bề mặt thẻ `#FFFFFF`, viền mảnh `#E2ECE7`, màu nhấn chính `#10B981` (Xanh lá ngọc lục bảo).
   - **Dark Mode:** Nền chính `#090F0C`, bề mặt thẻ `#111A15`, màu nhấn chính `#34D399`.
   - **Dải màu trạng thái:** Xanh lá (`#10B981` - Hoàn thành / Đạt / Ổn định) ➔ Vàng cam (`#F59E0B` - Sắp đến hạn / Nhắc nhở nhẹ) ➔ Đỏ (`#EF4444` - Quá hạn / Đang LIVE / Cảnh báo vi phạm).
4. **Bộ Font chữ:** `Be Vietnam Pro` cho toàn bộ văn bản giao diện và `JetBrains Mono` cho mã lớp học (`AI-ENG-2026-K01`), mã đơn học phí (`ET20268891`), số tiền, đồng hồ đếm ngược và mốc thời gian video (`14:20`).

### 1.2. Quy Tắc Tách Biệt Tuyệt Đối Giữa 4 Không Gian Giao Diện (Layouts)
- **Website Công khai (Dành cho Khách & Học viên xem khóa học):** Có thanh Top Header ngang gồm: `Trang chủ`, `Khóa học`, `Về Học viện`, `Tư vấn lộ trình`, `Tra cứu chứng chỉ` và nút `Đăng nhập` / `Vào Góc Học Tập`.
- **Góc Học Tập Học Viên (`/app`):** Sử dụng Left Sidebar dành riêng cho Học viên.
- **Cổng Giảng Viên (`/teach`):** Sử dụng **Full-Height Left Sidebar cố định bên trái**, xóa bỏ hoàn toàn thanh Top Header ngang phía trên và xóa bỏ mọi đường dẫn nhảy sang Góc học tập của học viên.
- **Cổng Quản Trị Học Viện (`/admin`):** Sử dụng **Full-Height Left Sidebar quản trị cố định bên trái**, tách biệt hoàn toàn với trang học viên.

---

## PHẦN II: ĐẶC TẢ CHI TIẾT CÁC PHÂN HỆ & MÀN HÌNH

### PHÂN HỆ 1: WEBSITE CÔNG KHAI & ĐÓNG HỌC PHÍ VIETQR SEPAY

#### 1. Trang Chủ Học Viện (`/`)
- **Mục tiêu:** Giới thiệu ngắn gọn định vị Học viện và hiển thị ngay các đợt khai giảng đang mở đăng ký (không lặp lại nội dung giải thích dài dòng hay FAQ của trang *Về Học viện*).
- **Các khối hiển thị (4 khối gọn gàng):**
  1. **Khối Hero:** Tiêu đề *"Làm Chủ Kỹ Năng Công Nghệ Thực Chiến"*, mô tả ngắn gần gũi, ô tìm kiếm nhanh khóa học, nút *"Nhờ AI tư vấn lộ trình phù hợp"*, và các con số thực tế của Học viện (không có hộp "Vào lớp học thử" hay nhãn "Free Preview").
  2. **Khối "Các Đợt Khai Giảng Đang Mở Ghi Danh":** Lưới thẻ các lớp sắp mở (`K01`, `K02`...) hiển thị Tên khóa học, Mã lớp, Ngày khai giảng, Lịch học cố định hàng tuần, Giảng viên phụ trách, Số học viên đã đăng ký (`enrolled_count`), Học phí (VND) và nút *"Xem chi tiết & Ghi danh"*.
  3. **Khối Danh mục Đào tạo:** Các nhóm lĩnh vực đào tạo cốt lõi của Học viện.
  4. **Khối Đội ngũ Chuyên gia Giảng dạy:** Giới thiệu các Giảng viên thực chiến từ doanh nghiệp.

#### 2. Trang Về Học Viện & Câu Hỏi Thường Gặp (`/about`)
- **Mục tiêu:** Giải thích chi tiết phương pháp đào tạo khác biệt của 3T Academy bằng ngôn ngữ đời thường, cuốn hút và giải đáp mọi thắc mắc của người học.
- **Các khối hiển thị:**
  1. **4 Điểm Đắt Giá Khi Học Tại 3T Academy:**
     - *Học trực tiếp có lộ trình cùng Giảng viên, Trợ giảng và bạn cùng lớp.*
     - *Vào lớp muộn 15 phút? Bấm 1 nút là nắm bắt ngay tóm tắt bài giảng vừa qua.*
     - *Xem lại video đêm khuya, hỏi bài được Trợ giảng AI chỉ dẫn tận tay tới từng phút giây video và từng trang tài liệu.*
     - *Hoàn thành khóa học nhận Chứng chỉ tốt nghiệp và mở khóa Phòng Luyện Phỏng Vấn 1-1 bằng giọng nói theo đúng JD công ty bạn muốn ứng tuyển.*
  2. **Hành trình 5 bước từ lúc vào học đến khi tự tin đi phỏng vấn xin việc.**
  3. **Khu vực Câu Hỏi Thường Gặp (FAQ — Đặt độc quyền tại trang này):** Dạng Accordion đóng/mở giải đáp các câu hỏi thực tế về lịch học bận rộn, cách hỏi bài, đóng học phí QR 3 giây, điều kiện nhận chứng chỉ và luyện phỏng vấn.

#### 3. Trang Danh Mục & Tìm Kiếm Khóa Học (`/courses`)
- **Bố cục 2 cột:**
  - *Cột trái (Bộ lọc `280px`)*: Lọc theo Lĩnh vực, Độ khó (1–5), Kỹ năng đạt được (`Python`, `FastAPI`, `RAG & Vector Search`, `PostgreSQL & SQL`, `Docker`...) và công tắc *"Chỉ hiện khóa đang mở đợt học"*.
  - *Cột phải*: Thanh tìm kiếm từ khóa, bộ chọn sắp xếp và lưới thẻ khóa học.

#### 4. Trang Chi Tiết Khóa Học & Chọn Đợt Khai Giảng (`/courses/:slug`)
- **Cột trái (8 phần):**
  - Giới thiệu khóa học, Kỹ năng cần biết trước (`Prerequisites`) và Kỹ năng đạt được sau khóa học (`Learning Outcomes`).
  - Khung chương trình học (`Syllabus`) liệt kê rõ nội dung từng buổi học.
  - Danh sách các Đợt khai giảng (`Cohorts`) để học viên chọn (hiển thị rõ phiên bản đề cương, lịch học tối thứ mấy, giảng viên phụ trách, ngày mở cổng đăng ký và số bạn đã tham gia).
  - Đánh giá từ học viên các khóa trước.
- **Cột phải cố định (4 phần):** Thẻ tóm tắt đợt học đang chọn, học phí VND, cảnh báo lịch sự màu vàng cam nếu lịch của đợt học này trùng giờ với lớp khác mà học viên đang theo học, và nút **"Đăng ký Đợt học này"**.

#### 5. Trang Tư Vấn Lộ Trình Học (`/advisor`)
- Giao diện trò chuyện thân thiện cùng Trợ lý tư vấn của Học viện.
- Học viên chia sẻ nền tảng hiện tại và mục tiêu ➔ Trợ lý giải đáp và hiển thị trực tiếp **Thẻ Đợt Học** phù hợp kèm lịch khai giảng, học phí thực tế và nút bấm đăng ký ngay.

#### 6. Trang Đóng Học Phí Chuyển Khoản Ngân Hàng Tự Động VietQR SePay (`/checkout/:cohortCode`)
- **Bố cục 2 cột hiện đại, trực quan:**
  - *Cột trái (Thông tin đăng ký & Hướng dẫn)*: Tên khóa học, Mã lớp (`AI-ENG-2026-K01`), Lịch khai giảng, Email học viên, Tổng học phí (`8.500.000 ₫`), đồng hồ giữ đơn (`15:00`) và 3 bước hướng dẫn quét mã.
  - *Cột phải (Khung Mã QR Ngân hàng VietQR)*:
    - Hiển thị **Mã VietQR** sắc nét kèm Tên ngân hàng, Chủ tài khoản, Số tài khoản, Số tiền chính xác và **Nội dung chuyển khoản bắt buộc (Mã đơn `ET20268891` in nổi bật kèm nút Sao chép)**.
    - Trạng thái tự động lắng nghe xác nhận từ ngân hàng (`SePay Webhook`).
    - Ngay khi nhận được xác nhận chuyển khoản (trong 3 giây), màn hình tự động chuyển sang **Giao diện Chúc mừng Nhập học Thành công**: Hiển thị biên lai điện tử, nút *"Tải lịch học (.ics)"* và nút **"Vào Không Gian Lớp Học Ngay"**.

#### 7. Trang Tra Cứu Chứng Chỉ Công Khai (`/verify/:certificateCode`)
- Dành cho nhà tuyển dụng và học viên kiểm tra tính hợp lệ của chứng chỉ số qua mã chứng chỉ hoặc quét mã QR, hiển thị thông tin người nhận, khóa học hoàn thành, ngày cấp và nút tải bản PDF.

---

### PHÂN HỆ 2: ĐĂNG NHẬP & KHỞI TẠO HỒ SƠ (`/login`, `/register`, `/onboarding`)

1. **Đăng Nhập & Đăng Ký (`/login`, `/register`):**
   - Hỗ trợ Email + Mật khẩu (có thanh đo độ an toàn mật khẩu chuyển màu *Đỏ ➔ Vàng ➔ Xanh lá*) và nút **"Tiếp tục với Google"**.
2. **Khởi Tạo Hồ Sơ Ban Đầu (`/onboarding`):**
   - Thiết lập mục tiêu học tập, làm bài trắc nghiệm chẩn đoán nhanh (5 câu) để ghi nhận mức điểm tham khảo ban đầu, và chụp 1 ảnh khuôn mặt gốc qua Webcam để phục vụ đối chiếu khi thi cuối khóa.

---

### PHÂN HỆ 3: GÓC HỌC TẬP CỦA HỌC VIÊN (`/app`)
*(Menu Sidebar bên trái của Học viên gồm 7 mục tự nhiên: `Hôm nay học gì`, `Lớp đang theo học`, `Hồ sơ của tôi`, `Luyện phỏng vấn`, `Kỹ năng & Tiến độ`, `Hỏi đáp Trợ giảng AI`, `Chứng chỉ & Học phí`, `Tài khoản`).*

#### 1. Hôm Nay Học Gì — Bảng Điều Khiển Hàng Ngày (`/app`)
- Chỉ hiển thị đúng **3 khối thông tin thiết yếu**:
  1. **Banner Lớp học Trực tuyến hôm nay:** Hiện thông báo nổi bật nếu lớp đang trong giờ học trực tuyến (`ĐANG LIVE`) kèm nút **"Vào phòng học ngay"**, hoặc đồng hồ đếm ngược nếu sắp đến giờ học.
  2. **Khối Tiếp tục học tập & Chuỗi ngày học:** Thẻ buổi học đang xem dở (bấm để xem tiếp đúng giây dừng lại) kết hợp huy hiệu khích lệ chuỗi ngày học liên tiếp.
  3. **Khối Bài kiểm tra buổi học cần hoàn thành:** Danh sách các bài kiểm tra trắc nghiệm ngắn của các buổi học chưa hoàn tất.

#### 2. Lớp Đang Theo Học & Không Gian Lớp Học (`/app/learning` & `/app/cohorts/:cohortId`)
- Hiển thị thông tin lớp học, Giảng viên phụ trách, thanh tiến độ số buổi đã hoàn thành và chia làm **2 khu vực con gọn gàng**:
  1. **`Lộ trình Buổi học`**: Danh sách tuần tự từ Buổi 1 đến Buổi cuối. Thể hiện rõ nguyên tắc: **Mỗi buổi học được tích xanh "Đã hoàn thành" khi học viên vượt qua bài kiểm tra trắc nghiệm của buổi học đó**.
  2. **`Bài kiểm tra & Điểm số`**: Tổng hợp điểm các bài kiểm tra trắc nghiệm cuối mỗi buổi học và trạng thái mở khóa **Đề thi tốt nghiệp cuối khóa**.

#### 3. Phòng Học Video & Trợ Giảng AI Bám Sát Từng Giây (`/app/cohorts/:cohortId/sessions/:sessionId`)
- **Cột Trái (70% chiều rộng):**
  1. **Trình phát `<video>` HTML5 thật:** Có chọn tốc độ phát, phụ đề tiếng Việt, lớp chữ mờ bảo vệ bản quyền hiển thị email học viên, và hỗ trợ nhảy tới đúng giây (`video.currentTime = seconds`) khi bấm từ khung tương tác bên phải.
  2. **Thẻ Bài Kiểm Tra Mở Khóa Buổi Học (Đặt ngay dưới Video):** Nút nổi bật **"Làm bài kiểm tra 5 câu trắc nghiệm để hoàn thành buổi học"**.
  3. **Tóm tắt Trọng tâm Buổi học & Tài liệu Slide PDF đính kèm.**
- **Cột Phải (30% chiều rộng — 3 Tab gọn gàng):**
  1. **Tab `Lời giảng`**: Nội dung lời thầy giảng theo từng mốc thời gian (`05:12`, `14:20`...). Bấm vào câu nào là video bên trái tua ngay tới giây đó.
  2. **Tab `Hỏi Trợ giảng AI`**: Khung hỏi bài trực tiếp. Câu trả lời của AI đính kèm các nút trích dẫn bấm được như **`[Xem đoạn 14:20 - 16:05]`** hoặc **`[Slide trang 12]`** để học viên bấm vào tua video ngay lập tức.
  3. **Tab `Thảo luận`**: Đặt câu hỏi tại giây video đang xem và xem các câu trả lời đã được Giảng viên/Trợ giảng xác nhận.

#### 4. Phòng Làm Bài Kiểm Tra Trắc Nghiệm (A, B, C, D) & Trang Kết Quả Tức Thì (`/app/assessments/:assessmentId`)
- **Chuẩn hóa 100% Trắc nghiệm 4 lựa chọn (A, B, C, D):**
  - Giao diện làm bài sạch sẽ với đồng hồ đếm ngược chuyển màu (*Xanh lá ➔ Vàng ➔ Đỏ*) và bảng danh sách câu hỏi bên phải.
  - Học viên chỉ cần chọn 1 đáp án đúng (A, B, C hoặc D) cho từng câu rồi bấm **"Nộp bài"**.
- **Chấm điểm tức thì (0 giây chờ đợi) & Chỉ dẫn đoạn video cần ôn lại:**
  - Ngay khi bấm nộp bài, hiển thị điểm số ngay lập tức. Nếu đạt $\ge 70\%$, tự động tích xanh hoàn thành buổi học đó.
  - Tự động cập nhật điểm kỹ năng tương ứng vào trang `Kỹ năng & Tiến độ`.
  - **Với câu chọn sai:** Hiển thị đáp án đúng, lời giải thích chi tiết và nút bấm **`[Mở xem lại đoạn video phút 14:20 - 16:05]`** để học viên ôn lại đúng chỗ chưa vững.

#### 5. Phòng Thi Cuối Khóa Có Camera Giám Sát (`/app/exams/:assessmentId`)
- **Bước 1 (Trước giờ thi):** Bật Webcam thật trên trình duyệt, chụp ảnh đối chiếu với ảnh khuôn mặt trong hồ sơ và xác nhận vào phòng thi toàn màn hình.
- **Bước 2 (Làm bài thi 20 câu Trắc nghiệm A, B, C, D):** Học viên dùng chuột chọn đáp án trắc nghiệm, góc màn hình hiển thị khung Camera nhỏ với 3 trạng thái lịch sự (*Xanh lá: Ổn định*, *Vàng: Nhắc nhở hướng mắt về màn hình*, *Đỏ: Cảnh báo rời màn hình hoặc có nhiều người*).
- Khi hoàn thành kỳ thi và đạt yêu cầu: Mở khóa Chứng chỉ tốt nghiệp và **tự động cộng thêm `4 Credits` vào mục `Luyện phỏng vấn`**.

#### 6. Trang Hồ Sơ Của Tôi — Bố Cục Tờ CV/Resume Sang Trọng (`/app/profile-cv`)
- **Thiết kế tinh gọn, không nhồi nhét:**
  - Xóa bỏ hoàn toàn các bước rườm rà, xóa bỏ nút chuyển sang phòng phỏng vấn thừa thãi và chỉ giữ **đúng 1 nút "Tải lên / Cập nhật CV (PDF)" duy nhất** trên thanh thao tác phía trên (cùng nút *"Chỉnh sửa thông tin"*).
  - **Hiển thị dữ liệu trích xuất từ CV theo đúng bố cục một bản Resume chuyên nghiệp (Paper-style Resume):**
    1. *Phần Đầu (Header)*: Họ và tên, Vị trí hiện tại, Email, Số điện thoại, Liên kết GitHub/LinkedIn và **Mục tiêu nghề nghiệp (Career Objective)** do học viên viết bằng văn bản.
    2. *Mục Kỹ năng & Công nghệ*: Các thẻ kỹ năng trích xuất từ CV.
    3. *Mục Kinh nghiệm & Dự án đã thực hiện*: Tên dự án, thời gian, vai trò và mô tả chi tiết.
    4. *Mục Học vấn & Chứng chỉ*.

#### 7. Trang Luyện Phỏng Vấn — Quy Trình Tuyển Dụng 2 Vòng (`/app/mock-interview`)
- **Cơ chế kiểm soát bằng `Interview Credits` công bằng:**
  - Nếu học viên có `0 Credit` (chưa hoàn thành khóa học): Hiển thị màn hình khóa lịch sự, hướng dẫn hoàn thành khóa học để nhận `4 Credits`.
  - Nếu học viên đã có `Credit (> 0)`: Mở khóa quy trình 2 vòng. **Ở Vòng 1 (Duyệt CV & JD) chưa trừ Credit** (học viên có thể thoát ra sửa CV rồi vào kiểm tra lại thoải mái); **chỉ khi hoàn thành Vòng 2 (Phỏng vấn giọng nói) mới trừ `1 Credit`**.
- **VÒNG 1 — Duyệt Hồ Sơ CV & Đối Chiếu JD Mục Tiêu (CV Screening Gate):**
  - Tự động kết nối với bản CV hiện tại trong mục `Hồ sơ của tôi` (không bắt tải lại file CV, chỉ hiển thị dòng nhắc kiểm tra xem đã là bản CV mới nhất chưa kèm nút qua trang Hồ sơ nếu muốn cập nhật).
  - Học viên chọn **Cấp bậc ứng tuyển (`Intern` | `Fresher` | `Junior` | `Middle/Senior`)** và dán/tải lên **Tờ JD của công ty muốn nộp đơn** rồi bấm **"Kiểm tra Hồ sơ CV với JD này"**.
  - Hiển thị **Bảng Thẩm Định Vòng Hồ Sơ (3 phần rõ ràng)**:
    1. *Độ khớp giữa CV và JD (`Match Score`)*: Đánh giá xem CV hiện tại đã đủ sức vượt qua vòng lọc hồ sơ của JD này chưa.
    2. *Kiểm tra kiến thức khóa học đã tốt nghiệp*: Nhắc nhở ngay nếu học viên đã học xong khóa học tại 3T Academy nhưng quên chưa bổ sung kỹ năng/dự án của khóa học đó vào CV (kèm gợi ý câu chữ ngắn gọn để học viên tự thêm vào CV).
    3. *Nhận xét cách trình bày CV & Khoảng cách với JD*: Góp ý về bố cục trình bày CV (độ thoáng, căn lề, thứ tự mục) và chỉ ra những yêu cầu trong JD mà CV đang thiếu.
  - Khi hồ sơ đạt yêu cầu, học viên bấm nút **"Vượt qua vòng CV — Bước vào Phòng Phỏng Vấn (Vòng 2)"**.
- **VÒNG 2 — Phòng Phỏng Vấn Trực Tiếp Bằng Giọng Nói:**
  - Giao diện đàm thoại 1-1 bằng giọng nói: Người phỏng vấn AI phát giọng nói đặt câu hỏi tự nhiên (phát âm chuẩn cả tiếng Việt lẫn thuật ngữ tiếng Anh chuyên ngành), học viên bấm Mic trả lời bằng giọng nói (kèm khung phụ đề trực tiếp bên cạnh).
  - Nội dung hỏi xoáy sâu vào **các dự án ghi trong CV của học viên** và **tình huống thực tế theo tờ JD công ty** ở đúng cấp bậc đã chọn.
- **KẾT QUẢ — Báo Cáo Đánh Giá Sau Phỏng Vấn (Trừ `1 Credit`):**
  - Chấm điểm mức độ phù hợp với vị trí ứng tuyển, nhận xét chi tiết từng câu trả lời của học viên và gợi ý cách trả lời chuẩn mực.

#### 8. Trang Kỹ Năng & Tiến Độ (`/app/progress`)
- Trình bày trung thực, tách bạch làm **2 khu vực rõ ràng**:
  1. **Khu vực 1 — Kỹ năng đào tạo tại Học viện (`Python`, `Pandas`, `FastAPI`, `PostgreSQL & SQL`, `RAG & Vector Search`, `AI Agents`, `Fine-tuning`, `Redis`, `Docker`, `ReactJS`, `AWS`):**
     - Hiển thị thanh mức độ từ `0` đến `100` tính từ tỷ lệ trả lời đúng các câu hỏi kiểm tra của từng kỹ năng trong Học viện.
     - Kèm ghi chú rõ ràng: *"Điểm số này phản ánh mức độ nắm bắt bài học theo tiêu chuẩn nội bộ của 3T Academy (mang tính chất tham khảo quá trình học tập)."*
  2. **Khu vực 2 — Kỹ năng & Công nghệ khác ghi nhận từ CV của bạn:**
     - Hiển thị dưới dạng các thẻ thông tin gọn gàng cho những kỹ năng bên ngoài có trong CV (ví dụ: `Golang`, `C++`, `Git & Linux`, `TOEIC 800`...) mà không chấm điểm `%` khống.

---

### PHÂN HỆ 4: PHÒNG HỌC TRỰC TUYẾN LIVESTREAM & KHÁCH MỜI (`/live`)

1. **Phòng Học Trực Tuyến (`/live/:sessionId`):**
   - Giao diện nền tối tập trung: Sân khấu chính chiếu màn hình chia sẻ bài giảng và camera; thanh điều khiển dưới cùng (Mic, Camera, Chia sẻ màn hình, Giơ tay, Biểu tượng cảm xúc, Rời phòng).
   - Khung tương tác bên phải (3 Tab): `Trò chuyện`, `Hỏi đáp có bình chọn`, và `Tóm tắt bài giảng` (có nút **"Tóm tắt nhanh 10 phút vừa qua"** dành cho học viên vào lớp muộn).
2. **Cổng Tham Gia Nhanh Cho Diễn Giả Khách Mời (`/live/guest?token=...`):**
   - Chuyên gia khách mời bấm vào đường link mời 1 chạm của Giảng viên, nhập tên hiển thị và kiểm tra Camera/Mic là vào thẳng phòng giao lưu cùng lớp mà không cần tạo tài khoản.

---

### PHÂN HỆ 5: CỔNG GIẢNG VIÊN (`/teach`)
*(Giao diện Quản trị chuyên dụng chỉ có Left Sidebar 4 mục, không có Top Header thừa, không có nút nhảy sang Góc học tập của học viên).*

1. **`Lịch dạy hôm nay` (`/teach`):**
   - Hiển thị ca dạy sắp diễn ra với nút **"Bắt đầu buổi học trực tuyến"** và nút **"Tạo link mời Khách mời"**.
   - Danh sách học viên trong lớp đang chậm tiến độ (chưa làm bài kiểm tra các buổi trước) để kịp thời nhắc nhở.
2. **`Lớp đang phụ trách` (`/teach/cohorts` — Cấu trúc phân cấp 3 tầng rộng rãi):**
   - **Cấp 1 — Danh sách các lớp đang dạy (`Khóa K01`, `Khóa K02`...).**
   - **Cấp 2 — Khi bấm vào 1 Lớp cụ thể:** Hiển thị danh sách các buổi học của lớp đó (Buổi 1 ➔ Buổi N), Đề thi tốt nghiệp cuối khóa của lớp (trắc nghiệm A-B-C-D), và Bảng tiến độ điểm số của học viên trong lớp.
   - **Cấp 3 — Khi bấm vào 1 Buổi học cụ thể trong lớp:** Mở ra màn hình chi tiết rộng rãi của riêng buổi học đó (Giảng viên không tự ý đổi tên buổi học hay đổi lịch cố định của Học viện), gồm 3 phần:
     1. *Giảng dạy trực tuyến / Bản ghi buổi học*: Mở phòng Livestream nếu đến giờ dạy, hoặc xem bản ghi tự động từ buổi Livestream sau khi kết thúc.
     2. *Tài liệu & Tóm tắt buổi học*: Viết ghi chú tóm tắt trọng tâm và tải lên file Slide PDF / tài liệu cho buổi học.
     3. *Bài kiểm tra cuối buổi học (Trắc nghiệm A, B, C, D của riêng buổi này)*: Xem, chỉnh sửa bản nháp (`DRAFT`) hoặc bấm nút **"Tạo câu hỏi gợi ý từ nội dung buổi học này"** để AI soạn sẵn câu hỏi trắc nghiệm kèm đáp án đúng và giải thích, sau đó bấm **"Duyệt & Xuất bản đề (`PUBLISHED`)"**.
3. **`Hỏi đáp học viên` (`/teach/discussions`):**
   - Danh sách các câu hỏi thắc mắc của học viên gắn với từng buổi học để Giảng viên phản hồi và bấm xác nhận câu trả lời đúng.
4. **`Xem lại ca thi cuối khóa` (`/teach/proctoring`):**
   - Xem xét các bài thi cuối khóa có hình ảnh nhắc nhở từ Camera giám sát để quyết định công nhận kết quả hay yêu cầu thi lại.

---

### PHÂN HỆ 6: CỔNG QUẢN TRỊ HỌC VIỆN (`/admin`)
*(Giao diện Quản trị viên chuyên nghiệp chỉ có Left Sidebar 5 mục, tách biệt hoàn toàn với trang học viên).*

1. **`Tổng quan học viện` (`/admin`):**
   - 4 ô chỉ số vận hành cốt lõi (Tổng học viên đang học, Học phí thu trong tháng qua VietQR, Số lớp đang hoạt động, Số chứng chỉ đã cấp) + Biểu đồ tăng trưởng hàng tháng.
2. **`Chương trình đào tạo` (`/admin/courses`):**
   - Quản lý các Khóa học gốc, danh mục lĩnh vực, bộ từ điển Kỹ năng chuẩn (`skills`) và khung đề cương mẫu (`Syllabus`). Admin là người duy nhất có quyền thiết lập và chỉnh sửa tên/thứ tự các buổi học trong đề cương.
3. **`Mở lớp khai giảng` (`/admin/cohorts`):**
   - Mở các đợt học mới (`K01`, `K02`...) từ khóa học gốc: Thiết lập học phí, ngày mở đăng ký, ngày khai giảng, chọn **Lịch học cố định hàng tuần** (ví dụ: *Tối Thứ 3 & Thứ 7, 19:30 – 21:30*) và phân công **Giảng viên phụ trách (`instructor_id`)**.
   - Hỗ trợ **Cập nhật phiên bản đề cương theo năm học (`Phiên bản 2025` vs `Phiên bản 2026 mới`)**: Cho phép điều chỉnh đề cương buổi học riêng cho đợt mở lớp mới năm 2026 mà vẫn giữ nguyên vẹn đề cương của các đợt cũ năm 2025.
4. **`Học viên & Giảng viên` (`/admin/users`):**
   - Quản lý danh sách tài khoản toàn hệ thống, cấp tài khoản mới cho Giảng viên và khóa/mở khóa tài khoản.
5. **`Học phí & Chứng chỉ` (`/admin/finance`):**
   - Đối soát danh sách đơn đăng ký và lịch sử chuyển khoản ngân hàng tự động qua mã QR (`SePay VietQR`).
   - Duyệt cấp Chứng chỉ tốt nghiệp hàng loạt 1-Click cho những học viên đã hoàn thành khóa học và đạt kỳ thi cuối khóa.
