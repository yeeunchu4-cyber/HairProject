# Hair Style Finder

얼굴형·피부톤 분석 기반 개인 맞춤형 헤어스타일 추천 웹 서비스입니다.
사진 한 장으로 얼굴형을 분석하고, 어울리는 헤어스타일과 헤어 컬러를
추천합니다.

## 주요 기능

- **얼굴형 분석**: MediaPipe FaceMesh로 얼굴 랜드마크를 추출하고,
  Gradient Boosting 분류기로 5가지 얼굴형(Oval / Round / Square /
  Heart / Long)을 판별합니다.
- **피부톤 분석**: 업로드한 사진에서 피부 영역의 색상을 분석합니다.
- **베스트 스타일 추천**: 얼굴형·성별·원하는 머리 길이/스타일에 맞는
  헤어스타일을 추천합니다.
- **추천 근거 표시**: 각 추천에는 학술 문헌(Pasupa, Sunhem & Loo,
  2019, *Expert Systems With Applications*)에 근거한 원칙과 출처가
  함께 표시됩니다.
- **워스트 스타일 안내**: 피하는 것이 좋은 스타일과, 그 근거의
  신뢰도(학술 근거 확인됨 / 근거 약함)를 함께 안내합니다.
- **연예인 예시**: 같은 얼굴형의 연예인 예시를 보여줍니다.
- **로그인/회원가입**: Firebase Authentication 기반.

## 기술 스택

- Frontend: 순수 HTML / CSS / JavaScript (빌드 도구 없음)
- 얼굴 인식: [MediaPipe Face Mesh](https://developers.google.com/mediapipe)
- 얼굴형 분류: Gradient Boosting (`gb_model.json`으로 내보낸 모델을
  브라우저에서 직접 추론)
- 인증: Firebase Authentication (이메일/구글 로그인)
- Python 프로토타입: OpenCV + MediaPipe (웹캠 기반 실시간 분석 실험)

## 실행 방법

이 프로젝트는 별도 빌드 과정이 없는 정적 사이트입니다. 다만
`gb_model.json`을 `fetch`로 불러오기 때문에 `file://`로 직접 열면
CORS 문제로 동작하지 않습니다. 로컬 서버로 실행하세요.

```bash
python -m http.server 8000
```

이후 브라우저에서 `http://localhost:8000/index.html` 접속.

## 프로젝트 구조

```
index.html          메인 페이지 (마크업)
style.css            스타일
script.js             핵심 로직 (얼굴 분석, 얼굴형 분류, 헤어 추천, UI 렌더링)
gb_model.json        얼굴형 분류 Gradient Boosting 모델 (mean/scale/trees)
images/               헤어스타일·연예인·얼굴형 실루엣 이미지 에셋

face.py, face_image.py   OpenCV/MediaPipe 기반 얼굴형 분류 프로토타입 (웹캠/이미지)
skin.py, tone.py          피부 영역 추출·피부톤 분석 프로토타입 (웹캠)
```

`face.py`/`face_image.py`의 얼굴형 분류 로직은 초기 프로토타입으로,
실제 서비스(`script.js`)는 이후 별도로 학습한 Gradient Boosting
모델(`gb_model.json`)을 사용합니다.

## 얼굴형 분류기 검증

`gb_model.json`은 학계 공개 벤치마크 데이터셋인
[dsmlr/faceshape](https://github.com/dsmlr/faceshape)(Pasupa,
Sunhem & Loo, 2019 논문에 실제 사용된 500장 규모 데이터셋)로 out-of-domain
검증했을 때 72.6%의 정확도를 기록했습니다. 이는 해당 논문이 같은
데이터셋으로 직접 학습·평가해 보고한 최고 성능(70.33%, 수작업 특징 +
VGG-face + MKL 융합)과 동등하거나 약간 높은 수준입니다.
