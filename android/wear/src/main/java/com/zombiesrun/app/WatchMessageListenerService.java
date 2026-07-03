package com.zombiesrun.app;

import android.os.Vibrator;
import android.os.VibrationEffect;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

public class WatchMessageListenerService extends WearableListenerService {
    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        if (messageEvent.getPath().equals("/zombies_data")) {
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
        }
    }
}
