# EduTech AI Platform (v2)

> Nền tảng đào tạo công nghệ trực tuyến thế hệ mới theo mô hình Học viện Tổ chức (Live Cohort Academy), tích hợp hệ sinh thái AI đa phương thức: Hybrid RAG, Live Copilot, RecSys 2 tầng, AI Proctoring và AI Scheduler.

---

## 1. Cấu Trúc Monorepo

```text
edutech-ai-platform/
├── apps/
│   ├── api/             # Backend Core (Node.js 22 + TypeScript Strict + Express 5 + Drizzle ORM)
│   ├── ai-service/      # AI Core (Python 3.12 + FastAPI + ARQ Worker + ONNX + OR-Tools)
│   └── web/             # Frontend Client (React 18 + Vite + Tailwind + shadcn/ui + LiveKit)
├── infra/               # Cấu hình Nginx, Docker và Scripts vận hành
├── docs/                # Architecture Decision Records (ADR) & Tài liệu thiết kế
├── docker-compose.dev.yml
└── package.json         # Quản lý Workspaces
```

---

## 2. Khởi Động Nhanh (Local Development)

### Bước 1: Thiết lập biến môi trường
```bash
cp .env.example .env
```

### Bước 2: Khởi động Hạ tầng (PostgreSQL 16 `pgvector` + Redis 7)
```bash
# Khởi động database & cache bằng Docker Compose
npm run dev:infra
```

### Bước 3: Chạy toàn bộ hệ thống bằng Docker
```bash
npm run dev
```

Hoặc chạy từng ứng dụng độc lập:
* **API:** `npm run dev:api` (Port 4000)
* **AI Service:** Chạy với Python `uvicorn src.main:app --reload --port 8000` (Port 8000)
* **Frontend Web:** `npm run dev:web` (Port 3000)

---

## 3. Tài Liệu Tham Chiếu & Đặc Tả Thiết Kế

* **Đặc tả chức năng Frontend 30 trang:** Xem chi tiết tại `docs/` hoặc `frontend_functional_specifications.md`.
* **Lược đồ CSDL PostgreSQL 33 bảng:** `apps/api/src/db/schema/`.
* **Hợp đồng dữ liệu chung:** `apps/web/src/shared/types/contracts.ts`.
