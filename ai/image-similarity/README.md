# LOST QUEST 이미지 유사도 PoC (독립 실행)

OpenCLIP으로 물품 사진을 임베딩해 코사인 유사도를 계산하는 **독립 PoC**입니다. LOST QUEST 백엔드·DB·매칭 코드와 연결되어 있지 않습니다. 설계는 [`docs/AI_IMAGE_SIMILARITY.md`](../../docs/AI_IMAGE_SIMILARITY.md)를 참고하세요.

- 모델: `ViT-B-32` / `laion2b_s34b_b79k` (Hugging Face `laion/CLIP-ViT-B-32-laion2B-s34B-b79K`, 커밋 `1a25a446…`, 가중치 SHA-256 고정)
- 실행 위치: `127.0.0.1`만 허용 (다른 주소로 실행하면 거부), 기본 포트 `8765`
- 사진은 메모리에서만 처리하고 디스크 저장·로그 기록·외부 전송을 하지 않습니다. 모델 가중치는 최초 1회 내려받은 뒤 오프라인으로 불러옵니다.

## 설치 (Windows, Python 3.14)

```powershell
cd ai\image-similarity
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe scripts\download_model.py   # 약 605MB, .cache\ 에 저장 (Git 제외)
```

## 실행·검증

```powershell
.venv\Scripts\python.exe run_server.py                 # 실제 모델 서버 (127.0.0.1:8765)
.venv\Scripts\python.exe -m pytest -q                  # 자동 테스트
.venv\Scripts\python.exe scripts\make_samples.py       # 합성 샘플 생성
.venv\Scripts\python.exe scripts\evaluate.py           # 동일/유사/무관 쌍 비교
.venv\Scripts\python.exe scripts\benchmark.py          # CPU 처리 시간·메모리
.venv\Scripts\python.exe scripts\failure_drill.py      # 서버 중단·타임아웃·재시작 훈련
```

## API (내부용)

| 메서드 | 경로 | 내용 |
| --- | --- | --- |
| GET | `/health` | 모델 이름·태그·차원. 모델을 못 불러오면 503 `NOT_READY` |
| POST | `/v1/embeddings` | multipart `image` → 정규화된 512차원 벡터 |
| POST | `/v1/similarity` | multipart `a`, `b` → 코사인 유사도 |

오류: 400 `INVALID_IMAGE`(JPEG·PNG·WebP 아님/손상), 413 `IMAGE_TOO_LARGE`(10MB·4천만 픽셀 초과), 503 `MODEL_NOT_READY`. API 문서 화면(`/docs`)은 비활성화했습니다.
