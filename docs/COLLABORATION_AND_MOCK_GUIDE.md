# 🤝 MyDiary Desktop 공동개발 및 Mock 환경 가이드 (Collaboration & Mock Guide)

> **문서 목적**: 외부 클라우드(GCP) 계정이나 별도의 인증 키가 없는 공동개발자 및 오픈소스 기여자가 MyDiary Desktop 프로젝트를 클론받아 즉시 개발, 디버깅, UI/UX 검증을 수행할 수 있도록 **Zero-Config Mock(모의) 아키텍처와 협업 워크플로우**를 설명합니다.  
> **기준 버전**: v0.5.1  
> **최종 갱신일**: 2026-10-19  
> **프로젝트 책임자**: 성백진 (`Sung Baekjin` / `sbjwin4271@gmail.com`)

---

## 🧭 왜 Zero-Config Mock 환경이 필요한가?

MyDiary Desktop은 스마트폰 모바일 앱과의 호환을 위해 Google OAuth 2.0 PKCE 인증 및 Google Drive(`appDataFolder`) 연동을 지원합니다.
그러나 일반적인 오픈소스 협업 및 공동개발 시 다음과 같은 치명적인 병목이 발생합니다:

1. **보안 상의 키 비공개**: 실제 GCP OAuth Client ID 및 Secret은 `.env` 파일에 보관되며 `.gitignore`에 의해 Git에 절대 커밋되지 않습니다.
2. **높은 진입 장벽**: 공동개발자가 테스트를 위해 매번 GCP 콘솔에 가입하고 프로젝트 생성, OAuth 동의 화면 구성, 리디렉션 URI 설정을 해야 한다면 협업 효율이 급격히 저하됩니다.
3. **기능 차단 방어**: 키가 없다는 이유로 앱 구동이 중단되거나 로그인 버튼 클릭 시 에러가 발생하면 백업/복원 탭, 모바일 데이터 마이그레이션 UI 등을 전혀 개발하거나 테스트할 수 없습니다.

따라서 MyDiary Desktop은 **"키가 없어도 100% 동일한 사용자 경험으로 자동 폴백되는 Zero-Config Mock 하네스"**를 표준으로 채택했습니다.

---

## 🏛️ Mock 아키텍처 및 데이터 흐름

```mermaid
graph TD
    A[앱 실행: dev or dev:electron] --> B{GCP 키 존재 여부 확인}
    
    subgraph RealMode["1. 실제 운영/연동 모드 (GCP 키 보유)"]
        B -- "GOOGLE_CLIENT_ID 설정됨" --> C[Google OAuth 2.0 PKCE 루프백 서버 기동]
        C --> D[실제 accounts.google.com 브라우저 로그인]
        D --> E[실제 Google Drive API 통신 (appDataFolder)]
    end

    subgraph MockMode["2. Zero-Config Mock 모드 (GCP 키 부재 or 플래그 활성화)"]
        B -- "키 미설정 (공동개발자)" --> M[Mock 모드 자동 활성화]
        M --> F[가상 구글 계정 즉시 로그인 (홍길동 선생님)]
        M --> G[로컬 스토리지 기반 가상 Google Drive (@mydiary:mock_cloud_storage)]
        G --> H[지연 시간(600ms) 시뮬레이션 및 백업/복원 100% 정상 수행]
    end
```

---

## 🔧 핵심 구현 구성 요소

### 1. Electron 메인 프로세스 (`electron/main.js`)
- `isMockAuthEnabled`: GCP 키가 없거나 개발 모드(`isDevMode`)일 때 자동으로 가상 토큰과 프로필 반환.
- `google-auth-login` 및 `google-auth-refresh` 핸들러가 오류 대신 안정적인 Mock 인증 응답을 제공합니다.

### 2. 프론트엔드 서비스 (`src/services/GoogleDriveService.js`)
- **`isMockMode()`**: Vite 환경변수(`VITE_USE_MOCK_GOOGLE`), 인증 세션의 `isMock` 플래그, 또는 Electron API 부재 시 자동으로 Mock 상태 판별.
- **가상 Google Drive 스토리지 (`@mydiary:mock_cloud_storage`)**:
  - `uploadCloudBackup()`: 현재 DB의 전체 데이터를 JSON 직렬화하여 가상 스토리지에 저장.
  - `downloadCloudBackup()`: 가상 스토리지에서 백업 JSON을 불러와 `Database.importAllData()`로 로컬 DB에 복원.
