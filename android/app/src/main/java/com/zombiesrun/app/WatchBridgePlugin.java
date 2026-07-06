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

@CapacitorPlugin(name = "WatchBridge")
public class WatchBridgePlugin extends Plugin {

    @PluginMethod
    public void sendWatchData(PluginCall call) {
        String data = call.getString("data");
        if (data == null) {
            call.reject("Data is null");
            return;
        }

        // 백그라운드 스레드에서 Wear OS 기기들로 데이터 전송
        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext()).sendMessage(
                        node.getId(),
                        "/zombies_data",
                        data.getBytes()
                    ));
                }
                call.resolve();
            } catch (Exception e) {
                e.printStackTrace();
                call.reject("Failed to send watch data: " + e.getMessage());
            }
        }).start();
    }
}
