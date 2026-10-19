# 실제 사진으로 임계값 검증하기

합성 샘플은 동작 확인용입니다. 코사인 유사도 기준값은 **팀이 직접 찍은 실제 사진**으로만 정합니다.

1. 이 폴더에 사진을 넣습니다. 사진 파일은 Git에 올라가지 않습니다(`.gitignore`). 얼굴·신분증·주소 등 개인정보가 찍히지 않게 하세요.
2. `manifest.example.csv`를 `manifest.csv`로 복사하고 비교할 쌍을 적습니다.
   - `same`: 같은 물건을 다른 날·각도·조명·배경에서 찍은 사진
   - `similar`: 같은 종류·비슷한 색이지만 다른 물건 (예: 다른 사람의 검은 지갑)
   - `unrelated`: 다른 종류의 물건
3. 권장 규모: 물품 10개 이상, 물품마다 다른 상황 사진 3장 이상, `similar` 쌍 10개 이상.
4. 실행: `..\..\.venv\Scripts\python.exe ..\..\scripts\evaluate.py .` (이 폴더 기준) 또는 PoC 폴더에서 `.venv\Scripts\python.exe scripts\evaluate.py samples\real`

결과는 `results/raw/evaluate_real.json`에 저장됩니다(Git 제외). 라벨별 최소·평균·최대와 라벨 간 겹침 여부를 보고 기준값을 정합니다.
