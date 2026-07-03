package com.zombiesrun.app;

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); // 러닝 중 화면 유지

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
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (messageEvent.getPath().equals("/zombies_data")) {
            String rawData = new String(messageEvent.getData());
            // 프로토콜 포맷: "zombieDist,runDist,speed,status,vibrate"
            String[] tokens = rawData.split(",");
            if (tokens.length >= 5) {
                final String zombieDist = tokens[0];
                final String runDist = tokens[1];
                final String speed = tokens[2];
                final String status = tokens[3];
                final String vibrate = tokens[4];

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        updateUI(zombieDist, runDist, speed, status, vibrate);
                    }
                });
            }
        }
    }

    private void updateUI(String zombieDist, String runDist, String speed, String status, String vibrate) {
        mRunDistVal.setText(runDist + "km");
        mSpeedVal.setText(speed + " km/h");
        mStatusLabel.setText(status.toUpperCase());

        int zDist = -1;
        try {
            zDist = Integer.parseInt(zombieDist);
        } catch (NumberFormatException e) {
            // ignore
        }

        if (zDist < 0) {
            // 추격 대상 좀비 없음 (평상시)
            mZombieDistVal.setText("CLEAR");
            mZombieDistVal.setTextColor(Color.parseColor("#34d399")); // 그린
            mZombieCard.setBackgroundColor(Color.parseColor("#111827"));
            mHazardIcon.setTextColor(Color.parseColor("#34d399"));
        } else {
            mZombieDistVal.setText(zDist + "m");
            if (zDist <= 10) {
                // 매우 근접
                mZombieDistVal.setTextColor(Color.parseColor("#f43f5e")); // 레드
                mZombieCard.setBackgroundColor(Color.parseColor("#450a0a")); // 짙은 적색 경고 카드
                mHazardIcon.setTextColor(Color.parseColor("#f43f5e"));
                mStatusLabel.setText("DANGER!");
                mStatusLabel.setTextColor(Color.parseColor("#f43f5e"));
            } else if (zDist <= 25) {
                // 접근 중
                mZombieDistVal.setTextColor(Color.parseColor("#fb923c")); // 오렌지
                mZombieCard.setBackgroundColor(Color.parseColor("#431407"));
                mHazardIcon.setTextColor(Color.parseColor("#fb923c"));
                mStatusLabel.setText("WARNING");
                mStatusLabel.setTextColor(Color.parseColor("#fb923c"));
            } else {
                // 안전 거리
                mZombieDistVal.setTextColor(Color.parseColor("#eab308")); // 옐로우
                mZombieCard.setBackgroundColor(Color.parseColor("#1f2937"));
                mHazardIcon.setTextColor(Color.parseColor("#eab308"));
                mStatusLabel.setText("PURSUIT");
                mStatusLabel.setTextColor(Color.parseColor("#eab308"));
            }
        }

        // 진동 신호 처리 (진동이 들어올 때 햅틱 호출)
        if ("1".equals(vibrate) && mVibrator != null) {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION.SDK_INT) {
                // 강력한 더블 임팩트 진동
                long[] pattern = {0, 200, 100, 200};
                mVibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                mVibrator.vibrate(400);
            }
        }
    }
}
