package com.example.paotui.controller;

import com.example.paotui.security.RequirePerm;
import com.example.paotui.common.Result;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/audit")
@RequiredArgsConstructor
public class AdminAuditController {
    private final JdbcTemplate jdbc;

    @GetMapping
    @RequirePerm("audit.view")
    public Result<List<Map<String,Object>>> recent() {
        return Result.ok(jdbc.queryForList("SELECT id, actor_user_id AS actorUserId, actor_name AS actorName, http_method AS httpMethod, request_path AS requestPath, response_status AS responseStatus, occurred_at AS occurredAt FROM t_audit_log ORDER BY id DESC LIMIT 500"));
    }
}
