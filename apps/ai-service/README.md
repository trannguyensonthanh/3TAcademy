# EduTech AI Service (`apps/ai-service`)

Python FastAPI microservice for **3T Academy**, cleanly decoupled from `apps/api` to power:
- **Hybrid RAG Tutor & Public Advisor** (`pgvector` HNSW 1024-dim + PostgreSQL `tsvector` BM25 + Reciprocal Rank Fusion `k=60`)
- **Automated Grading & Session Quiz Generation** (`/api/v1/ai/grade`, `/api/v1/ai/generate-quiz`)
- **CV Parsing, CV vs JD Screening & 2-Round Voice Mock Interviews** (`/api/v1/ai/cv/parse`, `/api/v1/ai/interviews/screen-cv`, `/api/v1/ai/mock-interviews/round1-cv-defense`)
- **Exam Proctoring Vision & Future Audio/Research Models** (`Faster-Whisper`, CV/NLP pipelines)

## Local Development

```bash
pip install -e .
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```
