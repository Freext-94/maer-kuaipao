package com.example.paotui.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.example.paotui.common.BizException;
import com.example.paotui.common.Result;
import com.example.paotui.entity.User;
import com.example.paotui.security.Ctx;
import com.example.paotui.security.Principal;
import com.example.paotui.service.AccountService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AccountService accountService;
    private final PasswordEncoder encoder;
    private final JdbcTemplate jdbc;

    @Data
    public static class LoginReq {
        private String phone;
        private String password;
    }

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody LoginReq req) {
        User u = accountService.byPhone(req.getPhone());
        if (u == null || u.getPasswordHash() == null || u.getPasswordHash().isBlank()
                || !encoder.matches(req.getPassword(), u.getPasswordHash())) {
            throw new BizException("手机号或密码不对");
        }
        Principal p = accountService.principal(u.getId());
        u.setLastLoginAt(java.time.LocalDateTime.now());
        accountService.updateLoginAt(u);
        StpUtil.login(u.getId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", StpUtil.getTokenValue());
        out.put("name", u.getName());
        out.put("roles", p.getRoles());
        out.put("permissions", permissionsOf(p));
        return Result.ok(out);
    }

    @GetMapping("/me")
    public Result<Map<String, Object>> me() {
        if (!StpUtil.isLogin()) {
            throw new BizException(401, "未登录");
        }
        Principal p = accountService.principal(StpUtil.getLoginIdAsLong());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("userId", p.getUserId());
        out.put("name", p.getName());
        out.put("roles", p.getRoles());
        out.put("permissions", permissionsOf(p));
        out.put("scopeMerchantId", p.getScopeMerchantId());
        out.put("scopeCustomerId", p.getScopeCustomerId());
        return Result.ok(out);
    }

    /** 前端只做入口显隐；真正拦截仍在 AuthInterceptor。 */
    private List<String> permissionsOf(Principal p) {
        if (p.has("super_admin")) {
            return jdbc.queryForList("SELECT code FROM t_permission ORDER BY sort_no", String.class);
        }
        if (p.has("admin")) {
            return jdbc.queryForList("SELECT p.code FROM t_permission p JOIN t_role_permission rp ON rp.permission_id = p.id "
                    + "WHERE rp.role = 'admin' ORDER BY p.sort_no", String.class);
        }
        return List.of();
    }

    @PostMapping("/logout")
    public Result<Void> logout() {
        StpUtil.logout();
        Ctx.clear();
        return Result.ok();
    }
}
