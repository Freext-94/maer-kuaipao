package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.service.SettingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Set;

/** 零散设置。都是调度台内部配置，权限在 B2 里并进权限矩阵。 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminSettingsController {

    /** 只允许改这几个键，避免前端把整张设置表当成垃圾桶。 */
    private static final Set<String> EDITABLE = Set.of(
            "order_no_prefix", "default_service_fee_fen", "shop_name", "service_phone"
    );

    private final SettingService settings;

    @GetMapping("/settings")
    @RequirePerm("NONE")
    public Result<Map<String, String>> allSettings() {
        return Result.ok(settings.all());
    }

    @PutMapping("/settings")
    @RequirePerm("setting.manage")
    public Result<Map<String, String>> saveSettings(@RequestBody Map<String, String> patch) {
        if (patch == null || patch.isEmpty()) {
            throw new BizException("没有要保存的设置");
        }
        for (String k : patch.keySet()) {
            if (!EDITABLE.contains(k)) {
                throw new BizException("设置项「" + k + "」不允许在这里改");
            }
        }
        String prefix = patch.get("order_no_prefix");
        if (prefix != null && (prefix.isBlank() || prefix.trim().length() > 6 || !prefix.trim().matches("[A-Za-z0-9]+"))) {
            throw new BizException("单号前缀只能是 1~6 位字母或数字");
        }
        settings.putAll(patch);
        return Result.ok(settings.all());
    }
}
