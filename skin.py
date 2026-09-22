import cv2
import mediapipe as mp
import numpy as np

# MediaPipe Face Mesh 설정
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True
)

# 웹캠 열기
cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # 좌우 반전(거울처럼 보기 편하게)
    frame = cv2.flip(frame, 1)

    # BGR -> RGB 변환
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # 얼굴 랜드마크 추출
    result = face_mesh.process(rgb)

    # 원본 복사
    output = frame.copy()

    # 피부 영역용 검은 배경 이미지
    skin_mask = np.zeros_like(frame)

    if result.multi_face_landmarks:
        for face_landmarks in result.multi_face_landmarks:
            h, w, _ = frame.shape

            # 왼쪽 볼 + 오른쪽 볼 + 이마 일부 좌표
            left_cheek_idx = [50, 101, 118, 117, 111, 123]
            right_cheek_idx = [280, 330, 347, 346, 340, 352]
            forehead_idx = [10, 67, 103, 109, 338, 297, 332]

            # 좌표 변환 함수
            def get_points(index_list):
                points = []
                for idx in index_list:
                    lm = face_landmarks.landmark[idx]
                    x, y = int(lm.x * w), int(lm.y * h)
                    points.append([x, y])
                return np.array(points, dtype=np.int32)

            left_cheek = get_points(left_cheek_idx)
            right_cheek = get_points(right_cheek_idx)
            forehead = get_points(forehead_idx)

            # 피부 영역 표시용 윤곽선
            cv2.polylines(output, [left_cheek], True, (0, 255, 0), 2)
            cv2.polylines(output, [right_cheek], True, (0, 255, 0), 2)
            cv2.polylines(output, [forehead], True, (0, 255, 0), 2)

            # 마스크에 흰색으로 채우기
            cv2.fillPoly(skin_mask, [left_cheek], (255, 255, 255))
            cv2.fillPoly(skin_mask, [right_cheek], (255, 255, 255))
            cv2.fillPoly(skin_mask, [forehead], (255, 255, 255))

    # 피부 영역만 추출
    skin_area = cv2.bitwise_and(frame, skin_mask)

    # 화면 출력
    cv2.imshow("Original", output)
    cv2.imshow("Skin Area", skin_area)

    # ESC 누르면 종료
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()