package com.example.paotui.enums;

public enum NotifyStatus {

    QUEUED,
    SENT_OK,
    ACKED,
    FAILED,
    NO_QUOTA,
    SIG_PENDING;

    public String code() {
        return name();
    }
}
