# Ready_Ai Badge and Follow-Up Rules

## Duplicate Extension Guard

Ready_Ai must not run two active unpacked copies against ChatGPT. On this PC the duplicate ids observed were:

- Canonical repo extension: `deojggohikpfbhgdjbdogmkdgpkcighm`
- Older mirrored-path extension: `ajnolilmicdilijebljgchoodgajnfeg`

If both are enabled, each extension has its own isolated content world and background worker. They can both inject the same UI id, send `force_check`, process the same follow-up queue, and make Chrome freeze when multiple ChatGPT tabs are open.

Do not remove the page-level ownership guard in the content script. Duplicate Ready_Ai instances must yield before creating `#ready-ai-steering-host`, before running heavy status checks, and before processing follow-up queue messages.

Do not bump `READY_AI_CONTENT_VERSION` just to mark a build. That string is the background/content compatibility handshake. Bumping it while Chrome still has an older service worker alive causes repeated `chrome.scripting.executeScript` reinjection and can make multiple ChatGPT tabs freeze. Use `READY_AI_CONTENT_BUILD_VERSION` for build identity instead.

이 문서는 배지 상태 규칙과 후속 지시 규칙을 고정하기 위한 기준 문서다.
이 문서의 항목은 사용자 요청 없이 임의로 바꾸지 않는다.

## 1. 배지 상태 규칙

배지 상태는 후속 지시와 완전히 별개다.

### 고정 규칙
1. GPT가 답변 또는 이미지 생성 중이면 배지는 주황색이다.
2. GPT 답변이 끝나면 배지는 흰색이다.
3. 흰색 상태는 사용자가 페이지를 읽고 있다는 뜻이 아니라 아직 확인 전 완료 상태라는 뜻이다.
4. 흰색 상태는 사용자가 클릭하거나 스크롤하거나 메인 채팅 입력창에서 새 입력을 시작하면 연두색으로 바뀐다.
5. 연두색 상태는 대기/읽음/아무 질문 없음 상태다.
6. 후속 지시 입력 간격을 위한 별도 노란색 배지는 두지 않는다.
7. 후속 지시 대기열이 남아 있으면 크롬 탭 제목에서는 색 배지 바로 오른쪽에 붙는 압축 숫자로, 크롬 확장 뱃지에서는 일반 숫자로 남은 개수를 노출한다.
8. 후속 지시 기능 수정은 배지 상태 규칙을 건드리면 안 된다.

### 탭 제목 숫자 표시 기준
1. 크롬 탭 제목은 문자열만 표시할 수 있으므로 진짜 픽셀 겹침 대신 색 배지 바로 옆에 붙는 압축 숫자로 표현한다.
2. 숫자는 작은 위첨자나 대괄호 없이 일반 크기 숫자만 사용해서 가독성을 우선한다.
3. 색 배지 바로 오른쪽에 `N` 형태로 공백 없이 붙여서 최대한 짧고 선명하게 보이게 한다.

## 2. 후속 지시 규칙

### 런처 문구
- 제목: 후속 지시 열기
- 설명: 항상 열어둘 수 있는 후속 지시 패널

### 표시 규칙
1. `후속 지시 열기` 런처는 지원 사이트에서 상시 보여야 한다.
2. 런처 위치는 채팅 입력창 바로 위 기준으로 고정한다.
3. 대기 문구는 `대기중: N` 형식으로 표시한다.
4. `대기중: N`은 `후속 지시 열기` 또는 `후속 지시 닫기` 문구 바로 오른쪽 같은 줄에 붙는다.
5. 후속 지시 패널을 닫아도 `대기중: N` 표시는 계속 보여야 한다. 내부 대기열도 그대로 유지한다.
6. 패널이 열려 있으면 런처 제목은 `후속 지시 닫기`로 바뀌고, 닫혀 있으면 `후속 지시 열기`로 돌아가야 한다.
7. 카드와 런처는 입력창 바로 위에 고정되고, 대기 목록은 카드 위로만 늘어나야 한다.
8. 카드 열기와 닫기는 내부 대기열과 분리해서 동작한다.
9. GPT 답변 완료만으로 후속 지시 패널을 자동으로 열면 안 된다. 패널은 사용자가 런처를 눌렀을 때만 열린다.

### 입력 버튼 규칙
1. GPT가 답변 중이면 기본 버튼 텍스트는 `입력 대기`다.
2. GPT가 쉬고 있거나 답변이 끝난 상태면 기본 버튼 텍스트는 `Enter`다.
3. `입력 대기` 버튼을 눌렀을 때도 Enter 키와 동일하게 현재 입력을 후속 지시 대기열에 넣어야 한다.
4. 사용자가 입력한 후속 지시는 여러 개 대기열에 쌓을 수 있어야 한다.
5. GPT가 현재 아무 일도 하지 않는 초기 상태에서도 첫 후속 지시는 바로 전송될 수 있어야 한다.
6. 후속 지시는 한 번에 하나씩만 전송하고, 전송이 성공하면 대기열에서 자동으로 하나씩 사라져야 한다.
7. 후속 지시 전송이 시작되면 응답 시작 전까지는 다음 후속 지시가 바로 연속 전송되지 않도록 막아야 한다.
8. GPT 답변 완료 후 1초 뒤 대기열의 다음 후속 지시를 자동 전송한다.
9. 대기 목록과 대기 문구는 카드 내부가 아니라 카드 위 영역에 표시해서 카드 위치를 흔들지 않아야 한다.
10. 전송 버튼 탐지에 실패해도 주변 제출 버튼, form submit, Enter 전송을 순서대로 시도해야 한다.

