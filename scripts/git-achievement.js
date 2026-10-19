/**
 * MyDiary GitHub 업적(Achievements) 연계 Git 자동화 하네스
 *
 * 지원 기능:
 * 1. 👥 Pair Extraordinaire: 협업자 환경변수(CO_AUTHOR) 설정 시 공동 저자 태그 자동 삽입
 * 2. ⚡ Quickdraw: 작업 브랜치 생성 -> PR 생성 -> 5분 이내 머지
 * 3. 🦈 Pull Shark: PR 머지 횟수 자동 누적
 * 4. 🤠 YOLO: 브랜치 보호 규칙 하에서 코드 리뷰 없이 즉시 머지
 *
 * 사용법:
 * - npm run git:pr -- "한국어 커밋 메시지"        (PR 생성 및 5분 내 머지 모드)
 * - npm run git:commit -- "한국어 커밋 메시지"    (main 직접 푸시 모드, CO_AUTHOR 지정 시 Co-author 자동 포함)
 */

const { execSync } = require('child_process');
const readline = require('readline');
const path = require('path');

function getAvailableRemotes() {
  try {
    const raw = execSync('git remote', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
    return raw ? raw.split(/\r?\n/).map(r => r.trim()).filter(Boolean) : [];
  } catch {
    return ['origin'];
  }
}

function getTargetRemote() {
  const remoteArgIndex = process.argv.indexOf('--remote');
  if (remoteArgIndex !== -1 && process.argv[remoteArgIndex + 1]) {
    return process.argv[remoteArgIndex + 1].trim();
  }
  if (process.env.GIT_REMOTE) {
    return process.env.GIT_REMOTE.trim();
  }

  // 지능형 자동 감지: origin과 upstream이 모두 있고, origin이 fork인 경우
  const remotes = getAvailableRemotes();
  if (remotes.includes('upstream') && remotes.includes('origin')) {
    try {
      const originUrl = execSync('git remote get-url origin', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
      const upstreamUrl = execSync('git remote get-url upstream', { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
      
      const originMatch = originUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
      const upstreamMatch = upstreamUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
      
      // 만약 upstream이 sbjwin(원작자)이고 origin이 다르면, upstream에 대한 push 권한을 우선 활용하도록 추천/폴백
      if (originMatch && upstreamMatch && originMatch[1] !== upstreamMatch[1]) {
        return 'upstream';
      }
    } catch {
      // 무시
    }
  }

  return remotes.includes('origin') ? 'origin' : (remotes[0] || 'origin');
}

function getRepoInfo(remoteName = getTargetRemote()) {
  const repoArgIndex = process.argv.indexOf('--repo');
  if (repoArgIndex !== -1 && process.argv[repoArgIndex + 1]) {
    const parts = process.argv[repoArgIndex + 1].trim().split('/');
    if (parts.length === 2) {
      return { owner: parts[0], name: parts[1] };
    }
  }
  if (process.env.TARGET_REPO) {
    const parts = process.env.TARGET_REPO.trim().split('/');
    if (parts.length === 2) {
      return { owner: parts[0], name: parts[1] };
    }
  }

  try {
    const remoteUrl = execSync(`git remote get-url ${remoteName}`, { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
    const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], name: match[2].replace(/\.git$/, '') };
    }
  } catch (e) {
    // 기본 폴백
  }
  return { owner: 'sbjwin', name: 'mydiary-desktop' };
}

const targetRemote = getTargetRemote();
const repoInfo = getRepoInfo(targetRemote);
const REPO_OWNER = repoInfo.owner;
const REPO_NAME = repoInfo.name;

const DEFAULT_CO_AUTHOR = 'Co-authored-by: zigman1234 <zigman1234@users.noreply.github.com>';

// 동적 협업자 설정 (기본값: zigman1234, CO_AUTHOR 환경변수로 오버라이드 또는 'none'으로 비활성화 가능)
function getCoAuthor() {
  const coArgIndex = process.argv.indexOf('--co');
  if (coArgIndex !== -1 && process.argv[coArgIndex + 1]) {
    const val = process.argv[coArgIndex + 1].trim();
    return val.startsWith('Co-authored-by:') ? val : `Co-authored-by: ${val}`;
  }
  if (process.argv.includes('--no-co')) {
    return null;
  }
  if (process.env.CO_AUTHOR === 'none' || process.env.CO_AUTHOR === 'false') {
    return null;
  }
  if (process.env.CO_AUTHOR) {
    return process.env.CO_AUTHOR.startsWith('Co-authored-by:')
      ? process.env.CO_AUTHOR
      : `Co-authored-by: ${process.env.CO_AUTHOR}`;
  }
  return DEFAULT_CO_AUTHOR;
}

// GitHub 인증 토큰 획득 (환경변수 또는 Git Credential Manager 안전 파이프라인 연동)
function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN.trim();
  }
  try {
    const cred = execSync('git credential fill', {
      cwd: path.resolve(__dirname, '..'),
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = cred.match(/password=(.+)/);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  } catch (e) {
    // 폴백: cmd /c echo 방식
    try {
      const cred = execSync('cmd /c "echo protocol=https^&echo host=github.com| git credential fill"', {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      });
      const match = cred.match(/password=(.+)/);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    } catch (e2) {
      // 무시
    }
  }
  return null;
}

function run(command, options = {}) {
  try {
    return execSync(command, {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
  } catch (error) {
    if (!options.ignoreError) {
      console.error(`\n❌ 명령어 실행 실패: ${command}`);
      throw error;
    }
    return '';
  }
}

function getCommitMessage() {
  const rawArgs = process.argv.slice(3);
  const filtered = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--co' || rawArgs[i] === '--remote' || rawArgs[i] === '--repo') {
      i++; // 스킵 옵션 값
      continue;
    }
    if (rawArgs[i].startsWith('--')) {
      continue;
    }
    filtered.push(rawArgs[i]);
  }
  let msg = filtered.join(' ').trim();
  if (!msg) {
    msg = 'chore: MyDiary 기능 업데이트 및 코드 품질 개선';
  }
  return msg;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createAndMergeViaAPI(token, targetOwner, targetName, branchName, title) {
  const headers = {
    'Authorization': `token ${token}`,
    'User-Agent': 'MyDiary-Achievement-Harness',
    'Accept': 'application/vnd.github+json'
  };

  const coAuthor = getCoAuthor();
  const prBody = coAuthor
    ? `### 🌟 GitHub PR (업적 달성 하네스)\n\n* **작업 내용**: ${title}\n* **협업자**: ${coAuthor}\n\n${coAuthor}`
    : `### 🌟 GitHub PR (업적 달성 하네스)\n\n* **작업 내용**: ${title}`;

  console.log(`🤖 GitHub API를 통해 PR을 자동 생성합니다 (${targetOwner}/${targetName})...`);
  const prRes = await fetch(`https://api.github.com/repos/${targetOwner}/${targetName}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title,
      head: branchName,
      base: 'main',
      body: prBody
    })
  });

  const prData = await prRes.json();
  if (!prRes.ok) {
    throw new Error(`PR 생성 실패: ${prData.message || JSON.stringify(prData)}`);
  }

  const prNumber = prData.number;
  console.log(`✅ PR #${prNumber} 생성 완료: ${prData.html_url}`);

  console.log('⚡ 5분 이내 머지를 트리거합니다 (Quickdraw & YOLO & Pull Shark 달성!)...');
  
  // GitHub 백엔드의 mergeable 비동기 계산 대기 및 재시도 루프 (최대 5회)
  let merged = false;
  let lastError = '';
  for (let attempt = 1; attempt <= 5; attempt++) {
    await sleep(attempt === 1 ? 1500 : 2000);
    console.log(`  [머지 시도 ${attempt}/5] PR #${prNumber} 병합 요청 중...`);

    const mergeRes = await fetch(`https://api.github.com/repos/${targetOwner}/${targetName}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        commit_title: `${title} (#${prNumber})`,
        commit_message: coAuthor ? `${coAuthor}` : '',
        merge_method: 'squash'
      })
    });

    const mergeData = await mergeRes.json();
    if (mergeRes.ok) {
      merged = true;
      console.log(`🎉 PR #${prNumber} 자동 머지 완료! (업적 달성 조건 만족: Quickdraw + YOLO + Pull Shark)`);
      break;
    } else {
      lastError = mergeData.message || JSON.stringify(mergeData);
      console.warn(`  ⚠️ 머지 재시도 대기 (${lastError})...`);
    }
  }

  if (!merged) {
    throw new Error(`PR 자동 머지 최종 실패: ${lastError}`);
  }
}

async function handlePRMode(commitMsg) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const branchName = `feat/achieve-${timestamp}`;

  const allowEmpty = process.argv.includes('--allow-empty');
  const targetRemote = process.env.GIT_REMOTE || (process.argv.includes('--remote') ? process.argv[process.argv.indexOf('--remote') + 1] : 'origin');

  console.log('\n======================================================');
  console.log('🏆 MyDiary 4대 뱃지 달성 PR 워크플로우를 시작합니다');
  console.log('   (Quickdraw + Pull Shark + Pair Extraordinaire + YOLO)');
  console.log('======================================================\n');

  // 1. 상태 확인
  const status = run('git status --porcelain', { silent: true });
  if (!status.trim() && !allowEmpty) {
    console.log('⚠️ 변경된 파일이 없습니다. 워크트리가 깨끗합니다.');
    console.log('💡 팁: 변경사항 없이 뱃지 누적을 테스트하려면 `--allow-empty` 옵션을 붙여 실행하세요.');
    console.log('   예: npm run git:pr -- --allow-empty "chore: GitHub 뱃지 하네스 트리거"');
    return;
  }

  // 현재 브랜치 기억
  const currentBranch = run('git rev-parse --abbrev-ref HEAD', { silent: true }).trim();

  // 2. 임시 브랜치 생성 및 체크아웃
  console.log(`📌 작업 브랜치 [${branchName}] 생성 및 전환...`);
  run(`git checkout -b ${branchName}`);

  let branchCreated = true;
  try {
    // 3. 파일 스테이징 및 Co-authored 커밋
    console.log('📝 커밋 작성 (Co-author 포함)...');
    const coAuthor = getCoAuthor();
    if (status.trim()) {
      run('git add -A');
      if (coAuthor) {
        run(`git commit -m "${commitMsg}" -m "${coAuthor}"`);
      } else {
        run(`git commit -m "${commitMsg}"`);
      }
    } else if (allowEmpty) {
      if (coAuthor) {
        run(`git commit --allow-empty -m "${commitMsg}" -m "${coAuthor}"`);
      } else {
        run(`git commit --allow-empty -m "${commitMsg}"`);
      }
    }

    // 4. 원격 브랜치 푸시
    console.log(`🚀 원격 저장소 [${targetRemote}]에 [${branchName}] 브랜치 푸시...`);
    run(`git push -u ${targetRemote} ${branchName}`);

    const token = getGitHubToken();
    const compareUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/compare/main...${branchName}?expand=1`;

    let apiSuccess = false;
    if (token) {
      try {
        await createAndMergeViaAPI(token, REPO_OWNER, REPO_NAME, branchName, commitMsg);
        apiSuccess = true;
      } catch (err) {
        console.warn(`⚠️ API 자동 머지 중 알림 (${err.message}). 웹 브라우저 방식으로 대체합니다.`);
        await openBrowserAndPrompt(compareUrl);
      }
    } else {
      await openBrowserAndPrompt(compareUrl);
    }
  } catch (err) {
    console.error(`\n❌ [오류 발생] 워크플로우 진행 중 문제가 발생했습니다: ${err.message}`);
    throw err;
  } finally {
    // 5. 로컬 브랜치 안전 복귀 및 임시 브랜치 정리 (무조건 실행)
    console.log('\n🔄 로컬 브랜치 복귀 및 원격 동기화...');
    run(`git checkout ${currentBranch}`, { ignoreError: true });
    run(`git pull ${targetRemote} ${currentBranch}`, { ignoreError: true });
    run(`git branch -D ${branchName}`, { ignoreError: true });
    run(`git push ${targetRemote} --delete ${branchName}`, { ignoreError: true, silent: true });
  }

  console.log('\n✨ 모든 업적 연계 커밋 및 머지가 완벽하게 완료되었습니다! 🏆\n');
}

function openBrowserAndPrompt(compareUrl) {
  return new Promise((resolve) => {
    console.log('\n🌐 GitHub PR 생성 페이지를 엽니다:');
    console.log(`   ${compareUrl}\n`);

    // Windows 브라우저 자동 열기
    try {
      execSync(`cmd /c start "" "${compareUrl}"`);
    } catch {
      // 무시
    }

    console.log('------------------------------------------------------');
    console.log('👉 [안내] 브라우저에서 아래 2단계를 5분 안에 완료하세요:');
    console.log('   1. 녹색 [Create pull request] 버튼 클릭');
    console.log('   2. 녹색 [Merge pull request] ➔ [Confirm merge] 클릭');
    console.log('   (⚡ 5분 이내 머지 시 Quickdraw + YOLO + Pull Shark 동시 달성!)');
    console.log('------------------------------------------------------');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('\n머지를 완료하셨으면 [Enter] 키를 눌러주세요: ', () => {
      rl.close();
      resolve();
    });
  });
}

function handleDirectMode(commitMsg) {
  const coAuthor = getCoAuthor();
  const targetRemote = process.env.GIT_REMOTE || (process.argv.includes('--remote') ? process.argv[process.argv.indexOf('--remote') + 1] : 'origin');
  const allowEmpty = process.argv.includes('--allow-empty');

  console.log('\n======================================================');
  console.log(coAuthor ? `👥 Co-author (${coAuthor}) 포함 직커밋을 실행합니다` : '🚀 메인 브랜치 직커밋을 실행합니다');
  console.log('======================================================\n');

  const status = run('git status --porcelain', { silent: true });
  if (!status.trim() && !allowEmpty) {
    console.log('⚠️ 변경된 파일이 없습니다. 워크트리가 깨끗합니다.');
    return;
  }

  if (status.trim()) {
    run('git add -A');
    if (coAuthor) {
      run(`git commit -m "${commitMsg}" -m "${coAuthor}"`);
    } else {
      run(`git commit -m "${commitMsg}"`);
    }
  } else if (allowEmpty) {
    if (coAuthor) {
      run(`git commit --allow-empty -m "${commitMsg}" -m "${coAuthor}"`);
    } else {
      run(`git commit --allow-empty -m "${commitMsg}"`);
    }
  }

  const currentBranch = run('git rev-parse --abbrev-ref HEAD', { silent: true }).trim();
  run(`git push ${targetRemote} ${currentBranch}`);

  console.log(`\n✨ 직커밋이 원격 ${targetRemote}/${currentBranch}에 정상 반영되었습니다!\n`);
}

async function handleCheckMode() {
  console.log('\n======================================================');
  console.log('🔍 MyDiary GitHub 업적(Achievements) 하네스 진단 리포트');
  console.log('======================================================\n');

  // 1. Git 기본 환경 점검
  const userName = run('git config user.name', { silent: true }).trim();
  const userEmail = run('git config user.email', { silent: true }).trim();
  const currentBranch = run('git rev-parse --abbrev-ref HEAD', { silent: true }).trim();
  console.log('📌 [1/5] Git 로컬 환경:');
  console.log(`   - 작업자: ${userName} <${userEmail}>`);
  console.log(`   - 현재 브랜치: ${currentBranch}`);

  // 2. 원격 저장소 점검
  console.log('\n📌 [2/5] 원격 저장소(Remotes) 설정:');
  const remotes = run('git remote -v', { silent: true }).trim().split('\n');
  remotes.forEach(r => console.log(`   - ${r}`));
  console.log(`   - 감지된 타겟 저장소: ${REPO_OWNER}/${REPO_NAME}`);

  // 3. GitHub 토큰 및 권한 점검
  console.log('\n📌 [3/5] GitHub API 인증 상태:');
  const token = getGitHubToken();
  if (token) {
    console.log('   - 토큰 획득: ✅ 성공 (Git Credential Manager 연동)');
    try {
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'MyDiary-Achievement-Harness',
          'Accept': 'application/vnd.github+json'
        }
      });
      if (userRes.ok) {
        const u = await userRes.json();
        const scopes = userRes.headers.get('x-oauth-scopes') || '없음';
        console.log(`   - 인증 계정: ${u.login} (${u.name || '이름 없음'})`);
        console.log(`   - OAuth Scopes: ${scopes}`);
        const hasRepoScope = scopes.includes('repo');
        console.log(`   - repo 권한: ${hasRepoScope ? '✅ 보유 (PR 자동 생성 및 머지 가능)' : '⚠️ repo 권한 없음 (웹 UI 폴백)'}`);
      } else {
        console.log(`   - ⚠️ 사용자 정보 조회 실패: HTTP ${userRes.status}`);
      }

      // 타겟 저장소 권한 점검
      const repoRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'MyDiary-Achievement-Harness',
          'Accept': 'application/vnd.github+json'
        }
      });
      if (repoRes.ok) {
        const rData = await repoRes.json();
        console.log(`   - 타겟 저장소 (${rData.full_name}) 권한:`);
        console.log(`     Push: ${rData.permissions?.push ? '✅ 허용' : '❌ 불가'}, Pull: ${rData.permissions?.pull ? '✅ 허용' : '❌ 불가'}, Admin: ${rData.permissions?.admin ? '✅' : '❌'}`);
      }
    } catch (e) {
      console.log(`   - ⚠️ API 연결 오류: ${e.message}`);
    }
  } else {
    console.log('   - ⚠️ 토큰 미발견: PR 생성 시 브라우저 수동 확인 방식으로 동작합니다.');
  }

  // 4. 협업자(Co-author) 설정 점검
  console.log('\n📌 [4/5] Pair Extraordinaire (협업자) 설정:');
  const coAuthor = getCoAuthor();
  if (coAuthor) {
    console.log(`   - 현재 주입 협업자: ${coAuthor}`);
    console.log('   - Pair Extraordinaire 뱃지 달성: ✅ 자동 적용 준비 완료');
  } else {
    console.log('   - 협업자 미설정 (단독 작업 모드)');
  }

  // 5. 4대 뱃지 준비 상태 종합 요약
  console.log('\n📌 [5/5] GitHub 4대 업적 달성 준비 상태:');
  console.log('   ┌──────────────────────┬──────────────────────┬──────────────────────────────┐');
  console.log('   │ GitHub 업적 (뱃지)   │ 달성 조건            │ 하네스 준비 상태             │');
  console.log('   ├──────────────────────┼──────────────────────┼──────────────────────────────┤');
  console.log('   │ ⚡ Quickdraw         │ PR 생성 후 5분 내 머지│ ✅ 준비 완료 (API 2초 내 자동)│');
  console.log('   │ 🦈 Pull Shark        │ PR 머지 횟수 누적    │ ✅ 준비 완료 (1회당 1스택)   │');
  console.log('   │ 🤠 YOLO              │ 리뷰 없이 즉시 머지  │ ✅ 준비 완료 (자동 머지 지원)│');
  console.log('   │ 👥 Pair Extraordinaire│ Co-author 커밋 머지 │ ' + (coAuthor ? '✅ 준비 완료 (트레일러 포함)' : '⚠️ Co-author 미지정 (단독)') + '   │');
  console.log('   └──────────────────────┴──────────────────────┴──────────────────────────────┘');

  console.log('\n💡 사용 팁:');
  console.log('   1. PR 생성 및 4대 뱃지 자동 달성:');
  console.log('      npm run git:pr -- "한국어 커밋 메시지"');
  console.log('   2. 변경사항 없이 뱃지 누적만 트리거:');
  console.log('      npm run git:pr -- --allow-empty "chore: 뱃지 획득 트리거"');
  console.log('   3. 특정 협업자 지정:');
  console.log('      npm run git:pr -- --co "이름 <이메일>" "한국어 커밋 메시지"');
  console.log('   4. 단독 커밋 모드 (Co-author 비활성화):');
  console.log('      npm run git:pr -- --no-co "한국어 커밋 메시지"\n');
}

async function main() {
  const mode = process.argv[2] || 'pr';
  const commitMsg = getCommitMessage();

  if (mode === 'check' || mode === '--check' || mode === 'status') {
    await handleCheckMode();
  } else if (mode === 'direct') {
    handleDirectMode(commitMsg);
  } else {
    await handlePRMode(commitMsg);
  }
}

main().catch((err) => {
  console.error('\n❌ 에러 발생:', err.message);
  process.exit(1);
});

