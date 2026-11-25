package com.example.paotui.security;

import lombok.Data;

import java.util.HashSet;
import java.util.Set;

/**
 * 一次请求是谁在操作。四端（调度台/商家/骑手/客户）统一走 Sa-Token 手机号+密码登录态，
 * 不再有免登令牌。scope* 决定他能碰哪些数据：商家只能看自己店的单，客户只能看自己的单。
 */
@Data
public class Principal {

    private Long userId;
    private String name;
    private Set<String> roles = new HashSet<>();

    /** 商家角色时限定商家ID */
    private Long scopeMerchantId;
    /** 客户角色时限定客户ID */
    private Long scopeCustomerId;

    public boolean has(String role) {
        return roles.contains(role) || ("admin".equals(role) && roles.contains("super_admin"));
    }

    public String roleCode() {
        if (roles.contains("super_admin")) return "super_admin";
        if (has("admin")) {
            return "admin";
        }
        if (has("merchant")) {
            return "merchant";
        }
        if (has("rider")) {
            return "rider";
        }
        return "customer";
    }
}
