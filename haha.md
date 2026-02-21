# Aura Personal Stylist 프로젝트 작동 원리

이 프로젝트는 AI를 활용하여 사용자의 체형(키, 몸무게)과 사진을 기반으로 맞춤형 스타일을 제안하는 서비스입니다.

## 1. 프론트엔드 (React + Vite)
- **사용자 입력**: 사용자는 자신의 키, 몸무게를 입력하고, 전신 사진을 업로드(또는 드래그)합니다.
- **상태 관리**: `useState`를 통해 입력값, 이미지 프리뷰, 로딩 상태 및 결과 텍스트를 관리합니다.
- **API 호출**: '스타일 분석 시작' 버튼을 누르면 `/api/analyze` 경로로POST 요청을 보냅니다. 이때 이미지는 Base64 형식으로 변환하여 함께 전송합니다.

## 2. 백엔드 (Cloudflare Pages Functions)
- **환경 변수**: `OPENAI_API_KEY`를 사용하여 OpenAI 서버와 통신합니다.
- **AI 모델 (GPT-4o)**:
    - **Vision 분석**: 업로드된 이미지가 있으면 GPT-4o 모델의 Vision 기능을 사용하여 사용자의 신체 특징과 스타일을 분석합니다.
    - **컨설팅 보고서**: 10년 경력의 스타일리스트 페르소나를 가진 GPT가 체형 분석, 상/하의 추천, 컬러 팔레트 등 구체적인 보고서를 작성합니다.
- **헤어스타일 제안 (진행 중)**: 이미지 업로드 시 OpenAI의 Image API를 호출하여 해당 사용자의 얼굴을 유지한 채 새로운 헤어스타일 9개를 제안하는 기능이 포함되어 있습니다.

## 3. 핵심 파일 요약
- `src/App.tsx`: 메인 UI 및 API 연동 로직
- `functions/api/analyze.ts`: OpenAI API를 처리하는 서버리스 함수 (API 엔드포인트)
- `src/index.css` & `src/App.css`: 현대적이고 프리미엄한 디자인을 위한 스타일 시트
- `package.json`: 프로젝트 의존성 관리 (React 19, Vite 7 등 사용)

## 4. 실행 방법
- 로컬 개발 서버: `npm run dev`
- 빌드: `npm run build`
- 배포: Cloudflare Pages를 통해 자동 배포 및 서버리스 함수 실행

현재 이 서비스는 **Aura**라는 브랜드명으로, AI가 개인의 고유한 측정값을 기반으로 최적의 핏을 찾아주는 미래형 스타일링 가이드를 지향하고 있습니다.

---

# 코드 검수 리포트 — Aura Personal Stylist

## 🔴 CRITICAL (즉시 조치 필요)

### 1. API 키 평문 노출 (.env)
`.env` 파일에 실제 API 키가 포함되어 있습니다.
```
VITE_OPENAI_API_KEY=sk-proj-...  ← 실제 키 노출
GEMINI_API_KEY=AIzaSy...         ← 실제 키 노출
```
- `.gitignore`에는 포함되어 있으나 외부 도구에서 읽힐 경우 키가 노출된 상태
- **지금 당장 OpenAI, Google Cloud 콘솔에서 해당 키를 폐기(revoke)하고 재발급** 필요
- `VITE_` 접두사 키는 클라이언트 번들에 포함될 위험이 있어 더욱 위험

### 2. 존재하지 않는 AI 모델명 (analyze.ts)
```ts
// Line 109
model: "gpt-5-mini"      // ❌ 존재하지 않는 모델

// Line 131
model: 'gpt-image-1.5'   // ❌ 존재하지 않는 모델 (gpt-image-1 또는 dall-e-2 사용)
```
현재 코드로는 모든 API 호출이 실패합니다.

---

## 🟠 HIGH (기능/보안 버그)

### 3. styleGoal이 백엔드에서 완전히 무시됨
`App.tsx`에서 `styleGoal`을 전송하지만 `analyze.ts`의 `RequestBody` 인터페이스와 프롬프트 어디에도 사용되지 않습니다.
```ts
// analyze.ts — RequestBody 인터페이스
interface RequestBody {
    height: string;
    weight: string;
    imageBase64?: string;
    // styleGoal 없음 ← 누락
}
```
핵심 기능인 스타일 목표가 AI에 전달되지 않으므로 결과의 개인화가 불가능합니다.

