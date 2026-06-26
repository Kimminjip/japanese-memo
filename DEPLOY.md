# 배포 가이드

## 프로젝트 구조

```
japanese-memo/
├── apps/
│   ├── web/        # React 프론트엔드 (Vite + TailwindCSS + shadcn/ui)
│   └── api/        # Express 백엔드 (TypeScript + Drizzle ORM)
└── packages/
    ├── db/              # Drizzle 스키마 + DB 연결
    ├── api-zod/         # Zod 검증 스키마 (OpenAPI 기반)
    └── api-client-react/ # React Query 훅 클라이언트
```

## 로컬 개발 환경

### 1. 환경 변수 설정

`apps/api/.env` 파일 생성:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/japanese_memo
PORT=3001
NODE_ENV=development
```

### 2. DB 마이그레이션

```bash
cd packages/db
pnpm db:push
```

### 3. 개발 서버 실행

```bash
pnpm dev  # 루트에서 실행 — API(3001)와 웹(5173) 동시 시작
```

---

## 유료 호스팅 배포 (권장 옵션)

### 옵션 A: Railway (백엔드 + DB)

1. [railway.app](https://railway.app) 에서 프로젝트 생성
2. PostgreSQL 서비스 추가
3. `apps/api` 폴더를 기준으로 배포
   - Build: `pnpm install && pnpm --filter api build`
   - Start: `node apps/api/dist/index.js`
4. 환경변수: `DATABASE_URL`, `PORT`, `NODE_ENV=production`

프론트엔드는 **Vercel** 또는 **Netlify**에 `apps/web` 배포:
- Build: `pnpm install && pnpm --filter web build`
- Output: `apps/web/dist`
- 환경변수: `VITE_API_URL` (백엔드 URL)

### 옵션 B: Render

- 백엔드: Web Service (apps/api)
- DB: PostgreSQL 서비스
- 프론트엔드: Static Site (apps/web/dist)

### 옵션 C: Fly.io

- Dockerfile 기반 배포 (별도 설정 필요)

---

## 참고

- API 포트: 3001 (개발), 환경변수 PORT (프로덕션)
- 프론트엔드 프록시: vite dev 시 `/api` → `localhost:3001`
- 프로덕션에서는 리버스 프록시(nginx 등) 또는 CORS 설정 필요
