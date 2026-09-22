import cv2
import mediapipe as mp
import numpy as np

# MediaPipe 설정
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True
)

# 웹캠 열기
cap = cv2.VideoCapture(0)

# 최근 RGB 값 저장용 리스트
rgb_history = []

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # 좌우 반전
    frame = cv2.flip(frame, 1)

    # BGR -> RGB 변환
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # 얼굴 랜드마크 추출
    result = face_mesh.process(rgb)

    output = frame.copy()
    skin_mask = np.zeros_like(frame)

    if result.multi_face_landmarks:
        for face_landmarks in result.multi_face_landmarks:
            h, w, _ = frame.shape

            # 볼 + 이마 좌표
            left_cheek_idx = [50, 101, 118, 117, 111, 123]
            right_cheek_idx = [280, 330, 347, 346, 340, 352]
            forehead_idx = [10, 67, 103, 109, 338, 297, 332]

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

            # 피부 영역 윤곽선 표시
            cv2.polylines(output, [left_cheek], True, (0, 255, 0), 2)
            cv2.polylines(output, [right_cheek], True, (0, 255, 0), 2)
            cv2.polylines(output, [forehead], True, (0, 255, 0), 2)

            # 마스크에 흰색으로 채우기
            cv2.fillPoly(skin_mask, [left_cheek], (255, 255, 255))
            cv2.fillPoly(skin_mask, [right_cheek], (255, 255, 255))
            cv2.fillPoly(skin_mask, [forehead], (255, 255, 255))

    # 피부 영역만 추출
    skin_area = cv2.bitwise_and(frame, skin_mask)

    # 피부 영역 픽셀만 가져오기
    mask_gray = cv2.cvtColor(skin_mask, cv2.COLOR_BGR2GRAY)
    skin_pixels = frame[mask_gray > 0]

    if len(skin_pixels) > 0:
        # 현재 프레임 평균 BGR 계산
        avg_bgr = np.mean(skin_pixels, axis=0)
        avg_b, avg_g, avg_r = avg_bgr.astype(int)

        # 최근 RGB 값 저장
        rgb_history.append([avg_r, avg_g, avg_b])

        # 최근 10개만 유지
        if len(rgb_history) > 10:
            rgb_history.pop(0)

        # 최근 10프레임 평균 RGB 계산
        rgb_array = np.array(rgb_history)
        mean_rgb = np.mean(rgb_array, axis=0)
        mean_r, mean_g, mean_b = mean_rgb.astype(int)

        # RGB -> HSV 변환
        rgb_pixel = np.uint8([[[mean_r, mean_g, mean_b]]])
        hsv_pixel = cv2.cvtColor(rgb_pixel, cv2.COLOR_RGB2HSV)
        hue, sat, val = hsv_pixel[0][0]


        # 개선된 피부톤 분류 (Hue + Saturation)
        if hue < 20 and sat > 40:
            tone_result = "Warm Tone"
        elif hue > 90 or sat < 30:
            tone_result = "Cool Tone"
        else:
            tone_result = "Neutral Tone"

        # 화면에 출력
        rgb_text = f"RGB(avg): ({mean_r}, {mean_g}, {mean_b})"
        hsv_text = f"HSV(avg): ({hue}, {sat}, {val})"
        tone_text = f"Tone: {tone_result}"

        cv2.putText(output, rgb_text, (10, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.putText(output, hsv_text, (10, 80),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.putText(output, tone_text, (10, 120),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

    # 화면 출력
    cv2.imshow("Original", output)
    cv2.imshow("Skin Area", skin_area)

    # ESC 누르면 종료
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()