### 4. Null 안전성 미처리 (analyze.ts Line 13)
```ts
const mime = arr[0].match(/:(.*?);/)![1];  // ! 강제 단언
```
dataUrl이 잘못된 형식이면 런타임 에러가 발생합니다. 입력값 검증이 없습니다.

### 5. 서버사이드 입력 검증 부재
```ts
// 클라이언트에서만 검증 (App.tsx Line 38)
if (!height || !weight) { alert('...'); return }

// 백엔드는 존재 여부만 확인, 값의 유효성은 미검증
// height="-1", weight="99999" 같은 비정상값 통과
```
이미지 크기 제한도 없어 대형 Base64 이미지로 타임아웃/메모리 문제가 발생할 수 있습니다.

### 6. CORS 전체 허용 + Rate Limiting 없음
```ts
"Access-Control-Allow-Origin": "*"  // 모든 도메인에서 호출 가능
```
Rate limiting이 없어 OpenAI API 비용이 무한정 발생할 수 있습니다.

---

## 🟡 MEDIUM (코드 품질)

### 7. hairstyleError가 클라이언트에 전달되지 않음
```ts
// analyze.ts: 이미지 실패 시 아무것도 설정 안 함
if (hairstyleResponse.ok) { ... }
// hairstyleError 필드를 응답에 포함하지 않음

// App.tsx: 없는 필드를 체크
if (data.hairstyleError) { alert(`이미지 생성 오류: ${data.hairstyleError}`) }
```
에러 처리 코드가 동작하지 않습니다.

### 8. 불필요한 의존성 (package.json)
```json
"react-router-dom"      // App.tsx에서 미사용
"@types/react-router-dom" // 미사용
"openai"                // 프론트엔드에서 미사용 (fetch 직접 사용)
"react-icons"           // 아이콘 대신 텍스트('AI','TR','OP') 사용

// devDependencies로 이동해야 할 패키지
"@google/generative-ai" // gemini.js(CLI)에서만 사용
"dotenv"                // gemini.js(CLI)에서만 사용
```

### 9. gemini.js — 타입 안전성 없음
```js
// TypeScript 프로젝트인데 gemini.js는 .js 파일
} catch (error) {
    console.error('Error:', error.message);  // error 타입이 unknown
}
```

### 10. 재귀 방식의 readline 루프 (gemini.js)
```js
async function ask() {
    rl.question('> ', async (input) => {
        ask();  // 재귀 호출 — 장시간 실행 시 스택 깊이 문제
    });
}
```

---

## 🔵 LOW (UX / 개선 사항)

### 11. 동작하지 않는 UI 요소들
```tsx
<button className="nav__menu">Menu</button>  // 클릭해도 아무 반응 없음

<a href="#">Privacy</a>   // 데드 링크
<a href="#">Terms</a>     // 데드 링크
<a href="#">Support</a>   // 데드 링크
```

### 12. 단위 불일치
```tsx
// Hero 섹션 — 영미식
<div className="hero__dp--1">Height: 5'9"</div>

// 실제 폼 — 미터법
<input type="number" placeholder="예: 175" />  // cm 단위
```

### 13. 외부 이미지 의존
```tsx
src="https://lh3.googleusercontent.com/aida-public/..."
```
Google 서버의 임시 URL로 보이며 언제든 깨질 수 있습니다. 자체 에셋으로 교체 권장.

### 14. alert() 사용
```tsx
if (!height || !weight) { alert('키와 몸무게를 입력해주세요!'); return }
```
브라우저 기본 alert 대신 인라인 에러 메시지를 사용해야 합니다.

### 15. 결과 렌더링 — 마크다운 미지원
```tsx
{result.split('\n').map((line, i) => <p key={i}>{line}</p>)}
```
AI가 `**굵게**`, `## 헤더` 등 마크다운으로 응답하면 기호가 그대로 출력됩니다. `react-markdown` 도입 권장.

---

## 우선순위 요약

| 순위 | 항목 | 심각도 |
|------|------|--------|
| 1 | **API 키 즉시 폐기 및 재발급** | 🔴 Critical |
| 2 | **모델명 수정** (gpt-5-mini → 실존 모델) | 🔴 Critical |
| 3 | **styleGoal 백엔드 연결** | 🟠 High |
| 4 | **이미지 크기 제한 + 입력 검증 강화** | 🟠 High |
| 5 | **CORS 도메인 제한 + Rate limiting** | 🟠 High |
| 6 | 불필요한 패키지 정리 | 🟡 Medium |
| 7 | hairstyleError 전달 수정 | 🟡 Medium |
| 8 | 데드 링크 / 동작 없는 버튼 처리 | 🔵 Low |