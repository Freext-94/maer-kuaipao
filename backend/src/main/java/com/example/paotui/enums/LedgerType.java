package com.example.paotui.enums;

public enum LedgerType {

    CHARGE("挂账"),
    PAYMENT("收款"),
    ADJUST("冲正"),
    WAIVE("减免"),
    REFUND("退款");

    private final String label;

    LedgerType(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    public String code() {
        return name();
    }
}
