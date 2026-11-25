package com.example.paotui.security;

import com.example.paotui.common.BizException;

/**
 * 请求上下文。Service 层从这里取操作人，绝不信任前端传来的 merchantId/riderId。
 */
public final class Ctx {

    private static final ThreadLocal<Principal> HOLDER = new ThreadLocal<>();

    private Ctx() {
    }

    public static void set(Principal p) {
        HOLDER.set(p);
    }

    public static void clear() {
        HOLDER.remove();
    }

    public static Principal get() {
        return HOLDER.get();
    }

    public static Principal require() {
        Principal p = HOLDER.get();
        if (p == null) {
            throw new BizException(401, "请先登录或使用专属链接打开");
        }
        return p;
    }

    public static String actorName() {
        Principal p = HOLDER.get();
        return p == null || p.getName() == null ? "system" : p.getName();
    }
}
