package com.zombiesrun.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Vibrator;
import android.os.VibrationEffect;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

public class WatchMessageListenerService extends WearableListenerService {
    private static final String TAG = "ZombieWatchDebug"; // 로그 필터용 태그
    private static final String CHANNEL_ID = "zombie_run_alert_channel";
    private static final int NOTIFICATION_ID = 404;
    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        //Log.d("ZombieWatchDebug", "✨ 수신된 메시지 경로: " + messageEvent.getPath());

        if (messageEvent.getPath().equals("/zombies_data")) {
            //Log.d(TAG, "➡️ 좀비 데이터 패킷 처리 시작");
            String rawData = new String(messageEvent.getData());
            String[] tokens = rawData.split(",");
            if (tokens.length >= 5) {
                String vibrate = tokens[4];
                if ("1".equals(vibrate)) {
                    Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                    if (vibrator != null) {
                        long[] pattern = {0, 200, 100, 200};
                        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
                    }
                }
            }
        } else if (messageEvent.getPath().equals("/start_watch_app")) {
            //Log.d(TAG, "🚨 [확인] 워치 앱 원격 오픈 신호 포착!");
            try {
                // 2. 알림을 클릭했을 때 워치 앱의 MainActivity를 열도록 인텐트 설계
                Intent intent = new Intent(this, WatchMainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

                // Wear OS 최신 버전에 맞춘 PendingIntent 플래그 설정 (IMMUTABLE 필수)
                PendingIntent pendingIntent = PendingIntent.getActivity(
                        this,
                        0,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );

                // 3. 알림 채널 생성 (안드로이드 8.0 이상 필수)
                createNotificationChannel();
                //Log.d(TAG, "🔔 알림 채널 생성 완료");

                // 4. 고해상도 알림 빌드
                NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_zombie_run_notification) // 워치용 알림 아이콘 필요
                        .setContentTitle("🚨 좀비 추격 시작!")
                        .setContentText("터치하여 작전 지도를 열고 도망치세요!")
                        .setPriority(NotificationCompat.PRIORITY_MAX) // 중요도 최상위 (팝업 알림 형태)
                        .setContentIntent(pendingIntent) // 터치 시 앱 실행 연결
                        .setAutoCancel(true); // 터치하면 알림이 자동으로 사라짐

                // 5. 알림 발송 및 진동 트리거
                NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (notificationManager != null) {
                    notificationManager.notify(NOTIFICATION_ID, builder.build());
                    //Log.d(TAG, "✅ 팝업 알림 시스템 발송 명령 성공!");
                    triggerStrongVibration(); // 강력한 진동 추가
                }
            } catch (Exception e) {
                Log.e(TAG, "알림 생성 중 크래시 발생: ", e);
            }
        }
    }

    // 강력한 진동을 울리는 헬퍼 메소드
    private void triggerStrongVibration() {
        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // 패턴: 0ms 대기, 500ms 진동, 200ms 대기, 500ms 진동 (긴급한 느낌)
                long[] pattern = {0, 500, 200, 500};
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                vibrator.vibrate(1000); // 구버전 대응 (1초 진동)
            }
        }
    }

    // 알림 채널 매니저 생성
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "좀비런 알림";
            String description = "좀비 추격 및 게임 시작 알림을 수신합니다.";
            int importance = NotificationManager.IMPORTANCE_HIGH; // 팝업(Heads-up) 알림을 위해 HIGH 설정

            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            channel.enableVibration(true); // 시스템 기본 진동도 켜기

            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
