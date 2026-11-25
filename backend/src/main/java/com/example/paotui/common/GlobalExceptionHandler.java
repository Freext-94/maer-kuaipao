package com.example.paotui.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public Result<Void> onBiz(BizException e) {
        return Result.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Result<Void> onInvalid(MethodArgumentNotValidException e) {
        String first = e.getBindingResult().getFieldErrors().stream()
                .map(f -> fieldLabel(f) + " 填得不对")
                .findFirst().orElse("参数不对");
        return Result.fail(2, first);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public Result<Void> onIllegal(IllegalArgumentException e) {
        return Result.fail(3, e.getMessage());
    }

    /** 静态资源/凭证文件不存在是 404，不是 500；否则日志里全是假告警。 */
    @ExceptionHandler(NoResourceFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Result<Void> onNoResource(NoResourceFoundException e) {
        return Result.fail(404, "文件不存在或已被清理");
    }

    /** 真 bug 要留在日志里，不能伪装成业务提示。 */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Result<Void> onOther(Exception e) {
        log.error("未处理异常", e);
        return Result.fail(500, "系统开小差了，请刷新重试：" + e.getClass().getSimpleName());
    }

    private String fieldLabel(FieldError f) {
        return f.getField() + "(" + f.getRejectedValue() + ")";
    }
}
