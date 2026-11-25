package com.example.paotui.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明后台接口需要的权限码。标注在 Controller 方法上，由 AuthInterceptor 读取。
 *
 * <p>与旧的「路径字符串匹配」相比，权限跟接口定义放在一起：新增接口时若忘记标注，
 * 拦截器会直接拒绝并告警，而不是静默放行。super_admin 始终绕过此检查。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePerm {

    /** t_permission.code；NONE 表示登录即可（只读下拉等），不做权限码校验。 */
    String value();
}
