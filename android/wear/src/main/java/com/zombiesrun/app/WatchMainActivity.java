package com.zombiesrun.app;

import android.animation.ArgbEvaluator; // ⚡ 색상 스무딩 애니메이션용
import android.animation.ValueAnimator;
import android.app.Activity;
import android.os.Bundle;
import android.os.Vibrator;
import android.os.VibrationEffect;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.LinearLayout;
import android.graphics.Color;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Wearable;

public class WatchMainActivity extends Activity implements MessageClient.OnMessageReceivedListener {

    private TextView mHazardIcon;
    private TextView mStatusLabel;
    private TextView mZombieDistVal;
    private TextView mRunDistVal;
    private TextView mSpeedVal;
    private LinearLayout mZombieCard;
    private Vibrator mVibrator;

    private int mLastTargetDist = -1;
    private ValueAnimator mDistanceAnimator;

    // ⚡ 좀비 레벨 추적 및 블러드 플래시용 변수
    private int mCurrentZombieLevel = -1;
    private ValueAnimator mBloodFlashAnimator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        mHazardIcon = findViewById(R.id.watch_hazard_icon);
        mStatusLabel = findViewById(R.id.watch_status_label);
        mZombieDistVal = findViewById(R.id.watch_zombie_dist_val);
        mRunDistVal = findViewById(R.id.watch_run_dist_val);
        mSpeedVal = findViewById(R.id.watch_speed_val);
        mZombieCard = findViewById(R.id.watch_zombie_card);

        mVibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
    }

    @Override
    protected void onResume() {
        super.onResume();
        Wearable.getMessageClient(this).addListener(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        Wearable.getMessageClient(this).removeListener(this);
        if (mDistanceAnimator != null) mDistanceAnimator.cancel();
        if (mBloodFlashAnimator != null) mBloodFlashAnimator.cancel();
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (messageEvent.getPath().equals("/zombies_data")) {
            String rawData = new String(messageEvent.getData());
            String[] tokens = rawData.split(",");

            // 💡 [변경] 좀비 레벨이 추가되었으므로 토큰 개수 조건을 >= 6으로 검증
            if (tokens.length >= 6) {
                final String zombieDist = tokens[0];
                final String runDist = tokens[1];
                final String speed = tokens[2];
                final String status = tokens[3];
                final String vibrate = tokens[4];
                final String zombieLevel = tokens[5];

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        updateUI(zombieDist, runDist, speed, status, vibrate, zombieLevel);
                    }
                });
            }
        }
    }

    private void updateUI(String zombieDist, String runDist, String speed, String status, String vibrate, String zombieLevel) {
        mRunDistVal.setText(runDist + "km");
        mSpeedVal.setText(speed + " km/h");

        // 1. 좀비 레벨 파싱 및 레벨업 체크
        int newLevel = 1;
        try {
            newLevel = Integer.parseInt(zombieLevel);
        } catch (NumberFormatException e) { /* ignore */ }

        // 💡 실시간 레벨업 이벤트 조건 포착!
        if (mCurrentZombieLevel != -1 && newLevel > mCurrentZombieLevel) {
            triggerBloodFlashEffect(); // ⚡ 레벨업 특수효과 재생
        }
        mCurrentZombieLevel = newLevel;

        // 상태창에 모드명과 좀비 레벨을 위엄있게 표기 (예: SURVIVAL LV.15)
        mStatusLabel.setText(status.toUpperCase() + " LV." + mCurrentZombieLevel);

        // 2. 거리 보간 애니메이션 처리
        int zDist = -1;
        try {
            zDist = Integer.parseInt(zombieDist);
        } catch (NumberFormatException e) { /* ignore */ }

        if (zDist < 0) {
            if (mDistanceAnimator != null) mDistanceAnimator.cancel();
            mZombieDistVal.setText("CLEAR");
            mZombieDistVal.setTextColor(Color.parseColor("#34d399"));
            mHazardIcon.setTextColor(Color.parseColor("#34d399"));
            // 블러드 애니메이션이 돌고 있지 않을 때만 기본 배경색 지정
            if (mBloodFlashAnimator == null || !mBloodFlashAnimator.isRunning()) {
                mZombieCard.setBackgroundColor(Color.parseColor("#111827"));
            }
            mLastTargetDist = -1;
        } else {
            if (mLastTargetDist == -1) {
                mZombieDistVal.setText(zDist + "m");
                mLastTargetDist = zDist;
            } else if (mLastTargetDist != zDist) {
                if (mDistanceAnimator != null) mDistanceAnimator.cancel();
                mDistanceAnimator = ValueAnimator.ofInt(mLastTargetDist, zDist);
                mDistanceAnimator.setDuration(400);
                mDistanceAnimator.addUpdateListener(animation -> {
                    int animatedValue = (int) animation.getAnimatedValue();
                    mZombieDistVal.setText(animatedValue + "m");
                });
                mDistanceAnimator.start();
                mLastTargetDist = zDist;
            }

            // 3. 거리별 카드 테마 컬러 (블러드 플래시 애니메이션 중에는 배경색 변경 스킵하여 연출 보호)
            if (mBloodFlashAnimator == null || !mBloodFlashAnimator.isRunning()) {
                if (zDist <= 10) {
                    mZombieDistVal.setTextColor(Color.parseColor("#f43f5e"));
                    mZombieCard.setBackgroundColor(Color.parseColor("#450a0a")); // 위험 다크레드
                    mHazardIcon.setTextColor(Color.parseColor("#f43f5e"));
                } else if (zDist <= 25) {
                    mZombieDistVal.setTextColor(Color.parseColor("#fb923c"));
                    mZombieCard.setBackgroundColor(Color.parseColor("#431407")); // 경고 다크오렌지
                    mHazardIcon.setTextColor(Color.parseColor("#fb923c"));
                } else {
                    mZombieDistVal.setTextColor(Color.parseColor("#eab308"));
                    mZombieCard.setBackgroundColor(Color.parseColor("#1f2937")); // 추격 다크그레이
                    mHazardIcon.setTextColor(Color.parseColor("#eab308"));
                }
            }
        }

        // 4. 일반 추격 햅틱 진동 처리
        if ("1".equals(vibrate) && mVibrator != null && (mBloodFlashAnimator == null || !mBloodFlashAnimator.isRunning())) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                long[] pattern = {0, 200, 100, 200};
                mVibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                mVibrator.vibrate(400);
            }
        }
    }

    /**
     * ⚡ 좀비 레벨업 시 워치 화면에 치명적인 피격/경고 플래시와 패닉 진동을 가하는 헬퍼 메소드
     */
    private void triggerBloodFlashEffect() {
        if (mZombieCard == null) return;

        if (mBloodFlashAnimator != null) {
            mBloodFlashAnimator.cancel();
        }

        // 심장 박동을 타격하는 강렬한 좀비 각성 전용 진동 패턴 (징-징-지이이잉!)
        if (mVibrator != null) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                long[] levelUpPattern = {0, 150, 50, 150, 50, 500};
                mVibrator.vibrate(VibrationEffect.createWaveform(levelUpPattern, -1));
            } else {
                mVibrator.vibrate(800);
            }
        }

        // ArgbEvaluator를 사용해 선명한 선혈색(#b91c1c)에서 현재 기본 다크 배경(#1f2937)으로 1초 동안 스르륵 페이드 아웃
        int colorStart = Color.parseColor("#b91c1c");
        int colorEnd = Color.parseColor("#121824");

        mBloodFlashAnimator = ValueAnimator.ofObject(new ArgbEvaluator(), colorStart, colorEnd);
        mBloodFlashAnimator.setDuration(1000); // 1초 동안 연출 유지
        mBloodFlashAnimator.addUpdateListener(animator -> {
            mZombieCard.setBackgroundColor((int) animator.getAnimatedValue());
        });
        mBloodFlashAnimator.start();
    }
}