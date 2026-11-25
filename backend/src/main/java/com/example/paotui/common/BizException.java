package com.example.paotui.common;

/**
 * 业务规则拒绝（状态不允许、垫付未追回、金额不平…）。
 * 与程序异常区分开：这类可以直接把中文文案给客户看。
 */
public class BizException extends RuntimeException {
    private final int code;

    public BizException(String message) {
        this(1, message);
    }

    public BizException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
