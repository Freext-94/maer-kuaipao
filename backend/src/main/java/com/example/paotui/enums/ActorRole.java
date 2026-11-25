package com.example.paotui.enums;

public enum ActorRole {

    /** 调度台操作人（数据库历史里叫 staff，新代码统一 admin） */
    STAFF,
    MERCHANT,
    RIDER,
    CUSTOMER;

    public String code() {
        return this == STAFF ? "admin" : name();
    }
}
