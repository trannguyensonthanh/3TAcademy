# EduTech AI Platform v2 (3T Academy)

> **Nền tảng Đào tạo Trực tuyến Thế hệ Mới theo mô hình Học viện Tổ chức (First-Party Live Cohort Academy)** — Tích hợp sâu hệ sinh thái Trí tuệ Nhân tạo Đa phương thức: **Hybrid RAG** (`pgvector` + `tsvector` + Reranker), **AI Live Copilot** (`LiveKit` + `Silero VAD` + `faster-whisper`), **Hệ Gợi Ý Nhận Thức Kỹ Năng 2 Tầng** (ZPD + Video Clips Ôn Tập), **Giám Sát Thi Computer Vision 2 Tầng** (`MediaPipe` + `YOLO11n/ArcFace ONNX`), **Code Lab & Inline Code Review**, và **AI Scheduler** (`Google OR-Tools CP-SAT`).

---

## 🧭 CHỈ MỤC TÀI LIỆU HỆ THỐNG (ĐỌC TRƯỚC KHI TRIỂN KHAI CODE)

Toàn bộ kiến trúc, quyết định nghiệp vụ, lược đồ CSDL 33 bảng, đặc tả chức năng 30+ trang Frontend, đặc tả API/AI và lộ trình triển khai đã được đóng gói đầy đủ trong thư mục [`docs/`](./docs/).

**Dành cho cả Developer và AI Coding Agent (Cursor, Antigravity, Claude, Gemini):** Trước khi viết bất kỳ tính năng nào, hãy đọc các tài liệu tương ứng dưới đây:

| STT | Tài liệu trong `docs/` | Nội dung cốt lõi | Khi nào cần đọc? |
| :-: | :--- | :--- | :--- |
| **01** | [**`docs/01-architecture-and-business-rules.md`**](./docs/01-architecture-and-business-rules.md) | Mô hình `Course` → `Cohort` → `ClassSession`, ma trận phân quyền 3 tầng (`STUDENT`, `INSTRUCTOR (STAFF\|GUEST)`, `ADMIN` & `INSTRUCTOR\|TA\|GUEST`), và **12 quyết định nghiệp vụ cốt lõi đã chốt**. | **Bắt buộc đọc đầu tiên** để hiểu đúng luồng nghiệp vụ và không code lệch mô hình. |
| **02** | [**`docs/02-database-schema-33-tables.md`**](./docs/02-database-schema-33-tables.md) | Sơ đồ ERD, thiết kế **33 bảng PostgreSQL 16 + `pgvector`** chia làm 6 miền nghiệp vụ, và **5 quy tắc truy vấn bảo mật bắt buộc**. *(File SQL DDL gốc nằm tại [`apps/api/src/db/migrations/0000_baseline_v2.sql`](./apps/api/src/db/migrations/0000_baseline_v2.sql))*. | Khi viết Drizzle Schema, Migration, Seed hoặc viết truy vấn SQL/ORM. |
| **03** | [**`docs/03-frontend-functional-specifications.md`**](./docs/03-frontend-functional-specifications.md) | **Đặc tả chức năng chi tiết (SRS) của toàn bộ 30+ trang** và 5 Global Widgets qua 6 phân hệ: Trang đó hiển thị dữ liệu gì, có nút bấm/chức năng gì, ràng buộc nghiệp vụ ra sao. | Khi xây dựng giao diện, chia component, nối API hoặc kiểm thử UX. |
| **04** | [**`docs/04-backend-and-ai-service-specifications.md`**](./docs/04-backend-and-ai-service-specifications.md) | Danh sách toàn bộ **REST/SSE Endpoints của Backend (`apps/api`)**, đặc tả **6 trụ cột AI (`apps/ai-service`)**, và **Bảng ánh xạ kế thừa thuật toán** từ kho dự án cũ (`d:\Lap_Trinh_ST\web\Dự_án_CNPM`). | Khi triển khai Backend Controllers/Services, BullMQ/ARQ Workers và các pipeline AI. |
| **05** | [**`docs/05-implementation-roadmap.md`**](./docs/05-implementation-roadmap.md) | Lộ trình triển khai từng bước từ **Milestone 0 đến Milestone 8** kèm tiêu chí nghiệm thu (Definition of Done) cho từng giai đoạn. | Khi lập kế hoạch làm việc tuần tự hoặc giao việc theo từng Milestone cho AI Agent. |
| **06** | [**`docs/06-google-ai-studio-prompts.md`**](./docs/06-google-ai-studio-prompts.md) | Bộ **Master Prompt + 9 Phase Prompts** hoàn chỉnh để đưa cho Google AI Studio / Lovable / AI Agent sinh giao diện Frontend chuẩn xác từng phân hệ. | Khi dùng AI tạo nhanh các màn hình Frontend theo từng Phase. |

