package com.zombiesrun.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "WatchBridge")
public class WatchBridgePlugin extends Plugin {

    private final ExecutorService watchExecutor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void sendWatchData(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Data is null");
            return;
        }

        String path = call.getString("path");
        if (path == null) {
            path = "/zombies_data";
        }

        // 비동기 실행을 위해 파이널 변수로 캡처링 준비
        final String finalPath = path;

        // executor로 비동기 큐에 진입
        watchExecutor.execute(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                //android.util.Log.d("WatchBridgeDebug", "폰이 보내는 주소: " + finalPath);

                for (Node node : nodes) {
                    // 🚨 핵심 수정: 고정된 "/zombies_data" 대신 동적 주소 finalPath 변수를 지정합니다!
                    Tasks.await(Wearable.getMessageClient(getContext()).sendMessage(
                            node.getId(),
                            finalPath,
                            data.getBytes()
                    ));
                }
                call.resolve();
            } catch (Exception e) {
                e.printStackTrace();
                call.reject("Failed to send watch data: " + e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        try {
            watchExecutor.shutdown();
            if (!watchExecutor.awaitTermination(1, TimeUnit.SECONDS)) {
                watchExecutor.shutdownNow();
            }
        } catch (Exception e) {
            watchExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        } finally {
            super.handleOnDestroy(); // 앱 종료 시 스레드 안전하게 해제
        }
    }
}