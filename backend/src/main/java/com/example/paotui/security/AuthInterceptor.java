package com.example.paotui.security;

import com.example.paotui.common.Result;
import com.example.paotui.service.AccountService;
import com.fasterxml.jackson.databind.ObjectMapper;
import cn.dev33.satoken.stp.StpUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 入口即分权：四端都走 Sa-Token 登录态（手机号+密码，不再有免登链接）。
 * 每个路径只认它该认的角色，Service 层拿到的 Principal 一定带对了 scope，
 * 不存在"前端传谁的ID就操作谁的"。
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final AccountService accountService;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object handler) throws Exception {
        String path = req.getRequestURI();
        try {
            Principal p = resolve(path, req.getParameter("bizType"), handler);
            if (p == null) {
                deny(resp, 401, "请先登录");
                return false;
            }
            Ctx.set(p);
            return true;
        } catch (com.example.paotui.common.BizException e) {
            deny(resp, e.getCode(), e.getMessage());
            return false;
        }
    }

    private Principal resolve(String path, String bizType, Object handler) {
        if (!StpUtil.isLogin()) {
            return null;
        }
        Principal p = accountService.principal(StpUtil.getLoginIdAsLong());
        if (path.startsWith("/api/admin/")) {
            if (!p.has("admin")) {
                throw new com.example.paotui.common.BizException(403, "这个账号不能进调度台");
            }
            String permission = adminPermission(path, bizType, handler);
            if (permission != null && !"NONE".equals(permission) && !p.has("super_admin")) {
                Integer granted = jdbc.queryForObject("SELECT COUNT(*) FROM t_role_permission rp JOIN t_permission p ON p.id=rp.permission_id WHERE rp.role='admin' AND p.code=?", Integer.class, permission);
                if (granted == null || granted == 0) throw new com.example.paotui.common.BizException(403, "当前账号没有此项操作权限");
            }
            return p;
        }
        if (path.startsWith("/api/m/")) {
            if (!p.has("merchant")) {
                throw new com.example.paotui.common.BizException(403, "这个账号不是商家");
            }
            return p;
        }
        if (path.startsWith("/api/r/")) {
            if (!p.has("rider")) {
                throw new com.example.paotui.common.BizException(403, "这个账号不是骑手");
            }
            return p;
        }
        if (path.startsWith("/api/c/")) {
            if (!p.has("customer")) {
                throw new com.example.paotui.common.BizException(403, "这个账号不是客户");
            }
            return p;
        }
        throw new IllegalStateException("未配置鉴权规则的路径: " + path);
    }

    /**
     * 权限码从接口方法上的 {@link RequirePerm} 读取，不再靠路径字符串猜。
     * 未标注的后台接口一律拒绝，避免新增接口漏配权限形成越权口子。
     */
    private String adminPermission(String path, String bizType, Object handler) {
        RequirePerm ann = null;
        if (handler instanceof HandlerMethod hm) {
            ann = hm.getMethodAnnotation(RequirePerm.class);
        }
        if (ann == null) {
            throw new com.example.paotui.common.BizException(403, "接口未声明权限：" + path + "（请联系管理员补配 @RequirePerm）");
        }
        // 上传接口：录单附件按录单权，其余凭证按履约权
        if ("@upload".equals(ann.value())) {
            return "order".equals(bizType) ? "order.create" : "order.flow";
        }
        return ann.value();
    }

    private void deny(HttpServletResponse resp, int code, String msg) throws Exception {
        resp.setStatus(HttpServletResponse.SC_OK);
        resp.setContentType(MediaType.APPLICATION_JSON_VALUE);
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write(objectMapper.writeValueAsString(Result.fail(code, msg)));
    }

    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse resp, Object handler, Exception ex) {
        Principal principal = Ctx.get();
        String path = req.getRequestURI();
        if (principal != null && path.startsWith("/api/admin/") && !"GET".equalsIgnoreCase(req.getMethod())) {
            try { jdbc.update("INSERT INTO t_audit_log(actor_user_id, actor_name, http_method, request_path, response_status) VALUES (?,?,?,?,?)",
                    principal.getUserId() == null ? 0L : principal.getUserId(), principal.getName(), req.getMethod(), path, resp.getStatus()); }
            catch (Exception ignored) { }
        }
        Ctx.clear();
    }
}