---

## 🏗️ 1. Tóm Tắt Kiến Trúc & Công Nghệ (Tech Stack)

| Phân hệ | Thư mục | Công nghệ sử dụng | Cổng (Port) |
| :--- | :--- | :--- | :---: |
| **Frontend Web** | [`apps/web`](./apps/web) | React 18, TypeScript (`strict`), Vite 6, Tailwind CSS, shadcn/ui, TanStack Query v5, Zustand, `@livekit/components-react`, `hls.js`, `@monaco-editor/react`, Recharts | `3000` |
| **Backend Core API** | [`apps/api`](./apps/api) | Node.js 22, TypeScript (`strict`), Express 5, Drizzle ORM, `pg`, `ioredis`, BullMQ, `argon2`, `jsonwebtoken`, `zod`, `pino` | `4000` |
| **AI Service & Worker** | [`apps/ai-service`](./apps/ai-service) | Python 3.12, FastAPI, `asyncpg`, `arq` (Redis Worker), `google-genai` (Gemini) + `vLLM` (Qwen fallback), `fastembed`, `onnxruntime` (YOLO11n + ArcFace), `ortools` (CP-SAT), `langfuse` | `8000` |
| **Database** | Docker `postgres` | **PostgreSQL 16** tích hợp sẵn **`pgvector`** (`pgvector/pgvector:pg16`), `pgcrypto`, `citext`, `btree_gist` | `5432` |
| **Cache & Queue** | Docker `redis` | **Redis 7 Alpine** (Lưu trữ phiên Refresh Token, Rate Limit, hàng đợi công việc nền) | `6379` |
| **Reverse Proxy** | [`infra/nginx`](./infra/nginx) | Nginx hỗ trợ HTTP/1.1 Keepalive, WebSocket và SSE Streaming không đệm (`proxy_buffering off`) | `80` |

---

## 📁 2. Cấu Trúc Thư Mục Monorepo

```text
edutech-ai-platform/
├── docs/                                   # Toàn bộ 6 tài liệu kiến trúc & đặc tả chức năng (SRS)
│   ├── 01-architecture-and-business-rules.md
│   ├── 02-database-schema-33-tables.md
│   ├── 03-frontend-functional-specifications.md
│   ├── 04-backend-and-ai-service-specifications.md
│   ├── 05-implementation-roadmap.md
│   └── 06-google-ai-studio-prompts.md
├── apps/
│   ├── api/                                # Backend Core (Express 5 + TypeScript + Drizzle ORM)
│   │   ├── src/
│   │   │   ├── config/                     # env.ts (Zod), logger.ts (Pino), redis.ts
│   │   │   ├── db/
│   │   │   │   ├── migrations/0000_baseline_v2.sql  # Full DDL 33 bảng PostgreSQL 16 + pgvector
│   │   │   │   ├── schema/                 # Drizzle schemas chia theo 6 miền nghiệp vụ
│   │   │   │   ├── index.ts                # Pool kết nối PostgreSQL
│   │   │   │   └── seed.ts                 # Khởi tạo dữ liệu mẫu chuẩn
│   │   │   ├── middlewares/                # correlationId, auth (JWT/RBAC), validate (Zod), errorHandler
│   │   │   ├── integrations/               # aiService.client, livekit.service, vnpay.service
│   │   │   ├── modules/                    # auth, users, courses, cohorts, sessions, orders, assessments, code-sandbox, discussions, certificates, ai, admin
│   │   │   ├── app.ts                      # Khởi tạo Express App
│   │   │   └── server.ts                   # Entry point + Graceful Shutdown
│   ├── ai-service/                         # AI Engineering Core (FastAPI + Python 3.12)
│   │   ├── src/
│   │   │   ├── core/                       # config, logging, security (X-Internal-Key), db, observability, llm_gateway
│   │   │   ├── rag/                        # parser, chunker, embedder, retriever (Hybrid RRF), tutor_chain
│   │   │   ├── live_copilot/               # transcriber (VAD + Whisper), copilot (Catch-me-up), post_session
│   │   │   ├── proctoring_cv/              # detector_yolo, face_verify (ArcFace), risk_scorer
│   │   │   ├── scheduler_ai/               # nl_parser, solver (OR-Tools CP-SAT)
│   │   │   ├── worker/                     # tasks.py (ARQ background worker)
│   │   │   ├── api/routes/                 # code_runner, chat, ingest, copilot, proctor, schedule
│   │   │   └── main.py                     # FastAPI entry point
│   │   └── evals/                          # Bộ đánh giá chất lượng RAG tự động (Faithfulness, Relevancy, Recall)
│   └── web/                                # Frontend Client (React 18 + Vite + Tailwind + shadcn/ui)
│       ├── src/
│       │   ├── app/                        # router.tsx (Lazy routes), guards, layouts
│       │   ├── shared/
│       │   │   ├── types/contracts.ts      # Hợp đồng dữ liệu TypeScript khớp 100% với CSDL v2
│       │   │   ├── lib/                    # apiClient.ts (X-Request-ID), cn.ts
│       │   │   └── ui/                     # Các component nền tảng (Button, Card, Badge, Input...)
│       │   ├── features/                   # 19 module tính năng theo kiến trúc Feature-Sliced
│       │   └── pages/                      # Các trang gắn với Router
├── infra/nginx/                            # Cấu hình Reverse Proxy Nginx
├── docker-compose.dev.yml                  # Môi trường phát triển Local đầy đủ
└── package.json                            # Quản lý Workspaces & Scripts
```