### ChatGPT 다중 탭 감시 범위
1. ChatGPT 후속 지시 감시는 top frame 기준으로만 동작해야 한다.
2. ChatGPT iframe은 후속 지시 대기열 개수를 background에 보고하면 안 된다. iframe의 빈 큐가 top frame의 실제 대기열 개수를 0으로 덮어쓰면 안 된다.
3. background의 후속 지시 probe는 ChatGPT URL이면서 실제 대기열 개수가 남아 있는 탭만 대상으로 한다.
4. 큐가 없는 평상시에는 후속 지시 probe alarm을 꺼두어야 한다.
5. 여러 ChatGPT 탭이 열려 있어도 probe는 큐가 있는 탭 ID 중 한 번에 소수 탭만 순환 처리해야 한다. 모든 Chrome 탭이나 모든 iframe을 동시에 깨우는 방식으로 되돌리면 안 된다.
6. 새 채팅 분산 전송처럼 명시적으로 필요한 경우를 제외하고 ChatGPT content script를 all frames로 강제 재주입하면 안 된다.
7. `manifest.json`에는 기본 `content_scripts` 자동 주입을 두지 않는다. content script는 background가 활성 ChatGPT 탭 또는 큐가 있는 ChatGPT 탭에만 수동 주입한다.
8. service worker 시작 시 전체 탭을 훑어서 content script를 주입하는 `kickAllTabs`류 동작을 넣으면 안 된다. 시작/설치/초기화 시에는 활성 ChatGPT 탭만 가볍게 확인한다.
9. 큐도 없고 생성 중도 아닌 숨김 ChatGPT 탭은 짧은 주기 polling/keepalive 대상이 아니다. hidden idle 상태는 긴 주기로 유지한다.
10. 활성 ChatGPT 탭 주입은 사이트 설정 캐시가 늦게 로드되어도 동작해야 한다. ChatGPT 기본 URL은 fallback site로 처리한다.
11. popup 열기 또는 popup에서 후속 지시 전송/삭제를 누른 경우에는 background가 해당 대상 탭 하나만 content script 주입 보장할 수 있다. ChatGPT 대상은 항상 top frame만 확인한다.
12. background 후속 지시 probe는 대기열 확인과 정상 처리 요청만 해야 하며 `forceResume`을 보내면 안 된다. 강제 재개는 사용자가 `즉시 재개`를 직접 누른 경우에만 허용한다.
13. 후속 지시 대기열 전송은 탭당 한 번에 하나만 실행되어야 한다. content script 재주입이나 runtime 메시지 중복으로 같은 문구가 동시에 두 번 enqueue/send되면 안 된다.
14. popup/dashboard의 수동 강제 확인도 ChatGPT에서는 top frame만 확인해야 한다. 수동 버튼이라는 이유로 `allFrames: true`를 쓰면 안 된다.

## 3. 변경 금지 범위

다음 항목은 사용자 승인 없이 변경하지 않는다.

- 주황색 -> 흰색 -> 연두색 배지 흐름
- 흰색의 의미를 GPT 완료 외 다른 상태로 재해석하는 것
- 연두색의 의미를 대기/읽음/아무 질문 없음 외 다른 상태로 재해석하는 것
- `후속 지시 열기` / `항상 열어둘 수 있는 후속 지시 패널` 문구
- `입력 대기` / `Enter` 버튼 전환 규칙
- 다중 후속 지시 대기열과 자동 전송 흐름
- 사용자가 런처를 누르기 전에는 후속 지시 패널을 자동으로 열지 않는 것
- ChatGPT 후속 지시 감시를 top frame이 아닌 iframe/전체 프레임 기준으로 넓히는 것
- 큐가 없는 ChatGPT 탭이나 일반 Chrome 탭까지 후속 지시 probe 대상으로 포함하는 것
- `manifest.json`의 content script를 다시 `all_frames: true` 또는 `match_about_blank: true`로 되돌리는 것
- `manifest.json`에 ChatGPT 자동 주입용 `content_scripts` 블록을 다시 추가하는 것
- service worker 시작 때 모든 탭을 순회하며 content script를 주입하는 것
- popup 복구 경로를 이유로 전체 Chrome 탭 또는 모든 ChatGPT 탭을 주기적으로 순회하는 것
- background probe에서 `process_steering_queue_now`에 `forceResume`을 붙여 후속 대기를 강제로 깨는 것
- content script 재주입 시 기존 runtime listener가 같은 후속 지시를 다시 enqueue/send할 수 있게 두는 것
- popup/dashboard 강제 확인에서 ChatGPT 프레임 전체를 깨우는 것

## 4. 후속 지시 고급설정

### 기본 원칙
1. 고급설정은 기본 후속 지시 UI를 대체하지 않는다.
2. 고급설정은 사용자가 직접 ON/OFF하는 저장 설정이다.
3. 고급설정이 OFF이면 기존처럼 현재 대화에 후속 지시를 대기열로 보낸다.
4. 고급설정이 ON이면 후속 지시 패널을 더 세로로 길게 보여준다.

### 새 채팅 분산 전송
1. 고급설정 ON 상태에서 기본 전송 버튼은 현재 대화가 아니라 새 ChatGPT 채팅 탭으로 보낸다.
2. 새 채팅 탭 수는 1~8개 사이에서 저장한다.
3. 새 채팅 분산 전송은 ChatGPT에서만 지원한다.
4. 새 채팅 분산 전송은 텍스트 후속 지시만 지원한다.
5. 이미지가 포함된 후속 지시는 기존 현재 대화 전송 흐름을 사용한다.
