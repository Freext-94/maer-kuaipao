package com.example.paotui.common;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * 统一响应：code=0 成功，非 0 是业务拒绝（前端直接把 msg 弹出来）。
 */
@Data
@AllArgsConstructor
public class Result<T> {
    private int code;
    private String msg;
    private T data;

    public static <T> Result<T> ok(T data) {
        return new Result<>(0, "ok", data);
    }

    public static <T> Result<T> ok() {
        return new Result<>(0, "ok", null);
    }

    public static <T> Result<T> fail(int code, String msg) {
        return new Result<>(code, msg, null);
    }
}