---

## 🚀 3. Hướng Dẫn Khởi Động Nhanh (Local Development)

### Bước 1: Tạo tệp cấu hình môi trường
```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env
cp apps/ai-service/.env.example apps/ai-service/.env
```

### Bước 2: Khởi động PostgreSQL 16 (`pgvector`) & Redis 7 bằng Docker
```bash
npm run dev:infra
```

### Bước 3: Cài đặt thư viện & Khởi tạo Cơ sở dữ liệu
```bash
# Cài đặt dependencies cho toàn bộ workspaces (API + Web)
npm install

# Nạp dữ liệu hạt giống mặc định (Tài khoản Admin: admin@edutech.vn / Admin@2026!)
npm --prefix apps/api run db:seed
```

### Bước 4: Chạy các dịch vụ phát triển
- **Chạy Backend API (`:4000`):** `npm run dev:api`
- **Chạy Frontend Web (`:3000`):** `npm run dev:web`
- **Chạy AI Service (`:8000`):**
  ```bash
  cd apps/ai-service
  pip install -e .
  uvicorn src.main:app --reload --port 8000
  ```

---

## 🛡️ 4. Quy Tắc Bắt Buộc Khi Phát Triển (Guardrails Cho Developer & AI Agent)

1. **Giữ đúng mô hình Học viện Tổ chức (`Course` → `Cohort` → `ClassSession`):** Không tự ý thêm Giỏ hàng (Shopping Cart), Ví giảng viên hay chức năng cho phép Giảng viên tự đăng ký ngoài trang công khai.
2. **Dạy thay 1-Click tinh gọn:** Khi đổi người dạy một buổi học, chỉ cập nhật `class_sessions.host_instructor_id` (lưu người cũ vào `original_host_id` và lý do vào `substitution_reason`). Không tạo bảng hay luồng xin phép/phê duyệt nhiều bước.
3. **Bảo mật đề thi tuyệt đối:** Các API trả đề bài cho học viên (`STUDENT`) tuyệt đối không được `SELECT` hoặc trả về cột `assessment_items.grading_config`.
4. **Không gọi LLM trực tiếp từ trình duyệt:** Mọi tính năng AI đều phải đi qua `apps/api` → `apps/ai-service` (có xác thực `X-Internal-Key` và kiểm tra quyền `enrollments`).
5. **Đối chiếu dự án cũ an toàn:** Dự án cũ nằm tại `d:\Lap_Trinh_ST\web\Dự_án_CNPM` chỉ dùng để đọc tham khảo thuật toán theo hướng dẫn trong [`docs/04-backend-and-ai-service-specifications.md`](./docs/04-backend-and-ai-service-specifications.md). Tuyệt đối không sửa đổi dự án cũ và không copy-paste mã nguồn chưa chuẩn hóa kiểu dữ liệu sang dự án mới.