- **원클릭 Seeder (`seedMockData()`)**:
  - 학생 4명(김민우, 이지은, 박도현, 최수아), 관찰 일지 4건, 주간계획 1건을 즉시 생성하여 로컬 DB 및 가상 클라우드에 동시 주입.

### 3. 사용자 인터페이스 (`src/components/BackupSettingTab.jsx`)
- Mock 모드일 때 클라우드 카드 헤더에 `[🛠️ Mock 개발 모드]` 배지 자동 노출.
- 카드 하단에 `[🧪 테스트용 샘플 데이터 생성]` 버튼 제공.

---

## 🚀 공동개발자를 위한 빠른 시작 가이드 (Quick Start)

### 1. 저장소 복제 및 패키지 설치
```bash
git clone https://github.com/sbjwin/mydiary-desktop.git
cd mydiary-desktop
npm install
```

### 2. 앱 실행 (Zero-Config)
```bash
# 옵션 A: 데스크톱 Electron 환경으로 실행 (권장)
npm run dev:electron

# 옵션 B: 빠른 웹 브라우저 화면 개발 (http://localhost:5173/)
npm run dev
```
> 💡 별도의 `.env` 파일 복사나 설정 없이 바로 실행할 수 있습니다.

### 3. 기능 검증 절차
1. 상단 탭에서 **[설정 및 백업]** ➔ **[데이터 백업/복원]** 선택.
2. 클라우드 연동 카드에서 **[구글 드라이브 연결 및 로그인]** 클릭 ➔ 즉시 가상 계정(`홍길동 선생님`)으로 로그인 완료 확인.
3. **[🧪 테스트용 샘플 데이터 생성]** 버튼 클릭 ➔ 학생 4명, 일지 4건이 즉시 채워지며 상단 통계 갱신 확인.
4. **[스마트폰 백업 복원]** 및 **[구글 드라이브 백업 저장]**을 번갈아 클릭하여 토스트 및 로딩 스피너 정상 작동 검증.

---

## 👥 Git 협업 및 4대 업적(Achievements) 하네스

본 프로젝트는 공동개발자 협업 시 GitHub 4대 업적 뱃지 달성을 지원하는 자동화 스크립트를 포함하고 있습니다:

| 스크립트 명령어 | 동작 모드 | 타겟 GitHub 뱃지 |
| :--- | :--- | :--- |
| `npm run git:check` | 5대 항목 진단 리포트 출력 (Git/토큰/원격권한/Co-author/뱃지상태) | 환경 진단 및 준비 점검 |
| `npm run git:commit -- "한국어 커밋 메시지"` | main 직접 커밋/푸시 | 단독 또는 선택적 Co-author 지정 커밋 |
| `npm run git:pr -- "한국어 커밋 메시지"` | 작업 브랜치 생성 ➔ PR ➔ 5초 내 자동 머지 | ⚡ **Quickdraw**, 🦈 **Pull Shark**, 🤠 **YOLO**, 👥 **Pair Extraordinaire** |
| `npm run git:pr -- --allow-empty "메시지"` | 변경사항 없이 뱃지 누적만 트리거 | 🦈 **Pull Shark** 스택 누적 & ⚡ **Quickdraw** |

### 🛠️ 유용한 CLI 플래그
* `--allow-empty`: 워크트리에 변경된 파일이 없어도 빈 커밋으로 PR 및 자동 머지 플로우를 즉시 실행합니다.
* `--co "이름 <이메일>"`: 커밋 및 PR에 특정 협업자를 동적으로 지정합니다. (기본값: `zigman1234`)
* `--no-co`: 협업자 태그를 제외하고 순수 단독 커밋으로 진행합니다.
* `--remote <remoteName>`: 타겟 원격 저장소(`origin`, `upstream` 등)를 명시적으로 지정합니다.

### ⚠️ 커밋 메시지 핵심 규칙
* **100% 한국어 작성 원칙**: `feat: ...`, `fix: ...` 태그 뒤의 본문 설명은 반드시 명확한 순수 한국어로 작성해야 합니다 (영문 커밋 메시지 금지).
* **협력자 태그 (Co-author)**: 실제로 페어 작업을 함께한 동료나 기여자가 있을 때 유연하게 지정하거나 기본 협업자 설정을 활용합니다.
