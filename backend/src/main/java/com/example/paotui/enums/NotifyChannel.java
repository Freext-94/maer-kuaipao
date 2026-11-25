package com.example.paotui.enums;

public enum NotifyChannel {

    POLL,
    GROUP_MSG,
    SMS,
    VOICE,
    MANUAL,
    SUBSCRIBE;

    public String code() {
        return name();
    }
}
